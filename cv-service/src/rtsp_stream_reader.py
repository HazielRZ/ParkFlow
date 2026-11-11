"""
rtsp_stream_reader.py
=====================
PARK FLOW - /cv-service
PF-13: Módulo de ingesta de video desde cámaras IP vía RTSP (720p / 1080p).

Trazabilidad ERS: INT-HW-01, INT-COM-01, RNF-01.

Características
---------------
1. Lectura multihilo sin lag: un hilo en segundo plano lee SIEMPRE el stream y
   conserva únicamente el frame más reciente (los obsoletos se descartan).
2. Watchdog + reconexión automática con backoff exponencial (con jitter).
3. Liberación rigurosa de recursos: `cap.release()` y los hilos se cierran tanto
   en `stop()` como en cada ciclo de reconexión.

Notas de diseño
---------------
* El hilo de captura es el ÚNICO dueño del objeto `cv2.VideoCapture`. El watchdog
  nunca lo toca: solo levanta una bandera (`_force_reconnect`). Llamar a
  `release()` desde otro hilo mientras `read()` está bloqueado puede provocar
  segfaults en FFmpeg. Para que `read()` nunca se quede colgado indefinidamente
  se configuran timeouts de apertura/lectura en el VideoCapture.
* Las opciones de FFmpeg se fijan ANTES de importar cv2 (de lo contrario
  OpenCV las ignora). Se usa TCP para evitar frames corruptos por pérdida UDP
  y `nobuffer/low_delay` para minimizar el buffer interno.

Uso rápido
----------
    with RTSPStreamReader("rtsp://user:pass@192.168.1.10:554/stream1") as reader:
        while True:
            ok, frame, ts = reader.read()
            if not ok:
                continue
            # ... enviar `frame` al pipeline de inferencia ...
"""

from __future__ import annotations

import logging
import os
import random
import re
import threading
import time
from enum import Enum
from typing import Optional, Tuple

# Debe definirse antes de `import cv2` para que FFmpeg lo tome en cuenta.
os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay",
)

import cv2  # noqa: E402
import numpy as np  # noqa: E402

logger = logging.getLogger("cv-service.rtsp")


class StreamState(str, Enum):
    """Estados del lector, útiles para health-checks del servicio."""

    STOPPED = "stopped"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"


def _mask_url(url: str) -> str:
    """Oculta credenciales (user:pass@) para no filtrarlas en los logs."""
    return re.sub(r"//[^@/]+@", "//***:***@", url)


class RTSPStreamReader:
    """Lector asíncrono de streams RTSP con reconexión automática.

    Parameters
    ----------
    url:
        URL RTSP de la cámara IP.
    watchdog_timeout:
        Segundos sin frames nuevos tras los cuales el watchdog fuerza reconexión.
    backoff_initial / backoff_max / backoff_factor:
        Parámetros del backoff exponencial entre reintentos (segundos).
    backoff_jitter:
        Fracción (0-1) de jitter aleatorio para evitar reconexiones sincronizadas
        cuando varias cámaras caen a la vez.
    stable_reset_after:
        Segundos de conexión estable necesarios para reiniciar el backoff.
    open_timeout_ms / read_timeout_ms:
        Timeouts de apertura y lectura del VideoCapture (OpenCV >= 4.5).
    max_consecutive_read_failures:
        Lecturas fallidas seguidas antes de dar por perdida la conexión.
    max_latency_warn_s:
        Si la edad del frame supera este valor se registra un warning (RNF: <500 ms).
    """

    def __init__(
        self,
        url: str,
        *,
        name: Optional[str] = None,
        watchdog_timeout: float = 5.0,
        backoff_initial: float = 1.0,
        backoff_max: float = 30.0,
        backoff_factor: float = 2.0,
        backoff_jitter: float = 0.2,
        stable_reset_after: float = 10.0,
        open_timeout_ms: int = 5000,
        read_timeout_ms: int = 5000,
        max_consecutive_read_failures: int = 5,
        max_latency_warn_s: float = 0.5,
    ) -> None:
        self.url = url
        self.name = name or _mask_url(url)

        self._watchdog_timeout = watchdog_timeout
        self._backoff_initial = backoff_initial
        self._backoff_max = backoff_max
        self._backoff_factor = backoff_factor
        self._backoff_jitter = backoff_jitter
        self._stable_reset_after = stable_reset_after
        self._open_timeout_ms = open_timeout_ms
        self._read_timeout_ms = read_timeout_ms
        self._max_read_failures = max_consecutive_read_failures
        self._max_latency_warn_s = max_latency_warn_s

        # --- Último frame (protegido por _cond) ---
        self._cond = threading.Condition()
        self._frame: Optional[np.ndarray] = None
        self._frame_ts: float = 0.0       # time.monotonic() de la captura
        self._frame_id: int = 0           # contador incremental de frames
        self._last_consumed_id: int = 0   # último frame entregado a un consumidor

        # --- Control de hilos ---
        self._stop_event = threading.Event()
        self._force_reconnect = threading.Event()
        self._capture_thread: Optional[threading.Thread] = None
        self._watchdog_thread: Optional[threading.Thread] = None
        self._lifecycle_lock = threading.Lock()

        # --- Estado / métricas ---
        self._state = StreamState.STOPPED
        self._last_frame_activity: float = time.monotonic()
        self.frames_captured = 0
        self.frames_dropped = 0   # frames sobrescritos sin haber sido consumidos
        self.reconnect_count = 0
        self.resolution: Tuple[int, int] = (0, 0)  # (ancho, alto)

    # ------------------------------------------------------------------ #
    # API pública
    # ------------------------------------------------------------------ #
    @property
    def state(self) -> StreamState:
        return self._state

    @property
    def is_connected(self) -> bool:
        return self._state == StreamState.CONNECTED

    def start(self) -> "RTSPStreamReader":
        """Inicia los hilos de captura y watchdog (idempotente)."""
        with self._lifecycle_lock:
            if self._capture_thread and self._capture_thread.is_alive():
                return self
            self._stop_event.clear()
            self._force_reconnect.clear()
            self._last_frame_activity = time.monotonic()

            self._capture_thread = threading.Thread(
                target=self._capture_loop, name=f"rtsp-capture[{self.name}]", daemon=True
            )
            self._watchdog_thread = threading.Thread(
                target=self._watchdog_loop, name=f"rtsp-watchdog[{self.name}]", daemon=True
            )
            self._capture_thread.start()
            self._watchdog_thread.start()
            logger.info("[%s] Lector RTSP iniciado", self.name)
        return self

    def read(
        self, timeout: float = 1.0, copy: bool = True
    ) -> Tuple[bool, Optional[np.ndarray], float]:
        """Devuelve el frame MÁS RECIENTE aún no entregado.

        Bloquea hasta `timeout` segundos esperando un frame nuevo.

        Returns
        -------
        (ok, frame, timestamp)
            `timestamp` es time.monotonic() del instante de captura; usa
            `time.monotonic() - timestamp` para conocer la edad del frame.
            `copy=False` evita copiar ~6 MB (1080p) pero el consumidor NO debe
            modificar el arreglo.
        """
        with self._cond:
            if self._frame_id == self._last_consumed_id:
                self._cond.wait(timeout=timeout)
            if self._frame is None or self._frame_id == self._last_consumed_id:
                return False, None, 0.0
            self._last_consumed_id = self._frame_id
            frame = self._frame.copy() if copy else self._frame
            return True, frame, self._frame_ts

    def stop(self, timeout: float = 5.0) -> None:
        """Detiene hilos y libera el VideoCapture (idempotente)."""
        with self._lifecycle_lock:
            if self._stop_event.is_set() and self._state == StreamState.STOPPED:
                return
            logger.info("[%s] Deteniendo lector RTSP...", self.name)
            self._stop_event.set()
            self._force_reconnect.set()  # despierta el bucle de lectura

            with self._cond:
                self._cond.notify_all()  # libera consumidores bloqueados en read()

            current = threading.current_thread()
            for t in (self._watchdog_thread, self._capture_thread):
                if t and t.is_alive() and t is not current:
                    t.join(timeout=timeout)
                    if t.is_alive():
                        # El hilo de captura libera el cap por sí mismo (finally)
                        # en cuanto read() retorne gracias a los timeouts.
                        logger.warning("[%s] El hilo %s no terminó en %.1fs", self.name, t.name, timeout)

            self._capture_thread = None
            self._watchdog_thread = None
            self._state = StreamState.STOPPED
            with self._cond:
                self._frame = None  # libera la memoria del último frame

    def __enter__(self) -> "RTSPStreamReader":
        return self.start()

    def __exit__(self, exc_type, exc, tb) -> None:
        self.stop()

    # ------------------------------------------------------------------ #
    # Hilo de captura (único dueño del VideoCapture)
    # ------------------------------------------------------------------ #
    def _open_capture(self) -> Optional[cv2.VideoCapture]:
        """Abre el stream; devuelve None (sin fugas) si falla."""
        params = [
            cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, self._open_timeout_ms,
            cv2.CAP_PROP_READ_TIMEOUT_MSEC, self._read_timeout_ms,
        ]
        cap = None
        try:
            cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG, params)
            if not cap.isOpened():
                cap.release()
                return None
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # buffer mínimo (si el backend lo soporta)

            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            self.resolution = (w, h)
            if h not in (720, 1080) and h != 0:
                logger.warning("[%s] Resolución inesperada %dx%d (se esperaba 720p/1080p)", self.name, w, h)
            return cap
        except Exception:  # noqa: BLE001 - cualquier error de OpenCV/FFmpeg
            logger.exception("[%s] Error abriendo el stream", self.name)
            if cap is not None:
                cap.release()
            return None

    def _read_loop(self, cap: cv2.VideoCapture) -> None:
        """Lee frames continuamente; solo se queda con el último."""
        failures = 0
        while not self._stop_event.is_set() and not self._force_reconnect.is_set():
            ok, frame = cap.read()
            now = time.monotonic()

            if not ok or frame is None:
                failures += 1
                if failures >= self._max_read_failures:
                    logger.warning("[%s] %d lecturas fallidas consecutivas", self.name, failures)
                    return
                time.sleep(0.01)
                continue

            failures = 0
            self._last_frame_activity = now
            with self._cond:
                # Si el frame anterior nunca fue consumido, se descarta (obsoleto).
                if self._frame is not None and self._frame_id != self._last_consumed_id:
                    self.frames_dropped += 1
                self._frame = frame          # `frame` es nuevo en cada read(): no requiere copia
                self._frame_ts = now
                self._frame_id += 1
                self.frames_captured += 1
                self._cond.notify_all()

    def _capture_loop(self) -> None:
        delay = self._backoff_initial
        first_attempt = True

        while not self._stop_event.is_set():
            self._state = StreamState.CONNECTING if first_attempt else StreamState.RECONNECTING
            self._force_reconnect.clear()
            self._last_frame_activity = time.monotonic()  # periodo de gracia para el watchdog

            cap = self._open_capture()
            connected_at = 0.0
            if cap is not None:
                logger.info("[%s] Conectado (%dx%d)", self.name, *self.resolution)
                self._state = StreamState.CONNECTED
                connected_at = time.monotonic()
                try:
                    self._read_loop(cap)
                finally:
                    # Liberación garantizada en cada ciclo (fallo, watchdog o stop).
                    cap.release()
                    cap = None
            else:
                logger.warning("[%s] No se pudo abrir el stream", self.name)

            if self._stop_event.is_set():
                break

            # Conexión estable => reinicia el backoff; si cayó rápido, sigue creciendo.
            if connected_at and (time.monotonic() - connected_at) >= self._stable_reset_after:
                delay = self._backoff_initial

            first_attempt = False
            self.reconnect_count += 1
            self._state = StreamState.RECONNECTING

            wait = delay * (1 + random.uniform(-self._backoff_jitter, self._backoff_jitter))
            logger.info("[%s] Reintento #%d en %.1fs", self.name, self.reconnect_count, wait)
            if self._stop_event.wait(timeout=wait):  # espera interrumpible por stop()
                break
            delay = min(delay * self._backoff_factor, self._backoff_max)

        self._state = StreamState.STOPPED
        logger.info("[%s] Hilo de captura finalizado", self.name)

    # ------------------------------------------------------------------ #
    # Watchdog
    # ------------------------------------------------------------------ #
    def _watchdog_loop(self) -> None:
        """Supervisa que lleguen frames; si no, pide reconexión al hilo de captura."""
        interval = max(0.5, self._watchdog_timeout / 4)
        while not self._stop_event.wait(timeout=interval):
            if self._state != StreamState.CONNECTED:
                continue
            silence = time.monotonic() - self._last_frame_activity
            if silence > self._watchdog_timeout:
                logger.warning("[%s] Watchdog: %.1fs sin frames, forzando reconexión", self.name, silence)
                self._force_reconnect.set()
                # Evita disparos repetidos mientras el hilo de captura reacciona.
                self._last_frame_activity = time.monotonic()

            # Control de latencia (criterio: < 500 ms)
            with self._cond:
                age = time.monotonic() - self._frame_ts if self._frame is not None else 0.0
            if age > self._max_latency_warn_s and silence <= self._watchdog_timeout:
                logger.debug("[%s] Edad del último frame: %.0f ms", self.name, age * 1000)

        logger.debug("[%s] Watchdog finalizado", self.name)


# ---------------------------------------------------------------------- #
# Demo manual:  python rtsp_stream_reader.py rtsp://user:pass@ip:554/stream
# ---------------------------------------------------------------------- #
if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if len(sys.argv) < 2:
        sys.exit("Uso: python rtsp_stream_reader.py <rtsp_url>")

    with RTSPStreamReader(sys.argv[1]) as reader:
        last_report = time.monotonic()
        try:
            while True:
                ok, frame, ts = reader.read(timeout=1.0)
                if ok:
                    age_ms = (time.monotonic() - ts) * 1000
                    if time.monotonic() - last_report >= 5:
                        logger.info(
                            "Frame %s | edad %.0f ms | capturados=%d descartados=%d reconexiones=%d",
                            frame.shape, age_ms, reader.frames_captured,
                            reader.frames_dropped, reader.reconnect_count,
                        )
                        last_report = time.monotonic()
        except KeyboardInterrupt:
            pass

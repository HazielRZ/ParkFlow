# Transporte TecNM Morelia — Turno y Campus

Aplicación inicial en Python/Kivy que implementa los dos requisitos solicitados:

1. Detecta el turno automáticamente con la hora local del dispositivo.
2. Permite cambiar entre Campus 1 y Campus 2 y conserva la elección en el dispositivo.

## Reglas horarias

- Matutino: desde las 06:50 inclusive hasta antes de las 14:00.
- Vespertino: desde las 14:00 inclusive hasta las 21:00 inclusive.
- Fuera de esos horarios: muestra "Sin turno activo".

La pantalla se actualiza cada 30 segundos y también al volver a abrir/reanudar la app.

## Ejecutar en Windows, macOS o Linux

Se recomienda Python 3.10 o 3.11.

```bash
python -m venv .venv
```

Activar entorno:

**Windows**
```bash
.venv\Scripts\activate
```

**macOS/Linux**
```bash
source .venv/bin/activate
```

Instalar y ejecutar:

```bash
pip install -r requirements.txt
python main.py
```

## Crear APK para Android (Buildozer)

Buildozer se recomienda ejecutar desde Linux o WSL2 con Ubuntu. Instala las dependencias de Buildozer siguiendo su documentación oficial y después:

```bash
pip install buildozer
buildozer init
```

En `buildozer.spec`, configura como mínimo:

```ini
title = Transporte TecNM Morelia
package.name = transportetecnm
package.domain = mx.edu.tecnm
source.dir = .
source.include_exts = py,json,png,jpg,kv
version = 1.0.0
requirements = python3,kivy==2.3.1
orientation = portrait
```

Compilar:

```bash
buildozer android debug
```

El APK se genera dentro de `bin/`.

## Persistencia

La preferencia se guarda en `preferencias.json` dentro del directorio de datos privado de la aplicación (la ubicación depende del sistema operativo). No se pierde al cerrar la app ni al reiniciar el dispositivo.

## Alcance de esta entrega

Esta versión implementa la detección de turno y la preferencia local del campus. Todavía no incluye cuentas de conductor, GPS, rutas, mapas, backend ni sincronización entre dispositivos porque no forman parte de los criterios de aceptación indicados. El campus seleccionado queda guardado en el dispositivo donde se eligió.

## Pruebas manuales sugeridas

- Abrir a las 07:00: debe mostrar Matutino.
- Abrir a las 13:59: debe mostrar Matutino.
- Abrir a las 14:00: debe mostrar Vespertino.
- Abrir a las 21:00: debe mostrar Vespertino.
- Abrir a las 21:01: debe mostrar Sin turno activo.
- Seleccionar Campus 2, cerrar y volver a abrir: debe seguir seleccionado Campus 2.
- Cambiar de campus: el cambio visual debe ser inmediato.

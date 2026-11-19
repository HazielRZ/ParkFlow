import json
import os
from datetime import datetime, time
from pathlib import Path

from kivy.app import App
from kivy.clock import Clock
from kivy.core.window import Window
from kivy.metrics import dp
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.widget import Widget
from kivy.utils import get_color_from_hex

# Turnos definidos en el requerimiento:
# Matutino: 06:50 inclusive hasta antes de las 14:00.
# Vespertino: 14:00 inclusive hasta las 21:00 inclusive.
# Fuera de esos intervalos: sin turno activo.

BG = get_color_from_hex("#F3F6FA")
NAVY = get_color_from_hex("#142D4E")
BLUE = get_color_from_hex("#1769AA")
GREEN = get_color_from_hex("#16834A")
MUTED = get_color_from_hex("#65758B")
WHITE = get_color_from_hex("#FFFFFF")


def detectar_turno(hora_actual=None):
    """Devuelve Matutino, Vespertino o Sin turno activo."""
    hora_actual = hora_actual or datetime.now().time()
    if time(6, 50) <= hora_actual < time(14, 0):
        return "Matutino"
    if time(14, 0) <= hora_actual <= time(21, 0):
        return "Vespertino"
    return "Sin turno activo"


class TransporteTecNM(App):
    def build(self):
        self.title = "Transporte TecNM Morelia"
        self.preferences_path = Path(self.user_data_dir) / "preferencias.json"
        self.preferences_path.parent.mkdir(parents=True, exist_ok=True)
        self.preferences = self.cargar_preferencias()

        Window.clearcolor = BG
        root = BoxLayout(orientation="vertical", padding=dp(20), spacing=dp(14))

        header = BoxLayout(orientation="vertical", size_hint_y=None, height=dp(78), spacing=dp(3))
        header.add_widget(Label(
            text="TECNOLÓGICO NACIONAL DE MÉXICO",
            color=NAVY, bold=True, font_size="16sp",
            halign="center", valign="middle"
        ))
        header.add_widget(Label(
            text="INSTITUTO TECNOLÓGICO DE MORELIA · TRANSPORTE",
            color=MUTED, font_size="11sp",
            halign="center", valign="middle"
        ))
        root.add_widget(header)

        root.add_widget(self.separador())

        root.add_widget(Label(
            text="Panel del conductor", color=NAVY, bold=True,
            font_size="25sp", size_hint_y=None, height=dp(42),
            halign="left", valign="middle"
        ))

        root.add_widget(Label(
            text="TURNO DETECTADO AUTOMÁTICAMENTE",
            color=MUTED, bold=True, font_size="12sp",
            size_hint_y=None, height=dp(25), halign="left"
        ))

        self.turno_card = BoxLayout(
            orientation="vertical", padding=dp(16), spacing=dp(5),
            size_hint_y=None, height=dp(132)
        )
        self.turno_card.canvas.before.clear()
        with self.turno_card.canvas.before:
            from kivy.graphics import Color, RoundedRectangle
            self.card_color = Color(*GREEN)
            self.card_rect = RoundedRectangle(
                pos=self.turno_card.pos, size=self.turno_card.size,
                radius=[dp(14)]
            )
        self.turno_card.bind(pos=self.actualizar_tarjeta, size=self.actualizar_tarjeta)

        self.turno_label = Label(
            text="", color=WHITE, bold=True, font_size="25sp",
            halign="left", valign="middle"
        )
        self.horario_label = Label(
            text="", color=WHITE, font_size="14sp",
            halign="left", valign="middle"
        )
        self.turno_card.add_widget(self.turno_label)
        self.turno_card.add_widget(self.horario_label)
        root.add_widget(self.turno_card)

        self.estado_label = Label(
            text="", color=MUTED, font_size="12sp",
            size_hint_y=None, height=dp(25), halign="left"
        )
        root.add_widget(self.estado_label)

        root.add_widget(Widget(size_hint_y=None, height=dp(3)))
        root.add_widget(Label(
            text="Selecciona tu campus", color=NAVY, bold=True,
            font_size="19sp", size_hint_y=None, height=dp(35),
            halign="left"
        ))

        self.campus_status = Label(
            text="", color=MUTED, font_size="13sp",
            size_hint_y=None, height=dp(25), halign="left"
        )
        root.add_widget(self.campus_status)

        buttons = BoxLayout(size_hint_y=None, height=dp(58), spacing=dp(12))
        self.campus1_btn = Button(
            text="CAMPUS 1", bold=True, font_size="16sp",
            background_normal="", background_down="",
            color=WHITE, background_color=BLUE
        )
        self.campus2_btn = Button(
            text="CAMPUS 2", bold=True, font_size="16sp",
            background_normal="", background_down="",
            color=WHITE, background_color=BLUE
        )
        self.campus1_btn.bind(on_release=lambda *_: self.seleccionar_campus("Campus 1"))
        self.campus2_btn.bind(on_release=lambda *_: self.seleccionar_campus("Campus 2"))
        buttons.add_widget(self.campus1_btn)
        buttons.add_widget(self.campus2_btn)
        root.add_widget(buttons)

        root.add_widget(Widget())
        root.add_widget(Label(
            text="La selección de campus se guarda en este dispositivo.",
            color=MUTED, font_size="11sp",
            size_hint_y=None, height=dp(24),
            halign="center"
        ))

        self.actualizar_interfaz()
        # Refresca la hora cada 30 segundos para cambiar de turno sin reiniciar.
        self.refresh_event = Clock.schedule_interval(self.refrescar_turno, 30)
        self.bind(on_start=self.al_reanudar)
        return root

    def separador(self):
        from kivy.uix.widget import Widget
        from kivy.graphics import Color, Line
        line = Widget(size_hint_y=None, height=dp(1))
        with line.canvas:
            Color(0.78, 0.82, 0.87, 1)
            Line(points=[0, 0, Window.width, 0], width=1)
        return line

    def actualizar_tarjeta(self, *_):
        self.card_rect.pos = self.turno_card.pos
        self.card_rect.size = self.turno_card.size

    def cargar_preferencias(self):
        try:
            with open(self.preferences_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            campus = data.get("campus", "Campus 1")
            if campus not in ("Campus 1", "Campus 2"):
                campus = "Campus 1"
            return {"campus": campus}
        except (OSError, json.JSONDecodeError, TypeError):
            return {"campus": "Campus 1"}

    def guardar_preferencias(self):
        temp_path = self.preferences_path.with_suffix(".tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(self.preferences, f, ensure_ascii=False, indent=2)
        os.replace(temp_path, self.preferences_path)

    def seleccionar_campus(self, campus):
        if campus not in ("Campus 1", "Campus 2"):
            return
        self.preferences["campus"] = campus
        self.guardar_preferencias()
        self.actualizar_campus()

    def actualizar_campus(self):
        campus = self.preferences["campus"]
        self.campus_status.text = f"Campus seleccionado: {campus}"
        self.campus1_btn.background_color = GREEN if campus == "Campus 1" else BLUE
        self.campus2_btn.background_color = GREEN if campus == "Campus 2" else BLUE

    def actualizar_interfaz(self):
        self.refrescar_turno(0)
        self.actualizar_campus()

    def refrescar_turno(self, *_):
        turno = detectar_turno()
        if turno == "Matutino":
            self.turno_label.text = "☀  Turno Matutino"
            self.horario_label.text = "Horario: 06:50 – 14:00"
            self.card_color.rgba = GREEN
            self.estado_label.text = "Turno activo según la hora local del dispositivo."
        elif turno == "Vespertino":
            self.turno_label.text = "◐  Turno Vespertino"
            self.horario_label.text = "Horario: 14:00 – 21:00"
            self.card_color.rgba = BLUE
            self.estado_label.text = "Turno activo según la hora local del dispositivo."
        else:
            self.turno_label.text = "Sin turno activo"
            self.horario_label.text = "Horario de servicio: 06:50 – 21:00"
            from kivy.utils import get_color_from_hex
            self.card_color.rgba = get_color_from_hex("#65758B")
            self.estado_label.text = "Fuera del horario establecido. Se actualizará automáticamente."
        return True

    def al_reanudar(self, *_):
        self.refrescar_turno()

    def on_resume(self):
        # Android llama a este método cuando la app vuelve al primer plano.
        self.refrescar_turno()
        return True

    def on_pause(self):
        return True


if __name__ == "__main__":
    TransporteTecNM().run()

import sys
from datetime import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Importar main.py requiere Kivy; esta prueba verifica la lógica al tener Kivy instalado.
from main import detectar_turno


def test_limites():
    assert detectar_turno(time(6, 49, 59)) == "Sin turno activo"
    assert detectar_turno(time(6, 50)) == "Matutino"
    assert detectar_turno(time(13, 59, 59)) == "Matutino"
    assert detectar_turno(time(14, 0)) == "Vespertino"
    assert detectar_turno(time(21, 0)) == "Vespertino"
    assert detectar_turno(time(21, 0, 1)) == "Sin turno activo"

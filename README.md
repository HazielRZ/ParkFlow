# PARK FLOW 🚗🅿️
> **Sistema Inteligente de Monitoreo y Gestión de Estacionamiento por Visión Computacional**  
> *Instituto Tecnológico de Morelia — Ingeniería en Sistemas Computacionales*

[[https://img.shields.io/badge/license-MIT-blue.svg]](LICENSE)
[[https://img.shields.io/badge/Python-3.10%2B-blue?logo=python]](https://python.org)
[[https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi]](https://fastapi.tiangolo.com)
[[https://img.shields.io/badge/Frontend-React%20%2F%20PWA-61DAFB?logo=react]](https://reactjs.org)
[[https://img.shields.io/badge/Metodología-Scrumban-orange]](#metodología-de-trabajo)

---

## 📌 Descripción del Proyecto

**PARK FLOW** es una solución tecnológica no invasiva diseñada para optimizar el flujo vehicular y reducir el tiempo de búsqueda de cajones en los estacionamientos del Campus 1 y Campus 2 del ITM. Mediante el uso de cámaras de seguridad fijas (RTSP) y modelos de visión por computadora (YOLO / OpenCV), el sistema clasifica en tiempo real el estado de cada espacio (*Libre*, *Ocupado*, *En maniobra*) y lo difunde a los estudiantes a través de una aplicación web móvil/PWA y pantallas informativas.

---

## 👥 Equipo de Desarrollo y Roles (Scrumban)

| Integrante | Rol | Contacto |
| :--- | :--- | :--- |
| **Haziel Ruiz Zúñiga** | Scrum Master  & Analista | `l221213339@morelia.tecnm.mx` |
| **José Rodrigo Vargas Carrillo** | Tech Lead & Arquitecto de Software | `l23121118@morelia.tecnm.mx` |
| **Miguel Ángel Cristal Bolaños** | DevOps & QA Engineer | `l23121135@morelia.tecnm.mx` |
| **Julio Armando Martínez Equihua** | Computer Vision & Backend Developer | `l23121112@morelia.tecnm.mx` |
| **Luis Antonio Anzaldua Mendez** | Full-Stack & Frontend Developer | `l24120432@morelia.tecnm.mx` |

---

## 🏗️ Arquitectura Modular

El proyecto se divide en tres capas desacopladas:
1. **Motor de Visión Computacional (`/cv-service`):**  
   Captura transmisiones de video IP (protocolo RTSP), analiza los polígonos calibrados mediante inferencia de red neuronal y emite cambios de estado vía WebSockets/REST.
2. **Servidor Backend (`/api-backend`):**  
   Desarrollado en Python/FastAPI con base de datos relacional PostgreSQL. Centraliza el aforo global, autenticación institucional y métricas históricas.
3. **Frontend Web y Móvil (`/client-app`):**  
   Aplicación web responsive (PWA) para estudiantes (< 3 pasos de consulta) y Dashboard administrativo para dibujo interactivo de polígonos.

---

## 📋 Requisitos Principales del Sistema (ERS)

- **RF-01:** Consulta de disponibilidad de cajones en tiempo real desde dispositivos móviles.
- **RF-02:** Detección automática del turno en curso y filtrado por campus.
- **RF-03:** Sincronización automática de estado con opción de ajuste manual para el personal.
- **RF-04:** Alertas automáticas cuando la ocupación supere el 90% de capacidad.
- **RF-05:** Módulo de analíticas y reportes exportables en formato PDF/CSV.
- **RF-06:** Herramienta interactiva para dibujo y calibración de polígonos sobre el stream de video.
- **RNF-01 / RNF-07:** Tiempo de respuesta web ≤ 3s, latencia de actualización de visión ≤ 5s y precisión de detección ≥ 95% de día / ≥ 90% noche.

---

## 🚀 Puesta en Marcha (Entorno de Desarrollo)

### Prerrequisitos
- Python 3.10+
- Node.js 18+
- Docker y Docker Compose
- Cámara IP o archivo de video de prueba `.mp4`

### Clonar el repositorio
```bash
git clone [https://github.com/tu-organizacion/park-flow.git](https://github.com/tu-organizacion/park-flow.git)
cd park-flow

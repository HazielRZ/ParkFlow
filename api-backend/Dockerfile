# --- Etapa 1: Builder ---
FROM python:3.11-slim AS builder

WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Etapa 2: Runtime ---
FROM python:3.11-slim

LABEL maintainer="Haziel Ruiz Zúñiga <l221213339@morelia.tecnm.mx>"
LABEL org.opencontainers.image.title="ParkFlow API Backend"
LABEL org.opencontainers.image.description="Capa 2: Orquestador de Negocio, Validación de Contratos y WebSockets - RNF-05 / INT-SW-01"
LABEL org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY src/ ./src/

EXPOSE 8000
USER nobody

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
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
LABEL org.opencontainers.image.title="ParkFlow CV Service"
LABEL org.opencontainers.image.description="Capa 1: Pipeline de Visión Computacional (YOLO + OpenCV) - RNF-05 / INT-SW-01"
LABEL org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY src/ ./src/

USER nobody

CMD ["python", "-m", "src.client.http_dispatcher"]
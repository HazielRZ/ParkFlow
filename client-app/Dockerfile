FROM node:20-alpine

LABEL maintainer="Haziel Ruiz Zúñiga <l221213339@morelia.tecnm.mx>"
LABEL org.opencontainers.image.title="ParkFlow Client App"
LABEL org.opencontainers.image.description="Capa 3: Aplicación Cliente y Dashboard en Tiempo Real - RNF-05"
LABEL org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY src/ ./src/

EXPOSE 5173

USER node

CMD ["npm", "run", "dev"]

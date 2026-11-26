# Contexto de build: raíz del repositorio. Se copian imagen/ y review/instagram/ para que
# los enlaces simbólicos de frontend/public/media resuelvan igual que en desarrollo.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci --ignore-scripts
COPY frontend frontend
COPY imagen imagen
COPY review/instagram review/instagram
# Versiones HD (Real-ESRGAN) generadas con scripts/upscale_media_hd.py; frontend/public/media-hd apunta aquí.
COPY storage/media-hd storage/media-hd
ARG NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_FILES_URL=http://localhost:8080/files
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_FILES_URL=$NEXT_PUBLIC_FILES_URL NEXT_TELEMETRY_DISABLED=1
RUN cd frontend && npm run postinstall && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
USER node
WORKDIR /app/frontend
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]

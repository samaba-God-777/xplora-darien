# Contexto de build: raíz del repositorio (necesita backend/ y database/migrations/).
FROM rust:1-slim-bookworm AS build
WORKDIR /src
COPY database/migrations database/migrations
COPY database/seeds database/seeds
COPY backend/Cargo.toml backend/Cargo.lock backend/
# Cachea dependencias
RUN mkdir -p backend/src && echo 'fn main(){}' > backend/src/main.rs && echo '' > backend/src/lib.rs \
 && cd backend && cargo build --release && rm -rf src target/release/deps/xplora*
COPY backend/src backend/src
RUN cd backend && cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 app
COPY --from=build /src/backend/target/release/xplora-darien-api /usr/local/bin/xplora-darien-api
RUN mkdir -p /data/storage && chown app /data/storage
USER app
ENV BIND_ADDR=0.0.0.0:8080 LOG_FORMAT=json PAGEWEB_DIR=/pageweb STORAGE_DIR=/data/storage
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD curl -fsS http://localhost:8080/api/v1/health || exit 1
ENTRYPOINT ["xplora-darien-api"]

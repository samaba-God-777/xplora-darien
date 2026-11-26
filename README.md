# XPLORA DARIÉN

Plataforma de turismo para Darién, Panamá. El estado de cada fase está en [docs/ROADMAP.md](docs/ROADMAP.md).

```
pageWeb/
├── imagen/                 # Fotos originales (no se modifican)
├── review/instagram/       # Respaldo de @xplore_darien (no se modifica)
├── docs/                   # ASSET_INVENTORY.md, ROADMAP.md
├── scripts/                # generate_inventory.py, generate_seed.mjs
├── database/               # migrations/ (SQL versionado) y seeds/
├── backend/                # API Rust: Axum · Tokio · SQLx · JWT · Argon2 · utoipa (OpenAPI)
├── infrastructure/         # Dockerfiles y backup.sh
├── docker-compose.yml
└── frontend/               # Next.js 16 · React 19 · Tailwind 4 · MapLibre · Motion · Lucide · TanStack Query
    ├── public/media/       # enlaces simbólicos → imagen/ y review/instagram/
    └── src/
        ├── app/            # / (portada) y /mapa (mapa interactivo)
        ├── data/           # destinations.ts, media-manifest.json
        ├── features/map/   # DarienMap, MapExplorer, DestinationPanel
        ├── i18n/           # textos ES / EN
        └── lib/
```

## Ejecutar en macOS

Guía completa (Docker o desarrollo local, pruebas): [docs/INSTALLATION.md](docs/INSTALLATION.md). API: [docs/API.md](docs/API.md) · BD: [docs/DATABASE.md](docs/DATABASE.md).

Solo el frontend:

Requisitos: Node 22 o superior, y ffmpeg (solo para regenerar el inventario).

```bash
cd frontend && npm install && npm run dev
```

Abrir http://localhost:3000/mapa

Para regenerar el inventario de recursos:

```bash
python3 -I scripts/generate_inventory.py
```

## Mapa

- Teselas: OpenFreeMap (vector) y Esri World Imagery (satélite). No requieren API key; se pueden cambiar a Mapbox en `DarienMap.tsx`.
- Datos de los lugares: `frontend/src/data/destinations.ts`. Para añadir un lugar, se agrega un objeto con sus fotos (rutas de `imagen/` o `instagram/`), sus actividades y sus coordenadas.
- Si `coordsVerified: false`, la ficha muestra "Ubicación aproximada" y oculta el enlace a Google Maps.

# Instalación en macOS

## Opción A — Docker (todo incluido)

Requisitos: Docker Desktop.

```bash
cp .env.example .env        # completar POSTGRES_PASSWORD y JWT_SECRET (openssl rand -hex 32)
docker compose up -d --build
docker compose run --rm seed   # destinos, galería y catálogo de modelos de Higgsfield
ADMIN_PASSWORD='una-contraseña-larga' docker compose run --rm -e ADMIN_PASSWORD api create-user tu@correo.com "Tu Nombre" superadmin
```

- Web: http://localhost:3000 · Mapa: http://localhost:3000/mapa
- API: http://localhost:8080/api/v1 · Docs: http://localhost:8080/docs
- PostgreSQL del contenedor: `localhost:5433`

## Opción B — Desarrollo local

Requisitos: Homebrew, Node 22.18 o superior, Rust (rustup), PostgreSQL y ffmpeg.

```bash
brew install postgresql@18 ffmpeg node
brew services start postgresql@18
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

1. Base de datos:
   ```bash
   createdb xplora_darien
   ```
2. API (`backend/.env`, ver `.env.example`; `DATABASE_URL=postgres://$USER@localhost:5432/xplora_darien`):
   ```bash
   cd backend
   cargo run -- migrate
   for f in ../database/seeds/*.sql; do psql -d xplora_darien -f $f; done
   ADMIN_PASSWORD='una-contraseña-larga' cargo run -- create-user tu@correo.com "Tu Nombre" superadmin
   cargo run
   ```
3. Frontend (`frontend/.env.local` con `NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1`):
   ```bash
   cd frontend && npm install && npm run dev
   ```

## Higgsfield (opcional)

Añade `HIGGSFIELD_API_KEY_ID` y `HIGGSFIELD_API_KEY_SECRET` a `backend/.env` y reinicia la API. Después define el presupuesto mensual en `/admin/estudio-ia`. Sin credenciales el estudio muestra "no configurado" y no genera nada. Ver [GALLERY.md](GALLERY.md).

## Pruebas

```bash
cd backend && cargo test --lib                       # unitarias (precios, transiciones, JWT, Argon2)
TEST_DATABASE_ADMIN_URL=postgres://$USER@localhost:5432/postgres cargo test --test api   # integración (crea y borra una BD temporal)
cd frontend && npx tsc --noEmit && npx eslint src && npm run build
```

## Regenerar datos derivados de pageWeb

```bash
python3 -I scripts/generate_inventory.py   # docs/ASSET_INVENTORY.md + media-manifest.json
node scripts/generate_seed.mjs             # database/seeds/001_destinations.sql
node scripts/generate_gallery_seed.mjs     # database/seeds/002_gallery.sql
python3 -I scripts/sync_higgsfield_models.py  # database/seeds/003_video_models.sql (lee la documentación oficial)
```

## Fotos en HD (Real-ESRGAN)

La app muestra las fotos de `imagen/` y `review/instagram/` en su versión mejorada con IA
(`storage/media-hd/`, mismo nombre y ruta). Los originales **no se modifican**. Las fotos se
sirven en `/media-hd/…` (`frontend/public/media-hd` es un enlace a `storage/media-hd`); los videos
siguen en `/media/…`.

Se generan con la skill [upscale-for-print](https://github.com/Mariano215/ai-image-upscaler)
(Real-ESRGAN x4plus, MIT):

```bash
git clone https://github.com/Mariano215/ai-image-upscaler.git ~/.claude/skills/upscale-for-print
python3.12 -m venv ~/.claude/skills/upscale-for-print/.venv
~/.claude/skills/upscale-for-print/.venv/bin/pip install -r ~/.claude/skills/upscale-for-print/requirements.txt
~/.claude/skills/upscale-for-print/.venv/bin/python scripts/upscale_media_hd.py
```

- Escala ×4 y reduce a un máximo de 2560 px por lado; usa la GPU (CUDA o Apple MPS) si existe.
- Es reanudable: solo procesa fotos nuevas. Para rehacer una, borra su archivo en `storage/media-hd/`.
- Si una foto falla (o es una hoja de contacto interna), se deja un enlace al original para que la app
  nunca pida un archivo inexistente.
- Las fotos nuevas que agregues a `imagen/` o `review/instagram/` necesitan volver a correr el script.
- La IA limpia bordes y artefactos de compresión, pero no inventa detalle real: el resultado depende del original.

# Arquitectura — XPLORA DARIÉN

```
Navegador ──► Next.js 16 (frontend/, :3000) ──fetch──► API Rust Axum (backend/, :8080) ──SQLx──► PostgreSQL 18
                 │  /media/* → enlaces simbólicos a imagen/ y review/instagram/ (originales intactos)
                 └─ teselas: OpenFreeMap (vector) · Esri World Imagery (satélite)
```

## Backend (`backend/src`)

| Módulo | Responsabilidad |
|---|---|
| `api/` | Router, middleware transversal (CORS, rate limit, límites, timeouts, cabeceras, request-id, trazas) y OpenAPI |
| `auth/` | Argon2id, JWT, extractor `AuthUser` y comprobación de permisos `require()` |
| `errors/` | `AppError` → respuesta JSON uniforme; traduce las violaciones de restricciones de PostgreSQL a 409 o 422 |
| `destinations/` | Catálogo, ficha, puntos del mapa y CRUD administrativo |
| `packages/` | Catálogo, detalle con itinerario, comparador, precios, salidas, disponibilidad y publicación |
| `bookings/` | Precio (`pricing.rs`, función pura), solicitudes y máquina de estados con verificación de cupo |
| `guides/` | Guías y proveedores públicos |
| `media/` | Biblioteca de medios |
| `audit/` | Registro de auditoría (sin hacer fallar la petición) |
| `database/` | Pool y migraciones incrustadas |

Las consultas de lectura construyen el JSON directamente en PostgreSQL (`jsonb_build_object`). Así se evitan consultas N+1, y la traducción se resuelve con `tr()`.

## Frontend (`frontend/src`)

- `features/map/`: `DarienMap` (MapLibre), `MapExplorer` (filtros, búsqueda, lista, ES/EN) y `DestinationPanel` (ficha).
- `features/map/useMapPoints.ts`: TanStack Query contra `/map/points`. Si la API no responde, usa `data/destinations.ts`, así el mapa nunca queda vacío.
- `services/api.ts`: cliente HTTP con errores tipados.

## Pendiente

Las fases que faltan (panel administrativo, cotizaciones en PDF, estudio Higgsfield, blog, etc.) están en [ROADMAP.md](ROADMAP.md).

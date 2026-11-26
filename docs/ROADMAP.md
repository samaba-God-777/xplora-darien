# XPLORA DARIÉN — Estado por fases

Raíz del proyecto: `pageWeb/` (los recursos originales `imagen/` y `review/` se conservan intactos; no se movió la carpeta).

| Fase | Estado | Entregado / Pendiente |
|---|---|---|
| 1. Inspección de pageWeb | ✅ | 23 fotos en `imagen/`, respaldo Instagram (12 videos, 107 slides, 29 posters, avatar, `inventory.json`) |
| 2. Inventario | ✅ | `docs/ASSET_INVENTORY.md`, `frontend/src/data/media-manifest.json`, script `scripts/generate_inventory.py` |
| 3. Arquitectura y BD | ✅ | 7 migraciones, 53 tablas, FK, índices, CHECK, triggers de historial; `docs/DATABASE.md`, `docs/ARCHITECTURE.md` |
| 4. Identidad visual | 🟡 | Tokens de color/tipografía en `frontend/src/app/globals.css` (Fraunces + Manrope). Falta logo vectorial |
| 5. Página principal | 🟡 | Hero con video, CTA, destinos destacados, contacto. Faltan las 12 secciones completas |
| 6. Catálogo de destinos | 🟡 | 17 destinos (ES/EN) en la BD y servidos por `/destinations`. Faltan las páginas `/destinos/[slug]` |
| **Mapa interactivo** | ✅ | `/mapa`: marcadores con foto, filtros por categoría, búsqueda, ficha con galería, video y actividades, ES/EN, mapa/satélite, enlace compartible `?lugar=` |
| 7–10. Paquetes, comparador, experiencias, guías, reservas, PDF | 🟡 | 7 paquetes en borrador (`004_packages.sql`) con precios por temporada editables en `/admin/paquetes`; falta cargar los precios reales. |
| 11. Backend Rust (Axum + SQLx) | ✅ | 26 endpoints con OpenAPI (`/docs`), JWT + Argon2, permisos por rol, rate limiting, CORS, auditoría. El mapa consume `/map/points` |
| 12. Panel administrativo | ✅ | `/admin`: panel de control con ganancias, reservas (estados, cobros, personal), finanzas, paquetes y precios, personal, inventario, Media Studio y AI Video Studio. Pendiente: editor de destinos y de contenido de paquetes, usuarios y roles |
| **Cinematic Gallery** | ✅ | Organizada por pueblo o destino (`/galeria/destino/[slug]`). `/galeria`: hero, 12 categorías, masonry, lightbox, videos, CTA a destinos, paquetes y reservas |
| 13. Higgsfield | ✅ | XPLORA AI Video Studio: 39 modelos sincronizados desde la documentación, validación por esquema, estimación de costo + presupuesto, cola asíncrona, revisión y publicación (ver `docs/GALLERY.md`). Falta poner credenciales reales |
| 14. SEO | 🟡 | Metadata, Open Graph, JSON-LD `TouristAttraction` en `/mapa` |
| 15–16. Seguridad, pruebas, Docker, docs | 🟡 | 9 pruebas unitarias + 1 prueba de integración de punta a punta; Docker Compose; script de respaldo; `docs/API.md` e `INSTALLATION.md`. Faltan Playwright y una revisión de seguridad |

## Pendientes de verificación (no inventar)

- **Coordenadas**: solo Yaviza y La Palma están marcadas como verificadas. El resto se muestra como *Ubicación aproximada* y no ofrece "Abrir en Google Maps". Validar con GPS y cambiar `coordsVerified`.
- **Cascada Infiernillo**: ubicación desconocida en las fuentes; colocada provisionalmente en la zona de Arenal.
- **El Embudo, Giba del Toro, Cerro Chucantí**: están en Panamá Este / límite con Darién (según pies de foto).
- **Rutas**: no se dibuja ninguna ruta hasta que se verifiquen como seguras.
- **Atribución de fotos**: Puerto Lara, La Chunga, Mogué y La Palma se asignaron por nombre de archivo o por identificación visual. Confirmarlo con el autor.
- `imagen/img4.jpeg` es una gráfica de MiAmbiente, no una fotografía propia.

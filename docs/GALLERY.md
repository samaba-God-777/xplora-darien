# Cinematic Gallery · Media Management Studio · XPLORA AI Video Studio

## Rutas

| Ruta | Qué es |
|---|---|
| `/galeria` | Hero cinematográfico, bento con 12 categorías, videos y masonry con scroll infinito |
| `/galeria/[categoria]` | Portada editorial de la categoría, sus videos y sus fotos |
| `/paquetes`, `/paquetes/[slug]` | Paquetes publicados; cada uno tiene su propia galería |
| `/reservar` | Solicitud de reserva (pasos 1–7). Nunca se confirma automáticamente |
| `/admin/medios` | Media Management Studio |
| `/admin/estudio-ia` | XPLORA AI Video Studio (Higgsfield) |

## Contenido de pageWeb

- 184 archivos inventariados. 132 fotos y 12 videos quedan publicados; duplicados, hojas de contacto, portadas de reels y afiches gráficos quedan como internos o borradores.
- Los originales **no se copian ni se modifican**. El frontend los sirve por enlace simbólico (`/media`) y el optimizador de Next genera AVIF/WebP en tamaños responsive. La API solo escribe en `STORAGE_DIR` (subidas, videos generados, pósters).
- **Procedencia** (`media_destinations.attribution`):

  | Valor | Significado | Público |
  |---|---|---|
  | `verified` | Verificado por el equipo | Sí |
  | `owner_caption` | Lo nombra el pie de la publicación original | Sí |
  | `owner_filename` | Lo nombra el archivo del autor | Sí |
  | `visible_signage` | Letrero o rótulo visible | Sí |
  | `editorial_guess` | Estimación | **No**, hasta que se verifique |

  Hoy hay 3 fotos con estimación (`image1.jpeg`, `img5.jpeg`, `img6.jpg`), que no se muestran asociadas a un lugar. Por eso La Palma aparece sin fotos.
- Las publicaciones que no nombran el lugar (DeyBzMDAP_7, DdNjqxBAGVT…) se clasifican por categoría **sin destino**.
- Para regenerar los datos: `node scripts/generate_seed.mjs && node scripts/generate_gallery_seed.mjs`.

## Rendimiento y accesibilidad

- Paginación de 24 en 24 con scroll infinito y botón "Cargar más" accesible.
- Imágenes con `next/image` (AVIF/WebP, `sizes`, lazy loading, aparición progresiva).
- Los videos **no se cargan** al abrir la página: solo los pósters. Se reproducen con `preload="metadata"` y streaming por HTTP Range (206). El hero monta solo el video de la escena actual.
- Lightbox: diálogo modal con foco gestionado, teclado (← → Esc + − i), zoom con rueda, doble clic y botones, arrastre, y deslizar en móvil. Se respeta `prefers-reduced-motion`.
- Analítica anónima (`media_analytics`), sin IP ni datos personales: vistas, reproducciones y clics en botones.

## Higgsfield (verificado contra la documentación oficial el 2026-11-20)

- Autenticación: `Authorization: Key <id>:<secret>`. Solo el backend conoce las claves (`HIGGSFIELD_API_KEY_ID` / `HIGGSFIELD_API_KEY_SECRET`).
- Flujo: `POST /{endpoint}` con `Idempotency-Key` → `request_id`. Se consulta el estado con backoff de 2 s a 10 s más jitter, hasta `completed | failed | nsfw | canceled`.
- Imagen de referencia: `POST /files/generate-upload-url` y luego `PUT` prefirmado (sin credenciales). Higgsfield admite JPG, PNG, WebP y GIF; **AVIF no**.
- Costos: `POST /estimate/{endpoint}`. Cada generación exige una estimación y que entre en el presupuesto mensual (`system_settings`). Si el presupuesto es 0, la generación está deshabilitada. Los resultados `failed` y `nsfw` no se cobran.
- Los resultados expiran en Higgsfield a los 7 días. El worker **descarga el video** a `STORAGE_DIR/generated/`, extrae metadatos con ffprobe y genera un póster con ffmpeg.
- Catálogo de modelos: `scripts/sync_higgsfield_models.py` lee la ficha de cada modelo y guarda su esquema exacto en `video_models` (39 modelos). La API rechaza cualquier parámetro que el modelo no documente. **La mayoría de los modelos imagen→video no aceptan `aspect_ratio`**: el video conserva la proporción de la foto, y el estudio lo indica.
- Secuencias de varios planos: solo en modelos que documentan `multi_prompt` (Kling 3.0).
- Revisión: un resultado nunca se publica sin aprobación. Al aprobarlo se asocian categorías y destinos (procedencia `verified`) y se marca como "Generado con IA" en la galería.

### Activar el estudio

1. Crea credenciales en https://console.higgsfield.ai.
2. Añádelas a `backend/.env` (o al `.env` de Docker) y reinicia la API.
3. En `/admin/estudio-ia`, un superadministrador define el **presupuesto mensual**.

## Pendiente

- Botón "Descubre la experiencia": aparecerá cuando exista la página pública de experiencias (hoy no hay experiencias cargadas).
- Webhooks de Higgsfield (necesitan una URL HTTPS pública); mientras tanto se usa polling, que es la vía de recuperación recomendada.
- Las skills `higgsfield-ai/skills` no se instalaron: instalan el CLI de Higgsfield y piden iniciar sesión con tu cuenta. No son necesarias para la integración REST.
- Pruebas end-to-end con Playwright.

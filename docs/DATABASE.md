# Base de datos — XPLORA DARIÉN

PostgreSQL 18. Las migraciones versionadas están en `database/migrations/`; las aplica la API al arrancar (`sqlx::migrate!`) o con `xplora-darien-api migrate`. Semillas idempotentes: `001_destinations.sql` (`node scripts/generate_seed.mjs`), `002_gallery.sql` (`node scripts/generate_gallery_seed.mjs`) `003_video_models.sql` (`python3 -I scripts/sync_higgsfield_models.py`) y `004_packages.sql` (7 paquetes en borrador, sin precios).

| Migración | Contenido |
|---|---|
| 0001_auth | `users`, `roles`, `permissions`, `role_permissions`, `user_roles` + 5 roles y 17 permisos |
| 0002_catalog | `media_assets`, `destination_categories`, `activity_types`, `destinations`, `destination_category_links`, `destination_activities`, `destination_media`, `experience_categories`, `experiences`, `experience_destinations`, `translations` |
| 0003_guides_providers | `guides`, `guide_certifications`, `guide_destinations`, `guide_experiences`, `providers`, `provider_services`, `provider_media` |
| 0004_packages | `tour_packages`, `package_destinations`, `package_experiences`, `package_guides`, `package_providers`, `package_media`, `package_itinerary_days`, `package_itinerary_activities`, `package_inclusions`, `package_exclusions`, `package_prices`, `package_price_history`, `package_departures`, `package_availability` |
| 0005_bookings | `customers`, `bookings`, `booking_participants`, `booking_services`, `booking_status_history`, `quotes` |
| 0006_media_routes_content | `video_templates` (8 plantillas), `video_generations`, `routes`, `route_points`, `reviews`, `blog_posts`, `promotions`, `notifications`, `audit_logs`, `system_settings` |
| 0007_functions | `tr()` (traducción con respaldo en español), `seats_taken()` |
| 0008_gallery_ai_studio | `media_categories`, `media_asset_categories`, `media_tags`, `media_asset_tags`, `media_collections`, `media_collection_items`, `media_experiences`, `media_analytics`, `media_processing_jobs`, `video_models`; renombra `destination_media`→`media_destinations` (con `attribution`) y `package_media`→`media_packages`; amplía `media_assets`, `video_templates` y `video_generations`; `ai_spend_this_month()` |
| 0009_seasons | `seasons` (fechas MM-DD que se repiten cada año y pueden cruzar el año), `season_covers()`, `package_prices.season_id` (una tarifa activa por tipo y temporada), historial de precios con temporada, permiso `seasons.manage` |
| 0010_package_distance | `tour_packages.distance_km` y `access_note` (distancia aproximada desde Ciudad de Panamá; ordena el catálogo) |
| 0011_operations | `staff`, `staff_assignments` (sin choques de fechas), `inventory_items` + `inventory_movements` (trigger que aplica compras/salidas/devoluciones; existencias nunca negativas), `booking_payments` (cobros y reembolsos), `expenses`, vista `finance_monthly` (ingresos − gastos − personal) y permisos `staff.manage`, `inventory.manage`, `finance.read`, `finance.write` |
| 0012_trust_notifications | Opiniones verificadas (`reviews.email`, `verified`, una por reserva) y permiso `reviews.moderate`; avisos por correo con reintentos (`notifications.next_attempt_at`); contacto (WhatsApp, correo, teléfono) y textos de Quiénes somos, Cancelaciones, Privacidad y Términos en `system_settings` |

## Decisiones de diseño

- **Integridad**: todas las relaciones tienen `FOREIGN KEY`. Se usa `RESTRICT` donde borrar dejaría reservas huérfanas (paquete o cliente con reservas) y `CASCADE` en las tablas hijas.
- **Reglas de negocio garantizadas en la BD** (no solo en la API):
  - `routes`: `CHECK` impide `status = 'published'` sin `is_verified`, `verified_by` y `verified_at`.
  - `package_departures`: `seats_held <= capacity`.
  - `tour_packages`: `nights < days`, `max_capacity >= min_participants`.
  - `package_prices`: una tarifa `group` exige `min_group_size`.
  - `bookings.status` siempre empieza en `received` (por defecto) y la API valida las transiciones.
- **Historial**: los triggers `package_prices_history` y `bookings_status_history` registran cada cambio de precio y de estado. El autor del cambio se pasa con `set_config('app.user_id', …)` dentro de la transacción.
- **Instantáneas**: la reserva guarda `price_snapshot` e `itinerary_snapshot`, así un cambio de precio posterior no altera las reservas ya hechas.
- **Traducciones**: el contenido base está en español en cada tabla y `translations(entity_type, entity_id, locale, field)` guarda el resto de idiomas.
- **Borrado lógico** en destinos y paquetes (`deleted_at`).
- **Índices** para los listados públicos (`status`, `is_featured` con filtro `deleted_at IS NULL`), búsquedas por fecha de salida, estado de reservas y auditoría por entidad.

## Respaldos

```bash
./infrastructure/backup.sh          # base local
./infrastructure/backup.sh docker   # contenedor
pg_restore --clean --if-exists -d xplora_darien backups/<archivo>.dump
```

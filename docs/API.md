# API REST — XPLORA DARIÉN

- Base: `http://localhost:8080/api/v1`
- Documentación interactiva: **http://localhost:8080/docs** (Scalar). Especificación: `/openapi.json` (copia en [openapi.json](openapi.json))
- Formato de error único:
  ```json
  { "error": { "code": "validation_error", "message": "datos inválidos", "details": { } } }
  ```
  Códigos: `bad_request` 400 · `unauthorized` 401 · `forbidden` 403 · `not_found` 404 · `conflict` 409 · `validation_error` / `unprocessable` 422 · `internal_error` 500.
- Idioma: `?lang=es` (por defecto) o `?lang=en` en los endpoints de catálogo.
- Dinero: siempre como **texto decimal** (`"417.30"`), nunca como número de coma flotante.

## Públicos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servicio y de la BD |
| GET | `/map/points` | Destinos publicados para el mapa (ES + EN en la misma respuesta) |
| GET | `/destinations?lang=&category=&featured=` | Catálogo de destinos |
| GET | `/destinations/{slug}` | Ficha con actividades, medios, guías y paquetes asociados |
| GET | `/packages?lang=&type=&featured=` | Paquetes publicados |
| GET | `/packages/{slug}` | Itinerario por día, incluye y no incluye, precios vigentes y salidas |
| GET | `/packages/compare?slugs=a,b,c` | Comparador (2–3 paquetes) |
| GET | `/bookings/price?package=&travel_date=&adults=&children=` | Paso 6: precio total |
| POST | `/bookings` | Paso 7: solicitud de reserva → código `XD-AAAA-000001`, estado `received` |
| GET | `/guides`, `/providers?category=` | Directorio (solo certificaciones verificadas) |
| POST | `/auth/login` | JWT (límite: 5 peticiones en ráfaga por IP) |

## Administración (requiere `Authorization: Bearer <jwt>`)

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/auth/me` | cualquiera autenticado |
| POST / PUT / DELETE | `/admin/destinations[/{id}]` | `destinations.write` |
| POST | `/admin/destinations/{id}/publish` | `destinations.publish` |
| POST | `/admin/packages` | `packages.write` |
| POST | `/admin/packages/{id}/prices`, `/departures` · PUT `/availability` | `packages.pricing` |
| POST | `/admin/packages/{id}/publish` | `packages.publish` (exige un precio vigente, salvo en paquetes privados o personalizados) |
| GET | `/admin/bookings[/{id}]` | `bookings.read` |
| POST | `/admin/bookings/{id}/status` | `bookings.manage` |
| GET | `/admin/media` | `media.write` |

### Reglas de reserva

- Una solicitud nueva siempre queda en `received`. Transiciones permitidas:
  `received → pending | quoting | cancelled` · `pending ↔ quoting` · `pending/quoting → confirmed` · `confirmed → paid` · `paid → completed` · cancelar desde cualquier estado activo.
- **Confirmar exige verificar cupo**. Si la reserva tiene una salida, se reservan plazas de forma atómica (`seats_held`). Si no la tiene, debe existir `package_availability` para esa fecha, sin bloqueo y con cupo libre. Si falta cualquiera de las dos cosas, la API responde `409`.
- Cada cambio de estado queda en `booking_status_history` (autor y nota) y en `audit_logs`.
- Si el paquete no tiene precios, la solicitud se acepta con `price.priced = false` (queda a cotizar).

### Ejemplo

```bash
curl -s localhost:8080/api/v1/bookings -H 'content-type: application/json' -d '{
  "package": "arenal-2d1n", "travel_date": "2027-02-10", "adults": 2, "children": 1,
  "visitor": {"first_name":"Ana","last_name":"Pérez","email":"ana@example.com","phone":"+507 6000-0000","country":"PA"},
  "services": [{"description":"Transporte desde Ciudad de Panamá","quantity":1}]
}'
```

## Galería, Media Studio y AI Studio

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/gallery/destinations` (galería por pueblo o destino), `/seasons` | público |
| GET/PATCH | `/admin/packages` (todos, con historial) · PATCH `/admin/packages/{id}/prices/{price_id}` · POST `/admin/packages/{id}/prices` con `season` · PUT `/admin/seasons/{key}` | `packages.pricing` / `seasons.manage` |
| GET | `/gallery/categories`, `/gallery/media?category=&type=&orientation=&destination=&package=&page=`, `/gallery/media/{id}`, `/gallery/hero` | público |
| POST | `/gallery/media/{id}/events` | público (con rate limit, anónimo) |
| GET/PATCH/DELETE | `/admin/media[/{id}]` (DELETE exige `?confirm={id}`) · POST `/admin/media/upload` (multipart, 300 MB) | `media.write` |
| GET/PUT | `/admin/media/collections` · GET `/admin/media/stats` | `media.write` |
| GET | `/admin/ai/status`, `/admin/ai/models?mode=`, `/admin/ai/templates`, `/admin/ai/presets`, `/admin/ai/generations[/{id}]` | `ai.generate` |
| POST | `/admin/ai/generations` (`dry_run` = solo estimar), `/{id}/cancel`, `/{id}/review` · PUT `/admin/ai/templates/{key}` | `ai.generate` |
| PUT | `/admin/ai/settings` (presupuesto y concurrencia) | `settings.manage` |
| GET | `/files/...` subidas, videos generados y pósters (soporta Range) | público |

Detalle completo en [GALLERY.md](GALLERY.md).

## Operación del negocio (panel)

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/admin/dashboard` (KPIs; las cifras financieras solo con `finance.read`) | `bookings.read` |
| POST | `/admin/bookings/{id}/payments` (monto negativo = reembolso; solo reservas confirmadas) | `finance.write` |
| POST | `/admin/bookings/{id}/staff` · PATCH/DELETE `/admin/staff-assignments/{id}` | `staff.manage` |
| GET/POST | `/admin/staff` · PATCH `/admin/staff/{id}` | `staff.manage` |
| GET/POST | `/admin/inventory` · PATCH `/admin/inventory/{id}` · POST `/admin/inventory/{id}/movements` | `inventory.manage` |
| GET | `/admin/finance?from=&to=` (estado de resultados) | `finance.read` |
| POST | `/admin/expenses` · DELETE `/admin/expenses/{id}?confirm={id}` | `finance.write` |

## Confianza, avisos y disponibilidad

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/site` (contacto y textos institucionales) · `/testimonials?package=` | público |
| POST | `/reviews` (queda en moderación; verificada con código de reserva + correo de un viaje ya realizado) | público, con rate limit |
| GET/POST | `/admin/reviews` · `/admin/reviews/{id}/moderate` | `reviews.moderate` |
| GET/PUT | `/admin/site` | `settings.manage` |
| PUT | `/admin/packages/{id}/availability/range` (rango de fechas + días de la semana; cupo o bloqueo) | `packages.pricing` |
| PATCH | `/admin/packages/{id}/departures/{dep_id}` (cancelar o ajustar una salida) | `packages.pricing` |

Correos automáticos: confirmación al cliente al solicitar, aviso interno a `notify.email` y aviso al cliente cuando la reserva se confirma o cancela. Los envía el worker por SMTP (`MAIL_URL`) con hasta 5 reintentos.

## Seguridad

Contraseñas con Argon2id. JWT HS256 con emisor y expiración (60 min). Permisos por rol, comprobados en cada endpoint. Rate limiting por IP en login y reservas. CORS con lista de orígenes permitidos. Límite de 256 KB por cuerpo de petición y timeout de 30 s. Cabeceras `nosniff`, `X-Frame-Options: DENY` y `Referrer-Policy`. `x-request-id` para trazabilidad. Logs JSON sin el encabezado `Authorization`. Las consultas SQL siempre van parametrizadas. El login tarda lo mismo exista o no el usuario, para no revelar qué correos están registrados.

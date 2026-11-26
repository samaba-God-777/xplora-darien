//! Solicitudes de reserva. Flujo: el visitante envía una solicitud ('received');
//! el equipo verifica disponibilidad antes de confirmarla. Nunca se confirma automáticamente.
pub mod pricing;

use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use chrono::{Datelike, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;
use validator::Validate;

use crate::{
    audit,
    auth::AuthUser,
    errors::{AppError, AppResult},
    state::AppState,
};
use pricing::{Breakdown, PriceRow};

#[derive(Deserialize, Validate, ToSchema)]
pub struct VisitorInput {
    #[validate(length(min = 1, max = 80))]
    pub first_name: String,
    #[validate(length(min = 1, max = 80))]
    pub last_name: String,
    #[validate(email, length(max = 254))]
    pub email: String,
    #[validate(length(min = 6, max = 30))]
    pub phone: String,
    /// ISO 3166-1 alfa-2, p.ej. PA
    #[validate(custom(function = "crate::validation::country"))]
    pub country: String,
}

#[derive(Serialize, Deserialize, Validate, ToSchema)]
pub struct ServiceRequest {
    #[validate(length(min = 2, max = 200))]
    pub description: String,
    #[validate(range(min = 1, max = 50))]
    pub quantity: i16,
}

#[derive(Deserialize, Validate, ToSchema)]
pub struct BookingRequest {
    /// Slug del paquete (paso 1).
    pub package: String,
    /// Fecha de viaje (paso 2).
    #[schema(value_type = String, example = "2027-02-10")]
    pub travel_date: NaiveDate,
    /// Salida programada, si el paquete las tiene.
    pub departure_id: Option<Uuid>,
    /// Participantes (paso 3).
    #[validate(range(min = 1, max = 60))]
    pub adults: i16,
    #[serde(default)]
    #[validate(range(min = 0, max = 60))]
    pub children: i16,
    /// Datos del visitante (paso 4).
    #[validate(nested)]
    pub visitor: VisitorInput,
    /// Servicios adicionales (paso 5); se cotizan aparte.
    #[serde(default)]
    #[validate(nested, length(max = 10))]
    pub services: Vec<ServiceRequest>,
    #[validate(length(max = 2000))]
    pub notes: Option<String>,
    #[serde(default = "default_locale")]
    pub locale: String,
}

fn default_locale() -> String {
    "es".into()
}

#[derive(Serialize, ToSchema)]
pub struct BookingCreated {
    pub code: String,
    pub status: String,
    pub package: Value,
    #[schema(value_type = String)]
    pub travel_date: NaiveDate,
    pub adults: i16,
    pub children: i16,
    pub price: Breakdown,
    pub itinerary: Value,
    pub message: String,
}

struct PackageInfo {
    id: Uuid,
    code: String,
    name: String,
    currency: String,
    tax_rate: Decimal,
    min_participants: i16,
    max_capacity: Option<i16>,
    min_age: Option<i16>,
    days: i16,
    nights: i16,
}

async fn load_package(db: &sqlx::PgPool, slug: &str) -> AppResult<PackageInfo> {
    let r: Option<(Uuid, String, String, String, Decimal, i16, Option<i16>, Option<i16>, i16, i16)> = sqlx::query_as(
        "SELECT id, code, name, currency::text, tax_rate, min_participants, max_capacity, min_age, days, nights
         FROM tour_packages WHERE slug = $1 AND status = 'published' AND deleted_at IS NULL",
    )
    .bind(slug)
    .fetch_optional(db)
    .await?;
    let r = r.ok_or(AppError::NotFound("paquete"))?;
    Ok(PackageInfo {
        id: r.0, code: r.1, name: r.2, currency: r.3, tax_rate: r.4, min_participants: r.5,
        max_capacity: r.6, min_age: r.7, days: r.8, nights: r.9,
    })
}

async fn prices_for(db: &sqlx::PgPool, package_id: Uuid, date: NaiveDate) -> AppResult<Vec<PriceRow>> {
    // Precios vigentes para la fecha: generales y los de la temporada que cubre la fecha.
    let rows: Vec<(String, Decimal, Option<i16>, Decimal, bool)> = sqlx::query_as(
        "SELECT price_type::text, amount, min_group_size, discount_pct, season_id IS NOT NULL FROM package_prices
         WHERE package_id = $1 AND is_active AND valid_from <= $2 AND (valid_to IS NULL OR valid_to >= $2)
           AND (season_id IS NULL OR season_covers(season_id, $2))",
    )
    .bind(package_id)
    .bind(date)
    .fetch_all(db)
    .await?;
    // Si hay precio de temporada para esa fecha, reemplaza al general.
    let seasonal = rows.iter().any(|r| r.4);
    Ok(rows
        .into_iter()
        .filter(|r| !seasonal || r.4)
        .map(|(price_type, amount, min_group_size, discount_pct, _)| PriceRow { price_type, amount, min_group_size, discount_pct })
        .collect())
}

fn check_participants(p: &PackageInfo, adults: i16, children: i16) -> AppResult<()> {
    let n = adults + children;
    if n < p.min_participants {
        return Err(AppError::Unprocessable(format!("mínimo {} participantes", p.min_participants)));
    }
    if let Some(max) = p.max_capacity
        && n > max
    {
        return Err(AppError::Unprocessable(format!("capacidad máxima {max} participantes")));
    }
    Ok(())
}

#[derive(Deserialize, IntoParams)]
pub struct PreviewQuery {
    pub package: String,
    pub travel_date: NaiveDate,
    pub adults: i16,
    #[serde(default)]
    pub children: i16,
}

/// Paso 6: consultar el precio total antes de enviar.
#[utoipa::path(get, path = "/api/v1/bookings/price", tag = "bookings", params(PreviewQuery),
    responses((status = 200, body = Breakdown), (status = 422, body = crate::errors::ErrorBody)))]
pub async fn price_preview(State(state): State<AppState>, Query(q): Query<PreviewQuery>) -> AppResult<Json<Breakdown>> {
    if q.adults < 1 || q.children < 0 {
        return Err(AppError::BadRequest("participantes inválidos".into()));
    }
    let p = load_package(&state.db, &q.package).await?;
    check_participants(&p, q.adults, q.children)?;
    let prices = prices_for(&state.db, p.id, q.travel_date).await?;
    Ok(Json(pricing::calculate(&prices, q.adults, q.children, p.tax_rate, &p.currency)))
}

/// Paso 7: enviar solicitud de reserva. Devuelve código, resumen, itinerario y precio.
#[utoipa::path(post, path = "/api/v1/bookings", tag = "bookings", request_body = BookingRequest,
    responses((status = 201, body = BookingCreated), (status = 422, body = crate::errors::ErrorBody)))]
pub async fn create(State(state): State<AppState>, headers: HeaderMap, Json(b): Json<BookingRequest>) -> AppResult<(StatusCode, Json<BookingCreated>)> {
    b.validate()?;
    if b.travel_date <= Utc::now().date_naive() {
        return Err(AppError::Unprocessable("la fecha de viaje debe ser futura".into()));
    }
    let p = load_package(&state.db, &b.package).await?;
    check_participants(&p, b.adults, b.children)?;
    if let Some(dep) = b.departure_id {
        let ok: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM package_departures WHERE id = $1 AND package_id = $2 AND departure_date = $3 AND status = 'scheduled')",
        )
        .bind(dep).bind(p.id).bind(b.travel_date)
        .fetch_one(&state.db)
        .await?;
        if !ok {
            return Err(AppError::Unprocessable("la salida no corresponde al paquete o fecha".into()));
        }
    }
    let prices = prices_for(&state.db, p.id, b.travel_date).await?;
    let price = pricing::calculate(&prices, b.adults, b.children, p.tax_rate, &p.currency);

    let itinerary: Value = sqlx::query_scalar(
        "SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day_number, 'title', title, 'lodging', lodging, 'meals', meals)
           ORDER BY day_number), '[]') FROM package_itinerary_days WHERE package_id = $1",
    )
    .bind(p.id)
    .fetch_one(&state.db)
    .await?;

    let mut tx = state.db.begin().await?;
    let customer_id: Uuid = sqlx::query_scalar(
        "INSERT INTO customers (first_name, last_name, email, phone, country, locale) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
           phone = EXCLUDED.phone, country = EXCLUDED.country
         RETURNING id",
    )
    .bind(b.visitor.first_name.trim()).bind(b.visitor.last_name.trim()).bind(b.visitor.email.trim())
    .bind(b.visitor.phone.trim()).bind(&b.visitor.country).bind(if b.locale == "en" { "en" } else { "es" })
    .fetch_one(&mut *tx)
    .await?;

    let seq: i64 = sqlx::query_scalar("SELECT nextval('booking_code_seq')").fetch_one(&mut *tx).await?;
    let code = format!("XD-{}-{:06}", Utc::now().year(), seq);
    let snapshot = json!({ "package_code": p.code, "breakdown": price, "prices": prices.iter().map(|r| json!({
        "type": r.price_type, "amount": r.amount.to_string(), "min_group_size": r.min_group_size, "discount_pct": r.discount_pct.to_string()
    })).collect::<Vec<_>>() });

    let booking_id: Uuid = sqlx::query_scalar(
        "INSERT INTO bookings (code, customer_id, package_id, departure_id, travel_date, adults, children, status, currency,
           subtotal, discount_total, tax_total, total, price_snapshot, itinerary_snapshot, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'received',$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id",
    )
    .bind(&code).bind(customer_id).bind(p.id).bind(b.departure_id).bind(b.travel_date).bind(b.adults).bind(b.children)
    .bind(&p.currency).bind(price.subtotal).bind(price.discount_total).bind(price.tax_total).bind(price.total)
    .bind(&snapshot).bind(&itinerary).bind(&b.notes)
    .fetch_one(&mut *tx)
    .await?;

    for s in &b.services {
        sqlx::query("INSERT INTO booking_services (booking_id, description, quantity) VALUES ($1,$2,$3)")
            .bind(booking_id).bind(&s.description).bind(s.quantity)
            .execute(&mut *tx)
            .await?;
    }
    // Avisos por correo (los envía el worker): confirmación al cliente y alerta interna.
    let locale = if b.locale == "en" { "en" } else { "es" };
    let payload = json!({
        "code": code, "name": b.visitor.first_name.trim(), "package": p.name, "date": b.travel_date,
        "people": b.adults + b.children, "priced": price.priced, "currency": p.currency, "total": price.total.to_string(),
        "email": b.visitor.email.trim(), "phone": b.visitor.phone.trim(), "country": b.visitor.country, "notes": b.notes,
    });
    crate::notifications::enqueue(&mut *tx, b.visitor.email.trim(), "booking_received", &payload, Some(booking_id), locale).await?;
    let internal = crate::notifications::setting(&state.db, "notify.email").await;
    if !internal.is_empty() {
        crate::notifications::enqueue(&mut *tx, &internal, "booking_new", &payload, Some(booking_id), "es").await?;
    }
    audit::log(&mut *tx, None, "create", "booking", Some(booking_id.to_string()), Some(json!({"code": code})), &headers).await;
    tx.commit().await?;

    let message = if b.locale == "en" {
        "Request received. Our team will verify availability and contact you to confirm."
    } else {
        "Solicitud recibida. Nuestro equipo verificará la disponibilidad y te contactará para confirmar."
    };
    let _ = p.min_age;
    Ok((
        StatusCode::CREATED,
        Json(BookingCreated {
            code,
            status: "received".into(),
            package: json!({"code": p.code, "name": p.name, "days": p.days, "nights": p.nights}),
            travel_date: b.travel_date,
            adults: b.adults,
            children: b.children,
            price,
            itinerary,
            message: message.into(),
        }),
    ))
}

// ---------------------------------------------------------------- Administración

#[derive(Deserialize, IntoParams)]
pub struct AdminListQuery {
    pub status: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}
fn default_limit() -> i64 {
    50
}

/// Lista de reservas (gestión).
#[utoipa::path(get, path = "/api/v1/admin/bookings", tag = "admin", security(("bearer" = [])), params(AdminListQuery),
    responses((status = 200, body = Vec<Object>)))]
pub async fn admin_list(State(state): State<AppState>, user: AuthUser, Query(q): Query<AdminListQuery>) -> AppResult<Json<Value>> {
    user.require("bookings.read")?;
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT jsonb_build_object('id', b.id, 'code', b.code, 'status', b.status, 'travelDate', b.travel_date,
            'adults', b.adults, 'children', b.children, 'total', b.total::text, 'currency', b.currency,
            'package', p.name, 'customer', c.first_name || ' ' || c.last_name, 'email', c.email, 'createdAt', b.created_at,
            'phone', c.phone, 'paidTotal', (SELECT COALESCE(sum(amount), 0)::text FROM booking_payments bp WHERE bp.booking_id = b.id),
            'staff', (SELECT count(*) FROM staff_assignments a WHERE a.booking_id = b.id))
         FROM bookings b JOIN tour_packages p ON p.id = b.package_id JOIN customers c ON c.id = b.customer_id
         WHERE ($1::text IS NULL OR b.status::text = $1)
         ORDER BY b.created_at DESC LIMIT $2 OFFSET $3",
    )
    .bind(q.status)
    .bind(q.limit.clamp(1, 200))
    .bind(q.offset.max(0))
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Value::Array(rows)))
}

/// Detalle de una reserva con participantes, servicios e historial de estados.
#[utoipa::path(get, path = "/api/v1/admin/bookings/{id}", tag = "admin", security(("bearer" = [])),
    params(("id" = Uuid, Path)), responses((status = 200, body = Object)))]
pub async fn admin_get(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    user.require("bookings.read")?;
    let row: Option<Value> = sqlx::query_scalar(
        "SELECT to_jsonb(b) || jsonb_build_object(
            'customer', (SELECT to_jsonb(c) FROM customers c WHERE c.id = b.customer_id),
            'package', (SELECT jsonb_build_object('code', p.code, 'name', p.name, 'slug', p.slug) FROM tour_packages p WHERE p.id = b.package_id),
            'participants', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM booking_participants x WHERE x.booking_id = b.id), '[]'),
            'services', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM booking_services s WHERE s.booking_id = b.id), '[]'),
            'history', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.changed_at) FROM booking_status_history h WHERE h.booking_id = b.id), '[]'),
            'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', bp.id, 'amount', bp.amount::text, 'method', bp.method,
                'date', bp.paid_on, 'reference', bp.reference) ORDER BY bp.paid_on) FROM booking_payments bp WHERE bp.booking_id = b.id), '[]'),
            'paidTotal', (SELECT COALESCE(sum(amount), 0)::text FROM booking_payments bp WHERE bp.booking_id = b.id),
            'staffAssignments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'staffId', s.id, 'name', s.full_name, 'role', a.role,
                'date', a.work_date, 'days', a.days, 'amount', a.amount::text, 'paid', a.paid) ORDER BY s.full_name)
                FROM staff_assignments a JOIN staff s ON s.id = a.staff_id WHERE a.booking_id = b.id), '[]'))
         FROM bookings b WHERE b.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;
    row.map(Json).ok_or(AppError::NotFound("reserva"))
}

/// Transiciones de estado permitidas.
pub fn transition_allowed(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("received", "pending" | "quoting" | "cancelled")
            | ("pending", "quoting" | "confirmed" | "cancelled")
            | ("quoting", "pending" | "confirmed" | "cancelled")
            | ("confirmed", "paid" | "cancelled")
            | ("paid", "completed" | "cancelled")
    )
}

#[derive(Deserialize, ToSchema)]
pub struct StatusChange {
    /// pending | quoting | confirmed | paid | cancelled | completed
    pub status: String,
    pub note: Option<String>,
}

/// Cambia el estado. Confirmar exige verificar cupo (salida programada o disponibilidad por fecha).
#[utoipa::path(post, path = "/api/v1/admin/bookings/{id}/status", tag = "admin", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = StatusChange,
    responses((status = 204), (status = 409, body = crate::errors::ErrorBody)))]
pub async fn change_status(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<StatusChange>) -> AppResult<StatusCode> {
    user.require("bookings.manage")?;
    let mut tx = state.db.begin().await?;
    let row: Option<(String, Uuid, Option<Uuid>, NaiveDate, i16)> = sqlx::query_as(
        "SELECT status::text, package_id, departure_id, travel_date, adults + children FROM bookings WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let (from, package_id, departure_id, date, people) = row.ok_or(AppError::NotFound("reserva"))?;
    if !transition_allowed(&from, &b.status) {
        return Err(AppError::Conflict(format!("transición no permitida: {from} → {}", b.status)));
    }

    if b.status == "confirmed" {
        if let Some(dep) = departure_id {
            // Reserva de plazas atómica en la salida.
            let n = sqlx::query(
                "UPDATE package_departures SET seats_held = seats_held + $2
                 WHERE id = $1 AND status = 'scheduled' AND seats_held + $2 <= capacity",
            )
            .bind(dep)
            .bind(people)
            .execute(&mut *tx)
            .await?
            .rows_affected();
            if n == 0 {
                return Err(AppError::Conflict("sin cupo en la salida seleccionada".into()));
            }
        } else {
            // Bloquea la fila de disponibilidad para evitar sobreventa concurrente.
            let avail: Option<(i16, bool)> = sqlx::query_as(
                "SELECT capacity, is_blocked FROM package_availability WHERE package_id = $1 AND date = $2 FOR UPDATE",
            )
            .bind(package_id)
            .bind(date)
            .fetch_optional(&mut *tx)
            .await?;
            let Some((capacity, blocked)) = avail else {
                return Err(AppError::Conflict("disponibilidad no verificada para esa fecha".into()));
            };
            let taken: i32 = sqlx::query_scalar("SELECT seats_taken($1, $2)").bind(package_id).bind(date).fetch_one(&mut *tx).await?;
            if blocked || taken + i32::from(people) > i32::from(capacity) {
                return Err(AppError::Conflict("sin cupo para esa fecha".into()));
            }
        }
    }
    if b.status == "cancelled"
        && matches!(from.as_str(), "confirmed" | "paid")
        && let Some(dep) = departure_id
    {
        sqlx::query("UPDATE package_departures SET seats_held = GREATEST(seats_held - $2, 0) WHERE id = $1")
            .bind(dep)
            .bind(people)
            .execute(&mut *tx)
            .await?;
    }

    // Variables de sesión usadas por el trigger de historial.
    sqlx::query("SELECT set_config('app.user_id', $1, true), set_config('app.status_note', $2, true)")
        .bind(user.id().to_string())
        .bind(b.note.clone().unwrap_or_default())
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE bookings SET status = $2::booking_status WHERE id = $1").bind(id).bind(&b.status).execute(&mut *tx).await?;
    if matches!(b.status.as_str(), "confirmed" | "cancelled") {
        let info: (String, String, String, String, NaiveDate, i16, String, String) = sqlx::query_as(
            "SELECT c.email::text, c.first_name, c.locale, p.name, bk.travel_date, bk.adults + bk.children, bk.currency::text, bk.total::text
             FROM bookings bk JOIN customers c ON c.id = bk.customer_id JOIN tour_packages p ON p.id = bk.package_id WHERE bk.id = $1",
        )
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
        let code: String = sqlx::query_scalar("SELECT code FROM bookings WHERE id = $1").bind(id).fetch_one(&mut *tx).await?;
        let payload = json!({"code": code, "name": info.1, "package": info.3, "date": info.4, "people": info.5,
            "priced": info.7 != "0.00", "currency": info.6, "total": info.7, "status": b.status});
        crate::notifications::enqueue(&mut *tx, &info.0, "booking_status", &payload, Some(id), &info.2).await?;
    }
    audit::log(&mut *tx, Some(user.id()), "status_change", "booking", Some(id.to_string()),
        Some(json!({"from": from, "to": b.status, "note": b.note})), &headers).await;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::transition_allowed as t;

    #[test]
    fn cannot_skip_verification() {
        assert!(!t("received", "confirmed"), "una solicitud nueva no se confirma sin revisión");
        assert!(t("received", "pending"));
        assert!(t("pending", "confirmed"));
        assert!(!t("cancelled", "confirmed"));
        assert!(!t("completed", "cancelled"));
        assert!(t("paid", "completed"));
    }
}

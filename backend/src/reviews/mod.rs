//! Opiniones y testimonios. Toda opinión entra como borrador y la publica el equipo.
//! Es "viaje verificado" cuando el código de reserva y el correo coinciden con una reserva ya realizada.
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
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

#[derive(Deserialize, Validate, ToSchema)]
pub struct ReviewInput {
    #[validate(length(min = 2, max = 80))]
    pub name: String,
    #[validate(email, length(max = 254))]
    pub email: String,
    #[validate(range(min = 1, max = 5))]
    pub rating: i16,
    #[validate(length(min = 20, max = 1500))]
    pub body: String,
    #[validate(custom(function = "crate::validation::country"))]
    pub country: Option<String>,
    /// Código de reserva (XD-…) para marcarla como viaje verificado.
    pub booking_code: Option<String>,
    /// Slug del paquete o destino comentado (si no hay reserva).
    pub package: Option<String>,
    #[serde(default = "es")]
    pub locale: String,
}
fn es() -> String {
    "es".into()
}

/// Envía una opinión (queda pendiente de moderación).
#[utoipa::path(post, path = "/api/v1/reviews", tag = "reviews", request_body = ReviewInput, responses((status = 201, body = Object), (status = 409, body = crate::errors::ErrorBody)))]
pub async fn submit(State(state): State<AppState>, headers: HeaderMap, Json(b): Json<ReviewInput>) -> AppResult<(StatusCode, Json<Value>)> {
    b.validate()?;
    let code = b.booking_code.as_deref().map(str::trim).filter(|c| !c.is_empty());
    // Verificación: código + correo del cliente, y que el viaje ya haya ocurrido.
    let booking: Option<(Uuid, Uuid)> = match code {
        Some(c) => sqlx::query_as(
            "SELECT b.id, b.package_id FROM bookings b JOIN customers cu ON cu.id = b.customer_id
             WHERE b.code = $1 AND cu.email = $2 AND b.status IN ('confirmed','paid','completed') AND b.travel_date <= current_date",
        )
        .bind(c)
        .bind(b.email.trim())
        .fetch_optional(&state.db)
        .await?,
        None => None,
    };
    if code.is_some() && booking.is_none() {
        return Err(AppError::Unprocessable(
            "no encontramos un viaje realizado con ese código y correo; puedes enviar tu opinión sin código".into(),
        ));
    }
    let res = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO reviews (author_name, email, rating, body, country, booking_id, package_id, verified, is_testimonial, status, locale)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, (SELECT id FROM tour_packages WHERE slug = $8 AND status = 'published')),
                 $9, true, 'draft', $10) RETURNING id",
    )
    .bind(b.name.trim()).bind(b.email.trim()).bind(b.rating).bind(b.body.trim()).bind(&b.country)
    .bind(booking.map(|x| x.0)).bind(booking.map(|x| x.1)).bind(&b.package).bind(booking.is_some())
    .bind(if b.locale == "en" { "en" } else { "es" })
    .fetch_one(&state.db)
    .await;
    let id = match res {
        Err(sqlx::Error::Database(e)) if e.code().as_deref() == Some("23505") => {
            return Err(AppError::Conflict("ya recibimos una opinión para esa reserva".into()));
        }
        r => r?,
    };
    audit::log(&state.db, None, "create", "review", Some(id.to_string()), Some(json!({"verified": booking.is_some()})), &headers).await;
    Ok((StatusCode::CREATED, Json(json!({ "id": id, "verified": booking.is_some(), "status": "pending_moderation" }))))
}

#[derive(Deserialize, IntoParams)]
pub struct TestimonialQuery {
    pub package: Option<String>,
    #[serde(default = "twelve")]
    pub limit: i64,
}
fn twelve() -> i64 {
    12
}

/// Testimonios publicados (sin correos ni datos privados) y promedio.
#[utoipa::path(get, path = "/api/v1/testimonials", tag = "reviews", params(TestimonialQuery), responses((status = 200, body = Object)))]
pub async fn public_list(State(state): State<AppState>, Query(q): Query<TestimonialQuery>) -> AppResult<Json<Value>> {
    let v: Value = sqlx::query_scalar(
        "WITH r AS (SELECT rv.* FROM reviews rv LEFT JOIN tour_packages p ON p.id = rv.package_id
                    WHERE rv.status = 'published' AND ($1::text IS NULL OR p.slug = $1))
         SELECT jsonb_build_object(
           'count', (SELECT count(*) FROM r),
           'average', (SELECT round(avg(rating)::numeric, 1)::text FROM r),
           'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.author_name, 'country', x.country,
                'rating', x.rating, 'body', x.body, 'verified', x.verified, 'date', x.created_at::date,
                'package', (SELECT jsonb_build_object('slug', p.slug, 'name', p.name) FROM tour_packages p WHERE p.id = x.package_id))
              ORDER BY x.verified DESC, x.created_at DESC)
             FROM (SELECT * FROM r ORDER BY verified DESC, created_at DESC LIMIT $2) x), '[]'))",
    )
    .bind(&q.package)
    .bind(q.limit.clamp(1, 50))
    .fetch_one(&state.db)
    .await?;
    Ok(Json(v))
}

#[derive(Deserialize, IntoParams)]
pub struct AdminReviewQuery {
    /// draft | published | archived
    pub status: Option<String>,
}

/// Opiniones para moderar.
#[utoipa::path(get, path = "/api/v1/admin/reviews", tag = "reviews", security(("bearer" = [])), params(AdminReviewQuery), responses((status = 200, body = Vec<Object>)))]
pub async fn admin_list(State(state): State<AppState>, user: AuthUser, Query(q): Query<AdminReviewQuery>) -> AppResult<Json<Value>> {
    user.require("reviews.moderate")?;
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT jsonb_build_object('id', r.id, 'name', r.author_name, 'email', r.email, 'country', r.country, 'rating', r.rating,
            'body', r.body, 'verified', r.verified, 'status', r.status, 'createdAt', r.created_at,
            'booking', (SELECT code FROM bookings b WHERE b.id = r.booking_id),
            'package', (SELECT name FROM tour_packages p WHERE p.id = r.package_id))
         FROM reviews r WHERE ($1::text IS NULL OR r.status::text = $1) ORDER BY r.created_at DESC LIMIT 200",
    )
    .bind(q.status)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Value::Array(rows)))
}

#[derive(Deserialize, ToSchema)]
pub struct ModerateInput {
    /// published | archived (rechazada/retirada) | draft
    pub status: String,
}

/// Publica o rechaza una opinión.
#[utoipa::path(post, path = "/api/v1/admin/reviews/{id}/moderate", tag = "reviews", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = ModerateInput, responses((status = 204)))]
pub async fn moderate(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<ModerateInput>) -> AppResult<StatusCode> {
    user.require("reviews.moderate")?;
    if !["published", "archived", "draft"].contains(&b.status.as_str()) {
        return Err(AppError::BadRequest("estado inválido".into()));
    }
    let n = sqlx::query("UPDATE reviews SET status = $2::publish_status, moderated_by = $3, moderated_at = now() WHERE id = $1")
        .bind(id).bind(&b.status).bind(user.id())
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("opinión"));
    }
    audit::log(&state.db, Some(user.id()), "moderate", "review", Some(id.to_string()), Some(json!({"status": b.status})), &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

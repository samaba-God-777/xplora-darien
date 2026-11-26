//! Paquetes turísticos: catálogo, detalle con itinerario, comparador y administración.
//! Precios y disponibilidad SIEMPRE los introduce el administrador (no hay valores por defecto).
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use chrono::{NaiveDate, NaiveTime};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::{Value, json};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;
use validator::Validate;

use crate::{
    audit,
    auth::AuthUser,
    destinations::{Created, PublishInput, lang},
    errors::{AppError, AppResult},
    state::AppState,
};

/// Fragmento SQL que construye la ficha de un paquete (p = tour_packages, $L = idioma).
fn package_json(l: &str) -> String {
    format!(
        r#"jsonb_build_object(
      'id', p.id, 'code', p.code, 'slug', p.slug,
      'name', tr('package', p.id::text, {l}, 'name', p.name),
      'type', p.package_type,
      'shortDescription', tr('package', p.id::text, {l}, 'short_description', p.short_description),
      'description', tr('package', p.id::text, {l}, 'description', p.description),
      'days', p.days, 'nights', p.nights, 'difficulty', p.difficulty,
      'minAge', p.min_age, 'minParticipants', p.min_participants, 'maxCapacity', p.max_capacity,
      'currency', p.currency, 'taxRate', p.tax_rate, 'feesNote', tr('package', p.id::text, {l}, 'fees_note', p.fees_note), 'paymentTerms', tr('package', p.id::text, {l}, 'payment_terms', p.payment_terms),
      'cancellationPolicy', tr('package', p.id::text, {l}, 'cancellation_policy', p.cancellation_policy), 'packingList', tr('package', p.id::text, {l}, 'packing_list', p.packing_list),
      'weatherNotes', tr('package', p.id::text, {l}, 'weather_notes', p.weather_notes), 'specialRequirements', tr('package', p.id::text, {l}, 'special_requirements', p.special_requirements),
      'featured', p.is_featured, 'promotion', p.is_promotion,
      'distanceKm', p.distance_km, 'accessNote', tr('package', p.id::text, {l}, 'access_note', p.access_note),
      -- Próximas fechas abiertas con cupo (las primeras 12 en los próximos 6 meses).
      'availableDates', COALESCE((SELECT jsonb_agg(jsonb_build_object('date', x.date, 'seatsLeft', x.left) ORDER BY x.date)
          FROM (SELECT a.date, a.capacity - seats_taken(p.id, a.date) AS left FROM package_availability a
                WHERE a.package_id = p.id AND NOT a.is_blocked AND a.date > current_date AND a.date < current_date + 183
                  AND a.capacity - seats_taken(p.id, a.date) > 0 ORDER BY a.date LIMIT 12) x), '[]'),
      'destinations', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', d.slug, 'name', tr('destination', d.id::text, {l}, 'name', d.name),
            'coords', jsonb_build_array(d.latitude, d.longitude)) ORDER BY pd.sort_order)
          FROM package_destinations pd JOIN destinations d ON d.id = pd.destination_id
          WHERE pd.package_id = p.id AND d.deleted_at IS NULL), '[]'),
      'media', COALESCE((SELECT jsonb_agg(m.path ORDER BY pm.is_cover DESC, pm.sort_order)
          FROM media_packages pm JOIN media_assets m ON m.id = pm.media_id WHERE pm.package_id = p.id AND m.status = 'published'
            AND m.deleted_at IS NULL AND m.content_type = 'photo'),
        -- Sin fotos: portada de los videos publicados del destino principal (igual que el mapa)
        (SELECT jsonb_agg(COALESCE(m.poster_path, pp.path) ORDER BY dm.sort_order)
          FROM package_destinations pd JOIN media_destinations dm ON dm.destination_id = pd.destination_id
          JOIN media_assets m ON m.id = dm.media_id LEFT JOIN media_assets pp ON pp.id = m.poster_media_id
          WHERE pd.package_id = p.id AND pd.sort_order = 0 AND m.kind = 'video' AND dm.attribution <> 'editorial_guess'
            AND m.status = 'published' AND m.deleted_at IS NULL AND COALESCE(m.poster_path, pp.path) IS NOT NULL),
        '[]'),
      'inclusions', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', i.kind, 'description', tr('package', p.id::text || ':inc:' || i.sort_order, {l}, 'description', i.description)) ORDER BY i.sort_order)
          FROM package_inclusions i WHERE i.package_id = p.id), '[]'),
      'exclusions', COALESCE((SELECT jsonb_agg(tr('package', p.id::text || ':exc:' || e.sort_order, {l}, 'description', e.description) ORDER BY e.sort_order)
          FROM package_exclusions e WHERE e.package_id = p.id), '[]'),
      'prices', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'type', pr.price_type, 'amount', pr.amount::text,
            'minGroupSize', pr.min_group_size, 'discountPct', pr.discount_pct::text,
            'validFrom', pr.valid_from, 'validTo', pr.valid_to,
            'season', (SELECT jsonb_build_object('key', se.key, 'name', se.name, 'start', se.start_md, 'end', se.end_md)
                       FROM seasons se WHERE se.id = pr.season_id),
            'appliesToday', pr.season_id IS NULL OR season_covers(pr.season_id, current_date))
            ORDER BY pr.season_id NULLS FIRST, pr.price_type)
          FROM package_prices pr WHERE pr.package_id = p.id AND pr.is_active
            AND (pr.valid_to IS NULL OR pr.valid_to >= current_date)), '[]'),
      'departures', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', dp.id, 'departureDate', dp.departure_date,
            'returnDate', dp.return_date, 'meetingTime', dp.meeting_time, 'meetingPoint', dp.meeting_point,
            'seatsAvailable', dp.capacity - dp.seats_held) ORDER BY dp.departure_date)
          FROM package_departures dp WHERE dp.package_id = p.id AND dp.status = 'scheduled'
            AND dp.departure_date >= current_date), '[]'),
      'itinerary', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', dy.day_number, 'title', tr('package', p.id::text || ':day:' || dy.day_number, {l}, 'title', dy.title),
            'description', tr('package', p.id::text || ':day:' || dy.day_number, {l}, 'description', dy.description), 'transport', tr('package', p.id::text || ':day:' || dy.day_number, {l}, 'transport', dy.transport),
            'meals', tr('package', p.id::text || ':day:' || dy.day_number, {l}, 'meals', dy.meals), 'lodging', tr('package', p.id::text || ':day:' || dy.day_number, {l}, 'lodging', dy.lodging),
            'recommendations', dy.recommendations,
            'guide', (SELECT g.full_name FROM guides g WHERE g.id = dy.guide_id AND g.status = 'published'),
            'activities', COALESCE((SELECT jsonb_agg(jsonb_build_object('start', a.start_time, 'end', a.end_time,
                 'title', a.title, 'description', a.description,
                 'destination', (SELECT d.slug FROM destinations d WHERE d.id = a.destination_id)) ORDER BY a.sort_order, a.start_time)
               FROM package_itinerary_activities a WHERE a.day_id = dy.id), '[]')) ORDER BY dy.day_number)
          FROM package_itinerary_days dy WHERE dy.package_id = p.id), '[]')
    )"#
    )
}

#[derive(Deserialize, IntoParams)]
pub struct PackageQuery {
    pub lang: Option<String>,
    /// Tipo de paquete (day_trip, weekend…).
    #[serde(rename = "type")]
    pub package_type: Option<String>,
    pub featured: Option<bool>,
}

/// Paquetes publicados.
#[utoipa::path(get, path = "/api/v1/packages", tag = "packages", params(PackageQuery), responses((status = 200, body = Vec<Object>)))]
pub async fn list(State(state): State<AppState>, Query(q): Query<PackageQuery>) -> AppResult<Json<Value>> {
    let sql = format!(
        "SELECT {} FROM tour_packages p
         WHERE p.status = 'published' AND p.deleted_at IS NULL
           AND ($2::text IS NULL OR p.package_type::text = $2)
           AND ($3::boolean IS NULL OR p.is_featured = $3)
         ORDER BY p.distance_km NULLS LAST, p.days, p.name",
        package_json("$1")
    );
    let rows: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(lang(&q.lang))
        .bind(q.package_type)
        .bind(q.featured)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(Value::Array(rows)))
}

/// Detalle completo de un paquete publicado (itinerario, incluye/no incluye, precios vigentes, salidas).
#[utoipa::path(get, path = "/api/v1/packages/{slug}", tag = "packages", params(("slug" = String, Path), PackageQuery),
    responses((status = 200, body = Object), (status = 404, body = crate::errors::ErrorBody)))]
pub async fn get(State(state): State<AppState>, Path(slug): Path<String>, Query(q): Query<PackageQuery>) -> AppResult<Json<Value>> {
    let sql = format!(
        "SELECT {} FROM tour_packages p WHERE p.slug = $2 AND p.status = 'published' AND p.deleted_at IS NULL",
        package_json("$1")
    );
    let row: Option<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(lang(&q.lang)).bind(&slug).fetch_optional(&state.db).await?;
    row.map(Json).ok_or(AppError::NotFound("paquete"))
}

#[derive(Deserialize, IntoParams)]
pub struct CompareQuery {
    /// Slugs separados por coma (máximo 3).
    pub slugs: String,
    pub lang: Option<String>,
}

/// Compara hasta tres paquetes publicados.
#[utoipa::path(get, path = "/api/v1/packages/compare", tag = "packages", params(CompareQuery),
    responses((status = 200, body = Vec<Object>), (status = 400, body = crate::errors::ErrorBody)))]
pub async fn compare(State(state): State<AppState>, Query(q): Query<CompareQuery>) -> AppResult<Json<Value>> {
    let slugs: Vec<String> = q.slugs.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
    if slugs.len() < 2 || slugs.len() > 3 {
        return Err(AppError::BadRequest("se pueden comparar entre 2 y 3 paquetes".into()));
    }
    let sql = format!(
        "SELECT {} FROM tour_packages p
         WHERE p.slug = ANY($2) AND p.status = 'published' AND p.deleted_at IS NULL
         ORDER BY array_position($2, p.slug)",
        package_json("$1")
    );
    let rows: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(lang(&q.lang)).bind(&slugs).fetch_all(&state.db).await?;
    if rows.len() != slugs.len() {
        return Err(AppError::NotFound("paquete"));
    }
    Ok(Json(Value::Array(rows)))
}

// ---------------------------------------------------------------- Administración

#[derive(Deserialize, Validate, ToSchema)]
pub struct PackageInput {
    #[validate(length(min = 3, max = 20))]
    pub code: String,
    #[validate(length(min = 2, max = 80), custom(function = "crate::validation::slug"))]
    pub slug: String,
    #[validate(length(min = 3, max = 150))]
    pub name: String,
    #[schema(example = "two_days_one_night")]
    pub package_type: String,
    #[validate(length(min = 10, max = 400))]
    pub short_description: String,
    #[validate(length(min = 20))]
    pub description: String,
    #[validate(range(min = 1, max = 30))]
    pub days: i16,
    #[validate(range(min = 0, max = 29))]
    pub nights: i16,
    pub difficulty: String,
    pub min_age: Option<i16>,
    #[validate(range(min = 1))]
    pub min_participants: i16,
    pub max_capacity: Option<i16>,
    #[validate(length(equal = 3))]
    pub currency: String,
    #[schema(value_type = String, example = "0.07")]
    pub tax_rate: Decimal,
    pub fees_note: Option<String>,
    pub payment_terms: Option<String>,
    pub cancellation_policy: Option<String>,
    pub packing_list: Option<String>,
    pub weather_notes: Option<String>,
    pub special_requirements: Option<String>,
    #[serde(default)]
    pub destinations: Vec<String>,
    #[serde(default)]
    #[validate(nested)]
    pub itinerary: Vec<ItineraryDayInput>,
    #[serde(default)]
    pub inclusions: Vec<InclusionInput>,
    #[serde(default)]
    pub exclusions: Vec<String>,
}

#[derive(Deserialize, Validate, ToSchema)]
pub struct ItineraryDayInput {
    #[validate(range(min = 1))]
    pub day: i16,
    #[validate(length(min = 2))]
    pub title: String,
    pub description: Option<String>,
    pub transport: Option<String>,
    pub meals: Option<String>,
    pub lodging: Option<String>,
    pub recommendations: Option<String>,
    #[serde(default)]
    pub activities: Vec<ItineraryActivityInput>,
}

#[derive(Deserialize, ToSchema)]
pub struct ItineraryActivityInput {
    #[schema(value_type = Option<String>, example = "08:00")]
    pub start: Option<NaiveTime>,
    #[schema(value_type = Option<String>)]
    pub end: Option<NaiveTime>,
    pub title: String,
    pub description: Option<String>,
    pub destination: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct InclusionInput {
    pub kind: String,
    pub description: String,
}

/// Crea un paquete en borrador con destinos, itinerario, incluye y no incluye.
#[utoipa::path(post, path = "/api/v1/admin/packages", tag = "admin", security(("bearer" = [])),
    request_body = PackageInput, responses((status = 201, body = Created)))]
pub async fn create(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Json(b): Json<PackageInput>) -> AppResult<(StatusCode, Json<Created>)> {
    user.require("packages.write")?;
    b.validate()?;
    if b.nights >= b.days {
        return Err(AppError::BadRequest("las noches deben ser menos que los días".into()));
    }
    if b.itinerary.iter().any(|d| d.day > b.days) {
        return Err(AppError::BadRequest("el itinerario tiene días fuera de la duración".into()));
    }
    let mut tx = state.db.begin().await?;
    let id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO tour_packages (code, slug, name, package_type, short_description, description, days, nights,
             difficulty, min_age, min_participants, max_capacity, currency, tax_rate, fees_note, payment_terms,
             cancellation_policy, packing_list, weather_notes, special_requirements, created_by)
           VALUES ($1,$2,$3,$4::package_type,$5,$6,$7,$8,$9::difficulty_level,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
           RETURNING id"#,
    )
    .bind(b.code.to_uppercase()).bind(&b.slug).bind(&b.name).bind(&b.package_type).bind(&b.short_description)
    .bind(&b.description).bind(b.days).bind(b.nights).bind(&b.difficulty).bind(b.min_age).bind(b.min_participants)
    .bind(b.max_capacity).bind(b.currency.to_uppercase()).bind(b.tax_rate).bind(&b.fees_note).bind(&b.payment_terms)
    .bind(&b.cancellation_policy).bind(&b.packing_list).bind(&b.weather_notes).bind(&b.special_requirements)
    .bind(user.id())
    .fetch_one(&mut *tx)
    .await?;

    let n = sqlx::query(
        "INSERT INTO package_destinations (package_id, destination_id, sort_order)
         SELECT $1, d.id, k.ord - 1 FROM unnest($2::text[]) WITH ORDINALITY k(slug, ord)
         JOIN destinations d ON d.slug = k.slug AND d.deleted_at IS NULL",
    )
    .bind(id)
    .bind(&b.destinations)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if n as usize != b.destinations.len() {
        return Err(AppError::BadRequest("destino desconocido".into()));
    }

    for day in &b.itinerary {
        let day_id: Uuid = sqlx::query_scalar(
            "INSERT INTO package_itinerary_days (package_id, day_number, title, description, transport, meals, lodging, recommendations)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
        )
        .bind(id).bind(day.day).bind(&day.title).bind(&day.description).bind(&day.transport)
        .bind(&day.meals).bind(&day.lodging).bind(&day.recommendations)
        .fetch_one(&mut *tx)
        .await?;
        for (i, a) in day.activities.iter().enumerate() {
            sqlx::query(
                "INSERT INTO package_itinerary_activities (day_id, start_time, end_time, title, description, destination_id, sort_order)
                 VALUES ($1,$2,$3,$4,$5,(SELECT id FROM destinations WHERE slug = $6),$7)",
            )
            .bind(day_id).bind(a.start).bind(a.end).bind(&a.title).bind(&a.description).bind(&a.destination).bind(i as i16)
            .execute(&mut *tx)
            .await?;
        }
    }
    for (i, inc) in b.inclusions.iter().enumerate() {
        sqlx::query("INSERT INTO package_inclusions (package_id, kind, description, sort_order) VALUES ($1,$2,$3,$4)")
            .bind(id).bind(&inc.kind).bind(&inc.description).bind(i as i16)
            .execute(&mut *tx)
            .await?;
    }
    for (i, exc) in b.exclusions.iter().enumerate() {
        sqlx::query("INSERT INTO package_exclusions (package_id, description, sort_order) VALUES ($1,$2,$3)")
            .bind(id).bind(exc).bind(i as i16)
            .execute(&mut *tx)
            .await?;
    }
    audit::log(&mut *tx, Some(user.id()), "create", "package", Some(id.to_string()), Some(json!({"code": b.code})), &headers).await;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(Created { id })))
}

#[derive(Deserialize, Validate, ToSchema)]
pub struct PriceInput {
    /// per_person | adult | child | group | special
    pub price_type: String,
    #[schema(value_type = String, example = "120.00")]
    pub amount: Decimal,
    pub min_group_size: Option<i16>,
    #[serde(default)]
    #[schema(value_type = String, example = "0")]
    pub discount_pct: Decimal,
    #[schema(value_type = Option<String>)]
    pub valid_from: Option<NaiveDate>,
    #[schema(value_type = Option<String>)]
    pub valid_to: Option<NaiveDate>,
    /// Clave de temporada (alta, baja…). Sin temporada = precio general.
    pub season: Option<String>,
}

/// Agrega un precio verificado por el administrador (queda en el historial).
#[utoipa::path(post, path = "/api/v1/admin/packages/{id}/prices", tag = "admin", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = PriceInput, responses((status = 201, body = Created)))]
pub async fn add_price(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<PriceInput>) -> AppResult<(StatusCode, Json<Created>)> {
    user.require("packages.pricing")?;
    if b.amount.is_sign_negative() {
        return Err(AppError::BadRequest("el precio no puede ser negativo".into()));
    }
    let price_id: Uuid = sqlx::query_scalar(
        "INSERT INTO package_prices (package_id, price_type, amount, min_group_size, discount_pct, valid_from, valid_to, verified_by, season_id)
         VALUES ($1, $2::price_type, $3, $4, $5, COALESCE($6, current_date), $7, $8,
                 CASE WHEN $9::text IS NULL THEN NULL
                      ELSE COALESCE((SELECT id FROM seasons WHERE key = $9), -1::smallint) END) RETURNING id",
    )
    .bind(id).bind(&b.price_type).bind(b.amount).bind(b.min_group_size).bind(b.discount_pct)
    .bind(b.valid_from).bind(b.valid_to).bind(user.id()).bind(&b.season)
    .fetch_one(&state.db)
    .await?;
    audit::log(&state.db, Some(user.id()), "create", "package_price", Some(price_id.to_string()),
        Some(json!({"package_id": id, "type": b.price_type, "amount": b.amount.to_string()})), &headers).await;
    Ok((StatusCode::CREATED, Json(Created { id: price_id })))
}

#[derive(Deserialize, ToSchema)]
pub struct DepartureInput {
    #[schema(value_type = String, example = "2027-01-15")]
    pub departure_date: NaiveDate,
    #[schema(value_type = String)]
    pub return_date: NaiveDate,
    #[schema(value_type = Option<String>)]
    pub meeting_time: Option<NaiveTime>,
    pub meeting_point: Option<String>,
    pub capacity: i16,
}

/// Programa una salida con cupo.
#[utoipa::path(post, path = "/api/v1/admin/packages/{id}/departures", tag = "admin", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = DepartureInput, responses((status = 201, body = Created)))]
pub async fn add_departure(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<DepartureInput>) -> AppResult<(StatusCode, Json<Created>)> {
    user.require("packages.pricing")?;
    let dep_id: Uuid = sqlx::query_scalar(
        "INSERT INTO package_departures (package_id, departure_date, return_date, meeting_time, meeting_point, capacity)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    )
    .bind(id).bind(b.departure_date).bind(b.return_date).bind(b.meeting_time).bind(&b.meeting_point).bind(b.capacity)
    .fetch_one(&state.db)
    .await?;
    audit::log(&state.db, Some(user.id()), "create", "package_departure", Some(dep_id.to_string()), None, &headers).await;
    Ok((StatusCode::CREATED, Json(Created { id: dep_id })))
}

#[derive(Deserialize, ToSchema)]
pub struct AvailabilityInput {
    #[schema(value_type = String)]
    pub date: NaiveDate,
    pub capacity: i16,
    #[serde(default)]
    pub is_blocked: bool,
    pub note: Option<String>,
}

/// Define disponibilidad por fecha (paquetes privados o personalizados sin salidas fijas).
#[utoipa::path(put, path = "/api/v1/admin/packages/{id}/availability", tag = "admin", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = AvailabilityInput, responses((status = 204)))]
pub async fn set_availability(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<AvailabilityInput>) -> AppResult<StatusCode> {
    user.require("packages.pricing")?;
    sqlx::query(
        "INSERT INTO package_availability (package_id, date, capacity, is_blocked, note) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (package_id, date) DO UPDATE SET capacity = EXCLUDED.capacity, is_blocked = EXCLUDED.is_blocked, note = EXCLUDED.note",
    )
    .bind(id).bind(b.date).bind(b.capacity).bind(b.is_blocked).bind(&b.note)
    .execute(&state.db)
    .await?;
    audit::log(&state.db, Some(user.id()), "update", "package_availability", Some(id.to_string()),
        Some(json!({"date": b.date, "capacity": b.capacity, "blocked": b.is_blocked})), &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

/// Publica, despublica o destaca un paquete. No se puede publicar sin al menos un precio vigente.
#[utoipa::path(post, path = "/api/v1/admin/packages/{id}/publish", tag = "admin", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = PublishInput, responses((status = 204), (status = 422, body = crate::errors::ErrorBody)))]
pub async fn publish(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<PublishInput>) -> AppResult<StatusCode> {
    user.require("packages.publish")?;
    if b.status.as_deref() == Some("published") {
        let has_price: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM package_prices WHERE package_id = $1 AND is_active
               AND (valid_to IS NULL OR valid_to >= current_date))",
        )
        .bind(id)
        .fetch_one(&state.db)
        .await?;
        let is_custom: bool = sqlx::query_scalar("SELECT package_type IN ('custom','private') FROM tour_packages WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?
            .ok_or(AppError::NotFound("paquete"))?;
        if !has_price && !is_custom {
            return Err(AppError::Unprocessable("el paquete necesita un precio verificado antes de publicarse".into()));
        }
    }
    let n = sqlx::query(
        "UPDATE tour_packages SET status = COALESCE($2::publish_status, status), is_featured = COALESCE($3, is_featured)
         WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(&b.status)
    .bind(b.is_featured)
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("paquete"));
    }
    audit::log(&state.db, Some(user.id()), "publish", "package", Some(id.to_string()),
        Some(json!({"status": b.status, "is_featured": b.is_featured})), &headers).await;
    Ok(StatusCode::NO_CONTENT)
}


// ---------------------------------------------------------------- Temporadas y gestión de precios

/// Temporadas (públicas: el sitio muestra los precios por temporada).
#[utoipa::path(get, path = "/api/v1/seasons", tag = "packages", responses((status = 200, body = Vec<Object>)))]
pub async fn seasons(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT jsonb_build_object('key', key, 'name', name, 'description', description, 'start', start_md, 'end', end_md,
            'current', season_covers(id, current_date)) FROM seasons WHERE is_active ORDER BY sort_order",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Value::Array(rows)))
}

#[derive(Deserialize, ToSchema)]
pub struct SeasonInput {
    pub name: String,
    pub description: Option<String>,
    /// MM-DD
    pub start: String,
    /// MM-DD
    pub end: String,
}

/// Ajusta nombre y fechas de una temporada.
#[utoipa::path(put, path = "/api/v1/admin/seasons/{key}", tag = "admin", security(("bearer" = [])),
    params(("key" = String, Path)), request_body = SeasonInput, responses((status = 204)))]
pub async fn update_season(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(key): Path<String>, Json(b): Json<SeasonInput>) -> AppResult<StatusCode> {
    user.require("seasons.manage")?;
    let valid = |md: &str| chrono::NaiveDate::parse_from_str(&format!("2024-{md}"), "%Y-%m-%d").is_ok() && md.len() == 5;
    if !valid(&b.start) || !valid(&b.end) {
        return Err(AppError::BadRequest("fechas en formato MM-DD".into()));
    }
    let n = sqlx::query("UPDATE seasons SET name = $2, description = $3, start_md = $4, end_md = $5 WHERE key = $1")
        .bind(&key).bind(&b.name).bind(&b.description).bind(&b.start).bind(&b.end)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("temporada"));
    }
    audit::log(&state.db, Some(user.id()), "update", "season", Some(key), Some(json!({"start": b.start, "end": b.end})), &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

/// Todos los paquetes (incluye borradores) para el panel.
#[utoipa::path(get, path = "/api/v1/admin/packages", tag = "admin", security(("bearer" = [])), responses((status = 200, body = Vec<Object>)))]
pub async fn admin_list(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    if user.require("packages.write").is_err() {
        user.require("packages.pricing")?;
    }
    let sql = format!(
        "SELECT {} || jsonb_build_object('status', p.status, 'updatedAt', p.updated_at,
            'availability', COALESCE((SELECT jsonb_agg(jsonb_build_object('date', a.date, 'capacity', a.capacity, 'blocked', a.is_blocked,
                'note', a.note, 'taken', seats_taken(p.id, a.date)) ORDER BY a.date)
              FROM package_availability a WHERE a.package_id = p.id AND a.date >= current_date AND a.date < current_date + 180), '[]'),
            'priceHistory', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', h.price_type, 'old', h.old_amount::text, 'new', h.new_amount::text,
                'season', (SELECT key FROM seasons WHERE id = h.season_id), 'operation', h.operation, 'at', h.changed_at) ORDER BY h.changed_at DESC)
              FROM (SELECT * FROM package_price_history WHERE package_id = p.id ORDER BY changed_at DESC LIMIT 10) h), '[]'))
         FROM tour_packages p WHERE p.deleted_at IS NULL ORDER BY p.distance_km NULLS LAST, p.days, p.name",
        package_json("'es'")
    );
    let rows: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).fetch_all(&state.db).await?;
    Ok(Json(Value::Array(rows)))
}

#[derive(Deserialize, ToSchema)]
pub struct PriceUpdate {
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
    #[schema(value_type = Option<String>)]
    pub discount_pct: Option<Decimal>,
    pub is_active: Option<bool>,
}

/// Modifica un precio (queda registrado en el historial de precios).
#[utoipa::path(patch, path = "/api/v1/admin/packages/{id}/prices/{price_id}", tag = "admin", security(("bearer" = [])),
    params(("id" = Uuid, Path), ("price_id" = Uuid, Path)), request_body = PriceUpdate, responses((status = 204)))]
pub async fn update_price(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path((id, price_id)): Path<(Uuid, Uuid)>, Json(b): Json<PriceUpdate>) -> AppResult<StatusCode> {
    user.require("packages.pricing")?;
    if b.amount.is_some_and(|a| a.is_sign_negative()) {
        return Err(AppError::BadRequest("el precio no puede ser negativo".into()));
    }
    let n = sqlx::query(
        "UPDATE package_prices SET amount = COALESCE($3, amount), discount_pct = COALESCE($4, discount_pct),
           is_active = COALESCE($5, is_active), verified_by = $6 WHERE id = $2 AND package_id = $1",
    )
    .bind(id).bind(price_id).bind(b.amount).bind(b.discount_pct).bind(b.is_active).bind(user.id())
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("precio"));
    }
    audit::log(&state.db, Some(user.id()), "update", "package_price", Some(price_id.to_string()),
        Some(json!({"amount": b.amount.map(|a| a.to_string()), "active": b.is_active})), &headers).await;
    Ok(StatusCode::NO_CONTENT)
}


#[derive(Deserialize, ToSchema)]
pub struct AvailabilityRange {
    #[schema(value_type = String, example = "2026-12-15")]
    pub from: NaiveDate,
    #[schema(value_type = String, example = "2027-04-30")]
    pub to: NaiveDate,
    pub capacity: i16,
    /// Días de la semana (1 = lunes … 7 = domingo). Vacío = todos.
    #[serde(default)]
    pub weekdays: Vec<u32>,
    #[serde(default)]
    pub is_blocked: bool,
    pub note: Option<String>,
}

/// Abre (o bloquea) cupo para un rango de fechas de una sola vez.
#[utoipa::path(put, path = "/api/v1/admin/packages/{id}/availability/range", tag = "admin", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = AvailabilityRange, responses((status = 200, body = Object)))]
pub async fn set_availability_range(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<AvailabilityRange>) -> AppResult<Json<Value>> {
    user.require("packages.pricing")?;
    if b.to < b.from || (b.to - b.from).num_days() > 400 {
        return Err(AppError::BadRequest("rango inválido (máximo 400 días)".into()));
    }
    if b.capacity < 0 || b.weekdays.iter().any(|d| !(1..=7).contains(d)) {
        return Err(AppError::BadRequest("cupo o días de la semana inválidos".into()));
    }
    let days: Vec<i32> = b.weekdays.iter().map(|d| *d as i32).collect();
    let n = sqlx::query(
        "INSERT INTO package_availability (package_id, date, capacity, is_blocked, note)
         SELECT $1, d::date, $4, $5, $6 FROM generate_series($2::date, $3::date, interval '1 day') d
         WHERE cardinality($7::int[]) = 0 OR extract(isodow FROM d)::int = ANY($7)
         ON CONFLICT (package_id, date) DO UPDATE SET capacity = EXCLUDED.capacity, is_blocked = EXCLUDED.is_blocked, note = EXCLUDED.note",
    )
    .bind(id).bind(b.from).bind(b.to).bind(b.capacity).bind(b.is_blocked).bind(&b.note).bind(&days)
    .execute(&state.db)
    .await?
    .rows_affected();
    audit::log(&state.db, Some(user.id()), "update", "package_availability", Some(id.to_string()),
        Some(json!({"from": b.from, "to": b.to, "capacity": b.capacity, "blocked": b.is_blocked, "days": n})), &headers).await;
    Ok(Json(json!({ "days": n })))
}

#[derive(Deserialize, ToSchema)]
pub struct DepartureUpdate {
    /// scheduled | cancelled | completed
    pub status: Option<String>,
    pub capacity: Option<i16>,
    pub meeting_point: Option<String>,
}

/// Modifica o cancela una salida programada (no se puede bajar el cupo por debajo de lo ya reservado).
#[utoipa::path(patch, path = "/api/v1/admin/packages/{id}/departures/{dep_id}", tag = "admin", security(("bearer" = [])),
    params(("id" = Uuid, Path), ("dep_id" = Uuid, Path)), request_body = DepartureUpdate, responses((status = 204)))]
pub async fn update_departure(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path((id, dep)): Path<(Uuid, Uuid)>, Json(b): Json<DepartureUpdate>) -> AppResult<StatusCode> {
    user.require("packages.pricing")?;
    let n = sqlx::query(
        "UPDATE package_departures SET status = COALESCE($3::departure_status, status), capacity = COALESCE($4, capacity),
           meeting_point = COALESCE($5, meeting_point) WHERE id = $2 AND package_id = $1",
    )
    .bind(id).bind(dep).bind(&b.status).bind(b.capacity).bind(&b.meeting_point)
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("salida"));
    }
    audit::log(&state.db, Some(user.id()), "update", "package_departure", Some(dep.to_string()), Some(json!({"status": b.status, "capacity": b.capacity})), &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

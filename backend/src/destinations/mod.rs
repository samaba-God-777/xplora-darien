//! Destinos: catálogo público, puntos del mapa y administración.
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
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

#[derive(Deserialize, IntoParams)]
pub struct ListQuery {
    /// Idioma: `es` (por defecto) o `en`.
    pub lang: Option<String>,
    /// Clave de categoría (cascadas, playas…).
    pub category: Option<String>,
    pub featured: Option<bool>,
}

pub fn lang(l: &Option<String>) -> &'static str {
    match l.as_deref() {
        Some("en") => "en",
        _ => "es",
    }
}

/// Lista de destinos publicados (contenido en un idioma).
#[utoipa::path(get, path = "/api/v1/destinations", tag = "destinations", params(ListQuery),
    responses((status = 200, description = "Destinos publicados", body = Vec<Object>)))]
pub async fn list(State(state): State<AppState>, Query(q): Query<ListQuery>) -> AppResult<Json<Value>> {
    let rows: Vec<Value> = sqlx::query_scalar(
        r#"
        SELECT jsonb_build_object(
          'id', d.id, 'slug', d.slug,
          'name', tr('destination', d.id::text, $1, 'name', d.name),
          'category', c.key,
          'region', tr('destination', d.id::text, $1, 'region', d.region),
          'summary', tr('destination', d.id::text, $1, 'summary', d.summary),
          'difficulty', d.difficulty,
          'coords', jsonb_build_array(d.latitude, d.longitude),
          'coordsVerified', d.coords_verified,
          'featured', d.is_featured,
          'cover', (SELECT m.path FROM media_destinations dm JOIN media_assets m ON m.id = dm.media_id
                    WHERE dm.destination_id = d.id AND dm.attribution <> 'editorial_guess' AND m.deleted_at IS NULL AND m.status = 'published' ORDER BY dm.is_cover DESC, dm.sort_order LIMIT 1),
          'activities', COALESCE((SELECT jsonb_agg(a.key ORDER BY da.sort_order) FROM destination_activities da
                    JOIN activity_types a ON a.id = da.activity_type_id WHERE da.destination_id = d.id), '[]')
        )
        FROM destinations d JOIN destination_categories c ON c.id = d.category_id
        WHERE d.status = 'published' AND d.deleted_at IS NULL
          AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM destination_category_links l
                 JOIN destination_categories c2 ON c2.id = l.category_id
                 WHERE l.destination_id = d.id AND c2.key = $2))
          AND ($3::boolean IS NULL OR d.is_featured = $3)
        ORDER BY d.is_featured DESC, d.name
        "#,
    )
    .bind(lang(&q.lang))
    .bind(q.category)
    .bind(q.featured)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Value::Array(rows)))
}

/// Ficha completa de un destino publicado, con guías y paquetes asociados.
#[utoipa::path(get, path = "/api/v1/destinations/{slug}", tag = "destinations",
    params(("slug" = String, Path), ListQuery),
    responses((status = 200, body = Object), (status = 404, body = crate::errors::ErrorBody)))]
pub async fn get(State(state): State<AppState>, Path(slug): Path<String>, Query(q): Query<ListQuery>) -> AppResult<Json<Value>> {
    let row: Option<Value> = sqlx::query_scalar(
        r#"
        SELECT jsonb_build_object(
          'id', d.id, 'slug', d.slug,
          'name', tr('destination', d.id::text, $2, 'name', d.name),
          'category', c.key,
          'categories', (SELECT jsonb_agg(c2.key) FROM destination_category_links l
                         JOIN destination_categories c2 ON c2.id = l.category_id WHERE l.destination_id = d.id),
          'region', tr('destination', d.id::text, $2, 'region', d.region),
          'summary', tr('destination', d.id::text, $2, 'summary', d.summary),
          'description', tr('destination', d.id::text, $2, 'description', d.description),
          'history', tr('destination', d.id::text, $2, 'history', d.history),
          'coords', jsonb_build_array(d.latitude, d.longitude),
          'coordsVerified', d.coords_verified,
          'difficulty', d.difficulty,
          'visitDuration', tr('destination', d.id::text, $2, 'visit_duration', d.visit_duration),
          'season', tr('destination', d.id::text, $2, 'season', d.season),
          'access', tr('destination', d.id::text, $2, 'access_info', d.access_info),
          'safety', tr('destination', d.id::text, $2, 'safety_info', d.safety_info),
          'services', to_jsonb(d.services),
          'sources', to_jsonb(d.sources),
          'activities', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', a.key,
                          'name', tr('activity_type', a.id::text, $2, 'name', a.name), 'icon', a.icon) ORDER BY da.sort_order)
                        FROM destination_activities da JOIN activity_types a ON a.id = da.activity_type_id
                        WHERE da.destination_id = d.id), '[]'),
          'media', COALESCE((SELECT jsonb_agg(jsonb_build_object('path', m.path, 'kind', m.kind,
                          'width', m.width, 'height', m.height) ORDER BY dm.sort_order)
                        FROM media_destinations dm JOIN media_assets m ON m.id = dm.media_id
                        WHERE dm.destination_id = d.id AND dm.attribution <> 'editorial_guess' AND m.deleted_at IS NULL AND m.status = 'published'), '[]'),
          'guides', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', g.slug, 'name', g.full_name, 'languages', g.languages))
                        FROM guide_destinations gd JOIN guides g ON g.id = gd.guide_id
                        WHERE gd.destination_id = d.id AND g.status = 'published'), '[]'),
          'packages', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', p.slug, 'code', p.code,
                          'name', tr('package', p.id::text, $2, 'name', p.name), 'days', p.days, 'nights', p.nights))
                        FROM package_destinations pd JOIN tour_packages p ON p.id = pd.package_id
                        WHERE pd.destination_id = d.id AND p.status = 'published' AND p.deleted_at IS NULL), '[]')
        )
        FROM destinations d JOIN destination_categories c ON c.id = d.category_id
        WHERE d.slug = $1 AND d.status = 'published' AND d.deleted_at IS NULL
        "#,
    )
    .bind(&slug)
    .bind(lang(&q.lang))
    .fetch_optional(&state.db)
    .await?;
    row.map(Json).ok_or(AppError::NotFound("destino"))
}

/// Puntos del mapa con contenido en español e inglés (forma usada por el frontend).
#[utoipa::path(get, path = "/api/v1/map/points", tag = "map",
    responses((status = 200, description = "Destinos publicados para el mapa interactivo", body = Vec<Object>)))]
pub async fn map_points(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let rows: Vec<Value> = sqlx::query_scalar(
        r#"
        WITH loc AS (
          SELECT d.*, c.key AS category_key FROM destinations d
          JOIN destination_categories c ON c.id = d.category_id
          WHERE d.status = 'published' AND d.deleted_at IS NULL
        )
        SELECT jsonb_build_object(
          'slug', d.slug,
          'name', d.name,
          'category', d.category_key,
          'categories', COALESCE((SELECT jsonb_agg(c2.key) FROM destination_category_links l
                         JOIN destination_categories c2 ON c2.id = l.category_id WHERE l.destination_id = d.id), '[]'),
          'region', jsonb_build_object('es', d.region, 'en', tr('destination', d.id::text, 'en', 'region', d.region)),
          'coords', jsonb_build_array(d.latitude, d.longitude),
          'coordsVerified', d.coords_verified,
          'summary', jsonb_build_object('es', d.summary, 'en', tr('destination', d.id::text, 'en', 'summary', d.summary)),
          'description', jsonb_build_object('es', d.description, 'en', tr('destination', d.id::text, 'en', 'description', d.description)),
          'history', CASE WHEN d.history IS NULL THEN NULL ELSE
                     jsonb_build_object('es', d.history, 'en', tr('destination', d.id::text, 'en', 'history', d.history)) END,
          'activities', COALESCE((SELECT jsonb_agg(a.key ORDER BY da.sort_order) FROM destination_activities da
                         JOIN activity_types a ON a.id = da.activity_type_id WHERE da.destination_id = d.id), '[]'),
          'difficulty', d.difficulty,
          'visitDuration', jsonb_build_object('es', d.visit_duration, 'en', tr('destination', d.id::text, 'en', 'visit_duration', d.visit_duration)),
          'season', jsonb_build_object('es', d.season, 'en', tr('destination', d.id::text, 'en', 'season', d.season)),
          'access', jsonb_build_object('es', d.access_info, 'en', tr('destination', d.id::text, 'en', 'access_info', d.access_info)),
          'safety', jsonb_build_object('es', d.safety_info, 'en', tr('destination', d.id::text, 'en', 'safety_info', d.safety_info)),
          -- Fotos publicadas; si el lugar solo tiene videos, se usan sus pósters (fotograma del propio video).
          'photos', COALESCE(
            (SELECT jsonb_agg(m.path ORDER BY dm.sort_order) FROM media_destinations dm
               JOIN media_assets m ON m.id = dm.media_id WHERE dm.destination_id = d.id AND m.kind = 'image' AND dm.attribution <> 'editorial_guess' AND m.deleted_at IS NULL AND m.status = 'published'),
            (SELECT jsonb_agg(COALESCE(m.poster_path, p.path) ORDER BY dm.sort_order) FROM media_destinations dm
               JOIN media_assets m ON m.id = dm.media_id LEFT JOIN media_assets p ON p.id = m.poster_media_id
               WHERE dm.destination_id = d.id AND m.kind = 'video' AND dm.attribution <> 'editorial_guess' AND m.deleted_at IS NULL
                 AND m.status = 'published' AND COALESCE(m.poster_path, p.path) IS NOT NULL),
            '[]'),
          'videos', COALESCE((SELECT jsonb_agg(m.path ORDER BY dm.sort_order) FROM media_destinations dm
                     JOIN media_assets m ON m.id = dm.media_id WHERE dm.destination_id = d.id AND m.kind = 'video' AND dm.attribution <> 'editorial_guess' AND m.deleted_at IS NULL AND m.status = 'published'), '[]'),
          'sources', to_jsonb(d.sources)
        )
        FROM loc d
        ORDER BY d.name
        "#,
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Value::Array(rows)))
}

// ---------------------------------------------------------------- Administración

#[derive(Deserialize, Validate, ToSchema)]
pub struct DestinationInput {
    #[validate(length(min = 2, max = 80), custom(function = "crate::validation::slug"))]
    pub slug: String,
    #[validate(length(min = 2, max = 120))]
    pub name: String,
    pub category: String,
    #[validate(length(min = 2, max = 200))]
    pub region: String,
    #[validate(length(min = 10, max = 300))]
    pub summary: String,
    #[validate(length(min = 20, max = 10000))]
    pub description: String,
    pub history: Option<String>,
    #[validate(range(min = -90.0, max = 90.0))]
    pub latitude: f64,
    #[validate(range(min = -180.0, max = 180.0))]
    pub longitude: f64,
    #[serde(default)]
    pub coords_verified: bool,
    #[schema(example = "moderada")]
    pub difficulty: String,
    pub visit_duration: Option<String>,
    pub season: Option<String>,
    pub access_info: Option<String>,
    pub safety_info: Option<String>,
    #[serde(default)]
    pub activities: Vec<String>,
}

#[derive(Serialize, ToSchema)]
pub struct Created {
    pub id: Uuid,
}

/// Crea un destino (queda en borrador).
#[utoipa::path(post, path = "/api/v1/admin/destinations", tag = "admin", security(("bearer" = [])),
    request_body = DestinationInput, responses((status = 201, body = Created), (status = 403, body = crate::errors::ErrorBody)))]
pub async fn create(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Json(body): Json<DestinationInput>) -> AppResult<(StatusCode, Json<Created>)> {
    user.require("destinations.write")?;
    body.validate()?;
    let mut tx = state.db.begin().await?;
    let id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO destinations (slug, name, category_id, region, summary, description, history, latitude, longitude,
             coords_verified, coords_verified_at, difficulty, visit_duration, season, access_info, safety_info, created_by)
           VALUES ($1, $2, (SELECT id FROM destination_categories WHERE key = $3), $4, $5, $6, $7, $8, $9,
             $10, CASE WHEN $10 THEN now() END, $11::difficulty_level, $12, $13, $14, $15, $16)
           RETURNING id"#,
    )
    .bind(&body.slug).bind(&body.name).bind(&body.category).bind(&body.region).bind(&body.summary)
    .bind(&body.description).bind(&body.history).bind(body.latitude).bind(body.longitude).bind(body.coords_verified)
    .bind(&body.difficulty).bind(&body.visit_duration).bind(&body.season).bind(&body.access_info)
    .bind(&body.safety_info).bind(user.id())
    .fetch_one(&mut *tx)
    .await?;
    set_activities(&mut tx, id, &body.activities).await?;
    audit::log(&mut *tx, Some(user.id()), "create", "destination", Some(id.to_string()), Some(json!({"slug": body.slug})), &headers).await;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(Created { id })))
}

/// Reemplaza los datos editables de un destino.
#[utoipa::path(put, path = "/api/v1/admin/destinations/{id}", tag = "admin", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = DestinationInput, responses((status = 204), (status = 404, body = crate::errors::ErrorBody)))]
pub async fn update(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(body): Json<DestinationInput>) -> AppResult<StatusCode> {
    user.require("destinations.write")?;
    body.validate()?;
    let mut tx = state.db.begin().await?;
    let n = sqlx::query(
        r#"UPDATE destinations SET slug=$2, name=$3, category_id=(SELECT id FROM destination_categories WHERE key=$4),
             region=$5, summary=$6, description=$7, history=$8, latitude=$9, longitude=$10,
             coords_verified=$11, coords_verified_at = CASE WHEN $11 AND NOT coords_verified THEN now()
                                                          WHEN NOT $11 THEN NULL ELSE coords_verified_at END,
             difficulty=$12::difficulty_level, visit_duration=$13, season=$14, access_info=$15, safety_info=$16
           WHERE id=$1 AND deleted_at IS NULL"#,
    )
    .bind(id).bind(&body.slug).bind(&body.name).bind(&body.category).bind(&body.region).bind(&body.summary)
    .bind(&body.description).bind(&body.history).bind(body.latitude).bind(body.longitude).bind(body.coords_verified)
    .bind(&body.difficulty).bind(&body.visit_duration).bind(&body.season).bind(&body.access_info).bind(&body.safety_info)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("destino"));
    }
    set_activities(&mut tx, id, &body.activities).await?;
    audit::log(&mut *tx, Some(user.id()), "update", "destination", Some(id.to_string()), None, &headers).await;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn set_activities(tx: &mut sqlx::PgConnection, id: Uuid, keys: &[String]) -> AppResult<()> {
    sqlx::query("DELETE FROM destination_activities WHERE destination_id = $1").bind(id).execute(&mut *tx).await?;
    let inserted = sqlx::query(
        "INSERT INTO destination_activities (destination_id, activity_type_id, sort_order)
         SELECT $1, a.id, k.ord - 1 FROM unnest($2::text[]) WITH ORDINALITY AS k(key, ord)
         JOIN activity_types a ON a.key = k.key",
    )
    .bind(id)
    .bind(keys)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if inserted as usize != keys.len() {
        return Err(AppError::BadRequest("actividad desconocida".into()));
    }
    Ok(())
}

#[derive(Deserialize, ToSchema)]
pub struct PublishInput {
    /// draft | published | archived
    pub status: Option<String>,
    pub is_featured: Option<bool>,
}

/// Publica, despublica o destaca un destino.
#[utoipa::path(post, path = "/api/v1/admin/destinations/{id}/publish", tag = "admin", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = PublishInput, responses((status = 204)))]
pub async fn publish(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(body): Json<PublishInput>) -> AppResult<StatusCode> {
    user.require("destinations.publish")?;
    let n = sqlx::query(
        "UPDATE destinations SET status = COALESCE($2::publish_status, status), is_featured = COALESCE($3, is_featured)
         WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(&body.status)
    .bind(body.is_featured)
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("destino"));
    }
    audit::log(&state.db, Some(user.id()), "publish", "destination", Some(id.to_string()),
        Some(json!({"status": body.status, "is_featured": body.is_featured})), &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

/// Elimina (borrado lógico) un destino.
#[utoipa::path(delete, path = "/api/v1/admin/destinations/{id}", tag = "admin", security(("bearer" = [])),
    params(("id" = Uuid, Path)), responses((status = 204)))]
pub async fn delete(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    user.require("destinations.write")?;
    let n = sqlx::query("UPDATE destinations SET deleted_at = now(), status = 'archived' WHERE id = $1 AND deleted_at IS NULL")
        .bind(id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("destino"));
    }
    audit::log(&state.db, Some(user.id()), "delete", "destination", Some(id.to_string()), None, &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

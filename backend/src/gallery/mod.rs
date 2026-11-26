//! XPLORA DARIÉN — Cinematic Gallery (endpoints públicos).
//! Solo contenido publicado, no interno y no eliminado. Las asociaciones con lugares
//! de procedencia 'editorial_guess' no se muestran hasta que el equipo las verifica.
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::Deserialize;
use serde_json::{Value, json};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    config::Config,
    destinations::lang,
    errors::{AppError, AppResult},
    state::AppState,
    storage,
};

/// Añade `url` / `posterUrl` a todo objeto JSON con `path` / `posterPath`.
pub fn decorate(config: &Config, v: &mut Value) {
    match v {
        Value::Array(items) => items.iter_mut().for_each(|i| decorate(config, i)),
        Value::Object(map) => {
            if let Some(p) = map.get("path").and_then(Value::as_str).map(str::to_string) {
                map.insert("url".into(), Value::String(storage::public_url(config, &p)));
            }
            if let Some(p) = map.get("posterPath").and_then(Value::as_str).map(str::to_string) {
                map.insert("posterUrl".into(), Value::String(storage::public_url(config, &p)));
            }
            for (_, child) in map.iter_mut() {
                if child.is_object() || child.is_array() {
                    decorate(config, child);
                }
            }
        }
        _ => {}
    }
}

/// Fragmento SQL de un recurso (alias `m`).
pub const ITEM: &str = "jsonb_build_object(
    'id', m.id, 'type', m.content_type, 'path', m.path, 'title', m.title, 'description', m.description,
    'width', m.width, 'height', m.height, 'orientation', m.orientation, 'duration', m.duration_s,
    'featured', m.is_featured, 'aiGenerated', m.source = 'higgsfield', 'sourceUrl', m.source_url,
    'posterPath', COALESCE(m.poster_path, (SELECT p.path FROM media_assets p WHERE p.id = m.poster_media_id)),
    'categories', COALESCE((SELECT jsonb_agg(c.key ORDER BY c.sort_order) FROM media_asset_categories mc
                   JOIN media_categories c ON c.id = mc.category_id WHERE mc.media_id = m.id), '[]'))";

const PUBLIC: &str = "m.status = 'published' AND m.deleted_at IS NULL AND NOT m.is_internal";

/// Categorías editoriales con portada y conteos.
#[utoipa::path(get, path = "/api/v1/gallery/categories", tag = "gallery", params(LangQuery), responses((status = 200, body = Vec<Object>)))]
pub async fn categories(State(state): State<AppState>, Query(q): Query<LangQuery>) -> AppResult<Json<Value>> {
    let sql = format!(
        "SELECT jsonb_build_object('key', c.key,
            'name', tr('media_category', c.id::text, $1, 'name', c.name),
            'tagline', tr('media_category', c.id::text, $1, 'tagline', c.tagline),
            'description', tr('media_category', c.id::text, $1, 'description', c.description),
            'cover', (SELECT jsonb_build_object('id', m.id, 'path', m.path, 'width', m.width, 'height', m.height) FROM media_assets m WHERE m.id = c.cover_media_id),
            'photos', (SELECT count(*) FROM media_asset_categories mc JOIN media_assets m ON m.id = mc.media_id WHERE mc.category_id = c.id AND {PUBLIC} AND m.content_type = 'photo'),
            'videos', (SELECT count(*) FROM media_asset_categories mc JOIN media_assets m ON m.id = mc.media_id WHERE mc.category_id = c.id AND {PUBLIC} AND m.content_type = 'video'))
         FROM media_categories c WHERE c.is_active ORDER BY c.sort_order"
    );
    let mut rows = Value::Array(sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(lang(&q.lang)).fetch_all(&state.db).await?);
    decorate(&state.config, &mut rows);
    Ok(Json(rows))
}

#[derive(Deserialize, IntoParams)]
pub struct LangQuery {
    pub lang: Option<String>,
}

#[derive(Deserialize, IntoParams)]
pub struct MediaQuery {
    pub category: Option<String>,
    /// photo | video
    #[serde(rename = "type")]
    pub content_type: Option<String>,
    /// horizontal | vertical | square
    pub orientation: Option<String>,
    pub destination: Option<String>,
    pub package: Option<String>,
    pub featured: Option<bool>,
    #[serde(default = "one")]
    pub page: i64,
    #[serde(default = "default_limit")]
    pub limit: i64,
}
fn one() -> i64 {
    1
}
fn default_limit() -> i64 {
    24
}

/// Recursos publicados con filtros y paginación.
#[utoipa::path(get, path = "/api/v1/gallery/media", tag = "gallery", params(MediaQuery), responses((status = 200, body = Object)))]
pub async fn media(State(state): State<AppState>, Query(q): Query<MediaQuery>) -> AppResult<Json<Value>> {
    let limit = q.limit.clamp(1, 60);
    let page = q.page.max(1);
    let sql = format!(
        "SELECT {ITEM} AS item, count(*) OVER() AS total FROM media_assets m
         WHERE {PUBLIC}
           AND ($1::text IS NULL OR EXISTS (SELECT 1 FROM media_asset_categories mc JOIN media_categories c ON c.id = mc.category_id WHERE mc.media_id = m.id AND c.key = $1))
           AND ($2::text IS NULL OR m.content_type::text = $2)
           AND ($3::text IS NULL OR m.orientation = $3)
           AND ($4::text IS NULL OR EXISTS (SELECT 1 FROM media_destinations md JOIN destinations d ON d.id = md.destination_id
                 WHERE md.media_id = m.id AND d.slug = $4 AND md.attribution <> 'editorial_guess'))
           AND ($5::text IS NULL OR EXISTS (SELECT 1 FROM media_packages mp JOIN tour_packages p ON p.id = mp.package_id WHERE mp.media_id = m.id AND p.slug = $5))
           AND ($6::boolean IS NULL OR m.is_featured = $6)
         ORDER BY m.is_featured DESC, (m.width * m.height) DESC NULLS LAST, m.path
         LIMIT $7 OFFSET $8"
    );
    let rows: Vec<(Value, i64)> = sqlx::query_as(sqlx::AssertSqlSafe(sql))
        .bind(&q.category).bind(&q.content_type).bind(&q.orientation).bind(&q.destination).bind(&q.package).bind(q.featured)
        .bind(limit).bind((page - 1) * limit)
        .fetch_all(&state.db)
        .await?;
    let total = rows.first().map(|r| r.1).unwrap_or(0);
    let mut items = Value::Array(rows.into_iter().map(|r| r.0).collect());
    decorate(&state.config, &mut items);
    Ok(Json(json!({ "items": items, "page": page, "limit": limit, "total": total, "hasMore": page * limit < total })))
}

/// Ficha de un recurso con sus destinos, paquetes y experiencias (para los botones de acción).
#[utoipa::path(get, path = "/api/v1/gallery/media/{id}", tag = "gallery", params(("id" = Uuid, Path), LangQuery), responses((status = 200, body = Object), (status = 404, body = crate::errors::ErrorBody)))]
pub async fn item(State(state): State<AppState>, Path(id): Path<Uuid>, Query(q): Query<LangQuery>) -> AppResult<Json<Value>> {
    let sql = format!(
        "SELECT {ITEM} || jsonb_build_object(
            'destinations', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', d.slug, 'name', tr('destination', d.id::text, $2, 'name', d.name),
                  'attribution', md.attribution, 'attributionNote', md.attribution_note) ORDER BY md.sort_order)
                FROM media_destinations md JOIN destinations d ON d.id = md.destination_id
                WHERE md.media_id = m.id AND md.attribution <> 'editorial_guess' AND d.status = 'published' AND d.deleted_at IS NULL), '[]'),
            'packages', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', p.slug, 'name', tr('package', p.id::text, $2, 'name', p.name)))
                FROM media_packages mp JOIN tour_packages p ON p.id = mp.package_id
                WHERE mp.media_id = m.id AND p.status = 'published' AND p.deleted_at IS NULL), '[]'),
            'experiences', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', e.slug, 'name', e.name))
                FROM media_experiences me JOIN experiences e ON e.id = me.experience_id
                WHERE me.media_id = m.id AND e.status = 'published'), '[]'))
         FROM media_assets m WHERE m.id = $1 AND {PUBLIC}"
    );
    let mut row: Value = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(id)
        .bind(lang(&q.lang))
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound("recurso"))?;
    decorate(&state.config, &mut row);
    Ok(Json(row))
}

/// Contenido del hero cinematográfico: videos destacados (con póster) y fotos horizontales destacadas.
#[utoipa::path(get, path = "/api/v1/gallery/hero", tag = "gallery", responses((status = 200, body = Object)))]
pub async fn hero(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let sql = format!(
        "SELECT jsonb_build_object(
           'videos', COALESCE((SELECT jsonb_agg(x) FROM (SELECT {ITEM} x FROM media_assets m WHERE {PUBLIC} AND m.content_type = 'video' AND m.is_featured ORDER BY m.duration_s DESC NULLS LAST LIMIT 4) v), '[]'),
           'photos', COALESCE((SELECT jsonb_agg(x) FROM (SELECT {ITEM} x FROM media_assets m WHERE {PUBLIC} AND m.content_type = 'photo' AND m.is_featured AND m.orientation <> 'vertical' ORDER BY (m.width * m.height) DESC LIMIT 6) p), '[]'))"
    );
    let mut v: Value = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).fetch_one(&state.db).await?;
    decorate(&state.config, &mut v);
    Ok(Json(v))
}

#[derive(Deserialize, ToSchema)]
pub struct EventInput {
    /// view | lightbox_open | play | complete | cta_click | share
    pub event: String,
    /// destination | package | experience | booking
    pub cta: Option<String>,
}

/// Registra una interacción anónima (sin IP ni datos personales).
#[utoipa::path(post, path = "/api/v1/gallery/media/{id}/events", tag = "gallery", params(("id" = Uuid, Path)), request_body = EventInput, responses((status = 204)))]
pub async fn event(State(state): State<AppState>, Path(id): Path<Uuid>, Json(b): Json<EventInput>) -> AppResult<StatusCode> {
    if !["view", "lightbox_open", "play", "complete", "cta_click", "share"].contains(&b.event.as_str()) {
        return Err(AppError::BadRequest("evento desconocido".into()));
    }
    if b.cta.as_deref().is_some_and(|c| !["destination", "package", "experience", "booking"].contains(&c)) {
        return Err(AppError::BadRequest("cta desconocido".into()));
    }
    // SQL dinámico solo con la constante PUBLIC (sin datos del usuario).
    let n = sqlx::query(sqlx::AssertSqlSafe(format!(
        "INSERT INTO media_analytics (media_id, event, cta) SELECT m.id, $2, $3 FROM media_assets m WHERE m.id = $1 AND {PUBLIC}"
    )))
    .bind(id)
    .bind(&b.event)
    .bind(&b.cta)
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("recurso"));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Galería organizada por pueblo o destino: cada destino con portada y conteo de fotos y videos.
/// Solo cuenta asociaciones con procedencia comprobable (nunca 'editorial_guess').
#[utoipa::path(get, path = "/api/v1/gallery/destinations", tag = "gallery", params(LangQuery), responses((status = 200, body = Vec<Object>)))]
pub async fn destinations(State(state): State<AppState>, Query(q): Query<LangQuery>) -> AppResult<Json<Value>> {
    let sql = format!(
        "WITH linked AS (
           SELECT md.destination_id, m.* , md.is_cover, md.sort_order AS link_order
           FROM media_destinations md JOIN media_assets m ON m.id = md.media_id
           WHERE md.attribution <> 'editorial_guess' AND {PUBLIC})
         SELECT jsonb_build_object('slug', d.slug,
            'name', tr('destination', d.id::text, $1, 'name', d.name),
            'region', tr('destination', d.id::text, $1, 'region', d.region),
            'summary', tr('destination', d.id::text, $1, 'summary', d.summary),
            'category', c.key,
            'photos', (SELECT count(*) FROM linked l WHERE l.destination_id = d.id AND l.content_type = 'photo'),
            'videos', (SELECT count(*) FROM linked l WHERE l.destination_id = d.id AND l.content_type = 'video'),
            'cover', COALESCE(
              (SELECT jsonb_build_object('id', l.id, 'path', l.path, 'width', l.width, 'height', l.height) FROM linked l
                WHERE l.destination_id = d.id AND l.content_type = 'photo'
                ORDER BY l.is_cover DESC, l.is_featured DESC, l.link_order LIMIT 1),
              -- Destinos con solo video: portada = póster del video.
              (SELECT jsonb_build_object('id', l.id, 'path', COALESCE(l.poster_path, p.path), 'width', p.width, 'height', p.height)
                FROM linked l LEFT JOIN media_assets p ON p.id = l.poster_media_id
                WHERE l.destination_id = d.id AND l.content_type = 'video' AND COALESCE(l.poster_path, p.path) IS NOT NULL
                ORDER BY l.is_featured DESC LIMIT 1)))
         FROM destinations d JOIN destination_categories c ON c.id = d.category_id
         WHERE d.status = 'published' AND d.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM linked l WHERE l.destination_id = d.id)
         ORDER BY (SELECT count(*) FROM linked l WHERE l.destination_id = d.id) DESC, d.name"
    );
    let mut rows = Value::Array(sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(lang(&q.lang)).fetch_all(&state.db).await?);
    decorate(&state.config, &mut rows);
    Ok(Json(rows))
}

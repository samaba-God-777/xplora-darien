//! MEDIA MANAGEMENT STUDIO (administración de fotografías y videos).
pub mod processing;

use axum::{
    Json,
    extract::{Multipart, Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    audit,
    auth::AuthUser,
    errors::{AppError, AppResult},
    gallery::{ITEM, decorate},
    state::AppState,
};

#[derive(Deserialize, IntoParams)]
pub struct AdminMediaQuery {
    /// Búsqueda en título, descripción y ruta.
    pub q: Option<String>,
    /// photo | video | graphic
    #[serde(rename = "type")]
    pub content_type: Option<String>,
    /// draft | published | archived
    pub status: Option<String>,
    pub category: Option<String>,
    pub destination: Option<String>,
    /// pageWeb | upload | higgsfield
    pub source: Option<String>,
    pub featured: Option<bool>,
    #[serde(default)]
    pub include_internal: bool,
    #[serde(default = "one")]
    pub page: i64,
    #[serde(default = "default_limit")]
    pub limit: i64,
}
fn one() -> i64 {
    1
}
fn default_limit() -> i64 {
    40
}

fn admin_item() -> String {
    format!(
        "{ITEM} || jsonb_build_object('kind', m.kind, 'status', m.status, 'source', m.source, 'internal', m.is_internal,
            'bytes', m.bytes, 'mime', m.mime_type, 'createdAt', m.created_at, 'updatedAt', m.updated_at,
            'duplicateOf', m.duplicate_of,
            'tags', COALESCE((SELECT jsonb_agg(t.name ORDER BY t.name) FROM media_asset_tags mt JOIN media_tags t ON t.id = mt.tag_id WHERE mt.media_id = m.id), '[]'),
            'destinations', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', d.slug, 'name', d.name, 'attribution', md.attribution, 'note', md.attribution_note))
                FROM media_destinations md JOIN destinations d ON d.id = md.destination_id WHERE md.media_id = m.id), '[]'),
            'packages', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', p.slug, 'name', p.name))
                FROM media_packages mp JOIN tour_packages p ON p.id = mp.package_id WHERE mp.media_id = m.id), '[]'),
            'stats', (SELECT jsonb_build_object(
                'views', count(*) FILTER (WHERE event IN ('view','lightbox_open')),
                'plays', count(*) FILTER (WHERE event = 'play'),
                'ctaClicks', count(*) FILTER (WHERE event = 'cta_click'))
              FROM media_analytics a WHERE a.media_id = m.id AND a.created_at > now() - interval '30 days'))"
    )
}

/// Biblioteca completa con filtros (incluye borradores).
#[utoipa::path(get, path = "/api/v1/admin/media", tag = "media-studio", security(("bearer" = [])), params(AdminMediaQuery), responses((status = 200, body = Object)))]
pub async fn list(State(state): State<AppState>, user: AuthUser, Query(q): Query<AdminMediaQuery>) -> AppResult<Json<Value>> {
    user.require("media.write")?;
    let limit = q.limit.clamp(1, 100);
    let page = q.page.max(1);
    let sql = format!(
        "SELECT {} AS item, count(*) OVER() AS total FROM media_assets m
         WHERE m.deleted_at IS NULL AND ($1 OR NOT m.is_internal)
           AND ($2::text IS NULL OR m.title ILIKE '%' || $2 || '%' OR m.description ILIKE '%' || $2 || '%' OR m.path ILIKE '%' || $2 || '%')
           AND ($3::text IS NULL OR m.content_type::text = $3)
           AND ($4::text IS NULL OR m.status::text = $4)
           AND ($5::text IS NULL OR EXISTS (SELECT 1 FROM media_asset_categories mc JOIN media_categories c ON c.id = mc.category_id WHERE mc.media_id = m.id AND c.key = $5))
           AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM media_destinations md JOIN destinations d ON d.id = md.destination_id WHERE md.media_id = m.id AND d.slug = $6))
           AND ($7::text IS NULL OR m.source = $7)
           AND ($8::boolean IS NULL OR m.is_featured = $8)
         ORDER BY m.created_at DESC, m.path LIMIT $9 OFFSET $10",
        admin_item()
    );
    let rows: Vec<(Value, i64)> = sqlx::query_as(sqlx::AssertSqlSafe(sql))
        .bind(q.include_internal).bind(&q.q).bind(&q.content_type).bind(&q.status).bind(&q.category)
        .bind(&q.destination).bind(&q.source).bind(q.featured).bind(limit).bind((page - 1) * limit)
        .fetch_all(&state.db)
        .await?;
    let total = rows.first().map(|r| r.1).unwrap_or(0);
    let mut items = Value::Array(rows.into_iter().map(|r| r.0).collect());
    decorate(&state.config, &mut items);
    Ok(Json(json!({ "items": items, "page": page, "limit": limit, "total": total, "hasMore": page * limit < total })))
}

/// Detalle administrativo de un recurso.
#[utoipa::path(get, path = "/api/v1/admin/media/{id}", tag = "media-studio", security(("bearer" = [])), params(("id" = Uuid, Path)), responses((status = 200, body = Object)))]
pub async fn get(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    user.require("media.write")?;
    let sql = format!("SELECT {} FROM media_assets m WHERE m.id = $1 AND m.deleted_at IS NULL", admin_item());
    let mut v: Value = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(id).fetch_optional(&state.db).await?.ok_or(AppError::NotFound("recurso"))?;
    decorate(&state.config, &mut v);
    Ok(Json(v))
}

#[derive(Deserialize, ToSchema)]
pub struct DestinationLink {
    pub slug: String,
    /// verified | owner_caption | owner_filename | visible_signage | editorial_guess
    pub attribution: String,
}

#[derive(Deserialize, ToSchema)]
pub struct MediaUpdate {
    pub title: Option<String>,
    pub description: Option<String>,
    /// draft | published | archived
    pub status: Option<String>,
    pub is_featured: Option<bool>,
    pub tags: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
    pub destinations: Option<Vec<DestinationLink>>,
    pub packages: Option<Vec<String>>,
}

/// Edita metadatos, clasificación, asociaciones y publicación.
#[utoipa::path(patch, path = "/api/v1/admin/media/{id}", tag = "media-studio", security(("bearer" = [])), params(("id" = Uuid, Path)), request_body = MediaUpdate, responses((status = 204)))]
pub async fn update(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<MediaUpdate>) -> AppResult<StatusCode> {
    user.require("media.write")?;
    if b.title.as_deref().is_some_and(|t| t.trim().is_empty() || t.len() > 160) {
        return Err(AppError::BadRequest("título entre 1 y 160 caracteres".into()));
    }
    let mut tx = state.db.begin().await?;
    let n = sqlx::query(
        "UPDATE media_assets SET title = COALESCE($2, title), description = COALESCE($3, description),
           status = COALESCE($4::publish_status, status), is_featured = COALESCE($5, is_featured),
           published_at = CASE WHEN $4 = 'published' AND published_at IS NULL THEN now() ELSE published_at END
         WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id).bind(&b.title).bind(&b.description).bind(&b.status).bind(b.is_featured)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("recurso"));
    }
    if let Some(tags) = &b.tags {
        sqlx::query("DELETE FROM media_asset_tags WHERE media_id = $1").bind(id).execute(&mut *tx).await?;
        for name in tags.iter().map(|t| t.trim()).filter(|t| !t.is_empty()).take(30) {
            let slug = slugify(name);
            if slug.is_empty() {
                continue;
            }
            sqlx::query(
                "WITH t AS (INSERT INTO media_tags (slug, name) VALUES ($2, $3) ON CONFLICT (slug) DO UPDATE SET name = media_tags.name RETURNING id)
                 INSERT INTO media_asset_tags (media_id, tag_id) SELECT $1, id FROM t ON CONFLICT DO NOTHING",
            )
            .bind(id).bind(&slug).bind(name)
            .execute(&mut *tx)
            .await?;
        }
    }
    let dests = b.destinations.as_ref().map(|d| d.iter().map(|l| (l.slug.clone(), l.attribution.clone())).collect::<Vec<_>>());
    set_links(&mut tx, id, b.categories.as_deref(), dests.as_deref(), b.packages.as_deref()).await?;
    audit::log(&mut *tx, Some(user.id()), "update", "media_asset", Some(id.to_string()),
        Some(json!({"status": b.status, "featured": b.is_featured})), &headers).await;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Reemplaza categorías, destinos y paquetes de un recurso (solo los conjuntos indicados).
pub async fn set_links(
    tx: &mut sqlx::PgConnection,
    id: Uuid,
    categories: Option<&[String]>,
    destinations: Option<&[(String, String)]>,
    packages: Option<&[String]>,
) -> AppResult<()> {
    if let Some(cats) = categories {
        sqlx::query("DELETE FROM media_asset_categories WHERE media_id = $1").bind(id).execute(&mut *tx).await?;
        let n = sqlx::query("INSERT INTO media_asset_categories SELECT $1, id FROM media_categories WHERE key = ANY($2)")
            .bind(id).bind(cats).execute(&mut *tx).await?.rows_affected();
        if n as usize != cats.len() {
            return Err(AppError::BadRequest("categoría desconocida".into()));
        }
    }
    if let Some(dests) = destinations {
        sqlx::query("DELETE FROM media_destinations WHERE media_id = $1").bind(id).execute(&mut *tx).await?;
        for (i, (slug, attribution)) in dests.iter().enumerate() {
            let n = sqlx::query(
                "INSERT INTO media_destinations (destination_id, media_id, sort_order, attribution)
                 SELECT d.id, $2, $3, $4::attribution_source FROM destinations d WHERE d.slug = $1 AND d.deleted_at IS NULL",
            )
            .bind(slug).bind(id).bind(i as i16).bind(attribution)
            .execute(&mut *tx)
            .await?
            .rows_affected();
            if n == 0 {
                return Err(AppError::BadRequest(format!("destino desconocido: {slug}")));
            }
        }
    }
    if let Some(pkgs) = packages {
        sqlx::query("DELETE FROM media_packages WHERE media_id = $1").bind(id).execute(&mut *tx).await?;
        let n = sqlx::query("INSERT INTO media_packages (package_id, media_id) SELECT p.id, $1 FROM tour_packages p WHERE p.slug = ANY($2) AND p.deleted_at IS NULL")
            .bind(id).bind(pkgs).execute(&mut *tx).await?.rows_affected();
        if n as usize != pkgs.len() {
            return Err(AppError::BadRequest("paquete desconocido".into()));
        }
    }
    Ok(())
}

pub fn slugify(s: &str) -> String {
    let mapped: String = s
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            c if c.is_ascii_alphanumeric() => c,
            _ => '-',
        })
        .collect();
    mapped.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-")
}

#[derive(Deserialize, IntoParams)]
pub struct DeleteQuery {
    /// Confirmación explícita: debe repetir el id del recurso.
    pub confirm: Option<Uuid>,
}

/// Elimina (oculta) un recurso. Exige `?confirm=<id>`. Los originales de pageWeb nunca se borran del disco.
#[utoipa::path(delete, path = "/api/v1/admin/media/{id}", tag = "media-studio", security(("bearer" = [])),
    params(("id" = Uuid, Path), DeleteQuery), responses((status = 204), (status = 400, body = crate::errors::ErrorBody)))]
pub async fn delete(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Query(q): Query<DeleteQuery>) -> AppResult<StatusCode> {
    user.require("media.write")?;
    if q.confirm != Some(id) {
        return Err(AppError::BadRequest("confirma la eliminación repitiendo el id en ?confirm=".into()));
    }
    let n = sqlx::query("UPDATE media_assets SET deleted_at = now(), status = 'archived', is_featured = false WHERE id = $1 AND deleted_at IS NULL")
        .bind(id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("recurso"));
    }
    audit::log(&state.db, Some(user.id()), "delete", "media_asset", Some(id.to_string()), None, &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

const ALLOWED: [(&str, &str, &str); 6] = [
    ("image/jpeg", "jpg", "image"),
    ("image/png", "png", "image"),
    ("image/webp", "webp", "image"),
    ("image/avif", "avif", "image"),
    ("video/mp4", "mp4", "video"),
    ("video/quicktime", "mov", "video"),
];
pub const MAX_UPLOAD_BYTES: usize = 300 * 1024 * 1024;

/// Sube una fotografía o video (multipart, campo `file`). Queda en borrador.
#[utoipa::path(post, path = "/api/v1/admin/media/upload", tag = "media-studio", security(("bearer" = [])),
    responses((status = 201, body = Object), (status = 409, description = "archivo duplicado"), (status = 415, body = crate::errors::ErrorBody)))]
pub async fn upload(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, mut multipart: Multipart) -> AppResult<(StatusCode, Json<Value>)> {
    user.require("media.write")?;
    let mut saved: Option<(Uuid, String)> = None;
    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        if field.name() != Some("file") {
            continue;
        }
        let ct = field.content_type().unwrap_or("").to_string();
        let Some((mime, ext, kind)) = ALLOWED.iter().find(|(m, _, _)| *m == ct) else {
            return Err(AppError::Unprocessable(format!("tipo no admitido: {ct} (JPG, PNG, WebP, AVIF, MP4, MOV)")));
        };
        let original = field.file_name().map(str::to_string);
        let bytes = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
        if bytes.is_empty() {
            return Err(AppError::BadRequest("archivo vacío".into()));
        }
        // Verificación de firma: el contenido debe coincidir con el tipo declarado.
        let magic_ok = match *ext {
            "jpg" => bytes.starts_with(&[0xFF, 0xD8, 0xFF]),
            "png" => bytes.starts_with(b"\x89PNG"),
            "webp" => bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
            "avif" | "mp4" | "mov" => bytes.len() > 12 && &bytes[4..8] == b"ftyp",
            _ => false,
        };
        if !magic_ok {
            return Err(AppError::Unprocessable("el contenido no coincide con el tipo de archivo".into()));
        }
        let sha = hex::encode(Sha256::digest(&bytes));
        let dup: Option<Uuid> = sqlx::query_scalar("SELECT id FROM media_assets WHERE sha256 = $1 AND deleted_at IS NULL LIMIT 1")
            .bind(&sha)
            .fetch_optional(&state.db)
            .await?;
        if let Some(existing) = dup {
            return Err(AppError::Conflict(format!("archivo ya existente en la biblioteca ({existing})")));
        }
        let id = Uuid::new_v4();
        let rel = format!("uploads/{id}.{ext}");
        let dest = state.config.storage_dir.join(&rel);
        if let Some(dir) = dest.parent() {
            tokio::fs::create_dir_all(dir).await.map_err(|e| AppError::Internal(e.into()))?;
        }
        tokio::fs::write(&dest, &bytes).await.map_err(|e| AppError::Internal(e.into()))?;
        let title = original.as_deref().and_then(|n| n.rsplit_once('.').map(|x| x.0)).unwrap_or("Sin título").to_string();
        sqlx::query(
            "INSERT INTO media_assets (id, kind, content_type, path, source, bytes, sha256, mime_type, title, status, uploaded_by)
             VALUES ($1, $2::media_kind, $3::media_content, $4, 'upload', $5, $6, $7, $8, 'draft', $9)",
        )
        .bind(id).bind(kind).bind(if *kind == "video" { "video" } else { "photo" }).bind(&rel)
        .bind(bytes.len() as i64).bind(&sha).bind(mime).bind(&title).bind(user.id())
        .execute(&state.db)
        .await?;
        processing::enqueue(&state.db, id, *kind == "video").await?;
        audit::log(&state.db, Some(user.id()), "upload", "media_asset", Some(id.to_string()), Some(json!({"bytes": bytes.len(), "mime": mime})), &headers).await;
        saved = Some((id, rel));
        break;
    }
    let (id, path) = saved.ok_or(AppError::BadRequest("falta el campo `file`".into()))?;
    let mut v = json!({"id": id, "path": path, "status": "draft"});
    decorate(&state.config, &mut v);
    Ok((StatusCode::CREATED, Json(v)))
}

// ---------------------------------------------------------------- Colecciones

/// Colecciones con sus recursos.
#[utoipa::path(get, path = "/api/v1/admin/media/collections", tag = "media-studio", security(("bearer" = [])), responses((status = 200, body = Vec<Object>)))]
pub async fn collections(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    user.require("media.write")?;
    let sql = format!(
        "SELECT jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'description', c.description, 'status', c.status,
            'items', COALESCE((SELECT jsonb_agg({ITEM} ORDER BY i.sort_order) FROM media_collection_items i JOIN media_assets m ON m.id = i.media_id
                               WHERE i.collection_id = c.id AND m.deleted_at IS NULL), '[]'))
         FROM media_collections c ORDER BY c.created_at DESC"
    );
    let mut rows = Value::Array(sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).fetch_all(&state.db).await?);
    decorate(&state.config, &mut rows);
    Ok(Json(rows))
}

#[derive(Deserialize, ToSchema)]
pub struct CollectionInput {
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    #[serde(default)]
    pub media_ids: Vec<Uuid>,
}

/// Crea o reemplaza una colección (por slug).
#[utoipa::path(put, path = "/api/v1/admin/media/collections", tag = "media-studio", security(("bearer" = [])), request_body = CollectionInput, responses((status = 200, body = Object)))]
pub async fn upsert_collection(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Json(b): Json<CollectionInput>) -> AppResult<Json<Value>> {
    user.require("media.write")?;
    crate::validation::slug(&b.slug).map_err(|_| AppError::BadRequest("slug inválido".into()))?;
    let mut tx = state.db.begin().await?;
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO media_collections (slug, title, description, status, created_by) VALUES ($1,$2,$3,COALESCE($4::publish_status,'draft'),$5)
         ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
           status = COALESCE($4::publish_status, media_collections.status) RETURNING id",
    )
    .bind(&b.slug).bind(&b.title).bind(&b.description).bind(&b.status).bind(user.id())
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM media_collection_items WHERE collection_id = $1").bind(id).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO media_collection_items (collection_id, media_id, sort_order) SELECT $1, x.id, x.ord FROM unnest($2::uuid[]) WITH ORDINALITY x(id, ord)")
        .bind(id).bind(&b.media_ids).execute(&mut *tx).await?;
    audit::log(&mut *tx, Some(user.id()), "upsert", "media_collection", Some(id.to_string()), Some(json!({"items": b.media_ids.len()})), &headers).await;
    tx.commit().await?;
    Ok(Json(json!({"id": id})))
}

/// Estadísticas de la biblioteca y de la galería (30 días).
#[utoipa::path(get, path = "/api/v1/admin/media/stats", tag = "media-studio", security(("bearer" = [])), responses((status = 200, body = Object)))]
pub async fn stats(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    user.require("media.write")?;
    let sql = format!(
        "SELECT jsonb_build_object(
          'byStatus', (SELECT COALESCE(jsonb_object_agg(k, n), '{{}}') FROM (SELECT content_type || ':' || status AS k, count(*) n FROM media_assets WHERE deleted_at IS NULL AND NOT is_internal GROUP BY 1) s),
          'bySource', (SELECT COALESCE(jsonb_object_agg(source, n), '{{}}') FROM (SELECT source, count(*) n FROM media_assets WHERE deleted_at IS NULL GROUP BY 1) s),
          'events30d', (SELECT COALESCE(jsonb_object_agg(event, n), '{{}}') FROM (SELECT event, count(*) n FROM media_analytics WHERE created_at > now() - interval '30 days' GROUP BY 1) s),
          'top', COALESCE((SELECT jsonb_agg(x) FROM (SELECT {ITEM} || jsonb_build_object('events', t.n) x
                 FROM (SELECT media_id, count(*) n FROM media_analytics WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 8) t
                 JOIN media_assets m ON m.id = t.media_id) z), '[]'),
          'pendingJobs', (SELECT count(*) FROM media_processing_jobs WHERE status IN ('pending','running')),
          'failedJobs', (SELECT count(*) FROM media_processing_jobs WHERE status = 'failed'),
          'unverifiedLinks', (SELECT count(*) FROM media_destinations WHERE attribution = 'editorial_guess'))"
    );
    let mut v: Value = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).fetch_one(&state.db).await?;
    decorate(&state.config, &mut v);
    Ok(Json(v))
}

#[cfg(test)]
mod tests {
    #[test]
    fn slugify_tags() {
        assert_eq!(super::slugify("Río Tuira  (aéreo)"), "rio-tuira-aereo");
        assert_eq!(super::slugify("  ¡Niños! "), "ninos");
    }
}

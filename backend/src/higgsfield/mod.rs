//! XPLORA AI Video Studio: generación de video con Higgsfield desde el panel administrativo.
//! Las credenciales viven solo en el backend; el navegador nunca habla con Higgsfield.
pub mod client;
pub mod params;
pub mod worker;

use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::{Map, Value, json};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    audit,
    auth::AuthUser,
    errors::{AppError, AppResult},
    gallery::decorate,
    state::AppState,
};
use client::HiggsfieldClient;

fn client(state: &AppState) -> AppResult<HiggsfieldClient> {
    HiggsfieldClient::from_config(&state.config.higgsfield).ok_or_else(|| {
        AppError::Unprocessable(
            "Higgsfield no está configurado: define HIGGSFIELD_API_KEY_ID y HIGGSFIELD_API_KEY_SECRET en el entorno del backend".into(),
        )
    })
}

async fn setting_decimal(db: &sqlx::PgPool, key: &str) -> Result<Decimal, sqlx::Error> {
    let v: Option<String> = sqlx::query_scalar("SELECT value #>> '{}' FROM system_settings WHERE key = $1").bind(key).fetch_optional(db).await?;
    Ok(v.and_then(|s| s.parse().ok()).unwrap_or(Decimal::ZERO))
}

/// Estado del estudio: configuración, presupuesto y gasto del mes.
#[utoipa::path(get, path = "/api/v1/admin/ai/status", tag = "ai-studio", security(("bearer" = [])), responses((status = 200, body = Object)))]
pub async fn status(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    user.require("ai.generate")?;
    let budget = setting_decimal(&state.db, "higgsfield.monthly_budget_usd").await?;
    let max = setting_decimal(&state.db, "higgsfield.max_concurrent").await?;
    let spent: Decimal = sqlx::query_scalar("SELECT ai_spend_this_month()").fetch_one(&state.db).await?;
    let counts: Value = sqlx::query_scalar("SELECT COALESCE(jsonb_object_agg(status, n), '{}') FROM (SELECT status::text, count(*) n FROM video_generations GROUP BY 1) s")
        .fetch_one(&state.db)
        .await?;
    Ok(Json(json!({
        "configured": state.config.higgsfield.is_configured(),
        "workerEnabled": state.config.worker_enabled,
        "monthlyBudgetUsd": budget.to_string(),
        "spentThisMonthUsd": spent.round_dp(4).to_string(),
        "maxConcurrent": max.to_string(),
        "generations": counts,
        "docs": "https://docs.higgsfield.ai/docs/llms.txt"
    })))
}

#[derive(Deserialize, ToSchema)]
pub struct StudioSettings {
    #[schema(value_type = Option<String>)]
    pub monthly_budget_usd: Option<Decimal>,
    pub max_concurrent: Option<i32>,
}

/// Define el presupuesto mensual y la concurrencia (requiere `settings.manage`).
#[utoipa::path(put, path = "/api/v1/admin/ai/settings", tag = "ai-studio", security(("bearer" = [])), request_body = StudioSettings, responses((status = 204)))]
pub async fn update_settings(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Json(b): Json<StudioSettings>) -> AppResult<StatusCode> {
    user.require("settings.manage")?;
    if let Some(budget) = b.monthly_budget_usd {
        if budget.is_sign_negative() {
            return Err(AppError::BadRequest("el presupuesto no puede ser negativo".into()));
        }
        sqlx::query("UPDATE system_settings SET value = to_jsonb($1::text), updated_by = $2, updated_at = now() WHERE key = 'higgsfield.monthly_budget_usd'")
            .bind(budget.to_string()).bind(user.id()).execute(&state.db).await?;
    }
    if let Some(n) = b.max_concurrent {
        if !(1..=20).contains(&n) {
            return Err(AppError::BadRequest("concurrencia entre 1 y 20".into()));
        }
        sqlx::query("UPDATE system_settings SET value = to_jsonb($1), updated_by = $2, updated_at = now() WHERE key = 'higgsfield.max_concurrent'")
            .bind(n).bind(user.id()).execute(&state.db).await?;
    }
    audit::log(&state.db, Some(user.id()), "update", "ai_settings", None,
        Some(json!({"budget": b.monthly_budget_usd.map(|d| d.to_string()), "max_concurrent": b.max_concurrent})), &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize, IntoParams)]
pub struct ModelQuery {
    /// text-to-video | image-to-video
    pub mode: Option<String>,
}

/// Modelos de video disponibles con sus parámetros documentados.
#[utoipa::path(get, path = "/api/v1/admin/ai/models", tag = "ai-studio", security(("bearer" = [])), params(ModelQuery), responses((status = 200, body = Vec<Object>)))]
pub async fn models(State(state): State<AppState>, user: AuthUser, Query(q): Query<ModelQuery>) -> AppResult<Json<Value>> {
    user.require("ai.generate")?;
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT jsonb_build_object('endpoint', endpoint_id, 'family', family, 'title', title, 'mode', mode,
            'params', params_schema, 'required', to_jsonb(required), 'imageParam', image_param,
            'aspectRatios', params_schema #> '{aspect_ratio,enum}',
            'durations', COALESCE(params_schema #> '{duration,enum}',
               CASE WHEN params_schema ? 'duration' THEN jsonb_build_object('min', params_schema #> '{duration,minimum}', 'max', params_schema #> '{duration,maximum}') END),
            'resolutions', params_schema #> '{resolution,enum}',
            'docUrl', doc_url, 'verifiedAt', verified_at)
         FROM video_models WHERE is_enabled AND ($1::text IS NULL OR mode = $1) ORDER BY family, title",
    )
    .bind(q.mode)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Value::Array(rows)))
}

/// Biblioteca de prompts profesionales (editable).
#[utoipa::path(get, path = "/api/v1/admin/ai/templates", tag = "ai-studio", security(("bearer" = [])), responses((status = 200, body = Vec<Object>)))]
pub async fn templates(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    user.require("ai.generate")?;
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT jsonb_build_object('id', t.id, 'key', t.key, 'name', t.name, 'description', t.description, 'prompt', t.prompt,
            'negativePrompt', t.negative_prompt, 'aspectRatio', t.aspect_ratio, 'duration', t.duration_s,
            'category', c.key, 'defaultModel', t.default_model)
         FROM video_templates t LEFT JOIN media_categories c ON c.id = t.media_category_id WHERE t.is_active ORDER BY t.created_at",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Value::Array(rows)))
}

#[derive(Deserialize, ToSchema)]
pub struct TemplateInput {
    pub name: String,
    pub description: Option<String>,
    pub prompt: String,
    pub negative_prompt: Option<String>,
    /// 16:9 | 9:16 | 1:1 | 4:5
    pub aspect_ratio: String,
    pub duration: i16,
    pub category: Option<String>,
}

/// Crea o actualiza una plantilla de prompt.
#[utoipa::path(put, path = "/api/v1/admin/ai/templates/{key}", tag = "ai-studio", security(("bearer" = [])),
    params(("key" = String, Path)), request_body = TemplateInput, responses((status = 204)))]
pub async fn upsert_template(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(key): Path<String>, Json(b): Json<TemplateInput>) -> AppResult<StatusCode> {
    user.require("ai.generate")?;
    crate::validation::slug(&key).map_err(|_| AppError::BadRequest("clave inválida".into()))?;
    if b.prompt.trim().len() < 10 {
        return Err(AppError::BadRequest("el prompt es demasiado corto".into()));
    }
    sqlx::query(
        "INSERT INTO video_templates (key, name, description, prompt, negative_prompt, aspect_ratio, duration_s, media_category_id)
         VALUES ($1,$2,$3,$4,$5,$6::aspect_ratio,$7,(SELECT id FROM media_categories WHERE key = $8))
         ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, prompt = EXCLUDED.prompt,
           negative_prompt = EXCLUDED.negative_prompt, aspect_ratio = EXCLUDED.aspect_ratio, duration_s = EXCLUDED.duration_s,
           media_category_id = EXCLUDED.media_category_id, updated_at = now()",
    )
    .bind(&key).bind(&b.name).bind(&b.description).bind(&b.prompt).bind(&b.negative_prompt)
    .bind(&b.aspect_ratio).bind(b.duration).bind(&b.category)
    .execute(&state.db)
    .await?;
    audit::log(&state.db, Some(user.id()), "update", "video_template", Some(key), None, &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

/// Formatos de salida por canal. La disponibilidad real depende del modelo elegido.
#[utoipa::path(get, path = "/api/v1/admin/ai/presets", tag = "ai-studio", security(("bearer" = [])), responses((status = 200, body = Vec<Object>)))]
pub async fn presets(user: AuthUser) -> AppResult<Json<Value>> {
    user.require("ai.generate")?;
    Ok(Json(json!([
        {"key": "vertical", "name": "Vertical", "aspectRatio": "9:16", "channels": ["Instagram Reels", "TikTok", "YouTube Shorts"]},
        {"key": "horizontal", "name": "Horizontal", "aspectRatio": "16:9", "channels": ["Página principal", "Videos promocionales", "YouTube", "Presentaciones comerciales"]},
        {"key": "square", "name": "Cuadrado", "aspectRatio": "1:1", "channels": ["Redes sociales", "Publicaciones promocionales"]}
    ])))
}

#[derive(Deserialize, ToSchema)]
pub struct GenerationInput {
    /// Endpoint del modelo, p.ej. `kling-video/v3.0/pro/text-to-video`.
    pub model: String,
    pub prompt: String,
    /// Parámetros adicionales admitidos por el modelo (duration, aspect_ratio, …).
    #[serde(default)]
    #[schema(value_type = Object)]
    pub params: Map<String, Value>,
    /// Fotografía de la biblioteca usada como referencia (modelos image-to-video).
    pub reference_media_id: Option<Uuid>,
    pub template: Option<String>,
    pub category: Option<String>,
    pub destination: Option<String>,
    pub package: Option<String>,
    /// Solo estima el costo; no crea la generación.
    #[serde(default)]
    pub dry_run: bool,
}

/// Valida, estima el costo, comprueba el presupuesto y encola la generación.
#[utoipa::path(post, path = "/api/v1/admin/ai/generations", tag = "ai-studio", security(("bearer" = [])),
    request_body = GenerationInput, responses((status = 201, body = Object), (status = 200, description = "dry_run: estimación"), (status = 422, body = crate::errors::ErrorBody)))]
pub async fn create(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Json(b): Json<GenerationInput>) -> AppResult<(StatusCode, Json<Value>)> {
    user.require("ai.generate")?;
    let model: Option<(Value, Vec<String>, Option<String>, String)> =
        sqlx::query_as("SELECT params_schema, required, image_param, mode FROM video_models WHERE endpoint_id = $1 AND is_enabled")
            .bind(&b.model)
            .fetch_optional(&state.db)
            .await?;
    let (schema, required, image_param, mode) = model.ok_or(AppError::BadRequest("modelo no disponible".into()))?;
    let schema = schema.as_object().cloned().unwrap_or_default();

    // Validación contra el esquema documentado (prompt e imagen se añaden aquí).
    let mut full = b.params.clone();
    for k in ["prompt"].iter().chain(image_param.iter().map(|s| s.as_str()).collect::<Vec<_>>().iter()) {
        if full.contains_key(*k) {
            return Err(AppError::BadRequest(format!("`{k}` se envía con su campo propio, no en params")));
        }
    }
    if !b.prompt.trim().is_empty() {
        if !schema.contains_key("prompt") {
            return Err(AppError::BadRequest("este modelo no admite prompt".into()));
        }
        full.insert("prompt".into(), Value::String(b.prompt.clone()));
    }
    let has_ref = b.reference_media_id.is_some();
    if has_ref && image_param.is_none() {
        return Err(AppError::BadRequest("este modelo no admite imagen de referencia; elige un modelo image-to-video".into()));
    }
    if let (Some(p), true) = (&image_param, has_ref) {
        full.insert(p.clone(), Value::String("https://placeholder.invalid/ref".into()));
    }
    params::validate(&schema, &required, &full).map_err(|errs| AppError::Validation(json!({ "params": errs })))?;

    let ref_info: Option<(String, String)> = match b.reference_media_id {
        Some(id) => Some(
            sqlx::query_as("SELECT kind::text, path FROM media_assets WHERE id = $1 AND deleted_at IS NULL")
                .bind(id)
                .fetch_optional(&state.db)
                .await?
                .ok_or(AppError::NotFound("fotografía de referencia"))?,
        ),
        None => None,
    };
    if ref_info.as_ref().is_some_and(|(k, _)| k != "image") {
        return Err(AppError::BadRequest("la referencia debe ser una fotografía".into()));
    }

    // Control de costos: estimación real de Higgsfield + presupuesto mensual.
    let hf = client(&state)?;
    let budget = setting_decimal(&state.db, "higgsfield.monthly_budget_usd").await?;
    // Estimar es gratis: se permite sin presupuesto. Generar exige un presupuesto mensual > 0.
    if budget <= Decimal::ZERO && !b.dry_run {
        return Err(AppError::Unprocessable("define un presupuesto mensual (Configuración del estudio) antes de generar".into()));
    }
    // Para estimar un modelo image-to-video se sube la referencia: el costo depende de los mismos parámetros.
    let reference_url = match (&image_param, b.reference_media_id) {
        (Some(_), Some(id)) => Some(upload_ref(&state, &hf, id).await?),
        _ => None,
    };
    let body = worker::build_body(&b.prompt, &Value::Object(b.params.clone()), image_param.as_deref(), reference_url.as_deref());
    let estimate = hf.estimate(&b.model, &body).await.map_err(|e| AppError::Unprocessable(format!("no se pudo estimar el costo: {e}")))?;
    let spent: Decimal = sqlx::query_scalar("SELECT ai_spend_this_month()").fetch_one(&state.db).await?;
    let within = spent + estimate <= budget;
    if b.dry_run {
        return Ok((StatusCode::OK, Json(json!({
            "estimateUsd": estimate.to_string(), "spentThisMonthUsd": spent.to_string(),
            "monthlyBudgetUsd": budget.to_string(), "withinBudget": within, "mode": mode
        }))));
    }
    if !within {
        return Err(AppError::Unprocessable(format!(
            "presupuesto mensual insuficiente: gastado {spent} + estimado {estimate} > {budget} USD"
        )));
    }

    let aspect = b.params.get("aspect_ratio").and_then(Value::as_str).filter(|a| ["16:9", "9:16", "1:1", "4:5"].contains(a)).unwrap_or("16:9");
    let duration = b.params.get("duration").and_then(Value::as_i64).unwrap_or(5) as i16;
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO video_generations (template_id, provider, model, model_endpoint, prompt, params, reference_media_id,
            reference_url, aspect_ratio, duration_s, estimated_cost, media_category_id, destination_id, package_id, requested_by, status)
         VALUES ((SELECT id FROM video_templates WHERE key = $1), 'higgsfield', $2, $2, $3, $4, $5, $6, $7::aspect_ratio, $8, $9,
            (SELECT id FROM media_categories WHERE key = $10), (SELECT id FROM destinations WHERE slug = $11),
            (SELECT id FROM tour_packages WHERE slug = $12), $13, 'queued')
         RETURNING id",
    )
    .bind(&b.template).bind(&b.model).bind(&b.prompt)
    .bind(Value::Object(b.params.clone())).bind(b.reference_media_id).bind(&reference_url)
    .bind(aspect).bind(duration).bind(estimate).bind(&b.category).bind(&b.destination).bind(&b.package).bind(user.id())
    .fetch_one(&state.db)
    .await?;
    audit::log(&state.db, Some(user.id()), "create", "video_generation", Some(id.to_string()),
        Some(json!({"model": b.model, "estimate_usd": estimate.to_string()})), &headers).await;
    Ok((StatusCode::CREATED, Json(json!({"id": id, "status": "queued", "estimateUsd": estimate.to_string()}))))
}

async fn upload_ref(state: &AppState, hf: &HiggsfieldClient, id: Uuid) -> AppResult<String> {
    let (path, mime): (String, Option<String>) = sqlx::query_as("SELECT path, mime_type FROM media_assets WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    let ct = mime.unwrap_or_else(|| "image/jpeg".into());
    if !["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].contains(&ct.as_str()) {
        return Err(AppError::Unprocessable(format!("Higgsfield no admite {ct} como referencia; elige una foto JPG, PNG o WebP")));
    }
    let file = crate::storage::fs_path(&state.config, &path).ok_or(AppError::NotFound("archivo"))?;
    let bytes = tokio::fs::read(&file).await.map_err(|e| AppError::Internal(e.into()))?;
    hf.upload(bytes, &ct).await.map_err(|e| AppError::Unprocessable(format!("subida de la referencia: {e}")))
}

fn generation_json() -> &'static str {
    "jsonb_build_object('id', g.id, 'status', g.status, 'reviewStatus', g.review_status, 'model', g.model_endpoint,
        'prompt', g.prompt, 'params', g.params, 'aspectRatio', g.aspect_ratio, 'duration', g.duration_s,
        'requestId', g.external_job_id, 'correlationId', g.correlation_id, 'attempts', g.attempts, 'error', g.error,
        'estimatedUsd', g.estimated_cost::text, 'createdAt', g.created_at, 'submittedAt', g.submitted_at, 'completedAt', g.completed_at,
        'expiresAt', g.expires_at, 'template', (SELECT key FROM video_templates t WHERE t.id = g.template_id),
        'category', (SELECT key FROM media_categories c WHERE c.id = g.media_category_id),
        'destination', (SELECT slug FROM destinations d WHERE d.id = g.destination_id),
        'package', (SELECT slug FROM tour_packages p WHERE p.id = g.package_id),
        'requestedBy', (SELECT email::text FROM users u WHERE u.id = g.requested_by),
        'reference', (SELECT jsonb_build_object('id', m.id, 'path', m.path, 'title', m.title) FROM media_assets m WHERE m.id = g.reference_media_id),
        'result', (SELECT jsonb_build_object('id', m.id, 'path', m.path, 'posterPath', m.poster_path, 'status', m.status,
                    'width', m.width, 'height', m.height, 'duration', m.duration_s) FROM media_assets m WHERE m.id = g.result_media_id))"
}

#[derive(Deserialize, IntoParams)]
pub struct GenerationQuery {
    pub status: Option<String>,
}

/// Historial de generaciones.
#[utoipa::path(get, path = "/api/v1/admin/ai/generations", tag = "ai-studio", security(("bearer" = [])), params(GenerationQuery), responses((status = 200, body = Vec<Object>)))]
pub async fn list(State(state): State<AppState>, user: AuthUser, Query(q): Query<GenerationQuery>) -> AppResult<Json<Value>> {
    user.require("ai.generate")?;
    let sql = format!(
        "SELECT {} FROM video_generations g WHERE ($1::text IS NULL OR g.status::text = $1) ORDER BY g.created_at DESC LIMIT 100",
        generation_json()
    );
    let mut rows = Value::Array(sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(q.status).fetch_all(&state.db).await?);
    decorate(&state.config, &mut rows);
    Ok(Json(rows))
}

/// Detalle de una generación (para seguimiento del estado).
#[utoipa::path(get, path = "/api/v1/admin/ai/generations/{id}", tag = "ai-studio", security(("bearer" = [])), params(("id" = Uuid, Path)), responses((status = 200, body = Object)))]
pub async fn get(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    user.require("ai.generate")?;
    let sql = format!("SELECT {} FROM video_generations g WHERE g.id = $1", generation_json());
    let mut row: Value = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound("generación"))?;
    decorate(&state.config, &mut row);
    Ok(Json(row))
}

/// Cancela una generación que aún no empezó a procesarse.
#[utoipa::path(post, path = "/api/v1/admin/ai/generations/{id}/cancel", tag = "ai-studio", security(("bearer" = [])), params(("id" = Uuid, Path)), responses((status = 204), (status = 409, body = crate::errors::ErrorBody)))]
pub async fn cancel(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    user.require("ai.generate")?;
    let row: Option<(String, Option<String>)> = sqlx::query_as("SELECT status::text, external_job_id FROM video_generations WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?;
    let (st, request_id) = row.ok_or(AppError::NotFound("generación"))?;
    match (st.as_str(), request_id) {
        ("queued", None) => {}
        ("submitted", Some(rid)) => {
            client(&state)?
                .cancel(&rid)
                .await
                .map_err(|e| AppError::Conflict(format!("Higgsfield no permitió cancelar (ya en proceso): {e}")))?;
        }
        _ => return Err(AppError::Conflict(format!("no se puede cancelar en estado {st}"))),
    }
    sqlx::query("UPDATE video_generations SET status = 'cancelled', completed_at = now(), next_poll_at = NULL WHERE id = $1").bind(id).execute(&state.db).await?;
    audit::log(&state.db, Some(user.id()), "cancel", "video_generation", Some(id.to_string()), None, &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize, ToSchema)]
pub struct ReviewInput {
    /// approve | discard
    pub decision: String,
    pub title: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub destinations: Vec<String>,
    #[serde(default)]
    pub packages: Vec<String>,
    #[serde(default)]
    pub publish: bool,
}

/// Pasos 9–12: aprobar o descartar, guardar en la galería, asociar y publicar.
#[utoipa::path(post, path = "/api/v1/admin/ai/generations/{id}/review", tag = "ai-studio", security(("bearer" = [])), params(("id" = Uuid, Path)), request_body = ReviewInput, responses((status = 204)))]
pub async fn review(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<ReviewInput>) -> AppResult<StatusCode> {
    user.require("ai.generate")?;
    let row: Option<(String, Option<Uuid>)> = sqlx::query_as("SELECT status::text, result_media_id FROM video_generations WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?;
    let (st, media) = row.ok_or(AppError::NotFound("generación"))?;
    let media = media.filter(|_| st == "succeeded").ok_or(AppError::Conflict("la generación no tiene un resultado".into()))?;
    if b.publish && !user.0.perms.iter().any(|p| p == "media.write") && !user.0.roles.iter().any(|r| r == "superadmin") {
        return Err(AppError::Forbidden);
    }
    let mut tx = state.db.begin().await?;
    match b.decision.as_str() {
        "approve" => {
            sqlx::query(
                "UPDATE media_assets SET title = COALESCE($2, title), description = COALESCE($3, description),
                   status = CASE WHEN $4 THEN 'published'::publish_status ELSE status END,
                   published_at = CASE WHEN $4 THEN now() ELSE published_at END WHERE id = $1",
            )
            .bind(media).bind(&b.title).bind(&b.description).bind(b.publish)
            .execute(&mut *tx)
            .await?;
            crate::media::set_links(&mut tx, media, Some(&b.categories), Some(&b.destinations.iter().map(|s| (s.clone(), "verified".to_string())).collect::<Vec<_>>()), Some(&b.packages)).await?;
            sqlx::query("UPDATE video_generations SET review_status = 'approved', reviewed_by = $2, reviewed_at = now() WHERE id = $1")
                .bind(id).bind(user.id()).execute(&mut *tx).await?;
        }
        "discard" => {
            sqlx::query("UPDATE media_assets SET status = 'archived', deleted_at = now() WHERE id = $1").bind(media).execute(&mut *tx).await?;
            sqlx::query("UPDATE video_generations SET review_status = 'discarded', reviewed_by = $2, reviewed_at = now() WHERE id = $1")
                .bind(id).bind(user.id()).execute(&mut *tx).await?;
        }
        _ => return Err(AppError::BadRequest("decision: approve | discard".into())),
    }
    audit::log(&mut *tx, Some(user.id()), "review", "video_generation", Some(id.to_string()),
        Some(json!({"decision": b.decision, "publish": b.publish})), &headers).await;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

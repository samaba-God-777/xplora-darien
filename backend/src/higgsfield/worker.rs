//! Cola asíncrona de generaciones (Tokio). Ciclo:
//! queued → (subida de referencia) → envío con Idempotency-Key → submitted → processing
//! → completed: descarga a STORAGE_DIR/generated, crea media_asset en borrador (pendiente de aprobación)
//! → failed / nsfw / cancelled: se registra el error (Higgsfield no cobra estos casos).
use std::time::Duration;

use rand::RngExt;
use serde_json::{Map, Value};
use sqlx::PgPool;
use uuid::Uuid;

use super::client::{HfError, HiggsfieldClient};
use crate::{config::Config, media::processing, storage};

const MAX_SUBMIT_ATTEMPTS: i16 = 5;

pub fn spawn(db: PgPool, config: std::sync::Arc<Config>) {
    tokio::spawn(async move {
        tracing::info!(higgsfield = config.higgsfield.is_configured(), "worker de medios iniciado");
        loop {
            if let Err(e) = tick(&db, &config).await {
                tracing::error!(error = %e, "ciclo del worker");
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
}

/// Un ciclo completo (también se usa en las pruebas).
pub async fn tick(db: &PgPool, config: &Config) -> anyhow::Result<()> {
    processing::run_pending(db, config, 4).await?;
    crate::notifications::process(db, config, 20).await?;
    if let Some(client) = HiggsfieldClient::from_config(&config.higgsfield) {
        submit_queued(db, config, &client).await?;
        poll_running(db, config, &client).await?;
    }
    Ok(())
}

fn backoff_secs(err: &HfError, attempt: i16) -> f64 {
    err.retry_after.map(|s| s as f64).unwrap_or_else(|| (2f64 * 1.5f64.powi(attempt as i32)).min(60.0)) + rand::rng().random_range(0.0..1.0)
}

async fn submit_queued(db: &PgPool, config: &Config, client: &HiggsfieldClient) -> anyhow::Result<()> {
    let max: i64 = sqlx::query_scalar("SELECT COALESCE((SELECT (value #>> '{}')::bigint FROM system_settings WHERE key = 'higgsfield.max_concurrent'), 2)")
        .fetch_one(db)
        .await?;
    let in_flight: i64 = sqlx::query_scalar("SELECT count(*) FROM video_generations WHERE status IN ('submitted','processing')").fetch_one(db).await?;
    if in_flight >= max {
        return Ok(());
    }
    let mut tx = db.begin().await?;
    #[allow(clippy::type_complexity)]
    let row: Option<(Uuid, String, String, Value, Uuid, Option<Uuid>, Option<String>, i16, Option<String>)> = sqlx::query_as(
        "SELECT g.id, g.model_endpoint, g.prompt, g.params, g.idempotency_key, g.reference_media_id, g.reference_url, g.attempts, vm.image_param
         FROM video_generations g JOIN video_models vm ON vm.endpoint_id = g.model_endpoint
         WHERE g.status = 'queued' AND (g.next_poll_at IS NULL OR g.next_poll_at <= now())
         ORDER BY g.created_at LIMIT 1 FOR UPDATE OF g SKIP LOCKED",
    )
    .fetch_optional(&mut *tx)
    .await?;
    let Some((id, endpoint, prompt, params, idem, ref_media, mut ref_url, attempts, image_param)) = row else {
        return Ok(());
    };

    let outcome: Result<super::client::Submitted, HfError> = async {
        if let (Some(param), Some(media_id), None) = (&image_param, ref_media, &ref_url) {
            ref_url = Some(upload_reference(db, config, client, media_id).await?);
            let _ = param;
        }
        let body = build_body(&prompt, &params, image_param.as_deref(), ref_url.as_deref());
        client.submit(&endpoint, &body, &idem.to_string()).await
    }
    .await;

    match outcome {
        Ok(s) => {
            sqlx::query(
                "UPDATE video_generations SET status = 'submitted', external_job_id = $2, status_url = $3, cancel_url = $4,
                   correlation_id = $5, reference_url = $6, submitted_at = now(), attempts = attempts + 1,
                   next_poll_at = now() + interval '2 seconds', error = NULL WHERE id = $1",
            )
            .bind(id).bind(&s.request_id).bind(&s.status_url).bind(&s.cancel_url).bind(&s.correlation_id).bind(&ref_url)
            .execute(&mut *tx)
            .await?;
            tracing::info!(%id, request_id = %s.request_id, model = %endpoint, "generación enviada a Higgsfield");
        }
        Err(e) if e.retryable && attempts + 1 < MAX_SUBMIT_ATTEMPTS => {
            let wait = backoff_secs(&e, attempts);
            sqlx::query("UPDATE video_generations SET attempts = attempts + 1, error = $2, reference_url = $3, next_poll_at = now() + make_interval(secs => $4) WHERE id = $1")
                .bind(id).bind(e.to_string()).bind(&ref_url).bind(wait)
                .execute(&mut *tx)
                .await?;
            tracing::warn!(%id, error = %e, "envío reintentable");
        }
        Err(e) => {
            sqlx::query("UPDATE video_generations SET status = 'failed', attempts = attempts + 1, error = $2, completed_at = now() WHERE id = $1")
                .bind(id).bind(e.to_string())
                .execute(&mut *tx)
                .await?;
            tracing::warn!(%id, error = %e, "envío fallido");
        }
    }
    tx.commit().await?;
    Ok(())
}

pub fn build_body(prompt: &str, params: &Value, image_param: Option<&str>, image_url: Option<&str>) -> Value {
    let mut body: Map<String, Value> = params.as_object().cloned().unwrap_or_default();
    if !prompt.trim().is_empty() {
        body.insert("prompt".into(), Value::String(prompt.to_string()));
    }
    if let (Some(p), Some(u)) = (image_param, image_url) {
        body.insert(p.to_string(), Value::String(u.to_string()));
    }
    Value::Object(body)
}

async fn upload_reference(db: &PgPool, config: &Config, client: &HiggsfieldClient, media_id: Uuid) -> Result<String, HfError> {
    let local = |m: &str| HfError { status: None, retryable: false, retry_after: None, message: m.to_string() };
    let (path, mime): (String, Option<String>) = sqlx::query_as("SELECT path, mime_type FROM media_assets WHERE id = $1")
        .bind(media_id)
        .fetch_one(db)
        .await
        .map_err(|e| local(&e.to_string()))?;
    let content_type = mime.unwrap_or_else(|| "image/jpeg".into());
    // Tipos admitidos por la subida de Higgsfield (docs: File uploads).
    if !["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].contains(&content_type.as_str()) {
        return Err(local(&format!("Higgsfield no admite {content_type} como imagen de referencia; usa JPG, PNG o WebP")));
    }
    let file = storage::fs_path(config, &path).ok_or_else(|| local("ruta de referencia no válida"))?;
    let bytes = tokio::fs::read(&file).await.map_err(|e| local(&e.to_string()))?;
    client.upload(bytes, &content_type).await
}

async fn poll_running(db: &PgPool, config: &Config, client: &HiggsfieldClient) -> anyhow::Result<()> {
    #[allow(clippy::type_complexity)]
    let rows: Vec<(Uuid, String, Option<String>, Option<chrono::DateTime<chrono::Utc>>, String, Option<i16>, Option<String>)> = sqlx::query_as(
        "SELECT g.id, g.external_job_id, g.status_url, g.submitted_at, g.prompt, g.media_category_id,
                (SELECT name FROM video_templates t WHERE t.id = g.template_id)
         FROM video_generations g WHERE g.status IN ('submitted','processing') AND g.next_poll_at <= now()
         ORDER BY g.next_poll_at LIMIT 10",
    )
    .fetch_all(db)
    .await?;
    for (id, request_id, status_url, submitted_at, prompt, category, template) in rows {
        let age = submitted_at.map(|t| (chrono::Utc::now() - t).num_seconds()).unwrap_or(0) as f64;
        // Recomendación de la documentación: empezar en 2 s y crecer hasta 10 s, con jitter.
        let next = (2.0 + age / 15.0).min(10.0) + rand::rng().random_range(0.0..0.5);
        match client.status(&request_id, status_url.as_deref()).await {
            Ok(s) => match s.status.as_str() {
                "queued" | "in_progress" => {
                    let st = if s.status == "queued" { "submitted" } else { "processing" };
                    sqlx::query("UPDATE video_generations SET status = $2::generation_status, next_poll_at = now() + make_interval(secs => $3) WHERE id = $1")
                        .bind(id).bind(st).bind(next)
                        .execute(db)
                        .await?;
                }
                "completed" => {
                    let Some(video) = s.video else {
                        mark_failed(db, id, "completada sin video en la respuesta").await?;
                        continue;
                    };
                    match store_result(db, config, client, id, &video.url, &prompt, template.as_deref(), category).await {
                        Ok(media_id) => {
                            sqlx::query(
                                "UPDATE video_generations SET status = 'succeeded', result_url = $2, expires_at = $3, result_media_id = $4,
                                   completed_at = now(), next_poll_at = NULL, error = NULL WHERE id = $1",
                            )
                            .bind(id).bind(&video.url).bind(s.expires_at).bind(media_id)
                            .execute(db)
                            .await?;
                            tracing::info!(%id, %media_id, "generación completada y guardada");
                        }
                        Err(e) => {
                            tracing::warn!(%id, error = %e, "descarga del resultado; se reintenta");
                            sqlx::query("UPDATE video_generations SET error = $2, next_poll_at = now() + interval '30 seconds' WHERE id = $1")
                                .bind(id).bind(format!("descarga: {e}"))
                                .execute(db)
                                .await?;
                        }
                    }
                }
                "failed" | "nsfw" | "canceled" => {
                    let st = match s.status.as_str() {
                        "nsfw" => "nsfw",
                        "canceled" => "cancelled",
                        _ => "failed",
                    };
                    let msg = s.error.unwrap_or_else(|| match st {
                        "nsfw" => "rechazada por moderación de contenido (no se cobra)".into(),
                        "cancelled" => "cancelada".into(),
                        _ => "la generación falló (no se cobra)".into(),
                    });
                    sqlx::query("UPDATE video_generations SET status = $2::generation_status, error = $3, completed_at = now(), next_poll_at = NULL WHERE id = $1")
                        .bind(id).bind(st).bind(msg)
                        .execute(db)
                        .await?;
                }
                other => {
                    tracing::warn!(%id, status = other, "estado desconocido de Higgsfield");
                    sqlx::query("UPDATE video_generations SET next_poll_at = now() + interval '10 seconds' WHERE id = $1").bind(id).execute(db).await?;
                }
            },
            Err(e) if e.retryable => {
                sqlx::query("UPDATE video_generations SET error = $2, next_poll_at = now() + make_interval(secs => $3) WHERE id = $1")
                    .bind(id).bind(e.to_string()).bind(backoff_secs(&e, 3))
                    .execute(db)
                    .await?;
            }
            Err(e) => mark_failed(db, id, &e.to_string()).await?,
        }
    }
    Ok(())
}

async fn mark_failed(db: &PgPool, id: Uuid, msg: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE video_generations SET status = 'failed', error = $2, completed_at = now(), next_poll_at = NULL WHERE id = $1")
        .bind(id)
        .bind(msg)
        .execute(db)
        .await
        .map(|_| ())
}

#[allow(clippy::too_many_arguments)]
async fn store_result(
    db: &PgPool,
    config: &Config,
    client: &HiggsfieldClient,
    generation_id: Uuid,
    url: &str,
    prompt: &str,
    template: Option<&str>,
    category: Option<i16>,
) -> anyhow::Result<Uuid> {
    let bytes = client.download(url).await.map_err(|e| anyhow::anyhow!(e.to_string()))?;
    let rel = format!("generated/{generation_id}.mp4");
    let dest = config.storage_dir.join(&rel);
    if let Some(dir) = dest.parent() {
        tokio::fs::create_dir_all(dir).await?;
    }
    tokio::fs::write(&dest, &bytes).await?;
    let sha = hex::encode(<sha2::Sha256 as sha2::Digest>::digest(&bytes));
    let title = template.map(|t| format!("{t} · IA")).unwrap_or_else(|| prompt.chars().take(60).collect());
    let media_id: Uuid = sqlx::query_scalar(
        "INSERT INTO media_assets (kind, content_type, path, source, bytes, sha256, mime_type, title, description, status)
         VALUES ('video', 'video', $1, 'higgsfield', $2, $3, 'video/mp4', $4, $5, 'draft')
         ON CONFLICT (path) DO UPDATE SET bytes = EXCLUDED.bytes RETURNING id",
    )
    .bind(&rel)
    .bind(bytes.len() as i64)
    .bind(sha)
    .bind(title)
    .bind(format!("Video generado con IA (Higgsfield). Prompt: {prompt}"))
    .fetch_one(db)
    .await?;
    if let Some(c) = category {
        sqlx::query("INSERT INTO media_asset_categories (media_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
            .bind(media_id)
            .bind(c)
            .execute(db)
            .await?;
    }
    processing::enqueue(db, media_id, true).await?;
    Ok(media_id)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn body_adds_prompt_and_image_only_when_supported() {
        let b = super::build_body("selva", &json!({"duration": 5}), Some("image_url"), Some("https://x/a.jpg"));
        assert_eq!(b, json!({"duration": 5, "prompt": "selva", "image_url": "https://x/a.jpg"}));
        let b = super::build_body("selva", &json!({}), None, Some("https://x/a.jpg"));
        assert_eq!(b, json!({"prompt": "selva"}));
    }
}

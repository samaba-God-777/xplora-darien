//! Procesamiento de medios (ffprobe/ffmpeg): metadatos y pósters de video.
//! Nunca escribe sobre los originales de pageWeb: los pósters van a STORAGE_DIR/posters/.
use std::path::Path;

use serde_json::Value;
use sqlx::PgPool;
use tokio::process::Command;
use uuid::Uuid;

use crate::{config::Config, storage};

pub async fn enqueue(db: &PgPool, media_id: Uuid, is_video: bool) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO media_processing_jobs (media_id, kind) VALUES ($1, 'probe') ON CONFLICT (media_id, kind) DO UPDATE SET status = 'pending', attempts = 0, run_after = now()")
        .bind(media_id)
        .execute(db)
        .await?;
    if is_video {
        sqlx::query("INSERT INTO media_processing_jobs (media_id, kind) VALUES ($1, 'poster') ON CONFLICT (media_id, kind) DO UPDATE SET status = 'pending', attempts = 0, run_after = now()")
            .bind(media_id)
            .execute(db)
            .await?;
    }
    Ok(())
}

/// Ancho, alto y duración (si es video).
pub async fn probe(path: &Path) -> anyhow::Result<(Option<i32>, Option<i32>, Option<f64>)> {
    let out = Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json"])
        .arg(path)
        .output()
        .await?;
    anyhow::ensure!(out.status.success(), "ffprobe: {}", String::from_utf8_lossy(&out.stderr));
    let v: Value = serde_json::from_slice(&out.stdout)?;
    let s = &v["streams"][0];
    Ok((
        s["width"].as_i64().map(|x| x as i32),
        s["height"].as_i64().map(|x| x as i32),
        v["format"]["duration"].as_str().and_then(|d| d.parse().ok()),
    ))
}

async fn poster(src: &Path, dest: &Path) -> anyhow::Result<()> {
    if let Some(dir) = dest.parent() {
        tokio::fs::create_dir_all(dir).await?;
    }
    let out = Command::new("ffmpeg")
        .args(["-v", "error", "-y", "-ss", "1", "-i"])
        .arg(src)
        .args(["-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3"])
        .arg(dest)
        .output()
        .await?;
    anyhow::ensure!(out.status.success(), "ffmpeg: {}", String::from_utf8_lossy(&out.stderr));
    Ok(())
}

/// Procesa hasta `limit` trabajos pendientes. Devuelve cuántos procesó.
pub async fn run_pending(db: &PgPool, config: &Config, limit: i64) -> anyhow::Result<usize> {
    let jobs: Vec<(Uuid, Uuid, String, String)> = sqlx::query_as(
        "UPDATE media_processing_jobs j SET status = 'running', attempts = attempts + 1
         FROM media_assets m
         WHERE j.id IN (SELECT id FROM media_processing_jobs WHERE status = 'pending' AND run_after <= now()
                        ORDER BY run_after LIMIT $1 FOR UPDATE SKIP LOCKED)
           AND m.id = j.media_id
         RETURNING j.id, j.media_id, j.kind, m.path",
    )
    .bind(limit)
    .fetch_all(db)
    .await?;
    for (job_id, media_id, kind, path) in &jobs {
        let result: anyhow::Result<()> = async {
            let src = storage::fs_path(config, path).ok_or_else(|| anyhow::anyhow!("ruta no válida"))?;
            match kind.as_str() {
                "probe" => {
                    let (w, h, d) = probe(&src).await?;
                    let bytes = tokio::fs::metadata(&src).await.map(|m| m.len() as i64).ok();
                    sqlx::query("UPDATE media_assets SET width = COALESCE($2, width), height = COALESCE($3, height), duration_s = COALESCE($4::numeric, duration_s), bytes = COALESCE($5, bytes) WHERE id = $1")
                        .bind(media_id).bind(w).bind(h).bind(d).bind(bytes)
                        .execute(db)
                        .await?;
                }
                "poster" => {
                    let rel = format!("posters/{media_id}.jpg");
                    poster(&src, &config.storage_dir.join(&rel)).await?;
                    sqlx::query("UPDATE media_assets SET poster_path = $2 WHERE id = $1").bind(media_id).bind(&rel).execute(db).await?;
                }
                other => anyhow::bail!("trabajo desconocido: {other}"),
            }
            Ok(())
        }
        .await;
        match result {
            Ok(()) => {
                sqlx::query("UPDATE media_processing_jobs SET status = 'done', error = NULL, finished_at = now() WHERE id = $1").bind(job_id).execute(db).await?;
            }
            Err(e) => {
                tracing::warn!(%media_id, kind, error = %e, "fallo de procesamiento");
                sqlx::query(
                    "UPDATE media_processing_jobs SET status = CASE WHEN attempts >= 3 THEN 'failed'::job_status ELSE 'pending'::job_status END,
                       error = $2, run_after = now() + interval '30 seconds' WHERE id = $1",
                )
                .bind(job_id)
                .bind(e.to_string())
                .execute(db)
                .await?;
            }
        }
    }
    Ok(jobs.len())
}

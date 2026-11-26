//! Registro de auditoría. Nunca hace fallar la petición: los errores se registran en logs.
use axum::http::HeaderMap;
use serde_json::Value;
use uuid::Uuid;

pub async fn log<'e, E>(
    db: E,
    user_id: Option<Uuid>,
    action: &str,
    entity_type: &str,
    entity_id: Option<String>,
    changes: Option<Value>,
    headers: &HeaderMap,
) where
    E: sqlx::PgExecutor<'e>,
{
    let ip = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|s| s.trim().to_string());
    let ua = headers.get(axum::http::header::USER_AGENT).and_then(|v| v.to_str().ok()).map(str::to_string);
    let res = sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6::inet, $7)",
    )
    .bind(user_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(changes)
    .bind(ip.filter(|s| s.parse::<std::net::IpAddr>().is_ok()))
    .bind(ua)
    .execute(db)
    .await;
    if let Err(e) = res {
        tracing::warn!(error = %e, action, entity_type, "no se pudo registrar auditoría");
    }
}

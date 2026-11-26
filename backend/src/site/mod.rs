//! Configuración pública del sitio: contacto (WhatsApp, correo, teléfono) y páginas de confianza.
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde_json::{Map, Value, json};

use crate::{
    audit,
    auth::AuthUser,
    errors::{AppError, AppResult},
    state::AppState,
};

/// Claves editables desde el panel (y que se publican, salvo `notify.email`).
const PUBLIC_KEYS: [&str; 13] = [
    "contact.whatsapp", "contact.email", "contact.phone", "contact.address", "contact.name",
    "page.about", "page.cancellation", "page.privacy", "page.terms",
    "page.about.en", "page.cancellation.en", "page.privacy.en", "page.terms.en",
];
const PRIVATE_KEYS: [&str; 1] = ["notify.email"];

/// Datos de contacto y textos de las páginas institucionales.
#[utoipa::path(get, path = "/api/v1/site", tag = "site", responses((status = 200, body = Object)))]
pub async fn public(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let v: Value = sqlx::query_scalar("SELECT COALESCE(jsonb_object_agg(key, value), '{}') FROM system_settings WHERE key = ANY($1)")
        .bind(PUBLIC_KEYS.iter().map(|s| s.to_string()).collect::<Vec<_>>())
        .fetch_one(&state.db)
        .await?;
    Ok(Json(v))
}

/// Todos los ajustes editables (incluye el correo interno de avisos y el estado del envío de correos).
#[utoipa::path(get, path = "/api/v1/admin/site", tag = "site", security(("bearer" = [])), responses((status = 200, body = Object)))]
pub async fn admin_get(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    user.require("settings.manage")?;
    let keys: Vec<String> = PUBLIC_KEYS.iter().chain(PRIVATE_KEYS.iter()).map(|s| s.to_string()).collect();
    let settings: Value = sqlx::query_scalar("SELECT COALESCE(jsonb_object_agg(key, value), '{}') FROM system_settings WHERE key = ANY($1)")
        .bind(keys)
        .fetch_one(&state.db)
        .await?;
    let mail = crate::notifications::summary(&state.db, &state.config).await?;
    Ok(Json(json!({ "settings": settings, "mail": mail })))
}

fn validate(key: &str, v: &str) -> Result<(), String> {
    match key {
        "contact.whatsapp" if !v.is_empty() && !(v.chars().all(|c| c.is_ascii_digit()) && (8..=15).contains(&v.len())) => {
            Err("WhatsApp: solo dígitos con código de país, p. ej. 50760000000".into())
        }
        "contact.email" | "notify.email" if !v.is_empty() && (!v.contains('@') || v.contains(' ')) => Err(format!("{key}: correo inválido")),
        _ if v.len() > 20_000 => Err(format!("{key}: texto demasiado largo")),
        _ => Ok(()),
    }
}

/// Actualiza uno o varios ajustes.
#[utoipa::path(put, path = "/api/v1/admin/site", tag = "site", security(("bearer" = [])), request_body = Object, responses((status = 204)))]
pub async fn admin_update(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Json(b): Json<Map<String, Value>>) -> AppResult<StatusCode> {
    user.require("settings.manage")?;
    let mut tx = state.db.begin().await?;
    for (k, v) in &b {
        if !PUBLIC_KEYS.contains(&k.as_str()) && !PRIVATE_KEYS.contains(&k.as_str()) {
            return Err(AppError::BadRequest(format!("ajuste no editable: {k}")));
        }
        let text = v.as_str().ok_or_else(|| AppError::BadRequest(format!("{k}: debe ser texto")))?.trim().to_string();
        validate(k, &text).map_err(AppError::BadRequest)?;
        sqlx::query("UPDATE system_settings SET value = to_jsonb($2::text), updated_by = $3, updated_at = now() WHERE key = $1")
            .bind(k).bind(&text).bind(user.id())
            .execute(&mut *tx)
            .await?;
    }
    audit::log(&mut *tx, Some(user.id()), "update", "site_settings", None, Some(json!({"keys": b.keys().collect::<Vec<_>>()})), &headers).await;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    #[test]
    fn whatsapp_and_email_validation() {
        assert!(super::validate("contact.whatsapp", "50760000000").is_ok());
        assert!(super::validate("contact.whatsapp", "").is_ok());
        assert!(super::validate("contact.whatsapp", "+507 6000-0000").is_err());
        assert!(super::validate("notify.email", "no-es-correo").is_err());
        assert!(super::validate("contact.email", "info@xplora.test").is_ok());
    }
}

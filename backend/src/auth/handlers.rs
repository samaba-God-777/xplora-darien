use axum::{Json, extract::State, http::HeaderMap};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use super::{AuthUser, issue_token, load_roles_and_permissions, verify_password};
use crate::{
    audit,
    errors::{AppError, AppResult},
    state::AppState,
};

#[derive(Deserialize, Validate, ToSchema)]
pub struct LoginRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 1, max = 256))]
    pub password: String,
}

#[derive(Serialize, ToSchema)]
pub struct LoginResponse {
    pub access_token: String,
    pub token_type: &'static str,
    pub expires_in: i64,
    pub user: MeResponse,
}

#[derive(Serialize, ToSchema)]
pub struct MeResponse {
    pub id: Uuid,
    pub email: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}

// Hash Argon2 válido para igualar el tiempo de respuesta cuando el usuario no existe.
static DUMMY_HASH: std::sync::LazyLock<String> =
    std::sync::LazyLock::new(|| super::hash_password("timing-equalizer").unwrap_or_default());

/// Inicia sesión y devuelve un JWT.
#[utoipa::path(post, path = "/api/v1/auth/login", tag = "auth", request_body = LoginRequest,
    responses((status = 200, body = LoginResponse), (status = 401, body = crate::errors::ErrorBody)))]
pub async fn login(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<LoginRequest>) -> AppResult<Json<LoginResponse>> {
    body.validate()?;
    let row: Option<(Uuid, String, String, bool)> =
        sqlx::query_as("SELECT id, email::text, password_hash, is_active FROM users WHERE email = $1")
            .bind(&body.email)
            .fetch_optional(&state.db)
            .await?;

    let password = body.password.clone();
    let hash = row.as_ref().map(|r| r.2.clone()).unwrap_or_else(|| DUMMY_HASH.clone());
    let ok = tokio::task::spawn_blocking(move || verify_password(&password, &hash))
        .await
        .map_err(|e| anyhow::anyhow!(e))?;

    let Some((id, email, _, active)) = row else { return Err(AppError::Unauthorized) };
    if !ok || !active {
        audit::log(&state.db, Some(id), "login_failed", "user", Some(id.to_string()), None, &headers).await;
        return Err(AppError::Unauthorized);
    }

    let (roles, permissions) = load_roles_and_permissions(&state.db, id).await?;
    let ttl = state.config.jwt_ttl_minutes;
    let token = issue_token(&state.config.jwt_secret, ttl, id, &email, roles.clone(), permissions.clone())?;
    sqlx::query("UPDATE users SET last_login_at = now() WHERE id = $1").bind(id).execute(&state.db).await?;
    audit::log(&state.db, Some(id), "login", "user", Some(id.to_string()), None, &headers).await;

    Ok(Json(LoginResponse {
        access_token: token,
        token_type: "Bearer",
        expires_in: ttl * 60,
        user: MeResponse { id, email, roles, permissions },
    }))
}

/// Datos del usuario autenticado.
#[utoipa::path(get, path = "/api/v1/auth/me", tag = "auth", security(("bearer" = [])),
    responses((status = 200, body = MeResponse), (status = 401, body = crate::errors::ErrorBody)))]
pub async fn me(user: AuthUser) -> Json<MeResponse> {
    Json(MeResponse { id: user.0.sub, email: user.0.email, roles: user.0.roles, permissions: user.0.perms })
}

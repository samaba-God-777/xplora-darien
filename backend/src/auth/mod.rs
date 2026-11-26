//! Autenticación (Argon2id + JWT HS256) y autorización por permisos de rol.
pub mod handlers;

use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use axum::{extract::FromRequestParts, http::request::Parts};
use chrono::Utc;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{errors::AppError, state::AppState};

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|h| h.to_string())
        .map_err(|e| anyhow::anyhow!("argon2: {e}"))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok())
        .unwrap_or(false)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub email: String,
    pub roles: Vec<String>,
    pub perms: Vec<String>,
    pub iat: i64,
    pub exp: i64,
    pub iss: String,
}

const ISSUER: &str = "xplora-darien";

pub fn issue_token(secret: &str, ttl_minutes: i64, sub: Uuid, email: &str, roles: Vec<String>, perms: Vec<String>) -> anyhow::Result<String> {
    let now = Utc::now().timestamp();
    let claims = Claims { sub, email: email.to_string(), roles, perms, iat: now, exp: now + ttl_minutes * 60, iss: ISSUER.into() };
    Ok(encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes())?)?)
}

pub fn decode_token(secret: &str, token: &str) -> Result<Claims, AppError> {
    let mut validation = Validation::default();
    validation.set_issuer(&[ISSUER]);
    let key = DecodingKey::from_secret(secret.as_bytes()).map_err(|_| AppError::Unauthorized)?;
    decode::<Claims>(token, &key, &validation)
        .map(|d| d.claims)
        .map_err(|_| AppError::Unauthorized)
}

/// Usuario autenticado extraído del encabezado `Authorization: Bearer <jwt>`.
#[derive(Debug, Clone)]
pub struct AuthUser(pub Claims);

impl AuthUser {
    pub fn id(&self) -> Uuid {
        self.0.sub
    }

    /// Exige un permiso; el superadministrador los tiene todos.
    pub fn require(&self, permission: &str) -> Result<(), AppError> {
        if self.0.roles.iter().any(|r| r == "superadmin") || self.0.perms.iter().any(|p| p == permission) {
            Ok(())
        } else {
            Err(AppError::Forbidden)
        }
    }
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized)?;
        let token = header.strip_prefix("Bearer ").ok_or(AppError::Unauthorized)?;
        Ok(AuthUser(decode_token(&state.config.jwt_secret, token)?))
    }
}

/// Carga roles y permisos efectivos de un usuario.
pub async fn load_roles_and_permissions(db: &sqlx::PgPool, user_id: Uuid) -> Result<(Vec<String>, Vec<String>), sqlx::Error> {
    let roles: Vec<String> = sqlx::query_scalar(
        "SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.key",
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;
    let perms: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT p.key FROM user_roles ur
           JOIN role_permissions rp ON rp.role_id = ur.role_id
           JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = $1 ORDER BY p.key",
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;
    Ok((roles, perms))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_roundtrip() {
        let h = hash_password("una-clave-de-prueba").unwrap();
        assert!(h.starts_with("$argon2id$"));
        assert!(verify_password("una-clave-de-prueba", &h));
        assert!(!verify_password("otra", &h));
        assert!(!verify_password("x", "no-es-un-hash"));
    }

    #[test]
    fn token_roundtrip_and_tamper() {
        let secret = "0123456789abcdef0123456789abcdef";
        let id = Uuid::new_v4();
        let t = issue_token(secret, 5, id, "a@b.c", vec!["editor".into()], vec!["destinations.write".into()]).unwrap();
        let c = decode_token(secret, &t).unwrap();
        assert_eq!(c.sub, id);
        assert!(decode_token("ffffffffffffffffffffffffffffffff", &t).is_err());
        let user = AuthUser(c);
        assert!(user.require("destinations.write").is_ok());
        assert!(user.require("users.manage").is_err());
    }
}

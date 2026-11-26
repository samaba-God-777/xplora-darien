//! Manejo centralizado de errores: toda respuesta de error tiene la forma
//! `{ "error": { "code": "...", "message": "...", "details": ... } }`.
use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use serde_json::Value;
use utoipa::ToSchema;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    BadRequest(String),
    #[error("datos inválidos")]
    Validation(Value),
    #[error("no autenticado")]
    Unauthorized,
    #[error("permiso insuficiente")]
    Forbidden,
    #[error("{0} no encontrado")]
    NotFound(&'static str),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    Unprocessable(String),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

#[derive(Serialize, ToSchema)]
pub struct ErrorBody {
    pub error: ErrorDetail,
}

#[derive(Serialize, ToSchema)]
pub struct ErrorDetail {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<Object>)]
    pub details: Option<Value>,
}

impl AppError {
    fn parts(&self) -> (StatusCode, &'static str) {
        match self {
            Self::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            Self::Validation(_) => (StatusCode::UNPROCESSABLE_ENTITY, "validation_error"),
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            Self::Forbidden => (StatusCode::FORBIDDEN, "forbidden"),
            Self::NotFound(_) => (StatusCode::NOT_FOUND, "not_found"),
            Self::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            Self::Unprocessable(_) => (StatusCode::UNPROCESSABLE_ENTITY, "unprocessable"),
            Self::Database(_) | Self::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        // Traduce violaciones de restricciones de PostgreSQL a errores de cliente.
        if let AppError::Database(sqlx::Error::Database(db)) = &self {
            let msg = db.constraint().map(|c| format!("restricción: {c}")).unwrap_or_default();
            let mapped = match db.code().as_deref() {
                Some("23505") => Some(AppError::Conflict(format!("registro duplicado ({msg})"))),
                Some("23503") => Some(AppError::BadRequest(format!("referencia inexistente ({msg})"))),
                Some("23514") => Some(AppError::Unprocessable(format!("valor no permitido ({msg})"))),
                _ => None,
            };
            if let Some(e) = mapped {
                return e.into_response();
            }
        }
        let (status, code) = self.parts();
        let (message, details) = match &self {
            AppError::Database(e) => {
                tracing::error!(error = %e, "error de base de datos");
                ("error interno".to_string(), None)
            }
            AppError::Internal(e) => {
                tracing::error!(error = ?e, "error interno");
                ("error interno".to_string(), None)
            }
            AppError::Validation(v) => (self.to_string(), Some(v.clone())),
            other => (other.to_string(), None),
        };
        (status, Json(ErrorBody { error: ErrorDetail { code, message, details } })).into_response()
    }
}

impl From<validator::ValidationErrors> for AppError {
    fn from(e: validator::ValidationErrors) -> Self {
        AppError::Validation(serde_json::to_value(e).unwrap_or(Value::Null))
    }
}

pub type AppResult<T> = Result<T, AppError>;

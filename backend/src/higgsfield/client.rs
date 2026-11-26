//! Cliente REST de Higgsfield según https://docs.higgsfield.ai/docs/llms.txt
//! - Autenticación: `Authorization: Key <key-id>:<key-secret>` (solo en el servidor).
//! - Envío asíncrono → `request_id`, `status_url`, `cancel_url`.
//! - Estados: queued | in_progress | completed | failed | nsfw | canceled.
//! - `Idempotency-Key` en cada envío para reintentos seguros.
use std::time::Duration;

use reqwest::{StatusCode, header};
use serde::Deserialize;
use serde_json::Value;

use crate::config::HiggsfieldConfig;

#[derive(Debug, Clone)]
pub struct HfError {
    pub status: Option<u16>,
    pub retryable: bool,
    pub retry_after: Option<u64>,
    pub message: String,
}

impl std::fmt::Display for HfError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.status {
            Some(s) => write!(f, "Higgsfield {s}: {}", self.message),
            None => write!(f, "Higgsfield: {}", self.message),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct Submitted {
    pub request_id: String,
    pub status_url: Option<String>,
    pub cancel_url: Option<String>,
    #[serde(skip)]
    pub correlation_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MediaOutput {
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct RequestStatus {
    pub status: String,
    pub error: Option<String>,
    pub video: Option<MediaOutput>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Clone)]
pub struct HiggsfieldClient {
    http: reqwest::Client,
    base: String,
    auth: String,
}

impl HiggsfieldClient {
    /// `None` si las credenciales no están configuradas.
    pub fn from_config(c: &HiggsfieldConfig) -> Option<Self> {
        if !c.is_configured() {
            return None;
        }
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .connect_timeout(Duration::from_secs(10))
            .user_agent("xplora-darien-api")
            .build()
            .ok()?;
        Some(Self {
            http,
            base: c.base_url.trim_end_matches('/').to_string(),
            auth: format!("Key {}:{}", c.key_id.as_deref()?, c.key_secret.as_deref()?),
        })
    }

    /// Solo se envían credenciales a URLs del propio servidor de Higgsfield.
    fn trusted(&self, url: &str) -> bool {
        url.starts_with(&format!("{}/", self.base))
    }

    async fn error_from(resp: reqwest::Response) -> HfError {
        let status = resp.status();
        let retry_after = resp.headers().get(header::RETRY_AFTER).and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok());
        let correlation = resp.headers().get("x-correlation-id").and_then(|v| v.to_str().ok()).map(str::to_string);
        let body: Value = resp.json().await.unwrap_or(Value::Null);
        let detail = &body["detail"];
        let message = detail
            .as_str()
            .map(str::to_string)
            .or_else(|| detail.get("message").and_then(Value::as_str).map(str::to_string))
            .unwrap_or_else(|| if detail.is_null() { status.to_string() } else { detail.to_string() });
        let retryable = matches!(status, StatusCode::TOO_MANY_REQUESTS | StatusCode::LOCKED | StatusCode::SERVICE_UNAVAILABLE)
            || status.is_server_error()
            || detail.get("retryable").and_then(Value::as_bool).unwrap_or(false);
        HfError {
            status: Some(status.as_u16()),
            retryable,
            retry_after,
            message: match correlation {
                Some(c) => format!("{message} (correlation {c})"),
                None => message,
            },
        }
    }

    fn net(e: reqwest::Error) -> HfError {
        HfError { status: None, retryable: true, retry_after: None, message: e.to_string() }
    }

    pub async fn submit(&self, endpoint: &str, body: &Value, idempotency_key: &str) -> Result<Submitted, HfError> {
        let resp = self
            .http
            .post(format!("{}/{}", self.base, endpoint.trim_start_matches('/')))
            .header(header::AUTHORIZATION, &self.auth)
            .header("Idempotency-Key", idempotency_key)
            .json(body)
            .send()
            .await
            .map_err(Self::net)?;
        if !resp.status().is_success() {
            return Err(Self::error_from(resp).await);
        }
        let correlation = resp.headers().get("x-correlation-id").and_then(|v| v.to_str().ok()).map(str::to_string);
        let mut s: Submitted = resp.json().await.map_err(Self::net)?;
        s.correlation_id = correlation;
        Ok(s)
    }

    pub async fn status(&self, request_id: &str, status_url: Option<&str>) -> Result<RequestStatus, HfError> {
        let url = status_url
            .filter(|u| self.trusted(u))
            .map(str::to_string)
            .unwrap_or_else(|| format!("{}/requests/{request_id}/status", self.base));
        let resp = self.http.get(url).header(header::AUTHORIZATION, &self.auth).send().await.map_err(Self::net)?;
        if !resp.status().is_success() {
            return Err(Self::error_from(resp).await);
        }
        resp.json().await.map_err(Self::net)
    }

    pub async fn cancel(&self, request_id: &str) -> Result<(), HfError> {
        let resp = self
            .http
            .post(format!("{}/requests/{request_id}/cancel", self.base))
            .header(header::AUTHORIZATION, &self.auth)
            .send()
            .await
            .map_err(Self::net)?;
        if resp.status().is_success() { Ok(()) } else { Err(Self::error_from(resp).await) }
    }

    /// Costo estimado en USD (`POST /estimate/{endpoint}`).
    pub async fn estimate(&self, endpoint: &str, body: &Value) -> Result<rust_decimal::Decimal, HfError> {
        let resp = self
            .http
            .post(format!("{}/estimate/{}", self.base, endpoint.trim_start_matches('/')))
            .header(header::AUTHORIZATION, &self.auth)
            .json(body)
            .send()
            .await
            .map_err(Self::net)?;
        if !resp.status().is_success() {
            return Err(Self::error_from(resp).await);
        }
        let v: Value = resp.json().await.map_err(Self::net)?;
        let usd = v["usd"].as_str().map(str::to_string).or_else(|| v["usd"].as_f64().map(|f| f.to_string()));
        usd.and_then(|s| s.parse().ok())
            .ok_or(HfError { status: None, retryable: false, retry_after: None, message: "respuesta de estimación sin `usd`".into() })
    }

    /// Sube un archivo local a Higgsfield (URL prefirmada) y devuelve su `public_url`.
    pub async fn upload(&self, bytes: Vec<u8>, content_type: &str) -> Result<String, HfError> {
        let resp = self
            .http
            .post(format!("{}/files/generate-upload-url", self.base))
            .header(header::AUTHORIZATION, &self.auth)
            .json(&serde_json::json!({ "content_type": content_type }))
            .send()
            .await
            .map_err(Self::net)?;
        if !resp.status().is_success() {
            return Err(Self::error_from(resp).await);
        }
        let v: Value = resp.json().await.map_err(Self::net)?;
        let (Some(upload_url), Some(public_url)) = (v["upload_url"].as_str(), v["public_url"].as_str()) else {
            return Err(HfError { status: None, retryable: false, retry_after: None, message: "respuesta de subida incompleta".into() });
        };
        // A la URL prefirmada NO se envían las credenciales de Higgsfield.
        let mut put = self.http.put(upload_url).body(bytes);
        if let Some(h) = v["upload_headers"].as_object() {
            for (k, val) in h {
                if let Some(s) = val.as_str() {
                    put = put.header(k.as_str(), s);
                }
            }
        } else {
            put = put.header(header::CONTENT_TYPE, content_type);
        }
        let r = put.send().await.map_err(Self::net)?;
        if !r.status().is_success() {
            return Err(Self::error_from(r).await);
        }
        Ok(public_url.to_string())
    }

    /// Descarga el resultado (las URLs de Higgsfield expiran: se copia a almacenamiento propio).
    pub async fn download(&self, url: &str) -> Result<bytes::Bytes, HfError> {
        let r = self.http.get(url).timeout(Duration::from_secs(600)).send().await.map_err(Self::net)?;
        if !r.status().is_success() {
            return Err(Self::error_from(r).await);
        }
        r.bytes().await.map_err(Self::net)
    }
}

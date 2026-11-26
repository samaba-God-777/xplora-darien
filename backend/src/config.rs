use anyhow::{Context, Result, bail};

/// Configuración leída de variables de entorno (ver `.env.example`).
#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub bind_addr: String,
    pub jwt_secret: String,
    pub jwt_ttl_minutes: i64,
    pub cors_origins: Vec<String>,
    pub rate_limit_enabled: bool,
    pub media_base_url: String,
    /// Fotos mejoradas con IA (storage/media-hd, servidas por el frontend en /media-hd).
    pub media_hd_base_url: String,
    /// Carpeta raíz de pageWeb (originales de solo lectura: imagen/ y review/instagram/).
    pub pageweb_dir: std::path::PathBuf,
    /// Almacenamiento propio: uploads/, generated/, posters/.
    pub storage_dir: std::path::PathBuf,
    /// URL pública de `storage_dir` (servida por esta API en /files).
    pub public_files_url: String,
    pub higgsfield: HiggsfieldConfig,
    pub worker_enabled: bool,
    /// Envío de correos: `smtp(s)://usuario:clave@host:puerto` o `file:///carpeta` (desarrollo). Sin valor = no se envía.
    pub mail_url: Option<String>,
    pub mail_from: String,
    /// URL pública del sitio (enlaces en los correos).
    pub site_url: String,
}

/// Credenciales de Higgsfield: solo existen en el backend (nunca en el navegador).
#[derive(Clone)]
pub struct HiggsfieldConfig {
    pub base_url: String,
    pub key_id: Option<String>,
    pub key_secret: Option<String>,
}

impl HiggsfieldConfig {
    pub fn is_configured(&self) -> bool {
        self.key_id.as_deref().is_some_and(|s| !s.is_empty()) && self.key_secret.as_deref().is_some_and(|s| !s.is_empty())
    }
}

impl std::fmt::Debug for HiggsfieldConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HiggsfieldConfig").field("base_url", &self.base_url).field("configured", &self.is_configured()).finish()
    }
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let jwt_secret = std::env::var("JWT_SECRET").context("JWT_SECRET no definido")?;
        if jwt_secret.len() < 32 {
            bail!("JWT_SECRET debe tener al menos 32 caracteres");
        }
        Ok(Self {
            database_url: std::env::var("DATABASE_URL").context("DATABASE_URL no definido")?,
            bind_addr: std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into()),
            jwt_secret,
            jwt_ttl_minutes: std::env::var("JWT_TTL_MINUTES").ok().and_then(|v| v.parse().ok()).unwrap_or(60),
            cors_origins: std::env::var("CORS_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:3000".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            rate_limit_enabled: std::env::var("RATE_LIMIT_ENABLED").map(|v| v != "false").unwrap_or(true),
            media_base_url: std::env::var("MEDIA_BASE_URL").unwrap_or_else(|_| "/media".into()),
            media_hd_base_url: std::env::var("MEDIA_HD_BASE_URL").unwrap_or_else(|_| "/media-hd".into()),
            pageweb_dir: std::env::var("PAGEWEB_DIR").unwrap_or_else(|_| "..".into()).into(),
            storage_dir: std::env::var("STORAGE_DIR").unwrap_or_else(|_| "../storage".into()).into(),
            public_files_url: std::env::var("PUBLIC_FILES_URL").unwrap_or_else(|_| "http://localhost:8080/files".into()),
            higgsfield: HiggsfieldConfig {
                base_url: std::env::var("HIGGSFIELD_BASE_URL").unwrap_or_else(|_| "https://api.higgsfield.ai".into()),
                key_id: std::env::var("HIGGSFIELD_API_KEY_ID").ok(),
                key_secret: std::env::var("HIGGSFIELD_API_KEY_SECRET").ok(),
            },
            worker_enabled: std::env::var("WORKER_ENABLED").map(|v| v != "false").unwrap_or(true),
            mail_url: std::env::var("MAIL_URL").ok().filter(|v| !v.is_empty()),
            mail_from: std::env::var("MAIL_FROM").unwrap_or_else(|_| "XPLORA DARIÉN <reservas@localhost>".into()),
            site_url: std::env::var("SITE_URL").unwrap_or_else(|_| "http://localhost:3000".into()),
        })
    }
}

// Disponible también para las pruebas de integración (tests/).
pub mod tests_support {
    use super::*;

    /// Configuración para pruebas.
    pub fn config() -> Config {
        Config {
            database_url: String::new(),
            bind_addr: "127.0.0.1:0".into(),
            jwt_secret: "test-secret-test-secret-test-secret-123".into(),
            jwt_ttl_minutes: 5,
            cors_origins: vec!["http://localhost:3000".into()],
            rate_limit_enabled: false,
            media_base_url: "/media".into(),
            media_hd_base_url: "/media-hd".into(),
            pageweb_dir: "/pw".into(),
            storage_dir: "/st".into(),
            public_files_url: "http://api/files".into(),
            higgsfield: HiggsfieldConfig { base_url: "http://localhost:1".into(), key_id: None, key_secret: None },
            worker_enabled: false,
            mail_url: None,
            mail_from: "XPLORA DARIÉN <reservas@xplora.test>".into(),
            site_url: "http://localhost:3000".into(),
        }
    }
}

use std::time::Duration;

use sqlx::{PgPool, postgres::PgPoolOptions};

pub async fn connect(url: &str) -> anyhow::Result<PgPool> {
    Ok(PgPoolOptions::new()
        .max_connections(20)
        .acquire_timeout(Duration::from_secs(5))
        .connect(url)
        .await?)
}

/// Migraciones SQL versionadas en `database/migrations` (incrustadas en el binario).
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../database/migrations");

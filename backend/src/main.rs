use std::{net::SocketAddr, sync::Arc};

use anyhow::Context;
use tracing_subscriber::{EnvFilter, fmt, prelude::*};
use xplora_darien_api::{api, auth, config::Config, database, state::AppState};

const USAGE: &str = "uso:
  xplora-darien-api                      inicia el servidor (aplica migraciones)
  xplora-darien-api migrate              solo aplica migraciones
  xplora-darien-api create-user EMAIL \"NOMBRE\" ROL   crea un usuario; la contraseña se lee de ADMIN_PASSWORD
      ROL: superadmin | admin | editor | operator | booking_manager";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    let json_logs = std::env::var("LOG_FORMAT").is_ok_and(|v| v == "json");
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,tower_http=info,sqlx=warn".into());
    let registry = tracing_subscriber::registry().with(filter);
    if json_logs {
        registry.with(fmt::layer().json()).init();
    } else {
        registry.with(fmt::layer()).init();
    }

    let config = Config::from_env()?;
    let db = database::connect(&config.database_url).await.context("conexión a PostgreSQL")?;
    database::MIGRATOR.run(&db).await.context("migraciones")?;

    let dest_count: i64 = sqlx::query_scalar("SELECT count(*) FROM destinations")
        .fetch_one(&db)
        .await
        .unwrap_or(0);
    if dest_count == 0 {
        tracing::info!("Base de datos vacía detectada, cargando catálogo inicial...");
        const SEED_DESTINATIONS: &str = include_str!("../../database/seeds/001_destinations.sql");
        const SEED_GALLERY: &str = include_str!("../../database/seeds/002_gallery.sql");
        const SEED_MODELS: &str = include_str!("../../database/seeds/003_video_models.sql");
        const SEED_PACKAGES: &str = include_str!("../../database/seeds/004_packages.sql");
        const SEED_PACKAGES_MORE: &str = include_str!("../../database/seeds/005_packages_more.sql");
        const SEED_TRANSLATIONS: &str = include_str!("../../database/seeds/006_package_translations_en.sql");

        for (name, seed) in [
            ("destinos", SEED_DESTINATIONS),
            ("galeria", SEED_GALLERY),
            ("modelos_video", SEED_MODELS),
            ("paquetes", SEED_PACKAGES),
            ("paquetes_adicionales", SEED_PACKAGES_MORE),
            ("traducciones_en", SEED_TRANSLATIONS),
        ] {
            tracing::info!("Cargando semilla: {name}...");
            sqlx::raw_sql(seed).execute(&db).await.context(format!("falló semilla {name}"))?;
        }
        tracing::info!("Catálogo inicial cargado con éxito.");
    }

    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("migrate") => {
            tracing::info!("migraciones aplicadas");
            return Ok(());
        }
        Some("create-user") => {
            let [_, email, name, role] = args.as_slice() else { anyhow::bail!(USAGE) };
            let password = std::env::var("ADMIN_PASSWORD").context("defina ADMIN_PASSWORD (mínimo 12 caracteres)")?;
            if password.len() < 12 {
                anyhow::bail!("ADMIN_PASSWORD debe tener al menos 12 caracteres");
            }
            let hash = auth::hash_password(&password)?;
            let mut tx = db.begin().await?;
            let id: uuid::Uuid = sqlx::query_scalar(
                "INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3)
                 ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name
                 RETURNING id",
            )
            .bind(email)
            .bind(hash)
            .bind(name)
            .fetch_one(&mut *tx)
            .await?;
            let n = sqlx::query("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = $2 ON CONFLICT DO NOTHING")
                .bind(id)
                .bind(role)
                .execute(&mut *tx)
                .await?
                .rows_affected();
            let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM roles WHERE key = $1)").bind(role).fetch_one(&mut *tx).await?;
            if !exists {
                anyhow::bail!("rol desconocido: {role}\n{USAGE}");
            }
            tx.commit().await?;
            println!("usuario {email} listo (rol {role}{})", if n == 0 { ", ya asignado" } else { "" });
            return Ok(());
        }
        Some(other) => anyhow::bail!("comando desconocido: {other}\n{USAGE}"),
        None => {}
    }

    let addr: SocketAddr = config.bind_addr.parse().context("BIND_ADDR inválido")?;
    let state = AppState { db, config: Arc::new(config) };
    if state.config.worker_enabled {
        xplora_darien_api::higgsfield::worker::spawn(state.db.clone(), state.config.clone());
    }
    let app = api::router(state);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "XPLORA DARIÉN API escuchando · documentación en /docs");
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

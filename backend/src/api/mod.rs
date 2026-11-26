//! Router HTTP, middleware transversal y documentación OpenAPI.
use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderName, HeaderValue, Method, header},
    extract::DefaultBodyLimit,
    routing::{get, post, put},
};
use serde_json::{Value, json};
use tower_governor::{GovernorLayer, governor::GovernorConfigBuilder};
use tower_http::{
    compression::CompressionLayer,
    cors::{AllowOrigin, CorsLayer},
    limit::RequestBodyLimitLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    sensitive_headers::SetSensitiveRequestHeadersLayer,
    set_header::SetResponseHeaderLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use utoipa::{
    Modify, OpenApi,
    openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme},
};
use utoipa_scalar::{Scalar, Servable};

use tower_http::services::ServeDir;

use crate::{auth, bookings, destinations, errors::AppResult, gallery, guides, higgsfield, media, operations, packages, reviews, site, state::AppState};

#[derive(OpenApi)]
#[openapi(
    info(title = "XPLORA DARIÉN API", version = "1.0.0",
         description = "API REST de la plataforma turística XPLORA DARIÉN (Darién, Panamá)."),
    paths(
        health,
        auth::handlers::login, auth::handlers::me,
        destinations::list, destinations::get, destinations::map_points,
        destinations::create, destinations::update, destinations::publish, destinations::delete,
        packages::list, packages::get, packages::compare,
        packages::create, packages::add_price, packages::add_departure, packages::set_availability, packages::publish,
        bookings::price_preview, bookings::create,
        bookings::admin_list, bookings::admin_get, bookings::change_status,
        guides::list_guides, guides::list_providers,
        gallery::categories, gallery::media, gallery::item, gallery::hero, gallery::event, gallery::destinations,
        packages::seasons, packages::update_season, packages::admin_list, packages::update_price,
        operations::dashboard, operations::add_payment, operations::assign_staff, operations::update_assignment, operations::delete_assignment,
        operations::list_staff, operations::create_staff, operations::update_staff, operations::list_inventory, operations::create_item,
        operations::update_item, operations::add_movement, operations::finance, operations::add_expense, operations::delete_expense,
        packages::set_availability_range, packages::update_departure, site::public, site::admin_get, site::admin_update,
        reviews::submit, reviews::public_list, reviews::admin_list, reviews::moderate,
        media::list, media::get, media::update, media::delete, media::upload, media::collections, media::upsert_collection, media::stats,
        higgsfield::status, higgsfield::update_settings, higgsfield::models, higgsfield::templates, higgsfield::upsert_template,
        higgsfield::presets, higgsfield::create, higgsfield::list, higgsfield::get, higgsfield::cancel, higgsfield::review,
    ),
    modifiers(&BearerAuth),
    tags(
        (name = "map", description = "Mapa interactivo"),
        (name = "destinations", description = "Catálogo de destinos"),
        (name = "packages", description = "Paquetes turísticos y comparador"),
        (name = "bookings", description = "Solicitudes de reserva"),
        (name = "guides", description = "Guías y proveedores"),
        (name = "gallery", description = "Cinematic Gallery (público)"),
        (name = "media-studio", description = "Media Management Studio"),
        (name = "ai-studio", description = "XPLORA AI Video Studio (Higgsfield)"),
        (name = "site", description = "Contacto y páginas institucionales"),
        (name = "reviews", description = "Opiniones y testimonios"),
        (name = "operations", description = "Operación: panel, personal, inventario, cobros, gastos y ganancias"),
        (name = "auth", description = "Autenticación"),
        (name = "admin", description = "Panel administrativo (requiere JWT y permisos)"),
    )
)]
pub struct ApiDoc;

struct BearerAuth;
impl Modify for BearerAuth {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(c) = openapi.components.as_mut() {
            c.add_security_scheme("bearer", SecurityScheme::Http(HttpBuilder::new().scheme(HttpAuthScheme::Bearer).bearer_format("JWT").build()));
        }
    }
}

/// Estado del servicio y de la base de datos.
#[utoipa::path(get, path = "/api/v1/health", tag = "map", responses((status = 200, body = Object)))]
pub async fn health(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&state.db).await.is_ok();
    Ok(Json(json!({"status": if db_ok { "ok" } else { "degraded" }, "database": db_ok, "version": env!("CARGO_PKG_VERSION")})))
}

pub fn router(state: AppState) -> Router {
    let public = Router::new()
        .route("/health", get(health))
        .route("/map/points", get(destinations::map_points))
        .route("/destinations", get(destinations::list))
        .route("/destinations/{slug}", get(destinations::get))
        .route("/packages", get(packages::list))
        .route("/packages/compare", get(packages::compare))
        .route("/packages/{slug}", get(packages::get))
        .route("/bookings/price", get(bookings::price_preview))
        .route("/guides", get(guides::list_guides))
        .route("/providers", get(guides::list_providers))
        .route("/auth/me", get(auth::handlers::me))
        .route("/gallery/categories", get(gallery::categories))
        .route("/gallery/media", get(gallery::media))
        .route("/gallery/media/{id}", get(gallery::item))
        .route("/gallery/hero", get(gallery::hero))
        .route("/gallery/destinations", get(gallery::destinations))
        .route("/seasons", get(packages::seasons))
        .route("/site", get(site::public))
        .route("/testimonials", get(reviews::public_list));

    // Endpoints sensibles a abuso: límite estricto por IP.
    let mut sensitive = Router::new()
        .route("/auth/login", post(auth::handlers::login))
        .route("/bookings", post(bookings::create))
        .route("/gallery/media/{id}/events", post(gallery::event))
        .route("/reviews", post(reviews::submit));
    if state.config.rate_limit_enabled {
        let conf = GovernorConfigBuilder::default().per_second(6).burst_size(5).finish().expect("configuración de rate limit");
        sensitive = sensitive.layer(GovernorLayer::new(Arc::new(conf)));
    }

    let admin = Router::new()
        .route("/destinations", post(destinations::create))
        .route("/destinations/{id}", put(destinations::update).delete(destinations::delete))
        .route("/destinations/{id}/publish", post(destinations::publish))
        .route("/packages/{id}/prices", post(packages::add_price))
        .route("/packages/{id}/departures", post(packages::add_departure))
        .route("/packages/{id}/availability", put(packages::set_availability))
        .route("/packages/{id}/publish", post(packages::publish))
        .route("/packages", get(packages::admin_list).post(packages::create))
        .route("/packages/{id}/prices/{price_id}", axum::routing::patch(packages::update_price))
        .route("/seasons/{key}", put(packages::update_season))
        .route("/dashboard", get(operations::dashboard))
        .route("/bookings/{id}/payments", post(operations::add_payment))
        .route("/bookings/{id}/staff", post(operations::assign_staff))
        .route("/staff-assignments/{id}", axum::routing::patch(operations::update_assignment).delete(operations::delete_assignment))
        .route("/staff", get(operations::list_staff).post(operations::create_staff))
        .route("/staff/{id}", axum::routing::patch(operations::update_staff))
        .route("/inventory", get(operations::list_inventory).post(operations::create_item))
        .route("/inventory/{id}", axum::routing::patch(operations::update_item))
        .route("/inventory/{id}/movements", post(operations::add_movement))
        .route("/finance", get(operations::finance))
        .route("/expenses", post(operations::add_expense))
        .route("/expenses/{id}", axum::routing::delete(operations::delete_expense))
        .route("/packages/{id}/availability/range", put(packages::set_availability_range))
        .route("/packages/{id}/departures/{dep_id}", axum::routing::patch(packages::update_departure))
        .route("/site", get(site::admin_get).put(site::admin_update))
        .route("/reviews", get(reviews::admin_list))
        .route("/reviews/{id}/moderate", post(reviews::moderate))
        .route("/bookings", get(bookings::admin_list))
        .route("/bookings/{id}", get(bookings::admin_get))
        .route("/bookings/{id}/status", post(bookings::change_status))
        .route("/media", get(media::list))
        .route("/media/stats", get(media::stats))
        .route("/media/collections", get(media::collections).put(media::upsert_collection))
        .route("/media/{id}", get(media::get).patch(media::update).delete(media::delete))
        .route("/ai/status", get(higgsfield::status))
        .route("/ai/settings", put(higgsfield::update_settings))
        .route("/ai/models", get(higgsfield::models))
        .route("/ai/templates", get(higgsfield::templates))
        .route("/ai/templates/{key}", put(higgsfield::upsert_template))
        .route("/ai/presets", get(higgsfield::presets))
        .route("/ai/generations", get(higgsfield::list).post(higgsfield::create))
        .route("/ai/generations/{id}", get(higgsfield::get))
        .route("/ai/generations/{id}/cancel", post(higgsfield::cancel))
        .route("/ai/generations/{id}/review", post(higgsfield::review))
        .layer(RequestBodyLimitLayer::new(256 * 1024));

    // Subidas: límite propio (300 MB) en lugar del general de 256 KB.
    let uploads = Router::new()
        .route("/media/upload", post(media::upload))
        .layer(DefaultBodyLimit::max(media::MAX_UPLOAD_BYTES))
        .layer(RequestBodyLimitLayer::new(media::MAX_UPLOAD_BYTES));

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(
            state.config.cors_origins.iter().filter_map(|o| HeaderValue::from_str(o).ok()),
        ))
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
        .max_age(Duration::from_secs(3600));

    let request_id = HeaderName::from_static("x-request-id");
    let files_dir = state.config.storage_dir.clone();
    Router::new()
        .nest(
            "/api/v1",
            public
                .merge(sensitive)
                .layer(RequestBodyLimitLayer::new(256 * 1024))
                .nest("/admin", admin.merge(uploads)),
        )
        // Archivos propios (subidas, generados, pósters) con soporte de Range para streaming de video.
        .nest_service("/files", ServeDir::new(&files_dir).precompressed_gzip())
        .merge(Scalar::with_url("/docs", ApiDoc::openapi()))
        .route("/openapi.json", get(|| async { Json(ApiDoc::openapi()) }))
        .with_state(state)
        .layer(TimeoutLayer::with_status_code(axum::http::StatusCode::REQUEST_TIMEOUT, Duration::from_secs(30)))
        .layer(CompressionLayer::new())
        .layer(cors)
        .layer(SetResponseHeaderLayer::overriding(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff")))
        .layer(SetResponseHeaderLayer::overriding(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY")))
        .layer(SetResponseHeaderLayer::overriding(header::REFERRER_POLICY, HeaderValue::from_static("strict-origin-when-cross-origin")))
        .layer(SetSensitiveRequestHeadersLayer::new([header::AUTHORIZATION, header::COOKIE]))
        .layer(TraceLayer::new_for_http())
        .layer(PropagateRequestIdLayer::new(request_id.clone()))
        .layer(SetRequestIdLayer::new(request_id, MakeRequestUuid))
}

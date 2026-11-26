//! Pruebas de integración contra PostgreSQL real.
//! Crea una base de datos temporal, aplica migraciones y semillas, y la elimina al final.
//! Requiere `TEST_DATABASE_ADMIN_URL` (p.ej. postgres://usuario@localhost:5432/postgres);
//! si no está definida, las pruebas se omiten.
use std::sync::Arc;

use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode, header},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::{Connection, Executor, PgConnection, PgPool};
use tower::ServiceExt;
use chrono::{Datelike, Weekday as _};
use xplora_darien_api::{api, auth, config::Config, database, state::AppState};

pub struct TestDb {
    admin_url: String,
    name: String,
    pool: PgPool,
}

impl TestDb {
    async fn new() -> Option<Self> {
        let admin_url = std::env::var("TEST_DATABASE_ADMIN_URL").ok()?;
        let name = format!("xd_test_{}", uuid::Uuid::new_v4().simple());
        let mut conn = PgConnection::connect(&admin_url).await.expect("conexión admin");
        conn.execute(sqlx::AssertSqlSafe(format!("CREATE DATABASE {name}"))).await.unwrap();
        let base = admin_url.rsplit_once('/').unwrap().0;
        let pool = PgPool::connect(&format!("{base}/{name}")).await.unwrap();
        database::MIGRATOR.run(&pool).await.unwrap();
        for f in ["001_destinations.sql", "002_gallery.sql", "003_video_models.sql", "004_packages.sql"] {
            let seed = std::fs::read_to_string(format!("{}/../database/seeds/{f}", env!("CARGO_MANIFEST_DIR"))).unwrap();
            sqlx::raw_sql(sqlx::AssertSqlSafe(seed)).execute(&pool).await.unwrap();
        }
        Some(Self { admin_url, name, pool })
    }

    async fn drop(self) {
        self.pool.close().await;
        let mut conn = PgConnection::connect(&self.admin_url).await.unwrap();
        conn.execute(sqlx::AssertSqlSafe(format!("DROP DATABASE IF EXISTS {} WITH (FORCE)", self.name))).await.unwrap();
    }
}

fn app(pool: PgPool) -> Router {
    app_with(pool, xplora_darien_api::config::tests_support::config())
}

fn app_with(pool: PgPool, config: Config) -> Router {
    api::router(AppState { db: pool, config: Arc::new(config) })
}

pub async fn call(app: &Router, method: Method, uri: &str, token: Option<&str>, body: Option<Value>) -> (StatusCode, Value) {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(t) = token {
        req = req.header(header::AUTHORIZATION, format!("Bearer {t}"));
    }
    let req = match body {
        Some(b) => req.header(header::CONTENT_TYPE, "application/json").body(Body::from(b.to_string())),
        None => req.body(Body::empty()),
    }
    .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

pub async fn user(pool: &PgPool, email: &str, role: &str) -> String {
    let password = "contraseña-de-prueba-larga";
    let id: uuid::Uuid = sqlx::query_scalar("INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,'Prueba') RETURNING id")
        .bind(email)
        .bind(auth::hash_password(password).unwrap())
        .fetch_one(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO user_roles SELECT $1, id FROM roles WHERE key = $2").bind(id).bind(role).execute(pool).await.unwrap();
    password.to_string()
}

pub async fn login(app: &Router, email: &str, password: &str) -> String {
    let (s, b) = call(app, Method::POST, "/api/v1/auth/login", None, Some(json!({"email": email, "password": password}))).await;
    assert_eq!(s, StatusCode::OK, "{b}");
    b["access_token"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn full_platform_flow() {
    let Some(db) = TestDb::new().await else {
        eprintln!("TEST_DATABASE_ADMIN_URL no definida: prueba omitida");
        return;
    };
    let app = app(db.pool.clone());

    // --- Mapa y catálogo público
    let (s, points) = call(&app, Method::GET, "/api/v1/map/points", None, None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(points.as_array().unwrap().len(), 17);
    let (s, d) = call(&app, Method::GET, "/api/v1/destinations/cascada-arenal?lang=en", None, None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(d["visitDuration"], "Full day");
    let (s, _) = call(&app, Method::GET, "/api/v1/destinations/no-existe", None, None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);

    // --- Autenticación y permisos
    let admin_pw = user(&db.pool, "admin@test.local", "superadmin").await;
    let editor_pw = user(&db.pool, "editor@test.local", "editor").await;
    let bm_pw = user(&db.pool, "reservas@test.local", "booking_manager").await;
    let (s, _) = call(&app, Method::POST, "/api/v1/auth/login", None, Some(json!({"email": "admin@test.local", "password": "mala"}))).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
    let (s, _) = call(&app, Method::POST, "/api/v1/auth/login", None, Some(json!({"email": "nadie@test.local", "password": "x"}))).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
    let admin = login(&app, "admin@test.local", &admin_pw).await;
    let editor = login(&app, "editor@test.local", &editor_pw).await;
    let manager = login(&app, "reservas@test.local", &bm_pw).await;
    let (s, _) = call(&app, Method::GET, "/api/v1/admin/bookings", Some("token-falso"), None).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);

    // El editor no puede crear paquetes
    let package = json!({
        "code": "XD-ARENAL-2D", "slug": "arenal-2d1n", "name": "Cascada Arenal y Río Venao",
        "package_type": "two_days_one_night", "short_description": "Dos días entre cascadas del valle de Arenal.",
        "description": "Paquete de prueba creado en la suite de integración.", "days": 2, "nights": 1,
        "difficulty": "moderada", "min_participants": 2, "max_capacity": 12, "currency": "USD", "tax_rate": "0.07",
        "destinations": ["cascada-arenal", "chorro-rio-venao"],
        "itinerary": [
            {"day": 1, "title": "Llegada y Cascada Arenal", "lodging": "Por definir",
             "activities": [{"start": "08:00:00", "end": "12:00:00", "title": "Caminata", "destination": "cascada-arenal"}]},
            {"day": 2, "title": "Chorro Río Venao", "activities": []}
        ],
        "inclusions": [{"kind": "guide", "description": "Guía local"}],
        "exclusions": ["Gastos personales"]
    });
    let (s, _) = call(&app, Method::POST, "/api/v1/admin/packages", Some(&editor), Some(package.clone())).await;
    assert_eq!(s, StatusCode::FORBIDDEN);

    // Validación
    let mut bad = package.clone();
    bad["slug"] = json!("Slug Inválido");
    let (s, b) = call(&app, Method::POST, "/api/v1/admin/packages", Some(&admin), Some(bad)).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY, "{b}");

    // --- Paquete: crear, no publicable sin precio, precio, publicar
    let (s, b) = call(&app, Method::POST, "/api/v1/admin/packages", Some(&admin), Some(package.clone())).await;
    assert_eq!(s, StatusCode::CREATED, "{b}");
    let pkg_id = b["id"].as_str().unwrap().to_string();
    let (s, _) = call(&app, Method::POST, "/api/v1/admin/packages", Some(&admin), Some(package)).await;
    assert_eq!(s, StatusCode::CONFLICT, "código/slug duplicado");
    let (s, _) = call(&app, Method::POST, &format!("/api/v1/admin/packages/{pkg_id}/publish"), Some(&admin), Some(json!({"status": "published"}))).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY, "sin precio no se publica");
    let (s, _) = call(&app, Method::GET, "/api/v1/packages/arenal-2d1n", None, None).await;
    assert_eq!(s, StatusCode::NOT_FOUND, "borrador no es público");

    for price in [json!({"price_type": "adult", "amount": "150.00"}), json!({"price_type": "child", "amount": "90.00"})] {
        let (s, b) = call(&app, Method::POST, &format!("/api/v1/admin/packages/{pkg_id}/prices"), Some(&admin), Some(price)).await;
        assert_eq!(s, StatusCode::CREATED, "{b}");
    }
    let (s, _) = call(&app, Method::POST, &format!("/api/v1/admin/packages/{pkg_id}/publish"), Some(&admin), Some(json!({"status": "published", "is_featured": true}))).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (s, p) = call(&app, Method::GET, "/api/v1/packages/arenal-2d1n", None, None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(p["itinerary"].as_array().unwrap().len(), 2);
    assert_eq!(p["itinerary"][0]["activities"][0]["destination"], "cascada-arenal");
    assert_eq!(p["destinations"].as_array().unwrap().len(), 2);
    // El destino ahora muestra el paquete asociado
    let (_, d) = call(&app, Method::GET, "/api/v1/destinations/cascada-arenal", None, None).await;
    assert_eq!(d["packages"][0]["code"], "XD-ARENAL-2D");
    // Comparador: mínimo 2
    let (s, _) = call(&app, Method::GET, "/api/v1/packages/compare?slugs=arenal-2d1n", None, None).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    // Historial de precios
    let hist: i64 = sqlx::query_scalar("SELECT count(*) FROM package_price_history WHERE package_id = $1::uuid")
        .bind(&pkg_id).fetch_one(&db.pool).await.unwrap();
    assert_eq!(hist, 2);

    // --- Reserva: precio, solicitud, estados
    let date = (chrono::Utc::now().date_naive() + chrono::Days::new(40)).to_string();
    let (s, price) = call(&app, Method::GET, &format!("/api/v1/bookings/price?package=arenal-2d1n&travel_date={date}&adults=2&children=1"), None, None).await;
    assert_eq!(s, StatusCode::OK, "{price}");
    assert_eq!(price["total"], "417.30"); // (2×150 + 90) × 1.07
    let (s, _) = call(&app, Method::GET, &format!("/api/v1/bookings/price?package=arenal-2d1n&travel_date={date}&adults=1"), None, None).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY, "mínimo 2 participantes");

    let booking = json!({
        "package": "arenal-2d1n", "travel_date": date, "adults": 2, "children": 1,
        "visitor": {"first_name": "Ana", "last_name": "Pérez", "email": "ana@example.com", "phone": "+507 6000-0000", "country": "PA"},
        "services": [{"description": "Transporte desde Ciudad de Panamá", "quantity": 1}],
        "notes": "Vegetariana"
    });
    let (s, b) = call(&app, Method::POST, "/api/v1/bookings", None, Some(booking.clone())).await;
    assert_eq!(s, StatusCode::CREATED, "{b}");
    assert_eq!(b["status"], "received");
    assert!(b["code"].as_str().unwrap().starts_with("XD-"));
    assert_eq!(b["price"]["total"], "417.30");
    assert_eq!(b["itinerary"].as_array().unwrap().len(), 2);

    let mut bad = booking.clone();
    bad["visitor"]["email"] = json!("no-es-correo");
    let (s, _) = call(&app, Method::POST, "/api/v1/bookings", None, Some(bad)).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);

    let (s, list) = call(&app, Method::GET, "/api/v1/admin/bookings?status=received", Some(&manager), None).await;
    assert_eq!(s, StatusCode::OK);
    let bid = list[0]["id"].as_str().unwrap().to_string();
    let status_uri = format!("/api/v1/admin/bookings/{bid}/status");

    // No se puede confirmar directamente; y confirmar exige disponibilidad verificada
    let (s, _) = call(&app, Method::POST, &status_uri, Some(&manager), Some(json!({"status": "confirmed"}))).await;
    assert_eq!(s, StatusCode::CONFLICT);
    let (s, _) = call(&app, Method::POST, &status_uri, Some(&manager), Some(json!({"status": "pending", "note": "Revisando"}))).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (s, e) = call(&app, Method::POST, &status_uri, Some(&manager), Some(json!({"status": "confirmed"}))).await;
    assert_eq!(s, StatusCode::CONFLICT, "sin disponibilidad registrada: {e}");

    // Disponibilidad de 2 plazas: insuficiente para 3 personas
    let avail = format!("/api/v1/admin/packages/{pkg_id}/availability");
    let (s, _) = call(&app, Method::PUT, &avail, Some(&admin), Some(json!({"date": date, "capacity": 2}))).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (s, _) = call(&app, Method::POST, &status_uri, Some(&manager), Some(json!({"status": "confirmed"}))).await;
    assert_eq!(s, StatusCode::CONFLICT);
    let (_, _) = call(&app, Method::PUT, &avail, Some(&admin), Some(json!({"date": date, "capacity": 10}))).await;
    let (s, _) = call(&app, Method::POST, &status_uri, Some(&manager), Some(json!({"status": "confirmed", "note": "Cupo verificado"}))).await;
    assert_eq!(s, StatusCode::NO_CONTENT);

    let (s, detail) = call(&app, Method::GET, &format!("/api/v1/admin/bookings/{bid}"), Some(&manager), None).await;
    assert_eq!(s, StatusCode::OK);
    let history = detail["history"].as_array().unwrap();
    assert_eq!(history.len(), 3, "{history:?}"); // received → pending → confirmed
    assert_eq!(history[2]["note"], "Cupo verificado");
    assert!(history[2]["changed_by"].is_string());
    assert_eq!(detail["services"].as_array().unwrap().len(), 1);

    // Gestor de reservas no puede publicar paquetes
    let (s, _) = call(&app, Method::POST, &format!("/api/v1/admin/packages/{pkg_id}/publish"), Some(&manager), Some(json!({"status": "draft"}))).await;
    assert_eq!(s, StatusCode::FORBIDDEN);

    // --- Operación: cobros, personal, inventario, gastos y ganancias
    let today = chrono::Utc::now().date_naive();
    let (s, b) = call(&app, Method::POST, &format!("/api/v1/admin/bookings/{bid}/payments"), Some(&manager),
        Some(json!({"amount": "200.00", "method": "transfer", "paid_on": today}))).await;
    assert_eq!(s, StatusCode::CREATED, "{b}");
    let (s, b) = call(&app, Method::POST, "/api/v1/admin/staff", Some(&admin),
        Some(json!({"full_name": "Guía de prueba", "role": "guide", "pay_type": "per_day", "pay_rate": "30.00", "community": "Arenal"}))).await;
    assert_eq!(s, StatusCode::CREATED, "{b}");
    let staff_id = b["id"].as_str().unwrap().to_string();
    let (s, a) = call(&app, Method::POST, &format!("/api/v1/admin/bookings/{bid}/staff"), Some(&admin), Some(json!({"staff_id": staff_id}))).await;
    assert_eq!(s, StatusCode::CREATED, "{a}");
    let (_, detail) = call(&app, Method::GET, &format!("/api/v1/admin/bookings/{bid}"), Some(&manager), None).await;
    assert_eq!(detail["paidTotal"], "200.00");
    assert_eq!(detail["staffAssignments"][0]["amount"], "60.00", "2 días × 30");
    // Choque de fechas: el mismo guía no puede estar en otro viaje solapado
    let (_, b2) = call(&app, Method::POST, "/api/v1/bookings", None, Some(booking.clone())).await;
    let (_, list2) = call(&app, Method::GET, "/api/v1/admin/bookings?status=received", Some(&manager), None).await;
    let bid2 = list2.as_array().unwrap().iter().find(|x| x["code"] == b2["code"]).unwrap()["id"].as_str().unwrap().to_string();
    let (s, e) = call(&app, Method::POST, &format!("/api/v1/admin/bookings/{bid2}/staff"), Some(&admin), Some(json!({"staff_id": staff_id}))).await;
    assert_eq!(s, StatusCode::CONFLICT, "{e}");
    let (s, _) = call(&app, Method::POST, &format!("/api/v1/admin/bookings/{bid2}/payments"), Some(&manager), Some(json!({"amount": "10", "method": "cash"}))).await;
    assert_eq!(s, StatusCode::CONFLICT, "no se cobra una solicitud sin confirmar");
    // Inventario: compra (gasto automático), salida y bloqueo de existencias negativas
    let (_, item) = call(&app, Method::POST, "/api/v1/admin/inventory", Some(&admin), Some(json!({"name": "Chaleco salvavidas", "category": "safety", "min_stock": 6}))).await;
    let item_id = item["id"].as_str().unwrap().to_string();
    let mv_uri = format!("/api/v1/admin/inventory/{item_id}/movements");
    let mv = |body: Value| call(&app, Method::POST, &mv_uri, Some(&admin), Some(body));
    assert_eq!(mv(json!({"type": "purchase", "quantity": 10, "unit_cost": "15.00"})).await.0, StatusCode::CREATED);
    assert_eq!(mv(json!({"type": "checkout", "quantity": 5, "booking_id": bid})).await.0, StatusCode::CREATED);
    assert_eq!(mv(json!({"type": "checkout", "quantity": 99})).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (_, inv) = call(&app, Method::GET, "/api/v1/admin/inventory", Some(&admin), None).await;
    let it = &inv[0];
    assert_eq!((it["quantity"].as_i64(), it["in_use"].as_i64(), it["low"].as_bool()), (Some(5), Some(5), Some(true)));
    // Gasto manual y estado de resultados
    let (s, _) = call(&app, Method::POST, "/api/v1/admin/expenses", Some(&admin),
        Some(json!({"category": "fuel", "description": "Combustible bote", "amount": "40.00", "spent_on": today}))).await;
    assert_eq!(s, StatusCode::CREATED);
    let (_, fin) = call(&app, Method::GET, &format!("/api/v1/admin/finance?from={today}&to={today}"), Some(&admin), None).await;
    assert_eq!(fin["income"], "200.00");
    assert_eq!(fin["expenses"], "190.00", "150 chalecos + 40 combustible: {fin}");
    let (_, dash) = call(&app, Method::GET, "/api/v1/admin/dashboard", Some(&admin), None).await;
    assert!(dash["finance"]["monthly"].as_array().unwrap().len() == 12);
    assert_eq!(dash["lowStock"][0]["name"], "Chaleco salvavidas");
    let (_, dash_bm) = call(&app, Method::GET, "/api/v1/admin/dashboard", Some(&manager), None).await;
    assert!(dash_bm.get("finance").is_none(), "sin finance.read no se ven cifras de ganancia");
    let (s, _) = call(&app, Method::GET, "/api/v1/admin/finance", Some(&manager), None).await;
    assert_eq!(s, StatusCode::FORBIDDEN);
    let aid = a["id"].as_str().unwrap();
    assert_eq!(call(&app, Method::PATCH, &format!("/api/v1/admin/staff-assignments/{aid}"), Some(&admin), Some(json!({"paid": true}))).await.0, StatusCode::NO_CONTENT);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/v1/admin/staff-assignments/{aid}"), Some(&admin), None).await.0, StatusCode::CONFLICT, "no se borra un pago hecho");

    // --- Precios por temporada
    let (s, seasons) = call(&app, Method::GET, "/api/v1/seasons", None, None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(seasons.as_array().unwrap().len(), 2);
    let (s, b) = call(&app, Method::POST, &format!("/api/v1/admin/packages/{pkg_id}/prices"), Some(&admin),
        Some(json!({"price_type": "adult", "amount": "200.00", "season": "alta"}))).await;
    assert_eq!(s, StatusCode::CREATED, "{b}");
    let alta_price = b["id"].as_str().unwrap().to_string();
    let (s, _) = call(&app, Method::POST, &format!("/api/v1/admin/packages/{pkg_id}/prices"), Some(&admin),
        Some(json!({"price_type": "adult", "amount": "1", "season": "no-existe"}))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "temporada desconocida");
    let (s, _) = call(&app, Method::POST, &format!("/api/v1/admin/packages/{pkg_id}/prices"), Some(&admin),
        Some(json!({"price_type": "adult", "amount": "210.00", "season": "alta"}))).await;
    assert_eq!(s, StatusCode::CONFLICT, "una sola tarifa activa por tipo y temporada");
    let year = chrono::Utc::now().year() + 1;
    let quote = |date: String| format!("/api/v1/bookings/price?package=arenal-2d1n&travel_date={date}&adults=2");
    let (_, high) = call(&app, Method::GET, &quote(format!("{year}-02-10")), None, None).await;
    assert_eq!(high["total"], "428.00", "temporada alta: 2 × 200 × 1.07 → {high}");
    let (_, low) = call(&app, Method::GET, &quote(format!("{year}-06-10")), None, None).await;
    assert_eq!(low["total"], "321.00", "fuera de temporada con precio: tarifa general 2 × 150 × 1.07 → {low}");
    // Editar el precio de temporada queda en el historial
    let (s, _) = call(&app, Method::PATCH, &format!("/api/v1/admin/packages/{pkg_id}/prices/{alta_price}"), Some(&admin), Some(json!({"amount": "180.00"}))).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (_, high) = call(&app, Method::GET, &quote(format!("{year}-02-10")), None, None).await;
    assert_eq!(high["total"], "385.20");
    let (_, list) = call(&app, Method::GET, "/api/v1/admin/packages", Some(&admin), None).await;
    let pkg = list.as_array().unwrap().iter().find(|p| p["code"] == "XD-ARENAL-2D").unwrap();
    assert!(pkg["priceHistory"].as_array().unwrap().iter().any(|h| h["old"] == "200.00" && h["new"] == "180.00" && h["season"] == "alta"));
    // Mover la temporada cambia qué precio aplica
    let (s, _) = call(&app, Method::PUT, "/api/v1/admin/seasons/alta", Some(&admin),
        Some(json!({"name": "Temporada alta", "start": "01-01", "end": "01-31"}))).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (_, feb) = call(&app, Method::GET, &quote(format!("{year}-02-10")), None, None).await;
    assert_eq!(feb["total"], "321.00");
    let (s, _) = call(&app, Method::PUT, "/api/v1/admin/seasons/alta", Some(&admin),
        Some(json!({"name": "x", "start": "13-01", "end": "01-31"}))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _) = call(&app, Method::PUT, "/api/v1/admin/seasons/alta", Some(&manager), Some(json!({"name": "x", "start": "01-01", "end": "01-31"}))).await;
    assert_eq!(s, StatusCode::FORBIDDEN);

    // --- Restricciones de base de datos
    let route_err = sqlx::query("INSERT INTO routes (slug, name, mode, status) VALUES ('ruta-x', 'Ruta X', 'walk', 'published')")
        .execute(&db.pool)
        .await;
    assert!(route_err.is_err(), "una ruta no verificada no puede publicarse");

    let audits: i64 = sqlx::query_scalar("SELECT count(*) FROM audit_logs").fetch_one(&db.pool).await.unwrap();
    assert!(audits >= 8);

    db.drop().await;
}

// =====================================================================================
// Cinematic Gallery + Media Studio + AI Video Studio
// =====================================================================================

/// Servidor de prueba que reproduce el contrato documentado de Higgsfield
/// (https://docs.higgsfield.ai/docs/llms.txt). Solo existe dentro de las pruebas.
mod mock_higgsfield {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use axum::{
        Json, Router,
        extract::{Path, State},
        http::{HeaderMap, StatusCode},
        routing::{get, post, put},
    };
    use serde_json::{Value, json};

    pub const AUTH: &str = "Key test-id:test-secret";

    #[derive(Clone, Default)]
    pub struct Calls {
        pub submits: Arc<AtomicUsize>,
        pub polls: Arc<AtomicUsize>,
        pub uploads: Arc<AtomicUsize>,
        pub base: Arc<std::sync::OnceLock<String>>,
    }

    fn authed(h: &HeaderMap) -> bool {
        h.get("authorization").and_then(|v| v.to_str().ok()) == Some(AUTH)
    }

    pub async fn start() -> (String, Calls) {
        let calls = Calls::default();
        let app = Router::new()
            .route("/files/generate-upload-url", post(|State(c): State<Calls>, h: HeaderMap, Json(b): Json<Value>| async move {
                if !authed(&h) { return (StatusCode::UNAUTHORIZED, Json(json!({"detail": "Invalid credentials"}))); }
                let base = c.base.get().unwrap().clone();
                (StatusCode::OK, Json(json!({
                    "public_url": format!("{base}/cdn/ref.jpg"), "upload_url": format!("{base}/presigned"),
                    "content_type": b["content_type"], "upload_headers": {"Content-Type": b["content_type"]}})))
            }))
            .route("/presigned", put(|State(c): State<Calls>, h: HeaderMap| async move {
                // La URL prefirmada NUNCA debe recibir las credenciales.
                assert!(h.get("authorization").is_none(), "credenciales enviadas al almacenamiento");
                c.uploads.fetch_add(1, Ordering::SeqCst);
                StatusCode::OK
            }))
            .route("/estimate/{*endpoint}", post(|h: HeaderMap| async move {
                if !authed(&h) { return (StatusCode::UNAUTHORIZED, Json(json!({"detail": "Invalid credentials"}))); }
                (StatusCode::OK, Json(json!({"usd": "0.50"})))
            }))
            .route("/requests/{id}/status", get(|State(c): State<Calls>, h: HeaderMap, Path(id): Path<String>| async move {
                assert!(authed(&h));
                let n = c.polls.fetch_add(1, Ordering::SeqCst);
                let base = c.base.get().unwrap().clone();
                Json(if n == 0 {
                    json!({"status": "in_progress", "request_id": id})
                } else {
                    json!({"status": "completed", "request_id": id, "video": {"url": format!("{base}/cdn/out.mp4")},
                           "expires_at": "2030-01-01T00:00:00Z"})
                })
            }))
            .route("/cdn/out.mp4", get(|| async {
                std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../review/instagram/videos/2026-11-10_Dfk_rYaGOA2_carrusel-h12_video.mp4")).unwrap()
            }))
            .route("/{*endpoint}", post(|State(c): State<Calls>, h: HeaderMap, Json(body): Json<Value>| async move {
                assert!(authed(&h));
                assert!(h.get("idempotency-key").is_some(), "falta Idempotency-Key");
                assert_eq!(body["image_url"], format!("{}/cdn/ref.jpg", c.base.get().unwrap()));
                assert!(body["prompt"].as_str().unwrap().contains("Darién"));
                c.submits.fetch_add(1, Ordering::SeqCst);
                let base = c.base.get().unwrap().clone();
                let id = "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff";
                Json(json!({"status": "queued", "request_id": id,
                    "status_url": format!("{base}/requests/{id}/status"), "cancel_url": format!("{base}/requests/{id}/cancel")}))
            }))
            .with_state(calls.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        calls.base.set(base.clone()).unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (base, calls)
    }
}

fn multipart(name: &str, content_type: &str, bytes: &[u8]) -> (String, Vec<u8>) {
    let boundary = "xploraBoundary7MA4YWxk";
    let mut body = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: {content_type}\r\n\r\n"
    )
    .into_bytes();
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    (format!("multipart/form-data; boundary={boundary}"), body)
}

#[tokio::test]
async fn gallery_media_studio_and_ai_studio() {
    let Some(db) = TestDb::new().await else {
        eprintln!("TEST_DATABASE_ADMIN_URL no definida: prueba omitida");
        return;
    };
    let (hf_base, calls) = mock_higgsfield::start().await;
    let storage = std::env::temp_dir().join(format!("xd_storage_{}", uuid::Uuid::new_v4().simple()));
    let mut config = xplora_darien_api::config::tests_support::config();
    config.pageweb_dir = concat!(env!("CARGO_MANIFEST_DIR"), "/..").into();
    config.storage_dir = storage.clone();
    config.higgsfield.base_url = hf_base;
    config.higgsfield.key_id = Some("test-id".into());
    config.higgsfield.key_secret = Some("test-secret".into());
    let app = app_with(db.pool.clone(), config.clone());

    // ---------------- Galería pública
    let (s, cats) = call(&app, Method::GET, "/api/v1/gallery/categories?lang=en", None, None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(cats.as_array().unwrap().len(), 12);
    assert_eq!(cats[0]["name"], "Rainforest & nature");
    assert!(cats[0]["cover"]["url"].as_str().unwrap().starts_with("/media-hd/imagen/"));

    let (_, page1) = call(&app, Method::GET, "/api/v1/gallery/media?type=photo&limit=24", None, None).await;
    assert_eq!(page1["items"].as_array().unwrap().len(), 24);
    assert!(page1["hasMore"].as_bool().unwrap());
    let total = page1["total"].as_i64().unwrap();
    assert!(total > 100, "{total}");
    let (_, videos) = call(&app, Method::GET, "/api/v1/gallery/media?type=video", None, None).await;
    assert_eq!(videos["total"], 12);
    assert!(videos["items"].as_array().unwrap().iter().all(|v| v["posterUrl"].is_string()), "todo video tiene póster");
    let (_, by_dest) = call(&app, Method::GET, "/api/v1/gallery/destinations", None, None).await;
    let by_dest = by_dest.as_array().unwrap();
    assert!(by_dest.iter().all(|d| d["cover"]["url"].is_string()), "todo destino de la galería tiene portada");
    assert!(!by_dest.iter().any(|d| d["slug"] == "la-palma"), "La Palma solo tiene fotos sin verificar");
    let arenal_d = by_dest.iter().find(|d| d["slug"] == "cascada-arenal").unwrap();
    let (_, arenal_media) = call(&app, Method::GET, "/api/v1/gallery/media?destination=cascada-arenal&type=photo&limit=60", None, None).await;
    assert_eq!(arenal_media["total"], arenal_d["photos"]);
    let (_, hero) = call(&app, Method::GET, "/api/v1/gallery/hero", None, None).await;
    assert!(!hero["videos"].as_array().unwrap().is_empty());

    // Las fotos con atribución estimada no muestran el lugar públicamente.
    let guess: uuid::Uuid = sqlx::query_scalar("SELECT id FROM media_assets WHERE path = 'imagen/image1.jpeg'").fetch_one(&db.pool).await.unwrap();
    let (_, item) = call(&app, Method::GET, &format!("/api/v1/gallery/media/{guess}"), None, None).await;
    assert_eq!(item["destinations"], json!([]));
    let arenal: uuid::Uuid = sqlx::query_scalar("SELECT id FROM media_assets WHERE path = 'imagen/arenal.jpg'").fetch_one(&db.pool).await.unwrap();
    let (_, item) = call(&app, Method::GET, &format!("/api/v1/gallery/media/{arenal}"), None, None).await;
    assert_eq!(item["destinations"][0]["slug"], "cascada-arenal");
    assert_eq!(item["destinations"][0]["attribution"], "owner_filename");
    assert_eq!(item["url"], "/media-hd/imagen/arenal.jpg");
    let (_, la_palma) = call(&app, Method::GET, "/api/v1/destinations/la-palma", None, None).await;
    assert_eq!(la_palma["media"], json!([]), "La Palma solo tenía fotos sin verificar");

    let (s, _) = call(&app, Method::POST, &format!("/api/v1/gallery/media/{arenal}/events"), None, Some(json!({"event": "lightbox_open"}))).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (s, _) = call(&app, Method::POST, &format!("/api/v1/gallery/media/{arenal}/events"), None, Some(json!({"event": "hack"}))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    // CORS: el panel usa PATCH/DELETE desde otro origen (regresión: PATCH no estaba permitido).
    let pre = Request::builder().method(Method::OPTIONS).uri(format!("/api/v1/admin/media/{arenal}"))
        .header(header::ORIGIN, "http://localhost:3000").header("access-control-request-method", "PATCH")
        .header("access-control-request-headers", "authorization,content-type").body(Body::empty()).unwrap();
    let res = app.clone().oneshot(pre).await.unwrap();
    let allowed = res.headers().get("access-control-allow-methods").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    assert!(allowed.contains("PATCH") && allowed.contains("DELETE"), "{allowed}");

    // ---------------- Media Management Studio
    let admin_pw = user(&db.pool, "admin@test.local", "superadmin").await;
    let editor_pw = user(&db.pool, "editor@test.local", "editor").await;
    let bm_pw = user(&db.pool, "reservas@test.local", "booking_manager").await;
    let admin = login(&app, "admin@test.local", &admin_pw).await;
    let editor = login(&app, "editor@test.local", &editor_pw).await;
    let manager = login(&app, "reservas@test.local", &bm_pw).await;
    let (s, _) = call(&app, Method::GET, "/api/v1/admin/media", Some(&manager), None).await;
    assert_eq!(s, StatusCode::FORBIDDEN);

    let (s, b) = call(&app, Method::PATCH, &format!("/api/v1/admin/media/{arenal}"), Some(&editor), Some(json!({
        "title": "Cascada Arenal · grupo", "tags": ["Río Congo", "cascada"], "categories": ["rios-cascadas", "aventuras-exploracion"],
        "destinations": [{"slug": "cascada-arenal", "attribution": "verified"}], "is_featured": true
    }))).await;
    assert_eq!(s, StatusCode::NO_CONTENT, "{b}");
    let (_, m) = call(&app, Method::GET, &format!("/api/v1/admin/media/{arenal}"), Some(&editor), None).await;
    assert_eq!(m["tags"], json!(["cascada", "Río Congo"]));
    assert_eq!(m["stats"]["views"], 1);
    let (s, _) = call(&app, Method::PATCH, &format!("/api/v1/admin/media/{arenal}"), Some(&editor), Some(json!({"categories": ["no-existe"]}))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    // Eliminar exige confirmación
    let (s, _) = call(&app, Method::DELETE, &format!("/api/v1/admin/media/{guess}"), Some(&editor), None).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _) = call(&app, Method::DELETE, &format!("/api/v1/admin/media/{guess}?confirm={guess}"), Some(&editor), None).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (s, _) = call(&app, Method::GET, &format!("/api/v1/gallery/media/{guess}"), None, None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    assert!(std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../imagen/image1.jpeg")).exists(), "el original no se toca");

    // Subida: tipo, firma y duplicados
    let jpeg = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../imagen/img2.jpeg")).unwrap();
    let mut modified = jpeg.clone();
    modified.push(0); // contenido distinto al original para no ser duplicado
    let upload = |ct: String, body: Vec<u8>| {
        Request::builder().method(Method::POST).uri("/api/v1/admin/media/upload")
            .header(header::AUTHORIZATION, format!("Bearer {editor}")).header(header::CONTENT_TYPE, ct)
            .body(Body::from(body)).unwrap()
    };
    let (ct, body) = multipart("arco.jpg", "image/jpeg", &modified);
    let res = app.clone().oneshot(upload(ct, body)).await.unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
    let (ct, body) = multipart("arco2.jpg", "image/jpeg", &modified);
    assert_eq!(app.clone().oneshot(upload(ct, body)).await.unwrap().status(), StatusCode::CONFLICT);
    let (ct, body) = multipart("falso.jpg", "image/jpeg", b"<html>no soy una imagen</html>");
    assert_eq!(app.clone().oneshot(upload(ct, body)).await.unwrap().status(), StatusCode::UNPROCESSABLE_ENTITY);
    let (ct, body) = multipart("x.svg", "image/svg+xml", b"<svg/>");
    assert_eq!(app.clone().oneshot(upload(ct, body)).await.unwrap().status(), StatusCode::UNPROCESSABLE_ENTITY);

    // Procesamiento: metadatos de la subida (ffprobe)
    xplora_darien_api::higgsfield::worker::tick(&db.pool, &config).await.unwrap();
    let w: Option<i32> = sqlx::query_scalar("SELECT width FROM media_assets WHERE source = 'upload'").fetch_one(&db.pool).await.unwrap();
    assert_eq!(w, Some(513));

    // ---------------- XPLORA AI Video Studio
    let (_, st) = call(&app, Method::GET, "/api/v1/admin/ai/status", Some(&editor), None).await;
    assert_eq!(st["configured"], true);
    let (_, models) = call(&app, Method::GET, "/api/v1/admin/ai/models?mode=image-to-video", Some(&editor), None).await;
    let kling = models.as_array().unwrap().iter().find(|m| m["endpoint"] == "kling-video/v2.5-turbo/pro/image-to-video").unwrap();
    assert_eq!(kling["durations"], json!([5, 10]));
    assert!(kling["aspectRatios"].is_null(), "este modelo no documenta aspect_ratio");
    let (_, templates) = call(&app, Method::GET, "/api/v1/admin/ai/templates", Some(&editor), None).await;
    assert_eq!(templates.as_array().unwrap().len(), 5);

    let genreq = json!({
        "model": "kling-video/v2.5-turbo/pro/image-to-video",
        "prompt": "Slow cinematic push-in to a tiered waterfall in the rainforest of Darién, Panama",
        "params": {"duration": 5}, "reference_media_id": arenal, "template": "rios", "category": "rios-cascadas"
    });
    let (s, e) = call(&app, Method::POST, "/api/v1/admin/ai/generations", Some(&editor), Some(genreq.clone())).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY, "sin presupuesto no se genera: {e}");
    let mut free = genreq.clone();
    free["dry_run"] = json!(true);
    let (s, e) = call(&app, Method::POST, "/api/v1/admin/ai/generations", Some(&editor), Some(free)).await;
    assert_eq!(s, StatusCode::OK, "estimar no requiere presupuesto: {e}");
    assert_eq!(e["withinBudget"], false);
    let (s, _) = call(&app, Method::PUT, "/api/v1/admin/ai/settings", Some(&editor), Some(json!({"monthly_budget_usd": "10"}))).await;
    assert_eq!(s, StatusCode::FORBIDDEN, "el editor no cambia el presupuesto");
    let (s, _) = call(&app, Method::PUT, "/api/v1/admin/ai/settings", Some(&admin), Some(json!({"monthly_budget_usd": "0.80"}))).await;
    assert_eq!(s, StatusCode::NO_CONTENT);

    let mut bad = genreq.clone();
    bad["params"] = json!({"duration": 7, "aspect_ratio": "9:16"});
    let (s, e) = call(&app, Method::POST, "/api/v1/admin/ai/generations", Some(&editor), Some(bad)).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(e["error"]["details"]["params"].as_array().unwrap().len(), 2, "{e}");
    let mut t2v_ref = genreq.clone();
    t2v_ref["model"] = json!("minimax/hailuo-2.3/standard/text-to-video");
    let (s, _) = call(&app, Method::POST, "/api/v1/admin/ai/generations", Some(&editor), Some(t2v_ref)).await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "un modelo text-to-video no acepta referencia");

    let mut dry = genreq.clone();
    dry["dry_run"] = json!(true);
    let (s, est) = call(&app, Method::POST, "/api/v1/admin/ai/generations", Some(&editor), Some(dry)).await;
    assert_eq!(s, StatusCode::OK, "{est}");
    assert_eq!(est["estimateUsd"], "0.50");
    assert_eq!(est["withinBudget"], true);

    let (s, created) = call(&app, Method::POST, "/api/v1/admin/ai/generations", Some(&editor), Some(genreq.clone())).await;
    assert_eq!(s, StatusCode::CREATED, "{created}");
    let gid = created["id"].as_str().unwrap().to_string();
    // Segundo envío supera el presupuesto (0.50 + 0.50 > 0.80)
    let (s, e) = call(&app, Method::POST, "/api/v1/admin/ai/generations", Some(&editor), Some(genreq.clone())).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(e["error"]["message"].as_str().unwrap().contains("presupuesto"));

    // Cola asíncrona: envío → in_progress → completed → descarga → póster
    for _ in 0..8 {
        xplora_darien_api::higgsfield::worker::tick(&db.pool, &config).await.unwrap();
        sqlx::query("UPDATE video_generations SET next_poll_at = now() WHERE next_poll_at IS NOT NULL").execute(&db.pool).await.unwrap();
    }
    let (_, g) = call(&app, Method::GET, &format!("/api/v1/admin/ai/generations/{gid}"), Some(&editor), None).await;
    assert_eq!(g["status"], "succeeded", "{g}");
    assert_eq!(g["requestId"], "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff");
    assert_eq!(calls.submits.load(std::sync::atomic::Ordering::SeqCst), 1);
    assert!(calls.uploads.load(std::sync::atomic::Ordering::SeqCst) >= 1);
    assert_eq!(g["result"]["width"], 720, "ffprobe del resultado");
    assert!(g["result"]["posterUrl"].as_str().unwrap().starts_with("http://api/files/posters/"));
    assert!(storage.join(format!("generated/{gid}.mp4")).exists());
    let media_id = g["result"]["id"].as_str().unwrap().to_string();
    let (s, _) = call(&app, Method::GET, &format!("/api/v1/gallery/media/{media_id}"), None, None).await;
    assert_eq!(s, StatusCode::NOT_FOUND, "no se publica sin aprobación");

    // Aprobar, asociar y publicar
    let (s, b) = call(&app, Method::POST, &format!("/api/v1/admin/ai/generations/{gid}/review"), Some(&editor), Some(json!({
        "decision": "approve", "title": "Cascada Arenal · IA", "categories": ["rios-cascadas", "videos-promocionales"],
        "destinations": ["cascada-arenal"], "publish": true
    }))).await;
    assert_eq!(s, StatusCode::NO_CONTENT, "{b}");
    let (s, pubd) = call(&app, Method::GET, &format!("/api/v1/gallery/media/{media_id}"), None, None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(pubd["aiGenerated"], true);
    assert_eq!(pubd["destinations"][0]["slug"], "cascada-arenal");
    assert!(pubd["url"].as_str().unwrap().starts_with("http://api/files/generated/"));

    let (s, _) = call(&app, Method::POST, &format!("/api/v1/admin/ai/generations/{gid}/cancel"), Some(&editor), None).await;
    assert_eq!(s, StatusCode::CONFLICT, "no se cancela algo terminado");

    let _ = std::fs::remove_dir_all(&storage);
    db.drop().await;
}

#[tokio::test]
async fn availability_notifications_and_reviews() {
    let Some(db) = TestDb::new().await else {
        eprintln!("TEST_DATABASE_ADMIN_URL no definida: prueba omitida");
        return;
    };
    let mail_dir = std::env::temp_dir().join(format!("xd_mail_{}", uuid::Uuid::new_v4().simple()));
    let mut config = xplora_darien_api::config::tests_support::config();
    config.mail_url = Some(format!("file://{}", mail_dir.display()));
    let app = app_with(db.pool.clone(), config.clone());
    let admin_pw = user(&db.pool, "admin@test.local", "superadmin").await;
    let admin = login(&app, "admin@test.local", &admin_pw).await;

    // Configuración del sitio: validación y lectura pública (sin datos privados)
    let (s, _) = call(&app, Method::PUT, "/api/v1/admin/site", Some(&admin), Some(json!({"contact.whatsapp": "+507 6000"}))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _) = call(&app, Method::PUT, "/api/v1/admin/site", Some(&admin),
        Some(json!({"contact.whatsapp": "50760000000", "notify.email": "equipo@xplora.test", "contact.email": "info@xplora.test"}))).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (_, site) = call(&app, Method::GET, "/api/v1/site", None, None).await;
    assert_eq!(site["contact.whatsapp"], "50760000000");
    assert!(site.get("notify.email").is_none(), "el correo interno no es público");
    assert!(site["page.privacy"].as_str().unwrap().contains("dirección IP"));

    // Publicar un paquete con precio y abrir disponibilidad por rango (solo sábados y domingos)
    let pkg: uuid::Uuid = sqlx::query_scalar("SELECT id FROM tour_packages WHERE code = 'XD-ARENAL-1D'").fetch_one(&db.pool).await.unwrap();
    call(&app, Method::POST, &format!("/api/v1/admin/packages/{pkg}/prices"), Some(&admin), Some(json!({"price_type": "adult", "amount": "40.00"}))).await;
    call(&app, Method::POST, &format!("/api/v1/admin/packages/{pkg}/publish"), Some(&admin), Some(json!({"status": "published"}))).await;
    let start = chrono::Utc::now().date_naive() + chrono::Days::new(10);
    let (s, r) = call(&app, Method::PUT, &format!("/api/v1/admin/packages/{pkg}/availability/range"), Some(&admin),
        Some(json!({"from": start, "to": start + chrono::Days::new(13), "capacity": 8, "weekdays": [6, 7]}))).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(r["days"], 4, "dos fines de semana");
    let weekend = (0..14).map(|d| start + chrono::Days::new(d)).find(|d| d.weekday().number_from_monday() == 6).unwrap();
    let weekday = (0..14).map(|d| start + chrono::Days::new(d)).find(|d| d.weekday().number_from_monday() == 2).unwrap();

    // Solicitud → correo al cliente + aviso interno
    let req = |date: chrono::NaiveDate| json!({"package": "cascadas-del-valle-de-arenal", "travel_date": date, "adults": 2,
        "visitor": {"first_name": "Ana", "last_name": "Pérez", "email": "ana@example.com", "phone": "+507 6000-0000", "country": "PA"}});
    let (s, b1) = call(&app, Method::POST, "/api/v1/bookings", None, Some(req(weekend))).await;
    assert_eq!(s, StatusCode::CREATED, "{b1}");
    let (_, b2) = call(&app, Method::POST, "/api/v1/bookings", None, Some(req(weekday))).await;
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM notifications WHERE status = 'pending' AND channel = 'email'").fetch_one(&db.pool).await.unwrap();
    assert_eq!(n, 4, "2 confirmaciones al cliente + 2 avisos internos");
    let sent = xplora_darien_api::notifications::process(&db.pool, &config, 20).await.unwrap();
    assert_eq!(sent, 4);
    let mails: Vec<String> = std::fs::read_dir(&mail_dir).unwrap()
        .filter_map(|e| std::fs::read_to_string(e.unwrap().path()).ok()).collect();
    assert_eq!(mails.len(), 4);
    let code1 = b1["code"].as_str().unwrap();
    assert!(mails.iter().any(|m| m.contains("ana@example.com") && m.contains(code1) && m.contains("wa.me/50760000000")), "correo al cliente con WhatsApp");
    assert!(mails.iter().any(|m| m.contains("equipo@xplora.test") && m.contains("Nueva solicitud")), "aviso interno");

    // Confirmar: el fin de semana tiene cupo; el martes no tiene disponibilidad
    let id_of = |code: &str| {
        let code = code.to_string();
        let pool = db.pool.clone();
        async move { sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM bookings WHERE code = $1").bind(code).fetch_one(&pool).await.unwrap() }
    };
    let id1 = id_of(code1).await;
    let id2 = id_of(b2["code"].as_str().unwrap()).await;
    for s in ["pending", "confirmed"] {
        let (st, e) = call(&app, Method::POST, &format!("/api/v1/admin/bookings/{id1}/status"), Some(&admin), Some(json!({"status": s}))).await;
        assert_eq!(st, StatusCode::NO_CONTENT, "{e}");
    }
    call(&app, Method::POST, &format!("/api/v1/admin/bookings/{id2}/status"), Some(&admin), Some(json!({"status": "pending"}))).await;
    let (st, _) = call(&app, Method::POST, &format!("/api/v1/admin/bookings/{id2}/status"), Some(&admin), Some(json!({"status": "confirmed"}))).await;
    assert_eq!(st, StatusCode::CONFLICT, "sin disponibilidad ese día");
    xplora_darien_api::notifications::process(&db.pool, &config, 20).await.unwrap();
    let confirmed = std::fs::read_dir(&mail_dir).unwrap().filter_map(|e| std::fs::read_to_string(e.unwrap().path()).ok())
        .any(|m| m.contains("confirmada") && m.contains(code1));
    assert!(confirmed, "correo de reserva confirmada");
    let (_, pkgs) = call(&app, Method::GET, "/api/v1/admin/packages", Some(&admin), None).await;
    let arenal = pkgs.as_array().unwrap().iter().find(|p| p["code"] == "XD-ARENAL-1D").unwrap();
    let day = arenal["availability"].as_array().unwrap().iter().find(|a| a["date"] == json!(weekend)).unwrap();
    assert_eq!(day["taken"], 2);

    // Opiniones: con código solo si el viaje ya ocurrió; luego moderación y publicación
    let review = |code: Option<&str>| json!({"name": "Ana Pérez", "email": "ana@example.com", "rating": 5,
        "body": "Una experiencia increíble en la Cascada Arenal, el guía fue excelente.", "country": "PA", "booking_code": code});
    let (s, _) = call(&app, Method::POST, "/api/v1/reviews", None, Some(review(Some(code1)))).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY, "el viaje aún no ocurrió");
    sqlx::query("UPDATE bookings SET travel_date = current_date - 3 WHERE id = $1").bind(id1).execute(&db.pool).await.unwrap();
    let (s, r) = call(&app, Method::POST, "/api/v1/reviews", None, Some(review(Some(code1)))).await;
    assert_eq!(s, StatusCode::CREATED, "{r}");
    assert_eq!(r["verified"], true);
    let (s, _) = call(&app, Method::POST, "/api/v1/reviews", None, Some(review(Some(code1)))).await;
    assert_eq!(s, StatusCode::CONFLICT, "una opinión por reserva");
    let (s, _) = call(&app, Method::POST, "/api/v1/reviews", None, Some(review(None))).await;
    assert_eq!(s, StatusCode::CREATED);
    let (_, public) = call(&app, Method::GET, "/api/v1/testimonials", None, None).await;
    assert_eq!(public["count"], 0, "nada se publica sin moderación");
    let rid = r["id"].as_str().unwrap();
    let (s, _) = call(&app, Method::POST, &format!("/api/v1/admin/reviews/{rid}/moderate"), Some(&admin), Some(json!({"status": "published"}))).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (_, public) = call(&app, Method::GET, "/api/v1/testimonials", None, None).await;
    assert_eq!(public["count"], 1);
    assert_eq!(public["items"][0]["verified"], true);
    assert!(public["items"][0].get("email").is_none(), "no se publica el correo");
    assert_eq!(public["items"][0]["package"]["slug"], "cascadas-del-valle-de-arenal");

    let _ = std::fs::remove_dir_all(&mail_dir);
    db.drop().await;
}

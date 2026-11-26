//! Operación del negocio: panel de control, personal, inventario, cobros, gastos y ganancias.
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::{Value, json};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    audit,
    auth::AuthUser,
    destinations::Created,
    errors::{AppError, AppResult},
    state::AppState,
};

fn can(user: &AuthUser, perm: &str) -> bool {
    user.require(perm).is_ok()
}

// ================================================================= Panel de control

/// Indicadores del negocio. Las cifras financieras solo se incluyen con `finance.read`.
#[utoipa::path(get, path = "/api/v1/admin/dashboard", tag = "operations", security(("bearer" = [])), responses((status = 200, body = Object)))]
pub async fn dashboard(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    user.require("bookings.read")?;
    let mut v: Value = sqlx::query_scalar(
        "SELECT jsonb_build_object(
          'bookingsByStatus', (SELECT COALESCE(jsonb_object_agg(status, n), '{}') FROM (SELECT status::text, count(*) n FROM bookings GROUP BY 1) s),
          'newRequests7d', (SELECT count(*) FROM bookings WHERE created_at > now() - interval '7 days'),
          'pendingReview', (SELECT count(*) FROM bookings WHERE status IN ('received','pending','quoting')),
          'upcoming', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'travelDate') FROM (
              SELECT jsonb_build_object('id', b.id, 'code', b.code, 'travelDate', b.travel_date, 'status', b.status,
                'package', p.name, 'people', b.adults + b.children, 'customer', c.first_name || ' ' || c.last_name,
                'staff', (SELECT count(*) FROM staff_assignments a WHERE a.booking_id = b.id)) x
              FROM bookings b JOIN tour_packages p ON p.id = b.package_id JOIN customers c ON c.id = b.customer_id
              WHERE b.travel_date BETWEEN current_date AND current_date + 30 AND b.status IN ('confirmed','paid','pending','quoting','received')
              ORDER BY b.travel_date LIMIT 10) t), '[]'),
          'travelers30d', (SELECT COALESCE(sum(adults + children), 0) FROM bookings
              WHERE travel_date BETWEEN current_date AND current_date + 30 AND status IN ('confirmed','paid')),
          'packagesPublished', (SELECT count(*) FROM tour_packages WHERE status = 'published' AND deleted_at IS NULL),
          'activeStaff', (SELECT count(*) FROM staff WHERE is_active),
          'lowStock', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'quantity', quantity, 'minStock', min_stock) ORDER BY name)
              FROM inventory_items WHERE is_active AND quantity <= min_stock AND min_stock > 0), '[]'),
          'mediaPublished', (SELECT count(*) FROM media_assets WHERE status = 'published' AND deleted_at IS NULL AND NOT is_internal),
          'galleryViews30d', (SELECT count(*) FROM media_analytics WHERE event IN ('view','lightbox_open') AND created_at > now() - interval '30 days'))",
    )
    .fetch_one(&state.db)
    .await?;

    if can(&user, "finance.read") {
        let fin: Value = sqlx::query_scalar(
            "SELECT jsonb_build_object(
              'thisMonth', (SELECT jsonb_build_object('income', COALESCE(income,0)::text, 'expenses', COALESCE(expenses,0)::text,
                    'payroll', COALESCE(payroll,0)::text, 'profit', COALESCE(profit,0)::text)
                  FROM (SELECT 1) one LEFT JOIN finance_monthly f ON f.month = date_trunc('month', current_date)::date),
              'lastMonth', (SELECT jsonb_build_object('income', COALESCE(income,0)::text, 'profit', COALESCE(profit,0)::text)
                  FROM (SELECT 1) one LEFT JOIN finance_monthly f ON f.month = date_trunc('month', current_date - interval '1 month')::date),
              'yearToDate', (SELECT jsonb_build_object('income', COALESCE(sum(income),0)::text, 'expenses', COALESCE(sum(expenses + payroll),0)::text,
                    'profit', COALESCE(sum(profit),0)::text) FROM finance_monthly WHERE month >= date_trunc('year', current_date)),
              'receivable', (SELECT COALESCE(sum(b.total - COALESCE((SELECT sum(amount) FROM booking_payments bp WHERE bp.booking_id = b.id), 0)), 0)::text
                  FROM bookings b WHERE b.status IN ('confirmed','paid','completed')),
              'staffUnpaid', (SELECT COALESCE(sum(amount), 0)::text FROM staff_assignments WHERE NOT paid),
              'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                    'income', COALESCE(f.income,0)::text, 'costs', (COALESCE(f.expenses,0) + COALESCE(f.payroll,0))::text,
                    'profit', COALESCE(f.profit,0)::text) ORDER BY m)
                  FROM generate_series(date_trunc('month', current_date) - interval '11 months', date_trunc('month', current_date), interval '1 month') m
                  LEFT JOIN finance_monthly f ON f.month = m::date), '[]'),
              'topPackages', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'income', income::text, 'bookings', n) ORDER BY income DESC)
                  FROM (SELECT p.name, sum(bp.amount) income, count(DISTINCT b.id) n FROM booking_payments bp
                        JOIN bookings b ON b.id = bp.booking_id JOIN tour_packages p ON p.id = b.package_id
                        WHERE bp.paid_on >= current_date - 365 GROUP BY p.name ORDER BY 2 DESC LIMIT 5) t), '[]'))",
        )
        .fetch_one(&state.db)
        .await?;
        v["finance"] = fin;
    }
    Ok(Json(v))
}

// ================================================================= Reservas: cobros y personal

#[derive(Deserialize, ToSchema)]
pub struct PaymentInput {
    #[schema(value_type = String, example = "50.00")]
    pub amount: Decimal,
    /// cash | transfer | card | yappy | other
    pub method: String,
    #[schema(value_type = Option<String>)]
    pub paid_on: Option<NaiveDate>,
    pub reference: Option<String>,
    pub note: Option<String>,
}

/// Registra un cobro (o un reembolso con monto negativo) de una reserva.
#[utoipa::path(post, path = "/api/v1/admin/bookings/{id}/payments", tag = "operations", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = PaymentInput, responses((status = 201, body = Created)))]
pub async fn add_payment(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<PaymentInput>) -> AppResult<(StatusCode, Json<Created>)> {
    user.require("finance.write")?;
    if b.amount.is_zero() {
        return Err(AppError::BadRequest("el monto no puede ser cero".into()));
    }
    let status: Option<String> = sqlx::query_scalar("SELECT status::text FROM bookings WHERE id = $1").bind(id).fetch_optional(&state.db).await?;
    match status.as_deref() {
        None => return Err(AppError::NotFound("reserva")),
        Some("received" | "pending" | "quoting") if b.amount.is_sign_positive() => {
            return Err(AppError::Conflict("confirma la reserva (disponibilidad verificada) antes de registrar cobros".into()))
        }
        _ => {}
    }
    let pid: Uuid = sqlx::query_scalar(
        "INSERT INTO booking_payments (booking_id, amount, method, paid_on, reference, note, created_by)
         VALUES ($1, $2, $3::payment_method, COALESCE($4, current_date), $5, $6, $7) RETURNING id",
    )
    .bind(id).bind(b.amount).bind(&b.method).bind(b.paid_on).bind(&b.reference).bind(&b.note).bind(user.id())
    .fetch_one(&state.db)
    .await?;
    audit::log(&state.db, Some(user.id()), "create", "booking_payment", Some(pid.to_string()),
        Some(json!({"booking_id": id, "amount": b.amount.to_string(), "method": b.method})), &headers).await;
    Ok((StatusCode::CREATED, Json(Created { id: pid })))
}

#[derive(Deserialize, ToSchema)]
pub struct AssignInput {
    pub staff_id: Uuid,
    /// Rol en este viaje (por defecto, el del trabajador).
    pub role: Option<String>,
    #[schema(value_type = Option<String>)]
    pub work_date: Option<NaiveDate>,
    pub days: Option<i16>,
    /// Pago acordado; por defecto se calcula con la tarifa del trabajador.
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
    pub notes: Option<String>,
}

/// Asigna un trabajador a una reserva (el pago cuenta como costo de personal).
#[utoipa::path(post, path = "/api/v1/admin/bookings/{id}/staff", tag = "operations", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = AssignInput, responses((status = 201, body = Created), (status = 409, body = crate::errors::ErrorBody)))]
pub async fn assign_staff(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<AssignInput>) -> AppResult<(StatusCode, Json<Created>)> {
    user.require("staff.manage")?;
    let booking: Option<(NaiveDate, i16)> = sqlx::query_as(
        "SELECT b.travel_date, p.days FROM bookings b JOIN tour_packages p ON p.id = b.package_id WHERE b.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;
    let (travel_date, pkg_days) = booking.ok_or(AppError::NotFound("reserva"))?;
    let staff: Option<(String, String, Decimal, bool)> =
        sqlx::query_as("SELECT role::text, pay_type::text, pay_rate, is_active FROM staff WHERE id = $1").bind(b.staff_id).fetch_optional(&state.db).await?;
    let (role, pay_type, rate, active) = staff.ok_or(AppError::NotFound("trabajador"))?;
    if !active {
        return Err(AppError::Conflict("el trabajador está inactivo".into()));
    }
    let days = b.days.unwrap_or(pkg_days);
    let date = b.work_date.unwrap_or(travel_date);
    // Mismo trabajador en otro viaje que se cruza en fechas.
    let clash: Option<String> = sqlx::query_scalar(
        "SELECT bk.code FROM staff_assignments a JOIN bookings bk ON bk.id = a.booking_id
         WHERE a.staff_id = $1 AND a.booking_id <> $2 AND bk.status NOT IN ('cancelled')
           AND daterange(a.work_date, a.work_date + a.days) && daterange($3, $3 + $4::int) LIMIT 1",
    )
    .bind(b.staff_id).bind(id).bind(date).bind(days as i32)
    .fetch_optional(&state.db)
    .await?;
    if let Some(code) = clash {
        return Err(AppError::Conflict(format!("el trabajador ya está asignado en esas fechas (reserva {code})")));
    }
    let amount = b.amount.unwrap_or(match pay_type.as_str() {
        "per_day" => rate * Decimal::from(days),
        "per_trip" => rate,
        _ => Decimal::ZERO, // mensual: se registra como gasto de salarios
    });
    let aid: Uuid = sqlx::query_scalar(
        "INSERT INTO staff_assignments (booking_id, staff_id, role, work_date, days, amount, notes, created_by)
         VALUES ($1, $2, $3::staff_role, $4, $5, $6, $7, $8) RETURNING id",
    )
    .bind(id).bind(b.staff_id).bind(b.role.as_deref().unwrap_or(&role)).bind(date).bind(days).bind(amount).bind(&b.notes).bind(user.id())
    .fetch_one(&state.db)
    .await?;
    audit::log(&state.db, Some(user.id()), "assign", "staff", Some(b.staff_id.to_string()),
        Some(json!({"booking_id": id, "amount": amount.to_string()})), &headers).await;
    Ok((StatusCode::CREATED, Json(Created { id: aid })))
}

#[derive(Deserialize, ToSchema)]
pub struct AssignmentUpdate {
    pub paid: Option<bool>,
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
}

/// Marca una asignación como pagada o ajusta su monto.
#[utoipa::path(patch, path = "/api/v1/admin/staff-assignments/{id}", tag = "operations", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = AssignmentUpdate, responses((status = 204)))]
pub async fn update_assignment(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<AssignmentUpdate>) -> AppResult<StatusCode> {
    user.require("staff.manage")?;
    let n = sqlx::query(
        "UPDATE staff_assignments SET paid = COALESCE($2, paid), amount = COALESCE($3, amount),
           paid_at = CASE WHEN $2 IS TRUE AND NOT paid THEN now() WHEN $2 IS FALSE THEN NULL ELSE paid_at END WHERE id = $1",
    )
    .bind(id).bind(b.paid).bind(b.amount)
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("asignación"));
    }
    audit::log(&state.db, Some(user.id()), "update", "staff_assignment", Some(id.to_string()), Some(json!({"paid": b.paid})), &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

/// Quita una asignación.
#[utoipa::path(delete, path = "/api/v1/admin/staff-assignments/{id}", tag = "operations", security(("bearer" = [])), params(("id" = Uuid, Path)), responses((status = 204)))]
pub async fn delete_assignment(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    user.require("staff.manage")?;
    let n = sqlx::query("DELETE FROM staff_assignments WHERE id = $1 AND NOT paid").bind(id).execute(&state.db).await?.rows_affected();
    if n == 0 {
        return Err(AppError::Conflict("no existe o ya fue pagada (no se puede borrar un pago hecho)".into()));
    }
    audit::log(&state.db, Some(user.id()), "delete", "staff_assignment", Some(id.to_string()), None, &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

// ================================================================= Personal

/// Trabajadores con sus próximas asignaciones y pagos pendientes.
#[utoipa::path(get, path = "/api/v1/admin/staff", tag = "operations", security(("bearer" = [])), responses((status = 200, body = Vec<Object>)))]
pub async fn list_staff(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    if !can(&user, "staff.manage") {
        user.require("bookings.read")?;
    }
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT to_jsonb(s) - 'document_id' || jsonb_build_object(
            'payRate', s.pay_rate::text,
            'upcoming', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'date', a.work_date, 'days', a.days, 'booking', b.code,
                  'package', p.name, 'amount', a.amount::text, 'paid', a.paid) ORDER BY a.work_date)
                FROM staff_assignments a JOIN bookings b ON b.id = a.booking_id JOIN tour_packages p ON p.id = b.package_id
                WHERE a.staff_id = s.id AND (a.work_date >= current_date - 30 OR NOT a.paid)), '[]'),
            'unpaid', (SELECT COALESCE(sum(amount),0)::text FROM staff_assignments a WHERE a.staff_id = s.id AND NOT a.paid),
            'trips', (SELECT count(*) FROM staff_assignments a WHERE a.staff_id = s.id))
         FROM staff s ORDER BY s.is_active DESC, s.full_name",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Value::Array(rows)))
}

#[derive(Deserialize, ToSchema)]
pub struct StaffInput {
    pub full_name: Option<String>,
    /// guide | boat_operator | driver | cook | porter | coordinator | admin | other
    pub role: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub document_id: Option<String>,
    pub community: Option<String>,
    /// per_day | per_trip | monthly
    pub pay_type: Option<String>,
    #[schema(value_type = Option<String>)]
    pub pay_rate: Option<Decimal>,
    pub languages: Option<Vec<String>>,
    pub notes: Option<String>,
    pub is_active: Option<bool>,
    #[schema(value_type = Option<String>)]
    pub hired_on: Option<NaiveDate>,
}

/// Registra un trabajador.
#[utoipa::path(post, path = "/api/v1/admin/staff", tag = "operations", security(("bearer" = [])), request_body = StaffInput, responses((status = 201, body = Created)))]
pub async fn create_staff(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Json(b): Json<StaffInput>) -> AppResult<(StatusCode, Json<Created>)> {
    user.require("staff.manage")?;
    let name = b.full_name.as_deref().map(str::trim).filter(|n| n.len() > 1).ok_or(AppError::BadRequest("nombre obligatorio".into()))?;
    let role = b.role.as_deref().ok_or(AppError::BadRequest("rol obligatorio".into()))?;
    if b.pay_rate.is_some_and(|r| r.is_sign_negative()) {
        return Err(AppError::BadRequest("tarifa negativa".into()));
    }
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO staff (full_name, role, phone, email, document_id, community, pay_type, pay_rate, languages, notes, hired_on)
         VALUES ($1, $2::staff_role, $3, $4, $5, $6, COALESCE($7::pay_type, 'per_day'), COALESCE($8, 0), COALESCE($9, '{es}'), $10, $11) RETURNING id",
    )
    .bind(name).bind(role).bind(&b.phone).bind(&b.email).bind(&b.document_id).bind(&b.community)
    .bind(&b.pay_type).bind(b.pay_rate).bind(&b.languages).bind(&b.notes).bind(b.hired_on)
    .fetch_one(&state.db)
    .await?;
    audit::log(&state.db, Some(user.id()), "create", "staff", Some(id.to_string()), Some(json!({"role": role})), &headers).await;
    Ok((StatusCode::CREATED, Json(Created { id })))
}

/// Edita un trabajador (o lo desactiva).
#[utoipa::path(patch, path = "/api/v1/admin/staff/{id}", tag = "operations", security(("bearer" = [])), params(("id" = Uuid, Path)), request_body = StaffInput, responses((status = 204)))]
pub async fn update_staff(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<StaffInput>) -> AppResult<StatusCode> {
    user.require("staff.manage")?;
    let n = sqlx::query(
        "UPDATE staff SET full_name = COALESCE($2, full_name), role = COALESCE($3::staff_role, role), phone = COALESCE($4, phone),
           email = COALESCE($5, email), document_id = COALESCE($6, document_id), community = COALESCE($7, community),
           pay_type = COALESCE($8::pay_type, pay_type), pay_rate = COALESCE($9, pay_rate), languages = COALESCE($10, languages),
           notes = COALESCE($11, notes), is_active = COALESCE($12, is_active), hired_on = COALESCE($13, hired_on) WHERE id = $1",
    )
    .bind(id).bind(&b.full_name).bind(&b.role).bind(&b.phone).bind(&b.email).bind(&b.document_id).bind(&b.community)
    .bind(&b.pay_type).bind(b.pay_rate).bind(&b.languages).bind(&b.notes).bind(b.is_active).bind(b.hired_on)
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("trabajador"));
    }
    audit::log(&state.db, Some(user.id()), "update", "staff", Some(id.to_string()), None, &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

// ================================================================= Inventario

/// Inventario con alertas de existencia mínima.
#[utoipa::path(get, path = "/api/v1/admin/inventory", tag = "operations", security(("bearer" = [])), responses((status = 200, body = Vec<Object>)))]
pub async fn list_inventory(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    user.require("inventory.manage")?;
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT to_jsonb(i) || jsonb_build_object('unitCost', i.unit_cost::text,
            'total', i.quantity + i.in_use + i.in_repair,
            'low', i.min_stock > 0 AND i.quantity <= i.min_stock,
            'value', (COALESCE(i.unit_cost, 0) * (i.quantity + i.in_use + i.in_repair))::text,
            'movements', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', m.type, 'quantity', m.quantity, 'note', m.note,
                  'booking', (SELECT code FROM bookings b WHERE b.id = m.booking_id), 'at', m.created_at) ORDER BY m.created_at DESC)
                FROM (SELECT * FROM inventory_movements WHERE item_id = i.id ORDER BY created_at DESC LIMIT 8) m), '[]'))
         FROM inventory_items i WHERE i.is_active ORDER BY i.category, i.name",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Value::Array(rows)))
}

#[derive(Deserialize, ToSchema)]
pub struct ItemInput {
    pub name: Option<String>,
    /// camping | safety | water | transport | kitchen | first_aid | photo_video | office | other
    pub category: Option<String>,
    pub sku: Option<String>,
    pub unit: Option<String>,
    pub min_stock: Option<i32>,
    #[schema(value_type = Option<String>)]
    pub unit_cost: Option<Decimal>,
    /// new | good | fair | repair | retired
    pub condition: Option<String>,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub is_active: Option<bool>,
}

/// Crea un artículo de inventario (existencias en 0; se cargan con un movimiento de compra).
#[utoipa::path(post, path = "/api/v1/admin/inventory", tag = "operations", security(("bearer" = [])), request_body = ItemInput, responses((status = 201, body = Created)))]
pub async fn create_item(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Json(b): Json<ItemInput>) -> AppResult<(StatusCode, Json<Created>)> {
    user.require("inventory.manage")?;
    let name = b.name.as_deref().map(str::trim).filter(|n| !n.is_empty()).ok_or(AppError::BadRequest("nombre obligatorio".into()))?;
    let cat = b.category.as_deref().ok_or(AppError::BadRequest("categoría obligatoria".into()))?;
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO inventory_items (name, category, sku, unit, min_stock, unit_cost, condition, location, notes)
         VALUES ($1, $2::inventory_category, $3, COALESCE($4, 'unidad'), COALESCE($5, 0), $6, COALESCE($7::item_condition, 'good'), $8, $9) RETURNING id",
    )
    .bind(name).bind(cat).bind(&b.sku).bind(&b.unit).bind(b.min_stock).bind(b.unit_cost).bind(&b.condition).bind(&b.location).bind(&b.notes)
    .fetch_one(&state.db)
    .await?;
    audit::log(&state.db, Some(user.id()), "create", "inventory_item", Some(id.to_string()), None, &headers).await;
    Ok((StatusCode::CREATED, Json(Created { id })))
}

/// Edita un artículo.
#[utoipa::path(patch, path = "/api/v1/admin/inventory/{id}", tag = "operations", security(("bearer" = [])), params(("id" = Uuid, Path)), request_body = ItemInput, responses((status = 204)))]
pub async fn update_item(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<ItemInput>) -> AppResult<StatusCode> {
    user.require("inventory.manage")?;
    let n = sqlx::query(
        "UPDATE inventory_items SET name = COALESCE($2, name), category = COALESCE($3::inventory_category, category), sku = COALESCE($4, sku),
           unit = COALESCE($5, unit), min_stock = COALESCE($6, min_stock), unit_cost = COALESCE($7, unit_cost),
           condition = COALESCE($8::item_condition, condition), location = COALESCE($9, location), notes = COALESCE($10, notes),
           is_active = COALESCE($11, is_active) WHERE id = $1",
    )
    .bind(id).bind(&b.name).bind(&b.category).bind(&b.sku).bind(&b.unit).bind(b.min_stock).bind(b.unit_cost)
    .bind(&b.condition).bind(&b.location).bind(&b.notes).bind(b.is_active)
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("artículo"));
    }
    audit::log(&state.db, Some(user.id()), "update", "inventory_item", Some(id.to_string()), None, &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize, ToSchema)]
pub struct MovementInput {
    /// purchase | checkout | return | repair | loss | adjustment
    #[serde(rename = "type")]
    pub kind: String,
    /// Positivo; en `adjustment` puede ser negativo.
    pub quantity: i32,
    pub booking_id: Option<Uuid>,
    /// En compras: costo unitario (registra el gasto automáticamente).
    #[schema(value_type = Option<String>)]
    pub unit_cost: Option<Decimal>,
    pub note: Option<String>,
}

/// Registra un movimiento (compra, salida a viaje, devolución, reparación, pérdida o ajuste).
#[utoipa::path(post, path = "/api/v1/admin/inventory/{id}/movements", tag = "operations", security(("bearer" = [])),
    params(("id" = Uuid, Path)), request_body = MovementInput, responses((status = 201), (status = 422, body = crate::errors::ErrorBody)))]
pub async fn add_movement(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Json(b): Json<MovementInput>) -> AppResult<StatusCode> {
    user.require("inventory.manage")?;
    if b.quantity == 0 || (b.kind != "adjustment" && b.quantity < 0) {
        return Err(AppError::BadRequest("cantidad inválida".into()));
    }
    let mut tx = state.db.begin().await?;
    let name: Option<String> = sqlx::query_scalar("SELECT name FROM inventory_items WHERE id = $1 FOR UPDATE").bind(id).fetch_optional(&mut *tx).await?;
    let name = name.ok_or(AppError::NotFound("artículo"))?;
    let res = sqlx::query(
        "INSERT INTO inventory_movements (item_id, type, quantity, booking_id, unit_cost, note, created_by)
         VALUES ($1, $2::movement_type, $3, $4, $5, $6, $7)",
    )
    .bind(id).bind(&b.kind).bind(b.quantity).bind(b.booking_id).bind(b.unit_cost).bind(&b.note).bind(user.id())
    .execute(&mut *tx)
    .await;
    if let Err(sqlx::Error::Database(e)) = &res
        && e.code().as_deref() == Some("23514")
    {
        return Err(AppError::Unprocessable("no hay existencias suficientes para ese movimiento".into()));
    }
    res?;
    if b.kind == "purchase" && let Some(cost) = b.unit_cost {
        sqlx::query("UPDATE inventory_items SET unit_cost = $2 WHERE id = $1").bind(id).bind(cost).execute(&mut *tx).await?;
        if user.require("finance.write").is_ok() && !cost.is_zero() {
            sqlx::query(
                "INSERT INTO expenses (category, description, amount, inventory_item_id, created_by) VALUES ('equipment', $1, $2, $3, $4)",
            )
            .bind(format!("Compra de {} × {name}", b.quantity)).bind(cost * Decimal::from(b.quantity)).bind(id).bind(user.id())
            .execute(&mut *tx)
            .await?;
        }
    }
    audit::log(&mut *tx, Some(user.id()), "movement", "inventory_item", Some(id.to_string()),
        Some(json!({"type": b.kind, "quantity": b.quantity})), &headers).await;
    tx.commit().await?;
    Ok(StatusCode::CREATED)
}

// ================================================================= Gastos y ganancias

#[derive(Deserialize, IntoParams)]
pub struct PeriodQuery {
    #[param(value_type = Option<String>)]
    pub from: Option<NaiveDate>,
    #[param(value_type = Option<String>)]
    pub to: Option<NaiveDate>,
}

/// Estado de resultados del período: ingresos, gastos por categoría, personal y ganancia.
#[utoipa::path(get, path = "/api/v1/admin/finance", tag = "operations", security(("bearer" = [])), params(PeriodQuery), responses((status = 200, body = Object)))]
pub async fn finance(State(state): State<AppState>, user: AuthUser, Query(q): Query<PeriodQuery>) -> AppResult<Json<Value>> {
    user.require("finance.read")?;
    let v: Value = sqlx::query_scalar(
        "WITH r AS (SELECT COALESCE($1, date_trunc('year', current_date)::date) AS f, COALESCE($2, current_date) AS t)
         SELECT jsonb_build_object('from', r.f, 'to', r.t,
           'income', (SELECT COALESCE(sum(amount),0)::text FROM booking_payments, r WHERE paid_on BETWEEN r.f AND r.t),
           'expenses', (SELECT COALESCE(sum(amount),0)::text FROM expenses, r WHERE spent_on BETWEEN r.f AND r.t),
           'payroll', (SELECT COALESCE(sum(amount),0)::text FROM staff_assignments, r WHERE work_date BETWEEN r.f AND r.t),
           'profit', ((SELECT COALESCE(sum(amount),0) FROM booking_payments, r WHERE paid_on BETWEEN r.f AND r.t)
                    - (SELECT COALESCE(sum(amount),0) FROM expenses, r WHERE spent_on BETWEEN r.f AND r.t)
                    - (SELECT COALESCE(sum(amount),0) FROM staff_assignments, r WHERE work_date BETWEEN r.f AND r.t))::text,
           'byCategory', COALESCE((SELECT jsonb_object_agg(category, total::text) FROM (SELECT category, sum(amount) total FROM expenses, r
                WHERE spent_on BETWEEN r.f AND r.t GROUP BY category) c), '{}'),
           'byMethod', COALESCE((SELECT jsonb_object_agg(method, total::text) FROM (SELECT method, sum(amount) total FROM booking_payments, r
                WHERE paid_on BETWEEN r.f AND r.t GROUP BY method) c), '{}'),
           'expensesList', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'category', e.category, 'description', e.description,
                'amount', e.amount::text, 'date', e.spent_on, 'reference', e.reference,
                'booking', (SELECT code FROM bookings b WHERE b.id = e.booking_id),
                'package', (SELECT name FROM tour_packages p WHERE p.id = e.package_id)) ORDER BY e.spent_on DESC, e.created_at DESC)
                FROM expenses e, r WHERE e.spent_on BETWEEN r.f AND r.t), '[]'),
           'paymentsList', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', bp.id, 'amount', bp.amount::text, 'method', bp.method,
                'date', bp.paid_on, 'reference', bp.reference, 'booking', b.code, 'package', p.name) ORDER BY bp.paid_on DESC)
                FROM booking_payments bp JOIN bookings b ON b.id = bp.booking_id JOIN tour_packages p ON p.id = b.package_id, r
                WHERE bp.paid_on BETWEEN r.f AND r.t), '[]'))
         FROM r",
    )
    .bind(q.from)
    .bind(q.to)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(v))
}

#[derive(Deserialize, ToSchema)]
pub struct ExpenseInput {
    /// transport | fuel | food | lodging | equipment | permits | marketing | ai_generation | salaries | maintenance | commissions | other
    pub category: String,
    pub description: String,
    #[schema(value_type = String, example = "25.00")]
    pub amount: Decimal,
    #[schema(value_type = Option<String>)]
    pub spent_on: Option<NaiveDate>,
    pub booking_code: Option<String>,
    pub package_code: Option<String>,
    pub reference: Option<String>,
}

/// Registra un gasto.
#[utoipa::path(post, path = "/api/v1/admin/expenses", tag = "operations", security(("bearer" = [])), request_body = ExpenseInput, responses((status = 201, body = Created)))]
pub async fn add_expense(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Json(b): Json<ExpenseInput>) -> AppResult<(StatusCode, Json<Created>)> {
    user.require("finance.write")?;
    if b.amount <= Decimal::ZERO || b.description.trim().is_empty() {
        return Err(AppError::BadRequest("descripción y monto positivo obligatorios".into()));
    }
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO expenses (category, description, amount, spent_on, booking_id, package_id, reference, created_by)
         VALUES ($1::expense_category, $2, $3, COALESCE($4, current_date),
           CASE WHEN $5::text IS NULL THEN NULL ELSE COALESCE((SELECT id FROM bookings WHERE code = $5), '00000000-0000-0000-0000-000000000000') END,
           CASE WHEN $6::text IS NULL THEN NULL ELSE COALESCE((SELECT id FROM tour_packages WHERE code = $6), '00000000-0000-0000-0000-000000000000') END,
           $7, $8) RETURNING id",
    )
    .bind(&b.category).bind(b.description.trim()).bind(b.amount).bind(b.spent_on)
    .bind(b.booking_code.as_deref().filter(|s| !s.is_empty())).bind(b.package_code.as_deref().filter(|s| !s.is_empty()))
    .bind(&b.reference).bind(user.id())
    .fetch_one(&state.db)
    .await?;
    audit::log(&state.db, Some(user.id()), "create", "expense", Some(id.to_string()),
        Some(json!({"amount": b.amount.to_string(), "category": b.category})), &headers).await;
    Ok((StatusCode::CREATED, Json(Created { id })))
}

#[derive(Deserialize, IntoParams)]
pub struct ConfirmQuery {
    pub confirm: Option<Uuid>,
}

/// Elimina un gasto (exige `?confirm=<id>`).
#[utoipa::path(delete, path = "/api/v1/admin/expenses/{id}", tag = "operations", security(("bearer" = [])), params(("id" = Uuid, Path), ConfirmQuery), responses((status = 204)))]
pub async fn delete_expense(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, Path(id): Path<Uuid>, Query(q): Query<ConfirmQuery>) -> AppResult<StatusCode> {
    user.require("finance.write")?;
    if q.confirm != Some(id) {
        return Err(AppError::BadRequest("confirma repitiendo el id en ?confirm=".into()));
    }
    let n = sqlx::query("DELETE FROM expenses WHERE id = $1").bind(id).execute(&state.db).await?.rows_affected();
    if n == 0 {
        return Err(AppError::NotFound("gasto"));
    }
    audit::log(&state.db, Some(user.id()), "delete", "expense", Some(id.to_string()), None, &headers).await;
    Ok(StatusCode::NO_CONTENT)
}

//! Directorio público de guías y proveedores. Solo se exponen certificaciones verificadas.
use axum::{
    Json,
    extract::{Query, State},
};
use serde::Deserialize;
use serde_json::Value;
use utoipa::IntoParams;

use crate::{errors::AppResult, state::AppState};

/// Guías publicados con sus destinos y certificaciones verificadas.
#[utoipa::path(get, path = "/api/v1/guides", tag = "guides", responses((status = 200, body = Vec<Object>)))]
pub async fn list_guides(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT jsonb_build_object('slug', g.slug, 'name', g.full_name, 'bio', g.bio, 'specialties', to_jsonb(g.specialties),
            'languages', to_jsonb(g.languages), 'yearsExperience', g.years_experience, 'available', g.is_available,
            'photo', (SELECT m.path FROM media_assets m WHERE m.id = g.photo_id),
            'certifications', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', c.name, 'issuer', c.issuer, 'validUntil', c.valid_until))
                FROM guide_certifications c WHERE c.guide_id = g.id AND c.verification = 'verified'
                  AND (c.valid_until IS NULL OR c.valid_until >= current_date)), '[]'),
            'destinations', COALESCE((SELECT jsonb_agg(d.slug) FROM guide_destinations gd JOIN destinations d ON d.id = gd.destination_id
                WHERE gd.guide_id = g.id), '[]'))
         FROM guides g WHERE g.status = 'published' ORDER BY g.full_name",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Value::Array(rows)))
}

#[derive(Deserialize, IntoParams)]
pub struct ProviderQuery {
    /// guides | transport | lodging | food | tour_operator | activities | complementary
    pub category: Option<String>,
}

/// Proveedores publicados (con estado de verificación).
#[utoipa::path(get, path = "/api/v1/providers", tag = "guides", params(ProviderQuery), responses((status = 200, body = Vec<Object>)))]
pub async fn list_providers(State(state): State<AppState>, Query(q): Query<ProviderQuery>) -> AppResult<Json<Value>> {
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT jsonb_build_object('slug', p.slug, 'name', p.trade_name, 'category', p.category, 'description', p.description,
            'location', p.location_text, 'verified', p.verification = 'verified', 'website', p.website,
            'services', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', s.name, 'unit', s.unit))
                FROM provider_services s WHERE s.provider_id = p.id AND s.is_active), '[]'))
         FROM providers p WHERE p.status = 'published' AND ($1::text IS NULL OR p.category::text = $1)
         ORDER BY (p.verification = 'verified') DESC, p.trade_name",
    )
    .bind(q.category)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Value::Array(rows)))
}

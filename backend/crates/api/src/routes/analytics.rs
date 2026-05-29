use axum::{extract::State, Json};
use fractal_db::queries::analytics::get_protocol_stats;

use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

pub async fn get_analytics(
    State(state): State<AppState>,
) -> ApiResult<Json<fractal_db::queries::analytics::ProtocolStats>> {
    let stats = get_protocol_stats(&state.pool)
        .await
        .map_err(ApiError::Internal)?;
    Ok(Json(stats))
}

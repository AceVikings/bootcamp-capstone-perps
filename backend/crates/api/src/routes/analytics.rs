use axum::{extract::State, Json};
use serde_json::{json, Value};
use tpp_db::queries::{get_protocol_stats, get_volume_stats_24h};

use crate::{error::ApiResult, state::AppState};

pub async fn get_analytics(
    State(state): State<AppState>,
) -> ApiResult<Json<Value>> {
    let (protocol_stats, volume_stats) = tokio::join!(
        get_protocol_stats(&state.pool),
        get_volume_stats_24h(&state.pool),
    );

    Ok(Json(json!({
        "protocol": protocol_stats?,
        "volume_24h": volume_stats?,
    })))
}

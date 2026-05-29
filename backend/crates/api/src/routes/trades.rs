use axum::{
    extract::{Path, Query, State},
    Json,
};
use fractal_db::queries::get_recent_trades;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct TradesQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_limit() -> i64 {
    50
}

pub async fn list_trades(
    State(state): State<AppState>,
    Path(token_mint): Path<String>,
    Query(q): Query<TradesQuery>,
) -> ApiResult<Json<Value>> {
    let limit = q.limit.min(500).max(1);
    let trades = get_recent_trades(&state.pool, &token_mint, limit)
        .await
        .map_err(ApiError::Internal)?;
    Ok(Json(json!({ "trades": trades })))
}

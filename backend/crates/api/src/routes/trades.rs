use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::{json, Value};
use tpp_db::queries::get_recent_trades;

use crate::{error::ApiResult, state::AppState};

pub async fn recent_trades(
    State(state): State<AppState>,
    Path(token_mint): Path<String>,
) -> ApiResult<Json<Value>> {
    let trades = get_recent_trades(&state.pool, &token_mint, 50).await?;
    Ok(Json(json!({ "trades": trades })))
}

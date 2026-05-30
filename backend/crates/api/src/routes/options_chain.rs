use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;

use fractal_db::queries::options_chain::{get_options_chain, OptionsChainResponse};

use crate::{error::ApiResult, state::AppState};

#[derive(Deserialize)]
pub struct ChainQuery {
    /// Filter to vaults expiring in approximately this many days (±1 day tolerance).
    pub expiry_days: Option<i32>,
}

pub async fn get_options_chain_handler(
    State(state): State<AppState>,
    Query(params): Query<ChainQuery>,
) -> ApiResult<Json<OptionsChainResponse>> {
    // Latest oracle price; fall back to $180 if none recorded yet.
    let underlying_price: i64 = sqlx::query_scalar(
        "SELECT price_usd FROM oracle_prices ORDER BY recorded_at DESC LIMIT 1",
    )
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None)
    .unwrap_or(180_000_000_i64);

    let response = get_options_chain(&state.pool, params.expiry_days, underlying_price)
        .await
        .map_err(anyhow::Error::from)?;

    Ok(Json(response))
}

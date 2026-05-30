use axum::{
    extract::{Path, State},
    Json,
};
use fractal_db::queries::option_nodes::get_option_nodes_for_owner;
use fractal_db::queries::option_vaults::list_option_vaults_by_owner;
use serde::Serialize;

use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct PositionsResponse {
    pub vaults: Vec<fractal_common::OptionVault>,
    pub nodes: Vec<fractal_common::OptionNode>,
}

pub async fn get_positions(
    State(state): State<AppState>,
    Path(wallet): Path<String>,
) -> ApiResult<Json<PositionsResponse>> {
    let vaults = list_option_vaults_by_owner(&state.pool, &wallet)
        .await
        .map_err(ApiError::Internal)?;

    let nodes = get_option_nodes_for_owner(&state.pool, &wallet)
        .await
        .map_err(ApiError::Internal)?;

    Ok(Json(PositionsResponse { vaults, nodes }))
}

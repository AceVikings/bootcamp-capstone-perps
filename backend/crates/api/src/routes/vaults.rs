use axum::{
    extract::{Path, Query, State},
    Json,
};
use fractal_db::queries::option_nodes::get_option_nodes_for_vault;
use fractal_db::queries::option_vaults::{
    get_option_vault, list_option_vaults, list_option_vaults_by_owner,
};
use serde::{Deserialize, Serialize};

use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ListVaultsQuery {
    pub owner: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ListVaultsResponse {
    pub vaults: Vec<fractal_common::OptionVault>,
}

pub async fn list_vaults(
    State(state): State<AppState>,
    Query(q): Query<ListVaultsQuery>,
) -> ApiResult<Json<ListVaultsResponse>> {
    let vaults = match q.owner {
        Some(wallet) => list_option_vaults_by_owner(&state.pool, &wallet)
            .await
            .map_err(ApiError::Internal)?,
        None => list_option_vaults(&state.pool)
            .await
            .map_err(ApiError::Internal)?,
    };
    Ok(Json(ListVaultsResponse { vaults }))
}

pub async fn get_vault(
    State(state): State<AppState>,
    Path(pubkey): Path<String>,
) -> ApiResult<Json<fractal_common::OptionVault>> {
    let vault = get_option_vault(&state.pool, &pubkey)
        .await
        .map_err(|_| ApiError::VaultNotFound(format!("vault {} not found", pubkey)))?;
    Ok(Json(vault))
}

#[derive(Debug, Serialize)]
pub struct VaultTreeResponse {
    pub vault: fractal_common::OptionVault,
    pub nodes: Vec<fractal_common::OptionNode>,
}

pub async fn get_vault_tree(
    State(state): State<AppState>,
    Path(pubkey): Path<String>,
) -> ApiResult<Json<VaultTreeResponse>> {
    let vault = get_option_vault(&state.pool, &pubkey)
        .await
        .map_err(|_| ApiError::VaultNotFound(format!("vault {} not found", pubkey)))?;

    let nodes = get_option_nodes_for_vault(&state.pool, &pubkey)
        .await
        .map_err(ApiError::Internal)?;

    Ok(Json(VaultTreeResponse { vault, nodes }))
}

pub async fn get_vault_nodes(
    State(state): State<AppState>,
    Path(pubkey): Path<String>,
) -> ApiResult<Json<Vec<fractal_common::OptionNode>>> {
    let nodes = get_option_nodes_for_vault(&state.pool, &pubkey)
        .await
        .map_err(ApiError::Internal)?;
    Ok(Json(nodes))
}

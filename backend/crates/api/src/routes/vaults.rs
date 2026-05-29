use axum::{
    extract::{Path, Query, State},
    Json,
};
use fractal_db::queries::root_vaults::{
    get_root_vault, list_all_active_root_vaults, list_root_vaults_for_owner,
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
    pub vaults: Vec<fractal_common::RootVault>,
}

pub async fn list_vaults(
    State(state): State<AppState>,
    Query(q): Query<ListVaultsQuery>,
) -> ApiResult<Json<ListVaultsResponse>> {
    let vaults = match q.owner {
        Some(wallet) => list_root_vaults_for_owner(&state.pool, &wallet)
            .await
            .map_err(ApiError::Internal)?,
        None => list_all_active_root_vaults(&state.pool)
            .await
            .map_err(ApiError::Internal)?,
    };
    Ok(Json(ListVaultsResponse { vaults }))
}

pub async fn get_vault(
    State(state): State<AppState>,
    Path(pubkey): Path<String>,
) -> ApiResult<Json<fractal_common::RootVault>> {
    let vault = get_root_vault(&state.pool, &pubkey)
        .await
        .map_err(|e| match e.downcast_ref::<sqlx::Error>() {
            Some(sqlx::Error::RowNotFound) => {
                ApiError::VaultNotFound(format!("vault {} not found", pubkey))
            }
            _ => ApiError::Internal(e),
        })?;
    Ok(Json(vault))
}

use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::Utc;
use fractal_db::models::root_vault::NewRootVault;
use fractal_db::queries::root_vaults::{
    get_root_vault, insert_root_vault, list_all_active_root_vaults, list_root_vaults_for_owner,
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

// ─── Register vault (called by frontend after on-chain tx) ───────────────────

#[derive(Debug, Deserialize)]
pub struct RegisterVaultRequest {
    pub pubkey: String,
    pub vault_id: i64,
    pub owner_wallet: String,
    pub collateral_mint: String,
    pub collateral_amount: i64,
    pub long_mint: String,
    pub short_mint: String,
    pub asset_feed: String,
    pub reference_price: i64,
}

pub async fn register_vault(
    State(state): State<AppState>,
    Json(req): Json<RegisterVaultRequest>,
) -> ApiResult<Json<fractal_common::RootVault>> {
    let new_vault = NewRootVault {
        pubkey: req.pubkey.clone(),
        vault_id: req.vault_id,
        owner_wallet: req.owner_wallet,
        collateral_mint: req.collateral_mint,
        collateral_amount: req.collateral_amount,
        long_mint: req.long_mint,
        short_mint: req.short_mint,
        asset_feed: req.asset_feed,
        reference_price: req.reference_price,
        created_at: Utc::now(),
    };

    insert_root_vault(&state.pool, &new_vault)
        .await
        .map_err(ApiError::Internal)?;

    let vault = get_root_vault(&state.pool, &req.pubkey)
        .await
        .map_err(ApiError::Internal)?;

    Ok(Json(vault))
}

use axum::{
    extract::{Path, Query, State},
    Json,
};
use fractal_db::queries::option_nodes::{
    get_option_node_by_child_mint, get_option_nodes_for_vault,
};
use fractal_db::queries::option_vaults::{
    get_option_vault, get_option_vault_by_root_mint, list_option_vaults,
    list_option_vaults_by_owner,
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

// ─── Resolve any protocol mint → vault + node ────────────────────────────────

/// Response shape for `GET /vaults/by-mint/:mint`.
///
/// * `mint_role` is `"root"`, `"long_child"`, or `"short_child"` so callers
///   know which side of the split this mint came from.
/// * `node` is `null` when the mint is the root_mint of the vault.
#[derive(Debug, Serialize)]
pub struct MintResolutionResponse {
    pub vault: fractal_common::OptionVault,
    pub node: Option<fractal_common::OptionNode>,
    pub mint_role: &'static str,
}

/// Look up any protocol token mint — root, long-child, or short-child — and
/// return the vault (and, if applicable, the split node) it belongs to.
///
/// Used by the frontend so that a user who bought a CALL on the orderbook
/// can still split it without being the original vault depositor.
pub async fn get_vault_by_mint(
    State(state): State<AppState>,
    Path(mint): Path<String>,
) -> ApiResult<Json<MintResolutionResponse>> {
    // 1. Check root_mint first
    if let Some(vault) = get_option_vault_by_root_mint(&state.pool, &mint)
        .await
        .map_err(ApiError::Internal)?
    {
        return Ok(Json(MintResolutionResponse {
            vault,
            node: None,
            mint_role: "root",
        }));
    }

    // 2. Check long_child_mint / short_child_mint in option_nodes
    let node = get_option_node_by_child_mint(&state.pool, &mint)
        .await
        .map_err(ApiError::Internal)?
        .ok_or_else(|| ApiError::VaultNotFound(format!("no vault found for mint {}", mint)))?;

    let role = if node.long_child_mint == mint {
        "long_child"
    } else {
        "short_child"
    };

    let vault = get_option_vault(&state.pool, &node.vault_pubkey)
        .await
        .map_err(|_| {
            ApiError::VaultNotFound(format!("vault {} not found", node.vault_pubkey))
        })?;

    Ok(Json(MintResolutionResponse {
        vault,
        node: Some(node),
        mint_role: role,
    }))
}

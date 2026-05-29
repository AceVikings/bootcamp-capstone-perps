use axum::{
    extract::{Path, State},
    Json,
};
use fractal_common::ClaimNode;
use fractal_db::queries::claim_nodes::{get_all_claims_for_wallet, get_claim_node};
use serde::Serialize;
use std::collections::HashMap;

use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct GetClaimsResponse {
    pub wallet: String,
    pub claims: Vec<ClaimNode>,
}

pub async fn get_claims(
    State(state): State<AppState>,
    Path(wallet): Path<String>,
) -> ApiResult<Json<GetClaimsResponse>> {
    let claims = get_all_claims_for_wallet(&state.pool, &wallet)
        .await
        .map_err(ApiError::Internal)?;
    Ok(Json(GetClaimsResponse { wallet, claims }))
}

// ─── Tree endpoint ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ClaimTreeResponse {
    pub wallet: String,
    pub vaults: Vec<VaultTreeEntry>,
}

#[derive(Debug, Serialize)]
pub struct VaultTreeEntry {
    pub pubkey: String,
    pub vault_id: i64,
    pub reference_price: i64,
    pub asset_feed: String,
    pub depth1: Vec<TreeNode>,
}

#[derive(Debug, Serialize)]
pub struct TreeNode {
    pub claim_type: String,
    pub mint: String,
    pub node_pubkey: String,
    pub is_active: bool,
    pub creation_price: i64,
    pub children: Vec<TreeNode>,
}

pub async fn get_claim_tree_handler(
    State(state): State<AppState>,
    Path(wallet): Path<String>,
) -> ApiResult<Json<ClaimTreeResponse>> {
    // Load all claims for this wallet
    let all_claims = get_all_claims_for_wallet(&state.pool, &wallet)
        .await
        .map_err(ApiError::Internal)?;

    // Group by root_vault
    let mut by_vault: HashMap<String, Vec<&ClaimNode>> = HashMap::new();
    for claim in &all_claims {
        by_vault.entry(claim.root_vault.clone()).or_default().push(claim);
    }

    // Load vault metadata for each group
    let mut vault_entries = Vec::new();
    for (vault_pubkey, claims) in by_vault {
        let vault = fractal_db::queries::root_vaults::get_root_vault(&state.pool, &vault_pubkey)
            .await
            .map_err(ApiError::Internal)?;

        let depth1_nodes = build_tree_nodes(&claims, None);

        vault_entries.push(VaultTreeEntry {
            pubkey: vault.pubkey,
            vault_id: vault.vault_id,
            reference_price: vault.reference_price,
            asset_feed: vault.asset_feed,
            depth1: depth1_nodes,
        });
    }

    // Sort for deterministic output
    vault_entries.sort_by_key(|v| v.vault_id);

    Ok(Json(ClaimTreeResponse {
        wallet,
        vaults: vault_entries,
    }))
}

fn build_tree_nodes(claims: &[&ClaimNode], parent: Option<&str>) -> Vec<TreeNode> {
    claims
        .iter()
        .filter(|c| c.parent_node.as_deref() == parent)
        .map(|c| {
            let children = build_tree_nodes(claims, Some(&c.pubkey));
            TreeNode {
                claim_type: c.claim_type.to_string(),
                mint: c.source_mint.clone(),
                node_pubkey: c.pubkey.clone(),
                is_active: c.is_active,
                creation_price: c.creation_price,
                children,
            }
        })
        .collect()
}

pub async fn get_single_claim_node(
    State(state): State<AppState>,
    Path(pubkey): Path<String>,
) -> ApiResult<Json<ClaimNode>> {
    let node = get_claim_node(&state.pool, &pubkey)
        .await
        .map_err(|e| match e.downcast_ref::<sqlx::Error>() {
            Some(sqlx::Error::RowNotFound) => {
                ApiError::ClaimNodeNotFound(format!("claim node {} not found", pubkey))
            }
            _ => ApiError::Internal(e),
        })?;
    Ok(Json(node))
}

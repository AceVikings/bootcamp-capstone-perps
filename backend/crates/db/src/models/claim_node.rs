use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ClaimNodeRow {
    pub pubkey: String,
    pub node_id: i64,
    pub root_vault: String,
    pub root_id: i64,
    pub owner_wallet: String,
    pub depth: i16,
    pub parent_node: Option<String>,
    pub claim_type: String,
    pub source_mint: String,
    pub left_child_mint: String,
    pub right_child_mint: String,
    pub creation_price: i64,
    pub created_at: DateTime<Utc>,
    pub is_active: bool,
    pub indexed_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewClaimNode {
    pub pubkey: String,
    pub node_id: i64,
    pub root_vault: String,
    pub root_id: i64,
    pub owner_wallet: String,
    pub depth: i16,
    pub parent_node: Option<String>,
    pub claim_type: String,
    pub source_mint: String,
    pub left_child_mint: String,
    pub right_child_mint: String,
    pub creation_price: i64,
    pub created_at: DateTime<Utc>,
}

impl TryFrom<ClaimNodeRow> for fractal_common::ClaimNode {
    type Error = anyhow::Error;

    fn try_from(r: ClaimNodeRow) -> Result<Self, Self::Error> {
        use std::str::FromStr;
        let claim_type = fractal_common::ClaimSide::from_str(&r.claim_type)?;
        Ok(fractal_common::ClaimNode {
            pubkey: r.pubkey,
            node_id: r.node_id,
            root_vault: r.root_vault,
            root_id: r.root_id,
            owner_wallet: r.owner_wallet,
            depth: r.depth,
            parent_node: r.parent_node,
            claim_type,
            source_mint: r.source_mint,
            left_child_mint: r.left_child_mint,
            right_child_mint: r.right_child_mint,
            creation_price: r.creation_price,
            created_at: r.created_at,
            is_active: r.is_active,
        })
    }
}

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Raw DB row for the option_nodes table.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct OptionNodeRow {
    pub pubkey: String,
    pub node_id: i64,
    pub vault_pubkey: String,
    pub vault_id: i64,
    pub owner_wallet: String,
    pub depth: i16,
    pub parent_node: Option<String>,
    pub vault_side: String,
    pub long_child_mint: String,
    pub short_child_mint: String,
    pub long_backing: i64,
    pub short_backing: i64,
    pub parent_strike: i64,
    pub child_strike: i64,
    pub creation_price: i64,
    pub created_at: DateTime<Utc>,
    pub is_active: bool,
    pub indexed_at: DateTime<Utc>,
}

/// Fields required to insert a new option node row.
#[derive(Debug, Clone)]
pub struct NewOptionNode {
    pub pubkey: String,
    pub node_id: i64,
    pub vault_pubkey: String,
    pub vault_id: i64,
    pub owner_wallet: String,
    pub depth: i16,
    pub parent_node: Option<String>,
    pub vault_side: String,
    pub long_child_mint: String,
    pub short_child_mint: String,
    pub long_backing: i64,
    pub short_backing: i64,
    pub parent_strike: i64,
    pub child_strike: i64,
    pub creation_price: i64,
    pub created_at: DateTime<Utc>,
}

impl TryFrom<OptionNodeRow> for fractal_common::OptionNode {
    type Error = anyhow::Error;

    fn try_from(r: OptionNodeRow) -> Result<Self, Self::Error> {
        use std::str::FromStr;
        let vault_side = fractal_common::VaultSide::from_str(&r.vault_side)?;
        Ok(fractal_common::OptionNode {
            pubkey: r.pubkey,
            node_id: r.node_id,
            vault_pubkey: r.vault_pubkey,
            vault_id: r.vault_id,
            owner_wallet: r.owner_wallet,
            depth: r.depth,
            parent_node: r.parent_node,
            vault_side,
            long_child_mint: r.long_child_mint,
            short_child_mint: r.short_child_mint,
            long_backing: r.long_backing,
            short_backing: r.short_backing,
            parent_strike: r.parent_strike,
            child_strike: r.child_strike,
            creation_price: r.creation_price,
            created_at: r.created_at,
            is_active: r.is_active,
        })
    }
}

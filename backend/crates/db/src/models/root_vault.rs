use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RootVaultRow {
    pub pubkey: String,
    pub vault_id: i64,
    pub owner_wallet: String,
    pub collateral_mint: String,
    pub collateral_amount: i64,
    pub long_mint: String,
    pub short_mint: String,
    pub asset_feed: String,
    pub reference_price: i64,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub indexed_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewRootVault {
    pub pubkey: String,
    pub vault_id: i64,
    pub owner_wallet: String,
    pub collateral_mint: String,
    pub collateral_amount: i64,
    pub long_mint: String,
    pub short_mint: String,
    pub asset_feed: String,
    pub reference_price: i64,
    pub created_at: DateTime<Utc>,
}

impl From<RootVaultRow> for fractal_common::RootVault {
    fn from(r: RootVaultRow) -> Self {
        fractal_common::RootVault {
            pubkey: r.pubkey,
            vault_id: r.vault_id,
            owner_wallet: r.owner_wallet,
            collateral_mint: r.collateral_mint,
            collateral_amount: r.collateral_amount,
            long_mint: r.long_mint,
            short_mint: r.short_mint,
            asset_feed: r.asset_feed,
            reference_price: r.reference_price,
            is_active: r.is_active,
            created_at: r.created_at,
        }
    }
}

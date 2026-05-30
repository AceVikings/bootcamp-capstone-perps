use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Raw DB row for the option_vaults table.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct OptionVaultRow {
    pub pubkey: String,
    pub vault_id: i64,
    pub owner_wallet: String,
    pub vault_side: String,
    pub collateral_mint: String,
    pub collateral_amount: i64,
    pub root_mint: String,
    pub asset_feed: String,
    pub strike: i64,
    pub expiry: DateTime<Utc>,
    pub is_settled: bool,
    pub settlement_price: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub indexed_at: DateTime<Utc>,
}

/// Fields required to insert a new option vault row.
#[derive(Debug, Clone)]
pub struct NewOptionVault {
    pub pubkey: String,
    pub vault_id: i64,
    pub owner_wallet: String,
    pub vault_side: String,
    pub collateral_mint: String,
    pub collateral_amount: i64,
    pub root_mint: String,
    pub asset_feed: String,
    pub strike: i64,
    pub expiry: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

impl TryFrom<OptionVaultRow> for fractal_common::OptionVault {
    type Error = anyhow::Error;

    fn try_from(r: OptionVaultRow) -> Result<Self, Self::Error> {
        use std::str::FromStr;
        let vault_side = fractal_common::VaultSide::from_str(&r.vault_side)?;
        Ok(fractal_common::OptionVault {
            pubkey: r.pubkey,
            vault_id: r.vault_id,
            owner_wallet: r.owner_wallet,
            vault_side,
            collateral_mint: r.collateral_mint,
            collateral_amount: r.collateral_amount,
            root_mint: r.root_mint,
            asset_feed: r.asset_feed,
            strike: r.strike,
            expiry: r.expiry,
            is_settled: r.is_settled,
            settlement_price: r.settlement_price,
            created_at: r.created_at,
        })
    }
}

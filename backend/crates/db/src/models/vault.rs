use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Database row for an on-chain PositionVault account.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Vault {
    pub id: i64,
    pub pda: String,
    pub minter: String,
    pub epoch_pda: String,
    pub epoch_id: i64,
    pub asset_key: String,
    pub collateral_mint: String,
    pub collateral_amount: i64,
    pub entry_price: i64,
    pub long_tokens_minted: i64,
    pub short_tokens_minted: i64,
    pub depth: i16,
    pub parent_vault_pda: Option<String>,
    pub is_liquidated: bool,
    pub vault_index: i64,
    // Computed values updated by oracle cache service
    pub current_long_value: Option<i64>,
    pub current_short_value: Option<i64>,
    pub health_ratio: Option<sqlx::types::BigDecimal>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewVault {
    pub pda: String,
    pub minter: String,
    pub epoch_pda: String,
    pub epoch_id: i64,
    pub asset_key: String,
    pub collateral_mint: String,
    pub collateral_amount: i64,
    pub entry_price: i64,
    pub long_tokens_minted: i64,
    pub short_tokens_minted: i64,
    pub depth: i16,
    pub parent_vault_pda: Option<String>,
    pub vault_index: i64,
    pub created_at: DateTime<Utc>,
}

/// Minimal vault info for liquidation scanning.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct VaultHealthRow {
    pub pda: String,
    pub minter: String,
    pub epoch_id: i64,
    pub vault_index: i64,
    pub collateral_amount: i64,
    pub entry_price: i64,
    pub health_ratio: Option<sqlx::types::BigDecimal>,
}

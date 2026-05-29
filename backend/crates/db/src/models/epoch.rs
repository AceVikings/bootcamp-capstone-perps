use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Database row for an on-chain Epoch account.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Epoch {
    pub id: i64,
    pub epoch_id: i64,
    pub asset_key: String,
    pub pda: String,
    pub reference_price: i64,
    pub price_band_lower: i64,
    pub price_band_upper: i64,
    pub long_token_mint: String,
    pub short_token_mint: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub is_active: bool,
    pub total_collateral: i64,
    pub long_token_supply: i64,
    pub short_token_supply: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Payload for inserting or upserting an epoch row.
#[derive(Debug, Clone)]
pub struct NewEpoch {
    pub epoch_id: i64,
    pub asset_key: String,
    pub pda: String,
    pub reference_price: i64,
    pub price_band_lower: i64,
    pub price_band_upper: i64,
    pub long_token_mint: String,
    pub short_token_mint: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
}

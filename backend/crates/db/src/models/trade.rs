use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Trade {
    pub id: Uuid,
    pub token_mint: String,
    pub buyer_wallet: String,
    pub seller_wallet: String,
    pub price_usdc: i64,
    pub quantity: i64,
    pub tx_signature: Option<String>,
    pub settled_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewTrade {
    pub token_mint: String,
    pub buyer_wallet: String,
    pub seller_wallet: String,
    pub price_usdc: i64,
    pub quantity: i64,
    pub tx_signature: Option<String>,
}

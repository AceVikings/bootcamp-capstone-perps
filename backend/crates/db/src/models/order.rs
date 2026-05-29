use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Order {
    pub id: Uuid,
    pub trader_wallet: String,
    pub token_mint: String,
    pub side: String,
    pub price_usdc: i64,
    pub quantity: i64,
    pub filled_qty: i64,
    pub status: String,
    pub nonce: i64,
    pub expiry: DateTime<Utc>,
    pub signature: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewOrder {
    pub trader_wallet: String,
    pub token_mint: String,
    pub side: String,
    pub price_usdc: i64,
    pub quantity: i64,
    pub nonce: i64,
    pub expiry: DateTime<Utc>,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct OrderBookLevel {
    pub price_usdc: i64,
    pub quantity: i64,
}

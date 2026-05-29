use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A limit order for a pLONG or pSHORT position token.
/// Orders are signed by the maker's Solana wallet and stored off-chain.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Order {
    pub id: Uuid,
    pub maker: String,
    pub token_mint: String,
    pub token_type: String,
    pub side: String,
    pub epoch_id: i64,
    pub asset_key: String,
    pub quantity: i64,
    pub filled_qty: i64,
    pub price_usd: i64,
    pub status: String,
    pub signature: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Order {
    /// Returns the remaining unfilled quantity.
    pub fn remaining_qty(&self) -> i64 {
        self.quantity - self.filled_qty
    }
}

/// Payload for creating a new order.
#[derive(Debug, Clone, Deserialize)]
pub struct NewOrder {
    pub maker: String,
    pub token_mint: String,
    pub token_type: String,
    pub side: String,
    pub epoch_id: i64,
    pub asset_key: String,
    pub quantity: i64,
    pub price_usd: i64,
    pub signature: String,
    pub expires_at: Option<DateTime<Utc>>,
}

/// Condensed order for order book display (bid/ask levels).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct OrderBookLevel {
    pub price_usd: i64,
    pub total_quantity: i64,
    pub order_count: i64,
}

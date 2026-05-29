use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A matched trade between a maker order and a taker order.
/// Created by the matcher engine; settled on-chain by both parties.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Trade {
    pub id: Uuid,
    pub maker_order_id: Uuid,
    pub taker_order_id: Option<Uuid>,
    pub token_mint: String,
    pub token_type: String,
    pub epoch_id: i64,
    pub asset_key: String,
    pub quantity: i64,
    pub price_usd: i64,
    pub maker_wallet: String,
    pub taker_wallet: String,
    pub tx_signature: Option<String>,
    pub status: String,
    pub settlement_deadline: Option<DateTime<Utc>>,
    pub settled_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewTrade {
    pub maker_order_id: Uuid,
    pub taker_order_id: Option<Uuid>,
    pub token_mint: String,
    pub token_type: String,
    pub epoch_id: i64,
    pub asset_key: String,
    pub quantity: i64,
    pub price_usd: i64,
    pub maker_wallet: String,
    pub taker_wallet: String,
    pub settlement_deadline: Option<DateTime<Utc>>,
}

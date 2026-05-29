use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// OHLCV price candle for a position token over a fixed interval.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PriceCandle {
    pub id: i64,
    pub token_mint: String,
    pub token_type: String,
    pub epoch_id: i64,
    pub asset_key: String,
    pub interval: String,
    pub open_time: DateTime<Utc>,
    pub close_time: DateTime<Utc>,
    pub open_price: i64,
    pub high_price: i64,
    pub low_price: i64,
    pub close_price: i64,
    pub volume: i64,
    pub trade_count: i32,
}

#[derive(Debug, Clone)]
pub struct NewPriceCandle {
    pub token_mint: String,
    pub token_type: String,
    pub epoch_id: i64,
    pub asset_key: String,
    pub interval: String,
    pub open_time: DateTime<Utc>,
    pub close_time: DateTime<Utc>,
    pub open_price: i64,
    pub high_price: i64,
    pub low_price: i64,
    pub close_price: i64,
    pub volume: i64,
    pub trade_count: i32,
}

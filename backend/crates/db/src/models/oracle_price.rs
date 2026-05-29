use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Oracle price snapshot for a single asset.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OraclePrice {
    pub id: i64,
    pub asset_key: String,
    pub price_usd: i64,
    pub confidence: i64,
    pub slot: i64,
    pub recorded_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewOraclePrice {
    pub asset_key: String,
    pub price_usd: i64,
    pub confidence: i64,
    pub slot: i64,
}

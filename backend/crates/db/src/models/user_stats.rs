use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Aggregated stats per user wallet, refreshed by the analytics service.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UserStats {
    pub wallet: String,
    pub total_collateral_deposited: i64,
    pub total_fees_paid: i64,
    pub vault_count: i32,
    pub active_vault_count: i32,
    pub liquidated_vault_count: i32,
    pub realized_pnl: i64,
    pub total_long_bought: i64,
    pub total_short_bought: i64,
    pub updated_at: DateTime<Utc>,
}

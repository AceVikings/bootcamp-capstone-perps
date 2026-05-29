//! Matching engine: loads open orders from the DB, finds price-crossing pairs,
//! creates Trade records, and fills the component orders.
//!
//! Runs as a background tokio task, polling every `poll_interval`.

use anyhow::Result;
use chrono::Utc;
use tpp_db::{
    models::NewTrade,
    queries::{fill_order, get_open_orders, insert_trade},
    Db,
};
use tracing::{debug, info};
use uuid::Uuid;

/// Represents a newly matched trade (before DB write).
#[derive(Debug, Clone)]
pub struct MatchedTrade {
    pub maker_order_id: Uuid,
    pub taker_order_id: Uuid,
    pub token_mint: String,
    pub token_type: String,
    pub epoch_id: i64,
    pub asset_key: String,
    pub quantity: i64,
    pub price_usd: i64,
    pub maker_wallet: String,
    pub taker_wallet: String,
}

/// The match engine polls the DB and runs the matching loop.
pub struct MatchEngine {
    pool: Db,
    poll_interval: std::time::Duration,
}

impl MatchEngine {
    pub fn new(pool: Db, poll_interval_ms: u64) -> Self {
        Self {
            pool,
            poll_interval: std::time::Duration::from_millis(poll_interval_ms),
        }
    }

    /// Run the matching loop indefinitely.
    pub async fn run(&self) -> Result<()> {
        info!("Match engine started");

        loop {
            tokio::time::sleep(self.poll_interval).await;

            if let Err(e) = self.tick().await {
                tracing::warn!(error = %e, "Match engine tick error");
            }
        }
    }

    /// One matching cycle: fetch orders for all active token mints and match them.
    async fn tick(&self) -> Result<()> {
        // Get distinct token mints with open orders
        let mints: Vec<String> = sqlx::query_scalar(
            r#"
            SELECT DISTINCT token_mint FROM orders
            WHERE status IN ('OPEN', 'PARTIALLY_FILLED')
              AND (expires_at IS NULL OR expires_at > NOW())
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        for mint in mints {
            if let Err(e) = self.match_token(&mint).await {
                tracing::warn!(mint = %mint, error = %e, "Match failed for token");
            }
        }

        Ok(())
    }

    /// Match all crossable bid/ask pairs for one token mint.
    async fn match_token(&self, token_mint: &str) -> Result<()> {
        let mut bids = get_open_orders(&self.pool, token_mint, "BUY").await?;
        let mut asks = get_open_orders(&self.pool, token_mint, "SELL").await?;

        let mut bid_idx = 0;
        let mut ask_idx = 0;

        while bid_idx < bids.len() && ask_idx < asks.len() {
            let bid = &bids[bid_idx];
            let ask = &asks[ask_idx];

            // No crossing — done
            if bid.price_usd < ask.price_usd {
                break;
            }

            // Maker is the resting order (bid in this model)
            let match_price = bid.price_usd; // price-time priority: maker price wins
            let match_qty = bid.remaining_qty().min(ask.remaining_qty());

            debug!(
                bid_id = %bid.id, ask_id = %ask.id,
                price = match_price, qty = match_qty,
                "Matching orders"
            );

            let new_trade = NewTrade {
                maker_order_id: bid.id,
                taker_order_id: Some(ask.id),
                token_mint: token_mint.to_string(),
                token_type: bid.token_type.clone(),
                epoch_id: bid.epoch_id,
                asset_key: bid.asset_key.clone(),
                quantity: match_qty,
                price_usd: match_price,
                maker_wallet: bid.maker.clone(),
                taker_wallet: ask.maker.clone(),
                settlement_deadline: Some(Utc::now() + chrono::Duration::minutes(5)),
            };

            insert_trade(&self.pool, &new_trade).await?;
            let updated_bid = fill_order(&self.pool, bid.id, match_qty).await?;
            let updated_ask = fill_order(&self.pool, ask.id, match_qty).await?;

            info!(
                bid_id = %bid.id, ask_id = %ask.id,
                quantity = match_qty, price = match_price,
                "Trade matched"
            );

            bids[bid_idx] = updated_bid;
            asks[ask_idx] = updated_ask;

            if bids[bid_idx].remaining_qty() == 0 {
                bid_idx += 1;
            }
            if asks[ask_idx].remaining_qty() == 0 {
                ask_idx += 1;
            }
        }

        Ok(())
    }
}

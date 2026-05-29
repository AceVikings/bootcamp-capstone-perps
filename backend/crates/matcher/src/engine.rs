//! Matching engine: loads open orders from the DB, finds price-crossing pairs,
//! creates Trade records, and fills the component orders.
//!
//! Runs as a background tokio task, polling every `poll_interval`.

use anyhow::Result;
use fractal_db::{
    models::trade::NewTrade,
    queries::{fill_order, get_open_orders, insert_trade},
    Db,
};
use tracing::{debug, info};

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
                tracing::warn!(error = %e, "match engine tick error");
            }
        }
    }

    /// One matching cycle: fetch orders for all active token mints and match them.
    async fn tick(&self) -> Result<()> {
        let mints: Vec<String> = sqlx::query_scalar(
            r#"
            SELECT DISTINCT token_mint FROM orders
            WHERE status IN ('OPEN', 'PARTIAL')
              AND expiry > NOW()
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        for mint in mints {
            if let Err(e) = self.match_token(&mint).await {
                tracing::warn!(mint = %mint, error = %e, "match failed for token");
            }
        }

        Ok(())
    }

    /// Match all crossable bid/ask pairs for one token mint.
    async fn match_token(&self, token_mint: &str) -> Result<()> {
        let mut bids = get_open_orders(&self.pool, token_mint).await?;
        let mut asks: Vec<fractal_db::models::order::Order> = sqlx::query_as::<_, fractal_db::models::order::Order>(
            "SELECT * FROM orders WHERE token_mint = $1 AND side = 'SELL' AND status IN ('OPEN', 'PARTIAL') AND expiry > NOW() ORDER BY price_usdc ASC, created_at ASC",
        )
        .bind(token_mint)
        .fetch_all(&self.pool)
        .await?;

        // bids from get_open_orders are all OPEN/PARTIAL — filter to BUY side
        bids.retain(|o| o.side == "BUY");

        // Sort bids by price DESC, then time ASC
        bids.sort_by(|a, b| b.price_usdc.cmp(&a.price_usdc).then(a.created_at.cmp(&b.created_at)));

        let mut bid_idx = 0;
        let mut ask_idx = 0;

        while bid_idx < bids.len() && ask_idx < asks.len() {
            let bid = &bids[bid_idx];
            let ask = &asks[ask_idx];

            if bid.price_usdc < ask.price_usdc {
                break;
            }

            // Maker (resting bid) price wins for price-time priority
            let match_price = bid.price_usdc;
            let bid_remaining = bid.quantity - bid.filled_qty;
            let ask_remaining = ask.quantity - ask.filled_qty;
            let match_qty = bid_remaining.min(ask_remaining);

            debug!(
                bid_id = %bid.id, ask_id = %ask.id,
                price = match_price, qty = match_qty,
                "matching orders"
            );

            let new_trade = NewTrade {
                token_mint: token_mint.to_string(),
                buyer_wallet: bid.trader_wallet.clone(),
                seller_wallet: ask.trader_wallet.clone(),
                price_usdc: match_price,
                quantity: match_qty,
                tx_signature: None,
            };

            insert_trade(&self.pool, &new_trade).await?;
            fill_order(&self.pool, bid.id, match_qty).await?;
            fill_order(&self.pool, ask.id, match_qty).await?;

            info!(
                bid_id = %bid.id, ask_id = %ask.id,
                quantity = match_qty, price = match_price,
                "trade matched"
            );

            // Update local filled counts to avoid re-querying
            let new_bid_remaining = bid_remaining - match_qty;
            let new_ask_remaining = ask_remaining - match_qty;

            if new_bid_remaining == 0 {
                bid_idx += 1;
            } else {
                bids[bid_idx].filled_qty += match_qty;
            }
            if new_ask_remaining == 0 {
                ask_idx += 1;
            } else {
                asks[ask_idx].filled_qty += match_qty;
            }
        }

        Ok(())
    }
}

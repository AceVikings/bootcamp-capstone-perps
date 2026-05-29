//! In-memory order book for a single token mint.
//!
//! Bids (BUY orders): sorted by price DESC, then by time ASC (price-time priority)
//! Asks (SELL orders): sorted by price ASC, then by time ASC
//!
//! Orders in this structure are cached from the DB for matching purposes.
//! All state mutations are written back to PostgreSQL.

use chrono::{DateTime, Utc};
use std::collections::BTreeMap;
use uuid::Uuid;

/// A lightweight order representation for in-memory matching.
#[derive(Debug, Clone)]
pub struct BookOrder {
    pub id: Uuid,
    pub maker: String,
    pub price_usd: i64,
    pub remaining_qty: i64,
    pub created_at: DateTime<Utc>,
}

/// Aggregated order book for one token mint.
#[derive(Debug, Default)]
pub struct OrderBook {
    /// price → Vec<BookOrder> sorted by time ASC (best bid = highest key)
    pub bids: BTreeMap<i64, Vec<BookOrder>>,
    /// price → Vec<BookOrder> sorted by time ASC (best ask = lowest key)
    pub asks: BTreeMap<i64, Vec<BookOrder>>,
}

impl OrderBook {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a BUY order to bids.
    pub fn add_bid(&mut self, order: BookOrder) {
        self.bids.entry(order.price_usd).or_default().push(order);
    }

    /// Add a SELL order to asks.
    pub fn add_ask(&mut self, order: BookOrder) {
        self.asks.entry(order.price_usd).or_default().push(order);
    }

    /// Returns the best bid price (highest), if any.
    pub fn best_bid_price(&self) -> Option<i64> {
        self.bids.keys().next_back().copied()
    }

    /// Returns the best ask price (lowest), if any.
    pub fn best_ask_price(&self) -> Option<i64> {
        self.asks.keys().next().copied()
    }

    /// Returns true if the book has at least one crossable bid/ask pair.
    pub fn has_match(&self) -> bool {
        match (self.best_bid_price(), self.best_ask_price()) {
            (Some(bid), Some(ask)) => bid >= ask,
            _ => false,
        }
    }
}

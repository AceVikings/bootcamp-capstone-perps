use serde::{Deserialize, Serialize};

// ─── Vault side ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum VaultSide {
    Long,
    Short,
}

impl VaultSide {
    pub fn complement(&self) -> Self {
        match self {
            VaultSide::Long => VaultSide::Short,
            VaultSide::Short => VaultSide::Long,
        }
    }
}

impl std::fmt::Display for VaultSide {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VaultSide::Long => write!(f, "LONG"),
            VaultSide::Short => write!(f, "SHORT"),
        }
    }
}

impl std::str::FromStr for VaultSide {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "LONG" => Ok(VaultSide::Long),
            "SHORT" => Ok(VaultSide::Short),
            _ => Err(anyhow::anyhow!("invalid vault side: {}", s)),
        }
    }
}

// ─── Order side ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderSide {
    Buy,
    Sell,
}

impl std::fmt::Display for OrderSide {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrderSide::Buy => write!(f, "BUY"),
            OrderSide::Sell => write!(f, "SELL"),
        }
    }
}

impl std::str::FromStr for OrderSide {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "BUY" => Ok(OrderSide::Buy),
            "SELL" => Ok(OrderSide::Sell),
            _ => Err(anyhow::anyhow!("invalid order side: {}", s)),
        }
    }
}

// ─── Order status ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderStatus {
    Open,
    Partial,
    Filled,
    Cancelled,
}

impl std::fmt::Display for OrderStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrderStatus::Open => write!(f, "OPEN"),
            OrderStatus::Partial => write!(f, "PARTIAL"),
            OrderStatus::Filled => write!(f, "FILLED"),
            OrderStatus::Cancelled => write!(f, "CANCELLED"),
        }
    }
}

// ─── Shared domain models ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionVault {
    pub pubkey: String,
    pub vault_id: i64,
    pub owner_wallet: String,
    pub vault_side: VaultSide,
    pub collateral_mint: String,
    pub collateral_amount: i64,
    pub root_mint: String,
    pub asset_feed: String,
    pub strike: i64,
    pub expiry: chrono::DateTime<chrono::Utc>,
    pub is_settled: bool,
    pub settlement_price: Option<i64>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionNode {
    pub pubkey: String,
    pub node_id: i64,
    pub vault_pubkey: String,
    pub vault_id: i64,
    pub owner_wallet: String,
    pub depth: i16,
    pub parent_node: Option<String>,
    pub vault_side: VaultSide,
    pub long_child_mint: String,
    pub short_child_mint: String,
    pub long_backing: i64,
    pub short_backing: i64,
    pub parent_strike: i64,
    pub child_strike: i64,
    pub creation_price: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub is_active: bool,
}

// ─── On-chain event structs ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultCreatedEvent {
    pub vault_pubkey: String,
    pub vault_id: u64,
    pub owner: String,
    pub vault_side: VaultSide,
    pub collateral_mint: String,
    pub collateral_amount: u64,
    pub root_mint: String,
    pub asset_feed: String,
    pub strike: u64,
    pub expiry: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionSplitEvent {
    pub node_pubkey: String,
    pub vault_pubkey: String,
    pub vault_id: u64,
    pub owner: String,
    pub node_id: u64,
    pub depth: u8,
    pub parent_node: Option<String>,
    pub vault_side: VaultSide,
    pub long_child_mint: String,
    pub short_child_mint: String,
    pub long_backing: u64,
    pub short_backing: u64,
    pub parent_strike: u64,
    pub child_strike: u64,
    pub creation_price: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionMergedEvent {
    pub node_pubkey: String,
    pub vault_pubkey: String,
    pub owner: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionSettledEvent {
    pub vault_pubkey: String,
    pub owner: String,
    pub settlement_price: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeEvent {
    pub token_mint: String,
    pub buyer_wallet: String,
    pub seller_wallet: String,
    pub price_usdc: u64,
    pub quantity: u64,
    pub tx_signature: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    // ─── VaultSide ───────────────────────────────────────────────────────────

    #[test]
    fn vault_side_from_str_long() {
        assert_eq!(VaultSide::from_str("LONG").unwrap(), VaultSide::Long);
        assert_eq!(VaultSide::from_str("long").unwrap(), VaultSide::Long);
    }

    #[test]
    fn vault_side_from_str_short() {
        assert_eq!(VaultSide::from_str("SHORT").unwrap(), VaultSide::Short);
        assert_eq!(VaultSide::from_str("short").unwrap(), VaultSide::Short);
    }

    #[test]
    fn vault_side_from_str_invalid() {
        assert!(VaultSide::from_str("BULL").is_err());
        assert!(VaultSide::from_str("").is_err());
    }

    #[test]
    fn vault_side_display() {
        assert_eq!(VaultSide::Long.to_string(), "LONG");
        assert_eq!(VaultSide::Short.to_string(), "SHORT");
    }

    #[test]
    fn vault_side_complement() {
        assert_eq!(VaultSide::Long.complement(), VaultSide::Short);
        assert_eq!(VaultSide::Short.complement(), VaultSide::Long);
    }

    #[test]
    fn vault_side_round_trip() {
        for side in [VaultSide::Long, VaultSide::Short] {
            let s = side.to_string();
            assert_eq!(VaultSide::from_str(&s).unwrap(), side);
        }
    }

    // ─── OrderSide ───────────────────────────────────────────────────────────

    #[test]
    fn order_side_from_str_buy() {
        assert_eq!(OrderSide::from_str("BUY").unwrap(), OrderSide::Buy);
        assert_eq!(OrderSide::from_str("buy").unwrap(), OrderSide::Buy);
    }

    #[test]
    fn order_side_from_str_sell() {
        assert_eq!(OrderSide::from_str("SELL").unwrap(), OrderSide::Sell);
        assert_eq!(OrderSide::from_str("sell").unwrap(), OrderSide::Sell);
    }

    #[test]
    fn order_side_from_str_invalid() {
        assert!(OrderSide::from_str("HOLD").is_err());
    }

    #[test]
    fn order_side_display() {
        assert_eq!(OrderSide::Buy.to_string(), "BUY");
        assert_eq!(OrderSide::Sell.to_string(), "SELL");
    }

    // ─── OrderStatus ─────────────────────────────────────────────────────────

    #[test]
    fn order_status_display() {
        assert_eq!(OrderStatus::Open.to_string(), "OPEN");
        assert_eq!(OrderStatus::Partial.to_string(), "PARTIAL");
        assert_eq!(OrderStatus::Filled.to_string(), "FILLED");
        assert_eq!(OrderStatus::Cancelled.to_string(), "CANCELLED");
    }
}

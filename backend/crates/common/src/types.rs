use serde::{Deserialize, Serialize};

// ─── Claim side ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ClaimSide {
    Long,
    Short,
}

impl ClaimSide {
    pub fn complement(&self) -> Self {
        match self {
            ClaimSide::Long => ClaimSide::Short,
            ClaimSide::Short => ClaimSide::Long,
        }
    }
}

impl std::fmt::Display for ClaimSide {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ClaimSide::Long => write!(f, "LONG"),
            ClaimSide::Short => write!(f, "SHORT"),
        }
    }
}

impl std::str::FromStr for ClaimSide {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "LONG" => Ok(ClaimSide::Long),
            "SHORT" => Ok(ClaimSide::Short),
            _ => Err(anyhow::anyhow!("invalid claim side: {}", s)),
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
pub struct RootVault {
    pub pubkey: String,
    pub vault_id: i64,
    pub owner_wallet: String,
    pub collateral_mint: String,
    pub collateral_amount: i64,
    pub long_mint: String,
    pub short_mint: String,
    pub asset_feed: String,
    pub reference_price: i64,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaimNode {
    pub pubkey: String,
    pub node_id: i64,
    pub root_vault: String,
    pub root_id: i64,
    pub owner_wallet: String,
    pub depth: i16,
    pub parent_node: Option<String>,
    pub claim_type: ClaimSide,
    pub source_mint: String,
    pub left_child_mint: String,
    pub right_child_mint: String,
    pub creation_price: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub is_active: bool,
}

// ─── On-chain event structs ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateVaultEvent {
    pub vault_pubkey: String,
    pub vault_id: u64,
    pub owner: String,
    pub collateral_mint: String,
    pub collateral_amount: u64,
    pub long_mint: String,
    pub short_mint: String,
    pub asset_feed: String,
    pub reference_price: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitClaimEvent {
    pub node_pubkey: String,
    pub root_vault: String,
    pub root_id: u64,
    pub node_id: u64,
    pub owner: String,
    pub depth: u8,
    pub parent_node: Option<String>,
    pub claim_type: ClaimSide,
    pub source_mint: String,
    pub left_child_mint: String,
    pub right_child_mint: String,
    pub creation_price: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeClaimsEvent {
    pub node_pubkey: String,
    pub root_vault: String,
    pub owner: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedeemEvent {
    pub vault_pubkey: String,
    pub owner: String,
    pub payout_amount: u64,
    pub remaining_collateral: u64,
    pub is_closed: bool,
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

    // ─── ClaimSide ───────────────────────────────────────────────────────────

    #[test]
    fn claim_side_from_str_long() {
        assert_eq!(ClaimSide::from_str("LONG").unwrap(), ClaimSide::Long);
        assert_eq!(ClaimSide::from_str("long").unwrap(), ClaimSide::Long);
    }

    #[test]
    fn claim_side_from_str_short() {
        assert_eq!(ClaimSide::from_str("SHORT").unwrap(), ClaimSide::Short);
        assert_eq!(ClaimSide::from_str("short").unwrap(), ClaimSide::Short);
    }

    #[test]
    fn claim_side_from_str_invalid() {
        assert!(ClaimSide::from_str("BULL").is_err());
        assert!(ClaimSide::from_str("").is_err());
    }

    #[test]
    fn claim_side_display() {
        assert_eq!(ClaimSide::Long.to_string(), "LONG");
        assert_eq!(ClaimSide::Short.to_string(), "SHORT");
    }

    #[test]
    fn claim_side_complement() {
        assert_eq!(ClaimSide::Long.complement(), ClaimSide::Short);
        assert_eq!(ClaimSide::Short.complement(), ClaimSide::Long);
    }

    #[test]
    fn claim_side_round_trip() {
        for side in [ClaimSide::Long, ClaimSide::Short] {
            let s = side.to_string();
            assert_eq!(ClaimSide::from_str(&s).unwrap(), side);
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

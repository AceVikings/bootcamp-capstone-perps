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

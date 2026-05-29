use serde::{Deserialize, Serialize};

// ─── Token type (mirrors on-chain enum) ──────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TokenType {
    Long,
    Short,
}

impl std::fmt::Display for TokenType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TokenType::Long => write!(f, "LONG"),
            TokenType::Short => write!(f, "SHORT"),
        }
    }
}

impl std::str::FromStr for TokenType {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "LONG" => Ok(TokenType::Long),
            "SHORT" => Ok(TokenType::Short),
            _ => Err(anyhow::anyhow!("invalid token type: {}", s)),
        }
    }
}

// ─── Order side ──────────────────────────────────────────────────────────────

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
    PartiallyFilled,
    Filled,
    Cancelled,
    Expired,
}

impl std::fmt::Display for OrderStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrderStatus::Open => write!(f, "OPEN"),
            OrderStatus::PartiallyFilled => write!(f, "PARTIALLY_FILLED"),
            OrderStatus::Filled => write!(f, "FILLED"),
            OrderStatus::Cancelled => write!(f, "CANCELLED"),
            OrderStatus::Expired => write!(f, "EXPIRED"),
        }
    }
}

// ─── Trade status ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TradeStatus {
    Pending,
    Settling,
    Settled,
    Failed,
    Expired,
}

impl std::fmt::Display for TradeStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TradeStatus::Pending => write!(f, "PENDING"),
            TradeStatus::Settling => write!(f, "SETTLING"),
            TradeStatus::Settled => write!(f, "SETTLED"),
            TradeStatus::Failed => write!(f, "FAILED"),
            TradeStatus::Expired => write!(f, "EXPIRED"),
        }
    }
}

// ─── Candle interval ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CandleInterval {
    #[serde(rename = "1m")]
    OneMinute,
    #[serde(rename = "5m")]
    FiveMinutes,
    #[serde(rename = "15m")]
    FifteenMinutes,
    #[serde(rename = "1h")]
    OneHour,
    #[serde(rename = "4h")]
    FourHours,
    #[serde(rename = "1d")]
    OneDay,
}

impl std::fmt::Display for CandleInterval {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CandleInterval::OneMinute => write!(f, "1m"),
            CandleInterval::FiveMinutes => write!(f, "5m"),
            CandleInterval::FifteenMinutes => write!(f, "15m"),
            CandleInterval::OneHour => write!(f, "1h"),
            CandleInterval::FourHours => write!(f, "4h"),
            CandleInterval::OneDay => write!(f, "1d"),
        }
    }
}

impl CandleInterval {
    pub fn duration_secs(&self) -> i64 {
        match self {
            CandleInterval::OneMinute => 60,
            CandleInterval::FiveMinutes => 300,
            CandleInterval::FifteenMinutes => 900,
            CandleInterval::OneHour => 3600,
            CandleInterval::FourHours => 14400,
            CandleInterval::OneDay => 86400,
        }
    }
}

// ─── On-chain event types (mirror of Anchor #[event] structs) ─────────────────
// Used by the indexer to parse log data and the DB to store events.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpochCreatedEvent {
    pub epoch_id: u64,
    pub asset_key: String,      // base58
    pub reference_price: u64,
    pub end_time: i64,          // unix timestamp
    pub long_mint: String,      // base58
    pub short_mint: String,     // base58
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionMintedEvent {
    pub minter: String,         // base58
    pub vault: String,          // base58
    pub epoch_id: u64,
    pub collateral_amount: u64,
    pub entry_price: u64,
    pub long_tokens: u64,
    pub short_tokens: u64,
    pub fee: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionRedeemedEvent {
    pub redeemer: String,       // base58
    pub vault: String,          // base58
    pub token_type: TokenType,
    pub amount: u64,
    pub payout_gross: u64,
    pub payout_net: u64,
    pub fee: u64,
    pub current_price: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultLiquidatedEvent {
    pub liquidator: String,     // base58
    pub vault: String,          // base58
    pub current_price: u64,
    pub remaining_collateral: u64,
    pub liquidator_reward: u64,
    pub to_treasury: u64,
}

/// Discriminant used to identify which event was emitted
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TppEventType {
    EpochCreated,
    PositionMinted,
    PositionRedeemed,
    VaultLiquidated,
    ProtocolPauseChanged,
    FeesUpdated,
    AdminTransferred,
    ProtocolInitialized,
}

impl TppEventType {
    pub fn as_str(&self) -> &'static str {
        match self {
            TppEventType::EpochCreated => "EpochCreated",
            TppEventType::PositionMinted => "PositionMinted",
            TppEventType::PositionRedeemed => "PositionRedeemed",
            TppEventType::VaultLiquidated => "VaultLiquidated",
            TppEventType::ProtocolPauseChanged => "ProtocolPauseChanged",
            TppEventType::FeesUpdated => "FeesUpdated",
            TppEventType::AdminTransferred => "AdminTransferred",
            TppEventType::ProtocolInitialized => "ProtocolInitialized",
        }
    }
}

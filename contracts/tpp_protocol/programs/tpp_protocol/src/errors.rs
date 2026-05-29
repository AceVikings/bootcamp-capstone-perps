use anchor_lang::prelude::*;

#[error_code]
pub enum TppError {
    // Oracle errors
    #[msg("Oracle price is stale; refresh Pyth price feed")]
    StalePriceData,
    #[msg("Oracle confidence interval too wide; price is unreliable")]
    PriceConfidenceTooWide,
    #[msg("Oracle price is zero or negative")]
    InvalidOraclePrice,
    #[msg("Oracle circuit breaker triggered: price moved >15% in 60 seconds")]
    CircuitBreakerTriggered,

    // Collateral / math errors
    #[msg("Collateral amount must be greater than zero")]
    ZeroCollateral,
    #[msg("Token amount must be greater than zero")]
    ZeroTokenAmount,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Insufficient collateral for this operation")]
    InsufficientCollateral,

    // Epoch errors
    #[msg("Epoch has expired; cannot mint into a closed epoch")]
    EpochExpired,
    #[msg("Epoch is not yet expired; cannot close it")]
    EpochNotExpired,
    #[msg("Oracle price is outside this epoch's price band")]
    PriceOutsideBand,
    #[msg("Epoch is already active; cannot reinitialize")]
    EpochAlreadyActive,

    // Position / vault errors
    #[msg("Position vault has already been liquidated")]
    AlreadyLiquidated,
    #[msg("Position is not eligible for liquidation (still solvent)")]
    NotEligibleForLiquidation,
    #[msg("Recursive depth limit exceeded (max 3 layers)")]
    MaxRecursiveDepthExceeded,
    #[msg("Invalid token type; must be LONG or SHORT")]
    InvalidTokenType,
    #[msg("Position vault is paused by protocol admin")]
    ProtocolPaused,
    #[msg("Collateral haircut ratio would underflow")]
    HaircutRatioUnderflow,

    // Access control
    #[msg("Unauthorized: caller is not the protocol admin")]
    Unauthorized,

    // Redemption
    #[msg("Cannot redeem more tokens than you hold")]
    InsufficientTokenBalance,
    #[msg("Collateral vault is empty")]
    EmptyVault,
}

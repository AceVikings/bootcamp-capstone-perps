use anchor_lang::prelude::*;

#[error_code]
pub enum FractalError {
    // ── Protocol errors ───────────────────────────────────────────────────────
    #[msg("Protocol is paused")]
    Paused,                           // 6000
    #[msg("Vault has expired")]
    VaultExpired,                     // 6001
    #[msg("Vault has not expired yet")]
    NotExpired,                       // 6002
    #[msg("Vault is already settled")]
    AlreadySettled,                   // 6003
    #[msg("Oracle price is stale")]
    StaleOracle,                      // 6004
    #[msg("Oracle confidence too wide")]
    OracleConfidence,                 // 6005
    #[msg("Max recursion depth exceeded")]
    MaxDepthExceeded,                 // 6006
    #[msg("Node is not active")]
    NodeInactive,                     // 6007
    #[msg("Insufficient token balance")]
    InsufficientBalance,              // 6008
    #[msg("Invalid collateral mint")]
    InvalidCollateralMint,            // 6009
    #[msg("Amount must be > 0")]
    ZeroAmount,                       // 6010
    #[msg("Arithmetic overflow")]
    Overflow,                         // 6011
    #[msg("Invalid fee parameter")]
    InvalidFeeParam,                  // 6012
    #[msg("Invalid expiry")]
    InvalidExpiry,                    // 6013
    #[msg("Invalid token mint")]
    InvalidTokenMint,                 // 6014
    #[msg("Invalid parent node")]
    InvalidParentNode,                // 6015

    // ── oracle.rs compatibility (oracle.rs is not modified) ───────────────────
    #[msg("Oracle price is stale; post a fresh Pyth price update")]
    StaleOraclePrice,                 // 6016
    #[msg("Oracle confidence interval too wide")]
    OracleConfidenceTooWide,          // 6017
    #[msg("Oracle price is zero or negative")]
    InvalidOraclePrice,               // 6018
    #[msg("Arithmetic overflow")]
    MathOverflow,                     // 6019
}

use anchor_lang::prelude::*;

#[error_code]
pub enum FractalError {
    // ── Protocol state ────────────────────────────────────────────────────────
    #[msg("Protocol is paused")]
    ProtocolPaused,                         // 6000
    #[msg("Unauthorized: caller is not the protocol admin")]
    Unauthorized,                           // 6001
    #[msg("Fee parameter exceeds maximum allowed (500 bps / 5%)")]
    InvalidFeeParam,                        // 6002
    #[msg("Arithmetic overflow")]
    MathOverflow,                           // 6003

    // ── Oracle ────────────────────────────────────────────────────────────────
    #[msg("Oracle price is stale; post a fresh Pyth price update")]
    StaleOraclePrice,                       // 6004
    #[msg("Oracle confidence interval too wide")]
    OracleConfidenceTooWide,                // 6005
    #[msg("Oracle price is zero or negative")]
    InvalidOraclePrice,                     // 6006

    // ── Claim tree ────────────────────────────────────────────────────────────
    #[msg("Maximum recursive split depth reached")]
    MaxDepthReached,                        // 6007
    #[msg("Source mint is not a child of the provided parent account")]
    InvalidParentNode,                      // 6008
    #[msg("Claim node is not active (already fully merged)")]
    ClaimNodeInactive,                      // 6009
    #[msg("Invalid claim depth for this source mint")]
    InvalidClaimDepth,                      // 6010
    #[msg("Token mint does not match expected")]
    InvalidTokenMint,                       // 6011

    // ── Root vault ────────────────────────────────────────────────────────────
    #[msg("Root vault is not active")]
    VaultNotActive,                         // 6012
    #[msg("Amount must be greater than zero")]
    ZeroAmount,                             // 6013
    #[msg("Collateral vault is empty")]
    VaultEmpty,                             // 6014
    #[msg("Cannot redeem more than current token supply")]
    InsufficientTokenBalance,               // 6015

    // ── Trade settlement ──────────────────────────────────────────────────────
    #[msg("Order has expired")]
    OrderExpired,                           // 6016
    #[msg("Orders do not cross: buyer price < seller price")]
    OrdersDoNotCross,                       // 6017
    #[msg("Buyer and seller cannot be the same account")]
    SelfTrade,                              // 6018
    #[msg("Token mints in buyer and seller orders do not match")]
    MintMismatch,                           // 6019
    #[msg("Order side is incorrect for this role")]
    InvalidOrderSide,                       // 6020
    #[msg("Seller token account owner does not match seller order trader")]
    SellerMismatch,                         // 6021
    #[msg("Buyer collateral account owner does not match buyer order trader")]
    BuyerMismatch,                          // 6022
}

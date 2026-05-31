use anchor_lang::prelude::*;

// ─── Fractal Markets — State Accounts ────────────────────────────────────────

/// Global protocol configuration.
/// Seeds: ["protocol_config"]
#[account]
#[derive(Default)]
pub struct ProtocolConfig {
    pub admin: Pubkey,
    pub paused: bool,
    pub mint_fee_bps: u16,
    pub split_fee_bps: u16,
    pub merge_fee_bps: u16,
    pub redeem_fee_bps: u16,
    pub trade_fee_bps: u16,
    pub max_recursive_depth: u8,
    pub oracle_conf_denominator: u64,
    pub max_oracle_age_secs: u64,
    pub fee_treasury: Pubkey,
    pub total_fees_collected: u64,
    pub bump: u8,
}

impl ProtocolConfig {
    pub const SPACE: usize = 8
        + 32  // admin
        + 1   // paused
        + 2   // mint_fee_bps
        + 2   // split_fee_bps
        + 2   // merge_fee_bps
        + 2   // redeem_fee_bps
        + 2   // trade_fee_bps
        + 1   // max_recursive_depth
        + 8   // oracle_conf_denominator
        + 8   // max_oracle_age_secs
        + 32  // fee_treasury
        + 8   // total_fees_collected
        + 1;  // bump
}

/// Root vault: holds deposited collateral and tracks CALL (long) + FLOOR/PUT (short) mints.
///
/// Semantics:
///   vault_side = 0  (LONG):  long_mint = CALL@strike,  short_mint = FLOOR@strike
///   vault_side = 1  (SHORT): long_mint = CAP@strike,   short_mint = PUT@strike
///
/// Pre-expiry:  split_claim / merge_claims / redeem_root (burns both sides equally)
/// Post-expiry: settle_vault (burns one side, pays based on oracle vs strike)
///
/// Seeds: ["root_vault", owner, vault_id.to_le_bytes()]
#[account]
pub struct RootVault {
    pub vault_id: u64,
    pub owner: Pubkey,
    pub collateral_mint: Pubkey,
    pub collateral_amount: u64,
    pub long_mint: Pubkey,
    pub short_mint: Pubkey,
    pub asset_feed: Pubkey,
    pub creation_price: u64,
    pub created_at: i64,
    pub node_count: u64,
    pub is_active: bool,
    /// Strike price in micro-USD (6 decimals). e.g. $150.00 = 150_000_000.
    pub strike_price: u64,
    /// Unix timestamp after which settle_vault becomes available.
    pub expiry_ts: i64,
    /// 0 = LONG vault (CALL/FLOOR), 1 = SHORT vault (CAP/PUT).
    pub vault_side: u8,
    /// Oracle price locked on the first settle_vault call (0 = not yet settled).
    pub settlement_price: u64,
    /// Total collateral allocated to the LONG (CALL/CAP) token pool.
    /// Locked on first settle_vault call; NEVER updated afterwards.
    /// Payout per CALL token = amount × settled_call_total / settled_long_supply.
    pub settled_call_total: u64,
    /// Total collateral allocated to the SHORT (FLOOR/PUT) token pool.
    /// settled_call_total + settled_floor_total == collateral at lock time.
    pub settled_floor_total: u64,
    /// long_mint.supply at the moment settlement was locked.
    pub settled_long_supply: u64,
    /// short_mint.supply at the moment settlement was locked.
    pub settled_short_supply: u64,
    pub bump: u8,
}

impl RootVault {
    pub const SPACE: usize = 8
        + 8   // vault_id
        + 32  // owner
        + 32  // collateral_mint
        + 8   // collateral_amount
        + 32  // long_mint
        + 32  // short_mint
        + 32  // asset_feed
        + 8   // creation_price
        + 8   // created_at
        + 8   // node_count
        + 1   // is_active
        + 8   // strike_price
        + 8   // expiry_ts
        + 1   // vault_side
        + 8   // settlement_price
        + 8   // settled_call_total
        + 8   // settled_floor_total
        + 8   // settled_long_supply
        + 8   // settled_short_supply
        + 1;  // bump
}

/// Records one split event in the fractal claim tree.
///
/// Each node represents the creation of two child tokens (left = higher claim,
/// right = bounded claim) by burning a parent token at a specific child_strike.
///
/// Seeds: ["claim_node", root_vault, node_id.to_le_bytes()]
#[account]
pub struct ClaimNode {
    pub node_id: u64,
    pub root_vault: Pubkey,
    pub owner: Pubkey,
    pub depth: u8,
    pub parent_mint: Pubkey,
    pub left_child_mint: Pubkey,
    pub right_child_mint: Pubkey,
    pub creation_price: u64,
    pub created_at: i64,
    pub is_active: bool,
    /// Strike price of the parent token being split.
    pub parent_strike: u64,
    /// Strike price encoded into the new child tokens.
    /// left_child = CALL/CAP above child_strike
    /// right_child = FLOOR/PUT bounded at child_strike
    pub child_strike: u64,
    pub bump: u8,
}

impl ClaimNode {
    pub const SPACE: usize = 8
        + 8   // node_id
        + 32  // root_vault
        + 32  // owner
        + 1   // depth
        + 32  // parent_mint
        + 32  // left_child_mint
        + 32  // right_child_mint
        + 8   // creation_price
        + 8   // created_at
        + 1   // is_active
        + 8   // parent_strike
        + 8   // child_strike
        + 1;  // bump
}

/// Prevents order-replay in settle_trade.
/// Seeds: ["nonce", trader, nonce.to_le_bytes()]
#[account]
pub struct NonceLedger {
    pub trader: Pubkey,
    pub nonce: u64,
    pub bump: u8,
}

impl NonceLedger {
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}

/// Signed order for off-chain orderbook settlement.
/// The Ed25519 signature covers the 97-byte serialized message:
///   trader(32) || token_mint(32) || side(1) || quantity(8) || price(8) || nonce(8) || expires_at(8)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SignedOrder {
    pub trader: Pubkey,
    pub token_mint: Pubkey,
    /// 0 = Buy, 1 = Sell
    pub side: u8,
    pub quantity: u64,
    /// USDC lamports per token (6 decimals)
    pub price: u64,
    pub nonce: u64,
    pub expires_at: i64,
    /// Ed25519 signature for audit; on-chain enforcement uses Signer constraint
    pub signature: [u8; 64],
}

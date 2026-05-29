use anchor_lang::prelude::*;

// ─── State accounts ──────────────────────────────────────────────────────────

/// Global protocol configuration. One per deployment.
/// Seeds: ["protocol_config"]
#[account]
#[derive(Default)]
pub struct ProtocolConfig {
    /// Admin pubkey (multisig in production)
    pub admin: Pubkey,
    /// Whether all minting is paused (emergency stop).
    /// Redemptions remain open even when paused.
    pub paused: bool,
    /// Protocol fee on minting (basis points, e.g. 10 = 0.10%)
    pub mint_fee_bps: u16,
    /// Protocol fee on redemption (basis points, e.g. 5 = 0.05%)
    pub redeem_fee_bps: u16,
    /// Fee on recursive minting (basis points, e.g. 15 = 0.15%)
    pub recursive_fee_bps: u16,
    /// Liquidation caller reward (basis points, e.g. 50 = 0.50%)
    pub liquidation_reward_bps: u16,
    /// Hard cap on recursive depth (0 = base layer, max 3)
    pub max_recursive_depth: u8,
    /// Minimum oracle confidence ratio: conf must be < price / conf_denominator
    /// e.g. 100 means conf < 1% of price
    pub oracle_conf_denominator: u64,
    /// Maximum oracle age in seconds before price is considered stale
    pub max_oracle_age_secs: u64,
    /// Circuit breaker: reject liquidations if price moved this many bps in 60s
    pub circuit_breaker_bps: u16,
    /// Protocol fee treasury PDA (receives collected fees)
    pub fee_treasury: Pubkey,
    /// Total fees collected (USDC, 6 decimals)
    pub total_fees_collected: u64,
    /// Bump seed for this PDA
    pub bump: u8,
}

impl ProtocolConfig {
    /// Space: discriminator (8) + fields
    pub const SPACE: usize = 8
        + 32  // admin
        + 1   // paused
        + 2   // mint_fee_bps
        + 2   // redeem_fee_bps
        + 2   // recursive_fee_bps
        + 2   // liquidation_reward_bps
        + 1   // max_recursive_depth
        + 8   // oracle_conf_denominator
        + 8   // max_oracle_age_secs
        + 2   // circuit_breaker_bps
        + 32  // fee_treasury
        + 8   // total_fees_collected
        + 1;  // bump
}

/// Epoch: 24-hour window that batches positions into fungible tokens.
/// Seeds: ["epoch", asset_mint, epoch_id.to_le_bytes()]
#[account]
pub struct Epoch {
    /// Identifier (monotonically increasing per asset)
    pub epoch_id: u64,
    /// The underlying asset mint (e.g. SOL price feed key, used as identifier)
    pub asset_key: Pubkey,
    /// Unix timestamp when this epoch opened
    pub start_time: i64,
    /// Unix timestamp when this epoch closes (start + 86400)
    pub end_time: i64,
    /// Lower bound of oracle price band (e.g. entry_price * 0.995)
    pub price_band_lower: u64,
    /// Upper bound of oracle price band (e.g. entry_price * 1.005)
    pub price_band_upper: u64,
    /// Reference oracle price at epoch open (6 decimal precision, USD)
    pub reference_price: u64,
    /// SPL mint for LONG tokens in this epoch
    pub long_token_mint: Pubkey,
    /// SPL mint for SHORT tokens in this epoch
    pub short_token_mint: Pubkey,
    /// Total collateral deposited in this epoch (USDC 6 decimals)
    pub total_collateral: u64,
    /// Total long tokens minted
    pub long_token_supply: u64,
    /// Total short tokens minted
    pub short_token_supply: u64,
    /// Whether this epoch is still accepting new positions
    pub is_active: bool,
    /// Bump seed
    pub bump: u8,
}

impl Epoch {
    pub const SPACE: usize = 8
        + 8   // epoch_id
        + 32  // asset_key
        + 8   // start_time
        + 8   // end_time
        + 8   // price_band_lower
        + 8   // price_band_upper
        + 8   // reference_price
        + 32  // long_token_mint
        + 32  // short_token_mint
        + 8   // total_collateral
        + 8   // long_token_supply
        + 8   // short_token_supply
        + 1   // is_active
        + 1;  // bump
}

/// A single position vault holding collateral backing a pair of tokens.
/// Seeds: ["vault", epoch, minter, index.to_le_bytes()]
#[account]
pub struct PositionVault {
    /// Who deposited the collateral
    pub minter: Pubkey,
    /// Which epoch this belongs to
    pub epoch: Pubkey,
    /// Collateral mint (e.g. USDC)
    pub collateral_mint: Pubkey,
    /// Amount of collateral locked (USDC 6 decimals)
    pub collateral_amount: u64,
    /// Oracle price at time of minting (USD, 6 decimal precision)
    pub entry_price: u64,
    /// Amount of long tokens minted from this vault
    pub long_tokens_minted: u64,
    /// Amount of short tokens minted from this vault
    pub short_tokens_minted: u64,
    /// Recursive depth: 0 = base (USDC collateral), 1+ = backed by position token
    pub depth: u8,
    /// Pubkey of the parent vault (if depth > 0)
    pub parent_vault: Option<Pubkey>,
    /// Has this vault been liquidated
    pub is_liquidated: bool,
    /// Creation timestamp
    pub created_at: i64,
    /// Last oracle price seen (used for circuit breaker)
    pub last_price: u64,
    /// Timestamp of last_price reading
    pub last_price_ts: i64,
    /// Sequential index for this minter (to allow multiple vaults per user)
    pub index: u64,
    /// Bump seed
    pub bump: u8,
}

impl PositionVault {
    pub const SPACE: usize = 8
        + 32  // minter
        + 32  // epoch
        + 32  // collateral_mint
        + 8   // collateral_amount
        + 8   // entry_price
        + 8   // long_tokens_minted
        + 8   // short_tokens_minted
        + 1   // depth
        + 33  // parent_vault: Option<Pubkey>
        + 1   // is_liquidated
        + 8   // created_at
        + 8   // last_price
        + 8   // last_price_ts
        + 8   // index
        + 1;  // bump

    /// Computes intrinsic LONG token value given current price.
    /// V_LONG = collateral * (current_price / entry_price)
    /// Returns value in collateral units (6 decimals).
    pub fn long_value(&self, current_price: u64) -> Option<u64> {
        let val = (self.collateral_amount as u128)
            .checked_mul(current_price as u128)?
            .checked_div(self.entry_price as u128)?;
        Some(val as u64)
    }

    /// Computes intrinsic SHORT token value given current price.
    /// V_SHORT = collateral * (2 - current_price / entry_price)
    ///         = 2 * collateral - V_LONG
    pub fn short_value(&self, current_price: u64) -> Option<u64> {
        let long_val = self.long_value(current_price)?;
        // V_LONG + V_SHORT = 2 * collateral
        let total = self.collateral_amount.checked_mul(2)?;
        total.checked_sub(long_val)
    }

    /// True if LONG token is effectively worthless (price doubled from entry)
    pub fn long_is_liquidatable(&self, current_price: u64) -> bool {
        // LONG liquidatable if current_price >= 2 * entry_price
        // Add 5% buffer: liquidate at 95% of collateral depletion
        let threshold = (self.entry_price as u128)
            .saturating_mul(195)
            .saturating_div(100) as u64;
        current_price >= threshold
    }

    /// True if SHORT token is effectively worthless (price halved from entry)
    pub fn short_is_liquidatable(&self, current_price: u64) -> bool {
        // SHORT liquidatable if current_price <= 0.05 * entry_price  
        // Liquidate when short value < 5% of collateral
        let threshold = (self.entry_price as u128)
            .saturating_mul(5)
            .saturating_div(100) as u64;
        current_price <= threshold
    }
}

/// Tracks minter vault count (for PDA index uniqueness)
/// Seeds: ["minter_state", minter_pubkey]
#[account]
pub struct MinterState {
    pub minter: Pubkey,
    pub vault_count: u64,
    pub bump: u8,
}

impl MinterState {
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}

/// Token type enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TokenType {
    Long,
    Short,
}

use anchor_lang::prelude::*;

// ─── Strike-Tiered Options Protocol — State Accounts ─────────────────────────

/// Global protocol configuration.
/// Seeds: ["protocol_config"]
#[account]
#[derive(Default)]
pub struct ProtocolConfig {
    pub admin: Pubkey,
    pub paused: bool,
    pub usdc_mint: Pubkey,
    pub fee_bps: u16,
    pub fee_treasury: Pubkey,
    pub max_recursive_depth: u8,
    pub oracle_conf_denominator: u64,
    pub max_oracle_age_secs: u64,
    pub total_fees_collected: u64,
    pub bump: u8,
}

impl ProtocolConfig {
    pub const SPACE: usize = 8   // discriminator
        + 32  // admin
        + 1   // paused
        + 32  // usdc_mint
        + 2   // fee_bps
        + 32  // fee_treasury
        + 1   // max_recursive_depth
        + 8   // oracle_conf_denominator
        + 8   // max_oracle_age_secs
        + 8   // total_fees_collected
        + 1;  // bump
        // Total: 133
}

/// Vault side: Long (wSOL collateral) or Short (USDC collateral).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum VaultSide {
    #[default]
    Long,
    Short,
}

/// Option vault: holds deposited collateral and tracks the root token mint.
/// Seeds: ["option_vault", owner, vault_id.to_le_bytes()]
#[account]
pub struct OptionVault {
    pub vault_id: u64,
    pub owner: Pubkey,
    pub vault_side: VaultSide,
    pub collateral_mint: Pubkey,
    pub collateral_amount: u64,
    pub root_mint: Pubkey,
    pub asset_feed: Pubkey,
    pub strike: i64,
    pub expiry: i64,
    pub node_count: u64,
    pub is_settled: bool,
    pub settlement_price: i64,
    pub bump: u8,
}

impl OptionVault {
    pub const SPACE: usize = 8   // discriminator
        + 8   // vault_id
        + 32  // owner
        + 1   // vault_side
        + 32  // collateral_mint
        + 8   // collateral_amount
        + 32  // root_mint
        + 32  // asset_feed
        + 8   // strike
        + 8   // expiry
        + 8   // node_count
        + 1   // is_settled
        + 8   // settlement_price
        + 1;  // bump
        // Total: 157
}

/// Option node: records one fractal split event.
/// Seeds: ["option_node", vault, node_id.to_le_bytes()]
#[account]
pub struct OptionNode {
    pub node_id: u64,
    pub root_vault: Pubkey,
    pub root_id: u64,
    pub owner: Pubkey,
    pub depth: u8,
    /// None if depth == 1 (direct split from root).
    pub parent_node: Option<Pubkey>,
    pub vault_side: VaultSide,
    /// The mint that was burned to create this node (validated in merge).
    pub parent_mint: Pubkey,
    /// CALL (Long) or CAP (Short) — benefits from upward price movement.
    pub long_child_mint: Pubkey,
    /// FLOOR (Long) or PUT (Short) — benefits from downward price movement.
    pub short_child_mint: Pubkey,
    pub long_backing: u64,
    pub short_backing: u64,
    pub parent_strike: i64,
    pub child_strike: i64,
    pub creation_price: i64,
    pub created_at: i64,
    pub is_active: bool,
    pub bump: u8,
}

impl OptionNode {
    pub const SPACE: usize = 8   // discriminator
        + 8   // node_id
        + 32  // root_vault
        + 8   // root_id
        + 32  // owner
        + 1   // depth
        + 33  // parent_node: Option<Pubkey>
        + 1   // vault_side
        + 32  // parent_mint
        + 32  // long_child_mint
        + 32  // short_child_mint
        + 8   // long_backing
        + 8   // short_backing
        + 8   // parent_strike
        + 8   // child_strike
        + 8   // creation_price
        + 8   // created_at
        + 1   // is_active
        + 1;  // bump
        // Total: 269
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct VaultCreatedEvent {
    pub vault_id: u64,
    pub owner: Pubkey,
    pub vault_side: VaultSide,
    pub collateral_amount: u64,
    pub strike: i64,
    pub expiry: i64,
    pub root_mint: Pubkey,
}

#[event]
pub struct OptionSplitEvent {
    pub vault_id: u64,
    pub node_id: u64,
    pub depth: u8,
    pub parent_strike: i64,
    pub child_strike: i64,
    pub long_child_mint: Pubkey,
    pub short_child_mint: Pubkey,
    pub long_backing: u64,
    pub short_backing: u64,
    pub creation_price: i64,
}

#[event]
pub struct OptionMergedEvent {
    pub vault_id: u64,
    pub node_id: u64,
}

#[event]
pub struct OptionSettledEvent {
    pub vault_id: u64,
    pub settlement_price: i64,
    pub settler: Pubkey,
    pub payout: u64,
    pub fee: u64,
}

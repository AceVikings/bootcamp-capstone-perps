use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod oracle;
pub mod state;

use instructions::*;
use state::TokenType;

declare_id!("9iUeMGw14CaAiASMUruBMWRR5j7HcEXwthuN5pDAo3Qf");

#[program]
pub mod tpp_protocol {
    use super::*;

    // ── Protocol setup ────────────────────────────────────────────────────────

    /// Initializes the global protocol config. Can only be called once.
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        mint_fee_bps: u16,
        redeem_fee_bps: u16,
        recursive_fee_bps: u16,
        liquidation_reward_bps: u16,
        max_recursive_depth: u8,
        oracle_conf_denominator: u64,
        max_oracle_age_secs: u64,
        circuit_breaker_bps: u16,
    ) -> Result<()> {
        instructions::initialize_protocol(
            ctx,
            mint_fee_bps,
            redeem_fee_bps,
            recursive_fee_bps,
            liquidation_reward_bps,
            max_recursive_depth,
            oracle_conf_denominator,
            max_oracle_age_secs,
            circuit_breaker_bps,
        )
    }

    /// Creates a new 24-hour epoch for an asset. Permissionless keeper call.
    pub fn create_epoch(ctx: Context<CreateEpoch>, epoch_id: u64) -> Result<()> {
        instructions::create_epoch(ctx, epoch_id)
    }

    // ── Position lifecycle ────────────────────────────────────────────────────

    /// Deposits USDC collateral and mints an equal pair of LONG+SHORT tokens.
    pub fn mint_position_pair(
        ctx: Context<MintPositionPair>,
        epoch_id: u64,
        vault_index: u64,
        collateral_amount: u64,
    ) -> Result<()> {
        instructions::mint_position_pair(ctx, epoch_id, vault_index, collateral_amount)
    }

    /// Burns position tokens and returns proportional collateral to the caller.
    pub fn redeem_position(
        ctx: Context<RedeemPosition>,
        epoch_id: u64,
        vault_index: u64,
        token_type: TokenType,
        amount: u64,
    ) -> Result<()> {
        instructions::redeem_position(ctx, epoch_id, vault_index, token_type, amount)
    }

    /// Permissionless: liquidates an insolvent vault.
    /// Caller earns a configurable reward; remainder goes to treasury.
    pub fn liquidate(
        ctx: Context<Liquidate>,
        epoch_id: u64,
        vault_index: u64,
        vault_minter: Pubkey,
    ) -> Result<()> {
        instructions::liquidate(ctx, epoch_id, vault_index, vault_minter)
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// Admin only: pause or resume minting. Redemptions always remain open.
    pub fn set_protocol_pause(ctx: Context<SetProtocolPause>, paused: bool) -> Result<()> {
        instructions::set_protocol_pause(ctx, paused)
    }

    /// Admin only: update protocol fee rates (capped at 5%).
    pub fn update_fees(
        ctx: Context<UpdateFees>,
        mint_fee_bps: u16,
        redeem_fee_bps: u16,
        recursive_fee_bps: u16,
    ) -> Result<()> {
        instructions::update_fees(ctx, mint_fee_bps, redeem_fee_bps, recursive_fee_bps)
    }

    /// Admin only: transfer admin role to a new key (e.g. multisig).
    pub fn transfer_admin(ctx: Context<TransferAdmin>) -> Result<()> {
        instructions::transfer_admin(ctx)
    }

    // ── Test helpers (mock-oracle feature only) ───────────────────────────────

    /// Writes price + timestamp into a 16-byte oracle account owned by this program.
    /// ONLY compiled when the `mock-oracle` feature is enabled (default on localnet).
    /// Production builds: `anchor build --no-default-features --features idl-build`
    #[cfg(feature = "mock-oracle")]
    pub fn set_mock_oracle_price(
        ctx: Context<SetMockOraclePrice>,
        price_usd: u64,
        timestamp: i64,
    ) -> Result<()> {
        instructions::set_mock_oracle_price(ctx, price_usd, timestamp)
    }
}

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod oracle;
pub mod state;

use instructions::*;

declare_id!("9iUeMGw14CaAiASMUruBMWRR5j7HcEXwthuN5pDAo3Qf");

#[program]
pub mod tpp_protocol {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        fee_bps: u16,
        max_recursive_depth: u8,
        oracle_conf_denominator: u64,
        max_oracle_age_secs: u64,
        usdc_mint: Pubkey,
    ) -> Result<()> {
        instructions::initialize(
            ctx,
            fee_bps,
            max_recursive_depth,
            oracle_conf_denominator,
            max_oracle_age_secs,
            usdc_mint,
        )
    }

    pub fn create_long_vault(
        ctx: Context<CreateLongVault>,
        vault_id: u64,
        asset_feed: Pubkey,
        amount: u64,
        expiry: i64,
    ) -> Result<()> {
        instructions::create_long_vault(ctx, vault_id, asset_feed, amount, expiry)
    }

    pub fn create_short_vault(
        ctx: Context<CreateShortVault>,
        vault_id: u64,
        asset_feed: Pubkey,
        amount: u64,
        expiry: i64,
    ) -> Result<()> {
        instructions::create_short_vault(ctx, vault_id, asset_feed, amount, expiry)
    }

    pub fn split_option(
        ctx: Context<SplitOption>,
        vault_id: u64,
        node_id: u64,
        amount: u64,
        parent_strike: i64,
    ) -> Result<()> {
        instructions::split_option(ctx, vault_id, node_id, amount, parent_strike)
    }

    pub fn merge_option(
        ctx: Context<MergeOption>,
        vault_id: u64,
        node_id: u64,
        amount: u64,
    ) -> Result<()> {
        instructions::merge_option(ctx, vault_id, node_id, amount)
    }

    pub fn settle_option(
        ctx: Context<SettleOption>,
        vault_id: u64,
        node_id: u64,
        amount: u64,
        is_long_child: bool,
    ) -> Result<()> {
        instructions::settle_option(ctx, vault_id, node_id, amount, is_long_child)
    }

}

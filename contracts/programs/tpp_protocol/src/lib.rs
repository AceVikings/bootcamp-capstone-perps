use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod oracle;
pub mod state;

use instructions::*;
use state::SignedOrder;

declare_id!("9iUeMGw14CaAiASMUruBMWRR5j7HcEXwthuN5pDAo3Qf");

#[program]
pub mod tpp_protocol {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        mint_fee_bps: u16,
        split_fee_bps: u16,
        merge_fee_bps: u16,
        redeem_fee_bps: u16,
        trade_fee_bps: u16,
        max_recursive_depth: u8,
        oracle_conf_denominator: u64,
        max_oracle_age_secs: u64,
    ) -> Result<()> {
        instructions::initialize(
            ctx,
            mint_fee_bps,
            split_fee_bps,
            merge_fee_bps,
            redeem_fee_bps,
            trade_fee_bps,
            max_recursive_depth,
            oracle_conf_denominator,
            max_oracle_age_secs,
        )
    }

    pub fn create_root_vault(
        ctx: Context<CreateRootVault>,
        vault_id: u64,
        asset_feed: Pubkey,
        collateral_amount: u64,
    ) -> Result<()> {
        instructions::create_root_vault(ctx, vault_id, asset_feed, collateral_amount)
    }

    pub fn split_claim(
        ctx: Context<SplitClaim>,
        vault_id: u64,
        node_id: u64,
        amount: u64,
    ) -> Result<()> {
        instructions::split_claim(ctx, vault_id, node_id, amount)
    }

    pub fn merge_claims(
        ctx: Context<MergeClaims>,
        vault_id: u64,
        amount: u64,
    ) -> Result<()> {
        instructions::merge_claims(ctx, vault_id, amount)
    }

    pub fn redeem_root(
        ctx: Context<RedeemRoot>,
        vault_id: u64,
        amount: u64,
    ) -> Result<()> {
        instructions::redeem_root(ctx, vault_id, amount)
    }

    pub fn settle_trade(
        ctx: Context<SettleTrade>,
        buyer_order: SignedOrder,
        seller_order: SignedOrder,
    ) -> Result<()> {
        instructions::settle_trade(ctx, buyer_order, seller_order)
    }

    pub fn set_protocol_pause(
        ctx: Context<SetProtocolPause>,
        paused: bool,
    ) -> Result<()> {
        instructions::set_protocol_pause(ctx, paused)
    }

    pub fn update_fees(
        ctx: Context<UpdateFees>,
        mint_fee_bps: u16,
        split_fee_bps: u16,
        merge_fee_bps: u16,
        redeem_fee_bps: u16,
        trade_fee_bps: u16,
    ) -> Result<()> {
        instructions::update_fees(
            ctx,
            mint_fee_bps,
            split_fee_bps,
            merge_fee_bps,
            redeem_fee_bps,
            trade_fee_bps,
        )
    }

    pub fn transfer_admin(
        ctx: Context<TransferAdmin>,
        new_admin: Pubkey,
    ) -> Result<()> {
        instructions::transfer_admin(ctx, new_admin)
    }

    #[cfg(feature = "mock-oracle")]
    pub fn set_mock_oracle_price(
        ctx: Context<SetMockOraclePrice>,
        price_usd: u64,
    ) -> Result<()> {
        instructions::set_mock_oracle_price(ctx, price_usd)
    }
}

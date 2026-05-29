use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer},
};

use crate::{
    errors::TppError,
    oracle::{check_circuit_breaker, get_oracle_price},
    state::{Epoch, MinterState, PositionVault, ProtocolConfig, TokenType},
};

// ─── initialize_protocol ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = admin,
        space = ProtocolConfig::SPACE,
        seeds = [b"protocol_config"],
        bump,
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        init,
        payer = admin,
        space = 8,
        seeds = [b"fee_treasury"],
        bump,
    )]
    /// CHECK: PDA used only as a token account authority
    pub fee_treasury: AccountInfo<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

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
    // Validate parameter bounds
    require!(mint_fee_bps <= 500, TppError::InvalidOraclePrice); // max 5%
    require!(redeem_fee_bps <= 500, TppError::InvalidOraclePrice);
    require!(recursive_fee_bps <= 500, TppError::InvalidOraclePrice);
    require!(liquidation_reward_bps <= 1000, TppError::InvalidOraclePrice); // max 10%
    require!(max_recursive_depth <= 3, TppError::MaxRecursiveDepthExceeded);
    require!(max_oracle_age_secs > 0, TppError::StalePriceData);

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.paused = false;
    config.mint_fee_bps = mint_fee_bps;
    config.redeem_fee_bps = redeem_fee_bps;
    config.recursive_fee_bps = recursive_fee_bps;
    config.liquidation_reward_bps = liquidation_reward_bps;
    config.max_recursive_depth = max_recursive_depth;
    config.oracle_conf_denominator = oracle_conf_denominator;
    config.max_oracle_age_secs = max_oracle_age_secs;
    config.circuit_breaker_bps = circuit_breaker_bps;
    config.fee_treasury = ctx.accounts.fee_treasury.key();
    config.total_fees_collected = 0;
    config.bump = ctx.bumps.config;

    emit!(ProtocolInitialized {
        admin: config.admin,
        mint_fee_bps,
        max_recursive_depth,
    });

    Ok(())
}

// ─── create_epoch ─────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct CreateEpoch<'info> {
    #[account(
        init,
        payer = creator,
        space = Epoch::SPACE,
        seeds = [b"epoch", asset_key.key().as_ref(), &epoch_id.to_le_bytes()],
        bump,
    )]
    pub epoch: Account<'info, Epoch>,

    /// SPL token mint for LONG tokens; mint authority = epoch PDA
    #[account(
        init,
        payer = creator,
        mint::decimals = 6,
        mint::authority = epoch,
        seeds = [b"long_mint", asset_key.key().as_ref(), &epoch_id.to_le_bytes()],
        bump,
    )]
    pub long_mint: Account<'info, Mint>,

    /// SPL token mint for SHORT tokens; mint authority = epoch PDA
    #[account(
        init,
        payer = creator,
        mint::decimals = 6,
        mint::authority = epoch,
        seeds = [b"short_mint", asset_key.key().as_ref(), &epoch_id.to_le_bytes()],
        bump,
    )]
    pub short_mint: Account<'info, Mint>,

    /// Asset identifier (can be oracle pubkey or any unique key per asset)
    /// CHECK: Used only as a seed component; not read
    pub asset_key: UncheckedAccount<'info>,

    /// Mock oracle account holding the current price
    /// CHECK: Validated in instruction logic
    pub oracle: UncheckedAccount<'info>,

    #[account(seeds = [b"protocol_config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn create_epoch(ctx: Context<CreateEpoch>, epoch_id: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, TppError::ProtocolPaused);

    let clock = Clock::get()?;
    let config = &ctx.accounts.config;

    // Read oracle price (dispatches to Pyth on devnet, mock on localnet)
    let oracle_price = get_oracle_price(
        &ctx.accounts.oracle.to_account_info(),
        config.max_oracle_age_secs,
        &clock,
        config.oracle_conf_denominator,
    )?;

    let price = oracle_price.price_usd;
    require!(price > 0, TppError::InvalidOraclePrice);

    // Price band: ±0.5% of reference price
    let band_half = price.checked_div(200).ok_or(TppError::MathOverflow)?; // 0.5%
    let price_band_lower = price.saturating_sub(band_half);
    let price_band_upper = price.checked_add(band_half).ok_or(TppError::MathOverflow)?;

    let epoch = &mut ctx.accounts.epoch;
    epoch.epoch_id = epoch_id;
    epoch.asset_key = ctx.accounts.asset_key.key();
    epoch.start_time = clock.unix_timestamp;
    epoch.end_time = clock.unix_timestamp + 86_400; // 24 hours
    epoch.price_band_lower = price_band_lower;
    epoch.price_band_upper = price_band_upper;
    epoch.reference_price = price;
    epoch.long_token_mint = ctx.accounts.long_mint.key();
    epoch.short_token_mint = ctx.accounts.short_mint.key();
    epoch.total_collateral = 0;
    epoch.long_token_supply = 0;
    epoch.short_token_supply = 0;
    epoch.is_active = true;
    epoch.bump = ctx.bumps.epoch;

    emit!(EpochCreated {
        epoch_id,
        asset_key: ctx.accounts.asset_key.key(),
        reference_price: price,
        end_time: epoch.end_time,
        long_mint: ctx.accounts.long_mint.key(),
        short_mint: ctx.accounts.short_mint.key(),
    });

    Ok(())
}

// ─── mint_position_pair ───────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(epoch_id: u64, vault_index: u64)]
pub struct MintPositionPair<'info> {
    #[account(
        mut,
        seeds = [b"epoch", epoch.asset_key.as_ref(), &epoch_id.to_le_bytes()],
        bump = epoch.bump,
    )]
    pub epoch: Box<Account<'info, Epoch>>,

    #[account(
        init,
        payer = minter,
        space = PositionVault::SPACE,
        seeds = [b"vault", epoch.key().as_ref(), minter.key().as_ref(), &vault_index.to_le_bytes()],
        bump,
    )]
    pub vault: Box<Account<'info, PositionVault>>,

    /// Minter's USDC account (source of collateral)
    #[account(
        mut,
        constraint = minter_collateral.mint == collateral_mint.key() @ TppError::InsufficientCollateral,
        constraint = minter_collateral.owner == minter.key() @ TppError::Unauthorized,
    )]
    pub minter_collateral: Box<Account<'info, TokenAccount>>,

    /// Protocol vault PDA that holds collateral
    #[account(
        init_if_needed,
        payer = minter,
        associated_token::mint = collateral_mint,
        associated_token::authority = vault,
    )]
    pub vault_collateral: Box<Account<'info, TokenAccount>>,

    /// Minter's LONG token account (receives minted long tokens)
    #[account(
        init_if_needed,
        payer = minter,
        associated_token::mint = long_mint,
        associated_token::authority = minter,
    )]
    pub minter_long_ata: Box<Account<'info, TokenAccount>>,

    /// Minter's SHORT token account (receives minted short tokens)
    #[account(
        init_if_needed,
        payer = minter,
        associated_token::mint = short_mint,
        associated_token::authority = minter,
    )]
    pub minter_short_ata: Box<Account<'info, TokenAccount>>,

    /// Fee treasury token account (receives protocol fees)
    #[account(
        init_if_needed,
        payer = minter,
        associated_token::mint = collateral_mint,
        associated_token::authority = fee_treasury,
    )]
    pub treasury_collateral: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"long_mint", epoch.asset_key.as_ref(), &epoch_id.to_le_bytes()],
        bump,
        constraint = long_mint.key() == epoch.long_token_mint @ TppError::InvalidTokenType,
    )]
    pub long_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"short_mint", epoch.asset_key.as_ref(), &epoch_id.to_le_bytes()],
        bump,
        constraint = short_mint.key() == epoch.short_token_mint @ TppError::InvalidTokenType,
    )]
    pub short_mint: Box<Account<'info, Mint>>,

    pub collateral_mint: Box<Account<'info, Mint>>,

    /// CHECK: PDA used as authority for fee treasury
    #[account(seeds = [b"fee_treasury"], bump)]
    pub fee_treasury: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = minter,
        space = MinterState::SPACE,
        seeds = [b"minter_state", minter.key().as_ref()],
        bump,
    )]
    pub minter_state: Box<Account<'info, MinterState>>,

    #[account(seeds = [b"protocol_config"], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,

    /// CHECK: Validated in instruction logic
    pub oracle: UncheckedAccount<'info>,

    #[account(mut)]
    pub minter: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn mint_position_pair(
    ctx: Context<MintPositionPair>,
    epoch_id: u64,
    vault_index: u64,
    collateral_amount: u64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, TppError::ProtocolPaused);
    require!(collateral_amount > 0, TppError::ZeroCollateral);

    let epoch = &ctx.accounts.epoch;
    let clock = Clock::get()?;

    // Check epoch is still active
    require!(epoch.is_active, TppError::EpochExpired);
    require!(clock.unix_timestamp <= epoch.end_time, TppError::EpochExpired);

    // Read and validate oracle price (dispatches to Pyth on devnet, mock on localnet)
    let oracle_price = get_oracle_price(
        &ctx.accounts.oracle.to_account_info(),
        config.max_oracle_age_secs,
        &clock,
        config.oracle_conf_denominator,
    )?;
    let price = oracle_price.price_usd;
    require!(price > 0, TppError::InvalidOraclePrice);

    // Check price is within epoch's band
    require!(
        price >= epoch.price_band_lower && price <= epoch.price_band_upper,
        TppError::PriceOutsideBand
    );

    // Validate circuit breaker
    let vault = &ctx.accounts.vault;
    if vault.last_price > 0 {
        check_circuit_breaker(
            vault.last_price,
            vault.last_price_ts,
            price,
            clock.unix_timestamp,
            config.circuit_breaker_bps,
        )?;
    }

    // Calculate fee
    let fee = (collateral_amount as u128)
        .checked_mul(config.mint_fee_bps as u128)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(TppError::MathOverflow)? as u64;
    let net_collateral = collateral_amount
        .checked_sub(fee)
        .ok_or(TppError::MathOverflow)?;

    // Transfer fee to treasury
    if fee > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.minter_collateral.to_account_info(),
                    to: ctx.accounts.treasury_collateral.to_account_info(),
                    authority: ctx.accounts.minter.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    // Transfer net collateral to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.minter_collateral.to_account_info(),
                to: ctx.accounts.vault_collateral.to_account_info(),
                authority: ctx.accounts.minter.to_account_info(),
            },
        ),
        net_collateral,
    )?;

    // Mint LONG tokens (1:1 with net_collateral, adjusted for 6 decimals)
    let epoch_seeds = &[
        b"epoch",
        epoch.asset_key.as_ref(),
        &epoch_id.to_le_bytes(),
        &[epoch.bump],
    ];
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.long_mint.to_account_info(),
                to: ctx.accounts.minter_long_ata.to_account_info(),
                authority: ctx.accounts.epoch.to_account_info(),
            },
            &[epoch_seeds],
        ),
        net_collateral, // 1 long token unit = 1 collateral unit
    )?;

    // Mint SHORT tokens (same amount)
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.short_mint.to_account_info(),
                to: ctx.accounts.minter_short_ata.to_account_info(),
                authority: ctx.accounts.epoch.to_account_info(),
            },
            &[epoch_seeds],
        ),
        net_collateral,
    )?;

    // Initialize vault state
    let vault = &mut ctx.accounts.vault;
    vault.minter = ctx.accounts.minter.key();
    vault.epoch = ctx.accounts.epoch.key();
    vault.collateral_mint = ctx.accounts.collateral_mint.key();
    vault.collateral_amount = net_collateral;
    vault.entry_price = price;
    vault.long_tokens_minted = net_collateral;
    vault.short_tokens_minted = net_collateral;
    vault.depth = 0;
    vault.parent_vault = None;
    vault.is_liquidated = false;
    vault.created_at = clock.unix_timestamp;
    vault.last_price = price;
    vault.last_price_ts = clock.unix_timestamp;
    vault.index = vault_index;
    vault.bump = ctx.bumps.vault;

    // Update minter state
    let minter_state = &mut ctx.accounts.minter_state;
    minter_state.minter = ctx.accounts.minter.key();
    minter_state.vault_count = vault_index + 1;
    minter_state.bump = ctx.bumps.minter_state;

    // Update epoch stats
    let epoch = &mut ctx.accounts.epoch;
    epoch.total_collateral = epoch
        .total_collateral
        .checked_add(net_collateral)
        .ok_or(TppError::MathOverflow)?;
    epoch.long_token_supply = epoch
        .long_token_supply
        .checked_add(net_collateral)
        .ok_or(TppError::MathOverflow)?;
    epoch.short_token_supply = epoch
        .short_token_supply
        .checked_add(net_collateral)
        .ok_or(TppError::MathOverflow)?;

    // Update protocol fee counter
    let config = &mut ctx.accounts.config;
    config.total_fees_collected = config
        .total_fees_collected
        .checked_add(fee)
        .unwrap_or(config.total_fees_collected);

    emit!(PositionMinted {
        minter: ctx.accounts.minter.key(),
        vault: ctx.accounts.vault.key(),
        epoch_id,
        collateral_amount: net_collateral,
        entry_price: price,
        long_tokens: net_collateral,
        short_tokens: net_collateral,
        fee,
    });

    Ok(())
}

// ─── redeem_position ──────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(epoch_id: u64, vault_index: u64)]
pub struct RedeemPosition<'info> {
    #[account(
        mut,
        seeds = [b"epoch", epoch.asset_key.as_ref(), &epoch_id.to_le_bytes()],
        bump = epoch.bump,
    )]
    pub epoch: Box<Account<'info, Epoch>>,

    #[account(
        mut,
        seeds = [b"vault", epoch.key().as_ref(), vault.minter.as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump,
        constraint = !vault.is_liquidated @ TppError::AlreadyLiquidated,
    )]
    pub vault: Box<Account<'info, PositionVault>>,

    /// Token account holding the position tokens to burn
    #[account(
        mut,
        constraint = redeemer_position_ata.owner == redeemer.key() @ TppError::Unauthorized,
    )]
    pub redeemer_position_ata: Box<Account<'info, TokenAccount>>,

    /// Redeemer's collateral account (receives payout)
    #[account(
        mut,
        constraint = redeemer_collateral.owner == redeemer.key() @ TppError::Unauthorized,
        constraint = redeemer_collateral.mint == vault.collateral_mint @ TppError::InsufficientCollateral,
    )]
    pub redeemer_collateral: Box<Account<'info, TokenAccount>>,

    /// Vault's collateral account (source of payout)
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = vault,
    )]
    pub vault_collateral: Box<Account<'info, TokenAccount>>,

    /// Fee treasury collateral account
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = fee_treasury,
    )]
    pub treasury_collateral: Box<Account<'info, TokenAccount>>,

    /// The position token mint (either long or short)
    #[account(mut)]
    pub position_mint: Box<Account<'info, Mint>>,

    pub collateral_mint: Box<Account<'info, Mint>>,

    /// CHECK: PDA authority for fee treasury
    #[account(seeds = [b"fee_treasury"], bump)]
    pub fee_treasury: AccountInfo<'info>,

    #[account(seeds = [b"protocol_config"], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,

    /// CHECK: Validated in instruction logic
    pub oracle: UncheckedAccount<'info>,

    #[account(mut)]
    pub redeemer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn redeem_position(
    ctx: Context<RedeemPosition>,
    epoch_id: u64,
    vault_index: u64,
    token_type: TokenType,
    amount: u64,
) -> Result<()> {
    // NOTE: Redemption is allowed even when protocol is paused.
    // Users must always be able to exit.
    require!(amount > 0, TppError::ZeroTokenAmount);
    require!(
        ctx.accounts.redeemer_position_ata.amount >= amount,
        TppError::InsufficientTokenBalance
    );

    let config = &ctx.accounts.config;
    let vault = &ctx.accounts.vault;
    let epoch = &ctx.accounts.epoch;
    let clock = Clock::get()?;

    // Validate the token mint matches the requested type
    match token_type {
        TokenType::Long => {
            require!(
                ctx.accounts.position_mint.key() == epoch.long_token_mint,
                TppError::InvalidTokenType
            );
        }
        TokenType::Short => {
            require!(
                ctx.accounts.position_mint.key() == epoch.short_token_mint,
                TppError::InvalidTokenType
            );
        }
    }

    // Read oracle price (dispatches to Pyth on devnet, mock on localnet)
    let oracle_price = get_oracle_price(
        &ctx.accounts.oracle.to_account_info(),
        config.max_oracle_age_secs,
        &clock,
        config.oracle_conf_denominator,
    )?;
    let current_price = oracle_price.price_usd;
    require!(current_price > 0, TppError::InvalidOraclePrice);

    // Calculate intrinsic value of the tokens being redeemed
    // token_value = (amount / total_minted) * vault_value_for_this_side
    let intrinsic_per_token = match token_type {
        TokenType::Long => vault
            .long_value(current_price)
            .ok_or(TppError::MathOverflow)?,
        TokenType::Short => vault
            .short_value(current_price)
            .ok_or(TppError::MathOverflow)?,
    };

    // Scale by fraction: (amount * intrinsic_per_token) / total_minted
    let total_minted = match token_type {
        TokenType::Long => vault.long_tokens_minted,
        TokenType::Short => vault.short_tokens_minted,
    };
    require!(total_minted > 0, TppError::EmptyVault);

    let payout_gross = (amount as u128)
        .checked_mul(intrinsic_per_token as u128)
        .and_then(|v| v.checked_div(total_minted as u128))
        .ok_or(TppError::MathOverflow)? as u64;

    let fee = (payout_gross as u128)
        .checked_mul(config.redeem_fee_bps as u128)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(TppError::MathOverflow)? as u64;
    let payout_net = payout_gross.checked_sub(fee).ok_or(TppError::MathOverflow)?;

    require!(
        ctx.accounts.vault_collateral.amount >= payout_gross,
        TppError::EmptyVault
    );

    // Burn the position tokens
    let epoch_key = epoch.key();
    let minter_key = vault.minter;
    let vault_bump = vault.bump;
    let vault_index_bytes = vault_index.to_le_bytes();
    let vault_seeds: &[&[u8]] = &[
        b"vault",
        epoch_key.as_ref(),
        minter_key.as_ref(),
        &vault_index_bytes,
        &[vault_bump],
    ];
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.position_mint.to_account_info(),
                from: ctx.accounts.redeemer_position_ata.to_account_info(),
                authority: ctx.accounts.redeemer.to_account_info(),
            },
        ),
        amount,
    )?;

    // Transfer fee to treasury
    if fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_collateral.to_account_info(),
                    to: ctx.accounts.treasury_collateral.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[vault_seeds],
            ),
            fee,
        )?;
    }

    // Transfer net payout to redeemer
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_collateral.to_account_info(),
                to: ctx.accounts.redeemer_collateral.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &[vault_seeds],
        ),
        payout_net,
    )?;

    // Update protocol fee counter
    let config = &mut ctx.accounts.config;
    config.total_fees_collected = config
        .total_fees_collected
        .checked_add(fee)
        .unwrap_or(config.total_fees_collected);

    emit!(PositionRedeemed {
        redeemer: ctx.accounts.redeemer.key(),
        vault: ctx.accounts.vault.key(),
        token_type,
        amount,
        payout_gross,
        payout_net,
        fee,
        current_price,
    });

    Ok(())
}

// ─── liquidate ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(epoch_id: u64, vault_index: u64, vault_minter: Pubkey)]
pub struct Liquidate<'info> {
    #[account(
        seeds = [b"epoch", epoch.asset_key.as_ref(), &epoch_id.to_le_bytes()],
        bump = epoch.bump,
    )]
    pub epoch: Box<Account<'info, Epoch>>,

    #[account(
        mut,
        seeds = [b"vault", epoch.key().as_ref(), vault_minter.as_ref(), &vault_index.to_le_bytes()],
        bump = vault.bump,
        constraint = !vault.is_liquidated @ TppError::AlreadyLiquidated,
    )]
    pub vault: Box<Account<'info, PositionVault>>,

    /// Vault's collateral ATA (source of collateral)
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = vault,
    )]
    pub vault_collateral: Box<Account<'info, TokenAccount>>,

    /// Liquidator receives their reward into this account
    #[account(
        mut,
        constraint = liquidator_collateral.owner == liquidator.key() @ TppError::Unauthorized,
        constraint = liquidator_collateral.mint == collateral_mint.key() @ TppError::InsufficientCollateral,
    )]
    pub liquidator_collateral: Box<Account<'info, TokenAccount>>,

    /// Remaining collateral goes to treasury after reward
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = fee_treasury,
    )]
    pub treasury_collateral: Box<Account<'info, TokenAccount>>,

    pub collateral_mint: Box<Account<'info, Mint>>,

    /// CHECK: PDA authority for fee treasury
    #[account(seeds = [b"fee_treasury"], bump)]
    pub fee_treasury: AccountInfo<'info>,

    #[account(seeds = [b"protocol_config"], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,

    /// CHECK: Validated in instruction logic
    pub oracle: UncheckedAccount<'info>,

    /// The keeper/liquidator calling this instruction (permissionless)
    #[account(mut)]
    pub liquidator: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn liquidate(
    ctx: Context<Liquidate>,
    epoch_id: u64,
    vault_index: u64,
    vault_minter: Pubkey,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let vault = &ctx.accounts.vault;
    let clock = Clock::get()?;

    // Read oracle price (dispatches to Pyth on devnet, mock on localnet)
    let oracle_price = get_oracle_price(
        &ctx.accounts.oracle.to_account_info(),
        config.max_oracle_age_secs,
        &clock,
        config.oracle_conf_denominator,
    )?;
    let current_price = oracle_price.price_usd;
    require!(current_price > 0, TppError::InvalidOraclePrice);

    // Circuit breaker: don't liquidate if price moved too fast
    if vault.last_price > 0 {
        check_circuit_breaker(
            vault.last_price,
            vault.last_price_ts,
            current_price,
            clock.unix_timestamp,
            config.circuit_breaker_bps,
        )?;
    }

    // Check if vault is eligible for liquidation
    let is_eligible = vault.long_is_liquidatable(current_price)
        || vault.short_is_liquidatable(current_price);
    require!(is_eligible, TppError::NotEligibleForLiquidation);

    let remaining_collateral = ctx.accounts.vault_collateral.amount;
    require!(remaining_collateral > 0, TppError::EmptyVault);

    // Liquidator reward
    let reward = (remaining_collateral as u128)
        .checked_mul(config.liquidation_reward_bps as u128)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(TppError::MathOverflow)? as u64;

    let reward = reward.min(remaining_collateral);
    let to_treasury = remaining_collateral.saturating_sub(reward);

    let epoch_key = ctx.accounts.epoch.key();
    let vault_bump = vault.bump;
    let vault_index_bytes = vault_index.to_le_bytes();
    let vault_seeds: &[&[u8]] = &[
        b"vault",
        epoch_key.as_ref(),
        vault_minter.as_ref(),
        &vault_index_bytes,
        &[vault_bump],
    ];

    // Pay liquidator reward
    if reward > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_collateral.to_account_info(),
                    to: ctx.accounts.liquidator_collateral.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[vault_seeds],
            ),
            reward,
        )?;
    }

    // Remaining to treasury
    if to_treasury > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_collateral.to_account_info(),
                    to: ctx.accounts.treasury_collateral.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[vault_seeds],
            ),
            to_treasury,
        )?;
    }

    // Mark vault as liquidated
    let vault = &mut ctx.accounts.vault;
    vault.is_liquidated = true;

    emit!(VaultLiquidated {
        liquidator: ctx.accounts.liquidator.key(),
        vault: ctx.accounts.vault.key(),
        current_price,
        remaining_collateral,
        liquidator_reward: reward,
        to_treasury,
    });

    Ok(())
}

// ─── admin instructions ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SetProtocolPause<'info> {
    #[account(
        mut,
        seeds = [b"protocol_config"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ TppError::Unauthorized,
    )]
    pub config: Account<'info, ProtocolConfig>,
    pub admin: Signer<'info>,
}

pub fn set_protocol_pause(ctx: Context<SetProtocolPause>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    emit!(ProtocolPauseChanged { paused });
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateFees<'info> {
    #[account(
        mut,
        seeds = [b"protocol_config"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ TppError::Unauthorized,
    )]
    pub config: Account<'info, ProtocolConfig>,
    pub admin: Signer<'info>,
}

pub fn update_fees(
    ctx: Context<UpdateFees>,
    mint_fee_bps: u16,
    redeem_fee_bps: u16,
    recursive_fee_bps: u16,
) -> Result<()> {
    // Hard safety cap: fees cannot exceed 5%
    require!(mint_fee_bps <= 500, TppError::InvalidOraclePrice);
    require!(redeem_fee_bps <= 500, TppError::InvalidOraclePrice);
    require!(recursive_fee_bps <= 500, TppError::InvalidOraclePrice);

    let config = &mut ctx.accounts.config;
    config.mint_fee_bps = mint_fee_bps;
    config.redeem_fee_bps = redeem_fee_bps;
    config.recursive_fee_bps = recursive_fee_bps;

    emit!(FeesUpdated {
        mint_fee_bps,
        redeem_fee_bps,
        recursive_fee_bps,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(
        mut,
        seeds = [b"protocol_config"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ TppError::Unauthorized,
    )]
    pub config: Account<'info, ProtocolConfig>,
    pub admin: Signer<'info>,
    /// CHECK: New admin pubkey (validated by business logic)
    pub new_admin: UncheckedAccount<'info>,
}

pub fn transfer_admin(ctx: Context<TransferAdmin>) -> Result<()> {
    let new_admin = ctx.accounts.new_admin.key();
    // Prevent accidental lockout by transferring to system program
    require!(
        new_admin != System::id(),
        TppError::Unauthorized
    );
    ctx.accounts.config.admin = new_admin;
    emit!(AdminTransferred { new_admin });
    Ok(())
}

// ─── set_mock_oracle_price (mock-oracle feature only) ─────────────────────────
// This instruction ONLY exists when compiled with the `mock-oracle` feature.
// Production builds must use `--no-default-features` to exclude it.

#[cfg(feature = "mock-oracle")]
#[derive(Accounts)]
pub struct SetMockOraclePrice<'info> {
    /// CHECK: 16-byte mock oracle account, owned by this program.
    /// Create via SystemProgram.createAccount(owner=programId, space=16).
    #[account(mut, owner = crate::ID)]
    pub oracle: AccountInfo<'info>,
    /// Any signer can update the mock oracle in local tests.
    pub authority: Signer<'info>,
}

#[cfg(feature = "mock-oracle")]
pub fn set_mock_oracle_price(
    ctx: Context<SetMockOraclePrice>,
    price_usd: u64,
    timestamp: i64,
) -> Result<()> {
    require!(price_usd > 0, TppError::InvalidOraclePrice);
    let mut data = ctx.accounts.oracle.try_borrow_mut_data()?;
    require!(data.len() >= 16, TppError::InvalidOraclePrice);
    data[0..8].copy_from_slice(&price_usd.to_le_bytes());
    data[8..16].copy_from_slice(&timestamp.to_le_bytes());
    Ok(())
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct ProtocolInitialized {
    pub admin: Pubkey,
    pub mint_fee_bps: u16,
    pub max_recursive_depth: u8,
}

#[event]
pub struct EpochCreated {
    pub epoch_id: u64,
    pub asset_key: Pubkey,
    pub reference_price: u64,
    pub end_time: i64,
    pub long_mint: Pubkey,
    pub short_mint: Pubkey,
}

#[event]
pub struct PositionMinted {
    pub minter: Pubkey,
    pub vault: Pubkey,
    pub epoch_id: u64,
    pub collateral_amount: u64,
    pub entry_price: u64,
    pub long_tokens: u64,
    pub short_tokens: u64,
    pub fee: u64,
}

#[event]
pub struct PositionRedeemed {
    pub redeemer: Pubkey,
    pub vault: Pubkey,
    pub token_type: TokenType,
    pub amount: u64,
    pub payout_gross: u64,
    pub payout_net: u64,
    pub fee: u64,
    pub current_price: u64,
}

#[event]
pub struct VaultLiquidated {
    pub liquidator: Pubkey,
    pub vault: Pubkey,
    pub current_price: u64,
    pub remaining_collateral: u64,
    pub liquidator_reward: u64,
    pub to_treasury: u64,
}

#[event]
pub struct ProtocolPauseChanged {
    pub paused: bool,
}

#[event]
pub struct FeesUpdated {
    pub mint_fee_bps: u16,
    pub redeem_fee_bps: u16,
    pub recursive_fee_bps: u16,
}

#[event]
pub struct AdminTransferred {
    pub new_admin: Pubkey,
}

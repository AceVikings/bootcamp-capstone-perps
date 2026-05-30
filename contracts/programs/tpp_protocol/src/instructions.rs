use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer},
};
use std::str::FromStr;

use crate::errors::FractalError;
use crate::oracle;
use crate::state::*;

const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
const TICK_SIZE: i64 = 10_000_000; // $10.00 in micro-USD (6 decimals)

// ─── 1. initialize ───────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = ProtocolConfig::SPACE,
        seeds = [b"protocol_config"],
        bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    /// CHECK: PDA fee treasury — receives protocol fees
    #[account(seeds = [b"fee_treasury"], bump)]
    pub fee_treasury: AccountInfo<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(
    ctx: Context<Initialize>,
    fee_bps: u16,
    max_recursive_depth: u8,
    oracle_conf_denominator: u64,
    max_oracle_age_secs: u64,
    usdc_mint: Pubkey,
) -> Result<()> {
    require!(fee_bps <= 1000, FractalError::InvalidFeeParam);
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.paused = false;
    config.usdc_mint = usdc_mint;
    config.fee_bps = fee_bps;
    config.fee_treasury = ctx.accounts.fee_treasury.key();
    config.max_recursive_depth = max_recursive_depth;
    config.oracle_conf_denominator = oracle_conf_denominator;
    config.max_oracle_age_secs = max_oracle_age_secs;
    config.total_fees_collected = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}

// ─── 2. create_long_vault ────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(vault_id: u64)]
pub struct CreateLongVault<'info> {
    #[account(
        seeds = [b"protocol_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        init,
        payer = owner,
        space = OptionVault::SPACE,
        seeds = [b"option_vault", owner.key().as_ref(), &vault_id.to_le_bytes()],
        bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// wSOL mint: So11111111111111111111111111111111111111112
    pub collateral_mint: Box<Account<'info, Mint>>,

    /// Vault's collateral ATA — owned by vault PDA
    #[account(
        init,
        payer = owner,
        associated_token::mint = collateral_mint,
        associated_token::authority = vault,
    )]
    pub vault_collateral: Box<Account<'info, TokenAccount>>,

    /// Root option token mint — authority is vault PDA
    #[account(
        init,
        payer = owner,
        mint::decimals = 6,
        mint::authority = vault,
        seeds = [b"root_mint", vault.key().as_ref()],
        bump,
    )]
    pub root_mint: Box<Account<'info, Mint>>,

    /// Owner's wSOL token account (source of collateral)
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = owner,
    )]
    pub owner_collateral: Box<Account<'info, TokenAccount>>,

    /// Owner's root token ATA (receives minted root tokens)
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = root_mint,
        associated_token::authority = owner,
    )]
    pub owner_root_token: Box<Account<'info, TokenAccount>>,

    /// CHECK: Pyth PriceUpdateV2 or mock oracle account
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create_long_vault(
    ctx: Context<CreateLongVault>,
    vault_id: u64,
    asset_feed: Pubkey,
    amount: u64,
    expiry: i64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, FractalError::Paused);
    require!(amount > 0, FractalError::ZeroAmount);

    let clock = Clock::get()?;
    require!(expiry > clock.unix_timestamp, FractalError::InvalidExpiry);

    // Validate collateral is wSOL
    let wsol_key = Pubkey::from_str(WSOL_MINT).map_err(|_| FractalError::InvalidCollateralMint)?;
    require!(
        ctx.accounts.collateral_mint.key() == wsol_key,
        FractalError::InvalidCollateralMint
    );

    let config = &ctx.accounts.config;
    let feed_bytes = asset_feed.to_bytes();
    let oracle_price = oracle::get_oracle_price(
        &ctx.accounts.oracle_feed.to_account_info(),
        config.max_oracle_age_secs,
        &clock,
        config.oracle_conf_denominator,
        &feed_bytes,
    )?;
    let strike = oracle_price.price_usd as i64;

    // Transfer wSOL collateral from owner to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_collateral.to_account_info(),
                to: ctx.accounts.vault_collateral.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    // Initialise vault state
    let vault_bump = ctx.bumps.vault;
    {
        let vault = &mut ctx.accounts.vault;
        vault.vault_id = vault_id;
        vault.owner = ctx.accounts.owner.key();
        vault.vault_side = VaultSide::Long;
        vault.collateral_mint = ctx.accounts.collateral_mint.key();
        vault.collateral_amount = amount;
        vault.root_mint = ctx.accounts.root_mint.key();
        vault.asset_feed = asset_feed;
        vault.strike = strike;
        vault.expiry = expiry;
        vault.node_count = 0;
        vault.is_settled = false;
        vault.settlement_price = 0;
        vault.bump = vault_bump;
    }

    // Mint root tokens 1:1 with collateral
    let vault_id_bytes = vault_id.to_le_bytes();
    let owner_key = ctx.accounts.owner.key();
    let seeds: &[&[u8]] = &[
        b"option_vault",
        owner_key.as_ref(),
        vault_id_bytes.as_ref(),
        &[vault_bump],
    ];
    let signer = &[seeds];
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.root_mint.to_account_info(),
                to: ctx.accounts.owner_root_token.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    emit!(VaultCreatedEvent {
        vault_id,
        owner: ctx.accounts.owner.key(),
        vault_side: VaultSide::Long,
        collateral_amount: amount,
        strike,
        expiry,
        root_mint: ctx.accounts.root_mint.key(),
    });

    Ok(())
}

// ─── 3. create_short_vault ───────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(vault_id: u64)]
pub struct CreateShortVault<'info> {
    #[account(
        seeds = [b"protocol_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        init,
        payer = owner,
        space = OptionVault::SPACE,
        seeds = [b"option_vault", owner.key().as_ref(), &vault_id.to_le_bytes()],
        bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// USDC mint (must match config.usdc_mint)
    pub collateral_mint: Box<Account<'info, Mint>>,

    /// Vault's collateral ATA — owned by vault PDA
    #[account(
        init,
        payer = owner,
        associated_token::mint = collateral_mint,
        associated_token::authority = vault,
    )]
    pub vault_collateral: Box<Account<'info, TokenAccount>>,

    /// Root option token mint — authority is vault PDA
    #[account(
        init,
        payer = owner,
        mint::decimals = 6,
        mint::authority = vault,
        seeds = [b"root_mint", vault.key().as_ref()],
        bump,
    )]
    pub root_mint: Box<Account<'info, Mint>>,

    /// Owner's USDC token account (source of collateral)
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = owner,
    )]
    pub owner_collateral: Box<Account<'info, TokenAccount>>,

    /// Owner's root token ATA (receives minted root tokens)
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = root_mint,
        associated_token::authority = owner,
    )]
    pub owner_root_token: Box<Account<'info, TokenAccount>>,

    /// CHECK: Pyth PriceUpdateV2 or mock oracle account
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create_short_vault(
    ctx: Context<CreateShortVault>,
    vault_id: u64,
    asset_feed: Pubkey,
    amount: u64,
    expiry: i64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, FractalError::Paused);
    require!(amount > 0, FractalError::ZeroAmount);

    let clock = Clock::get()?;
    require!(expiry > clock.unix_timestamp, FractalError::InvalidExpiry);

    // Validate collateral is USDC
    require!(
        ctx.accounts.collateral_mint.key() == ctx.accounts.config.usdc_mint,
        FractalError::InvalidCollateralMint
    );

    let config = &ctx.accounts.config;
    let feed_bytes = asset_feed.to_bytes();
    let oracle_price = oracle::get_oracle_price(
        &ctx.accounts.oracle_feed.to_account_info(),
        config.max_oracle_age_secs,
        &clock,
        config.oracle_conf_denominator,
        &feed_bytes,
    )?;
    let strike = oracle_price.price_usd as i64;

    // Transfer USDC collateral from owner to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_collateral.to_account_info(),
                to: ctx.accounts.vault_collateral.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    // Initialise vault state
    let vault_bump = ctx.bumps.vault;
    {
        let vault = &mut ctx.accounts.vault;
        vault.vault_id = vault_id;
        vault.owner = ctx.accounts.owner.key();
        vault.vault_side = VaultSide::Short;
        vault.collateral_mint = ctx.accounts.collateral_mint.key();
        vault.collateral_amount = amount;
        vault.root_mint = ctx.accounts.root_mint.key();
        vault.asset_feed = asset_feed;
        vault.strike = strike;
        vault.expiry = expiry;
        vault.node_count = 0;
        vault.is_settled = false;
        vault.settlement_price = 0;
        vault.bump = vault_bump;
    }

    // Mint root tokens 1:1 with collateral
    let vault_id_bytes = vault_id.to_le_bytes();
    let owner_key = ctx.accounts.owner.key();
    let seeds: &[&[u8]] = &[
        b"option_vault",
        owner_key.as_ref(),
        vault_id_bytes.as_ref(),
        &[vault_bump],
    ];
    let signer = &[seeds];
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.root_mint.to_account_info(),
                to: ctx.accounts.owner_root_token.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    emit!(VaultCreatedEvent {
        vault_id,
        owner: ctx.accounts.owner.key(),
        vault_side: VaultSide::Short,
        collateral_amount: amount,
        strike,
        expiry,
        root_mint: ctx.accounts.root_mint.key(),
    });

    Ok(())
}




// ─── 4. split_option ─────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(vault_id: u64, node_id: u64)]
pub struct SplitOption<'info> {
    #[account(
        seeds = [b"protocol_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        mut,
        seeds = [b"option_vault", owner.key().as_ref(), &vault_id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        init,
        payer = owner,
        space = OptionNode::SPACE,
        seeds = [b"option_node", vault.key().as_ref(), &node_id.to_le_bytes()],
        bump,
    )]
    pub node: Box<Account<'info, OptionNode>>,

    /// The mint being burned (root_mint for depth-1, or a prior child mint).
    /// Must have vault PDA as mint_authority — validated in handler.
    #[account(mut)]
    pub parent_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = owner,
        mint::decimals = 6,
        mint::authority = vault,
        seeds = [b"long_mint", vault.key().as_ref(), &node_id.to_le_bytes()],
        bump,
    )]
    pub long_child_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = owner,
        mint::decimals = 6,
        mint::authority = vault,
        seeds = [b"short_mint", vault.key().as_ref(), &node_id.to_le_bytes()],
        bump,
    )]
    pub short_child_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = parent_mint,
        token::authority = owner,
    )]
    pub owner_parent_token: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = long_child_mint,
        associated_token::authority = owner,
    )]
    pub owner_long_token: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = short_child_mint,
        associated_token::authority = owner,
    )]
    pub owner_short_token: Box<Account<'info, TokenAccount>>,

    /// CHECK: Pyth PriceUpdateV2 or mock oracle account
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn split_option(
    ctx: Context<SplitOption>,
    vault_id: u64,
    node_id: u64,
    amount: u64,
    parent_strike: i64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, FractalError::Paused);
    require!(amount > 0, FractalError::ZeroAmount);
    require!(parent_strike > 0, FractalError::ZeroAmount);

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < ctx.accounts.vault.expiry,
        FractalError::VaultExpired
    );

    let config = &ctx.accounts.config;
    require!(
        ctx.accounts.vault.node_count < config.max_recursive_depth as u64,
        FractalError::MaxDepthExceeded
    );

    // Validate parent_mint authority is the vault PDA
    let vault_key = ctx.accounts.vault.key();
    match ctx.accounts.parent_mint.mint_authority {
        anchor_spl::token::spl_token::state::COption::Some(auth) if auth == vault_key => {}
        _ => return err!(FractalError::InvalidTokenMint),
    }

    // Read oracle price for backing computation
    let feed_bytes = ctx.accounts.vault.asset_feed.to_bytes();
    let oracle_price = oracle::get_oracle_price(
        &ctx.accounts.oracle_feed.to_account_info(),
        config.max_oracle_age_secs,
        &clock,
        config.oracle_conf_denominator,
        &feed_bytes,
    )?;
    let p_split = oracle_price.price_usd as i64;

    // Compute child strike (±TICK_SIZE from parent)
    let child_strike = if ctx.accounts.vault.vault_side == VaultSide::Long {
        parent_strike
            .checked_add(TICK_SIZE)
            .ok_or(FractalError::Overflow)?
    } else {
        parent_strike
            .checked_sub(TICK_SIZE)
            .ok_or(FractalError::Overflow)?
    };
    require!(child_strike > 0, FractalError::ZeroAmount);

    // Backing allocation (u128 intermediates to prevent overflow)
    let total = amount as u128;
    let p = p_split.max(1) as u128;
    let k = child_strike as u128;

    let (long_backing, short_backing): (u64, u64) =
        if ctx.accounts.vault.vault_side == VaultSide::Long {
            // CALL: max(P - K, 0) / P * total
            // FLOOR: total - CALL
            if p > k {
                let lb = ((p - k).checked_mul(total).ok_or(FractalError::Overflow)? / p) as u64;
                let sb = amount.checked_sub(lb).ok_or(FractalError::Overflow)?;
                (lb, sb)
            } else {
                (0u64, amount)
            }
        } else {
            // CAP: min(P, K) / K * total
            // PUT: max(K - P, 0) / K * total
            let kk = k.max(1);
            if k > p {
                let sb = ((k - p).checked_mul(total).ok_or(FractalError::Overflow)? / kk) as u64;
                let lb = amount.checked_sub(sb).ok_or(FractalError::Overflow)?;
                (lb, sb)
            } else {
                (amount, 0u64)
            }
        };

    // Burn parent tokens
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.parent_mint.to_account_info(),
                from: ctx.accounts.owner_parent_token.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    // Mint long + short child tokens using vault PDA signer
    let vault_bump = ctx.accounts.vault.bump;
    let vault_owner = ctx.accounts.vault.owner;
    let vault_id_bytes = vault_id.to_le_bytes();
    let seeds: &[&[u8]] = &[
        b"option_vault",
        vault_owner.as_ref(),
        vault_id_bytes.as_ref(),
        &[vault_bump],
    ];
    let signer = &[seeds];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.long_child_mint.to_account_info(),
                to: ctx.accounts.owner_long_token.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.short_child_mint.to_account_info(),
                to: ctx.accounts.owner_short_token.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    // Record the node
    let depth = (ctx.accounts.vault.node_count + 1) as u8;
    let long_key = ctx.accounts.long_child_mint.key();
    let short_key = ctx.accounts.short_child_mint.key();
    let parent_key = ctx.accounts.parent_mint.key();
    {
        let node = &mut ctx.accounts.node;
        node.node_id = node_id;
        node.root_vault = ctx.accounts.vault.key();
        node.root_id = vault_id;
        node.owner = ctx.accounts.owner.key();
        node.depth = depth;
        node.parent_node = None;
        node.vault_side = ctx.accounts.vault.vault_side;
        node.parent_mint = parent_key;
        node.long_child_mint = long_key;
        node.short_child_mint = short_key;
        node.long_backing = long_backing;
        node.short_backing = short_backing;
        node.parent_strike = parent_strike;
        node.child_strike = child_strike;
        node.creation_price = p_split;
        node.created_at = clock.unix_timestamp;
        node.is_active = true;
        node.bump = ctx.bumps.node;
    }
    ctx.accounts.vault.node_count = ctx
        .accounts
        .vault
        .node_count
        .checked_add(1)
        .ok_or(FractalError::Overflow)?;

    emit!(OptionSplitEvent {
        vault_id,
        node_id,
        depth,
        parent_strike,
        child_strike,
        long_child_mint: long_key,
        short_child_mint: short_key,
        long_backing,
        short_backing,
        creation_price: p_split,
    });

    Ok(())
}

// ─── 5. merge_option ─────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(vault_id: u64, node_id: u64)]
pub struct MergeOption<'info> {
    #[account(
        seeds = [b"protocol_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        seeds = [b"option_vault", owner.key().as_ref(), &vault_id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        mut,
        seeds = [b"option_node", vault.key().as_ref(), &node_id.to_le_bytes()],
        bump = node.bump,
        constraint = node.is_active @ FractalError::NodeInactive,
        constraint = node.root_vault == vault.key() @ FractalError::InvalidParentNode,
    )]
    pub node: Box<Account<'info, OptionNode>>,

    /// Parent mint to re-issue; validated against node.parent_mint in handler.
    #[account(mut)]
    pub parent_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = long_child_mint.key() == node.long_child_mint @ FractalError::InvalidTokenMint,
    )]
    pub long_child_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = short_child_mint.key() == node.short_child_mint @ FractalError::InvalidTokenMint,
    )]
    pub short_child_mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = parent_mint,
        associated_token::authority = owner,
    )]
    pub owner_parent_token: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = long_child_mint,
        token::authority = owner,
    )]
    pub owner_long_token: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = short_child_mint,
        token::authority = owner,
    )]
    pub owner_short_token: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn merge_option(
    ctx: Context<MergeOption>,
    vault_id: u64,
    node_id: u64,
    amount: u64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, FractalError::Paused);
    require!(amount > 0, FractalError::ZeroAmount);

    // Validate parent_mint matches what was recorded at split time
    require!(
        ctx.accounts.parent_mint.key() == ctx.accounts.node.parent_mint,
        FractalError::InvalidTokenMint
    );

    // Burn long + short child tokens
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.long_child_mint.to_account_info(),
                from: ctx.accounts.owner_long_token.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.short_child_mint.to_account_info(),
                from: ctx.accounts.owner_short_token.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    // Re-mint parent tokens using vault PDA signer
    let vault_bump = ctx.accounts.vault.bump;
    let vault_owner = ctx.accounts.vault.owner;
    let vault_id_bytes = vault_id.to_le_bytes();
    let seeds: &[&[u8]] = &[
        b"option_vault",
        vault_owner.as_ref(),
        vault_id_bytes.as_ref(),
        &[vault_bump],
    ];
    let signer = &[seeds];
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.parent_mint.to_account_info(),
                to: ctx.accounts.owner_parent_token.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    emit!(OptionMergedEvent { vault_id, node_id });

    Ok(())
}

// ─── 6. settle_option ────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(vault_id: u64)]
pub struct SettleOption<'info> {
    #[account(
        mut,
        seeds = [b"protocol_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    /// CHECK: vault creator — used in PDA derivation; must match vault.owner
    pub vault_creator: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"option_vault", vault_creator.key().as_ref(), &vault_id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// CHECK: OptionNode PDA or System Program ID when redeeming root tokens
    pub node: UncheckedAccount<'info>,

    /// CHECK: oracle — only read if settlement_price not yet locked
    pub oracle_feed: UncheckedAccount<'info>,

    /// The option token mint being burned (root mint or a child mint)
    #[account(mut)]
    pub token_mint: Box<Account<'info, Mint>>,

    /// Collateral mint (wSOL or USDC) — must match vault.collateral_mint
    pub collateral_mint: Box<Account<'info, Mint>>,

    /// Vault's collateral ATA (source of payout)
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = vault,
    )]
    pub vault_collateral: Box<Account<'info, TokenAccount>>,

    /// Owner's token account (burn from here)
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = owner,
    )]
    pub owner_token_account: Box<Account<'info, TokenAccount>>,

    /// Owner's collateral ATA (receives payout)
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = collateral_mint,
        associated_token::authority = owner,
    )]
    pub owner_collateral: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA fee treasury
    #[account(seeds = [b"fee_treasury"], bump)]
    pub fee_treasury: AccountInfo<'info>,

    /// Fee treasury's collateral ATA
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = collateral_mint,
        associated_token::authority = fee_treasury,
    )]
    pub fee_treasury_collateral: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn settle_option(
    ctx: Context<SettleOption>,
    vault_id: u64,
    node_id: u64,
    amount: u64,
    is_long_child: bool,
) -> Result<()> {
    require!(amount > 0, FractalError::ZeroAmount);

    // Validate collateral mint
    require!(
        ctx.accounts.collateral_mint.key() == ctx.accounts.vault.collateral_mint,
        FractalError::InvalidCollateralMint
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= ctx.accounts.vault.expiry,
        FractalError::NotExpired
    );

    // Lock settlement price on first call
    if ctx.accounts.vault.settlement_price == 0 {
        let config = &ctx.accounts.config;
        let feed_bytes = ctx.accounts.vault.asset_feed.to_bytes();
        let oracle_price = oracle::get_oracle_price(
            &ctx.accounts.oracle_feed.to_account_info(),
            config.max_oracle_age_secs,
            &clock,
            config.oracle_conf_denominator,
            &feed_bytes,
        )?;
        ctx.accounts.vault.settlement_price = oracle_price.price_usd as i64;
        ctx.accounts.vault.is_settled = true;
    }

    let p_t = ctx.accounts.vault.settlement_price;
    require!(p_t > 0, FractalError::InvalidOraclePrice);

    // Resolve node data when node_id != 0
    let child_strike: i64 = if node_id == 0 {
        0i64
    } else {
        let (expected_pda, _) = Pubkey::find_program_address(
            &[
                b"option_node",
                ctx.accounts.vault.to_account_info().key.as_ref(),
                &node_id.to_le_bytes(),
            ],
            ctx.program_id,
        );
        require!(
            ctx.accounts.node.key() == expected_pda,
            FractalError::NodeInactive
        );
        let data = ctx.accounts.node.try_borrow_data()?;
        let node = OptionNode::try_deserialize(&mut data.as_ref())?;
        require!(node.is_active, FractalError::NodeInactive);
        node.child_strike
    };

    // Compute payout
    let total = amount as u128;
    let payout: u64 = if node_id == 0 {
        // Root token: 1:1 collateral return
        amount
    } else {
        let p = p_t as u128;
        let k = child_strike.max(1) as u128;

        if ctx.accounts.vault.vault_side == VaultSide::Long {
            if is_long_child {
                // CALL: max(P_T - K, 0) / P_T * total
                if p > k {
                    ((p - k).checked_mul(total).ok_or(FractalError::Overflow)? / p) as u64
                } else {
                    0u64
                }
            } else {
                // FLOOR: min(P_T, K) / P_T * total
                let floor = (p_t.min(child_strike)).max(0) as u128;
                (floor.checked_mul(total).ok_or(FractalError::Overflow)? / p.max(1)) as u64
            }
        } else {
            if !is_long_child {
                // PUT: max(K - P_T, 0) / K * total
                if k > p {
                    ((k - p).checked_mul(total).ok_or(FractalError::Overflow)? / k) as u64
                } else {
                    0u64
                }
            } else {
                // CAP: min(P_T, K) / K * total
                let cap = (p_t.min(child_strike)).max(0) as u128;
                (cap.checked_mul(total).ok_or(FractalError::Overflow)? / k) as u64
            }
        }
    };

    // Protocol fee
    let fee = (payout as u128)
        .checked_mul(ctx.accounts.config.fee_bps as u128)
        .ok_or(FractalError::Overflow)?
        / 10_000u128;
    let fee = fee as u64;
    let net_payout = payout.checked_sub(fee).ok_or(FractalError::Overflow)?;

    // Burn option tokens
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.token_mint.to_account_info(),
                from: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    let vault_bump = ctx.accounts.vault.bump;
    let vault_owner = ctx.accounts.vault.owner;
    let vault_id_bytes = vault_id.to_le_bytes();
    let seeds: &[&[u8]] = &[
        b"option_vault",
        vault_owner.as_ref(),
        vault_id_bytes.as_ref(),
        &[vault_bump],
    ];
    let signer = &[seeds];

    // Transfer payout to owner
    if net_payout > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_collateral.to_account_info(),
                    to: ctx.accounts.owner_collateral.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            net_payout,
        )?;
    }

    // Transfer fee to treasury
    if fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_collateral.to_account_info(),
                    to: ctx.accounts.fee_treasury_collateral.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            fee,
        )?;
        ctx.accounts.config.total_fees_collected =
            ctx.accounts.config.total_fees_collected.saturating_add(fee);
    }

    emit!(OptionSettledEvent {
        vault_id,
        settlement_price: p_t,
        settler: ctx.accounts.owner.key(),
        payout: net_payout,
        fee,
    });

    Ok(())
}

// ─── 7. set_mock_oracle_price (test / localnet only) ─────────────────────────

#[derive(Accounts)]
pub struct SetMockOraclePrice<'info> {
    /// CHECK: 16-byte mock oracle account owned by this program
    #[account(mut, owner = crate::ID)]
    pub oracle: AccountInfo<'info>,
    pub authority: Signer<'info>,
}

pub fn set_mock_oracle_price(
    ctx: Context<SetMockOraclePrice>,
    price_usd: u64,
    timestamp: i64,
) -> Result<()> {
    let mut data = ctx.accounts.oracle.try_borrow_mut_data()?;
    require!(data.len() >= 16, FractalError::InvalidOraclePrice);
    data[0..8].copy_from_slice(&price_usd.to_le_bytes());
    data[8..16].copy_from_slice(&timestamp.to_le_bytes());
    Ok(())
}
    ctx: Context<SplitClaim>,
    vault_id: u64,
    node_id: u64,
    amount: u64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, FractalError::ProtocolPaused);
    require!(amount > 0, FractalError::ZeroAmount);

    let config = &ctx.accounts.config;
    let root_vault = &ctx.accounts.root_vault;
    let source_mint_key = ctx.accounts.source_mint.key();
    let clock = Clock::get()?;

    let source_depth: u8;
    let parent_mint_key: Pubkey = source_mint_key;

    if ctx.accounts.parent_account.key() == ctx.accounts.root_vault.key() {
        require!(
            source_mint_key == root_vault.long_mint
                || source_mint_key == root_vault.short_mint,
            FractalError::InvalidClaimDepth
        );
        source_depth = 1;
    } else {
        let parent_data = ctx.accounts.parent_account.try_borrow_data()?;
        require!(parent_data.len() > 8, FractalError::InvalidParentNode);
        let parent_node = ClaimNode::try_deserialize(&mut &parent_data[..])
            .map_err(|_| error!(FractalError::InvalidParentNode))?;
        require!(
            parent_node.root_vault == root_vault.key(),
            FractalError::InvalidParentNode
        );
        require!(parent_node.is_active, FractalError::ClaimNodeInactive);
        require!(
            source_mint_key == parent_node.left_child_mint
                || source_mint_key == parent_node.right_child_mint,
            FractalError::InvalidClaimDepth
        );
        source_depth = parent_node
            .depth
            .checked_add(1)
            .ok_or(FractalError::MathOverflow)?;
    }

    require!(
        source_depth < config.max_recursive_depth,
        FractalError::MaxDepthReached
    );

    let feed_bytes = root_vault.asset_feed.to_bytes();
    let oracle_price = get_oracle_price(
        &ctx.accounts.oracle.to_account_info(),
        config.max_oracle_age_secs,
        &clock,
        config.oracle_conf_denominator,
        &feed_bytes,
    )?;

    let fee = (amount as u128)
        .checked_mul(config.split_fee_bps as u128)
        .ok_or(FractalError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(FractalError::MathOverflow)? as u64;
    let net = amount.checked_sub(fee).ok_or(FractalError::MathOverflow)?;
    let left_amount = net / 2;
    let right_amount = net - left_amount;

    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.source_mint.to_account_info(),
                from: ctx.accounts.caller_source_ata.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        ),
        amount,
    )?;

    let vault_seeds: &[&[u8]] = &[
        b"root_vault",
        root_vault.owner.as_ref(),
        &vault_id.to_le_bytes(),
        &[root_vault.bump],
    ];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.left_child_mint.to_account_info(),
                to: ctx.accounts.caller_left_ata.to_account_info(),
                authority: ctx.accounts.root_vault.to_account_info(),
            },
            &[vault_seeds],
        ),
        left_amount,
    )?;

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.right_child_mint.to_account_info(),
                to: ctx.accounts.caller_right_ata.to_account_info(),
                authority: ctx.accounts.root_vault.to_account_info(),
            },
            &[vault_seeds],
        ),
        right_amount,
    )?;

    let rv = &mut ctx.accounts.root_vault;
    rv.node_count = rv
        .node_count
        .checked_add(1)
        .ok_or(FractalError::MathOverflow)?;

    let claim_node = &mut ctx.accounts.claim_node;
    claim_node.node_id = node_id;
    claim_node.root_vault = ctx.accounts.root_vault.key();
    claim_node.owner = ctx.accounts.caller.key();
    claim_node.depth = source_depth + 1;
    claim_node.parent_mint = parent_mint_key;
    claim_node.left_child_mint = ctx.accounts.left_child_mint.key();
    claim_node.right_child_mint = ctx.accounts.right_child_mint.key();
    claim_node.creation_price = oracle_price.price_usd;
    claim_node.created_at = clock.unix_timestamp;
    claim_node.is_active = true;
    claim_node.bump = ctx.bumps.claim_node;

    emit!(SplitClaimEvent {
        node_pubkey: claim_node.key(),
        root_vault: claim_node.root_vault,
        owner: claim_node.owner,
        source_mint: parent_mint_key,
        left_child_mint: claim_node.left_child_mint,
        right_child_mint: claim_node.right_child_mint,
        depth: claim_node.depth,
        amount_burned: amount,
        left_minted: left_amount,
        right_minted: right_amount,
        creation_price: oracle_price.price_usd,
        created_at: clock.unix_timestamp,
    });

    Ok(())
}

// ─── 4. merge_claims ─────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(vault_id: u64, amount: u64)]
pub struct MergeClaims<'info> {
    #[account(
        seeds = [b"protocol_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        seeds = [b"root_vault", root_vault.owner.as_ref(), &vault_id.to_le_bytes()],
        bump = root_vault.bump,
    )]
    pub root_vault: Box<Account<'info, RootVault>>,

    #[account(
        mut,
        seeds = [b"claim_node", root_vault.key().as_ref(), &claim_node.node_id.to_le_bytes()],
        bump = claim_node.bump,
        constraint = claim_node.root_vault == root_vault.key() @ FractalError::InvalidParentNode,
        constraint = claim_node.is_active @ FractalError::ClaimNodeInactive,
    )]
    pub claim_node: Box<Account<'info, ClaimNode>>,

    #[account(
        mut,
        constraint = parent_mint.key() == claim_node.parent_mint @ FractalError::InvalidTokenMint,
    )]
    pub parent_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = left_child_mint.key() == claim_node.left_child_mint @ FractalError::InvalidTokenMint,
    )]
    pub left_child_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = right_child_mint.key() == claim_node.right_child_mint @ FractalError::InvalidTokenMint,
    )]
    pub right_child_mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = parent_mint,
        associated_token::authority = caller,
    )]
    pub caller_parent_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = left_child_mint,
        token::authority = caller,
    )]
    pub caller_left_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = right_child_mint,
        token::authority = caller,
    )]
    pub caller_right_ata: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub caller: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn merge_claims(
    ctx: Context<MergeClaims>,
    vault_id: u64,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, FractalError::ZeroAmount);

    let config = &ctx.accounts.config;
    let root_vault = &ctx.accounts.root_vault;

    let fee = (amount as u128)
        .checked_mul(config.merge_fee_bps as u128)
        .ok_or(FractalError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(FractalError::MathOverflow)? as u64;

    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.left_child_mint.to_account_info(),
                from: ctx.accounts.caller_left_ata.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        ),
        amount,
    )?;
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.right_child_mint.to_account_info(),
                from: ctx.accounts.caller_right_ata.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        ),
        amount,
    )?;

    let net_parent = amount.checked_sub(fee).ok_or(FractalError::MathOverflow)?;

    let vault_seeds: &[&[u8]] = &[
        b"root_vault",
        root_vault.owner.as_ref(),
        &vault_id.to_le_bytes(),
        &[root_vault.bump],
    ];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.parent_mint.to_account_info(),
                to: ctx.accounts.caller_parent_ata.to_account_info(),
                authority: ctx.accounts.root_vault.to_account_info(),
            },
            &[vault_seeds],
        ),
        net_parent,
    )?;

    // Re-load supply after CPI to check if children are fully drained
    ctx.accounts.left_child_mint.reload()?;
    ctx.accounts.right_child_mint.reload()?;
    let left_supply = ctx.accounts.left_child_mint.supply;
    let right_supply = ctx.accounts.right_child_mint.supply;
    if left_supply == 0 && right_supply == 0 {
        ctx.accounts.claim_node.is_active = false;
    }

    let clock = Clock::get()?;
    emit!(MergeClaimsEvent {
        node_pubkey: ctx.accounts.claim_node.key(),
        root_vault: ctx.accounts.root_vault.key(),
        caller: ctx.accounts.caller.key(),
        amount_burned: amount,
        parent_minted: net_parent,
        fee,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── 5. redeem_root ──────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(vault_id: u64, amount: u64)]
pub struct RedeemRoot<'info> {
    #[account(
        mut,
        seeds = [b"protocol_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        mut,
        seeds = [b"root_vault", root_vault.owner.as_ref(), &vault_id.to_le_bytes()],
        bump = root_vault.bump,
        constraint = root_vault.is_active @ FractalError::VaultNotActive,
    )]
    pub root_vault: Box<Account<'info, RootVault>>,

    #[account(
        mut,
        seeds = [b"long_mint", root_vault.key().as_ref()],
        bump,
        constraint = long_mint.key() == root_vault.long_mint @ FractalError::InvalidTokenMint,
    )]
    pub long_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"short_mint", root_vault.key().as_ref()],
        bump,
        constraint = short_mint.key() == root_vault.short_mint @ FractalError::InvalidTokenMint,
    )]
    pub short_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = long_mint,
        token::authority = caller,
    )]
    pub caller_long_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = short_mint,
        token::authority = caller,
    )]
    pub caller_short_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = caller,
    )]
    pub caller_collateral_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = root_vault,
    )]
    pub vault_collateral_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = collateral_mint,
        associated_token::authority = fee_treasury,
    )]
    pub treasury_collateral_ata: Box<Account<'info, TokenAccount>>,

    pub collateral_mint: Box<Account<'info, Mint>>,

    /// CHECK: PDA fee treasury
    #[account(seeds = [b"fee_treasury"], bump)]
    pub fee_treasury: AccountInfo<'info>,

    #[account(mut)]
    pub caller: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn redeem_root(
    ctx: Context<RedeemRoot>,
    vault_id: u64,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, FractalError::ZeroAmount);

    let long_supply = ctx.accounts.long_mint.supply;
    require!(long_supply > 0, FractalError::VaultEmpty);
    require!(amount <= long_supply, FractalError::InsufficientTokenBalance);

    let root_vault = &ctx.accounts.root_vault;
    let config = &ctx.accounts.config;

    let redemption_amount = (root_vault.collateral_amount as u128)
        .checked_mul(amount as u128)
        .ok_or(FractalError::MathOverflow)?
        .checked_div(long_supply as u128)
        .ok_or(FractalError::MathOverflow)? as u64;

    let fee = (redemption_amount as u128)
        .checked_mul(config.redeem_fee_bps as u128)
        .ok_or(FractalError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(FractalError::MathOverflow)? as u64;

    let payout = redemption_amount
        .checked_sub(fee)
        .ok_or(FractalError::MathOverflow)?;

    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.long_mint.to_account_info(),
                from: ctx.accounts.caller_long_ata.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        ),
        amount,
    )?;
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.short_mint.to_account_info(),
                from: ctx.accounts.caller_short_ata.to_account_info(),
                authority: ctx.accounts.caller.to_account_info(),
            },
        ),
        amount,
    )?;

    let vault_seeds: &[&[u8]] = &[
        b"root_vault",
        root_vault.owner.as_ref(),
        &vault_id.to_le_bytes(),
        &[root_vault.bump],
    ];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_collateral_ata.to_account_info(),
                to: ctx.accounts.caller_collateral_ata.to_account_info(),
                authority: ctx.accounts.root_vault.to_account_info(),
            },
            &[vault_seeds],
        ),
        payout,
    )?;

    if fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_collateral_ata.to_account_info(),
                    to: ctx.accounts.treasury_collateral_ata.to_account_info(),
                    authority: ctx.accounts.root_vault.to_account_info(),
                },
                &[vault_seeds],
            ),
            fee,
        )?;
    }

    let rv = &mut ctx.accounts.root_vault;
    rv.collateral_amount = rv
        .collateral_amount
        .checked_sub(redemption_amount)
        .ok_or(FractalError::MathOverflow)?;
    if rv.collateral_amount == 0 {
        rv.is_active = false;
    }

    let cfg = &mut ctx.accounts.config;
    cfg.total_fees_collected = cfg.total_fees_collected.saturating_add(fee);

    let clock = Clock::get()?;
    emit!(RedeemEvent {
        root_vault: ctx.accounts.root_vault.key(),
        caller: ctx.accounts.caller.key(),
        amount_burned: amount,
        payout,
        fee,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── 6. settle_trade ─────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(buyer_order: SignedOrder, seller_order: SignedOrder)]
pub struct SettleTrade<'info> {
    #[account(
        mut,
        seeds = [b"protocol_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        init,
        payer = buyer,
        space = NonceLedger::SPACE,
        seeds = [b"nonce", buyer_order.trader.as_ref(), &buyer_order.nonce.to_le_bytes()],
        bump,
    )]
    pub buyer_nonce_ledger: Box<Account<'info, NonceLedger>>,

    #[account(
        init,
        payer = buyer,
        space = NonceLedger::SPACE,
        seeds = [b"nonce", seller_order.trader.as_ref(), &seller_order.nonce.to_le_bytes()],
        bump,
    )]
    pub seller_nonce_ledger: Box<Account<'info, NonceLedger>>,

    pub token_mint: Box<Account<'info, Mint>>,

    #[account(mut, token::mint = token_mint)]
    pub seller_token_ata: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = token_mint)]
    pub buyer_token_ata: Box<Account<'info, TokenAccount>>,

    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(mut, token::mint = collateral_mint)]
    pub buyer_collateral_ata: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = collateral_mint)]
    pub seller_collateral_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = collateral_mint,
        associated_token::authority = fee_treasury,
    )]
    pub treasury_collateral_ata: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA fee treasury
    #[account(seeds = [b"fee_treasury"], bump)]
    pub fee_treasury: AccountInfo<'info>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub seller: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn settle_trade(
    ctx: Context<SettleTrade>,
    buyer_order: SignedOrder,
    seller_order: SignedOrder,
) -> Result<()> {
    let clock = Clock::get()?;
    let config = &ctx.accounts.config;

    require!(buyer_order.side == 0, FractalError::InvalidOrderSide);
    require!(seller_order.side == 1, FractalError::InvalidOrderSide);
    require!(
        buyer_order.trader != seller_order.trader,
        FractalError::SelfTrade
    );
    require!(
        buyer_order.token_mint == seller_order.token_mint,
        FractalError::MintMismatch
    );
    require!(
        ctx.accounts.token_mint.key() == buyer_order.token_mint,
        FractalError::MintMismatch
    );
    require!(
        buyer_order.expires_at >= clock.unix_timestamp,
        FractalError::OrderExpired
    );
    require!(
        seller_order.expires_at >= clock.unix_timestamp,
        FractalError::OrderExpired
    );
    require!(
        buyer_order.price >= seller_order.price,
        FractalError::OrdersDoNotCross
    );

    require!(
        ctx.accounts.seller_token_ata.owner == seller_order.trader,
        FractalError::SellerMismatch
    );
    require!(
        ctx.accounts.buyer_collateral_ata.owner == buyer_order.trader,
        FractalError::BuyerMismatch
    );
    require!(
        ctx.accounts.buyer.key() == buyer_order.trader,
        FractalError::BuyerMismatch
    );
    require!(
        ctx.accounts.seller.key() == seller_order.trader,
        FractalError::SellerMismatch
    );

    let settled_qty = buyer_order.quantity.min(seller_order.quantity);
    let total_usdc = (settled_qty as u128)
        .checked_mul(seller_order.price as u128)
        .ok_or(FractalError::MathOverflow)?
        .checked_div(1_000_000)
        .ok_or(FractalError::MathOverflow)? as u64;

    let fee = (total_usdc as u128)
        .checked_mul(config.trade_fee_bps as u128)
        .ok_or(FractalError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(FractalError::MathOverflow)? as u64;

    let seller_receives = total_usdc
        .checked_sub(fee)
        .ok_or(FractalError::MathOverflow)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.seller_token_ata.to_account_info(),
                to: ctx.accounts.buyer_token_ata.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        settled_qty,
    )?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.buyer_collateral_ata.to_account_info(),
                to: ctx.accounts.seller_collateral_ata.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        seller_receives,
    )?;

    if fee > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_collateral_ata.to_account_info(),
                    to: ctx.accounts.treasury_collateral_ata.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    let buyer_ledger = &mut ctx.accounts.buyer_nonce_ledger;
    buyer_ledger.trader = buyer_order.trader;
    buyer_ledger.nonce = buyer_order.nonce;
    buyer_ledger.bump = ctx.bumps.buyer_nonce_ledger;

    let seller_ledger = &mut ctx.accounts.seller_nonce_ledger;
    seller_ledger.trader = seller_order.trader;
    seller_ledger.nonce = seller_order.nonce;
    seller_ledger.bump = ctx.bumps.seller_nonce_ledger;

    let cfg = &mut ctx.accounts.config;
    cfg.total_fees_collected = cfg.total_fees_collected.saturating_add(fee);

    emit!(TradeEvent {
        token_mint: buyer_order.token_mint,
        buyer: buyer_order.trader,
        seller: seller_order.trader,
        quantity: settled_qty,
        price: seller_order.price,
        fee,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── 7. set_protocol_pause ───────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SetProtocolPause<'info> {
    #[account(
        mut,
        seeds = [b"protocol_config"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ FractalError::Unauthorized,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,
    pub admin: Signer<'info>,
}

pub fn set_protocol_pause(ctx: Context<SetProtocolPause>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    Ok(())
}

// ─── 8. update_fees ──────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct UpdateFees<'info> {
    #[account(
        mut,
        seeds = [b"protocol_config"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ FractalError::Unauthorized,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,
    pub admin: Signer<'info>,
}

pub fn update_fees(
    ctx: Context<UpdateFees>,
    mint_fee_bps: u16,
    split_fee_bps: u16,
    merge_fee_bps: u16,
    redeem_fee_bps: u16,
    trade_fee_bps: u16,
) -> Result<()> {
    require!(mint_fee_bps <= 500, FractalError::InvalidFeeParam);
    require!(split_fee_bps <= 500, FractalError::InvalidFeeParam);
    require!(merge_fee_bps <= 500, FractalError::InvalidFeeParam);
    require!(redeem_fee_bps <= 500, FractalError::InvalidFeeParam);
    require!(trade_fee_bps <= 500, FractalError::InvalidFeeParam);
    let cfg = &mut ctx.accounts.config;
    cfg.mint_fee_bps = mint_fee_bps;
    cfg.split_fee_bps = split_fee_bps;
    cfg.merge_fee_bps = merge_fee_bps;
    cfg.redeem_fee_bps = redeem_fee_bps;
    cfg.trade_fee_bps = trade_fee_bps;
    Ok(())
}

// ─── 9. transfer_admin ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(
        mut,
        seeds = [b"protocol_config"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ FractalError::Unauthorized,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,
    pub admin: Signer<'info>,
}

pub fn transfer_admin(ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.admin = new_admin;
    Ok(())
}

// ─── Mock oracle helper (localnet / CI only) ──────────────────────────────────

#[cfg(feature = "mock-oracle")]
#[derive(Accounts)]
pub struct SetMockOraclePrice<'info> {
    /// CHECK: mock oracle account; created on-demand by this instruction
    #[account(mut)]
    pub oracle: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[cfg(feature = "mock-oracle")]
pub fn set_mock_oracle_price(
    ctx: Context<SetMockOraclePrice>,
    price_usd: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let oracle = &ctx.accounts.oracle;

    if oracle.data_is_empty() {
        let space: usize = 16;
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(space);
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::create_account(
                ctx.accounts.authority.key,
                oracle.key,
                lamports,
                space as u64,
                &crate::ID,
            ),
            &[
                ctx.accounts.authority.to_account_info(),
                oracle.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
    }

    let mut data = oracle.try_borrow_mut_data()?;
    data[0..8].copy_from_slice(&price_usd.to_le_bytes());
    data[8..16].copy_from_slice(&clock.unix_timestamp.to_le_bytes());
    Ok(())
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct CreateVaultEvent {
    pub root_vault: Pubkey,
    pub owner: Pubkey,
    pub long_mint: Pubkey,
    pub short_mint: Pubkey,
    pub collateral_amount: u64,
    pub creation_price: u64,
    pub asset_feed: Pubkey,
}

#[event]
pub struct SplitClaimEvent {
    pub node_pubkey: Pubkey,
    pub root_vault: Pubkey,
    pub owner: Pubkey,
    pub source_mint: Pubkey,
    pub left_child_mint: Pubkey,
    pub right_child_mint: Pubkey,
    pub depth: u8,
    pub amount_burned: u64,
    pub left_minted: u64,
    pub right_minted: u64,
    pub creation_price: u64,
    pub created_at: i64,
}

#[event]
pub struct MergeClaimsEvent {
    pub node_pubkey: Pubkey,
    pub root_vault: Pubkey,
    pub caller: Pubkey,
    pub amount_burned: u64,
    pub parent_minted: u64,
    pub fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct RedeemEvent {
    pub root_vault: Pubkey,
    pub caller: Pubkey,
    pub amount_burned: u64,
    pub payout: u64,
    pub fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct TradeEvent {
    pub token_mint: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub quantity: u64,
    pub price: u64,
    pub fee: u64,
    pub timestamp: i64,
}

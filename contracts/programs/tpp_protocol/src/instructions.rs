use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer},
};

use crate::errors::FractalError;
use crate::oracle::{self, OraclePrice};
use crate::state::*;

// ─── Oracle dispatch ─────────────────────────────────────────────────────────

fn get_oracle_price(
    oracle: &AccountInfo,
    max_age_secs: u64,
    clock: &Clock,
    conf_denominator: u64,
    feed_id: &[u8; 32],
) -> Result<OraclePrice> {
    #[cfg(feature = "pyth")]
    {
        return oracle::get_pyth_price(oracle, max_age_secs, clock, conf_denominator, feed_id);
    }
    #[cfg(not(feature = "pyth"))]
    {
        let _ = (conf_denominator, feed_id);
        return oracle::get_mock_price(oracle, max_age_secs, clock);
    }
}

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

    /// CHECK: PDA that receives USDC fees
    #[account(seeds = [b"fee_treasury"], bump)]
    pub fee_treasury: AccountInfo<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

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
    require!(mint_fee_bps <= 500, FractalError::InvalidFeeParam);
    require!(split_fee_bps <= 500, FractalError::InvalidFeeParam);
    require!(merge_fee_bps <= 500, FractalError::InvalidFeeParam);
    require!(redeem_fee_bps <= 500, FractalError::InvalidFeeParam);
    require!(trade_fee_bps <= 500, FractalError::InvalidFeeParam);

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.paused = false;
    config.mint_fee_bps = mint_fee_bps;
    config.split_fee_bps = split_fee_bps;
    config.merge_fee_bps = merge_fee_bps;
    config.redeem_fee_bps = redeem_fee_bps;
    config.trade_fee_bps = trade_fee_bps;
    config.max_recursive_depth = max_recursive_depth;
    config.oracle_conf_denominator = oracle_conf_denominator;
    config.max_oracle_age_secs = max_oracle_age_secs;
    config.fee_treasury = ctx.accounts.fee_treasury.key();
    config.total_fees_collected = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}

// ─── 2. create_root_vault ────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(vault_id: u64, asset_feed: Pubkey, collateral_amount: u64)]
pub struct CreateRootVault<'info> {
    #[account(
        mut,
        seeds = [b"protocol_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        init,
        payer = owner,
        space = RootVault::SPACE,
        seeds = [b"root_vault", owner.key().as_ref(), &vault_id.to_le_bytes()],
        bump,
    )]
    pub root_vault: Box<Account<'info, RootVault>>,

    #[account(
        init,
        payer = owner,
        mint::decimals = 6,
        mint::authority = root_vault,
        seeds = [b"long_mint", root_vault.key().as_ref()],
        bump,
    )]
    pub long_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = owner,
        mint::decimals = 6,
        mint::authority = root_vault,
        seeds = [b"short_mint", root_vault.key().as_ref()],
        bump,
    )]
    pub short_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = owner,
    )]
    pub owner_collateral_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = owner,
        associated_token::mint = collateral_mint,
        associated_token::authority = root_vault,
    )]
    pub vault_collateral_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = long_mint,
        associated_token::authority = owner,
    )]
    pub owner_long_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = short_mint,
        associated_token::authority = owner,
    )]
    pub owner_short_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = collateral_mint,
        associated_token::authority = fee_treasury,
    )]
    pub treasury_collateral_ata: Box<Account<'info, TokenAccount>>,

    pub collateral_mint: Box<Account<'info, Mint>>,

    /// CHECK: PDA fee treasury
    #[account(seeds = [b"fee_treasury"], bump)]
    pub fee_treasury: AccountInfo<'info>,

    /// CHECK: Pyth PriceUpdateV2 or mock oracle account
    pub oracle: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn create_root_vault(
    ctx: Context<CreateRootVault>,
    vault_id: u64,
    asset_feed: Pubkey,
    collateral_amount: u64,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, FractalError::ProtocolPaused);
    require!(collateral_amount > 0, FractalError::ZeroAmount);

    let config = &ctx.accounts.config;
    let clock = Clock::get()?;

    let feed_bytes = asset_feed.to_bytes();
    let oracle_price = get_oracle_price(
        &ctx.accounts.oracle.to_account_info(),
        config.max_oracle_age_secs,
        &clock,
        config.oracle_conf_denominator,
        &feed_bytes,
    )?;

    let fee = (collateral_amount as u128)
        .checked_mul(config.mint_fee_bps as u128)
        .ok_or(FractalError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(FractalError::MathOverflow)? as u64;

    let net_collateral = collateral_amount
        .checked_sub(fee)
        .ok_or(FractalError::MathOverflow)?;

    let long_amount = net_collateral / 2;
    let short_amount = net_collateral - long_amount;

    if fee > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.owner_collateral_ata.to_account_info(),
                    to: ctx.accounts.treasury_collateral_ata.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_collateral_ata.to_account_info(),
                to: ctx.accounts.vault_collateral_ata.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        net_collateral,
    )?;

    let vault_seeds: &[&[u8]] = &[
        b"root_vault",
        ctx.accounts.owner.key.as_ref(),
        &vault_id.to_le_bytes(),
        &[ctx.bumps.root_vault],
    ];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.long_mint.to_account_info(),
                to: ctx.accounts.owner_long_ata.to_account_info(),
                authority: ctx.accounts.root_vault.to_account_info(),
            },
            &[vault_seeds],
        ),
        long_amount,
    )?;

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.short_mint.to_account_info(),
                to: ctx.accounts.owner_short_ata.to_account_info(),
                authority: ctx.accounts.root_vault.to_account_info(),
            },
            &[vault_seeds],
        ),
        short_amount,
    )?;

    let root_vault = &mut ctx.accounts.root_vault;
    root_vault.vault_id = vault_id;
    root_vault.owner = ctx.accounts.owner.key();
    root_vault.collateral_mint = ctx.accounts.collateral_mint.key();
    root_vault.collateral_amount = net_collateral;
    root_vault.long_mint = ctx.accounts.long_mint.key();
    root_vault.short_mint = ctx.accounts.short_mint.key();
    root_vault.asset_feed = asset_feed;
    root_vault.creation_price = oracle_price.price_usd;
    root_vault.created_at = clock.unix_timestamp;
    root_vault.node_count = 0;
    root_vault.is_active = true;
    root_vault.bump = ctx.bumps.root_vault;

    let cfg = &mut ctx.accounts.config;
    cfg.total_fees_collected = cfg.total_fees_collected.saturating_add(fee);

    emit!(CreateVaultEvent {
        root_vault: root_vault.key(),
        owner: root_vault.owner,
        long_mint: root_vault.long_mint,
        short_mint: root_vault.short_mint,
        collateral_amount: net_collateral,
        creation_price: oracle_price.price_usd,
        asset_feed,
    });

    Ok(())
}

// ─── 3. split_claim ──────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(vault_id: u64, node_id: u64, amount: u64)]
pub struct SplitClaim<'info> {
    #[account(
        seeds = [b"protocol_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        mut,
        seeds = [b"root_vault", root_vault.owner.as_ref(), &vault_id.to_le_bytes()],
        bump = root_vault.bump,
    )]
    pub root_vault: Box<Account<'info, RootVault>>,

    #[account(
        init,
        payer = caller,
        space = ClaimNode::SPACE,
        seeds = [b"claim_node", root_vault.key().as_ref(), &node_id.to_le_bytes()],
        bump,
    )]
    pub claim_node: Box<Account<'info, ClaimNode>>,

    #[account(
        init,
        payer = caller,
        mint::decimals = 6,
        mint::authority = root_vault,
        seeds = [b"left_child", root_vault.key().as_ref(), &node_id.to_le_bytes()],
        bump,
    )]
    pub left_child_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = caller,
        mint::decimals = 6,
        mint::authority = root_vault,
        seeds = [b"right_child", root_vault.key().as_ref(), &node_id.to_le_bytes()],
        bump,
    )]
    pub right_child_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub source_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = source_mint,
        token::authority = caller,
    )]
    pub caller_source_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = left_child_mint,
        associated_token::authority = caller,
    )]
    pub caller_left_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = right_child_mint,
        associated_token::authority = caller,
    )]
    pub caller_right_ata: Box<Account<'info, TokenAccount>>,

    /// CHECK: root_vault.key() for depth-1 splits; ClaimNode PDA for depth-2+
    pub parent_account: UncheckedAccount<'info>,

    /// CHECK: Pyth PriceUpdateV2 or mock oracle
    pub oracle: UncheckedAccount<'info>,

    #[account(mut)]
    pub caller: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn split_claim(
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

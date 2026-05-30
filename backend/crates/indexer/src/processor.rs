//! Anchor event processor — TPP Options Protocol v2.
//!
//! Anchor emits events as base64-encoded log lines prefixed "Program data: ".
//! The first 8 bytes of the decoded buffer are the Anchor event discriminator
//! (SHA256("event:<EventName>")[..8]).  The rest is Borsh-serialised payload.
//!
//! Events handled:
//!   VaultCreatedEvent  → insert_option_vault
//!   OptionSplitEvent   → insert_option_node
//!   OptionMergedEvent  → deactivate_option_node
//!   OptionSettledEvent → mark_vault_settled

use anyhow::{bail, Context, Result};
use base64::Engine;
use borsh::BorshDeserialize;
use fractal_db::{
    models::{
        option_vault::NewOptionVault,
        option_node::NewOptionNode,
        trade::NewTrade,
    },
    Db,
};
use sha2::{Digest, Sha256};
use tracing::{debug, info};

// ─── Borsh event structs (mirror on-chain #[event] field order) ──────────────

#[derive(BorshDeserialize, Debug)]
struct VaultCreatedEventRaw {
    vault_pubkey: [u8; 32],
    vault_id: u64,
    owner: [u8; 32],
    vault_side: u8,  // 0 = LONG, 1 = SHORT
    collateral_mint: [u8; 32],
    collateral_amount: u64,
    root_mint: [u8; 32],
    asset_feed: [u8; 32],
    strike: u64,
    expiry: i64,
}

#[derive(BorshDeserialize, Debug)]
struct OptionSplitEventRaw {
    node_pubkey: [u8; 32],
    node_id: u64,
    vault_pubkey: [u8; 32],
    vault_id: u64,
    owner: [u8; 32],
    depth: u8,
    parent_node: [u8; 32],  // zero-bytes if no parent
    vault_side: u8,         // 0 = LONG, 1 = SHORT
    long_child_mint: [u8; 32],
    short_child_mint: [u8; 32],
    long_backing: u64,
    short_backing: u64,
    parent_strike: u64,
    child_strike: u64,
    creation_price: u64,
}

#[derive(BorshDeserialize, Debug)]
struct OptionMergedEventRaw {
    node_pubkey: [u8; 32],
    vault_pubkey: [u8; 32],
    owner: [u8; 32],
}

#[derive(BorshDeserialize, Debug)]
struct OptionSettledEventRaw {
    vault_pubkey: [u8; 32],
    owner: [u8; 32],
    settlement_price: u64,
    payout: u64,
}

/// Trade events are still emitted by the matching engine (off-chain).
#[derive(BorshDeserialize, Debug)]
struct TradeEventRaw {
    token_mint: [u8; 32],
    buyer: [u8; 32],
    seller: [u8; 32],
    price_usdc: u64,
    quantity: u64,
    tx_signature: [u8; 64],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn anchor_event_discriminator(event_name: &str) -> [u8; 8] {
    let mut hasher = Sha256::new();
    hasher.update(format!("event:{event_name}"));
    let hash = hasher.finalize();
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&hash[..8]);
    disc
}

fn pubkey_to_base58(bytes: &[u8; 32]) -> String {
    bs58::encode(bytes).into_string()
}

fn vault_side_str(side: u8) -> &'static str {
    if side == 0 { "LONG" } else { "SHORT" }
}

fn is_zero_pubkey(bytes: &[u8; 32]) -> bool {
    bytes.iter().all(|&b| b == 0)
}

// ─── Main dispatch ───────────────────────────────────────────────────────────

pub async fn handle_program_data(tx_sig: &str, data_b64: &str, pool: &Db) -> Result<()> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_b64)
        .context("base64 decode failed")?;

    if bytes.len() < 8 {
        bail!("event data too short ({} bytes)", bytes.len());
    }

    let disc: [u8; 8] = bytes[..8].try_into().unwrap();
    let payload = &bytes[8..];

    if disc == anchor_event_discriminator("VaultCreatedEvent") {
        handle_vault_created(tx_sig, payload, pool).await?;
    } else if disc == anchor_event_discriminator("OptionSplitEvent") {
        handle_option_split(tx_sig, payload, pool).await?;
    } else if disc == anchor_event_discriminator("OptionMergedEvent") {
        handle_option_merged(tx_sig, payload, pool).await?;
    } else if disc == anchor_event_discriminator("OptionSettledEvent") {
        handle_option_settled(tx_sig, payload, pool).await?;
    } else if disc == anchor_event_discriminator("TradeEvent") {
        handle_trade(tx_sig, payload, pool).await?;
    } else {
        debug!(tx_sig, "unknown event discriminator — skipping");
    }

    Ok(())
}

// ─── Per-event handlers ───────────────────────────────────────────────────────

async fn handle_vault_created(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let ev = VaultCreatedEventRaw::try_from_slice(payload)
        .context("borsh decode VaultCreatedEvent")?;

    let vault_pubkey  = pubkey_to_base58(&ev.vault_pubkey);
    let owner         = pubkey_to_base58(&ev.owner);
    let coll_mint     = pubkey_to_base58(&ev.collateral_mint);
    let root_mint     = pubkey_to_base58(&ev.root_mint);
    let asset_feed    = pubkey_to_base58(&ev.asset_feed);
    let side          = vault_side_str(ev.vault_side);

    info!(vault = %vault_pubkey, %owner, side, "VaultCreatedEvent");

    let new_vault = NewOptionVault {
        pubkey:            vault_pubkey.clone(),
        vault_id:          ev.vault_id as i64,
        owner_wallet:      owner.clone(),
        vault_side:        side.to_string(),
        collateral_mint:   coll_mint,
        collateral_amount: ev.collateral_amount as i64,
        root_mint,
        asset_feed,
        strike:            ev.strike as i64,
        expiry:            chrono::DateTime::from_timestamp(ev.expiry, 0)
                               .unwrap_or_default(),
        created_at:        chrono::Utc::now(),
    };

    fractal_db::queries::option_vaults::insert_option_vault(pool, &new_vault)
        .await
        .context("insert_option_vault")?;

    let notify = serde_json::json!({
        "type": "VAULT_CREATED",
        "vault_pubkey": vault_pubkey,
        "vault_id": ev.vault_id,
        "owner": owner,
        "vault_side": side,
        "strike": ev.strike,
        "expiry": ev.expiry,
        "timestamp": chrono::Utc::now().timestamp(),
    }).to_string();
    sqlx::query("SELECT pg_notify('fractal_events', $1)")
        .bind(&notify)
        .execute(pool)
        .await
        .context("pg_notify VaultCreated")?;

    insert_event(pool, tx_sig, "VaultCreatedEvent", &serde_json::json!({
        "vault_pubkey": vault_pubkey,
        "vault_id": ev.vault_id,
        "owner": owner,
        "vault_side": side,
        "collateral_amount": ev.collateral_amount,
        "strike": ev.strike,
        "expiry": ev.expiry,
    })).await
}

async fn handle_option_split(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let ev = OptionSplitEventRaw::try_from_slice(payload)
        .context("borsh decode OptionSplitEvent")?;

    let node_pubkey     = pubkey_to_base58(&ev.node_pubkey);
    let vault_pubkey    = pubkey_to_base58(&ev.vault_pubkey);
    let owner           = pubkey_to_base58(&ev.owner);
    let long_child_mint = pubkey_to_base58(&ev.long_child_mint);
    let short_child_mint= pubkey_to_base58(&ev.short_child_mint);
    let side            = vault_side_str(ev.vault_side);
    let parent_opt      = if ev.depth == 0 || is_zero_pubkey(&ev.parent_node) {
        None
    } else {
        Some(pubkey_to_base58(&ev.parent_node))
    };

    info!(node = %node_pubkey, %owner, side, depth = ev.depth, "OptionSplitEvent");

    let new_node = NewOptionNode {
        pubkey:           node_pubkey.clone(),
        node_id:          ev.node_id as i64,
        vault_pubkey:     vault_pubkey.clone(),
        vault_id:         ev.vault_id as i64,
        owner_wallet:     owner.clone(),
        depth:            ev.depth as i16,
        parent_node:      parent_opt,
        vault_side:       side.to_string(),
        long_child_mint:  long_child_mint.clone(),
        short_child_mint: short_child_mint.clone(),
        long_backing:     ev.long_backing as i64,
        short_backing:    ev.short_backing as i64,
        parent_strike:    ev.parent_strike as i64,
        child_strike:     ev.child_strike as i64,
        creation_price:   ev.creation_price as i64,
        created_at:       chrono::Utc::now(),
    };

    fractal_db::queries::option_nodes::insert_option_node(pool, &new_node)
        .await
        .context("insert_option_node")?;

    let notify = serde_json::json!({
        "type": "OPTION_SPLIT",
        "node_pubkey": node_pubkey,
        "vault_pubkey": vault_pubkey,
        "owner": owner,
        "depth": ev.depth,
        "vault_side": side,
        "long_child_mint": long_child_mint,
        "short_child_mint": short_child_mint,
        "parent_strike": ev.parent_strike,
        "child_strike": ev.child_strike,
        "creation_price": ev.creation_price,
        "timestamp": chrono::Utc::now().timestamp(),
    }).to_string();
    sqlx::query("SELECT pg_notify('fractal_events', $1)")
        .bind(&notify)
        .execute(pool)
        .await
        .context("pg_notify OptionSplit")?;

    insert_event(pool, tx_sig, "OptionSplitEvent", &serde_json::json!({
        "node_pubkey": node_pubkey,
        "vault_pubkey": vault_pubkey,
        "owner": owner,
        "depth": ev.depth,
        "vault_side": side,
        "parent_strike": ev.parent_strike,
        "child_strike": ev.child_strike,
        "creation_price": ev.creation_price,
    })).await
}

async fn handle_option_merged(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let ev = OptionMergedEventRaw::try_from_slice(payload)
        .context("borsh decode OptionMergedEvent")?;

    let node_pubkey  = pubkey_to_base58(&ev.node_pubkey);
    let vault_pubkey = pubkey_to_base58(&ev.vault_pubkey);
    let owner        = pubkey_to_base58(&ev.owner);

    info!(node = %node_pubkey, %owner, "OptionMergedEvent");

    fractal_db::queries::option_nodes::deactivate_option_node(pool, &node_pubkey)
        .await
        .context("deactivate_option_node")?;

    let notify = serde_json::json!({
        "type": "OPTION_MERGED",
        "node_pubkey": node_pubkey,
        "vault_pubkey": vault_pubkey,
        "owner": owner,
        "timestamp": chrono::Utc::now().timestamp(),
    }).to_string();
    sqlx::query("SELECT pg_notify('fractal_events', $1)")
        .bind(&notify)
        .execute(pool)
        .await
        .context("pg_notify OptionMerged")?;

    insert_event(pool, tx_sig, "OptionMergedEvent", &serde_json::json!({
        "node_pubkey": node_pubkey,
        "vault_pubkey": vault_pubkey,
        "owner": owner,
    })).await
}

async fn handle_option_settled(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let ev = OptionSettledEventRaw::try_from_slice(payload)
        .context("borsh decode OptionSettledEvent")?;

    let vault_pubkey = pubkey_to_base58(&ev.vault_pubkey);
    let owner        = pubkey_to_base58(&ev.owner);

    info!(vault = %vault_pubkey, %owner, settlement_price = ev.settlement_price, "OptionSettledEvent");

    fractal_db::queries::option_vaults::mark_vault_settled(
        pool,
        &vault_pubkey,
        ev.settlement_price as i64,
    )
    .await
    .context("mark_vault_settled")?;

    let notify = serde_json::json!({
        "type": "OPTION_SETTLED",
        "vault_pubkey": vault_pubkey,
        "owner": owner,
        "settlement_price": ev.settlement_price,
        "payout": ev.payout,
        "timestamp": chrono::Utc::now().timestamp(),
    }).to_string();
    sqlx::query("SELECT pg_notify('fractal_events', $1)")
        .bind(&notify)
        .execute(pool)
        .await
        .context("pg_notify OptionSettled")?;

    insert_event(pool, tx_sig, "OptionSettledEvent", &serde_json::json!({
        "vault_pubkey": vault_pubkey,
        "owner": owner,
        "settlement_price": ev.settlement_price,
        "payout": ev.payout,
    })).await
}

async fn handle_trade(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let ev = TradeEventRaw::try_from_slice(payload).context("borsh decode TradeEvent")?;

    let token_mint   = pubkey_to_base58(&ev.token_mint);
    let buyer        = pubkey_to_base58(&ev.buyer);
    let seller       = pubkey_to_base58(&ev.seller);
    let on_chain_sig = bs58::encode(&ev.tx_signature).into_string();

    info!(mint = %token_mint, %buyer, %seller, "TradeEvent");

    let new_trade = NewTrade {
        token_mint:    token_mint.clone(),
        buyer_wallet:  buyer.clone(),
        seller_wallet: seller.clone(),
        price_usdc:    ev.price_usdc as i64,
        quantity:      ev.quantity as i64,
        tx_signature:  Some(on_chain_sig.clone()),
    };

    fractal_db::queries::insert_trade(pool, &new_trade)
        .await
        .context("insert_trade")?;

    insert_event(pool, tx_sig, "TradeEvent", &serde_json::json!({
        "token_mint": token_mint,
        "buyer": buyer,
        "seller": seller,
        "price_usdc": ev.price_usdc,
        "quantity": ev.quantity,
        "on_chain_sig": on_chain_sig,
    })).await
}

// ─── Helper: persist to program_events log table ─────────────────────────────

async fn insert_event(
    pool: &Db,
    tx_sig: &str,
    event_type: &str,
    data: &serde_json::Value,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO program_events (tx_signature, event_type, slot, block_time, data)
        VALUES ($1, $2, 0, NOW(), $3)
        ON CONFLICT (tx_signature) DO NOTHING
        "#,
    )
    .bind(tx_sig)
    .bind(event_type)
    .bind(data)
    .execute(pool)
    .await
    .context("insert program_events")?;

    Ok(())
}

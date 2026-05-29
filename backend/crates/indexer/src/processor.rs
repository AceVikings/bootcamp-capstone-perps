//! Anchor event processor for the Fractal Markets protocol.
//!
//! Anchor emits events as base64-encoded log lines with the prefix
//! "Program data: ".  The first 8 bytes of the decoded buffer are the event
//! discriminator (SHA256("event:<EventName>")[..8]).  The remaining bytes are
//! borsh-serialised event data.
//!
//! This module:
//!   1. Decodes the base64 payload.
//!   2. Matches the 8-byte discriminator against known events.
//!   3. Borsh-deserialises the event body.
//!   4. Persists the event and updates relevant DB tables.
//!   5. Publishes a pg_notify for cross-process WS broadcast.

use anyhow::{bail, Context, Result};
use base64::Engine;
use borsh::BorshDeserialize;
use fractal_db::{
    models::{
        claim_node::NewClaimNode,
        root_vault::NewRootVault,
        trade::NewTrade,
    },
    Db,
};
use sha2::{Digest, Sha256};
use tracing::{debug, info};

// ─── Event structs (borsh layout mirrors Anchor #[event] definitions) ─────────

#[derive(BorshDeserialize, Debug)]
struct CreateVaultEventRaw {
    vault_pubkey: [u8; 32],
    vault_id: u64,
    owner: [u8; 32],
    collateral_mint: [u8; 32],
    collateral_amount: u64,
    long_mint: [u8; 32],
    short_mint: [u8; 32],
    asset_feed: [u8; 32],
    reference_price: u64,
}

#[derive(BorshDeserialize, Debug)]
struct SplitClaimEventRaw {
    node_pubkey: [u8; 32],
    root_vault: [u8; 32],
    root_id: u64,
    owner: [u8; 32],
    node_id: u64,
    depth: u8,
    parent_node: [u8; 32], // zero bytes if depth == 0
    side: u8,              // 0 = LONG, 1 = SHORT
    source_mint: [u8; 32],
    left_child_mint: [u8; 32],
    right_child_mint: [u8; 32],
    creation_price: u64,
}

#[derive(BorshDeserialize, Debug)]
struct MergeClaimsEventRaw {
    node_pubkey: [u8; 32],
    root_vault: [u8; 32],
    owner: [u8; 32],
}

#[derive(BorshDeserialize, Debug)]
struct RedeemEventRaw {
    vault_pubkey: [u8; 32],
    owner: [u8; 32],
    collateral_remaining: u64,
    is_closed: bool,
}

#[derive(BorshDeserialize, Debug)]
struct TradeEventRaw {
    token_mint: [u8; 32],
    buyer: [u8; 32],
    seller: [u8; 32],
    price_usdc: u64,
    quantity: u64,
    tx_signature: [u8; 64],
}

// ─── Discriminator helpers ────────────────────────────────────────────────────

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

fn side_u8_to_str(side: u8) -> &'static str {
    match side {
        0 => "LONG",
        _ => "SHORT",
    }
}

fn is_zero_pubkey(bytes: &[u8; 32]) -> bool {
    bytes.iter().all(|&b| b == 0)
}

// ─── Main entry point ────────────────────────────────────────────────────────

/// Process one "Program data: <base64>" log line from a Fractal Markets program transaction.
pub async fn handle_program_data(tx_sig: &str, data_b64: &str, pool: &Db) -> Result<()> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_b64)
        .context("base64 decode failed")?;

    if bytes.len() < 8 {
        bail!("event data too short ({} bytes)", bytes.len());
    }

    let disc: [u8; 8] = bytes[..8].try_into().unwrap();
    let payload = &bytes[8..];

    if disc == anchor_event_discriminator("CreateVaultEvent") {
        handle_create_vault(tx_sig, payload, pool).await?;
    } else if disc == anchor_event_discriminator("SplitClaimEvent") {
        handle_split_claim(tx_sig, payload, pool).await?;
    } else if disc == anchor_event_discriminator("MergeClaimsEvent") {
        handle_merge_claims(tx_sig, payload, pool).await?;
    } else if disc == anchor_event_discriminator("RedeemEvent") {
        handle_redeem(tx_sig, payload, pool).await?;
    } else if disc == anchor_event_discriminator("TradeEvent") {
        handle_trade(tx_sig, payload, pool).await?;
    } else {
        debug!(tx_sig, "unknown event discriminator — skipping");
    }

    Ok(())
}

// ─── Per-event handlers ────────────────────────────────────────────────────

async fn handle_create_vault(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let event =
        CreateVaultEventRaw::try_from_slice(payload).context("borsh decode CreateVaultEvent")?;

    let vault_pubkey = pubkey_to_base58(&event.vault_pubkey);
    let owner = pubkey_to_base58(&event.owner);
    let collateral_mint = pubkey_to_base58(&event.collateral_mint);
    let long_mint = pubkey_to_base58(&event.long_mint);
    let short_mint = pubkey_to_base58(&event.short_mint);
    let asset_feed = pubkey_to_base58(&event.asset_feed);

    info!(vault = %vault_pubkey, %owner, "CreateVaultEvent");

    let new_vault = NewRootVault {
        pubkey: vault_pubkey.clone(),
        vault_id: event.vault_id as i64,
        owner_wallet: owner.clone(),
        collateral_mint,
        collateral_amount: event.collateral_amount as i64,
        long_mint,
        short_mint,
        asset_feed,
        reference_price: event.reference_price as i64,
        created_at: chrono::Utc::now(),
    };

    fractal_db::queries::insert_root_vault(pool, &new_vault)
        .await
        .context("insert_root_vault")?;

    insert_event(pool, tx_sig, "CreateVaultEvent", &serde_json::json!({
        "vault_pubkey": vault_pubkey,
        "vault_id": event.vault_id,
        "owner": owner,
        "collateral_amount": event.collateral_amount,
        "reference_price": event.reference_price,
    }))
    .await?;

    Ok(())
}

async fn handle_split_claim(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let event =
        SplitClaimEventRaw::try_from_slice(payload).context("borsh decode SplitClaimEvent")?;

    let node_pubkey = pubkey_to_base58(&event.node_pubkey);
    let root_vault = pubkey_to_base58(&event.root_vault);
    let owner = pubkey_to_base58(&event.owner);
    let source_mint = pubkey_to_base58(&event.source_mint);
    let left_child_mint = pubkey_to_base58(&event.left_child_mint);
    let right_child_mint = pubkey_to_base58(&event.right_child_mint);
    let side = side_u8_to_str(event.side);
    let parent_opt = if event.depth == 0 || is_zero_pubkey(&event.parent_node) {
        None
    } else {
        Some(pubkey_to_base58(&event.parent_node))
    };

    info!(node = %node_pubkey, %owner, side, depth = event.depth, "SplitClaimEvent");

    let new_node = NewClaimNode {
        pubkey: node_pubkey.clone(),
        node_id: event.node_id as i64,
        root_vault: root_vault.clone(),
        root_id: event.root_id as i64,
        owner_wallet: owner.clone(),
        depth: event.depth as i16,
        parent_node: parent_opt,
        claim_type: side.to_string(),
        source_mint,
        left_child_mint: left_child_mint.clone(),
        right_child_mint: right_child_mint.clone(),
        creation_price: event.creation_price as i64,
        created_at: chrono::Utc::now(),
    };

    fractal_db::queries::insert_claim_node(pool, &new_node)
        .await
        .context("insert_claim_node")?;

    let notify_payload = serde_json::json!({
        "type": "CLAIM_SPLIT",
        "node_pubkey": node_pubkey,
        "root_vault": root_vault,
        "owner": owner,
        "depth": event.depth,
        "claim_type": side,
        "left_child_mint": left_child_mint,
        "right_child_mint": right_child_mint,
        "creation_price": event.creation_price,
        "timestamp": chrono::Utc::now().timestamp(),
    })
    .to_string();

    sqlx::query("SELECT pg_notify('fractal_events', $1)")
        .bind(&notify_payload)
        .execute(pool)
        .await
        .context("pg_notify SplitClaim failed")?;

    insert_event(pool, tx_sig, "SplitClaimEvent", &serde_json::json!({
        "node_pubkey": node_pubkey,
        "root_vault": root_vault,
        "owner": owner,
        "depth": event.depth,
        "side": side,
        "creation_price": event.creation_price,
    }))
    .await?;

    Ok(())
}

async fn handle_merge_claims(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let event =
        MergeClaimsEventRaw::try_from_slice(payload).context("borsh decode MergeClaimsEvent")?;

    let node_pubkey = pubkey_to_base58(&event.node_pubkey);
    let root_vault = pubkey_to_base58(&event.root_vault);
    let owner = pubkey_to_base58(&event.owner);

    info!(node = %node_pubkey, %owner, "MergeClaimsEvent");

    fractal_db::queries::deactivate_claim_node(pool, &node_pubkey)
        .await
        .context("deactivate_claim_node")?;

    let notify_payload = serde_json::json!({
        "type": "CLAIM_MERGE",
        "node_pubkey": node_pubkey,
        "root_vault": root_vault,
        "owner": owner,
        "timestamp": chrono::Utc::now().timestamp(),
    })
    .to_string();

    sqlx::query("SELECT pg_notify('fractal_events', $1)")
        .bind(&notify_payload)
        .execute(pool)
        .await
        .context("pg_notify MergeClaims failed")?;

    insert_event(pool, tx_sig, "MergeClaimsEvent", &serde_json::json!({
        "node_pubkey": node_pubkey,
        "root_vault": root_vault,
        "owner": owner,
    }))
    .await?;

    Ok(())
}

async fn handle_redeem(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let event = RedeemEventRaw::try_from_slice(payload).context("borsh decode RedeemEvent")?;

    let vault_pubkey = pubkey_to_base58(&event.vault_pubkey);
    let owner = pubkey_to_base58(&event.owner);

    info!(vault = %vault_pubkey, %owner, is_closed = event.is_closed, "RedeemEvent");

    fractal_db::queries::update_collateral_amount(
        pool,
        &vault_pubkey,
        event.collateral_remaining as i64,
    )
    .await
    .context("update_collateral_amount")?;

    if event.is_closed {
        fractal_db::queries::deactivate_root_vault(pool, &vault_pubkey)
            .await
            .context("deactivate_root_vault")?;
    }

    insert_event(pool, tx_sig, "RedeemEvent", &serde_json::json!({
        "vault_pubkey": vault_pubkey,
        "owner": owner,
        "collateral_remaining": event.collateral_remaining,
        "is_closed": event.is_closed,
    }))
    .await?;

    Ok(())
}

async fn handle_trade(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let event = TradeEventRaw::try_from_slice(payload).context("borsh decode TradeEvent")?;

    let token_mint = pubkey_to_base58(&event.token_mint);
    let buyer = pubkey_to_base58(&event.buyer);
    let seller = pubkey_to_base58(&event.seller);
    let on_chain_sig = bs58::encode(&event.tx_signature).into_string();

    info!(mint = %token_mint, %buyer, %seller, "TradeEvent");

    let new_trade = NewTrade {
        token_mint: token_mint.clone(),
        buyer_wallet: buyer.clone(),
        seller_wallet: seller.clone(),
        price_usdc: event.price_usdc as i64,
        quantity: event.quantity as i64,
        tx_signature: Some(on_chain_sig.clone()),
    };

    fractal_db::queries::insert_trade(pool, &new_trade)
        .await
        .context("insert_trade")?;

    insert_event(pool, tx_sig, "TradeEvent", &serde_json::json!({
        "token_mint": token_mint,
        "buyer": buyer,
        "seller": seller,
        "price_usdc": event.price_usdc,
        "quantity": event.quantity,
        "on_chain_sig": on_chain_sig,
    }))
    .await?;

    Ok(())
}

// ─── Helper: persist raw event log ──────────────────────────────────────────

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

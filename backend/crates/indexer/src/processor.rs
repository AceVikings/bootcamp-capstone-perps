//! Anchor event processor.
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

use anyhow::{bail, Context, Result};
use base64::Engine;
use borsh::BorshDeserialize;
use sha2::{Digest, Sha256};
use tpp_db::{
    models::{NewEpoch, NewProgramEvent, NewVault},
    Db,
};
use tracing::{debug, info};

// ─── Event structs (borsh layout mirrors Anchor #[event] definitions) ─────────

#[derive(BorshDeserialize, Debug)]
struct EpochCreatedEvent {
    epoch_id: u64,
    asset_key: [u8; 32],
    reference_price: u64,
    end_time: i64,
    long_mint: [u8; 32],
    short_mint: [u8; 32],
}

#[derive(BorshDeserialize, Debug)]
struct PositionMintedEvent {
    minter: [u8; 32],
    vault: [u8; 32],
    epoch_id: u64,
    collateral_amount: u64,
    entry_price: u64,
    long_tokens: u64,
    short_tokens: u64,
    fee: u64,
}

#[derive(BorshDeserialize, Debug)]
struct PositionRedeemedEvent {
    redeemer: [u8; 32],
    vault: [u8; 32],
    token_type: u8, // 0 = Long, 1 = Short
    amount: u64,
    payout_gross: u64,
    payout_net: u64,
    fee: u64,
    current_price: u64,
}

#[derive(BorshDeserialize, Debug)]
struct VaultLiquidatedEvent {
    liquidator: [u8; 32],
    vault: [u8; 32],
    current_price: u64,
    remaining_collateral: u64,
    liquidator_reward: u64,
    to_treasury: u64,
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

// ─── Main entry point ────────────────────────────────────────────────────────

/// Process one "Program data: <base64>" log line from a TPP program transaction.
pub async fn handle_program_data(tx_sig: &str, data_b64: &str, pool: &Db) -> Result<()> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_b64)
        .context("base64 decode failed")?;

    if bytes.len() < 8 {
        bail!("Event data too short ({} bytes)", bytes.len());
    }

    let disc: [u8; 8] = bytes[..8].try_into().unwrap();
    let payload = &bytes[8..];

    // Match known discriminators
    if disc == anchor_event_discriminator("EpochCreated") {
        handle_epoch_created(tx_sig, payload, pool).await?;
    } else if disc == anchor_event_discriminator("PositionMinted") {
        handle_position_minted(tx_sig, payload, pool).await?;
    } else if disc == anchor_event_discriminator("PositionRedeemed") {
        handle_position_redeemed(tx_sig, payload, pool).await?;
    } else if disc == anchor_event_discriminator("VaultLiquidated") {
        handle_vault_liquidated(tx_sig, payload, pool).await?;
    } else {
        debug!(tx_sig, "Unknown event discriminator — skipping");
    }

    Ok(())
}

// ─── Per-event handlers ────────────────────────────────────────────────────

async fn handle_epoch_created(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let event = EpochCreatedEvent::try_from_slice(payload).context("borsh decode EpochCreated")?;
    info!(epoch_id = event.epoch_id, "EpochCreated");

    let asset_key = pubkey_to_base58(&event.asset_key);
    let long_mint = pubkey_to_base58(&event.long_mint);
    let short_mint = pubkey_to_base58(&event.short_mint);
    let end_time = chrono::DateTime::from_timestamp(event.end_time, 0)
        .unwrap_or_default()
        .with_timezone(&chrono::Utc);

    // Derive epoch PDA (we don't have it here — store by (epoch_id, asset_key) UNIQUE instead)
    // The PDA will be fetched and filled later by the keeper's account scan.
    // For now, use a placeholder that the keeper will update.
    let pda_placeholder = format!("epoch:{}:{}", event.epoch_id, &asset_key[..8]);

    let new_epoch = NewEpoch {
        epoch_id: event.epoch_id as i64,
        asset_key: asset_key.clone(),
        pda: pda_placeholder,
        reference_price: event.reference_price as i64,
        price_band_lower: (event.reference_price as f64 * 0.995) as i64,
        price_band_upper: (event.reference_price as f64 * 1.005) as i64,
        long_token_mint: long_mint,
        short_token_mint: short_mint,
        start_time: chrono::Utc::now(),
        end_time,
    };

    tpp_db::queries::upsert_epoch(pool, &new_epoch).await?;

    // Store raw event
    insert_event(pool, tx_sig, "EpochCreated", &serde_json::json!({
        "epoch_id": event.epoch_id,
        "asset_key": asset_key,
        "reference_price": event.reference_price,
        "end_time": event.end_time,
    }))
    .await?;

    Ok(())
}

async fn handle_position_minted(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let event =
        PositionMintedEvent::try_from_slice(payload).context("borsh decode PositionMinted")?;
    info!(epoch_id = event.epoch_id, "PositionMinted");

    let minter = pubkey_to_base58(&event.minter);
    let vault_pda = pubkey_to_base58(&event.vault);

    // We don't have full epoch PDA here — use epoch_id lookup
    // The vault row will be reconciled with the actual epoch PDA by the keeper
    let epoch_pda_placeholder = format!("epoch:{}:", event.epoch_id);

    let new_vault = NewVault {
        pda: vault_pda.clone(),
        minter: minter.clone(),
        epoch_pda: epoch_pda_placeholder,
        epoch_id: event.epoch_id as i64,
        asset_key: String::new(), // filled by keeper reconciliation
        collateral_mint: String::new(), // filled by keeper
        collateral_amount: event.collateral_amount as i64,
        entry_price: event.entry_price as i64,
        long_tokens_minted: event.long_tokens as i64,
        short_tokens_minted: event.short_tokens as i64,
        depth: 0,
        parent_vault_pda: None,
        vault_index: 0,
        created_at: chrono::Utc::now(),
    };

    // Best-effort insert — keeper will upsert with full data from account scan
    let _ = tpp_db::queries::insert_vault(pool, &new_vault).await;

    insert_event(pool, tx_sig, "PositionMinted", &serde_json::json!({
        "minter": minter,
        "vault": vault_pda,
        "epoch_id": event.epoch_id,
        "collateral_amount": event.collateral_amount,
        "entry_price": event.entry_price,
        "long_tokens": event.long_tokens,
        "short_tokens": event.short_tokens,
        "fee": event.fee,
    }))
    .await?;

    Ok(())
}

async fn handle_position_redeemed(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let event =
        PositionRedeemedEvent::try_from_slice(payload).context("borsh decode PositionRedeemed")?;

    let redeemer = pubkey_to_base58(&event.redeemer);
    let vault_pda = pubkey_to_base58(&event.vault);
    let token_type = if event.token_type == 0 { "LONG" } else { "SHORT" };
    info!(%redeemer, "PositionRedeemed");

    insert_event(pool, tx_sig, "PositionRedeemed", &serde_json::json!({
        "redeemer": redeemer,
        "vault": vault_pda,
        "token_type": token_type,
        "amount": event.amount,
        "payout_gross": event.payout_gross,
        "payout_net": event.payout_net,
        "fee": event.fee,
        "current_price": event.current_price,
    }))
    .await?;

    Ok(())
}

async fn handle_vault_liquidated(tx_sig: &str, payload: &[u8], pool: &Db) -> Result<()> {
    let event =
        VaultLiquidatedEvent::try_from_slice(payload).context("borsh decode VaultLiquidated")?;

    let liquidator = pubkey_to_base58(&event.liquidator);
    let vault_pda = pubkey_to_base58(&event.vault);
    info!(%vault_pda, "VaultLiquidated");

    // Update vault to liquidated state
    tpp_db::queries::mark_vault_liquidated(pool, &vault_pda).await?;

    insert_event(pool, tx_sig, "VaultLiquidated", &serde_json::json!({
        "liquidator": liquidator,
        "vault": vault_pda,
        "current_price": event.current_price,
        "remaining_collateral": event.remaining_collateral,
        "liquidator_reward": event.liquidator_reward,
        "to_treasury": event.to_treasury,
    }))
    .await?;

    Ok(())
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async fn insert_event(
    pool: &Db,
    tx_sig: &str,
    event_type: &str,
    data: &serde_json::Value,
) -> Result<()> {
    let event = NewProgramEvent {
        tx_signature: tx_sig.to_string(),
        event_type: event_type.to_string(),
        slot: 0, // TODO: pass slot from listener context
        block_time: chrono::Utc::now(),
        data: data.clone(),
    };

    sqlx::query(
        r#"
        INSERT INTO program_events (tx_signature, event_type, slot, block_time, data)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tx_signature) DO NOTHING
        "#,
    )
    .bind(&event.tx_signature)
    .bind(&event.event_type)
    .bind(event.slot)
    .bind(event.block_time)
    .bind(&event.data)
    .execute(pool)
    .await
    .context("Failed to insert program event")?;

    Ok(())
}

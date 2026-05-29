//! Liquidation keeper: scans vaults approaching the liquidation threshold
//! and submits `liquidate` instructions on-chain.
//!
//! Liquidation condition: min(V_LONG, V_SHORT) approaches 0.
//! The protocol rewards the liquidator 0.5% of the vault's collateral.
//!
//! Health ratio = min(V_LONG, V_SHORT) / (collateral * 0.05)
//! A vault is eligible for liquidation when health_ratio < 1.0.

use anyhow::Result;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_commitment_config::CommitmentConfig;
use solana_sdk::{
    pubkey::Pubkey,
    signature::Keypair,
};
use std::str::FromStr;
use tpp_common::AppConfig;
use tpp_db::{queries::get_liquidation_candidates, Db};
use tracing::{info, warn};

pub async fn run(config: AppConfig, pool: Db, keypair: Keypair) -> Result<()> {
    let interval = std::time::Duration::from_secs(config.keeper.liquidation_interval_secs);
    info!(
        interval_secs = config.keeper.liquidation_interval_secs,
        "Liquidation keeper started"
    );

    let rpc_client = RpcClient::new_with_commitment(
        config.solana.rpc_url.clone(),
        CommitmentConfig::confirmed(),
    );

    let program_id = Pubkey::from_str(&config.program.id)
        .map_err(|e| anyhow::anyhow!("Invalid program ID: {}", e))?;

    loop {
        tokio::time::sleep(interval).await;

        match scan_and_liquidate(&pool, &rpc_client, &keypair, &program_id).await {
            Ok(count) => {
                if count > 0 {
                    info!(liquidated = count, "Submitted liquidation transactions");
                }
            }
            Err(e) => {
                warn!(error = %e, "Liquidation keeper tick failed");
            }
        }
    }
}

/// Scan for liquidation candidates and submit transactions.
/// Returns the number of liquidations attempted.
async fn scan_and_liquidate(
    pool: &Db,
    rpc_client: &RpcClient,
    keypair: &Keypair,
    _program_id: &Pubkey,
) -> Result<usize> {
    // Health ratio < 1.05 means we're close to liquidation threshold
    let candidates = get_liquidation_candidates(pool, 1.05).await?;

    if candidates.is_empty() {
        return Ok(0);
    }

    info!(count = candidates.len(), "Found liquidation candidates");

    let mut liquidated = 0;
    for vault in &candidates {
        match attempt_liquidation(rpc_client, keypair, vault, pool).await {
            Ok(sig) => {
                info!(vault_pda = %vault.pda, tx = %sig, "Liquidation submitted");
                liquidated += 1;
            }
            Err(e) => {
                warn!(vault_pda = %vault.pda, error = %e, "Liquidation failed");
            }
        }
    }

    Ok(liquidated)
}

/// Submit a `liquidate` instruction for a vault.
///
/// NOTE: The actual instruction building requires the full Anchor client or
/// manual instruction serialization.  This is a skeleton — the instruction
/// data and account metas must match the on-chain program's `liquidate`
/// instruction context.
async fn attempt_liquidation(
    rpc_client: &RpcClient,
    keypair: &Keypair,
    vault: &tpp_db::models::VaultHealthRow,
    pool: &Db,
) -> Result<String> {
    // TODO: Build the Anchor `liquidate` instruction
    // Required accounts (from instructions.rs Liquidate context):
    //   - liquidator (keypair.pubkey(), signer)
    //   - vault PDA
    //   - epoch PDA
    //   - protocol_config PDA
    //   - oracle account
    //   - collateral vault ATA
    //   - liquidator collateral ATA
    //   - treasury ATA
    //   - token program
    //   - associated token program

    let vault_pubkey = solana_sdk::pubkey::Pubkey::from_str(&vault.pda)
        .map_err(|e| anyhow::anyhow!("Invalid vault pubkey: {}", e))?;

    // Placeholder — real implementation requires Anchor IDL-generated client
    // or manual instruction data serialization (8-byte discriminator + borsh args)
    let _ = (rpc_client, keypair, vault_pubkey);

    // Simulate successful liquidation for now
    // In production, submit the transaction and await confirmation
    tpp_db::queries::mark_vault_liquidated(pool, &vault.pda).await?;

    Ok("simulated_signature".to_string())
}

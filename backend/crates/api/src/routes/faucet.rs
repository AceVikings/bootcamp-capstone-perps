use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use solana_client::{
    nonblocking::rpc_client::RpcClient,
    rpc_config::RpcSendTransactionConfig,
};
use solana_commitment_config::CommitmentConfig;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use std::str::FromStr;

// System program ID (11111111...)
const SYSTEM_PROGRAM_ID: &str = "11111111111111111111111111111111";

use crate::{error::ApiError, state::AppState};

// ── Constants ──────────────────────────────────────────────────────────────
const TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
// Agave 4.0 deployed the ATA program at a new address (old: ...LJe1bJG)
const ASSOC_PROGRAM_ID: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const USDC_MINT: &str = "GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr";
/// 1,000 USDC with 6 decimals
const FAUCET_AMOUNT: u64 = 1_000_000_000;

// ── Request / Response ─────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct FaucetRequest {
    /// Base-58 encoded wallet pubkey that should receive test USDC.
    pub wallet: String,
}

#[derive(Serialize)]
pub struct FaucetResponse {
    pub signature: String,
    pub amount_usdc: u64,
}

// ── Handler ────────────────────────────────────────────────────────────────

pub async fn faucet(
    State(_state): State<AppState>,
    Json(req): Json<FaucetRequest>,
) -> Result<Json<FaucetResponse>, ApiError> {
    // Validate wallet address
    let wallet = Pubkey::from_str(&req.wallet)
        .map_err(|_| ApiError::BadRequest("invalid wallet address".into()))?;

    // Load mint authority keypair (falls back to standard Solana CLI path)
    let keypair_path = std::env::var("KEEPER_KEYPAIR_PATH")
        .or_else(|_| std::env::var("MINT_AUTHORITY_PATH"))
        .unwrap_or_else(|_| "~/.config/solana/tpp-devnet.json".to_string());

    let expanded = expand_tilde(&keypair_path);
    let authority = load_keypair(&expanded)
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("failed to load keypair: {}", e)))?;

    let token_program = Pubkey::from_str(TOKEN_PROGRAM_ID).unwrap();
    let assoc_program = Pubkey::from_str(ASSOC_PROGRAM_ID).unwrap();
    let mint = Pubkey::from_str(USDC_MINT).unwrap();

    // Derive the wallet's USDC ATA
    let (ata, _) = Pubkey::find_program_address(
        &[
            wallet.as_ref(),
            token_program.as_ref(),
            mint.as_ref(),
        ],
        &assoc_program,
    );

    // ── Instruction 1: create ATA idempotently ──────────────────────────
    // AssociatedTokenProgram CreateIdempotent = instruction byte 1
    let create_ata_ix = Instruction {
        program_id: assoc_program,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),    // payer
            AccountMeta::new(ata, false),                  // ATA (writable)
            AccountMeta::new_readonly(wallet, false),      // ATA owner
            AccountMeta::new_readonly(mint, false),        // mint
            AccountMeta::new_readonly(Pubkey::from_str(SYSTEM_PROGRAM_ID).unwrap(), false),
            AccountMeta::new_readonly(token_program, false),
        ],
        data: vec![1u8], // 1 = CreateIdempotent
    };

    // ── Instruction 2: MintTo (SPL Token instruction index 7) ──────────
    let mut mint_data = vec![7u8]; // MintTo discriminator
    mint_data.extend_from_slice(&FAUCET_AMOUNT.to_le_bytes());
    let mint_to_ix = Instruction {
        program_id: token_program,
        accounts: vec![
            AccountMeta::new(mint, false),                         // mint (writable)
            AccountMeta::new(ata, false),                          // destination (writable)
            AccountMeta::new_readonly(authority.pubkey(), true),   // authority (signer)
        ],
        data: mint_data,
    };

    // ── Build, sign and send transaction ───────────────────────────────
    let rpc_url = std::env::var("SOLANA_RPC_URL")
        .unwrap_or_else(|_| "https://api.devnet.solana.com".to_string());
    let rpc = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());

    let blockhash = rpc
        .get_latest_blockhash()
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("rpc get_latest_blockhash: {}", e)))?;

    let tx = Transaction::new_signed_with_payer(
        &[create_ata_ix, mint_to_ix],
        Some(&authority.pubkey()),
        &[&authority],
        blockhash,
    );

    // Skip preflight so devnet simulation quirks don't block a valid tx.
    // We confirm manually and surface the real on-chain error if it reverts.
    let sig = rpc
        .send_transaction_with_config(
            &tx,
            RpcSendTransactionConfig {
                skip_preflight: true,
                preflight_commitment: Some(CommitmentConfig::confirmed().commitment),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("send faucet tx: {}", e)))?;

    // Confirm (wait for the tx to land)
    let (recent_blockhash, last_valid_height) = rpc
        .get_latest_blockhash_with_commitment(CommitmentConfig::confirmed())
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("get_latest_blockhash: {}", e)))?;
    rpc.confirm_transaction_with_spinner(
        &sig,
        &recent_blockhash,
        CommitmentConfig::confirmed(),
    )
    .await
    .map_err(|e| ApiError::Internal(anyhow::anyhow!("confirm faucet tx: {}", e)))?;
    let _ = last_valid_height; // suppress unused warning

    Ok(Json(FaucetResponse {
        signature: sig.to_string(),
        amount_usdc: 1_000,
    }))
}

// ── Helpers ────────────────────────────────────────────────────────────────

/// Expand `~` to the user's home directory.
fn expand_tilde(path: &str) -> String {
    if path.starts_with('~') {
        let home = std::env::var("HOME").unwrap_or_default();
        path.replacen('~', &home, 1)
    } else {
        path.to_string()
    }
}

/// Read a Solana keypair JSON file into a `Keypair` using the standard Solana SDK helper.
fn load_keypair(path: &str) -> anyhow::Result<Keypair> {
    solana_sdk::signature::read_keypair_file(path)
        .map_err(|e| anyhow::anyhow!("failed to read keypair '{}': {}", path, e))
}

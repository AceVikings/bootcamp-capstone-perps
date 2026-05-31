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

const SYSTEM_PROGRAM_ID: &str = "11111111111111111111111111111111";
const TOKEN_PROGRAM_ID:  &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC_PROGRAM_ID:  &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

/// Default USDC mint (6 decimals)
const USDC_MINT: &str = "GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr";
/// Default mock wSOL mint (9 decimals) — set via WSOL_MINT env var
const DEFAULT_WSOL_MINT: &str = "58qfKJ769kMmLRAWquNFv9ViXQwzWzkdjQSTkmC84cPC";

/// 1,000 USDC with 6 decimals
const USDC_FAUCET_AMOUNT: u64 = 1_000_000_000;
/// 10 wSOL with 9 decimals
const WSOL_FAUCET_AMOUNT: u64 = 10_000_000_000;

use crate::{error::ApiError, state::AppState};

// ── Request / Response ─────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct FaucetRequest {
    /// Recipient wallet pubkey (base-58).
    pub wallet: String,
    /// Which token to mint: "USDC" (default) or "WSOL".
    #[serde(default = "default_token")]
    pub token: String,
}

fn default_token() -> String { "USDC".to_string() }

#[derive(Serialize)]
pub struct FaucetResponse {
    pub signature:   String,
    pub token:       String,
    pub amount:      u64,   // human-readable (1000 USDC or 10 wSOL)
    // Legacy field — kept for backward compat with clients that read amount_usdc
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount_usdc: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount_wsol: Option<u64>,
}

// ── Handler ────────────────────────────────────────────────────────────────

pub async fn faucet(
    State(_state): State<AppState>,
    Json(req): Json<FaucetRequest>,
) -> Result<Json<FaucetResponse>, ApiError> {
    let wallet = Pubkey::from_str(&req.wallet)
        .map_err(|_| ApiError::BadRequest("invalid wallet address".into()))?;

    // Determine which mint to use
    let is_wsol = req.token.to_uppercase() == "WSOL";
    let (mint_str, faucet_amount, decimals_label) = if is_wsol {
        let wsol_mint = std::env::var("WSOL_MINT")
            .unwrap_or_else(|_| DEFAULT_WSOL_MINT.to_string());
        (wsol_mint, WSOL_FAUCET_AMOUNT, "wSOL")
    } else {
        let usdc_mint = std::env::var("USDC_MINT")
            .unwrap_or_else(|_| USDC_MINT.to_string());
        (usdc_mint, USDC_FAUCET_AMOUNT, "USDC")
    };

    let mint = Pubkey::from_str(&mint_str)
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("invalid mint: {}", e)))?;

    // Load keeper / mint authority keypair
    let keypair_path = std::env::var("KEEPER_KEYPAIR_PATH")
        .or_else(|_| std::env::var("MINT_AUTHORITY_PATH"))
        .unwrap_or_else(|_| "~/.config/solana/tpp-devnet.json".to_string());

    let authority = load_keypair(&expand_tilde(&keypair_path))
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("failed to load keypair: {}", e)))?;

    let token_program = Pubkey::from_str(TOKEN_PROGRAM_ID).unwrap();
    let assoc_program = Pubkey::from_str(ASSOC_PROGRAM_ID).unwrap();

    // Derive recipient ATA
    let (ata, _) = Pubkey::find_program_address(
        &[wallet.as_ref(), token_program.as_ref(), mint.as_ref()],
        &assoc_program,
    );

    // Instruction 1: create ATA (idempotent variant — byte 1)
    let create_ata_ix = Instruction {
        program_id: assoc_program,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new(ata, false),
            AccountMeta::new_readonly(wallet, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(Pubkey::from_str(SYSTEM_PROGRAM_ID).unwrap(), false),
            AccountMeta::new_readonly(token_program, false),
        ],
        data: vec![1u8],
    };

    // Instruction 2: MintTo (SPL Token instruction 7)
    let mut mint_data = vec![7u8];
    mint_data.extend_from_slice(&faucet_amount.to_le_bytes());
    let mint_to_ix = Instruction {
        program_id: token_program,
        accounts: vec![
            AccountMeta::new(mint, false),
            AccountMeta::new(ata, false),
            AccountMeta::new_readonly(authority.pubkey(), true),
        ],
        data: mint_data,
    };

    // Build and send
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

    let (recent_blockhash, _last_valid) = rpc
        .get_latest_blockhash_with_commitment(CommitmentConfig::confirmed())
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("get_latest_blockhash: {}", e)))?;

    rpc.confirm_transaction_with_spinner(&sig, &recent_blockhash, CommitmentConfig::confirmed())
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!("confirm faucet tx: {}", e)))?;

    // Human-readable amount (no decimals)
    let human_amount = if is_wsol {
        faucet_amount / 1_000_000_000  // lamports → SOL
    } else {
        faucet_amount / 1_000_000       // micro-USDC → USDC
    };

    tracing::info!(
        wallet = %req.wallet,
        token = %decimals_label,
        amount = human_amount,
        sig = %sig,
        "faucet: minted tokens"
    );

    Ok(Json(FaucetResponse {
        signature:   sig.to_string(),
        token:       decimals_label.to_string(),
        amount:      human_amount,
        amount_usdc: if !is_wsol { Some(human_amount) } else { None },
        amount_wsol: if  is_wsol { Some(human_amount) } else { None },
    }))
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn expand_tilde(path: &str) -> String {
    if path.starts_with('~') {
        let home = std::env::var("HOME").unwrap_or_default();
        path.replacen('~', &home, 1)
    } else {
        path.to_string()
    }
}

fn load_keypair(path: &str) -> anyhow::Result<Keypair> {
    solana_sdk::signature::read_keypair_file(path)
        .map_err(|e| anyhow::anyhow!("failed to read keypair '{}': {}", path, e))
}

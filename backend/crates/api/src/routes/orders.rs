use axum::{
    extract::{Path, Query, State},
    Json,
};
use base64::Engine;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use tpp_db::{
    models::NewOrder,
    queries::{cancel_order as db_cancel_order, get_order, get_order_book_levels, insert_order},
};
use uuid::Uuid;

use crate::{error::ApiError, error::ApiResult, state::AppState};

#[derive(Deserialize)]
pub struct CreateOrderRequest {
    pub maker: String,
    pub token_mint: String,
    pub token_type: String, // "LONG" or "SHORT"
    pub side: String,       // "BUY" or "SELL"
    pub epoch_id: i64,
    pub asset_key: String,
    pub quantity: i64,
    pub price_usd: i64,
    pub expires_at: Option<DateTime<Utc>>,
    /// Base64-encoded Ed25519 signature over the canonical message
    pub signature: String,
}

#[derive(Deserialize)]
pub struct CancelParams {
    pub maker: String,
    /// Base64-encoded Ed25519 signature over "cancel:<order_id>"
    pub signature: String,
}

#[derive(Deserialize)]
pub struct BookQuery {
    #[serde(default = "default_depth")]
    pub depth: i64,
}

fn default_depth() -> i64 {
    20
}

/// Canonical message for order placement:
/// "<maker>|<token_mint>|<side>|<quantity>|<price_usd>|<expires_at>"
fn canonical_order_message(req: &CreateOrderRequest) -> String {
    let expires = req
        .expires_at
        .map(|t| t.timestamp().to_string())
        .unwrap_or_else(|| "none".to_string());
    format!(
        "{}|{}|{}|{}|{}|{}",
        req.maker, req.token_mint, req.side, req.quantity, req.price_usd, expires
    )
}

/// Verify an Ed25519 signature from a Solana wallet.
/// `pubkey_b58` — base58 wallet address (32-byte Ed25519 public key)
/// `signature_b64` — base64-encoded 64-byte Ed25519 signature
/// `message` — raw message bytes that were signed
fn verify_signature(pubkey_b58: &str, signature_b64: &str, message: &[u8]) -> Result<(), ApiError> {
    let pubkey_bytes = bs58::decode(pubkey_b58)
        .into_vec()
        .map_err(|_| ApiError::BadRequest("Invalid base58 public key".to_string()))?;

    if pubkey_bytes.len() != 32 {
        return Err(ApiError::BadRequest("Public key must be 32 bytes".to_string()));
    }

    let pubkey_arr: &[u8; 32] = pubkey_bytes
        .as_slice()
        .try_into()
        .map_err(|_| ApiError::BadRequest("Invalid public key length".to_string()))?;

    let verifying_key = ed25519_dalek::VerifyingKey::from_bytes(pubkey_arr)
        .map_err(|_| ApiError::BadRequest("Invalid Ed25519 public key".to_string()))?;

    let sig_bytes = base64::engine::general_purpose::STANDARD
        .decode(signature_b64)
        .map_err(|_| ApiError::BadRequest("Invalid base64 signature".to_string()))?;

    if sig_bytes.len() != 64 {
        return Err(ApiError::BadRequest("Signature must be 64 bytes".to_string()));
    }

    let sig_arr: &[u8; 64] = sig_bytes
        .as_slice()
        .try_into()
        .map_err(|_| ApiError::BadRequest("Invalid signature length".to_string()))?;

    let signature = ed25519_dalek::Signature::from_bytes(sig_arr);

    verifying_key
        .verify_strict(message, &signature)
        .map_err(|_| ApiError::Unauthorized("Signature verification failed".to_string()))
}

pub async fn create_order(
    State(state): State<AppState>,
    Json(req): Json<CreateOrderRequest>,
) -> ApiResult<Json<Value>> {
    // Validate inputs
    if !["BUY", "SELL"].contains(&req.side.as_str()) {
        return Err(ApiError::BadRequest("side must be BUY or SELL".to_string()));
    }
    if !["LONG", "SHORT"].contains(&req.token_type.as_str()) {
        return Err(ApiError::BadRequest("token_type must be LONG or SHORT".to_string()));
    }
    if req.quantity <= 0 {
        return Err(ApiError::BadRequest("quantity must be positive".to_string()));
    }
    if req.price_usd <= 0 {
        return Err(ApiError::BadRequest("price_usd must be positive".to_string()));
    }
    if req.maker.len() < 32 || req.maker.len() > 44 {
        return Err(ApiError::BadRequest("Invalid maker address".to_string()));
    }

    // Verify signature over canonical message
    let msg = canonical_order_message(&req);
    verify_signature(&req.maker, &req.signature, msg.as_bytes())?;

    let new_order = NewOrder {
        maker: req.maker,
        token_mint: req.token_mint,
        token_type: req.token_type,
        side: req.side,
        epoch_id: req.epoch_id,
        asset_key: req.asset_key,
        quantity: req.quantity,
        price_usd: req.price_usd,
        signature: req.signature,
        expires_at: req.expires_at,
    };

    let order = insert_order(&state.pool, &new_order).await?;
    Ok(Json(json!({ "order": order })))
}

pub async fn get_order_book(
    State(state): State<AppState>,
    Path(token_mint): Path<String>,
    Query(params): Query<BookQuery>,
) -> ApiResult<Json<Value>> {
    let bids = get_order_book_levels(&state.pool, &token_mint, "BUY", params.depth).await?;
    let asks = get_order_book_levels(&state.pool, &token_mint, "SELL", params.depth).await?;
    Ok(Json(json!({ "bids": bids, "asks": asks })))
}

pub async fn cancel_order(
    State(state): State<AppState>,
    Path(order_id): Path<Uuid>,
    Query(params): Query<CancelParams>,
) -> ApiResult<Json<Value>> {
    if params.maker.len() < 32 || params.maker.len() > 44 {
        return Err(ApiError::BadRequest("Invalid maker address".to_string()));
    }

    // Verify signature over "cancel:<order_id>"
    let cancel_msg = format!("cancel:{}", order_id);
    verify_signature(&params.maker, &params.signature, cancel_msg.as_bytes())?;

    // Verify order belongs to this maker
    let order = get_order(&state.pool, order_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Order {} not found", order_id)))?;

    if order.maker != params.maker {
        return Err(ApiError::Unauthorized(
            "Only the maker can cancel this order".to_string(),
        ));
    }

    db_cancel_order(&state.pool, order_id, &params.maker).await?;
    Ok(Json(json!({ "cancelled": true, "order_id": order_id })))
}

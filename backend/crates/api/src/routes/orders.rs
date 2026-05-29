use axum::{
    extract::{Path, Query, State},
    Json,
};
use base64::Engine;
use chrono::{DateTime, TimeZone, Utc};
use fractal_db::{
    models::order::NewOrder,
    queries::{
        cancel_order as db_cancel_order, get_order, get_order_book_levels,
        insert_order, is_known_claim_mint,
    },
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    state::{AppState, PriceLevel, WsEvent},
};

#[derive(Deserialize)]
pub struct CreateOrderRequest {
    pub trader: String,
    pub token_mint: String,
    pub side: String,
    pub quantity: i64,
    pub price_usdc: i64,
    pub nonce: i64,
    /// Unix timestamp seconds for order expiry
    pub expiry: i64,
    /// Base64-encoded Ed25519 signature over canonical message
    pub signature: String,
}

#[derive(Deserialize)]
pub struct CancelParams {
    pub trader: String,
    /// Base64-encoded Ed25519 signature over "cancel:<order_id>"
    pub signature: String,
}

/// Canonical message for order placement:
/// "<trader>|<token_mint>|<side>|<quantity>|<price_usdc>|<nonce>|<expiry>"
fn canonical_order_message(req: &CreateOrderRequest) -> String {
    format!(
        "{}|{}|{}|{}|{}|{}|{}",
        req.trader, req.token_mint, req.side, req.quantity, req.price_usdc, req.nonce, req.expiry
    )
}

/// Verify an Ed25519 signature from a Solana wallet.
fn verify_signature(pubkey_b58: &str, signature_b64: &str, message: &[u8]) -> Result<(), ApiError> {
    let pubkey_bytes = bs58::decode(pubkey_b58)
        .into_vec()
        .map_err(|_| ApiError::BadRequest("invalid base58 public key".to_string()))?;

    if pubkey_bytes.len() != 32 {
        return Err(ApiError::BadRequest("public key must be 32 bytes".to_string()));
    }

    let pubkey_arr: [u8; 32] = pubkey_bytes
        .as_slice()
        .try_into()
        .map_err(|_| ApiError::BadRequest("invalid public key length".to_string()))?;

    let verifying_key = ed25519_dalek::VerifyingKey::from_bytes(&pubkey_arr)
        .map_err(|_| ApiError::InvalidSignature)?;

    let sig_bytes = base64::engine::general_purpose::STANDARD
        .decode(signature_b64)
        .map_err(|_| ApiError::InvalidSignature)?;

    if sig_bytes.len() != 64 {
        return Err(ApiError::InvalidSignature);
    }

    let sig_arr: [u8; 64] = sig_bytes
        .as_slice()
        .try_into()
        .map_err(|_| ApiError::InvalidSignature)?;

    let signature = ed25519_dalek::Signature::from_bytes(&sig_arr);

    verifying_key
        .verify_strict(message, &signature)
        .map_err(|_| ApiError::InvalidSignature)
}

pub async fn create_order(
    State(state): State<AppState>,
    Json(req): Json<CreateOrderRequest>,
) -> ApiResult<Json<Value>> {
    if !["BUY", "SELL"].contains(&req.side.as_str()) {
        return Err(ApiError::BadRequest("side must be BUY or SELL".to_string()));
    }
    if req.quantity <= 0 {
        return Err(ApiError::BadRequest("quantity must be positive".to_string()));
    }
    if req.price_usdc <= 0 {
        return Err(ApiError::BadRequest("price_usdc must be positive".to_string()));
    }
    let trader_len = req.trader.len();
    if trader_len < 32 || trader_len > 44 {
        return Err(ApiError::BadRequest("invalid trader address".to_string()));
    }

    // Verify Ed25519 signature
    let msg = canonical_order_message(&req);
    verify_signature(&req.trader, &req.signature, msg.as_bytes())?;

    // Validate token_mint belongs to a known active vault or claim node
    let valid = is_known_claim_mint(&state.pool, &req.token_mint)
        .await
        .map_err(ApiError::Internal)?;
    if !valid {
        return Err(ApiError::InvalidTokenMint);
    }

    let expiry_dt: DateTime<Utc> = Utc
        .timestamp_opt(req.expiry, 0)
        .single()
        .ok_or_else(|| ApiError::BadRequest("invalid expiry timestamp".to_string()))?;

    let new_order = NewOrder {
        trader_wallet: req.trader.clone(),
        token_mint: req.token_mint.clone(),
        side: req.side.clone(),
        price_usdc: req.price_usdc,
        quantity: req.quantity,
        nonce: req.nonce,
        expiry: expiry_dt,
        signature: req.signature.clone(),
    };

    let order = insert_order(&state.pool, &new_order)
        .await
        .map_err(ApiError::Internal)?;

    // Broadcast updated order book
    let (bids, asks) = get_order_book_levels(&state.pool, &req.token_mint)
        .await
        .map_err(ApiError::Internal)?;
    let _ = state.ws_tx.send(WsEvent::OrderBook {
        token_mint: req.token_mint,
        bids: bids.iter().map(|b| PriceLevel { price_usdc: b.price_usdc, quantity: b.quantity }).collect(),
        asks: asks.iter().map(|a| PriceLevel { price_usdc: a.price_usdc, quantity: a.quantity }).collect(),
    });

    Ok(Json(json!({ "order": order })))
}

pub async fn get_order_book(
    State(state): State<AppState>,
    Path(token_mint): Path<String>,
) -> ApiResult<Json<Value>> {
    let (bids, asks) = get_order_book_levels(&state.pool, &token_mint)
        .await
        .map_err(ApiError::Internal)?;
    Ok(Json(json!({ "bids": bids, "asks": asks })))
}

pub async fn cancel_order(
    State(state): State<AppState>,
    Path(order_id): Path<Uuid>,
    Query(params): Query<CancelParams>,
) -> ApiResult<Json<Value>> {
    let trader_len = params.trader.len();
    if trader_len < 32 || trader_len > 44 {
        return Err(ApiError::BadRequest("invalid trader address".to_string()));
    }

    // Verify signature over "cancel:<order_id>"
    let cancel_msg = format!("cancel:{}", order_id);
    verify_signature(&params.trader, &params.signature, cancel_msg.as_bytes())?;

    let order = get_order(&state.pool, order_id)
        .await
        .map_err(|e| match e.downcast_ref::<sqlx::Error>() {
            Some(sqlx::Error::RowNotFound) => {
                ApiError::OrderNotFound(format!("order {} not found", order_id))
            }
            _ => ApiError::Internal(e),
        })?;

    if order.trader_wallet != params.trader {
        return Err(ApiError::InvalidSignature);
    }

    if order.status == "CANCELLED" {
        return Err(ApiError::OrderAlreadyCancelled);
    }

    let cancelled = db_cancel_order(&state.pool, order_id, &params.trader)
        .await
        .map_err(ApiError::Internal)?;

    if cancelled {
        // Broadcast updated order book
        let (bids, asks) = get_order_book_levels(&state.pool, &order.token_mint)
            .await
            .map_err(ApiError::Internal)?;
        let _ = state.ws_tx.send(WsEvent::OrderBook {
            token_mint: order.token_mint,
            bids: bids.iter().map(|b| PriceLevel { price_usdc: b.price_usdc, quantity: b.quantity }).collect(),
            asks: asks.iter().map(|a| PriceLevel { price_usdc: a.price_usdc, quantity: a.quantity }).collect(),
        });
    }

    Ok(Json(json!({ "cancelled": cancelled, "order_id": order_id })))
}

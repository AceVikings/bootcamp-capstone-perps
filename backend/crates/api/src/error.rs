use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("Invalid token mint: not registered in any active vault or claim node")]
    InvalidTokenMint,
    #[error("Invalid signature")]
    InvalidSignature,
    #[error("Order not found: {0}")]
    OrderNotFound(String),
    #[error("Vault not found: {0}")]
    VaultNotFound(String),
    #[error("Claim node not found: {0}")]
    ClaimNodeNotFound(String),
    #[error("Order already cancelled")]
    OrderAlreadyCancelled,
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            ApiError::InvalidTokenMint => (
                StatusCode::BAD_REQUEST,
                "token_mint not registered in any active vault or claim node".to_string(),
            ),
            ApiError::InvalidSignature => (
                StatusCode::BAD_REQUEST,
                "Ed25519 signature verification failed".to_string(),
            ),
            ApiError::OrderNotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            ApiError::VaultNotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            ApiError::ClaimNodeNotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            ApiError::OrderAlreadyCancelled => (
                StatusCode::CONFLICT,
                "order is already cancelled".to_string(),
            ),
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            ApiError::Database(e) => {
                tracing::error!(error = %e, "database error");
                (StatusCode::INTERNAL_SERVER_ERROR, "database error".to_string())
            }
            ApiError::Internal(e) => {
                tracing::error!(error = %e, "internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error".to_string())
            }
        };

        (status, Json(json!({ "error": message }))).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;

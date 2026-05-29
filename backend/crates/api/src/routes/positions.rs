use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::{json, Value};
use tpp_db::queries::get_vaults_by_minter;

use crate::{error::ApiResult, state::AppState};

pub async fn get_positions(
    State(state): State<AppState>,
    Path(wallet): Path<String>,
) -> ApiResult<Json<Value>> {
    // Basic input validation: Solana pubkeys are 32–44 base58 characters
    if wallet.len() < 32 || wallet.len() > 44 {
        return Err(crate::error::ApiError::BadRequest(
            "Invalid wallet address".to_string(),
        ));
    }

    let vaults = get_vaults_by_minter(&state.pool, &wallet).await?;
    Ok(Json(json!({ "positions": vaults })))
}

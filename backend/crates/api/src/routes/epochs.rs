use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::{json, Value};
use tpp_db::queries::{get_active_epochs, get_epoch_by_pda};

use crate::{error::ApiResult, state::AppState};

pub async fn list_active_epochs(
    State(state): State<AppState>,
) -> ApiResult<Json<Value>> {
    let epochs = get_active_epochs(&state.pool).await?;
    Ok(Json(json!({ "epochs": epochs })))
}

pub async fn get_epoch(
    State(state): State<AppState>,
    Path(pda): Path<String>,
) -> ApiResult<Json<Value>> {
    let epoch = get_epoch_by_pda(&state.pool, &pda)
        .await?
        .ok_or_else(|| crate::error::ApiError::NotFound(format!("Epoch {} not found", pda)))?;

    Ok(Json(json!({ "epoch": epoch })))
}

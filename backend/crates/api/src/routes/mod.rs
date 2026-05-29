pub mod analytics;
pub mod claims;
pub mod health;
pub mod orders;
pub mod trades;
pub mod vaults;

use axum::{
    routing::{delete, get, post},
    Router,
};

use crate::{state::AppState, ws};

pub fn router(state: AppState) -> Router {
    Router::new()
        // Health
        .route("/health", get(health::health_check))
        // Vaults
        .route("/vaults", get(vaults::list_vaults))
        .route("/vaults/:pubkey", get(vaults::get_vault))
        // Claims
        .route("/claims/:wallet", get(claims::get_claims))
        .route("/claims/:wallet/tree", get(claims::get_claim_tree_handler))
        .route("/claims/node/:pubkey", get(claims::get_single_claim_node))
        // Orders
        .route("/orders", post(orders::create_order))
        .route("/orders/:token_mint/book", get(orders::get_order_book))
        .route("/orders/:id", delete(orders::cancel_order))
        // Trades
        .route("/trades/:token_mint", get(trades::list_trades))
        // Analytics
        .route("/analytics", get(analytics::get_analytics))
        // WebSocket
        .route("/ws", get(ws::handler::ws_handler))
        .with_state(state)
}

pub mod analytics;
pub mod faucet;
pub mod health;
pub mod options_chain;
pub mod orders;
pub mod positions;
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
        // Faucet (devnet only)
        .route("/faucet", post(faucet::faucet))
        // Vaults
        .route("/vaults", get(vaults::list_vaults))
        .route("/vaults/by-mint/:mint", get(vaults::get_vault_by_mint))
        .route("/vaults/:pubkey", get(vaults::get_vault))
        .route("/vaults/:pubkey/nodes", get(vaults::get_vault_nodes))
        .route("/vaults/:pubkey/tree", get(vaults::get_vault_tree))
        // Positions (by wallet)
        .route("/positions/:wallet", get(positions::get_positions))
        // Orders
        .route("/orders", post(orders::create_order))
        .route("/orders/:token_mint/book", get(orders::get_order_book))
        .route("/orders/:token_mint/open", get(orders::list_open_orders))
        .route("/orders/:id", delete(orders::cancel_order))
        // Trades
        .route("/trades/:token_mint", get(trades::list_trades))
        // Options chain
        .route("/options-chain", get(options_chain::get_options_chain_handler))
        // Analytics
        .route("/analytics", get(analytics::get_analytics))
        // WebSocket
        .route("/ws", get(ws::handler::ws_handler))
        .with_state(state)
}

use axum::{
    routing::{delete, get, post},
    Router,
};
use tower_http::cors::CorsLayer;

use crate::state::AppState;

mod analytics;
mod epochs;
mod health;
mod orders;
mod positions;
mod trades;

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health::health_check))
        .route("/epochs", get(epochs::list_active_epochs))
        .route("/epochs/{pda}", get(epochs::get_epoch))
        .route("/positions/{wallet}", get(positions::get_positions))
        .route("/orders", post(orders::create_order))
        .route("/orders/{token_mint}/book", get(orders::get_order_book))
        .route("/orders/{id}", delete(orders::cancel_order))
        .route("/trades/{token_mint}", get(trades::recent_trades))
        .route("/analytics", get(analytics::get_analytics))
        .route("/ws", get(crate::ws::handler::ws_handler))
        .with_state(state)
        .layer(CorsLayer::permissive())
}

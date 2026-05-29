use axum::extract::ws::Message;
use fractal_db::Db;

/// Shared application state injected into Axum handlers via `State<AppState>`.
#[derive(Clone)]
pub struct AppState {
    pub pool: Db,
    pub ws_tx: tokio::sync::broadcast::Sender<WsEvent>,
}

/// Events broadcast over WebSocket to all connected clients.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WsEvent {
    OrderBook {
        token_mint: String,
        bids: Vec<PriceLevel>,
        asks: Vec<PriceLevel>,
    },
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PriceLevel {
    pub price_usdc: i64,
    pub quantity: i64,
}

impl WsEvent {
    /// Serialize this event to a WebSocket text message.
    pub fn to_ws_message(&self) -> Message {
        Message::Text(serde_json::to_string(self).unwrap_or_default().into())
    }
}

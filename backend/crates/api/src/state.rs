use axum::extract::ws::Message;
use tpp_db::Db;

/// Shared application state injected into Axum handlers via `State<AppState>`.
#[derive(Clone)]
pub struct AppState {
    pub pool: Db,
    pub ws_tx: tokio::sync::broadcast::Sender<WsEvent>,
    pub program_id: String,
}

/// Events broadcast over WebSocket to all connected clients.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsEvent {
    OraclePrice {
        asset_key: String,
        price_usd: i64,
        slot: i64,
    },
    OrderBookUpdate {
        token_mint: String,
        side: String,
        price_usd: i64,
        total_quantity: i64,
    },
    TradeExecuted {
        token_mint: String,
        price_usd: i64,
        quantity: i64,
        maker_wallet: String,
        taker_wallet: String,
    },
    VaultLiquidated {
        vault_pda: String,
        minter: String,
    },
}

impl WsEvent {
    /// Serialize this event to a WebSocket text message.
    pub fn to_ws_message(&self) -> Message {
        Message::Text(serde_json::to_string(self).unwrap_or_default().into())
    }
}

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Indexed Anchor event from the TPP program log stream.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProgramEvent {
    pub id: i64,
    pub tx_signature: String,
    pub event_type: String,
    pub slot: i64,
    pub block_time: DateTime<Utc>,
    pub data: serde_json::Value,
    pub indexed_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewProgramEvent {
    pub tx_signature: String,
    pub event_type: String,
    pub slot: i64,
    pub block_time: DateTime<Utc>,
    pub data: Value,
}

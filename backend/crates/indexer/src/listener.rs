//! Solana log-subscription listener.
//!
//! Uses `solana_client::nonblocking::pubsub_client::PubsubClient` to subscribe
//! to all logs mentioning the TPP program ID.  Each message is forwarded to
//! `processor::handle_log_notification` for parsing and DB persistence.

use anyhow::{Context, Result};
use solana_client::{
    nonblocking::pubsub_client::PubsubClient,
    rpc_config::{RpcTransactionLogsConfig, RpcTransactionLogsFilter},
};
use solana_commitment_config::CommitmentConfig;
use tpp_common::AppConfig;
use tpp_db::Db;
use tracing::{debug, info, warn};

use crate::processor;

/// Subscribe to the TPP program's transaction logs and process events until
/// the connection is dropped, returning an error for the caller to retry.
pub async fn run(config: &AppConfig, pool: Db) -> Result<()> {
    info!(ws_url = %config.solana.ws_url, "Connecting to Solana WebSocket");

    let client = PubsubClient::new(&config.solana.ws_url)
        .await
        .context("Failed to create PubsubClient")?;

    let filter = RpcTransactionLogsFilter::Mentions(vec![config.program.id.clone()]);
    let log_config = RpcTransactionLogsConfig {
        commitment: Some(CommitmentConfig::confirmed()),
    };

    let (mut notifications, _unsub) = client
        .logs_subscribe(filter, log_config)
        .await
        .context("Failed to subscribe to program logs")?;

    info!("Subscribed to program logs — waiting for events");

    use futures::StreamExt;
    while let Some(response) = notifications.next().await {
        let sig = &response.value.signature;
        let logs = &response.value.logs;

        debug!(signature = %sig, "Received log notification");

        if let Some(err) = &response.value.err {
            warn!(signature = %sig, error = ?err, "Transaction failed, skipping");
            continue;
        }

        // Extract "Program data: <base64>" lines emitted by Anchor events
        let data_lines: Vec<&str> = logs
            .iter()
            .filter_map(|line| line.strip_prefix("Program data: "))
            .collect();

        if data_lines.is_empty() {
            continue;
        }

        for data_b64 in data_lines {
            if let Err(e) =
                processor::handle_program_data(sig, data_b64, &pool).await
            {
                warn!(signature = %sig, error = %e, "Failed to process program data line");
            }
        }
    }

    Err(anyhow::anyhow!("WebSocket connection closed"))
}

//! Epoch keeper: scans for expired active epochs and deactivates them in the DB.
//!
//! Note: In the current protocol design, new epochs are created by the protocol admin
//! (or a permissioned crank) calling `create_epoch` on-chain.  This keeper only
//! performs the off-chain bookkeeping — marking epochs expired in the DB so the
//! API returns accurate state.
//!
//! TODO: When the protocol is updated to allow permissionless epoch rotation,
//! this keeper should also submit the `create_epoch` instruction.

use anyhow::Result;
use solana_sdk::signature::Keypair;
use tpp_common::AppConfig;
use tpp_db::Db;
use tracing::{info, warn};

pub async fn run(config: AppConfig, pool: Db, _keypair: Keypair) -> Result<()> {
    let interval = std::time::Duration::from_secs(config.keeper.epoch_interval_secs);
    info!(interval_secs = config.keeper.epoch_interval_secs, "Epoch keeper started");

    loop {
        tokio::time::sleep(interval).await;

        match check_expired_epochs(&pool).await {
            Ok(count) => {
                if count > 0 {
                    info!(deactivated = count, "Deactivated expired epochs");
                }
            }
            Err(e) => {
                warn!(error = %e, "Epoch keeper tick failed");
            }
        }
    }
}

/// Mark any epochs past their end_time as inactive in the DB.
async fn check_expired_epochs(pool: &Db) -> Result<u64> {
    let result = sqlx::query(
        r#"
        UPDATE epochs
        SET is_active = FALSE, updated_at = NOW()
        WHERE is_active = TRUE AND end_time < NOW()
        "#,
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}

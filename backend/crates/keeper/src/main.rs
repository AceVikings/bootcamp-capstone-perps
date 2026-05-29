use anyhow::{Context, Result};
use solana_sdk::signature::Signer;
use tpp_common::AppConfig;
use tpp_db::{connect, run_migrations};
use tracing::info;

mod epoch_keeper;
mod liquidation_keeper;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = AppConfig::from_env().context("Failed to load configuration")?;
    info!("Starting TPP keeper");

    let pool = connect(&config.database.url, config.database.pool_size)
        .await
        .context("Failed to connect to database")?;

    run_migrations(&pool)
        .await
        .context("Failed to run migrations")?;

    // Load keeper keypair
    let keypair_bytes = std::fs::read_to_string(&config.keeper.keypair_path)
        .context("Failed to read keeper keypair file")?;
    let keypair_vec: Vec<u8> =
        serde_json::from_str(&keypair_bytes).context("Failed to parse keypair JSON")?;
    let secret: [u8; 32] = keypair_vec
        .get(..32)
        .and_then(|b| b.try_into().ok())
        .context("Keypair file must contain at least 32 bytes")?;
    let keypair = solana_sdk::signature::Keypair::new_from_array(secret);

    info!(pubkey = %keypair.pubkey(), "Keeper wallet loaded");

    // Spawn keeper tasks concurrently
    let epoch_config = config.clone();
    let epoch_pool = pool.clone();
    let epoch_keypair = keypair.insecure_clone();
    let liq_config = config.clone();
    let liq_pool = pool.clone();

    let epoch_handle = tokio::spawn(async move {
        epoch_keeper::run(epoch_config, epoch_pool, epoch_keypair).await
    });

    let liq_handle = tokio::spawn(async move {
        liquidation_keeper::run(liq_config, liq_pool, keypair).await
    });

    // Wait for either task to complete (they loop forever unless error)
    tokio::select! {
        res = epoch_handle => {
            tracing::error!("Epoch keeper exited: {:?}", res);
        }
        res = liq_handle => {
            tracing::error!("Liquidation keeper exited: {:?}", res);
        }
    }

    Ok(())
}

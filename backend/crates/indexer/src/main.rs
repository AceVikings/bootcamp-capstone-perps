use anyhow::{Context, Result};
use fractal_common::AppConfig;
use fractal_db::{connect, run_migrations};
use tracing::info;

mod listener;
mod processor;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialise structured logging
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = AppConfig::from_env().context("Failed to load configuration")?;
    info!(program_id = %config.program.id, "Starting TPP indexer");

    let pool = connect(&config.database.url, config.database.pool_size)
        .await
        .context("Failed to connect to database")?;

    run_migrations(&pool)
        .await
        .context("Failed to run migrations")?;

    info!("Database connected and migrations applied");

    // Run the log-subscription listener, reconnecting on error.
    loop {
        match listener::run(&config, pool.clone()).await {
            Ok(()) => {
                info!("Indexer listener returned cleanly — restarting");
            }
            Err(e) => {
                tracing::error!(error = %e, "Indexer listener error — reconnecting in 5s");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    }
}

use anyhow::{Context, Result};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tpp_common::AppConfig;
use tpp_db::{connect, run_migrations};
use tpp_matcher::MatchEngine;
use tracing::info;

mod error;
mod routes;
mod state;
mod ws;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = AppConfig::from_env().context("Failed to load configuration")?;
    info!("Starting TPP API server");

    let pool = connect(&config.database.url, config.database.pool_size)
        .await
        .context("Failed to connect to database")?;

    run_migrations(&pool)
        .await
        .context("Failed to run migrations")?;

    // Build shared WebSocket broadcast channel
    let (ws_tx, _) = tokio::sync::broadcast::channel(1024);

    let app_state = state::AppState {
        pool: pool.clone(),
        ws_tx: ws_tx.clone(),
        program_id: config.program.id.clone(),
    };

    // Start the match engine in background
    let match_engine = MatchEngine::new(pool.clone(), 500);
    tokio::spawn(async move {
        if let Err(e) = match_engine.run().await {
            tracing::error!("Match engine error: {}", e);
        }
    });

    // Build Axum router
    let app = routes::build_router(app_state);

    let addr: SocketAddr = format!("{}:{}", config.api.host, config.api.port)
        .parse()
        .context("Invalid API address")?;

    info!(%addr, "Listening");
    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

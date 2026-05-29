use anyhow::{Context, Result};
use fractal_common::AppConfig;
use fractal_db::{connect, run_migrations};
use fractal_matcher::MatchEngine;
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
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

    let config = AppConfig::from_env().context("failed to load configuration")?;
    info!("Starting Fractal Markets API server");

    let pool = connect(&config.database.url, config.database.pool_size)
        .await
        .context("failed to connect to database")?;

    run_migrations(&pool)
        .await
        .context("failed to run migrations")?;

    let (ws_tx, _) = tokio::sync::broadcast::channel(1024);

    let app_state = state::AppState {
        pool: pool.clone(),
        ws_tx: ws_tx.clone(),
    };

    let match_engine = MatchEngine::new(pool.clone(), 500);
    tokio::spawn(async move {
        if let Err(e) = match_engine.run().await {
            tracing::error!("match engine error: {}", e);
        }
    });

    let app = routes::router(app_state)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        );

    let addr: SocketAddr = format!("{}:{}", config.api.host, config.api.port)
        .parse()
        .context("invalid API address")?;

    info!(%addr, "listening");
    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

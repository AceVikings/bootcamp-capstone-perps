pub mod models;
pub mod queries;

use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;

/// Database connection pool alias.
pub type Db = PgPool;

/// Create a new PostgreSQL connection pool.
///
/// Runs pending migrations automatically on startup.
pub async fn connect(database_url: &str, pool_size: u32) -> anyhow::Result<Db> {
    let pool = PgPoolOptions::new()
        .max_connections(pool_size)
        .acquire_timeout(Duration::from_secs(10))
        .connect(database_url)
        .await?;

    Ok(pool)
}

/// Run all pending sqlx migrations from the `migrations/` directory at the
/// workspace root.
pub async fn run_migrations(pool: &Db) -> anyhow::Result<()> {
    sqlx::migrate!("../../migrations").run(pool).await?;
    Ok(())
}

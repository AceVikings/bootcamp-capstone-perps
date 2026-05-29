use http::HeaderValue;
use serde::Deserialize;
use tower_http::cors::{AllowOrigin, CorsLayer};

/// Top-level application configuration.
/// Loaded from environment variables (with .env file support via dotenvy).
#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub database: DatabaseConfig,
    pub solana: SolanaConfig,
    pub program: ProgramConfig,
    pub api: ApiConfig,
    pub indexer: IndexerConfig,
    pub keeper: KeeperConfig,
    pub oracle: OracleConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    /// Max connections in the pool
    #[serde(default = "default_pool_size")]
    pub pool_size: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SolanaConfig {
    pub rpc_url: String,
    pub ws_url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProgramConfig {
    pub id: String,
    pub collateral_mint: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ApiConfig {
    #[serde(default = "default_api_host")]
    pub host: String,
    #[serde(default = "default_api_port")]
    pub port: u16,
    /// Comma-separated list of allowed origins for CORS
    pub cors_allowed_origins: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IndexerConfig {
    /// Start indexing from this slot (0 = from the stored cursor, else genesis)
    #[serde(default)]
    pub start_slot: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct KeeperConfig {
    /// Path to the keeper's Solana keypair JSON file
    pub keypair_path: String,
    /// Interval between epoch expiry checks (seconds)
    #[serde(default = "default_epoch_interval")]
    pub epoch_interval_secs: u64,
    /// Interval between liquidation scans (seconds)
    #[serde(default = "default_liq_interval")]
    pub liquidation_interval_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OracleConfig {
    /// How often to poll prices from Pyth (milliseconds)
    #[serde(default = "default_oracle_poll_ms")]
    pub poll_interval_ms: u64,
}

// ─── Defaults ────────────────────────────────────────────────────────────────

fn default_pool_size() -> u32 {
    10
}

fn default_api_host() -> String {
    "0.0.0.0".to_string()
}

fn default_api_port() -> u16 {
    8080
}

fn default_epoch_interval() -> u64 {
    60
}

fn default_liq_interval() -> u64 {
    30
}

fn default_oracle_poll_ms() -> u64 {
    2000
}

// ─── Loader ──────────────────────────────────────────────────────────────────

impl AppConfig {
    /// Load configuration from environment variables.
    /// Reads a `.env` file if present.
    pub fn from_env() -> anyhow::Result<Self> {
        // Load .env file if it exists (silently ignore if absent)
        let _ = dotenvy::dotenv();

        let cfg = config::Config::builder()
            .add_source(
                config::Environment::default()
                    .separator("__")
                    .try_parsing(true),
            )
            // Map flat env vars to nested config fields
            .set_override_option("database.url", std::env::var("DATABASE_URL").ok())?
            .set_override_option("solana.rpc_url", std::env::var("SOLANA_RPC_URL").ok())?
            .set_override_option("solana.ws_url", std::env::var("SOLANA_WS_URL").ok())?
            .set_override_option("program.id", std::env::var("PROGRAM_ID").ok())?
            .set_override_option(
                "program.collateral_mint",
                std::env::var("COLLATERAL_MINT").ok(),
            )?
            .set_override_option("api.host", std::env::var("API_HOST").ok())?
            .set_override_option("api.port", std::env::var("API_PORT").ok())?
            .set_override_option(
                "api.cors_allowed_origins",
                std::env::var("CORS_ALLOWED_ORIGINS").ok(),
            )?
            .set_override_option(
                "indexer.start_slot",
                std::env::var("INDEXER_START_SLOT").ok(),
            )?
            .set_override_option(
                "keeper.keypair_path",
                std::env::var("KEEPER_KEYPAIR_PATH").ok(),
            )?
            .set_override_option(
                "keeper.epoch_interval_secs",
                std::env::var("EPOCH_KEEPER_INTERVAL_SECS").ok(),
            )?
            .set_override_option(
                "keeper.liquidation_interval_secs",
                std::env::var("LIQUIDATION_KEEPER_INTERVAL_SECS").ok(),
            )?
            .set_override_option(
                "oracle.poll_interval_ms",
                std::env::var("ORACLE_POLL_INTERVAL_MS").ok(),
            )?
            .build()?;

        Ok(cfg.try_deserialize()?)
    }
}

impl ApiConfig {
    /// Build a [`CorsLayer`] from the configured allowed origins.
    /// A value of `"*"` (or no value) allows any origin.
    pub fn cors_layer(&self) -> CorsLayer {
        match &self.cors_allowed_origins {
            Some(origins) if origins.trim() != "*" && !origins.trim().is_empty() => {
                let list: Vec<HeaderValue> = origins
                    .split(',')
                    .filter_map(|o| o.trim().parse().ok())
                    .collect();
                CorsLayer::new()
                    .allow_origin(AllowOrigin::list(list))
                    .allow_methods(tower_http::cors::Any)
                    .allow_headers(tower_http::cors::Any)
            }
            _ => CorsLayer::permissive(),
        }
    }
}

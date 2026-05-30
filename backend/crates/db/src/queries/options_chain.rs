use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;

use crate::Db;

// ── Black-Scholes helpers ─────────────────────────────────────────────────────

/// Abramowitz & Stegun rational approximation of the standard normal CDF.
fn norm_cdf(x: f64) -> f64 {
    let t = 1.0 / (1.0 + 0.2316419 * x.abs());
    let poly = t * (0.319_381_530
        + t * (-0.356_563_782
            + t * (1.781_477_937 + t * (-1.821_255_978 + t * 1.330_274_429))));
    let pdf = (-0.5 * x * x).exp() / (2.0 * std::f64::consts::PI).sqrt();
    let cdf = 1.0 - pdf * poly;
    if x >= 0.0 { cdf } else { 1.0 - cdf }
}

/// Black-Scholes CALL premium in USD, r = 0.
pub fn bs_call(s: f64, k: f64, t_years: f64, sigma: f64) -> f64 {
    if t_years <= 0.0 {
        return (s - k).max(0.0);
    }
    let sqrt_t = t_years.sqrt();
    let d1 = ((s / k).ln() + 0.5 * sigma * sigma * t_years) / (sigma * sqrt_t);
    let d2 = d1 - sigma * sqrt_t;
    (s * norm_cdf(d1) - k * norm_cdf(d2)).max(0.0)
}

/// Black-Scholes PUT premium in USD, r = 0.
pub fn bs_put(s: f64, k: f64, t_years: f64, sigma: f64) -> f64 {
    if t_years <= 0.0 {
        return (k - s).max(0.0);
    }
    let sqrt_t = t_years.sqrt();
    let d1 = ((s / k).ln() + 0.5 * sigma * sigma * t_years) / (sigma * sqrt_t);
    let d2 = d1 - sigma * sqrt_t;
    (k * norm_cdf(-d2) - s * norm_cdf(-d1)).max(0.0)
}

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct OptionSide {
    pub vault_pubkey: Option<String>,
    /// The tradeable option token mint (CALL for LONG vault, PUT for SHORT vault).
    pub token_mint: Option<String>,
    /// Best bid in USD (None if no active buy orders).
    pub bid_usd: Option<f64>,
    /// Best ask in USD (None if no active sell orders).
    pub ask_usd: Option<f64>,
    /// Mid price in USD — actual mid if both bid/ask exist, else Black-Scholes theoretical.
    pub mid_usd: f64,
    /// 24-hour traded volume in USD.
    pub volume_24h_usd: f64,
    /// Total open interest (unfilled quantity) in USD.
    pub open_interest_usd: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChainCell {
    pub strike_usd: f64,
    pub expiry_days: i64,
    pub expiry_ts: i64,
    pub call: OptionSide,
    pub put: OptionSide,
}

#[derive(Debug, Serialize)]
pub struct OptionsChainResponse {
    /// Current SOL price in USD used for premium computation.
    pub underlying_price_usd: f64,
    /// All chain cells, sorted by (strike asc, expiry_days asc).
    pub chains: Vec<ChainCell>,
    /// Distinct expiry_days values present in `chains`.
    pub available_expiry_days: Vec<i64>,
}

// ── DB row types ──────────────────────────────────────────────────────────────

#[derive(Debug, FromRow)]
struct VaultWithNode {
    pub pubkey: String,
    pub strike: i64,
    pub expiry: DateTime<Utc>,
    pub vault_side: String,
    pub long_child_mint: Option<String>,
    pub short_child_mint: Option<String>,
}

#[derive(Debug, FromRow)]
struct BookRow {
    pub best_bid: Option<i64>,
    pub best_ask: Option<i64>,
}

// ── Main query ────────────────────────────────────────────────────────────────

/// Build the options chain for all active vaults with strikes $120–$240.
///
/// * `expiry_days_filter` – if `Some(n)`, only return cells whose `expiry_days`
///   is within ±1 day of `n` (to handle rounding at query time).
/// * `underlying_price_usd_micro` – current SOL price in micro-USD (6-decimal).
pub async fn get_options_chain(
    pool: &Db,
    expiry_days_filter: Option<i32>,
    underlying_price_usd_micro: i64,
) -> Result<OptionsChainResponse> {
    let now = Utc::now();
    let sigma = 0.85_f64;
    let s = underlying_price_usd_micro as f64 / 1_000_000.0;

    // ── 1. Fetch all active vaults in strike range with their first split node ──
    let vaults = sqlx::query_as::<_, VaultWithNode>(
        r#"
        SELECT
            v.pubkey,
            v.strike,
            v.expiry,
            v.vault_side,
            n.long_child_mint,
            n.short_child_mint
        FROM option_vaults v
        LEFT JOIN LATERAL (
            SELECT long_child_mint, short_child_mint
            FROM   option_nodes
            WHERE  vault_pubkey = v.pubkey
              AND  is_active    = TRUE
            ORDER  BY depth ASC, created_at ASC
            LIMIT  1
        ) n ON TRUE
        WHERE v.is_settled  = FALSE
          AND v.strike      >= 120000000
          AND v.strike      <= 240000000
          AND v.expiry      > NOW()
        ORDER BY v.strike ASC, v.expiry ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    // ── 2. Group by (strike, expiry_unix) → (LONG vault, SHORT vault) ─────────
    #[derive(Default)]
    struct Pair {
        long_vault: Option<VaultWithNode>,
        short_vault: Option<VaultWithNode>,
    }

    let mut pairs: HashMap<(i64, i64), Pair> = HashMap::new();
    for vault in vaults {
        let key = (vault.strike, vault.expiry.timestamp());
        let entry = pairs.entry(key).or_default();
        match vault.vault_side.as_str() {
            "LONG" => entry.long_vault = Some(vault),
            "SHORT" => entry.short_vault = Some(vault),
            _ => {}
        }
    }

    // ── 3. Build cells ─────────────────────────────────────────────────────────
    let mut cells: Vec<ChainCell> = Vec::with_capacity(pairs.len());
    let mut expiry_days_set: std::collections::HashSet<i64> = std::collections::HashSet::new();

    for ((strike_micro, expiry_ts), pair) in &pairs {
        let days_remaining = (*expiry_ts - now.timestamp()).max(0) / 86400;

        // Apply optional filter (±1 day tolerance for rounding)
        if let Some(filter) = expiry_days_filter {
            if (days_remaining - filter as i64).abs() > 1 {
                continue;
            }
        }

        let k = *strike_micro as f64 / 1_000_000.0;
        let t = days_remaining as f64 / 365.0;

        let theoretical_call = bs_call(s, k, t, sigma);
        let theoretical_put = bs_put(s, k, t, sigma);

        // ── CALL side (long_child_mint of LONG vault's first node) ──
        let call_side = build_option_side(
            pool,
            pair.long_vault.as_ref(),
            |v| v.long_child_mint.clone(),
            theoretical_call,
        )
        .await;

        // ── PUT side (short_child_mint of SHORT vault's first node) ──
        let put_side = build_option_side(
            pool,
            pair.short_vault.as_ref(),
            |v| v.short_child_mint.clone(),
            theoretical_put,
        )
        .await;

        expiry_days_set.insert(days_remaining);
        cells.push(ChainCell {
            strike_usd: k,
            expiry_days: days_remaining,
            expiry_ts: *expiry_ts,
            call: call_side,
            put: put_side,
        });
    }

    cells.sort_by(|a, b| {
        a.strike_usd
            .partial_cmp(&b.strike_usd)
            .unwrap()
            .then(a.expiry_days.cmp(&b.expiry_days))
    });

    let mut available_expiry_days: Vec<i64> = expiry_days_set.into_iter().collect();
    available_expiry_days.sort_unstable();

    Ok(OptionsChainResponse {
        underlying_price_usd: s,
        chains: cells,
        available_expiry_days,
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async fn build_option_side(
    pool: &Db,
    vault: Option<&VaultWithNode>,
    get_mint: impl Fn(&VaultWithNode) -> Option<String>,
    theoretical: f64,
) -> OptionSide {
    let vault_pubkey = vault.map(|v| v.pubkey.clone());
    let token_mint = vault.and_then(|v| get_mint(v));

    let (bid, ask, volume, oi) = match &token_mint {
        Some(mint) => {
            let book = fetch_best_prices(pool, mint).await.unwrap_or(BookRow {
                best_bid: None,
                best_ask: None,
            });
            let vol = fetch_volume_24h(pool, mint).await.unwrap_or(0);
            let open_int = fetch_open_interest(pool, mint).await.unwrap_or(0);
            (
                book.best_bid.map(|b| b as f64 / 1_000_000.0),
                book.best_ask.map(|a| a as f64 / 1_000_000.0),
                vol as f64 / 1_000_000.0,
                open_int as f64 / 1_000_000.0,
            )
        }
        None => (None, None, 0.0, 0.0),
    };

    let mid_usd = match (bid, ask) {
        (Some(b), Some(a)) => (b + a) / 2.0,
        (Some(b), None) => b,
        (None, Some(a)) => a,
        (None, None) => theoretical,
    };

    OptionSide {
        vault_pubkey,
        token_mint,
        bid_usd: bid,
        ask_usd: ask,
        mid_usd,
        volume_24h_usd: volume,
        open_interest_usd: oi,
    }
}

async fn fetch_best_prices(pool: &Db, token_mint: &str) -> Result<BookRow> {
    let row = sqlx::query_as::<_, BookRow>(
        r#"
        SELECT
            (SELECT price_usdc
             FROM   orders
             WHERE  token_mint = $1
               AND  side       = 'BUY'
               AND  status     IN ('OPEN', 'PARTIAL')
               AND  expiry     > NOW()
             ORDER  BY price_usdc DESC
             LIMIT  1) AS best_bid,
            (SELECT price_usdc
             FROM   orders
             WHERE  token_mint = $1
               AND  side       = 'SELL'
               AND  status     IN ('OPEN', 'PARTIAL')
               AND  expiry     > NOW()
             ORDER  BY price_usdc ASC
             LIMIT  1) AS best_ask
        "#,
    )
    .bind(token_mint)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

async fn fetch_volume_24h(pool: &Db, token_mint: &str) -> Result<i64> {
    let vol: i64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(price_usdc::numeric * quantity::numeric / 1000000), 0)::bigint
        FROM   trades
        WHERE  token_mint  = $1
          AND  settled_at >= NOW() - INTERVAL '24 hours'
        "#,
    )
    .bind(token_mint)
    .fetch_one(pool)
    .await?;
    Ok(vol)
}

async fn fetch_open_interest(pool: &Db, token_mint: &str) -> Result<i64> {
    let oi: i64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(quantity - filled_qty), 0)::bigint
        FROM   orders
        WHERE  token_mint = $1
          AND  status     IN ('OPEN', 'PARTIAL')
          AND  expiry     > NOW()
        "#,
    )
    .bind(token_mint)
    .fetch_one(pool)
    .await?;
    Ok(oi)
}

use anchor_lang::prelude::*;
use crate::errors::TppError;

// ─── Pyth push-oracle imports (only when `pyth` feature is enabled) ──────────
#[cfg(feature = "pyth")]
use pyth_sdk_solana::load_price_feed_from_account_info;

// ─── Validated oracle price result ───────────────────────────────────────────

/// Unified price result returned by all oracle backends.
pub struct OraclePrice {
    /// Price in USD with 6 decimal precision  (e.g. $100.00 = 100_000_000)
    pub price_usd: u64,
    /// Unix timestamp of the price reading
    pub timestamp: i64,
}

// ─── Mock oracle (localnet / unit tests) ─────────────────────────────────────

/// Reads and validates a mock oracle price account owned by this program.
///
/// Account layout (16 bytes):
///   [0..8]  price_usd  (u64 LE, 6-decimal USD)
///   [8..16] timestamp  (i64 LE, unix seconds)
///
/// Always compiled so tests never have to feature-gate their helpers.
pub fn get_mock_price(
    oracle_account: &AccountInfo,
    max_age_secs: u64,
    clock: &Clock,
) -> Result<OraclePrice> {
    let data = oracle_account.try_borrow_data()?;
    require!(data.len() >= 16, TppError::InvalidOraclePrice);

    let price = u64::from_le_bytes(data[0..8].try_into().unwrap());
    let timestamp = i64::from_le_bytes(data[8..16].try_into().unwrap());

    require!(price > 0, TppError::InvalidOraclePrice);

    let age = clock
        .unix_timestamp
        .checked_sub(timestamp)
        .ok_or(TppError::StalePriceData)?;

    require!(age >= 0 && age as u64 <= max_age_secs, TppError::StalePriceData);

    Ok(OraclePrice { price_usd: price, timestamp })
}

// ─── Pyth push-oracle (devnet / mainnet) ─────────────────────────────────────

/// Normalises a Pyth raw price/conf value to 6-decimal USD.
///
/// Pyth stores: value = raw * 10^expo
/// We want:     result = value / 10^(-6) = raw * 10^(expo+6)
///
/// Examples (expo = -8, typical for USD feeds):
///   SOL=$100  → raw=10_000_000_000, result = 10_000_000_000 / 100 = 100_000_000 ✓
///   BTC=$50k  → raw=5_000_000_000_000, result = 50_000_000_000_000 / 100 = 50_000_000_000 ✓
#[cfg(feature = "pyth")]
fn normalize_pyth_to_6dec(raw: u64, expo: i32) -> Result<u64> {
    let adjustment = expo.checked_add(6).ok_or(TppError::MathOverflow)?;
    if adjustment >= 0 {
        // Multiply: raw * 10^adjustment
        let factor = 10u64
            .checked_pow(adjustment as u32)
            .ok_or(TppError::MathOverflow)?;
        raw.checked_mul(factor).ok_or(error!(TppError::MathOverflow))
    } else {
        // Divide: raw / 10^|adjustment|  (truncating – acceptable for price feeds)
        let divisor = 10u64
            .checked_pow((-adjustment) as u32)
            .ok_or(TppError::MathOverflow)?;
        Ok(raw / divisor)
    }
}

/// Reads and validates a Pyth Network push-oracle price feed account.
///
/// The oracle account must be a Pyth price feed maintained by the Pyth oracle
/// network (program gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s on devnet).
///
/// Well-known devnet feed addresses:
///   SOL/USD  –  J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix
///   BTC/USD  –  HovQMDrbAgAYPCmaTupuf6WQ8mPT4Fo1VzrgnVqBivs7
///   ETH/USD  –  EdVCmQ9FSPcVe5YySXDPCRmc8aDQLKJ9xvYBMZPie1Vw
///   RNDR/USD –  CppyF6264uKZkGsnEkjxNXSWJHsqHsevRDCDDcpxHMr9
#[cfg(feature = "pyth")]
pub fn get_pyth_price(
    oracle_account: &AccountInfo,
    max_age_secs: u64,
    clock: &Clock,
    conf_denominator: u64,
) -> Result<OraclePrice> {
    let price_feed = load_price_feed_from_account_info(oracle_account)
        .map_err(|_| error!(TppError::InvalidOraclePrice))?;

    // get_price_no_older_than returns None if feed is stale
    let price = price_feed
        .get_price_no_older_than(clock.unix_timestamp, max_age_secs)
        .ok_or_else(|| error!(TppError::StalePriceData))?;

    require!(price.price > 0, TppError::InvalidOraclePrice);

    let price_usd = normalize_pyth_to_6dec(price.price as u64, price.expo)?;
    require!(price_usd > 0, TppError::InvalidOraclePrice);

    // Validate confidence interval when enabled (conf_denominator > 0)
    if conf_denominator > 0 {
        let conf_usd = normalize_pyth_to_6dec(price.conf, price.expo)?;
        check_confidence(price_usd, conf_usd, conf_denominator)?;
    }

    Ok(OraclePrice {
        price_usd,
        timestamp: clock.unix_timestamp,
    })
}

// ─── Unified dispatcher ───────────────────────────────────────────────────────

/// Reads and validates the oracle, dispatching to the correct backend:
///   - Feature `pyth` (devnet/mainnet): Pyth Network push-oracle price feed.
///   - Otherwise (default `mock-oracle`): 16-byte program-owned mock account.
///
/// All instructions call this function; the oracle account they pass must match
/// the active backend.
#[cfg(feature = "pyth")]
pub fn get_oracle_price(
    oracle_account: &AccountInfo,
    max_age_secs: u64,
    clock: &Clock,
    conf_denominator: u64,
) -> Result<OraclePrice> {
    get_pyth_price(oracle_account, max_age_secs, clock, conf_denominator)
}

#[cfg(not(feature = "pyth"))]
pub fn get_oracle_price(
    oracle_account: &AccountInfo,
    max_age_secs: u64,
    clock: &Clock,
    _conf_denominator: u64,
) -> Result<OraclePrice> {
    get_mock_price(oracle_account, max_age_secs, clock)
}

// ─── Shared validation helpers ────────────────────────────────────────────────

/// Rejects if price moved more than `circuit_breaker_bps` basis points
/// relative to the last recorded price within a 60-second window.
pub fn check_circuit_breaker(
    last_price: u64,
    last_price_ts: i64,
    current_price: u64,
    current_ts: i64,
    circuit_breaker_bps: u16,
) -> Result<()> {
    let elapsed = current_ts.saturating_sub(last_price_ts);
    // Only enforce within the 60-second window; skip if no baseline yet.
    if elapsed > 60 || last_price == 0 {
        return Ok(());
    }

    let diff = if current_price > last_price {
        current_price - last_price
    } else {
        last_price - current_price
    };

    // diff_bps = (diff * 10_000) / last_price
    let diff_bps = (diff as u128)
        .checked_mul(10_000)
        .and_then(|d| d.checked_div(last_price as u128))
        .ok_or(TppError::MathOverflow)? as u16;

    require!(diff_bps <= circuit_breaker_bps, TppError::CircuitBreakerTriggered);
    Ok(())
}

/// Validates oracle confidence interval.
/// Requires: conf < price / conf_denominator
/// e.g. conf_denominator = 100 → conf must be < 1 % of price.
/// Pass conf_denominator = 0 to disable (used in localnet tests).
pub fn check_confidence(price: u64, conf: u64, conf_denominator: u64) -> Result<()> {
    if conf_denominator == 0 {
        return Ok(());
    }
    let threshold = price
        .checked_div(conf_denominator)
        .ok_or(TppError::MathOverflow)?;
    require!(conf < threshold, TppError::PriceConfidenceTooWide);
    Ok(())
}

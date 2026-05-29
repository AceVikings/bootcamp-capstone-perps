use anchor_lang::prelude::*;
use crate::errors::FractalError;

// ─── Pyth pull-oracle: inline PriceUpdateV2 types (only when `pyth` enabled) ─
//
// We avoid the pyth-solana-receiver-sdk crate to prevent proc-macro2 version
// conflicts with Anchor 0.31.1. The structs below mirror the on-chain layout
// of Pyth Receiver program (rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ)
// PriceUpdateV2 accounts. As long as Pyth's schema is stable (v2), this is safe.

/// Pyth Receiver program ID – the owner of every PriceUpdateV2 account.
/// Same address on devnet and mainnet-beta.
#[cfg(feature = "pyth")]
const PYTH_RECEIVER_PROGRAM_ID: &str = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";

/// Inline mirror of pyth-solana-receiver-sdk's VerificationLevel enum.
#[cfg(feature = "pyth")]
#[derive(AnchorDeserialize)]
enum PythVerificationLevel {
    Partial { num_signatures: u8 },
    Full,
}

/// Inline mirror of pythnet-sdk's PriceFeedMessage (fields we need).
#[cfg(feature = "pyth")]
#[derive(AnchorDeserialize)]
struct PythPriceFeedMessage {
    pub feed_id: [u8; 32],
    pub price: i64,
    pub conf: u64,
    pub exponent: i32,
    pub publish_time: i64,
    pub prev_publish_time: i64,
    pub ema_price: i64,
    pub ema_conf: u64,
}

/// Inline mirror of pyth-solana-receiver-sdk's PriceUpdateV2 account.
/// Layout after 8-byte Anchor discriminator (Borsh):
///   write_authority: [u8; 32]
///   verification_level: PythVerificationLevel
///   price_message: PythPriceFeedMessage
///   posted_slot: u64
#[cfg(feature = "pyth")]
#[derive(AnchorDeserialize)]
struct PythPriceUpdateV2 {
    pub write_authority: [u8; 32],
    pub verification_level: PythVerificationLevel,
    pub price_message: PythPriceFeedMessage,
    pub posted_slot: u64,
}

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
    require!(data.len() >= 16, FractalError::InvalidOraclePrice);

    let price = u64::from_le_bytes(data[0..8].try_into().unwrap());
    let timestamp = i64::from_le_bytes(data[8..16].try_into().unwrap());

    require!(price > 0, FractalError::InvalidOraclePrice);

    let age = clock
        .unix_timestamp
        .checked_sub(timestamp)
        .ok_or(FractalError::StaleOraclePrice)?;

    require!(age >= 0 && age as u64 <= max_age_secs, FractalError::StaleOraclePrice);

    Ok(OraclePrice { price_usd: price, timestamp })
}

// ─── Pyth push-oracle (devnet / mainnet) ─────────────────────────────────────

/// Normalises a Pyth raw price/conf value to 6-decimal USD.
///
/// Pyth stores: value = raw * 10^exponent
/// We want:     result = value / 10^(-6) = raw * 10^(exponent+6)
///
/// Examples (exponent = -8, typical for USD feeds):
///   SOL=$100  → raw=10_000_000_000, result = 10_000_000_000 / 100 = 100_000_000 ✓
///   BTC=$50k  → raw=5_000_000_000_000, result = 50_000_000_000_000 / 100 = 50_000_000_000 ✓
#[cfg(feature = "pyth")]
fn normalize_pyth_to_6dec(raw: u64, exponent: i32) -> Result<u64> {
    let adjustment = exponent.checked_add(6).ok_or(FractalError::MathOverflow)?;
    if adjustment >= 0 {
        // Multiply: raw * 10^adjustment
        let factor = 10u64
            .checked_pow(adjustment as u32)
            .ok_or(FractalError::MathOverflow)?;
        raw.checked_mul(factor).ok_or(error!(FractalError::MathOverflow))
    } else {
        // Divide: raw / 10^|adjustment|  (truncating – acceptable for price feeds)
        let divisor = 10u64
            .checked_pow((-adjustment) as u32)
            .ok_or(FractalError::MathOverflow)?;
        Ok(raw / divisor)
    }
}

/// Reads and validates a Pyth Network pull-oracle PriceUpdateV2 account.
///
/// The `oracle_account` must be a freshly-posted PriceUpdateV2 owned by the
/// Pyth Receiver program (rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ).
///
/// The `feed_id` is the 32-byte Pyth price feed ID, stored in epoch.asset_key.
/// Callers must fetch a fresh price update from the Hermes API and post it to
/// Solana before calling any instruction that reads the oracle.
///
/// Pyth feed IDs (store as Pubkey in epoch.asset_key):
///   SOL/USD: ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
///   BTC/USD: e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
///   ETH/USD: ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
#[cfg(feature = "pyth")]
pub fn get_pyth_price(
    oracle_account: &AccountInfo,
    max_age_secs: u64,
    clock: &Clock,
    conf_denominator: u64,
    feed_id: &[u8; 32],
) -> Result<OraclePrice> {
    // 1. Verify the account is owned by the Pyth Receiver program.
    let expected_owner = PYTH_RECEIVER_PROGRAM_ID
        .parse::<Pubkey>()
        .map_err(|_| error!(FractalError::InvalidOraclePrice))?;
    require!(
        oracle_account.owner == &expected_owner,
        FractalError::InvalidOraclePrice
    );

    // 2. Deserialize as a PriceUpdateV2 (Borsh, skipping the 8-byte Anchor discriminator).
    let data = oracle_account.try_borrow_data()?;
    require!(data.len() > 8, FractalError::InvalidOraclePrice);
    let price_update = PythPriceUpdateV2::deserialize(&mut &data[8..])
        .map_err(|_| error!(FractalError::InvalidOraclePrice))?;

    let msg = &price_update.price_message;

    // 3. Verify this update is for the expected feed.
    require!(msg.feed_id == *feed_id, FractalError::InvalidOraclePrice);

    // 4. Check staleness: publish_time must be within max_age_secs of clock.
    let age = clock
        .unix_timestamp
        .checked_sub(msg.publish_time)
        .unwrap_or(i64::MAX);
    require!(age >= 0 && age as u64 <= max_age_secs, FractalError::StaleOraclePrice);

    require!(msg.price > 0, FractalError::InvalidOraclePrice);
    let price_usd = normalize_pyth_to_6dec(msg.price as u64, msg.exponent)?;
    require!(price_usd > 0, FractalError::InvalidOraclePrice);

    // 4. Validate confidence interval when enabled (conf_denominator > 0).
    if conf_denominator > 0 {
        let conf_usd = normalize_pyth_to_6dec(msg.conf, msg.exponent)?;
        check_confidence(price_usd, conf_usd, conf_denominator)?;
    }

    Ok(OraclePrice {
        price_usd,
        timestamp: clock.unix_timestamp,
    })
}

// ─── Unified dispatcher ───────────────────────────────────────────────────────

/// Reads and validates the oracle, dispatching to the correct backend:
///   - Feature `pyth` (devnet/mainnet): Pyth pull-oracle PriceUpdateV2 account.
///     Pass a freshly-posted PriceUpdateV2 from the Pyth Receiver program and
///     the 32-byte feed ID (epoch.asset_key bytes).
///   - Otherwise (default `mock-oracle`): 16-byte program-owned mock account.
///
/// All instructions call this function; the oracle account they pass must match
/// the active backend. `feed_id` is ignored in mock mode.
#[cfg(feature = "pyth")]
pub fn get_oracle_price(
    oracle_account: &AccountInfo,
    max_age_secs: u64,
    clock: &Clock,
    conf_denominator: u64,
    feed_id: &[u8; 32],
) -> Result<OraclePrice> {
    get_pyth_price(oracle_account, max_age_secs, clock, conf_denominator, feed_id)
}

#[cfg(not(feature = "pyth"))]
pub fn get_oracle_price(
    oracle_account: &AccountInfo,
    max_age_secs: u64,
    clock: &Clock,
    _conf_denominator: u64,
    _feed_id: &[u8; 32],
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
        .ok_or(FractalError::MathOverflow)? as u16;

    require!(diff_bps <= circuit_breaker_bps, FractalError::OracleConfidenceTooWide);
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
        .ok_or(FractalError::MathOverflow)?;
    require!(conf < threshold, FractalError::OracleConfidenceTooWide);
    Ok(())
}

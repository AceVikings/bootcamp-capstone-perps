use crate::models::{Epoch, NewEpoch};
use sqlx::PgPool;

/// Upsert an epoch row (insert or update on pda conflict).
pub async fn upsert_epoch(pool: &PgPool, epoch: &NewEpoch) -> anyhow::Result<Epoch> {
    let row = sqlx::query_as!(
        Epoch,
        r#"
        INSERT INTO epochs (
            epoch_id, asset_key, pda, reference_price,
            price_band_lower, price_band_upper,
            long_token_mint, short_token_mint,
            start_time, end_time
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (pda) DO UPDATE SET
            reference_price    = EXCLUDED.reference_price,
            price_band_lower   = EXCLUDED.price_band_lower,
            price_band_upper   = EXCLUDED.price_band_upper,
            long_token_mint    = EXCLUDED.long_token_mint,
            short_token_mint   = EXCLUDED.short_token_mint,
            start_time         = EXCLUDED.start_time,
            end_time           = EXCLUDED.end_time,
            updated_at         = NOW()
        RETURNING *
        "#,
        epoch.epoch_id,
        epoch.asset_key,
        epoch.pda,
        epoch.reference_price,
        epoch.price_band_lower,
        epoch.price_band_upper,
        epoch.long_token_mint,
        epoch.short_token_mint,
        epoch.start_time,
        epoch.end_time,
    )
    .fetch_one(pool)
    .await?;

    Ok(row)
}

/// Fetch all active epochs.
pub async fn get_active_epochs(pool: &PgPool) -> anyhow::Result<Vec<Epoch>> {
    let rows = sqlx::query_as!(
        Epoch,
        "SELECT * FROM epochs WHERE is_active = TRUE ORDER BY start_time DESC"
    )
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Fetch a single epoch by its on-chain PDA.
pub async fn get_epoch_by_pda(pool: &PgPool, pda: &str) -> anyhow::Result<Option<Epoch>> {
    let row = sqlx::query_as!(Epoch, "SELECT * FROM epochs WHERE pda = $1", pda)
        .fetch_optional(pool)
        .await?;

    Ok(row)
}

/// Fetch epochs for a given asset, optionally filtered to active only.
pub async fn get_epochs_by_asset(
    pool: &PgPool,
    asset_key: &str,
    active_only: bool,
) -> anyhow::Result<Vec<Epoch>> {
    let rows = if active_only {
        sqlx::query_as!(
            Epoch,
            "SELECT * FROM epochs WHERE asset_key = $1 AND is_active = TRUE ORDER BY start_time DESC",
            asset_key
        )
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as!(
            Epoch,
            "SELECT * FROM epochs WHERE asset_key = $1 ORDER BY start_time DESC",
            asset_key
        )
        .fetch_all(pool)
        .await?
    };

    Ok(rows)
}

/// Mark an epoch as inactive (expired / closed).
pub async fn deactivate_epoch(pool: &PgPool, pda: &str) -> anyhow::Result<()> {
    sqlx::query!(
        "UPDATE epochs SET is_active = FALSE, updated_at = NOW() WHERE pda = $1",
        pda
    )
    .execute(pool)
    .await?;

    Ok(())
}

/// Increment the epoch's running totals when a new position is minted.
pub async fn add_epoch_collateral(
    pool: &PgPool,
    epoch_pda: &str,
    collateral_delta: i64,
    long_supply_delta: i64,
    short_supply_delta: i64,
) -> anyhow::Result<()> {
    sqlx::query!(
        r#"
        UPDATE epochs SET
            total_collateral   = total_collateral + $2,
            long_token_supply  = long_token_supply + $3,
            short_token_supply = short_token_supply + $4,
            updated_at = NOW()
        WHERE pda = $1
        "#,
        epoch_pda,
        collateral_delta,
        long_supply_delta,
        short_supply_delta,
    )
    .execute(pool)
    .await?;

    Ok(())
}

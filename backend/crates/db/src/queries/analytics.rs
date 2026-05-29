use serde::Serialize;
use sqlx::PgPool;

/// High-level protocol stats for the dashboard.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ProtocolStats {
    pub total_tvl: Option<i64>,
    pub active_epoch_count: Option<i64>,
    pub total_vaults: Option<i64>,
    pub active_vaults: Option<i64>,
    pub liquidated_vaults: Option<i64>,
}

/// Volume and fees over a rolling period.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct VolumeStats {
    pub mint_volume: Option<i64>,
    pub redeem_volume: Option<i64>,
    pub liquidation_volume: Option<i64>,
    pub total_fees: Option<i64>,
}

/// Current TVL and vault stats.
pub async fn get_protocol_stats(pool: &PgPool) -> anyhow::Result<ProtocolStats> {
    let row = sqlx::query_as::<_, ProtocolStats>(
        r#"
        SELECT
            (SELECT SUM(total_collateral) FROM epochs WHERE is_active = TRUE)           AS total_tvl,
            (SELECT COUNT(*) FROM epochs WHERE is_active = TRUE)                        AS active_epoch_count,
            (SELECT COUNT(*) FROM vaults)                                               AS total_vaults,
            (SELECT COUNT(*) FROM vaults WHERE is_liquidated = FALSE)                   AS active_vaults,
            (SELECT COUNT(*) FROM vaults WHERE is_liquidated = TRUE)                    AS liquidated_vaults
        "#,
    )
    .fetch_one(pool)
    .await?;

    Ok(row)
}

/// 24-hour volume and fee stats from indexed events.
pub async fn get_volume_stats_24h(pool: &PgPool) -> anyhow::Result<VolumeStats> {
    let row = sqlx::query_as::<_, VolumeStats>(
        r#"
        SELECT
            COALESCE(SUM(CASE WHEN event_type = 'PositionMinted'
                THEN (data->>'collateral_amount')::bigint END), 0)     AS mint_volume,
            COALESCE(SUM(CASE WHEN event_type = 'PositionRedeemed'
                THEN (data->>'payout_gross')::bigint END), 0)          AS redeem_volume,
            COALESCE(SUM(CASE WHEN event_type = 'VaultLiquidated'
                THEN (data->>'remaining_collateral')::bigint END), 0)  AS liquidation_volume,
            COALESCE(SUM(CASE WHEN event_type IN ('PositionMinted','PositionRedeemed')
                THEN (data->>'fee')::bigint END), 0)                   AS total_fees
        FROM program_events
        WHERE block_time > NOW() - INTERVAL '24 hours'
        "#,
    )
    .fetch_one(pool)
    .await?;

    Ok(row)
}

/// TWAP: volume-weighted average price over last N minutes from oracle_prices.
pub async fn get_twap(
    pool: &PgPool,
    asset_key: &str,
    minutes: i64,
) -> anyhow::Result<Option<f64>> {
    let twap: Option<f64> = sqlx::query_scalar(
        r#"
        SELECT AVG(price_usd::float8)
        FROM oracle_prices
        WHERE asset_key = $1
          AND recorded_at > NOW() - ($2::bigint * INTERVAL '1 minute')
        "#,
    )
    .bind(asset_key)
    .bind(minutes)
    .fetch_one(pool)
    .await?;

    Ok(twap)
}

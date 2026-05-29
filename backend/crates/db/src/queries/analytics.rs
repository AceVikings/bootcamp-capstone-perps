use crate::Db;
use anyhow::Result;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ProtocolStats {
    pub tvl_usdc: i64,
    pub total_trades_24h: i64,
    pub total_volume_24h: i64,
    pub active_vaults: i64,
    pub total_claim_nodes: i64,
    pub active_claim_nodes: i64,
    pub unique_wallets: i64,
}

pub async fn get_protocol_stats(pool: &Db) -> Result<ProtocolStats> {
    let tvl: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(collateral_amount), 0) FROM root_vaults WHERE is_active = TRUE",
    )
    .fetch_one(pool)
    .await?;

    let active_vaults: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM root_vaults WHERE is_active = TRUE",
    )
    .fetch_one(pool)
    .await?;

    #[derive(sqlx::FromRow)]
    struct TradeStats { total_24h: i64, volume_24h: i64 }
    let trade_stats = sqlx::query_as::<_, TradeStats>(
        r#"
        SELECT
            COUNT(*)::bigint                        AS total_24h,
            COALESCE(SUM(price_usdc * quantity), 0)::bigint AS volume_24h
        FROM trades
        WHERE settled_at >= NOW() - INTERVAL '24 hours'
        "#,
    )
    .fetch_one(pool)
    .await?;

    #[derive(sqlx::FromRow)]
    struct NodeCounts { total: i64, active: i64 }
    let node_counts = sqlx::query_as::<_, NodeCounts>(
        r#"
        SELECT
            COUNT(*)::bigint                                          AS total,
            COUNT(*) FILTER (WHERE is_active = TRUE)::bigint AS active
        FROM claim_nodes
        "#,
    )
    .fetch_one(pool)
    .await?;

    let unique_wallets: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT owner_wallet) FROM root_vaults",
    )
    .fetch_one(pool)
    .await?;

    Ok(ProtocolStats {
        tvl_usdc: tvl,
        total_trades_24h: trade_stats.total_24h,
        total_volume_24h: trade_stats.volume_24h,
        active_vaults,
        total_claim_nodes: node_counts.total,
        active_claim_nodes: node_counts.active,
        unique_wallets,
    })
}

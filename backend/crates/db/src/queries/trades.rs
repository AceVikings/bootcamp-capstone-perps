use crate::models::{NewTrade, Trade};
use sqlx::PgPool;
use uuid::Uuid;

/// Record a new matched trade.
pub async fn insert_trade(pool: &PgPool, t: &NewTrade) -> anyhow::Result<Trade> {
    let id = Uuid::new_v4();
    let row = sqlx::query_as::<_, Trade>(
        r#"
        INSERT INTO trades (
            id, maker_order_id, taker_order_id,
            token_mint, token_type, epoch_id, asset_key,
            quantity, price_usd,
            maker_wallet, taker_wallet,
            settlement_deadline
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(t.maker_order_id)
    .bind(t.taker_order_id)
    .bind(&t.token_mint)
    .bind(&t.token_type)
    .bind(t.epoch_id)
    .bind(&t.asset_key)
    .bind(t.quantity)
    .bind(t.price_usd)
    .bind(&t.maker_wallet)
    .bind(&t.taker_wallet)
    .bind(t.settlement_deadline)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

/// Mark a trade as settled with the on-chain transaction signature.
pub async fn settle_trade(
    pool: &PgPool,
    id: Uuid,
    tx_signature: &str,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        UPDATE trades SET
            status       = 'SETTLED',
            tx_signature = $2,
            settled_at   = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(tx_signature)
    .execute(pool)
    .await?;

    Ok(())
}

/// Fetch recent trades for a token mint (for trade feed / price history).
pub async fn get_recent_trades(
    pool: &PgPool,
    token_mint: &str,
    limit: i64,
) -> anyhow::Result<Vec<Trade>> {
    let rows = sqlx::query_as::<_, Trade>(
        r#"
        SELECT * FROM trades
        WHERE token_mint = $1 AND status = 'SETTLED'
        ORDER BY settled_at DESC
        LIMIT $2
        "#,
    )
    .bind(token_mint)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Fetch all pending trades older than now (to expire or retry settlement).
pub async fn get_expired_pending_trades(pool: &PgPool) -> anyhow::Result<Vec<Trade>> {
    let rows = sqlx::query_as::<_, Trade>(
        r#"
        SELECT * FROM trades
        WHERE status IN ('PENDING', 'SETTLING')
          AND settlement_deadline < NOW()
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

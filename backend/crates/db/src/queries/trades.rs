use crate::models::trade::{NewTrade, Trade};
use crate::Db;
use anyhow::Result;

pub async fn insert_trade(pool: &Db, t: &NewTrade) -> Result<Trade> {
    let row = sqlx::query_as::<_, Trade>(
        r#"
        INSERT INTO trades (token_mint, buyer_wallet, seller_wallet, price_usdc, quantity, tx_signature)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        "#,
    )
    .bind(&t.token_mint)
    .bind(&t.buyer_wallet)
    .bind(&t.seller_wallet)
    .bind(t.price_usdc)
    .bind(t.quantity)
    .bind(&t.tx_signature)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn get_recent_trades(pool: &Db, token_mint: &str, limit: i64) -> Result<Vec<Trade>> {
    let rows = sqlx::query_as::<_, Trade>(
        "SELECT * FROM trades WHERE token_mint = $1 ORDER BY settled_at DESC LIMIT $2",
    )
    .bind(token_mint)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

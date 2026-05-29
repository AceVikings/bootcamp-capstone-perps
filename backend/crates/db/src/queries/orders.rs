use crate::models::order::{NewOrder, Order, OrderBookLevel};
use crate::Db;
use anyhow::Result;
use uuid::Uuid;

pub async fn insert_order(pool: &Db, o: &NewOrder) -> Result<Order> {
    let row = sqlx::query_as::<_, Order>(
        r#"
        INSERT INTO orders (
            trader_wallet, token_mint, side, price_usdc, quantity,
            nonce, expiry, signature
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        "#,
    )
    .bind(&o.trader_wallet)
    .bind(&o.token_mint)
    .bind(&o.side)
    .bind(o.price_usdc)
    .bind(o.quantity)
    .bind(o.nonce)
    .bind(o.expiry)
    .bind(&o.signature)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn get_order(pool: &Db, id: Uuid) -> Result<Order> {
    let row = sqlx::query_as::<_, Order>("SELECT * FROM orders WHERE id = $1")
        .bind(id)
        .fetch_one(pool)
        .await?;
    Ok(row)
}

pub async fn get_open_orders(pool: &Db, token_mint: &str) -> Result<Vec<Order>> {
    let rows = sqlx::query_as::<_, Order>(
        "SELECT * FROM orders WHERE token_mint = $1 AND status IN ('OPEN', 'PARTIAL') AND expiry > NOW() ORDER BY created_at ASC",
    )
    .bind(token_mint)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_order_book_levels(
    pool: &Db,
    token_mint: &str,
) -> Result<(Vec<OrderBookLevel>, Vec<OrderBookLevel>)> {
    let bids = sqlx::query_as::<_, OrderBookLevel>(
        r#"
        SELECT price_usdc, SUM(quantity - filled_qty)::bigint AS quantity
        FROM orders
        WHERE token_mint = $1 AND side = 'BUY' AND status IN ('OPEN', 'PARTIAL')
        GROUP BY price_usdc
        ORDER BY price_usdc DESC
        "#,
    )
    .bind(token_mint)
    .fetch_all(pool)
    .await?;

    let asks = sqlx::query_as::<_, OrderBookLevel>(
        r#"
        SELECT price_usdc, SUM(quantity - filled_qty)::bigint AS quantity
        FROM orders
        WHERE token_mint = $1 AND side = 'SELL' AND status IN ('OPEN', 'PARTIAL')
        GROUP BY price_usdc
        ORDER BY price_usdc ASC
        "#,
    )
    .bind(token_mint)
    .fetch_all(pool)
    .await?;

    Ok((bids, asks))
}

pub async fn cancel_order(pool: &Db, id: Uuid, trader_wallet: &str) -> Result<bool> {
    let result = sqlx::query(
        r#"
        UPDATE orders SET status = 'CANCELLED'
        WHERE id = $1 AND trader_wallet = $2 AND status IN ('OPEN', 'PARTIAL')
        "#,
    )
    .bind(id)
    .bind(trader_wallet)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn fill_order(pool: &Db, id: Uuid, fill_qty: i64, total_qty: i64) -> Result<()> {
    let new_status = if fill_qty >= total_qty { "FILLED" } else { "PARTIAL" };
    sqlx::query(
        r#"
        UPDATE orders
        SET filled_qty = filled_qty + $2,
            status = $3
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(fill_qty)
    .bind(new_status)
    .execute(pool)
    .await?;
    Ok(())
}

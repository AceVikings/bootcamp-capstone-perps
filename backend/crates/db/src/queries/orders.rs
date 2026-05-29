use crate::models::{NewOrder, Order, OrderBookLevel};
use sqlx::PgPool;
use uuid::Uuid;

/// Insert a new order.
pub async fn insert_order(pool: &PgPool, o: &NewOrder) -> anyhow::Result<Order> {
    let id = Uuid::new_v4();
    let row = sqlx::query_as::<_, Order>(
        r#"
        INSERT INTO orders (
            id, maker, token_mint, token_type, side,
            epoch_id, asset_key, quantity, price_usd,
            signature, expires_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(&o.maker)
    .bind(&o.token_mint)
    .bind(&o.token_type)
    .bind(&o.side)
    .bind(o.epoch_id)
    .bind(&o.asset_key)
    .bind(o.quantity)
    .bind(o.price_usd)
    .bind(&o.signature)
    .bind(o.expires_at)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

/// Fetch open orders for a token on a given side, sorted for matching:
/// - BUY orders: highest price first (best bid)
/// - SELL orders: lowest price first (best ask)
pub async fn get_open_orders(
    pool: &PgPool,
    token_mint: &str,
    side: &str,
) -> anyhow::Result<Vec<Order>> {
    // sqlx doesn't support dynamic ORDER BY direction via bind, so use two paths:
    let rows = if side == "BUY" {
        sqlx::query_as::<_, Order>(
            r#"
            SELECT * FROM orders
            WHERE token_mint = $1
              AND side = 'BUY'
              AND status IN ('OPEN', 'PARTIALLY_FILLED')
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY price_usd DESC, created_at ASC
            "#,
        )
        .bind(token_mint)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, Order>(
            r#"
            SELECT * FROM orders
            WHERE token_mint = $1
              AND side = 'SELL'
              AND status IN ('OPEN', 'PARTIALLY_FILLED')
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY price_usd ASC, created_at ASC
            "#,
        )
        .bind(token_mint)
        .fetch_all(pool)
        .await?
    };

    Ok(rows)
}

/// Aggregate order book levels (price → total quantity) for display.
pub async fn get_order_book_levels(
    pool: &PgPool,
    token_mint: &str,
    side: &str,
    depth: i64,
) -> anyhow::Result<Vec<OrderBookLevel>> {
    let rows = sqlx::query_as::<_, OrderBookLevel>(
        r#"
        SELECT
            price_usd,
            COALESCE(SUM(quantity - filled_qty), 0) AS total_quantity,
            COUNT(*) AS order_count
        FROM orders
        WHERE token_mint = $1
          AND side = $2
          AND status IN ('OPEN', 'PARTIALLY_FILLED')
          AND (expires_at IS NULL OR expires_at > NOW())
        GROUP BY price_usd
        ORDER BY price_usd DESC
        LIMIT $3
        "#,
    )
    .bind(token_mint)
    .bind(side)
    .bind(depth)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Cancel an order (only allowed if maker matches, status is OPEN/PARTIALLY_FILLED).
pub async fn cancel_order(pool: &PgPool, id: Uuid, maker: &str) -> anyhow::Result<bool> {
    let result = sqlx::query(
        r#"
        UPDATE orders SET status = 'CANCELLED', updated_at = NOW()
        WHERE id = $1 AND maker = $2 AND status IN ('OPEN', 'PARTIALLY_FILLED')
        "#,
    )
    .bind(id)
    .bind(maker)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

/// Partially fill an order by adding to filled_qty.
/// Transitions status to FILLED if fully filled.
pub async fn fill_order(pool: &PgPool, id: Uuid, fill_qty: i64) -> anyhow::Result<Order> {
    let row = sqlx::query_as::<_, Order>(
        r#"
        UPDATE orders SET
            filled_qty = filled_qty + $2,
            status = CASE
                WHEN filled_qty + $2 >= quantity THEN 'FILLED'
                ELSE 'PARTIALLY_FILLED'
            END,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(fill_qty)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

/// Get a single order by ID.
pub async fn get_order(pool: &PgPool, id: Uuid) -> anyhow::Result<Option<Order>> {
    let row = sqlx::query_as::<_, Order>("SELECT * FROM orders WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;

    Ok(row)
}

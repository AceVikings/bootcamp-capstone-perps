/// Integration tests for fractal-db query functions.
///
/// These tests use `#[sqlx::test]` which automatically:
///   1. Reads DATABASE_URL from the environment (or .env file via dotenvy).
///   2. Creates a fresh throw-away database for each test.
///   3. Runs all migrations from `../../migrations/`.
///   4. Drops the database when the test completes.
///
/// Run with:
///   DATABASE_URL=postgres://tpp:<password>@localhost:5432/tpp_protocol cargo test -p fractal-db
use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    models::{NewOptionNode, NewOptionVault, NewOrder, NewTrade},
    queries::{
        cancel_order, fill_order, get_open_orders, get_order, get_order_book_levels,
        get_recent_trades, insert_order, insert_trade,
        option_nodes::{get_option_node_by_child_mint, insert_option_node},
        option_vaults::{get_option_vault_by_root_mint, insert_option_vault},
    },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn future_expiry() -> chrono::DateTime<Utc> {
    Utc::now() + chrono::Duration::hours(24)
}

fn past_expiry() -> chrono::DateTime<Utc> {
    Utc::now() - chrono::Duration::hours(1)
}

fn buy_order(mint: &str, price: i64, qty: i64) -> NewOrder {
    NewOrder {
        trader_wallet: "BuyerWallet111111111111111111111111".to_string(),
        token_mint: mint.to_string(),
        side: "BUY".to_string(),
        price_usdc: price,
        quantity: qty,
        nonce: 1,
        expiry: future_expiry(),
        signature: "dummysig".to_string(),
    }
}

fn sell_order(mint: &str, price: i64, qty: i64) -> NewOrder {
    NewOrder {
        trader_wallet: "SellerWallet1111111111111111111111".to_string(),
        token_mint: mint.to_string(),
        side: "SELL".to_string(),
        price_usdc: price,
        quantity: qty,
        nonce: 1,
        expiry: future_expiry(),
        signature: "dummysig".to_string(),
    }
}

// ─── Order roundtrip ─────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../migrations")]
async fn test_insert_and_get_order(pool: PgPool) {
    let new = buy_order("MINT_A", 100, 50);
    let inserted = insert_order(&pool, &new).await.unwrap();

    assert_eq!(inserted.trader_wallet, new.trader_wallet);
    assert_eq!(inserted.token_mint, "MINT_A");
    assert_eq!(inserted.side, "BUY");
    assert_eq!(inserted.price_usdc, 100);
    assert_eq!(inserted.quantity, 50);
    assert_eq!(inserted.filled_qty, 0);
    assert_eq!(inserted.status, "OPEN");

    let fetched = get_order(&pool, inserted.id).await.unwrap();
    assert_eq!(fetched.id, inserted.id);
    assert_eq!(fetched.status, "OPEN");
}

// ─── cancel_order ────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../migrations")]
async fn test_cancel_open_order(pool: PgPool) {
    let order = insert_order(&pool, &buy_order("MINT_A", 100, 10)).await.unwrap();
    let cancelled = cancel_order(&pool, order.id, &order.trader_wallet).await.unwrap();
    assert!(cancelled);

    let fetched = get_order(&pool, order.id).await.unwrap();
    assert_eq!(fetched.status, "CANCELLED");
}

#[sqlx::test(migrations = "../../migrations")]
async fn test_cancel_wrong_wallet_returns_false(pool: PgPool) {
    let order = insert_order(&pool, &buy_order("MINT_A", 100, 10)).await.unwrap();
    let cancelled = cancel_order(&pool, order.id, "NotTheOwner1111111111111111111111").await.unwrap();
    assert!(!cancelled, "cancel with wrong wallet must return false");

    let fetched = get_order(&pool, order.id).await.unwrap();
    assert_eq!(fetched.status, "OPEN", "order must still be OPEN");
}

#[sqlx::test(migrations = "../../migrations")]
async fn test_cancel_nonexistent_order_returns_false(pool: PgPool) {
    let cancelled = cancel_order(
        &pool,
        Uuid::new_v4(),
        "BuyerWallet111111111111111111111111",
    )
    .await
    .unwrap();
    assert!(!cancelled);
}

// ─── fill_order — Bug fix tests ───────────────────────────────────────────────

/// An order filled 100% in a single fill must become FILLED.
#[sqlx::test(migrations = "../../migrations")]
async fn test_fill_order_full_in_one_shot(pool: PgPool) {
    let order = insert_order(&pool, &buy_order("MINT_B", 200, 100)).await.unwrap();
    fill_order(&pool, order.id, 100).await.unwrap();

    let fetched = get_order(&pool, order.id).await.unwrap();
    assert_eq!(fetched.filled_qty, 100);
    assert_eq!(fetched.status, "FILLED");
}

/// An order that receives two partial fills must end up FILLED on the second.
///
/// This is the critical regression test for the bug where `fill_qty >= total_qty`
/// compared the *increment* to the total — causing the second fill to leave the
/// order in PARTIAL status (e.g. 50 >= 100 is false even though filled_qty = 100).
#[sqlx::test(migrations = "../../migrations")]
async fn test_fill_order_partial_then_final_fill(pool: PgPool) {
    let order = insert_order(&pool, &buy_order("MINT_B", 200, 100)).await.unwrap();

    // First fill: 50/100 — should be PARTIAL
    fill_order(&pool, order.id, 50).await.unwrap();
    let after_first = get_order(&pool, order.id).await.unwrap();
    assert_eq!(after_first.filled_qty, 50);
    assert_eq!(after_first.status, "PARTIAL");

    // Second fill: 50/100 — now 100/100 — must be FILLED
    fill_order(&pool, order.id, 50).await.unwrap();
    let after_second = get_order(&pool, order.id).await.unwrap();
    assert_eq!(after_second.filled_qty, 100);
    assert_eq!(
        after_second.status, "FILLED",
        "order must be FILLED after cumulative fills reach quantity"
    );
}

/// A partial fill that doesn't reach the total must leave status as PARTIAL.
#[sqlx::test(migrations = "../../migrations")]
async fn test_fill_order_partial_only(pool: PgPool) {
    let order = insert_order(&pool, &buy_order("MINT_B", 200, 100)).await.unwrap();
    fill_order(&pool, order.id, 40).await.unwrap();

    let fetched = get_order(&pool, order.id).await.unwrap();
    assert_eq!(fetched.filled_qty, 40);
    assert_eq!(fetched.status, "PARTIAL");
}

/// Three sequential partial fills that together reach the total.
#[sqlx::test(migrations = "../../migrations")]
async fn test_fill_order_three_partial_fills(pool: PgPool) {
    let order = insert_order(&pool, &buy_order("MINT_C", 500, 300)).await.unwrap();

    fill_order(&pool, order.id, 100).await.unwrap();
    let s1 = get_order(&pool, order.id).await.unwrap();
    assert_eq!(s1.status, "PARTIAL");
    assert_eq!(s1.filled_qty, 100);

    fill_order(&pool, order.id, 100).await.unwrap();
    let s2 = get_order(&pool, order.id).await.unwrap();
    assert_eq!(s2.status, "PARTIAL");
    assert_eq!(s2.filled_qty, 200);

    fill_order(&pool, order.id, 100).await.unwrap();
    let s3 = get_order(&pool, order.id).await.unwrap();
    assert_eq!(s3.status, "FILLED");
    assert_eq!(s3.filled_qty, 300);
}

// ─── get_open_orders ─────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../migrations")]
async fn test_get_open_orders_excludes_cancelled(pool: PgPool) {
    let o1 = insert_order(&pool, &buy_order("MINT_D", 100, 10)).await.unwrap();
    let o2 = insert_order(&pool, &buy_order("MINT_D", 200, 20)).await.unwrap();
    cancel_order(&pool, o1.id, &o1.trader_wallet).await.unwrap();

    let open = get_open_orders(&pool, "MINT_D").await.unwrap();
    let ids: Vec<_> = open.iter().map(|o| o.id).collect();
    assert!(!ids.contains(&o1.id), "cancelled order must not appear");
    assert!(ids.contains(&o2.id), "open order must appear");
}

/// Expired orders must NOT appear in get_open_orders — the query already filters
/// by `expiry > NOW()`.
#[sqlx::test(migrations = "../../migrations")]
async fn test_get_open_orders_excludes_expired(pool: PgPool) {
    let active = insert_order(&pool, &buy_order("MINT_E", 100, 10)).await.unwrap();

    // Insert an expired order by constructing it with a past expiry
    let expired_new = NewOrder {
        trader_wallet: "BuyerWallet111111111111111111111111".to_string(),
        token_mint: "MINT_E".to_string(),
        side: "BUY".to_string(),
        price_usdc: 100,
        quantity: 5,
        nonce: 2,
        expiry: past_expiry(),
        signature: "sig2".to_string(),
    };
    insert_order(&pool, &expired_new).await.unwrap();

    let open = get_open_orders(&pool, "MINT_E").await.unwrap();
    assert_eq!(open.len(), 1);
    assert_eq!(open[0].id, active.id);
}

// ─── get_order_book_levels — Bug fix test ─────────────────────────────────────

/// Expired orders must NOT appear in the order book levels display.
///
/// This is the regression test for the missing `AND expiry > NOW()` filter.
#[sqlx::test(migrations = "../../migrations")]
async fn test_order_book_excludes_expired_orders(pool: PgPool) {
    // Active buy order
    insert_order(&pool, &buy_order("MINT_F", 100, 50)).await.unwrap();

    // Expired buy order at the same price
    let expired = NewOrder {
        trader_wallet: "BuyerWallet111111111111111111111111".to_string(),
        token_mint: "MINT_F".to_string(),
        side: "BUY".to_string(),
        price_usdc: 100,
        quantity: 999,
        nonce: 99,
        expiry: past_expiry(),
        signature: "expsig".to_string(),
    };
    insert_order(&pool, &expired).await.unwrap();

    let (bids, asks) = get_order_book_levels(&pool, "MINT_F").await.unwrap();

    assert_eq!(bids.len(), 1, "only one price level expected");
    assert_eq!(
        bids[0].quantity, 50,
        "expired order quantity must not be included"
    );
    assert!(asks.is_empty());
}

/// Order book groups quantities by price and returns bids DESC / asks ASC.
#[sqlx::test(migrations = "../../migrations")]
async fn test_order_book_levels_grouping_and_sort(pool: PgPool) {
    let mint = "MINT_G";

    // Two bids at price 200, one at price 100
    let mut b1 = buy_order(mint, 200, 30);
    let mut b2 = buy_order(mint, 200, 20);
    let b3 = buy_order(mint, 100, 10);
    b1.nonce = 1;
    b2.nonce = 2;
    insert_order(&pool, &b1).await.unwrap();
    insert_order(&pool, &b2).await.unwrap();
    insert_order(&pool, &b3).await.unwrap();

    // Two asks at price 300, one at price 400
    let mut s1 = sell_order(mint, 300, 15);
    let s2 = sell_order(mint, 400, 5);
    s1.nonce = 1;
    insert_order(&pool, &s1).await.unwrap();
    insert_order(&pool, &s2).await.unwrap();

    let (bids, asks) = get_order_book_levels(&pool, mint).await.unwrap();

    // Bids: price DESC
    assert_eq!(bids.len(), 2);
    assert_eq!(bids[0].price_usdc, 200);
    assert_eq!(bids[0].quantity, 50); // 30+20
    assert_eq!(bids[1].price_usdc, 100);
    assert_eq!(bids[1].quantity, 10);

    // Asks: price ASC
    assert_eq!(asks.len(), 2);
    assert_eq!(asks[0].price_usdc, 300);
    assert_eq!(asks[0].quantity, 15);
    assert_eq!(asks[1].price_usdc, 400);
    assert_eq!(asks[1].quantity, 5);
}

/// Filled orders must not appear in the order book.
#[sqlx::test(migrations = "../../migrations")]
async fn test_order_book_excludes_filled_orders(pool: PgPool) {
    let o = insert_order(&pool, &buy_order("MINT_H", 100, 50)).await.unwrap();
    fill_order(&pool, o.id, 50).await.unwrap();

    let (bids, _) = get_order_book_levels(&pool, "MINT_H").await.unwrap();
    assert!(bids.is_empty(), "fully filled order must not appear in book");
}

/// Partially filled order should show remaining quantity in the book.
#[sqlx::test(migrations = "../../migrations")]
async fn test_order_book_shows_remaining_quantity_for_partial(pool: PgPool) {
    let o = insert_order(&pool, &buy_order("MINT_I", 150, 100)).await.unwrap();
    fill_order(&pool, o.id, 60).await.unwrap();

    let (bids, _) = get_order_book_levels(&pool, "MINT_I").await.unwrap();
    assert_eq!(bids.len(), 1);
    assert_eq!(bids[0].quantity, 40, "book must show remaining quantity");
}

// ─── Trades ──────────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../migrations")]
async fn test_insert_and_get_recent_trades(pool: PgPool) {
    let t = NewTrade {
        token_mint: "MINT_J".to_string(),
        buyer_wallet: "Buyer1111111111111111111111111111111".to_string(),
        seller_wallet: "Seller111111111111111111111111111111".to_string(),
        price_usdc: 300,
        quantity: 25,
        tx_signature: None,
    };
    let inserted = insert_trade(&pool, &t).await.unwrap();
    assert_eq!(inserted.price_usdc, 300);
    assert_eq!(inserted.quantity, 25);

    let trades = get_recent_trades(&pool, "MINT_J", 10).await.unwrap();
    assert_eq!(trades.len(), 1);
    assert_eq!(trades[0].id, inserted.id);
}

#[sqlx::test(migrations = "../../migrations")]
async fn test_get_recent_trades_limit(pool: PgPool) {
    for i in 0..5i64 {
        let t = NewTrade {
            token_mint: "MINT_K".to_string(),
            buyer_wallet: "Buyer1111111111111111111111111111111".to_string(),
            seller_wallet: "Seller111111111111111111111111111111".to_string(),
            price_usdc: 100 + i,
            quantity: 1,
            tx_signature: None,
        };
        insert_trade(&pool, &t).await.unwrap();
    }
    let trades = get_recent_trades(&pool, "MINT_K", 3).await.unwrap();
    assert_eq!(trades.len(), 3, "limit must be respected");
}

#[sqlx::test(migrations = "../../migrations")]
async fn test_get_recent_trades_returns_empty_for_unknown_mint(pool: PgPool) {
    let trades = get_recent_trades(&pool, "UNKNOWN_MINT", 10).await.unwrap();
    assert!(trades.is_empty());
}

// ─── Option Vault by Root Mint ────────────────────────────────────────────────

/// Inserting a vault and resolving it by its root_mint must return the same vault.
#[sqlx::test(migrations = "../../migrations")]
async fn test_get_option_vault_by_root_mint_found(pool: PgPool) {
    let vault = NewOptionVault {
        pubkey: "VAULT_PUBKEY_111111111111111111111".to_string(),
        vault_id: 1,
        owner_wallet: "OWNER_WALLET_111111111111111111111".to_string(),
        vault_side: "LONG".to_string(),
        collateral_mint: "USDC_MINT_11111111111111111111111".to_string(),
        collateral_amount: 100_000_000,
        root_mint: "ROOT_MINT_1111111111111111111111111".to_string(),
        asset_feed: "FEED_PUBKEY_111111111111111111111".to_string(),
        strike: 180_000_000,
        expiry: Utc::now() + chrono::Duration::days(30),
        created_at: Utc::now(),
    };
    insert_option_vault(&pool, &vault).await.unwrap();

    let found = get_option_vault_by_root_mint(&pool, &vault.root_mint)
        .await
        .unwrap();

    assert!(found.is_some(), "vault must be found by root_mint");
    let v = found.unwrap();
    assert_eq!(v.pubkey, vault.pubkey);
    assert_eq!(v.root_mint, vault.root_mint);
    assert_eq!(v.collateral_amount, 100_000_000);
}

/// Querying a mint that was never inserted must return None, not an error.
#[sqlx::test(migrations = "../../migrations")]
async fn test_get_option_vault_by_root_mint_not_found(pool: PgPool) {
    let found = get_option_vault_by_root_mint(&pool, "NONEXISTENT_MINT_111111111111111")
        .await
        .unwrap();
    assert!(found.is_none(), "unknown mint must yield None");
}

// ─── Option Node by Child Mint ────────────────────────────────────────────────

/// Helper: insert a vault row first (FK required by option_nodes).
async fn insert_test_vault(pool: &PgPool, pubkey: &str) {
    let vault = NewOptionVault {
        pubkey: pubkey.to_string(),
        vault_id: 99,
        owner_wallet: "TEST_OWNER_111111111111111111111111".to_string(),
        vault_side: "LONG".to_string(),
        collateral_mint: "USDC_MINT_11111111111111111111111".to_string(),
        collateral_amount: 50_000_000,
        root_mint: format!("{}_ROOT", pubkey),
        asset_feed: "FEED_PUBKEY_111111111111111111111".to_string(),
        strike: 200_000_000,
        expiry: Utc::now() + chrono::Duration::days(7),
        created_at: Utc::now(),
    };
    insert_option_vault(pool, &vault).await.unwrap();
}

/// Resolving a long_child_mint must return the correct node and `long_child` role.
#[sqlx::test(migrations = "../../migrations")]
async fn test_get_option_node_by_long_child_mint(pool: PgPool) {
    insert_test_vault(&pool, "VAULT_NODE_TEST_11111111111111111").await;

    let node = NewOptionNode {
        pubkey: "NODE_PUBKEY_111111111111111111111".to_string(),
        node_id: 1,
        vault_pubkey: "VAULT_NODE_TEST_11111111111111111".to_string(),
        vault_id: 99,
        owner_wallet: "CHARLIE_WALLET_111111111111111111".to_string(),
        depth: 2,
        parent_node: None,
        vault_side: "LONG".to_string(),
        long_child_mint: "LONG_CHILD_MINT_1111111111111111111".to_string(),
        short_child_mint: "SHORT_CHILD_MINT_111111111111111111".to_string(),
        long_backing: 25_000_000,
        short_backing: 25_000_000,
        parent_strike: 180_000_000,
        child_strike: 190_000_000,
        creation_price: 185_000_000,
        created_at: Utc::now(),
    };
    insert_option_node(&pool, &node).await.unwrap();

    // Resolve by long_child_mint
    let found = get_option_node_by_child_mint(&pool, &node.long_child_mint)
        .await
        .unwrap();

    assert!(found.is_some(), "node must be found by long_child_mint");
    let n = found.unwrap();
    assert_eq!(n.pubkey, node.pubkey);
    assert_eq!(n.long_child_mint, node.long_child_mint);
    assert_eq!(n.owner_wallet, "CHARLIE_WALLET_111111111111111111");

    // long_child_mint == the queried mint → caller can infer "long_child" role
    assert_eq!(n.long_child_mint, node.long_child_mint);
}

/// Resolving a short_child_mint must also return the correct node.
#[sqlx::test(migrations = "../../migrations")]
async fn test_get_option_node_by_short_child_mint(pool: PgPool) {
    insert_test_vault(&pool, "VAULT_NODE_TEST2_1111111111111111").await;

    let node = NewOptionNode {
        pubkey: "NODE_PUBKEY_222222222222222222222".to_string(),
        node_id: 2,
        vault_pubkey: "VAULT_NODE_TEST2_1111111111111111".to_string(),
        vault_id: 99,
        owner_wallet: "BOB_WALLET_11111111111111111111111".to_string(),
        depth: 2,
        parent_node: None,
        vault_side: "SHORT".to_string(),
        long_child_mint: "LONG_CHILD_MINT_2222222222222222222".to_string(),
        short_child_mint: "SHORT_CHILD_MINT_22222222222222222".to_string(),
        long_backing: 10_000_000,
        short_backing: 10_000_000,
        parent_strike: 180_000_000,
        child_strike: 170_000_000,
        creation_price: 175_000_000,
        created_at: Utc::now(),
    };
    insert_option_node(&pool, &node).await.unwrap();

    let found = get_option_node_by_child_mint(&pool, &node.short_child_mint)
        .await
        .unwrap();

    assert!(found.is_some(), "node must be found by short_child_mint");
    let n = found.unwrap();
    assert_eq!(n.pubkey, node.pubkey);
    assert_eq!(n.short_child_mint, node.short_child_mint);
}

/// Querying a mint that belongs to no node must return None.
#[sqlx::test(migrations = "../../migrations")]
async fn test_get_option_node_by_child_mint_not_found(pool: PgPool) {
    let found = get_option_node_by_child_mint(&pool, "COMPLETELY_UNKNOWN_MINT_1111111111")
        .await
        .unwrap();
    assert!(found.is_none(), "unknown child mint must yield None");
}

/// The /vaults/by-mint/:mint route resolves root_mint → vault with mint_role "root".
/// Smoke-tested here at the DB layer: root_mint inserted into option_vaults
/// must be returned by get_option_vault_by_root_mint (used by the route).
#[sqlx::test(migrations = "../../migrations")]
async fn test_mint_resolution_root_mint_takes_priority_over_nodes(pool: PgPool) {
    // Insert a vault whose root_mint is the queried mint
    let vault_pubkey = "VAULT_ROOT_PRIO_11111111111111111";
    let root_mint = "ROOT_MINT_PRIO_111111111111111111111";
    insert_option_vault(&pool, &NewOptionVault {
        pubkey: vault_pubkey.to_string(),
        vault_id: 42,
        owner_wallet: "ALICE_WALLET_111111111111111111111".to_string(),
        vault_side: "LONG".to_string(),
        collateral_mint: "USDC_MINT_11111111111111111111111".to_string(),
        collateral_amount: 100_000_000,
        root_mint: root_mint.to_string(),
        asset_feed: "FEED_PUBKEY_111111111111111111111".to_string(),
        strike: 180_000_000,
        expiry: Utc::now() + chrono::Duration::days(30),
        created_at: Utc::now(),
    })
    .await
    .unwrap();

    // Also insert a node whose long_child_mint happens to be the same string
    // (adversarial case: root_mint lookup must fire before child_mint lookup)
    insert_option_node(&pool, &NewOptionNode {
        pubkey: "NODE_PRIO_11111111111111111111111".to_string(),
        node_id: 10,
        vault_pubkey: vault_pubkey.to_string(),
        vault_id: 42,
        owner_wallet: "ALICE_WALLET_111111111111111111111".to_string(),
        depth: 2,
        parent_node: None,
        vault_side: "LONG".to_string(),
        long_child_mint: root_mint.to_string(), // same as root_mint (edge case)
        short_child_mint: "OTHER_SHORT_MINT_111111111111111111".to_string(),
        long_backing: 50_000_000,
        short_backing: 50_000_000,
        parent_strike: 180_000_000,
        child_strike: 190_000_000,
        creation_price: 185_000_000,
        created_at: Utc::now(),
    })
    .await
    .unwrap();

    // Root-mint lookup must succeed (API route checks root_mint first)
    let vault_by_root = get_option_vault_by_root_mint(&pool, root_mint)
        .await
        .unwrap();
    assert!(vault_by_root.is_some(), "root_mint must resolve to a vault");
    assert_eq!(vault_by_root.unwrap().pubkey, vault_pubkey);
}

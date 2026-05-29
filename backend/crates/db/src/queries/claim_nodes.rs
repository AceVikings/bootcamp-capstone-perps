use crate::models::claim_node::{ClaimNodeRow, NewClaimNode};
use crate::Db;
use anyhow::Result;
use fractal_common::ClaimNode;

pub async fn insert_claim_node(pool: &Db, n: &NewClaimNode) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO claim_nodes (
            pubkey, node_id, root_vault, root_id, owner_wallet, depth,
            parent_node, claim_type, source_mint, left_child_mint,
            right_child_mint, creation_price, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (pubkey) DO NOTHING
        "#,
    )
    .bind(&n.pubkey)
    .bind(n.node_id)
    .bind(&n.root_vault)
    .bind(n.root_id)
    .bind(&n.owner_wallet)
    .bind(n.depth)
    .bind(&n.parent_node)
    .bind(&n.claim_type)
    .bind(&n.source_mint)
    .bind(&n.left_child_mint)
    .bind(&n.right_child_mint)
    .bind(n.creation_price)
    .bind(n.created_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn deactivate_claim_node(pool: &Db, pubkey: &str) -> Result<()> {
    sqlx::query("UPDATE claim_nodes SET is_active = FALSE WHERE pubkey = $1")
        .bind(pubkey)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_claim_node(pool: &Db, pubkey: &str) -> Result<ClaimNode> {
    let row = sqlx::query_as::<_, ClaimNodeRow>(
        "SELECT * FROM claim_nodes WHERE pubkey = $1",
    )
    .bind(pubkey)
    .fetch_one(pool)
    .await?;
    Ok(row.try_into()?)
}

pub async fn get_all_claims_for_wallet(pool: &Db, wallet: &str) -> Result<Vec<ClaimNode>> {
    let rows = sqlx::query_as::<_, ClaimNodeRow>(
        "SELECT * FROM claim_nodes WHERE owner_wallet = $1 ORDER BY created_at ASC",
    )
    .bind(wallet)
    .fetch_all(pool)
    .await?;
    rows.into_iter().map(|r| r.try_into().map_err(Into::into)).collect()
}

pub async fn get_claim_tree(pool: &Db, wallet: &str, root_vault: &str) -> Result<Vec<ClaimNode>> {
    let rows = sqlx::query_as::<_, ClaimNodeRow>(
        r#"
        SELECT * FROM claim_nodes
        WHERE owner_wallet = $1
          AND root_vault = $2
        ORDER BY depth ASC, created_at ASC
        "#,
    )
    .bind(wallet)
    .bind(root_vault)
    .fetch_all(pool)
    .await?;
    rows.into_iter().map(|r| r.try_into().map_err(Into::into)).collect()
}

/// Returns true if `mint` appears as a known claim token in any active vault/node.
pub async fn is_known_claim_mint(pool: &Db, mint: &str) -> Result<bool> {
    let count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM (
            SELECT long_mint  AS mint FROM root_vaults WHERE is_active = TRUE
            UNION ALL
            SELECT short_mint FROM root_vaults WHERE is_active = TRUE
            UNION ALL
            SELECT left_child_mint  FROM claim_nodes WHERE is_active = TRUE
            UNION ALL
            SELECT right_child_mint FROM claim_nodes WHERE is_active = TRUE
        ) mints
        WHERE mint = $1
        "#,
    )
    .bind(mint)
    .fetch_one(pool)
    .await?;
    Ok(count > 0)
}

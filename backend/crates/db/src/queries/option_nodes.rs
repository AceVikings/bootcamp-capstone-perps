use anyhow::Result;

use crate::{
    models::{NewOptionNode, OptionNodeRow},
    Db,
};

pub async fn insert_option_node(pool: &Db, n: &NewOptionNode) -> Result<()> {
    sqlx::query!(
        r#"
        INSERT INTO option_nodes
            (pubkey, node_id, vault_pubkey, vault_id, owner_wallet, depth, parent_node,
             vault_side, long_child_mint, short_child_mint, long_backing, short_backing,
             parent_strike, child_strike, creation_price, created_at)
        VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (pubkey) DO NOTHING
        "#,
        n.pubkey,
        n.node_id,
        n.vault_pubkey,
        n.vault_id,
        n.owner_wallet,
        n.depth,
        n.parent_node,
        n.vault_side,
        n.long_child_mint,
        n.short_child_mint,
        n.long_backing,
        n.short_backing,
        n.parent_strike,
        n.child_strike,
        n.creation_price,
        n.created_at,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_option_nodes_for_vault(
    pool: &Db,
    vault_pubkey: &str,
) -> Result<Vec<fractal_common::OptionNode>> {
    let rows = sqlx::query_as!(
        OptionNodeRow,
        "SELECT * FROM option_nodes WHERE vault_pubkey = $1 ORDER BY depth, created_at",
        vault_pubkey
    )
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(fractal_common::OptionNode::try_from)
        .collect()
}

pub async fn get_option_nodes_for_owner(
    pool: &Db,
    wallet: &str,
) -> Result<Vec<fractal_common::OptionNode>> {
    let rows = sqlx::query_as!(
        OptionNodeRow,
        "SELECT * FROM option_nodes WHERE owner_wallet = $1 AND is_active = TRUE ORDER BY created_at DESC",
        wallet
    )
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(fractal_common::OptionNode::try_from)
        .collect()
}

/// Find the option node that produced `mint` as its long or short child.
/// Returns `None` when the mint is not a child of any known split.
pub async fn get_option_node_by_child_mint(
    pool: &Db,
    mint: &str,
) -> Result<Option<fractal_common::OptionNode>> {
    let row = sqlx::query_as!(
        OptionNodeRow,
        r#"
        SELECT * FROM option_nodes
        WHERE long_child_mint = $1 OR short_child_mint = $1
        LIMIT 1
        "#,
        mint
    )
    .fetch_optional(pool)
    .await?;
    row.map(fractal_common::OptionNode::try_from).transpose()
}

pub async fn deactivate_option_node(pool: &Db, pubkey: &str) -> Result<()> {
    sqlx::query!(
        "UPDATE option_nodes SET is_active = FALSE WHERE pubkey = $1",
        pubkey
    )
    .execute(pool)
    .await?;
    Ok(())
}

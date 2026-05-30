use anyhow::Result;

use crate::{
    models::{NewOptionVault, OptionVaultRow},
    Db,
};

pub async fn insert_option_vault(pool: &Db, v: &NewOptionVault) -> Result<()> {
    sqlx::query!(
        r#"
        INSERT INTO option_vaults
            (pubkey, vault_id, owner_wallet, vault_side, collateral_mint,
             collateral_amount, root_mint, asset_feed, strike, expiry, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (pubkey) DO NOTHING
        "#,
        v.pubkey,
        v.vault_id,
        v.owner_wallet,
        v.vault_side,
        v.collateral_mint,
        v.collateral_amount,
        v.root_mint,
        v.asset_feed,
        v.strike,
        v.expiry,
        v.created_at,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_option_vault(
    pool: &Db,
    pubkey: &str,
) -> Result<fractal_common::OptionVault> {
    let row = sqlx::query_as!(
        OptionVaultRow,
        "SELECT * FROM option_vaults WHERE pubkey = $1",
        pubkey
    )
    .fetch_one(pool)
    .await?;
    fractal_common::OptionVault::try_from(row)
}

pub async fn list_option_vaults(pool: &Db) -> Result<Vec<fractal_common::OptionVault>> {
    let rows = sqlx::query_as!(
        OptionVaultRow,
        "SELECT * FROM option_vaults ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(fractal_common::OptionVault::try_from)
        .collect()
}

pub async fn list_option_vaults_by_owner(
    pool: &Db,
    wallet: &str,
) -> Result<Vec<fractal_common::OptionVault>> {
    let rows = sqlx::query_as!(
        OptionVaultRow,
        "SELECT * FROM option_vaults WHERE owner_wallet = $1 ORDER BY created_at DESC",
        wallet
    )
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(fractal_common::OptionVault::try_from)
        .collect()
}

/// Look up a vault by its root_mint.  Returns `None` when not found.
pub async fn get_option_vault_by_root_mint(
    pool: &Db,
    mint: &str,
) -> Result<Option<fractal_common::OptionVault>> {
    let row = sqlx::query_as!(
        OptionVaultRow,
        "SELECT * FROM option_vaults WHERE root_mint = $1",
        mint
    )
    .fetch_optional(pool)
    .await?;
    row.map(fractal_common::OptionVault::try_from).transpose()
}

pub async fn mark_vault_settled(
    pool: &Db,
    pubkey: &str,
    settlement_price: i64,
) -> Result<()> {
    sqlx::query!(
        "UPDATE option_vaults SET is_settled = TRUE, settlement_price = $1 WHERE pubkey = $2",
        settlement_price,
        pubkey
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Returns true if `mint` matches the `root_mint` of any option vault.
/// Used by the order route to validate that an incoming order's token_mint
/// is a recognised protocol mint.
pub async fn is_known_option_mint(pool: &Db, mint: &str) -> Result<bool> {
    let row = sqlx::query!(
        "SELECT EXISTS(SELECT 1 FROM option_vaults WHERE root_mint = $1) AS exists",
        mint
    )
    .fetch_one(pool)
    .await?;
    Ok(row.exists.unwrap_or(false))
}

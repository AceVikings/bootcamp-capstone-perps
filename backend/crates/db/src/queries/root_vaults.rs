use crate::models::root_vault::{NewRootVault, RootVaultRow};
use crate::Db;
use anyhow::Result;
use fractal_common::RootVault;

pub async fn insert_root_vault(pool: &Db, v: &NewRootVault) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO root_vaults (
            pubkey, vault_id, owner_wallet, collateral_mint, collateral_amount,
            long_mint, short_mint, asset_feed, reference_price, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (pubkey) DO NOTHING
        "#,
    )
    .bind(&v.pubkey)
    .bind(v.vault_id)
    .bind(&v.owner_wallet)
    .bind(&v.collateral_mint)
    .bind(v.collateral_amount)
    .bind(&v.long_mint)
    .bind(&v.short_mint)
    .bind(&v.asset_feed)
    .bind(v.reference_price)
    .bind(v.created_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_root_vault(pool: &Db, pubkey: &str) -> Result<RootVault> {
    let row = sqlx::query_as::<_, RootVaultRow>(
        "SELECT * FROM root_vaults WHERE pubkey = $1",
    )
    .bind(pubkey)
    .fetch_one(pool)
    .await?;
    Ok(row.into())
}

pub async fn list_root_vaults_for_owner(pool: &Db, wallet: &str) -> Result<Vec<RootVault>> {
    let rows = sqlx::query_as::<_, RootVaultRow>(
        "SELECT * FROM root_vaults WHERE owner_wallet = $1 ORDER BY created_at DESC",
    )
    .bind(wallet)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn list_all_active_root_vaults(pool: &Db) -> Result<Vec<RootVault>> {
    let rows = sqlx::query_as::<_, RootVaultRow>(
        "SELECT * FROM root_vaults WHERE is_active = TRUE ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn deactivate_root_vault(pool: &Db, pubkey: &str) -> Result<()> {
    sqlx::query("UPDATE root_vaults SET is_active = FALSE WHERE pubkey = $1")
        .bind(pubkey)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn update_collateral_amount(pool: &Db, pubkey: &str, amount: i64) -> Result<()> {
    sqlx::query("UPDATE root_vaults SET collateral_amount = $2 WHERE pubkey = $1")
        .bind(pubkey)
        .bind(amount)
        .execute(pool)
        .await?;
    Ok(())
}

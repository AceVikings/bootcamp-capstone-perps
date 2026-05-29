use crate::models::{NewVault, Vault, VaultHealthRow};
use sqlx::PgPool;

/// Insert a new vault row. On conflict (same pda) do nothing (idempotent replay).
pub async fn insert_vault(pool: &PgPool, v: &NewVault) -> anyhow::Result<Vault> {
    let row = sqlx::query_as::<_, Vault>(
        r#"
        INSERT INTO vaults (
            pda, minter, epoch_pda, epoch_id, asset_key,
            collateral_mint, collateral_amount, entry_price,
            long_tokens_minted, short_tokens_minted,
            depth, parent_vault_pda, vault_index, created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (pda) DO NOTHING
        RETURNING *
        "#,
    )
    .bind(&v.pda)
    .bind(&v.minter)
    .bind(&v.epoch_pda)
    .bind(v.epoch_id)
    .bind(&v.asset_key)
    .bind(&v.collateral_mint)
    .bind(v.collateral_amount)
    .bind(v.entry_price)
    .bind(v.long_tokens_minted)
    .bind(v.short_tokens_minted)
    .bind(v.depth)
    .bind(&v.parent_vault_pda)
    .bind(v.vault_index)
    .bind(v.created_at)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

/// Get all vaults for a given minter (wallet).
pub async fn get_vaults_by_minter(pool: &PgPool, minter: &str) -> anyhow::Result<Vec<Vault>> {
    let rows = sqlx::query_as::<_, Vault>(
        "SELECT * FROM vaults WHERE minter = $1 ORDER BY created_at DESC",
    )
    .bind(minter)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Get vaults at risk of liquidation (health_ratio below threshold).
/// The keeper service polls this to find candidates.
pub async fn get_liquidation_candidates(
    pool: &PgPool,
    health_threshold: f64,
) -> anyhow::Result<Vec<VaultHealthRow>> {
    let rows = sqlx::query_as::<_, VaultHealthRow>(
        r#"
        SELECT pda, minter, epoch_id, vault_index,
               collateral_amount, entry_price, health_ratio
        FROM vaults
        WHERE is_liquidated = FALSE
          AND health_ratio IS NOT NULL
          AND CAST(health_ratio AS DOUBLE PRECISION) < $1
        ORDER BY health_ratio ASC
        "#,
    )
    .bind(health_threshold)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Mark a vault as liquidated.
pub async fn mark_vault_liquidated(pool: &PgPool, pda: &str) -> anyhow::Result<()> {
    sqlx::query("UPDATE vaults SET is_liquidated = TRUE, updated_at = NOW() WHERE pda = $1")
        .bind(pda)
        .execute(pool)
        .await?;

    Ok(())
}

/// Update the computed value fields for a vault (called every oracle tick).
pub async fn update_vault_values(
    pool: &PgPool,
    pda: &str,
    long_value: i64,
    short_value: i64,
    health_ratio: f64,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        UPDATE vaults SET
            current_long_value  = $2,
            current_short_value = $3,
            health_ratio        = $4,
            updated_at          = NOW()
        WHERE pda = $1
        "#,
    )
    .bind(pda)
    .bind(long_value)
    .bind(short_value)
    .bind(health_ratio)
    .execute(pool)
    .await?;

    Ok(())
}

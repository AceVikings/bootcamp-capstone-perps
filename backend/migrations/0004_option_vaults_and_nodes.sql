-- Migration 004: Option Vaults and Option Nodes
-- Creates the option_vaults and option_nodes tables used by the API layer.
-- These tables are the application-facing view of the on-chain data; the
-- indexer populates them from root_vaults + claim_nodes events.

-- ─── Option Vaults ────────────────────────────────────────────────────────────
-- One row per side (LONG or SHORT) of a structured option position.
-- Mirrors the OptionVault domain model used throughout the API.

CREATE TABLE IF NOT EXISTS option_vaults (
    pubkey              TEXT PRIMARY KEY,
    vault_id            BIGINT NOT NULL,
    owner_wallet        TEXT NOT NULL,
    vault_side          TEXT NOT NULL CHECK (vault_side IN ('LONG', 'SHORT')),
    collateral_mint     TEXT NOT NULL,
    collateral_amount   BIGINT NOT NULL,
    root_mint           TEXT NOT NULL,
    asset_feed          TEXT NOT NULL,
    strike              BIGINT NOT NULL,
    expiry              TIMESTAMPTZ NOT NULL,
    is_settled          BOOLEAN NOT NULL DEFAULT FALSE,
    settlement_price    BIGINT,
    created_at          TIMESTAMPTZ NOT NULL,
    indexed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_option_vaults_owner        ON option_vaults (owner_wallet);
CREATE INDEX IF NOT EXISTS idx_option_vaults_expiry       ON option_vaults (expiry);
CREATE INDEX IF NOT EXISTS idx_option_vaults_active       ON option_vaults (is_settled) WHERE is_settled = FALSE;
CREATE INDEX IF NOT EXISTS idx_option_vaults_strike_expiry
    ON option_vaults (strike, expiry, vault_side)
    WHERE is_settled = FALSE;

-- ─── Option Nodes ─────────────────────────────────────────────────────────────
-- One row per split operation; tracks the hierarchical claim tree.

CREATE TABLE IF NOT EXISTS option_nodes (
    pubkey              TEXT PRIMARY KEY,
    node_id             BIGINT NOT NULL,
    vault_pubkey        TEXT NOT NULL REFERENCES option_vaults(pubkey),
    vault_id            BIGINT NOT NULL,
    owner_wallet        TEXT NOT NULL,
    depth               SMALLINT NOT NULL,
    parent_node         TEXT REFERENCES option_nodes(pubkey),
    vault_side          TEXT NOT NULL CHECK (vault_side IN ('LONG', 'SHORT')),
    long_child_mint     TEXT NOT NULL,
    short_child_mint    TEXT NOT NULL,
    long_backing        BIGINT NOT NULL,
    short_backing       BIGINT NOT NULL,
    parent_strike       BIGINT NOT NULL,
    child_strike        BIGINT NOT NULL,
    creation_price      BIGINT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    indexed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_option_nodes_vault        ON option_nodes (vault_pubkey);
CREATE INDEX IF NOT EXISTS idx_option_nodes_owner        ON option_nodes (owner_wallet);
CREATE INDEX IF NOT EXISTS idx_option_nodes_parent       ON option_nodes (parent_node);
CREATE INDEX IF NOT EXISTS idx_option_nodes_active       ON option_nodes (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_option_nodes_vault_depth
    ON option_nodes (vault_pubkey, depth, created_at)
    WHERE is_active = TRUE;

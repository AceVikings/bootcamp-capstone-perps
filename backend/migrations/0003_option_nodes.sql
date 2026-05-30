-- Migration 003: Option Nodes
-- Hierarchical split/merge tree nodes for structured option positions.

-- ─── Option Nodes ──────────────────────────────────────────────────────────────
-- Each row represents one split of an option vault into child mints.
-- parent_node NULL means this is a depth-0 root node from a direct vault split.

CREATE TABLE option_nodes (
    pubkey              TEXT PRIMARY KEY,              -- base58 pubkey of node PDA
    node_id             BIGINT NOT NULL,               -- on-chain numeric node ID
    vault_pubkey        TEXT NOT NULL REFERENCES option_vaults(pubkey),
    vault_id            BIGINT NOT NULL,               -- denormalized for fast filters
    owner_wallet        TEXT NOT NULL,                 -- base58 pubkey of the owner
    depth               SMALLINT NOT NULL,             -- 0 = direct vault split
    parent_node         TEXT REFERENCES option_nodes(pubkey),
    vault_side          TEXT NOT NULL CHECK (vault_side IN ('LONG', 'SHORT')),
    long_child_mint     TEXT NOT NULL,                 -- SPL mint for long sub-position
    short_child_mint    TEXT NOT NULL,                 -- SPL mint for short sub-position
    long_backing        BIGINT NOT NULL,               -- collateral backing the long side, 6-dec
    short_backing       BIGINT NOT NULL,               -- collateral backing the short side, 6-dec
    parent_strike       BIGINT NOT NULL,               -- inherited strike from parent, 6-dec USD
    child_strike        BIGINT NOT NULL,               -- new strike introduced by this split, 6-dec USD
    creation_price      BIGINT NOT NULL,               -- oracle price at split time, 6-dec USD
    created_at          TIMESTAMPTZ NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    indexed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_option_nodes_vault   ON option_nodes (vault_pubkey);
CREATE INDEX idx_option_nodes_owner   ON option_nodes (owner_wallet);
CREATE INDEX idx_option_nodes_parent  ON option_nodes (parent_node);
CREATE INDEX idx_option_nodes_active  ON option_nodes (is_active) WHERE is_active = TRUE;

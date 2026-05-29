-- Migration 0003: Claim tree support (Stage 2 recursive split)

-- ─── Claim Nodes ──────────────────────────────────────────────────────────────
-- Mirrors the on-chain ClaimNode account. Indexed by the off-chain indexer.

CREATE TABLE claim_nodes (
    -- On-chain account address (base58)
    pubkey          TEXT PRIMARY KEY,
    node_id         BIGINT NOT NULL,
    epoch_pubkey    TEXT NOT NULL,
    owner_wallet    TEXT NOT NULL,
    depth           SMALLINT NOT NULL CHECK (depth IN (1, 2)),
    -- NULL if depth == 1 (parent is a PositionVault, not a ClaimNode)
    parent_node     TEXT REFERENCES claim_nodes(pubkey),
    -- 'LONG' or 'SHORT' for depth 1
    -- 'LONG_LONG', 'LONG_SHORT', 'SHORT_LONG', 'SHORT_SHORT' for depth 2
    side            TEXT NOT NULL,
    left_child_mint TEXT NOT NULL,
    right_child_mint TEXT NOT NULL,
    split_price_usd BIGINT NOT NULL,
    split_time      TIMESTAMPTZ NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claim_nodes_owner  ON claim_nodes (owner_wallet);
CREATE INDEX idx_claim_nodes_epoch  ON claim_nodes (epoch_pubkey);
CREATE INDEX idx_claim_nodes_parent ON claim_nodes (parent_node);
CREATE INDEX idx_claim_nodes_active ON claim_nodes (owner_wallet, is_active)
    WHERE is_active = TRUE;

-- ─── Extend orders token_type constraint ─────────────────────────────────────

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_token_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_token_type_check
    CHECK (token_type IN ('LONG', 'SHORT', 'LONG_LONG', 'LONG_SHORT', 'SHORT_LONG', 'SHORT_SHORT'));

-- ─── Extend epochs table with depth-2 mint columns ───────────────────────────

ALTER TABLE epochs
    ADD COLUMN IF NOT EXISTS long_long_mint  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS long_short_mint TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS short_long_mint TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS short_short_mint TEXT NOT NULL DEFAULT '';

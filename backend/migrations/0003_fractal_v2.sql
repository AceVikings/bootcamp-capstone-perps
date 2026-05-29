-- Migration 003: Fractal Markets v2 schema
-- Drops the epoch-based tables and introduces root_vaults + claim_nodes.
-- Orders and trades are also replaced with a cleaner schema that matches
-- the off-chain relay model (no epoch_id, trader-centric fields).

-- ─── Drop epoch-based tables (cascade handles FK chains) ────────────────────
DROP TABLE IF EXISTS user_stats       CASCADE;
DROP TABLE IF EXISTS price_candles    CASCADE;
DROP TABLE IF EXISTS claim_nodes      CASCADE;
DROP TABLE IF EXISTS trades           CASCADE;
DROP TABLE IF EXISTS orders           CASCADE;
DROP TABLE IF EXISTS vaults           CASCADE;
DROP TABLE IF EXISTS epochs           CASCADE;
DROP TABLE IF EXISTS oracle_prices    CASCADE;
DROP TABLE IF EXISTS program_events   CASCADE;
DROP TABLE IF EXISTS indexer_state    CASCADE;

-- ─── Root Vaults ─────────────────────────────────────────────────────────────
-- Mirrors the on-chain RootVault account indexed from CreateVaultEvent.
CREATE TABLE root_vaults (
    pubkey              TEXT PRIMARY KEY,
    vault_id            BIGINT NOT NULL,
    owner_wallet        TEXT NOT NULL,
    collateral_mint     TEXT NOT NULL,
    collateral_amount   BIGINT NOT NULL,
    long_mint           TEXT NOT NULL,
    short_mint          TEXT NOT NULL,
    asset_feed          TEXT NOT NULL,
    reference_price     BIGINT NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL,
    indexed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_root_vaults_owner  ON root_vaults (owner_wallet);
CREATE INDEX idx_root_vaults_active ON root_vaults (owner_wallet, is_active)
    WHERE is_active = TRUE;

-- ─── Claim Nodes ─────────────────────────────────────────────────────────────
-- Mirrors the on-chain ClaimNode account indexed from SplitClaimEvent.
CREATE TABLE claim_nodes (
    pubkey              TEXT PRIMARY KEY,
    node_id             BIGINT NOT NULL,
    root_vault          TEXT NOT NULL REFERENCES root_vaults(pubkey),
    root_id             BIGINT NOT NULL,
    owner_wallet        TEXT NOT NULL,
    depth               SMALLINT NOT NULL,
    -- NULL if depth == 1 (parent is a RootVault, not a ClaimNode)
    parent_node         TEXT REFERENCES claim_nodes(pubkey),
    -- 'LONG' or 'SHORT' (the side relative to its parent at each level)
    claim_type          TEXT NOT NULL CHECK (claim_type IN ('LONG', 'SHORT')),
    source_mint         TEXT NOT NULL,
    left_child_mint     TEXT NOT NULL,
    right_child_mint    TEXT NOT NULL,
    creation_price      BIGINT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    indexed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claim_nodes_owner      ON claim_nodes (owner_wallet);
CREATE INDEX idx_claim_nodes_root_vault ON claim_nodes (root_vault);
CREATE INDEX idx_claim_nodes_root_id    ON claim_nodes (root_id);
CREATE INDEX idx_claim_nodes_parent     ON claim_nodes (parent_node);
CREATE INDEX idx_claim_nodes_active     ON claim_nodes (owner_wallet, is_active)
    WHERE is_active = TRUE;

-- ─── Orders ──────────────────────────────────────────────────────────────────
-- Off-chain limit orders for claim token mints.
-- Signed by the trader; relayed to the match engine by the API.
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trader_wallet   TEXT NOT NULL,
    token_mint      TEXT NOT NULL,
    side            TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    price_usdc      BIGINT NOT NULL CHECK (price_usdc > 0),
    quantity        BIGINT NOT NULL CHECK (quantity > 0),
    filled_qty      BIGINT NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN', 'FILLED', 'CANCELLED', 'PARTIAL')),
    nonce           BIGINT NOT NULL,
    expiry          TIMESTAMPTZ NOT NULL,
    signature       TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_mint_status ON orders (token_mint, status)
    WHERE status = 'OPEN';
CREATE INDEX idx_orders_trader      ON orders (trader_wallet);

-- ─── Trades ──────────────────────────────────────────────────────────────────
-- Records of matched orders (settled or pending on-chain settlement).
CREATE TABLE trades (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_mint      TEXT NOT NULL,
    buyer_wallet    TEXT NOT NULL,
    seller_wallet   TEXT NOT NULL,
    price_usdc      BIGINT NOT NULL CHECK (price_usdc > 0),
    quantity        BIGINT NOT NULL CHECK (quantity > 0),
    tx_signature    TEXT UNIQUE,
    settled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trades_token   ON trades (token_mint, settled_at DESC);
CREATE INDEX idx_trades_buyer   ON trades (buyer_wallet);
CREATE INDEX idx_trades_seller  ON trades (seller_wallet);

-- ─── Program Events ──────────────────────────────────────────────────────────
-- Raw Anchor events indexed from program logs.
CREATE TABLE program_events (
    id              BIGSERIAL PRIMARY KEY,
    tx_signature    TEXT NOT NULL UNIQUE,
    event_type      TEXT NOT NULL,
    slot            BIGINT NOT NULL,
    block_time      TIMESTAMPTZ NOT NULL,
    data            JSONB NOT NULL,
    indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_type        ON program_events (event_type);
CREATE INDEX idx_events_slot        ON program_events (slot);
CREATE INDEX idx_events_block_time  ON program_events (block_time DESC);

-- ─── Indexer State ───────────────────────────────────────────────────────────
-- Singleton row tracking the last processed Solana slot.
CREATE TABLE indexer_state (
    id                      INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    program_id              TEXT NOT NULL,
    last_processed_slot     BIGINT NOT NULL DEFAULT 0,
    last_processed_sig      TEXT,
    last_processed_at       TIMESTAMPTZ,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

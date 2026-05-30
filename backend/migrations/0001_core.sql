-- Migration 001: Core protocol tables
-- Option Vaults, Oracle prices, Program events, Indexer state

-- ─── Option Vaults ─────────────────────────────────────────────────────────────
-- Mirror of on-chain OptionVault PDA accounts, kept in sync by the indexer.
-- Each vault represents one side (LONG or SHORT) of a structured option position.

CREATE TABLE option_vaults (
    pubkey              TEXT PRIMARY KEY,            -- base58 pubkey of the vault PDA
    vault_id            BIGINT NOT NULL,             -- on-chain numeric vault ID
    owner_wallet        TEXT NOT NULL,               -- base58 pubkey of the owner
    vault_side          TEXT NOT NULL CHECK (vault_side IN ('LONG', 'SHORT')),
    collateral_mint     TEXT NOT NULL,               -- SPL mint used for collateral
    collateral_amount   BIGINT NOT NULL,             -- collateral amount, 6-decimal
    root_mint           TEXT NOT NULL,               -- root SPL token mint for this vault
    asset_feed          TEXT NOT NULL,               -- base58 pubkey of the price feed
    strike              BIGINT NOT NULL,             -- strike price, 6-decimal USD
    expiry              TIMESTAMPTZ NOT NULL,        -- option expiry timestamp
    is_settled          BOOLEAN NOT NULL DEFAULT FALSE,
    settlement_price    BIGINT,                      -- final settlement price (NULL until settled)
    created_at          TIMESTAMPTZ NOT NULL,
    indexed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_option_vaults_owner  ON option_vaults (owner_wallet);
CREATE INDEX idx_option_vaults_expiry ON option_vaults (expiry);
CREATE INDEX idx_option_vaults_active ON option_vaults (is_settled) WHERE is_settled = FALSE;

-- ─── Oracle Prices ────────────────────────────────────────────────────────────
-- Cached Pyth price feed data polled by the oracle service.
-- Used for TWAP computation, real-time position value, and liquidation scanning.

CREATE TABLE oracle_prices (
    id          BIGSERIAL PRIMARY KEY,
    asset_key   TEXT   NOT NULL, -- base58 pubkey of the Pyth price feed
    price_usd   BIGINT NOT NULL, -- USD price, 6-decimal precision
    confidence  BIGINT NOT NULL, -- Pyth confidence interval, 6-decimal
    slot        BIGINT NOT NULL, -- Solana slot number
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oracle_prices_asset_time ON oracle_prices (asset_key, recorded_at DESC);
CREATE INDEX idx_oracle_prices_slot       ON oracle_prices (slot);

-- ─── Program Events ───────────────────────────────────────────────────────────
-- Indexed Anchor events emitted by the TPP protocol program.
-- The indexer subscribes to program logs and writes each event here.

CREATE TABLE program_events (
    id            BIGSERIAL PRIMARY KEY,
    tx_signature  TEXT   NOT NULL UNIQUE,
    event_type    TEXT   NOT NULL, -- 'EpochCreated', 'PositionMinted', etc.
    slot          BIGINT NOT NULL,
    block_time    TIMESTAMPTZ NOT NULL,
    data          JSONB  NOT NULL, -- full event payload
    indexed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_type        ON program_events (event_type);
CREATE INDEX idx_events_slot        ON program_events (slot);
CREATE INDEX idx_events_block_time  ON program_events (block_time DESC);

-- Partial indexes for common event type queries
CREATE INDEX idx_events_minted    ON program_events (block_time DESC) WHERE event_type = 'PositionMinted';
CREATE INDEX idx_events_redeemed  ON program_events (block_time DESC) WHERE event_type = 'PositionRedeemed';
CREATE INDEX idx_events_liquidated ON program_events (block_time DESC) WHERE event_type = 'VaultLiquidated';

-- ─── Indexer State ────────────────────────────────────────────────────────────
-- Singleton row tracking the last Solana slot the indexer processed.
-- Used to resume from the correct position after restarts.

CREATE TABLE indexer_state (
    id                   INT  PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- enforce singleton
    program_id           TEXT NOT NULL,
    last_processed_slot  BIGINT NOT NULL DEFAULT 0,
    last_processed_sig   TEXT,
    last_processed_at    TIMESTAMPTZ,
    started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

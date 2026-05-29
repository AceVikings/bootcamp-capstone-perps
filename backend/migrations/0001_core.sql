-- Migration 001: Core protocol tables
-- Epochs, Vaults, Oracle prices, Program events, Indexer state

-- ─── Epochs ───────────────────────────────────────────────────────────────────
-- Mirror of on-chain Epoch PDA accounts, kept in sync by the indexer.
-- Source of truth is still on-chain; DB enables efficient queries and history.

CREATE TABLE epochs (
    id              BIGSERIAL PRIMARY KEY,
    epoch_id        BIGINT NOT NULL,
    asset_key       TEXT   NOT NULL,  -- base58 pubkey (oracle/asset identifier)
    pda             TEXT   NOT NULL,  -- base58 pubkey of the on-chain Epoch PDA
    reference_price BIGINT NOT NULL,  -- oracle price at epoch open, 6-decimal USD
    price_band_lower BIGINT NOT NULL, -- entry_price * 0.995
    price_band_upper BIGINT NOT NULL, -- entry_price * 1.005
    long_token_mint  TEXT   NOT NULL, -- base58 pubkey of the LONG SPL mint
    short_token_mint TEXT   NOT NULL, -- base58 pubkey of the SHORT SPL mint
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    -- Running totals (updated by indexer on each PositionMinted event)
    total_collateral    BIGINT NOT NULL DEFAULT 0, -- USDC 6-decimal
    long_token_supply   BIGINT NOT NULL DEFAULT 0,
    short_token_supply  BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT epochs_unique_epoch_asset UNIQUE (epoch_id, asset_key),
    CONSTRAINT epochs_unique_pda         UNIQUE (pda)
);

CREATE INDEX idx_epochs_asset_key  ON epochs (asset_key);
CREATE INDEX idx_epochs_is_active  ON epochs (is_active) WHERE is_active = TRUE;
CREATE INDEX idx_epochs_end_time   ON epochs (end_time);

-- ─── Vaults ───────────────────────────────────────────────────────────────────
-- Mirror of on-chain PositionVault PDA accounts.
-- Augmented with computed health metrics updated by the oracle cache service.

CREATE TABLE vaults (
    id                    BIGSERIAL PRIMARY KEY,
    pda                   TEXT   NOT NULL UNIQUE, -- on-chain vault PDA (base58)
    minter                TEXT   NOT NULL,        -- wallet pubkey (base58)
    epoch_pda             TEXT   NOT NULL REFERENCES epochs (pda),
    epoch_id              BIGINT NOT NULL,
    asset_key             TEXT   NOT NULL,
    collateral_mint       TEXT   NOT NULL,
    collateral_amount     BIGINT NOT NULL,         -- USDC 6-decimal
    entry_price           BIGINT NOT NULL,         -- oracle price at mint
    long_tokens_minted    BIGINT NOT NULL,
    short_tokens_minted   BIGINT NOT NULL,
    depth                 SMALLINT NOT NULL DEFAULT 0, -- 0 = base layer
    parent_vault_pda      TEXT,                   -- NULL for depth=0
    is_liquidated         BOOLEAN NOT NULL DEFAULT FALSE,
    vault_index           BIGINT NOT NULL,
    -- Off-chain computed values (refreshed every oracle tick)
    current_long_value    BIGINT,  -- V_LONG = collateral * (P_current / P_entry)
    current_short_value   BIGINT,  -- V_SHORT = collateral * (2 - P_current / P_entry)
    health_ratio          NUMERIC(12, 6), -- min(V_LONG, V_SHORT) / liquidation_threshold
    -- Timestamps from chain
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT vaults_unique_minter_epoch_index UNIQUE (minter, epoch_pda, vault_index)
);

CREATE INDEX idx_vaults_minter        ON vaults (minter);
CREATE INDEX idx_vaults_epoch_pda     ON vaults (epoch_pda);
CREATE INDEX idx_vaults_liquidated    ON vaults (is_liquidated) WHERE is_liquidated = FALSE;
CREATE INDEX idx_vaults_health        ON vaults (health_ratio) WHERE is_liquidated = FALSE AND health_ratio IS NOT NULL;

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

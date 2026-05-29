-- Migration 002: Off-chain order book tables
-- Orders, Trades (matched orders), and Price Candles

-- ─── Orders ───────────────────────────────────────────────────────────────────
-- Off-chain limit orders for pLONG and pSHORT position tokens.
--
-- Flow:
--   1. User signs an order with their Solana wallet (Ed25519)
--   2. Backend verifies signature and stores the order
--   3. Matcher finds compatible orders and creates a Trade record
--   4. Both parties are notified via WebSocket to execute the token swap on-chain
--
-- The order book is NOT a custodial system — tokens stay in user wallets.
-- Settlement requires both parties to sign the on-chain SPL transfer.

CREATE TABLE orders (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    maker        TEXT NOT NULL,  -- maker's Solana wallet pubkey (base58)
    token_mint   TEXT NOT NULL,  -- the SPL mint being bought/sold (pLONG or pSHORT)
    token_type   TEXT NOT NULL CHECK (token_type IN ('LONG', 'SHORT')),
    side         TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    epoch_id     BIGINT NOT NULL,
    asset_key    TEXT NOT NULL,
    -- Quantity in token lamports (6-decimal precision, same as SPL token)
    quantity     BIGINT NOT NULL CHECK (quantity > 0),
    filled_qty   BIGINT NOT NULL DEFAULT 0 CHECK (filled_qty >= 0),
    -- Price per token in USDC lamports (6-decimal)
    price_usd    BIGINT NOT NULL CHECK (price_usd > 0),
    -- Status lifecycle: OPEN → PARTIALLY_FILLED → FILLED | CANCELLED | EXPIRED
    status       TEXT NOT NULL DEFAULT 'OPEN'
                     CHECK (status IN ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'EXPIRED')),
    -- Maker's Ed25519 signature over the canonical order message
    -- Message format: "<maker>|<token_mint>|<side>|<quantity>|<price_usd>|<expires_at>"
    signature    TEXT NOT NULL,
    expires_at   TIMESTAMPTZ,   -- NULL = GTC (good-till-cancelled)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_maker         ON orders (maker);
CREATE INDEX idx_orders_token_mint    ON orders (token_mint);
CREATE INDEX idx_orders_epoch_type    ON orders (epoch_id, token_type);
CREATE INDEX idx_orders_open          ON orders (token_mint, side, price_usd)
    WHERE status IN ('OPEN', 'PARTIALLY_FILLED');

-- ─── Trades ───────────────────────────────────────────────────────────────────
-- Records of matched orders (intent-based matches waiting for on-chain settlement).
-- A trade is created when the matcher finds compatible buy/sell orders.

CREATE TABLE trades (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    maker_order_id  UUID NOT NULL REFERENCES orders (id),
    taker_order_id  UUID REFERENCES orders (id), -- NULL for market-taker fills
    token_mint      TEXT NOT NULL,
    token_type      TEXT NOT NULL,
    epoch_id        BIGINT NOT NULL,
    asset_key       TEXT NOT NULL,
    quantity        BIGINT NOT NULL CHECK (quantity > 0),
    price_usd       BIGINT NOT NULL CHECK (price_usd > 0),
    maker_wallet    TEXT NOT NULL,
    taker_wallet    TEXT NOT NULL,
    -- On-chain settlement details (filled in after successful SPL transfer)
    tx_signature    TEXT UNIQUE,      -- Solana tx signature once settled
    status          TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'SETTLING', 'SETTLED', 'FAILED', 'EXPIRED')),
    settlement_deadline TIMESTAMPTZ,  -- when the match expires if not settled
    settled_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trades_maker     ON trades (maker_wallet);
CREATE INDEX idx_trades_taker     ON trades (taker_wallet);
CREATE INDEX idx_trades_token     ON trades (token_mint, created_at DESC);
CREATE INDEX idx_trades_pending   ON trades (status, settlement_deadline)
    WHERE status IN ('PENDING', 'SETTLING');

-- ─── Price Candles ────────────────────────────────────────────────────────────
-- OHLCV price history for each epoch's LONG and SHORT tokens.
-- Derived from executed trades + oracle prices by the API aggregation service.

CREATE TABLE price_candles (
    id           BIGSERIAL PRIMARY KEY,
    token_mint   TEXT NOT NULL,
    token_type   TEXT NOT NULL,
    epoch_id     BIGINT NOT NULL,
    asset_key    TEXT NOT NULL,
    interval     TEXT NOT NULL CHECK (interval IN ('1m', '5m', '15m', '1h', '4h', '1d')),
    open_time    TIMESTAMPTZ NOT NULL,
    close_time   TIMESTAMPTZ NOT NULL,
    open_price   BIGINT NOT NULL,
    high_price   BIGINT NOT NULL,
    low_price    BIGINT NOT NULL,
    close_price  BIGINT NOT NULL,
    volume       BIGINT NOT NULL DEFAULT 0, -- total tokens traded
    trade_count  INT    NOT NULL DEFAULT 0,
    CONSTRAINT price_candles_unique UNIQUE (token_mint, interval, open_time)
);

CREATE INDEX idx_candles_token_interval ON price_candles (token_mint, interval, open_time DESC);

-- ─── User Stats ───────────────────────────────────────────────────────────────
-- Aggregated per-user metrics, refreshed periodically by the analytics service.
-- Not the authoritative source of truth — just a cache for fast UI rendering.

CREATE TABLE user_stats (
    wallet                    TEXT PRIMARY KEY,
    total_collateral_deposited BIGINT NOT NULL DEFAULT 0,  -- lifetime USDC deposited
    total_fees_paid           BIGINT NOT NULL DEFAULT 0,   -- lifetime fees
    vault_count               INT    NOT NULL DEFAULT 0,   -- all vaults ever opened
    active_vault_count        INT    NOT NULL DEFAULT 0,   -- currently non-liquidated
    liquidated_vault_count    INT    NOT NULL DEFAULT 0,
    realized_pnl              BIGINT NOT NULL DEFAULT 0,   -- USDC, from redemptions
    total_long_bought         BIGINT NOT NULL DEFAULT 0,   -- from trades
    total_short_bought        BIGINT NOT NULL DEFAULT 0,   -- from trades
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

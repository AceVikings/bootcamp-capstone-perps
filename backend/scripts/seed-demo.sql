-- =============================================================================
-- Demo Seed Data — Raven Protocol
-- Inserts realistic root vaults, claim nodes, orders, and trades so the
-- app looks live with real TVL, an active orderbook, and trade history.
--
-- Units:
--   collateral_amount  → micro-USDC (6 decimals)  e.g. 500 USDC = 500_000_000
--   reference_price    → micro-USD  (6 decimals)  e.g. $82.83  =  82_830_000
--   orders.price_usdc  → micro-USDC per token     e.g. $0.50   =     500_000
--   orders.quantity    → micro-tokens (6 decimals) e.g. 100 tkn = 100_000_000
--
-- Run:
--   psql $DATABASE_URL -f backend/scripts/seed-demo.sql
-- =============================================================================

BEGIN;

-- ─── Wallets (demo participants) ──────────────────────────────────────────────
-- wallet_A  — primary demo wallet (matches devnet test keypair)
-- wallet_B/C — simulated other users providing liquidity
\set wallet_A '359ZiZvJ5M2Y1DFJ4JmnPq1mZb3qnSTtScfBzRXdm4SD'
\set wallet_B '6jPbESw8ZZRHfE6V7FV6cBru89nS6Pm4sUKBqvwdQxz8'
\set wallet_C 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
\set wallet_D 'So11111111111111111111111111111111111111112'
\set wallet_E 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

-- ─── Root Vaults ─────────────────────────────────────────────────────────────
-- Three vaults across SOL, BTC, ETH feeds.
-- asset_feed = Pyth oracle account pubkey (from constants.ts MARKETS).
-- collateral_mint = test USDC on devnet.

INSERT INTO root_vaults
    (pubkey, vault_id, owner_wallet, collateral_mint,
     collateral_amount, long_mint, short_mint,
     asset_feed, reference_price, is_active, created_at)
VALUES
-- SOL/USD vault — 600 USDC collateral, ref price $82.83
(
    'SoLVault1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8S9T',
    1,
    :'wallet_A',
    'GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr',
    600000000,           -- 600 USDC
    'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R',
    'SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7',
    '68utR51CRAH7hCHx5GS4sZvUCL4pe6h4uS1GT1t2bXkz',  -- SOL/USD oracle
    82830000,            -- $82.83
    TRUE,
    NOW() - INTERVAL '3 days'
),
-- BTC/USD vault — 1200 USDC collateral, ref price $95,000
(
    'BtCVault1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8S9T',
    2,
    :'wallet_B',
    'GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr',
    1200000000,          -- 1200 USDC
    'BtCLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R',
    'BtCShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q',
    'Cm3EZjU8D5MHDP6tGSZBGXEvz1rXVfAHydoepFB5hQ5t',  -- BTC/USD oracle
    95000000000,         -- $95,000.00
    TRUE,
    NOW() - INTERVAL '5 days'
),
-- ETH/USD vault — 800 USDC collateral, ref price $3,200
(
    'EtHVault1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8S9T',
    3,
    :'wallet_C',
    'GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr',
    800000000,           -- 800 USDC
    'EtHLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R',
    'EtHShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q',
    '7VivVtfizWqtzyoBvsp6HS1BkEJQd26CV1cjK69ezGNh',  -- ETH/USD oracle
    3200000000,          -- $3,200.00
    TRUE,
    NOW() - INTERVAL '2 days'
),
-- SOL/USD vault 2 — owned by wallet_D, 400 USDC, older
(
    'SoLVault2A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8S9T',
    4,
    :'wallet_D',
    'GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr',
    400000000,           -- 400 USDC
    'SoLLongMint2A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R',
    'SoLShortMint2A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7',
    '68utR51CRAH7hCHx5GS4sZvUCL4pe6h4uS1GT1t2bXkz',
    82830000,
    TRUE,
    NOW() - INTERVAL '7 days'
)
ON CONFLICT (pubkey) DO NOTHING;

-- ─── Claim Nodes ─────────────────────────────────────────────────────────────
-- wallet_A owns 2 nodes on the SOL vault: one LONG (unsplit), one SHORT (split).
-- left_child_mint / right_child_mint = '' means the node has NOT been split yet.

INSERT INTO claim_nodes
    (pubkey, node_id, root_vault, root_id, owner_wallet, depth,
     parent_node, claim_type, source_mint, left_child_mint, right_child_mint,
     creation_price, created_at, is_active)
VALUES
-- LONG claim node (unsplit) — wallet_A on SOL vault
(
    'ClaimLongNode1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q',
    1,
    'SoLVault1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8S9T',
    1,
    :'wallet_A',
    1,
    NULL,
    'LONG',
    'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R',
    '',   -- not yet split
    '',
    82830000,
    NOW() - INTERVAL '3 days',
    TRUE
),
-- SHORT claim node (split — has children) — wallet_A on SOL vault
(
    'ClaimShortNode1A2B3C4D5E6F7G8H9J1K2L3M4N5P6',
    2,
    'SoLVault1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8S9T',
    1,
    :'wallet_A',
    1,
    NULL,
    'SHORT',
    'SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7',
    'SoLSplitLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5',   -- left child
    'SoLSplitShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N',   -- right child
    80000000,
    NOW() - INTERVAL '2 days',
    TRUE
),
-- wallet_B LONG node on BTC vault (unsplit)
(
    'ClaimLongNode2A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q',
    3,
    'BtCVault1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8S9T',
    2,
    :'wallet_B',
    1,
    NULL,
    'LONG',
    'BtCLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R',
    '',
    '',
    95000000000,
    NOW() - INTERVAL '5 days',
    TRUE
),
-- wallet_E SHORT node on ETH vault (unsplit)
(
    'ClaimShortNode3A2B3C4D5E6F7G8H9J1K2L3M4N5P6',
    4,
    'EtHVault1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8S9T',
    3,
    :'wallet_E',
    1,
    NULL,
    'SHORT',
    'EtHShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q',
    '',
    '',
    3200000000,
    NOW() - INTERVAL '2 days',
    TRUE
)
ON CONFLICT (pubkey) DO NOTHING;

-- ─── Orders ──────────────────────────────────────────────────────────────────
-- Seeded as already-validated off-chain orders (signature = 'seed-bypass').
-- Expiry = far future so they remain OPEN.
-- Price levels create a realistic spread for SOL LONG and SHORT tokens.
--
-- SOL LONG token fair value ≈ $0.50 when SOL is near reference price.
-- Spread: bids at $0.46–$0.499, asks at $0.501–$0.54

-- SOL LONG — BUY orders (bid side)
INSERT INTO orders
    (trader_wallet, token_mint, side, price_usdc, quantity,
     filled_qty, status, nonce, expiry, signature)
VALUES
-- price_usdc (micro), quantity (micro)
(:'wallet_B', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'BUY', 499000, 250000000, 0, 'OPEN', 1001, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_C', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'BUY', 498000, 180000000, 0, 'OPEN', 1002, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_D', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'BUY', 495000, 320000000, 0, 'OPEN', 1003, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_E', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'BUY', 490000, 500000000, 0, 'OPEN', 1004, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_B', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'BUY', 480000, 800000000, 0, 'OPEN', 1005, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_C', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'BUY', 470000, 600000000, 0, 'OPEN', 1006, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_D', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'BUY', 460000, 1000000000, 0, 'OPEN', 1007, NOW() + INTERVAL '30 days', 'seed-bypass'),

-- SOL LONG — SELL orders (ask side)
(:'wallet_B', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'SELL', 501000, 220000000, 0, 'OPEN', 2001, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_C', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'SELL', 502000, 150000000, 0, 'OPEN', 2002, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_D', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'SELL', 505000, 400000000, 0, 'OPEN', 2003, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_E', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'SELL', 510000, 350000000, 0, 'OPEN', 2004, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_B', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'SELL', 520000, 700000000, 0, 'OPEN', 2005, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_C', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'SELL', 530000, 500000000, 0, 'OPEN', 2006, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_D', 'SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'SELL', 540000, 900000000, 0, 'OPEN', 2007, NOW() + INTERVAL '30 days', 'seed-bypass'),

-- SOL SHORT token — bids around $0.50 (symmetric)
(:'wallet_B', 'SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7', 'BUY', 499000, 200000000, 0, 'OPEN', 3001, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_C', 'SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7', 'BUY', 495000, 300000000, 0, 'OPEN', 3002, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_D', 'SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7', 'BUY', 488000, 450000000, 0, 'OPEN', 3003, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_E', 'SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7', 'BUY', 475000, 600000000, 0, 'OPEN', 3004, NOW() + INTERVAL '30 days', 'seed-bypass'),

-- SOL SHORT — asks
(:'wallet_B', 'SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7', 'SELL', 501000, 180000000, 0, 'OPEN', 4001, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_C', 'SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7', 'SELL', 504000, 260000000, 0, 'OPEN', 4002, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_D', 'SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7', 'SELL', 508000, 380000000, 0, 'OPEN', 4003, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_E', 'SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7', 'SELL', 515000, 500000000, 0, 'OPEN', 4004, NOW() + INTERVAL '30 days', 'seed-bypass'),

-- ETH LONG — bids
(:'wallet_D', 'EtHLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'BUY', 498000, 150000000, 0, 'OPEN', 5001, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_E', 'EtHLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'BUY', 492000, 220000000, 0, 'OPEN', 5002, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_B', 'EtHLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'BUY', 485000, 350000000, 0, 'OPEN', 5003, NOW() + INTERVAL '30 days', 'seed-bypass'),

-- ETH LONG — asks
(:'wallet_D', 'EtHLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'SELL', 502000, 130000000, 0, 'OPEN', 6001, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_E', 'EtHLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'SELL', 506000, 200000000, 0, 'OPEN', 6002, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_B', 'EtHLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'SELL', 512000, 300000000, 0, 'OPEN', 6003, NOW() + INTERVAL '30 days', 'seed-bypass'),

-- BTC LONG — bids
(:'wallet_C', 'BtCLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'BUY', 497000, 100000000, 0, 'OPEN', 7001, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_D', 'BtCLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'BUY', 493000, 180000000, 0, 'OPEN', 7002, NOW() + INTERVAL '30 days', 'seed-bypass'),

-- BTC LONG — asks
(:'wallet_C', 'BtCLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'SELL', 503000, 110000000, 0, 'OPEN', 8001, NOW() + INTERVAL '30 days', 'seed-bypass'),
(:'wallet_D', 'BtCLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', 'SELL', 507000, 170000000, 0, 'OPEN', 8002, NOW() + INTERVAL '30 days', 'seed-bypass');

-- ─── Trades ───────────────────────────────────────────────────────────────────
-- Historical fills to populate 24h volume and trade list.
-- price_usdc * quantity → volume in micro² units (frontend divides by 1e12).

INSERT INTO trades
    (token_mint, buyer_wallet, seller_wallet, price_usdc, quantity,
     tx_signature, settled_at)
VALUES
-- SOL LONG trades
('SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', :'wallet_A', :'wallet_B', 500000, 100000000, 'txseed001a', NOW() - INTERVAL '1 hour'),
('SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', :'wallet_C', :'wallet_D', 499000, 150000000, 'txseed001b', NOW() - INTERVAL '2 hours'),
('SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', :'wallet_B', :'wallet_E', 501000,  80000000, 'txseed001c', NOW() - INTERVAL '3 hours'),
('SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', :'wallet_D', :'wallet_C', 498000, 200000000, 'txseed001d', NOW() - INTERVAL '5 hours'),
('SoLLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', :'wallet_E', :'wallet_A', 502000, 120000000, 'txseed001e', NOW() - INTERVAL '8 hours'),
-- SOL SHORT trades
('SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7', :'wallet_B', :'wallet_C', 499000, 130000000, 'txseed002a', NOW() - INTERVAL '1 hour 30 minutes'),
('SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7', :'wallet_D', :'wallet_E', 501000, 170000000, 'txseed002b', NOW() - INTERVAL '4 hours'),
('SoLShortMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7', :'wallet_A', :'wallet_B', 498000,  90000000, 'txseed002c', NOW() - INTERVAL '6 hours'),
-- ETH LONG trades
('EtHLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', :'wallet_C', :'wallet_D', 500000,  75000000, 'txseed003a', NOW() - INTERVAL '2 hours'),
('EtHLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', :'wallet_E', :'wallet_B', 503000,  95000000, 'txseed003b', NOW() - INTERVAL '7 hours'),
-- BTC LONG trades
('BtCLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', :'wallet_A', :'wallet_C', 500000,  50000000, 'txseed004a', NOW() - INTERVAL '3 hours'),
('BtCLongMint1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R', :'wallet_D', :'wallet_E', 497000,  60000000, 'txseed004b', NOW() - INTERVAL '9 hours')
ON CONFLICT (tx_signature) DO NOTHING;

COMMIT;

-- ─── Verification ─────────────────────────────────────────────────────────────
SELECT
    'root_vaults'                                         AS table_name,
    COUNT(*)                                              AS row_count,
    SUM(collateral_amount) / 1000000.0 || ' USDC'        AS total_tvl
FROM root_vaults
UNION ALL
SELECT 'claim_nodes', COUNT(*), NULL FROM claim_nodes
UNION ALL
SELECT 'orders (OPEN)', COUNT(*), NULL FROM orders WHERE status = 'OPEN'
UNION ALL
SELECT 'trades (24h)', COUNT(*), NULL FROM trades
WHERE settled_at >= NOW() - INTERVAL '24 hours';

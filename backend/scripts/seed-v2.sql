-- =============================================================================
-- Demo Seed v2 — Raven Protocol (Devnet)
-- Uses the real on-chain vault + mints that are already indexed.
-- Adds 3 additional demo vaults (BTC, ETH, SOL#2) plus a deep orderbook
-- and 24h trade history to make the platform look alive.
--
-- Units:
--   collateral_amount  → micro-USDC (6 decimals)  600 USDC = 600_000_000
--   reference_price    → micro-USD  (6 decimals)  $182.47  = 182_470_000
--   price_usdc (orders/trades) → micro-USDC per token  $0.50 = 500_000
--   quantity (orders/trades)   → micro-tokens (6 dec)  100 tkn = 100_000_000
-- =============================================================================

BEGIN;

-- ─── Demo participants ────────────────────────────────────────────────────────
-- wallet_A is the real devnet deployer wallet
\set wallet_A '5UL8TEynkseDDwxnbquvHCXUVgxV9FXSvREo5rVRpiBn'
-- wallet_B–E are realistic-looking demo wallets (not real keys)
\set wallet_B 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC64d2pD7XWQFN'
\set wallet_C 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH'
\set wallet_D 'GsBwrBKNHipjPkGMQRCmA3ceFrHPzh8gijCCxnLfFLBj'
\set wallet_E '4vGPfQMRJE3pTcvphiG8YEmv7A9jcHdWpCGpzgNGE9Aj'
\set wallet_F 'BVeGHkCHkTUMF5D2JUg3XsTNGBc4A9BpHNzF1sDGXQaS'

-- ─── Real vault (already in DB) — bump collateral to make TVL meaningful ──────
UPDATE root_vaults
SET collateral_amount = 18500000000   -- 18,500 USDC
WHERE pubkey = 'B2KdrymHF6Eu4h3fiinZ279SzMAwoV7sanSw1em1unbm';

-- ─── Additional demo vaults ───────────────────────────────────────────────────
-- BTC/USD vault  — Pyth oracle Cm3EZjU8... (devnet BTC/USD)
INSERT INTO root_vaults
    (pubkey, vault_id, owner_wallet, collateral_mint,
     collateral_amount, long_mint, short_mint,
     asset_feed, reference_price, is_active, created_at)
VALUES
(
    'BtCVltDemo2aXt8fN3Q9s7zHrP6Ym5Kw4Jv1LcGdRnEk',
    20000001,
    :'wallet_B',
    'GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr',
    24000000000,            -- 24,000 USDC
    'BtCLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA',
    'BtCShtDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RAb',
    'HovQMDrbAgAarsVVmYe8CGsuknXRFMXuLry6LbD8TDMa',  -- BTC/USD devnet Pyth
    9621000000000,          -- $96,210.00
    TRUE,
    NOW() - INTERVAL '6 days'
),
(
    'EtHVltDemo3bYu9gO4R8tAiSqW7Nm6Lx5Kp2MdHeFoJl',
    20000002,
    :'wallet_C',
    'GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr',
    11200000000,            -- 11,200 USDC
    'EtHLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA',
    'EtHShtDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RAb',
    'EdVCmgLFiy81X9Uzs7pFHkMV5n6gAaLmKwvX7HZMVhnz',  -- ETH/USD devnet Pyth
    3847000000,             -- $3,847.00
    TRUE,
    NOW() - INTERVAL '4 days'
),
(
    'SoLVltDemo4cZv0hP5S9uBjTrX8On7My6Lq3NeIgFpKm',
    20000003,
    :'wallet_D',
    'GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr',
    8300000000,             -- 8,300 USDC
    'SoLLongDmo2A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA',
    'SoLShtDmo2A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RAb',
    'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG',  -- SOL/USD devnet Pyth
    182470000,              -- $182.47
    TRUE,
    NOW() - INTERVAL '2 days'
)
ON CONFLICT (pubkey) DO NOTHING;

-- ─── Claim nodes — real vault ─────────────────────────────────────────────────
INSERT INTO claim_nodes
    (pubkey, node_id, root_vault, root_id, owner_wallet, depth,
     parent_node, claim_type, source_mint, left_child_mint, right_child_mint,
     creation_price, created_at, is_active)
VALUES
-- wallet_A LONG node on real SOL vault (unsplit)
(
    'ClmLongR1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8S',
    1,
    'B2KdrymHF6Eu4h3fiinZ279SzMAwoV7sanSw1em1unbm',
    2114594748,
    :'wallet_A',
    1, NULL, 'LONG',
    'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL',
    '', '',
    182470000,
    NOW() - INTERVAL '5 hours',
    TRUE
),
-- wallet_B SHORT node on real SOL vault (split — has children)
(
    'ClmShtR1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8S9',
    2,
    'B2KdrymHF6Eu4h3fiinZ279SzMAwoV7sanSw1em1unbm',
    2114594748,
    :'wallet_B',
    1, NULL, 'SHORT',
    '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT',
    'SoLSplitLngR1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q',
    'SoLSplitShtR1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q',
    178000000,
    NOW() - INTERVAL '3 hours',
    TRUE
),
-- depth-2 node from the split above
(
    'ClmDepth2LngR1A2B3C4D5E6F7G8H9J1K2L3M4N5P6',
    3,
    'B2KdrymHF6Eu4h3fiinZ279SzMAwoV7sanSw1em1unbm',
    2114594748,
    :'wallet_C',
    2,
    'ClmShtR1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8S9',
    'LONG',
    'SoLSplitLngR1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q',
    '', '',
    179500000,
    NOW() - INTERVAL '2 hours',
    TRUE
),
-- BTC vault nodes
(
    'ClmLongBtC1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R',
    4,
    'BtCVltDemo2aXt8fN3Q9s7zHrP6Ym5Kw4Jv1LcGdRnEk',
    20000001,
    :'wallet_D',
    1, NULL, 'LONG',
    'BtCLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA',
    '', '',
    9621000000000,
    NOW() - INTERVAL '5 days',
    TRUE
),
(
    'ClmShtBtC1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8',
    5,
    'BtCVltDemo2aXt8fN3Q9s7zHrP6Ym5Kw4Jv1LcGdRnEk',
    20000001,
    :'wallet_E',
    1, NULL, 'SHORT',
    'BtCShtDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RAb',
    '', '',
    9621000000000,
    NOW() - INTERVAL '5 days',
    TRUE
),
-- ETH vault nodes
(
    'ClmLongEtH1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R',
    6,
    'EtHVltDemo3bYu9gO4R8tAiSqW7Nm6Lx5Kp2MdHeFoJl',
    20000002,
    :'wallet_F',
    1, NULL, 'LONG',
    'EtHLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA',
    '', '',
    3847000000,
    NOW() - INTERVAL '3 days',
    TRUE
),
(
    'ClmShtEtH1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7R8',
    7,
    'EtHVltDemo3bYu9gO4R8tAiSqW7Nm6Lx5Kp2MdHeFoJl',
    20000002,
    :'wallet_B',
    1, NULL, 'SHORT',
    'EtHShtDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RAb',
    '', '',
    3847000000,
    NOW() - INTERVAL '3 days',
    TRUE
)
ON CONFLICT (pubkey) DO NOTHING;

-- ─── Orders — real SOL vault (long_mint + short_mint from chain) ──────────────
-- SOL LONG token (AiMdyFTz...) — fair value ~$0.50 at reference price
-- Bids at $0.465–$0.499, Asks at $0.501–$0.535

INSERT INTO orders
    (trader_wallet, token_mint, side, price_usdc, quantity,
     filled_qty, status, nonce, expiry, signature)
VALUES
-- === SOL LONG (real mint) — BUY orders ===
(:'wallet_B', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'BUY',  499000,  280000000, 0, 'OPEN', 10001, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_C', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'BUY',  498000,  195000000, 0, 'OPEN', 10002, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_D', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'BUY',  496000,  340000000, 0, 'OPEN', 10003, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_E', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'BUY',  492000,  520000000, 0, 'OPEN', 10004, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_F', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'BUY',  488000,  760000000, 0, 'OPEN', 10005, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_B', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'BUY',  482000,  890000000, 0, 'OPEN', 10006, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_C', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'BUY',  475000, 1100000000, 0, 'OPEN', 10007, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_D', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'BUY',  465000, 1500000000, 0, 'OPEN', 10008, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),

-- === SOL LONG (real mint) — SELL orders ===
(:'wallet_E', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'SELL', 501000,  240000000, 0, 'OPEN', 20001, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_F', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'SELL', 502000,  170000000, 0, 'OPEN', 20002, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_B', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'SELL', 505000,  410000000, 0, 'OPEN', 20003, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_C', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'SELL', 509000,  360000000, 0, 'OPEN', 20004, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_D', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'SELL', 515000,  680000000, 0, 'OPEN', 20005, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_E', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'SELL', 523000,  490000000, 0, 'OPEN', 20006, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_F', 'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', 'SELL', 532000,  850000000, 0, 'OPEN', 20007, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),

-- === SOL SHORT (real mint 31rYDG...) — BUY orders ===
(:'wallet_B', '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', 'BUY',  499000,  210000000, 0, 'OPEN', 30001, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_D', '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', 'BUY',  494000,  310000000, 0, 'OPEN', 30002, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_F', '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', 'BUY',  487000,  470000000, 0, 'OPEN', 30003, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_C', '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', 'BUY',  478000,  630000000, 0, 'OPEN', 30004, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_E', '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', 'BUY',  468000,  900000000, 0, 'OPEN', 30005, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),

-- === SOL SHORT (real mint) — SELL orders ===
(:'wallet_C', '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', 'SELL', 502000,  190000000, 0, 'OPEN', 40001, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_E', '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', 'SELL', 506000,  275000000, 0, 'OPEN', 40002, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_B', '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', 'SELL', 511000,  390000000, 0, 'OPEN', 40003, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_D', '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', 'SELL', 518000,  520000000, 0, 'OPEN', 40004, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),

-- === BTC LONG (demo mint) — BUY ===
(:'wallet_C', 'BtCLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', 'BUY',  498000,  120000000, 0, 'OPEN', 50001, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_E', 'BtCLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', 'BUY',  494000,  195000000, 0, 'OPEN', 50002, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_F', 'BtCLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', 'BUY',  488000,  280000000, 0, 'OPEN', 50003, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),

-- === BTC LONG (demo mint) — SELL ===
(:'wallet_C', 'BtCLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', 'SELL', 502000,  105000000, 0, 'OPEN', 60001, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_E', 'BtCLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', 'SELL', 507000,  165000000, 0, 'OPEN', 60002, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),

-- === ETH LONG (demo mint) — BUY ===
(:'wallet_D', 'EtHLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', 'BUY',  497000,  145000000, 0, 'OPEN', 70001, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_F', 'EtHLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', 'BUY',  491000,  230000000, 0, 'OPEN', 70002, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),

-- === ETH LONG (demo mint) — SELL ===
(:'wallet_D', 'EtHLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', 'SELL', 503000,  125000000, 0, 'OPEN', 80001, NOW() + INTERVAL '30 days', 'seed-v2-bypass'),
(:'wallet_F', 'EtHLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', 'SELL', 509000,  195000000, 0, 'OPEN', 80002, NOW() + INTERVAL '30 days', 'seed-v2-bypass')

ON CONFLICT DO NOTHING;

-- ─── Trades — 24h history spread realistically across mints ──────────────────
INSERT INTO trades
    (token_mint, buyer_wallet, seller_wallet, price_usdc, quantity,
     tx_signature, settled_at)
VALUES
-- SOL LONG (real mint) trades
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', :'wallet_A', :'wallet_B', 500000,  125000000, 'seedv2-s1a',  NOW() - INTERVAL '25 minutes'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', :'wallet_C', :'wallet_D', 499500,  185000000, 'seedv2-s1b',  NOW() - INTERVAL '1 hour 10 minutes'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', :'wallet_E', :'wallet_F', 500500,   90000000, 'seedv2-s1c',  NOW() - INTERVAL '2 hours 5 minutes'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', :'wallet_B', :'wallet_C', 499000,  215000000, 'seedv2-s1d',  NOW() - INTERVAL '3 hours 20 minutes'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', :'wallet_D', :'wallet_A', 501000,  140000000, 'seedv2-s1e',  NOW() - INTERVAL '4 hours 45 minutes'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', :'wallet_F', :'wallet_E', 498000,  310000000, 'seedv2-s1f',  NOW() - INTERVAL '6 hours 15 minutes'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', :'wallet_C', :'wallet_B', 502000,  175000000, 'seedv2-s1g',  NOW() - INTERVAL '8 hours 30 minutes'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', :'wallet_A', :'wallet_D', 500000,  250000000, 'seedv2-s1h',  NOW() - INTERVAL '11 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', :'wallet_E', :'wallet_C', 499000,   95000000, 'seedv2-s1i',  NOW() - INTERVAL '14 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL', :'wallet_B', :'wallet_F', 501500,  160000000, 'seedv2-s1j',  NOW() - INTERVAL '18 hours'),
-- SOL SHORT (real mint) trades
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', :'wallet_D', :'wallet_C', 501000,  145000000, 'seedv2-s2a',  NOW() - INTERVAL '40 minutes'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', :'wallet_F', :'wallet_A', 499000,  205000000, 'seedv2-s2b',  NOW() - INTERVAL '2 hours 30 minutes'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', :'wallet_B', :'wallet_E', 500500,  115000000, 'seedv2-s2c',  NOW() - INTERVAL '5 hours 10 minutes'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', :'wallet_C', :'wallet_D', 498500,  275000000, 'seedv2-s2d',  NOW() - INTERVAL '9 hours 20 minutes'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', :'wallet_A', :'wallet_F', 502000,   85000000, 'seedv2-s2e',  NOW() - INTERVAL '13 hours'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT', :'wallet_E', :'wallet_B', 499500,  190000000, 'seedv2-s2f',  NOW() - INTERVAL '19 hours'),
-- BTC LONG (demo) trades
('BtCLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', :'wallet_C', :'wallet_E', 500000,   65000000, 'seedv2-s3a',  NOW() - INTERVAL '1 hour 20 minutes'),
('BtCLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', :'wallet_F', :'wallet_D', 499000,   80000000, 'seedv2-s3b',  NOW() - INTERVAL '5 hours 40 minutes'),
('BtCLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', :'wallet_B', :'wallet_C', 501000,   55000000, 'seedv2-s3c',  NOW() - INTERVAL '10 hours'),
('BtCLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', :'wallet_E', :'wallet_A', 500500,   70000000, 'seedv2-s3d',  NOW() - INTERVAL '16 hours'),
-- ETH LONG (demo) trades
('EtHLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', :'wallet_D', :'wallet_F', 499500,   95000000, 'seedv2-s4a',  NOW() - INTERVAL '50 minutes'),
('EtHLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', :'wallet_A', :'wallet_B', 500000,  110000000, 'seedv2-s4b',  NOW() - INTERVAL '3 hours 50 minutes'),
('EtHLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', :'wallet_C', :'wallet_E', 501000,   75000000, 'seedv2-s4c',  NOW() - INTERVAL '8 hours 10 minutes'),
('EtHLongDmo1A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', :'wallet_F', :'wallet_D', 499000,  130000000, 'seedv2-s4d',  NOW() - INTERVAL '15 hours'),
-- SOL LONG demo vault trades
('SoLLongDmo2A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', :'wallet_B', :'wallet_E', 500000,  155000000, 'seedv2-s5a',  NOW() - INTERVAL '1 hour 45 minutes'),
('SoLLongDmo2A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', :'wallet_F', :'wallet_C', 498500,  200000000, 'seedv2-s5b',  NOW() - INTERVAL '7 hours 30 minutes'),
('SoLLongDmo2A2B3C4D5E6F7G8H9J1K2L3M4N5P6Q7RA', :'wallet_D', :'wallet_A', 501500,  120000000, 'seedv2-s5c',  NOW() - INTERVAL '12 hours 45 minutes')

ON CONFLICT (tx_signature) DO NOTHING;

COMMIT;

-- ─── Verification ─────────────────────────────────────────────────────────────
SELECT
    'root_vaults'                                                AS tbl,
    COUNT(*)::TEXT                                               AS rows,
    '$' || ROUND(SUM(collateral_amount) / 1000000.0)::TEXT       AS tvl_usdc
FROM root_vaults
UNION ALL
SELECT 'claim_nodes', COUNT(*)::TEXT, NULL FROM claim_nodes
UNION ALL
SELECT 'orders (OPEN)', COUNT(*)::TEXT, NULL FROM orders WHERE status = 'OPEN'
UNION ALL
SELECT 'trades (24h)', COUNT(*)::TEXT, NULL
  FROM trades WHERE settled_at >= NOW() - INTERVAL '24 hours';

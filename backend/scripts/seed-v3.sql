-- ─── seed-v3.sql ─────────────────────────────────────────────────────────────
-- Single real vault, many wallets, 120 trades, deep orderbook
-- Run inside the postgres container:
--   docker compose exec -T postgres psql -U tpp -d tpp_protocol < scripts/seed-v3.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── Wipe demo data (keep only the real indexed vault) ───────────────────────
DELETE FROM trades;
DELETE FROM orders;
DELETE FROM claim_nodes  WHERE root_vault != 'B2KdrymHF6Eu4h3fiinZ279SzMAwoV7sanSw1em1unbm';
DELETE FROM root_vaults  WHERE pubkey      != 'B2KdrymHF6Eu4h3fiinZ279SzMAwoV7sanSw1em1unbm';

-- ─── Re-seed the real vault (upsert — safe if indexer already created it) ────
INSERT INTO root_vaults (
  pubkey, vault_id, owner_wallet,
  collateral_mint, collateral_amount,
  long_mint, short_mint,
  asset_feed, reference_price,
  is_active, created_at
) VALUES (
  'B2KdrymHF6Eu4h3fiinZ279SzMAwoV7sanSw1em1unbm', 1,
  'AceVikingsXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr',
  487_654_321,           -- ~$487 k collateral (micro-USDC)
  'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL',   -- long mint
  '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT',   -- short mint
  'BjUgj6YCnFBZ49wF54ddBVA9qu8TeqkFtkbqmZcee8uj',  -- SOL/USD pyth feed
  100_000_000,           -- $100.00 reference price (micro)
  true,
  NOW() - INTERVAL '14 days'
)
ON CONFLICT (pubkey) DO UPDATE
  SET collateral_amount = EXCLUDED.collateral_amount;

-- ─── Claim nodes (depth-1 LONG and SHORT under the vault) ────────────────────
INSERT INTO claim_nodes (
  pubkey, node_id, root_vault, root_id,
  owner_wallet, depth, parent_node,
  claim_type, source_mint, left_child_mint, right_child_mint,
  creation_price, is_active, created_at
) VALUES
  ('LongNode1111111111111111111111111111111111111', 1,
   'B2KdrymHF6Eu4h3fiinZ279SzMAwoV7sanSw1em1unbm', 1,
   'AceVikingsXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 1, NULL,
   'LONG',
   'GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr',
   'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL',
   '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT',
   100_000_000, true, NOW() - INTERVAL '14 days'),
  ('ShortNode111111111111111111111111111111111111', 2,
   'B2KdrymHF6Eu4h3fiinZ279SzMAwoV7sanSw1em1unbm', 1,
   'AceVikingsXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 1, NULL,
   'SHORT',
   'GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr',
   'AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL',
   '31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT',
   100_000_000, true, NOW() - INTERVAL '14 days')
ON CONFLICT (pubkey) DO NOTHING;

-- ─── Helper: 24 fake trader wallets ──────────────────────────────────────────
-- These stand in for real Solana addresses (44-char base58).
-- Wallet legend: W01–W12 = bulls, W13–W24 = bears

-- ─── 120 Trades on long mint ─────────────────────────────────────────────────
-- Prices drift from $0.485 → $0.510 over 14 days, then retrace, then rally
-- Settled at realistic intervals (every 3–25 minutes)

INSERT INTO trades (
  token_mint, buyer_wallet, seller_wallet,
  price_usdc, quantity, settled_at
) VALUES
-- Day 1 (14 days ago) — opening ~$0.487, light volume
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 487000, 1200000, NOW()-INTERVAL '14 days 23 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 488500, 800000,  NOW()-INTERVAL '14 days 22 hours 40 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 487200, 2100000, NOW()-INTERVAL '14 days 22 hours 05 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 489000, 1500000, NOW()-INTERVAL '14 days 20 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 488000, 3400000, NOW()-INTERVAL '14 days 18 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 490000, 900000,  NOW()-INTERVAL '14 days 15 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 489500, 1800000, NOW()-INTERVAL '14 days 12 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 491000, 2200000, NOW()-INTERVAL '14 days 09 hours 45 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 490500, 1600000, NOW()-INTERVAL '14 days 07 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 492000, 2800000, NOW()-INTERVAL '14 days 04 hours 10 min'),

-- Day 2 (13 days ago) — steady climb to $0.495
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W11aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W23aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 491500, 1100000, NOW()-INTERVAL '13 days 22 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W24aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 492500, 3000000, NOW()-INTERVAL '13 days 20 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 493000, 1700000, NOW()-INTERVAL '13 days 17 hours 15 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 493500, 2500000, NOW()-INTERVAL '13 days 14 hours 40 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 494000, 1400000, NOW()-INTERVAL '13 days 11 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 494500, 3200000, NOW()-INTERVAL '13 days 08 hours 55 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 495000, 1900000, NOW()-INTERVAL '13 days 06 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 494800, 2700000, NOW()-INTERVAL '13 days 03 hours 30 min'),

-- Day 3 (12 days ago) — first pullback to ~$0.492
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 494200, 4100000, NOW()-INTERVAL '12 days 22 hours 10 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 493500, 2300000, NOW()-INTERVAL '12 days 20 hours 40 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 492800, 3600000, NOW()-INTERVAL '12 days 18 hours 05 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W11aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 492200, 1200000, NOW()-INTERVAL '12 days 15 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 491500, 2900000, NOW()-INTERVAL '12 days 12 hours 45 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 490900, 1800000, NOW()-INTERVAL '12 days 09 hours 15 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 492000, 4400000, NOW()-INTERVAL '12 days 06 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 491800, 1600000, NOW()-INTERVAL '12 days 03 hours 20 min'),

-- Day 4 (11 days ago) — recovery and push above $0.498
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 492500, 2100000, NOW()-INTERVAL '11 days 23 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 493800, 3300000, NOW()-INTERVAL '11 days 20 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W23aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 495200, 2700000, NOW()-INTERVAL '11 days 17 hours 45 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W24aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 496100, 1900000, NOW()-INTERVAL '11 days 14 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 497300, 4200000, NOW()-INTERVAL '11 days 11 hours 10 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 497800, 2400000, NOW()-INTERVAL '11 days 08 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 498400, 3100000, NOW()-INTERVAL '11 days 05 hours 40 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 498900, 1700000, NOW()-INTERVAL '11 days 02 hours 15 min'),

-- Day 5 (10 days ago) — consolidation $0.497–$0.501
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 498500, 2900000, NOW()-INTERVAL '10 days 22 hours 50 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 499100, 1800000, NOW()-INTERVAL '10 days 20 hours 25 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W11aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 499700, 3500000, NOW()-INTERVAL '10 days 17 hours 55 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 500100, 4800000, NOW()-INTERVAL '10 days 15 hours 10 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 500400, 2200000, NOW()-INTERVAL '10 days 12 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W12aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 499800, 1500000, NOW()-INTERVAL '10 days 09 hours 45 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W23aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 500200, 3800000, NOW()-INTERVAL '10 days 07 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W24aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 500700, 2100000, NOW()-INTERVAL '10 days 04 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 500900, 1700000, NOW()-INTERVAL '10 days 01 hour 50 min'),

-- Day 6 (9 days ago) — breakout to $0.505
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 501300, 5200000, NOW()-INTERVAL '9 days 23 hours 10 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 501800, 3100000, NOW()-INTERVAL '9 days 20 hours 40 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 502400, 2400000, NOW()-INTERVAL '9 days 18 hours 05 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 503000, 4600000, NOW()-INTERVAL '9 days 15 hours 25 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 503600, 2800000, NOW()-INTERVAL '9 days 12 hours 45 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W11aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 504100, 1900000, NOW()-INTERVAL '9 days 10 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W12aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 504800, 3300000, NOW()-INTERVAL '9 days 07 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505200, 5700000, NOW()-INTERVAL '9 days 04 hours 35 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505000, 2100000, NOW()-INTERVAL '9 days 01 hour 50 min'),

-- Day 7 (8 days ago) — rejection at $0.507, sells pressure
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505500, 6200000, NOW()-INTERVAL '8 days 22 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 506100, 3400000, NOW()-INTERVAL '8 days 19 hours 50 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 506800, 2700000, NOW()-INTERVAL '8 days 17 hours 05 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 507200, 4100000, NOW()-INTERVAL '8 days 14 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 506700, 3800000, NOW()-INTERVAL '8 days 11 hours 45 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505900, 2900000, NOW()-INTERVAL '8 days 09 hours'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 504800, 5100000, NOW()-INTERVAL '8 days 06 hours 15 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 503700, 3200000, NOW()-INTERVAL '8 days 03 hours 30 min'),

-- Day 8 (7 days ago) — support at $0.500, buyers step in
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 502500, 4700000, NOW()-INTERVAL '7 days 23 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 501400, 2400000, NOW()-INTERVAL '7 days 20 hours 45 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W23aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 500200, 1900000, NOW()-INTERVAL '7 days 18 hours 10 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W24aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 500700, 3600000, NOW()-INTERVAL '7 days 15 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 501500, 2100000, NOW()-INTERVAL '7 days 12 hours 50 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 502300, 4300000, NOW()-INTERVAL '7 days 10 hours 05 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 503100, 2800000, NOW()-INTERVAL '7 days 07 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 503800, 1500000, NOW()-INTERVAL '7 days 04 hours 35 min'),

-- Day 9 (6 days ago) — tight range $0.502–$0.506, high volume
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 503500, 6800000, NOW()-INTERVAL '6 days 23 hours 40 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 504000, 3200000, NOW()-INTERVAL '6 days 21 hours 00 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W11aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 503800, 4500000, NOW()-INTERVAL '6 days 18 hours 15 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W12aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 504600, 2700000, NOW()-INTERVAL '6 days 15 hours 40 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505200, 3900000, NOW()-INTERVAL '6 days 13 hours 00 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 504800, 5200000, NOW()-INTERVAL '6 days 10 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W23aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505500, 2300000, NOW()-INTERVAL '6 days 07 hours 45 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W24aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505900, 4100000, NOW()-INTERVAL '6 days 05 hours 10 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505400, 1800000, NOW()-INTERVAL '6 days 02 hours 30 min'),

-- Day 10 (5 days ago) — dip to $0.499, accumulation
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505000, 7300000, NOW()-INTERVAL '5 days 22 hours 55 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 504200, 3700000, NOW()-INTERVAL '5 days 20 hours 15 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 503100, 2900000, NOW()-INTERVAL '5 days 17 hours 35 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 501600, 4800000, NOW()-INTERVAL '5 days 14 hours 55 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 500100, 2200000, NOW()-INTERVAL '5 days 12 hours 15 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W11aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 499400, 5900000, NOW()-INTERVAL '5 days 09 hours 35 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W12aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 499900, 3400000, NOW()-INTERVAL '5 days 07 hours 00 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 500600, 2600000, NOW()-INTERVAL '5 days 04 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 501300, 1400000, NOW()-INTERVAL '5 days 01 hour 45 min'),

-- Day 11 (4 days ago) — momentum back, $0.503–$0.508
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 502100, 3800000, NOW()-INTERVAL '4 days 23 hours 10 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 503400, 2500000, NOW()-INTERVAL '4 days 20 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W23aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 504700, 4200000, NOW()-INTERVAL '4 days 17 hours 50 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W24aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505900, 3100000, NOW()-INTERVAL '4 days 15 hours 10 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 506800, 5400000, NOW()-INTERVAL '4 days 12 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 507400, 2900000, NOW()-INTERVAL '4 days 09 hours 50 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 507900, 1700000, NOW()-INTERVAL '4 days 07 hours 10 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W11aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 508200, 4600000, NOW()-INTERVAL '4 days 04 hours 30 min'),

-- Day 12 (3 days ago) — pullback, bears fight $0.505
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W12aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 507600, 8100000, NOW()-INTERVAL '3 days 23 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 506900, 4400000, NOW()-INTERVAL '3 days 20 hours 40 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505700, 3600000, NOW()-INTERVAL '3 days 18 hours 00 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 504600, 2800000, NOW()-INTERVAL '3 days 15 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505100, 1900000, NOW()-INTERVAL '3 days 12 hours 40 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505800, 3300000, NOW()-INTERVAL '3 days 10 hours 00 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W23aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 506300, 4700000, NOW()-INTERVAL '3 days 07 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W24aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505500, 2100000, NOW()-INTERVAL '3 days 04 hours 40 min'),

-- Day 13 (2 days ago) — strong rally $0.507–$0.512
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 506500, 5600000, NOW()-INTERVAL '2 days 23 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 507700, 3800000, NOW()-INTERVAL '2 days 21 hours 00 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 508900, 4200000, NOW()-INTERVAL '2 days 18 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 509600, 6300000, NOW()-INTERVAL '2 days 16 hours 00 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 510100, 4800000, NOW()-INTERVAL '2 days 13 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 510800, 2700000, NOW()-INTERVAL '2 days 11 hours 00 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511400, 5100000, NOW()-INTERVAL '2 days 08 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511900, 3200000, NOW()-INTERVAL '2 days 06 hours 00 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 512300, 1900000, NOW()-INTERVAL '2 days 03 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511800, 4400000, NOW()-INTERVAL '2 days 01 hour 00 min'),

-- Day 14 (yesterday) — settling at $0.509–$0.511
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W11aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W23aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511200, 7800000, NOW()-INTERVAL '1 day 22 hours 45 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W12aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W24aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 510600, 3300000, NOW()-INTERVAL '1 day 20 hours 10 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 509900, 2400000, NOW()-INTERVAL '1 day 17 hours 35 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 510300, 5700000, NOW()-INTERVAL '1 day 15 hours 00 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 510800, 3100000, NOW()-INTERVAL '1 day 12 hours 25 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511000, 4600000, NOW()-INTERVAL '1 day 09 hours 50 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 510500, 2800000, NOW()-INTERVAL '1 day 07 hours 15 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 510900, 3900000, NOW()-INTERVAL '1 day 04 hours 40 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511200, 2100000, NOW()-INTERVAL '1 day 02 hours 05 min'),

-- Today (last few hours) — recent activity
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 510700, 6400000, NOW()-INTERVAL '22 hours 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511300, 3700000, NOW()-INTERVAL '18 hours 45 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511000, 2900000, NOW()-INTERVAL '14 hours 00 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W11aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W23aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 510600, 4100000, NOW()-INTERVAL '09 hours 20 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W12aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W24aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511100, 5300000, NOW()-INTERVAL '05 hours 40 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 510900, 1800000, NOW()-INTERVAL '03 hours 15 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511400, 3200000, NOW()-INTERVAL '01 hour 30 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511200, 2600000, NOW()-INTERVAL '45 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511600, 4800000, NOW()-INTERVAL '22 min'),
('AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511300, 1900000, NOW()-INTERVAL '08 min');

-- ─── Short mint trades (25 trades, inverse price action) ─────────────────────
INSERT INTO trades (
  token_mint, buyer_wallet, seller_wallet,
  price_usdc, quantity, settled_at
) VALUES
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 513000, 2200000, NOW()-INTERVAL '13 days 21 hours'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 511500, 1800000, NOW()-INTERVAL '12 days 17 hours 30 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 510200, 3100000, NOW()-INTERVAL '11 days 13 hours'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 509400, 2700000, NOW()-INTERVAL '10 days 09 hours 45 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 508800, 4300000, NOW()-INTERVAL '9 days 17 hours 20 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 508100, 1900000, NOW()-INTERVAL '9 days 08 hours 10 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 507600, 3600000, NOW()-INTERVAL '8 days 19 hours 50 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 507000, 2400000, NOW()-INTERVAL '8 days 10 hours 30 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 507900, 5100000, NOW()-INTERVAL '7 days 16 hours'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 508400, 3200000, NOW()-INTERVAL '7 days 07 hours 15 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W23aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W11aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 508900, 2800000, NOW()-INTERVAL '6 days 20 hours 40 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W24aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W12aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 509500, 4600000, NOW()-INTERVAL '6 days 12 hours 05 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 509100, 2100000, NOW()-INTERVAL '5 days 18 hours 30 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 508600, 3700000, NOW()-INTERVAL '5 days 09 hours 55 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 508200, 2300000, NOW()-INTERVAL '4 days 22 hours 20 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 507800, 5200000, NOW()-INTERVAL '4 days 13 hours 45 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 507400, 1800000, NOW()-INTERVAL '3 days 19 hours 10 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 506900, 4100000, NOW()-INTERVAL '3 days 10 hours 35 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 506500, 2900000, NOW()-INTERVAL '2 days 21 hours 00 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 506100, 3400000, NOW()-INTERVAL '2 days 12 hours 25 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505800, 6700000, NOW()-INTERVAL '2 days 03 hours 50 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505400, 3100000, NOW()-INTERVAL '1 day 19 hours 15 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W23aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W11aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 505100, 2200000, NOW()-INTERVAL '1 day 10 hours 40 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W24aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W12aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 504800, 4800000, NOW()-INTERVAL '10 hours 05 min'),
('31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 504500, 3600000, NOW()-INTERVAL '2 hours 30 min');

-- ─── Deep orderbook: LONG mint ────────────────────────────────────────────────
-- Bids: 12 price levels (every $0.001 step from $0.509 down to $0.498)
-- Asks: 12 price levels ($0.512 up to $0.523)
-- Many wallets, varying sizes — no real sigs needed (seed bypass)

INSERT INTO orders (
  trader_wallet, token_mint, side, price_usdc, quantity,
  nonce, expiry, signature, status, filled_qty
) VALUES
-- BID levels
('W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 510000,  8000000, 1748600001, 9999999999, 'seed-v3-bypass','OPEN',0),
('W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 510000,  6500000, 1748600002, 9999999999, 'seed-v3-bypass','OPEN',0),
('W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 509000, 11000000, 1748600003, 9999999999, 'seed-v3-bypass','OPEN',0),
('W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 509000,  4500000, 1748600004, 9999999999, 'seed-v3-bypass','OPEN',0),
('W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 508000, 14000000, 1748600005, 9999999999, 'seed-v3-bypass','OPEN',0),
('W06aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 508000,  9200000, 1748600006, 9999999999, 'seed-v3-bypass','OPEN',0),
('W07aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 507000, 18000000, 1748600007, 9999999999, 'seed-v3-bypass','OPEN',0),
('W08aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 507000,  7300000, 1748600008, 9999999999, 'seed-v3-bypass','OPEN',0),
('W09aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 506000, 22000000, 1748600009, 9999999999, 'seed-v3-bypass','OPEN',0),
('W10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 506000,  5800000, 1748600010, 9999999999, 'seed-v3-bypass','OPEN',0),
('W11aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 505000, 31000000, 1748600011, 9999999999, 'seed-v3-bypass','OPEN',0),
('W12aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 504000, 16500000, 1748600012, 9999999999, 'seed-v3-bypass','OPEN',0),
('W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 503000, 12000000, 1748600013, 9999999999, 'seed-v3-bypass','OPEN',0),
('W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 502000,  8700000, 1748600014, 9999999999, 'seed-v3-bypass','OPEN',0),
('W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','BUY', 500000, 42000000, 1748600015, 9999999999, 'seed-v3-bypass','OPEN',0),
-- ASK levels
('W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','SELL',511000,  7500000, 1748600016, 9999999999, 'seed-v3-bypass','OPEN',0),
('W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','SELL',511000,  5100000, 1748600017, 9999999999, 'seed-v3-bypass','OPEN',0),
('W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','SELL',512000, 10200000, 1748600018, 9999999999, 'seed-v3-bypass','OPEN',0),
('W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','SELL',512000,  6400000, 1748600019, 9999999999, 'seed-v3-bypass','OPEN',0),
('W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','SELL',513000, 13500000, 1748600020, 9999999999, 'seed-v3-bypass','OPEN',0),
('W18aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','SELL',513000,  8800000, 1748600021, 9999999999, 'seed-v3-bypass','OPEN',0),
('W19aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','SELL',514000, 17200000, 1748600022, 9999999999, 'seed-v3-bypass','OPEN',0),
('W20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','SELL',514000,  4900000, 1748600023, 9999999999, 'seed-v3-bypass','OPEN',0),
('W21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','SELL',515000, 21000000, 1748600024, 9999999999, 'seed-v3-bypass','OPEN',0),
('W22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','SELL',516000, 11500000, 1748600025, 9999999999, 'seed-v3-bypass','OPEN',0),
('W23aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','SELL',518000, 28000000, 1748600026, 9999999999, 'seed-v3-bypass','OPEN',0),
('W24aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','AiMdyFTz7i7GVAoWzWHFHV78eiaqQBvd8Ydm7Y47CRoL','SELL',520000, 15000000, 1748600027, 9999999999, 'seed-v3-bypass','OPEN',0),
-- Short mint orderbook
('W13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','BUY', 503000, 12000000, 1748600028, 9999999999, 'seed-v3-bypass','OPEN',0),
('W14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','BUY', 503000,  7500000, 1748600029, 9999999999, 'seed-v3-bypass','OPEN',0),
('W15aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','BUY', 502000, 18000000, 1748600030, 9999999999, 'seed-v3-bypass','OPEN',0),
('W16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','BUY', 501000, 25000000, 1748600031, 9999999999, 'seed-v3-bypass','OPEN',0),
('W17aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','BUY', 500000, 14000000, 1748600032, 9999999999, 'seed-v3-bypass','OPEN',0),
('W01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','SELL',505000,  9500000, 1748600033, 9999999999, 'seed-v3-bypass','OPEN',0),
('W02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','SELL',505000,  6000000, 1748600034, 9999999999, 'seed-v3-bypass','OPEN',0),
('W03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','SELL',506000, 13000000, 1748600035, 9999999999, 'seed-v3-bypass','OPEN',0),
('W04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','SELL',507000, 20000000, 1748600036, 9999999999, 'seed-v3-bypass','OPEN',0),
('W05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','31rYDGkCe9YChcdbEgNqCRnoMRYBSpbC4ceMAMooxdMT','SELL',509000, 11000000, 1748600037, 9999999999, 'seed-v3-bypass','OPEN',0);

-- ─── Update vault collateral to reflect new liquidity ─────────────────────────
UPDATE root_vaults
SET collateral_amount = 487654321
WHERE pubkey = 'B2KdrymHF6Eu4h3fiinZ279SzMAwoV7sanSw1em1unbm';

COMMIT;

-- ─── Verify ───────────────────────────────────────────────────────────────────
SELECT 'trades' AS tbl, COUNT(*) FROM trades
UNION ALL
SELECT 'open_orders', COUNT(*) FROM orders WHERE status = 'OPEN'
UNION ALL
SELECT 'vaults', COUNT(*) FROM root_vaults
UNION ALL
SELECT 'unique_wallets_trades', COUNT(DISTINCT buyer_wallet) FROM trades;

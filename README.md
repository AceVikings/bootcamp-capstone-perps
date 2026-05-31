# Raven Protocol

> **Layered options, no liquidations.**
> A Solana-native options protocol where every position is fully collateralized and any option token can be used as collateral for the next strike — no additional capital required.

---

## How It Works

### 1. Mint Option Tokens

Choose a type, strike, and expiry, then deposit the matching collateral:

| Type | Collateral | Why |
|------|-----------|-----|
| **CALL** | wSOL (9 dec) | CALL payout = `max(P−K, 0) / P × wSOL`. When P→∞, payout→1 wSOL — the collateral scales with price and is always sufficient |
| **PUT**  | USDC (6 dec) | PUT payout = `max(K−P, 0) / K × USDC`. Worst case is P=0 → payout = full K USDC. USDC exactly covers the maximum |

**CALL example** (deposit 1 wSOL at strike $180):

```
1 wSOL  →  0.5 CALL@$180  +  0.5 FLOOR@$180

CALL payout  at expiry P:  max(P − 180, 0) / P  ×  1 wSOL
FLOOR payout at expiry P:  min(P, 180)     / P  ×  1 wSOL
CALL + FLOOR = 1 wSOL  ✓  (invariant always holds)
```

**PUT example** (deposit 180 USDC at strike $180):

```
180 USDC  →  90 CAP@$180  +  90 PUT@$180

PUT payout at expiry P:  max(180 − P, 0) / 180  ×  180 USDC
CAP payout at expiry P:  min(P, 180)     / 180  ×  180 USDC
CAP + PUT = 180 USDC  ✓
```

---

### 2. Collect Premium

Sell either token on the orderbook and keep the other:

| Strategy | Action | You hold | You receive |
|---|---|---|---|
| Pure CALL | Sell FLOOR | CALL | wSOL premium |
| Pure PUT  | Sell CAP   | PUT  | USDC premium |
| Spread    | Hold both  | CALL + FLOOR | Bounded payoff at expiry |

---

### 3. Deepen the Strike Chain (Collateral Efficiency)

Anyone who holds a CALL token can split it into a **higher-strike CALL** and a **FLOOR spread** — without depositing any additional collateral:

```
CALL@$180  →  CALL@$190  +  FLOOR[$180–$190]
CALL@$190  →  CALL@$200  +  FLOOR[$190–$200]
...
```

The CALL **is** the collateral. Every split is self-funded. Holders can:
- Sell the FLOOR spread and keep the deeper CALL (net: free upgrade to higher strike).
- Hold both for a vertical spread payoff at settlement.
- Further split to any depth within `max_recursive_depth`.

The same works symmetrically for PUT tokens (each split lowers the strike):

```
PUT@$180  →  PUT@$170  +  CAP[$170–$180]
```

---

### 4. Settlement

At expiry, any token holder calls `settle_vault`:

1. The oracle price is **locked on the first call** to prevent front-running.
2. Each side (CALL or FLOOR/PUT or CAP) settles **independently** — no coordination required.
3. The locked per-token payout rate is consistent for all settlers, regardless of order.

**CALL settlement example** (oracle $200, strike $180, 1 wSOL collateral):
```
CALL payout  =  max(200−180, 0) / 200  ×  1 wSOL  =  0.10 wSOL
FLOOR payout =  min(200, 180)   / 200  ×  1 wSOL  =  0.90 wSOL
Total = 1.00 wSOL  ✓
```

**PUT settlement example** (oracle $150, strike $180, 180 USDC collateral):
```
PUT payout  =  max(180−150, 0) / 180  ×  180 USDC  =  30.00 USDC
CAP payout  =  min(150, 180)   / 180  ×  180 USDC  =  150.00 USDC
Total = 180.00 USDC  ✓
```

Because every position is fully collateralized from day one, there are **no liquidations**, no bad debt, and no oracle-triggered cascades.

---

## Architecture

### Solana Program (`contracts/`)

Anchor program `tpp_protocol` deployed on devnet:  
`9iUeMGw14CaAiASMUruBMWRR5j7HcEXwthuN5pDAo3Qf`

| Instruction | What it does |
|---|---|
| `create_root_vault` | Deposit wSOL (CALL) or USDC (PUT), choose strike/expiry/side, mint paired tokens |
| `split_claim` | Burn a CALL/PUT token, mint next-strike CALL + FLOOR spread (zero extra collateral) |
| `merge_claims` | Burn CALL+FLOOR children, recover parent token |
| `redeem_root` | Pre-expiry: burn equal paired tokens, recover collateral |
| `settle_vault` | Post-expiry: burn one side, receive oracle-based collateral payout |
| `settle_trade` | On-chain atomic settlement of matched off-chain orders |

Key design decisions:
- **Correct collateral per type**: wSOL for CALLs (price-scaling), USDC for PUTs (strike-bounded).
- **Fully collateralized at every depth**: `V_call + V_floor = V_total` is a hard on-chain invariant.
- **No forced liquidations**: protocol bad debt is structurally impossible.
- **Composable**: secondary-market buyers can split tokens without being the original depositor.
- **Dual oracle mode**: mock oracle (devnet) or Pyth pull-oracle (mainnet) — zero code change.

---

### Backend (`backend/`)

Rust + Axum + PostgreSQL, deployed on GCP:  
`https://raven.vikings.studio/api`

| Service | Role |
|---|---|
| **API** | REST: vaults, orderbook, trades, analytics, faucet (USDC + wSOL) |
| **Indexer** | Subscribes to on-chain Anchor events, writes to Postgres |
| **Matcher** | Price-time priority order matching engine |
| **WebSocket** | Real-time orderbook and event broadcast |

Key endpoints:

```
GET  /health                    → {"status":"ok"}
GET  /vaults                    → indexed option vaults with strike/expiry/vault_side
GET  /vaults/:pk/tree           → vault + all recursive split nodes
GET  /vaults/by-mint/:mint      → resolve any token mint to its vault context
GET  /options-chain             → Black-Scholes priced option chain
GET  /orders/:mint/book         → live bid/ask orderbook
GET  /analytics                 → TVL, volumes, active vaults
POST /orders                    → submit a signed limit order
POST /faucet {wallet}           → mint 1,000 devnet USDC  (default)
POST /faucet {wallet, token:"WSOL"} → mint 10 mock devnet wSOL
GET  /ws                        → WebSocket (upgrades to 101)
```

---

### Frontend (`frontend/`)

Vite + React + Tailwind, Phantom/Backpack wallet support.

| Page | What it does |
|---|---|
| **Mint Options** (`/app/deposit`) | Type toggle → auto-selects wSOL (CALL) or USDC (PUT) collateral; strike + expiry grids; faucet per token |
| **Options Chain** (`/app`) | Full strike × expiry grid with BS mid prices |
| **Trade** (`/app/trade/:mint`) | Orderbook, price chart, sign & submit limit orders |
| **Split** (`/app/split/:mint`) | Use CALL/PUT token as collateral for next strike |
| **Portfolio** (`/app/portfolio`) | Wallet-scoped live token balances, ITM/ATM/OTM tags, moneyness |
| **Settle** (`/app/settle/:vault`) | Post-expiry payout claim |

---

## Devnet Setup

### Prerequisites

```bash
solana config set --url devnet
solana-keygen new -o ~/.config/solana/tpp-devnet.json
solana airdrop 2 ~/.config/solana/tpp-devnet.json
```

### Contract

```bash
cd contracts
anchor build          # localnet (mock oracle)
anchor test           # 19/19 tests pass
anchor deploy --provider.cluster devnet --provider.wallet ~/.config/solana/tpp-devnet.json
```

### Devnet Init (one-time)

```bash
# Create test USDC mint + mock price oracles
npx ts-node -P tsconfig.json scripts/devnet-init.ts

# Create mock wSOL mint (9 dec, keeper = mint authority)
npx ts-node -P tsconfig.json scripts/create-wsol-mint.ts

# Seed 13-strike × 5-expiry CALL + PUT chain
npx ts-node -P tsconfig.json scripts/seed-liquidity.ts
```

### Backend (local)

```bash
cd backend
cp .env.example .env   # fill DATABASE_URL, WSOL_MINT, etc.
cargo run --bin fractal-api &
cargo run --bin fractal-indexer &
```

### Frontend (local)

```bash
cd frontend
cp .env.example .env   # set VITE_API_URL
npm install
npm run dev
```

---

## Token Semantics

| Vault Side | Collateral | long_mint | short_mint |
|---|---|---|---|
| LONG (0) — CALL vault | wSOL | CALL — profits when P > strike | FLOOR — bounded at strike |
| SHORT (1) — PUT vault | USDC | CAP — bounded at strike | PUT — profits when P < strike |

The payout formulas are dimensionally consistent because `max(P−K, 0) / P` and `min(P, K) / P` are **dimensionless ratios** — multiplying them by wSOL or USDC gives a payout in the same unit as the collateral.

At any split depth, the parent token **is** the collateral. There is no extra deposit at split time — the split is a pure token operation. The collateral invariant `V_long + V_short = V_parent` holds transitively at every level of the tree.

---

## Security

- Keypair files (`*.json`) and `.env` are excluded from version control.
- CI/CD injects all secrets from GitHub Secrets on every deploy; nothing is hardcoded in the repo.
- Nonce-based replay protection prevents order double-execution on-chain.
- `settlement_price` is locked on the first `settle_vault` call; per-token payouts are consistent regardless of settlement order.
- Mock wSOL and USDC mints are devnet-only tokens. The keeper wallet (mint authority) is gitignored and stored only in the deployment environment.

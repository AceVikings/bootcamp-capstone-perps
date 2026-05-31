# Raven Protocol

> **Layered options, no liquidations.**
> A Solana-native options protocol where every position is fully collateralized and any option token can be used as collateral for the next strike — no additional capital required.

---

## How It Works

### 1. Mint Option Tokens

Deposit USDC collateral and choose a **strike price**, **expiry**, and **type** (CALL or PUT):

```
Deposit 100 USDC  →  50 CALL@$180  +  50 FLOOR@$180
```

- **CALL@$180** — pays off when SOL price at expiry is above $180.  
  *Value at expiry = max(P − 180, 0) / P × collateral*

- **FLOOR@$180** — the complementary token, bounded at $180.  
  *Value at expiry = min(P, 180) / P × collateral*

Together they always equal the full collateral:  
`CALL + FLOOR = total collateral` (the invariant never breaks).

For **PUT** vaults the semantics mirror the CALL side:  
`CAP@$180 + PUT@$180 = total collateral`

---

### 2. Collect Premium

Sell either token on the orderbook and keep the other:

| Strategy | Action | You hold | You receive |
|---|---|---|---|
| Pure CALL | Sell FLOOR | CALL | USDC premium |
| Pure PUT  | Sell CAP   | PUT  | USDC premium |
| Spread    | Hold both  | CALL + FLOOR | Bounded payoff |

---

### 3. Deepen the Strike Chain (Collateral Efficiency)

Anyone who holds a CALL token can split it into a **higher-strike CALL** and a **FLOOR spread** — without depositing any additional USDC:

```
CALL@$180  →  CALL@$190  +  FLOOR[$180–$190]
CALL@$190  →  CALL@$200  +  FLOOR[$190–$200]
...
```

The CALL **is** the collateral. Every split is self-funded. Holders can:
- Sell the spread (FLOOR) and keep the deeper CALL.
- Hold both for a vertical spread payoff at settlement.
- Further split to any depth within `max_recursive_depth`.

The same works symmetrically for PUT tokens on a SHORT vault:

```
PUT@$180  →  PUT@$170  +  CAP[$170–$180]
```

---

### 4. Settlement

At expiry, any holder calls `settle_vault`:

1. The oracle price is locked on the **first** call (prevents manipulation).
2. Each token type receives its share of collateral based on the final price vs strike.
3. CALL and FLOOR settle **independently** — no coordination required.

```
Oracle = $200,  Strike = $180,  Total collateral = 100 USDC

CALL payout  =  max(200−180, 0) / 200 × 100  =  $10.00 USDC
FLOOR payout =  min(200, 180)   / 200 × 100  =  $90.00 USDC
```

Because every position is fully collateralized from day one, there are **no liquidations**, no bad debt, and no oracle-triggered cascades.

---

## Architecture

### Solana Program (`contracts/`)

Anchor program `tpp_protocol` deployed on devnet:  
`9iUeMGw14CaAiASMUruBMWRR5j7HcEXwthuN5pDAo3Qf`

| Instruction | What it does |
|---|---|
| `create_root_vault` | Deposit USDC, choose strike/expiry/side, mint CALL+FLOOR |
| `split_claim` | Burn a CALL/PUT token, mint higher-strike CALL + FLOOR spread |
| `merge_claims` | Burn CALL+FLOOR children, recover parent token |
| `redeem_root` | Pre-expiry: burn equal CALL+FLOOR, get USDC back |
| `settle_vault` | Post-expiry: burn one side, receive oracle-based payout |
| `settle_trade` | On-chain atomic settlement of matched off-chain orders |

Key design decisions:
- **Fully collateralized**: `V_call + V_floor = V_total` holds at every depth.
- **No forced liquidations**: protocol bad debt is structurally impossible.
- **Composable**: secondary-market buyers of CALL tokens can split them without being the original depositor.
- **Dual oracle mode**: mock oracle (devnet tests) or Pyth pull-oracle (mainnet) — zero code change for callers.

---

### Backend (`backend/`)

Rust + Axum + PostgreSQL, deployed on GCP:  
`https://raven.vikings.studio/api`

| Service | Role |
|---|---|
| **API** | REST endpoints: vaults, orderbook, trades, analytics, faucet |
| **Indexer** | Subscribes to on-chain Anchor events, writes to Postgres |
| **Matcher** | Price-time priority order matching engine |
| **WebSocket** | Real-time orderbook and event broadcast |

Key endpoints:

```
GET  /health               → {"status":"ok"}
GET  /vaults               → all indexed option vaults with strike/expiry
GET  /vaults/:pk/tree      → vault + all recursive split nodes
GET  /vaults/by-mint/:mint → resolve any token mint to its vault context
GET  /options-chain        → Black-Scholes priced option chain
GET  /orders/:mint/book    → live bid/ask orderbook
GET  /analytics            → TVL, volumes, active vaults
POST /orders               → submit a signed limit order
POST /faucet               → mint 1,000 devnet USDC
GET  /ws                   → WebSocket (upgrades to 101)
```

---

### Frontend (`frontend/`)

Vite + React + Tailwind, Phantom/Backpack wallet support.

| Page | What it does |
|---|---|
| **Mint Options** (`/app/deposit`) | Strike + expiry + type dropdowns; deposit USDC; mint tokens |
| **Options Chain** (`/app`) | Full strike × expiry grid with BS mid prices |
| **Trade** (`/app/trade/:mint`) | Orderbook, price chart, sign & submit limit orders |
| **Split** (`/app/split/:mint`) | Use CALL/PUT token as collateral for next strike |
| **Portfolio** (`/app/portfolio`) | Wallet-scoped live token balances, ITM/ATM/OTM tags |
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

### Seed Liquidity

```bash
# One-time devnet initialisation (USDC mint + mock oracles)
npx ts-node -P tsconfig.json scripts/devnet-init.ts

# Create 13-strike × 5-expiry CALL + PUT chain
npx ts-node -P tsconfig.json scripts/seed-liquidity.ts
```

### Backend (local)

```bash
cd backend
cp .env.example .env   # fill DATABASE_URL etc.
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

| Vault Side | long_mint | short_mint |
|---|---|---|
| LONG (0) | CALL — profits when P > strike | FLOOR — bounded at strike |
| SHORT (1) | CAP — bounded at strike | PUT — profits when P < strike |

At any split depth, the parent token **is** the collateral. There is no separate USDC movement — the split is a pure token operation. The collateral invariant holds transitively through every level of the tree.

---

## Security

- Keypair files (`*.json`) and `.env` are excluded from version control.
- CI/CD writes secrets from GitHub Secrets on every deploy; nothing is hardcoded.
- Nonce-based replay protection prevents order double-execution on-chain.
- `settlement_price` is locked by the first `settle_vault` call so per-token payouts are consistent regardless of settlement order.

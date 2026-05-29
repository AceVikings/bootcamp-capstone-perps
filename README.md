# Fractal Markets

> **Trade risk, not positions.**  
> A Solana-native protocol for recursive risk decomposition — fully collateralized at every depth, no liquidations, no insurance fund.

---

## What Is Fractal Markets?

Fractal Markets lets users deposit USDC and receive two complementary **claim tokens** — `LONG` and `SHORT`. Each claim can itself be split into a new `LONG`/`SHORT` pair, creating a **claim tree** of any depth. Every node in the tree always satisfies:

$$V_{\text{left}} + V_{\text{right}} = V_{\text{parent}}$$

No value is ever created or destroyed. No debt is ever issued. A claim may fall to zero, but never below it — making liquidations structurally impossible.

---

## User Flow

```
                     ┌──────────────────┐
                     │  Alice deposits  │
                     │    100 USDC      │
                     └────────┬─────────┘
                              │  create_root_vault
                              ▼
                     ┌──────────────────┐
                     │   Root Vault     │
                     │  LONG   SHORT    │
                     │   50  +  50      │
                     └───┬──────────┬───┘
                         │          │
              ┌──────────▼──┐   ┌───▼───────────┐
              │    LONG     │   │     SHORT      │
              │  (bullish   │   │  (bearish      │
              │   claim)    │   │   claim)       │
              └──────┬──────┘   └───────────────┘
                     │  Alice sells SHORT to Bob
                     │  Alice keeps LONG
                     │
                     │  BTC rises — market reprices:
                     │  LONG → 70 USDC, SHORT → 30 USDC
                     │
                     │  split_claim (optional)
                     ▼
          ┌──────────────────────┐
          │  LONG sub-splits     │
          │                      │
          │  LONG → LONG         │
          │  (extreme bullish)   │
          │                      │
          │  LONG → SHORT        │
          │  (bullish hedge)     │
          └──────────────────────┘
                     │
                     │  Alice trades LONG → SHORT
                     │  to Charlie
                     │
                     │  Alice re-acquires SHORT
                     │  from Bob (merge possible)
                     ▼
          ┌──────────────────────┐
          │  merge_claims        │
          │  LONG + SHORT → ROOT │
          │  redeem 100 USDC     │
          └──────────────────────┘
```

### Step-by-step

| Step | Action | Result |
|---|---|---|
| 1 | Deposit 100 USDC | Root Vault created; 100 LONG + 100 SHORT tokens minted |
| 2 | Sell SHORT to Bob | Alice holds LONG exposure; Bob holds SHORT |
| 3 | BTC rises | Market reprices: LONG = 70, SHORT = 30 |
| 4 | Alice recursively splits her LONG | Receives LONG→LONG (extreme bull) + LONG→SHORT (hedge) |
| 5 | Alice trades LONG→SHORT to Charlie | Concentrates pure directional exposure |
| 6 | Alice buys SHORT back from Bob | Now holds LONG + SHORT |
| 7 | Alice merges LONG + SHORT | Reconstructs root vault |
| 8 | Redeem root vault | Receives USDC (100 collateral minus fees) |

No liquidation at any step. No margin call. Worst case for any claim is value → 0.

---

## Claim Tree

```
Root Vault (100 USDC)
├── LONG
│   ├── LONG → LONG       depth 2 — extreme bullish
│   └── LONG → SHORT      depth 2 — bullish hedge
└── SHORT
    ├── SHORT → LONG      depth 2 — bearish hedge
    └── SHORT → SHORT     depth 2 — extreme bearish
```

- **Depth 1** — first split from root collateral
- **Depth N** — any further split from any active claim
- **Max depth** — configurable on-chain (default: 4)
- **Every level** — independently tradeable on the orderbook

---

## Why No Liquidations

| System | Problem |
|---|---|
| Perpetuals | Exposure can exceed collateral → margin calls → bad debt |
| Fractal Markets | Claim value ≤ Parent value (always) → no debt possible |

```
Traditional perpetual:
  User posts $100 margin
  Opens $1000 notional long
  BTC drops 11% → $110 loss → liquidated → bad debt possible

Fractal Markets:
  User deposits $100 USDC
  Receives LONG + SHORT (each worth up to $100 combined)
  LONG drops to $0 → user lost $100 prepaid
  Protocol owes nothing → no insurance fund needed
```

---

## Protocol Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         FRONTEND                               │
│  Landing · Dashboard · Deposit · Trade · Portfolio · Split     │
│  React + Vite + @solana/wallet-adapter + @xyflow/react         │
└───────────────────────┬────────────────────────────────────────┘
                        │  REST / WebSocket
┌───────────────────────▼────────────────────────────────────────┐
│                      BACKEND API                               │
│  GET /vaults   GET /claims/:wallet/tree   POST /orders         │
│                                                                │
│  ┌──────────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Match Engine   │  │   Indexer    │  │  WS Broadcast   │  │
│  │  per-mint books  │  │  event→DB    │  │  CLAIM_SPLIT    │  │
│  │  settle_trade    │  │  Postgres    │  │  CLAIM_MERGE    │  │
│  └──────────────────┘  └──────────────┘  └─────────────────┘  │
└───────────────────────┬────────────────────────────────────────┘
                        │  Anchor RPC
┌───────────────────────▼────────────────────────────────────────┐
│              SOLANA PROGRAM  — fractal_protocol                │
│                                                                │
│  ┌──────────────┐  ┌────────────────┐  ┌───────────────────┐  │
│  │   Vault      │  │   Claim Tree   │  │      Market       │  │
│  │  Module      │  │    Module      │  │      Module       │  │
│  │              │  │                │  │                   │  │
│  │create_root_  │  │ split_claim    │  │  settle_trade     │  │
│  │vault         │  │ merge_claims   │  │  (verify sigs,    │  │
│  │redeem_root   │  │ (any depth)    │  │  transfer SPL)    │  │
│  └──────────────┘  └────────────────┘  └───────────────────┘  │
│                                                                │
│  ┌───────────────────────────────────┐                         │
│  │   Oracle Module                  │                         │
│  │   Pyth price feeds               │                         │
│  │   staleness guard (60s)          │                         │
│  └───────────────────────────────────┘                         │
└───────────────────────┬────────────────────────────────────────┘
                        │
                   ┌────▼────┐
                   │  Pyth   │
                   │ Network │
                   └─────────┘
```

---

## Key Components

### Contracts (`/contracts`)

Anchor program — `fractal_protocol` — deployed on Solana devnet.

**Program ID:** `9iUeMGw14CaAiASMUruBMWRR5j7HcEXwthuN5pDAo3Qf`

| Account | Description |
|---|---|
| `ProtocolConfig` | Global fee parameters, max depth (default 4), admin key |
| `RootVault` | Per-deposit collateral vault with its own LONG + SHORT SPL mints |
| `ClaimNode` | Tracks each split event — records depth, parent, claim type, and child mints |
| `NonceLedger` | Per-user replay protection for signed orders |

| Instruction | Module | Description |
|---|---|---|
| `create_root_vault` | Vault | Deposit USDC → mint LONG + SHORT tokens |
| `redeem_root` | Vault | Burn LONG + SHORT → withdraw USDC (depth-1 only) |
| `split_claim` | Claim Tree | Split any active claim at any depth → two new SPL mints |
| `merge_claims` | Claim Tree | Burn both children → restore parent claim |
| `settle_trade` | Market | Relayer submits matched order pair → transfers SPL tokens |

### Backend (`/backend`)

Rust / Axum API with PostgreSQL.

| Crate | Role |
|---|---|
| `fractal_api` | HTTP + WebSocket server |
| `fractal_matcher` | Polling match engine; per-mint orderbooks |
| `fractal_indexer` | Solana RPC event listener → Postgres |
| `fractal_db` | Sqlx models + migrations |
| `fractal_common` | Shared types: `ClaimSide`, `OrderSide`, `OrderStatus` |

Key REST endpoints:

```
GET  /vaults                        — list all root vaults
GET  /vaults/:pubkey                — single vault by PDA
GET  /claims/:wallet                — all claim nodes for a wallet
GET  /claims/:wallet/tree           — nested tree structure for visualization
GET  /claims/node/:pubkey           — single claim node
POST /orders                        — relay signed limit order
GET  /orders/:token_mint/book       — live orderbook for a claim token
DEL  /orders/:id                    — cancel open order
GET  /trades/:token_mint            — recent trade history
GET  /analytics                     — protocol-wide stats
WS   /ws                            — real-time events
```

### Frontend (`/frontend`)

React + Vite + TypeScript.

**Landing pages** (complete): Hero, MarketTicker, Stats, Features, HowItWorks, TokenMechanics, CTA, Footer, Docs.

**App pages** (in development):

| Route | Page |
|---|---|
| `#/app` | Dashboard: active markets, live prices, your positions |
| `#/app/deposit` | Deposit USDC → create root vault → receive LONG + SHORT |
| `#/app/trade/:mint` | Trade any claim token: orderbook, chart, order form |
| `#/app/portfolio` | All positions + recursive claim tree visualization |
| `#/app/split/:nodeId` | 3-step split wizard, works at any depth |

---

## Protocol Invariants

| # | Invariant | Enforced by |
|---|---|---|
| 1 | `V_left + V_right = V_parent` at every node | `split_claim` instruction |
| 2 | Claim value ≥ 0 at all times | On-chain token accounting |
| 3 | `max_recursive_depth` limits tree growth | `ProtocolConfig` account |
| 4 | Redemptions are always available | No pause on `redeem_root` |
| 5 | Order nonces are non-repeating | `NonceLedger` PDA per wallet |
| 6 | All prices come from Pyth | Oracle module, staleness ≤ 60s |

---

## Fee Schedule

| Event | Fee | Recipient |
|---|---|---|
| Create root vault | 10 bps | Treasury |
| Redeem root vault | 5 bps | Treasury |
| Split claim | 15 bps | Treasury |
| Merge claims | 5 bps | Treasury |
| Trade fill | 0 bps (v1) | — |

All fees collected in USDC into a PDA-controlled treasury.

---

## Comparison With Perpetuals

| Feature | Perpetuals | Fractal Markets |
|---|---|---|
| Margin required | Yes | No |
| Liquidations | Yes | **No** |
| Bad debt possible | Yes | **Impossible** |
| Insurance fund | Required | **Not needed** |
| Counterparty dependency | Yes | **No** |
| Exposure > Collateral | Yes | **No** |
| Recursive risk creation | No | **Native** |
| Risk tranching | No | **Native** |

---

## Local Development

### Prerequisites

- Rust 1.75+
- Anchor 0.30+
- Solana CLI 1.18+
- Node 20+
- PostgreSQL 15+

### Contracts

```bash
cd contracts
anchor build
anchor test
```

### Backend

```bash
cd backend
cp .env.example .env   # fill DATABASE_URL, PROGRAM_ID, RPC_URL
docker-compose up -d   # start postgres
cargo run -p fractal_api
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## MVP Scope

**Included:**
- USDC collateral
- BTC/USD market (Pyth)
- LONG / SHORT claim tokens at any depth
- Recursive split + merge
- Offchain orderbook (relayer network)
- Onchain settlement via `settle_trade`
- Claim tree visualization

**Excluded from v1:**
- Options or volatility products
- Lending on claim collateral
- User-defined payoff functions
- Cross-margin
- Multiple collateral types

---

## License

MIT

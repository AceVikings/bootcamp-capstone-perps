# Raven Protocol

> **Trade options, not promises.**
> A Solana-native options protocol built on recursive strike decomposition, with deterministic settlement and no liquidation risk.

---

## Overview

Raven Protocol is the latest evolution of this capstone project, now focused on **structured options** instead of perpetuals. The protocol lets users create and trade option exposures using on-chain vaults, strike-based option nodes, and a live orderbook.

The system is built around one core principle: each position is fully collateralized and split into complementary claims whose value always recombines to the parent value.

$$V_{left} + V_{right} = V_{parent}$$

Because no debt is created, liquidation cascades and protocol bad debt are structurally eliminated.

---

## What Changed

- The project moved from a perps design to an **options-first architecture**.
- Data models now center on `option_vaults` and `option_nodes`.
- The backend and indexer now track vault lifecycle and recursive option splits.
- The frontend scope now targets options workflows: chain view, vault creation, trade, portfolio, and settlement.

---

## Core Mechanics

### 1. Option Vault Creation

Users create a vault with:

- side: `LONG` or `SHORT`
- strike (micro-USDC precision)
- expiry (European-style)
- collateral

Each vault mints option tokens represented as SPL assets.

### 2. Recursive Option Splits

Any option node can be split into child LONG/SHORT claims at adjacent strikes (tick-based). This creates a strike tree that supports layered strategies, from directional bets to spread-like structures.

### 3. Deterministic Settlement

At expiry, the protocol locks an oracle price (Pyth), computes payouts deterministically, and marks vaults settled. No discretionary settlement logic and no liquidation engine are needed.

---

## Architecture

### Contracts (`contracts/`)

Anchor program: `tpp_protocol`

- option vault lifecycle
- recursive node split/merge logic
- settlement and on-chain checks
- nonce/replay protections for order flows

### Backend (`backend/`)

Rust + Axum + PostgreSQL:

- **Indexer**: writes on-chain option events into Postgres
- **API**: serves vaults, nodes, orderbook, and analytics
- **Matcher**: per-mint order matching and execution relay
- **WebSocket**: real-time market and settlement updates

### Frontend (`frontend/`)

Vite + React app for:

- options dashboard
- chain + strike discovery
- vault creation
- token trading
- portfolio and settlement actions

---

## Database Model (Current)

### `option_vaults`

Stores vault-level state:

- `vault_side`, `strike`, `expiry`
- collateral metadata
- settlement status and settlement price

### `option_nodes`

Stores split tree state:

- parent-child relationships
- depth tracking
- child mints and backing values
- active/inactive node status

---

## Why This Design

- Full collateral accounting at every node
- No forced liquidations
- Cleaner risk decomposition across strikes
- More expressive options strategy construction on-chain

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
cp .env.example .env
docker-compose up -d
cargo run -p fractal_api
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Status

The repository is actively updated toward a production-grade options stack with recursive strike decomposition, real-time orderbook flows, and deterministic settlement.

---

## License

MIT

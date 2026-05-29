# TPP Protocol — Smart Contracts

Token Perpetuals Protocol (TPP) is a decentralised on-chain perpetuals protocol built on Solana
using the [Anchor](https://www.anchor-lang.com/) framework. It converts locked collateral into
fungible LONG and SHORT SPL tokens, enabling permissionless leveraged price exposure without a
centralised counterparty.

---

## Table of Contents

1. [Protocol Overview](#1-protocol-overview)
2. [Position Economics](#2-position-economics)
3. [Instruction Reference](#3-instruction-reference)
4. [PDA Seeds](#4-pda-seeds)
5. [Account Layouts](#5-account-layouts)
6. [Fee Structure](#6-fee-structure)
7. [Oracle Architecture](#7-oracle-architecture)
8. [Security Properties](#8-security-properties)
9. [Known Limitations & Audit Findings](#9-known-limitations--audit-findings)
10. [Building](#10-building)
11. [Running Tests](#11-running-tests)
12. [Deployment Checklist](#12-deployment-checklist)

---

## 1. Protocol Overview

```
User deposits collateral (USDC)
         │
         ▼
   mintPositionPair
         │
         ├──► LONG tokens (fungible SPL, 1:1 with net collateral)
         └──► SHORT tokens (fungible SPL, 1:1 with net collateral)
```

- A **PositionVault** locks the collateral and records the entry oracle price.
- LONG and SHORT tokens are standard SPL mints — they can be traded on any AMM or DEX.
- Anyone holding LONG or SHORT tokens may call `redeemPosition` at any time to burn them and
  receive a proportional share of the vault's collateral, priced at the current oracle feed.
- Redemption is **always permitted**, even when minting is paused (emergency exit guarantee).

---

## 2. Position Economics

Let:
- `C` = collateral locked in a vault (after mint fee)
- `P_entry` = oracle price at mint time (USD, 6 decimal precision)
- `P_current` = oracle price at redemption time

### Intrinsic values

| Side  | Formula                                       |
|-------|-----------------------------------------------|
| LONG  | `V_LONG = C × (P_current / P_entry)`          |
| SHORT | `V_SHORT = 2C − V_LONG = C × (2 − P_current/P_entry)` |

> `V_LONG + V_SHORT = 2C` (constant sum), but the vault only holds `C`.
> The two sides are **zero-sum within a vault**: LONG gains come from SHORT losses and vice versa.

### Redemption payout

```
payout_gross = amount × V_side / total_tokens_minted_for_side
payout_net   = payout_gross × (1 − redeem_fee_bps / 10_000)
```

The vault SPL token account is the source of truth for available collateral. Payouts are capped
by `vault_collateral.amount`, so later redeemers on the losing side may receive zero once the
collateral is exhausted.

### Liquidation thresholds

| Side  | Liquidatable when…                        | Formula                              |
|-------|-------------------------------------------|--------------------------------------|
| LONG  | Price rose enough to wipe out SHORT side  | `P_current ≥ 1.95 × P_entry`        |
| SHORT | Price fell enough to wipe out SHORT side  | `P_current ≤ 0.05 × P_entry`        |

The 5% buffer prevents liquidation exactly at the theoretical zero-value boundary.

---

## 3. Instruction Reference

All instructions are in `programs/tpp_protocol/src/instructions.rs`.

### `initialize_protocol`

One-time setup. Creates the global `ProtocolConfig` PDA.

| Parameter                | Type  | Description                                         |
|--------------------------|-------|-----------------------------------------------------|
| `mint_fee_bps`           | u16   | Fee on minting (max 500 = 5%)                       |
| `redeem_fee_bps`         | u16   | Fee on redemption (max 500 = 5%)                    |
| `recursive_fee_bps`      | u16   | Fee for recursive/leveraged positions (max 500)     |
| `liquidation_reward_bps` | u16   | Liquidator incentive (max 1000 = 10%)               |
| `max_recursive_depth`    | u8    | Max levels of recursive minting (max 3)             |
| `oracle_conf_denominator`| u64   | Pyth confidence check: conf < price / denominator (0 = skip) |
| `max_oracle_age_secs`    | u64   | Reject oracle readings older than this (> 0 required) |
| `circuit_breaker_bps`    | u16   | Reject if price moved > this many bps in 60 s      |

**Access**: Permissionless (first caller becomes admin; PDA is `init` so it can only be called once).

---

### `create_epoch`

Opens a new 24-hour epoch for an asset. Reads the oracle to establish the reference price and
±0.5% price band.

| Parameter  | Type | Description                        |
|------------|------|------------------------------------|
| `epoch_id` | u64  | Monotonically increasing per asset |

**Access**: Permissionless keeper call. Fails when protocol is paused.

---

### `mint_position_pair`

Deposits collateral and mints an equal amount of LONG and SHORT tokens into the caller's ATAs.

| Parameter        | Type | Description                      |
|------------------|------|----------------------------------|
| `epoch_id`       | u64  | Target epoch                     |
| `vault_index`    | u64  | Per-minter index (allows N vaults) |
| `collateral_amount` | u64 | USDC to deposit (6 decimals)   |

**Access**: Any signer. Fails when protocol is paused or collateral is zero.

---

### `redeem_position`

Burns position tokens and transfers a proportional collateral payout to the caller.

| Parameter     | Type      | Description                            |
|---------------|-----------|----------------------------------------|
| `epoch_id`    | u64       | Target epoch                           |
| `vault_index` | u64       | Vault index to redeem from             |
| `token_type`  | TokenType | `{ long: {} }` or `{ short: {} }`     |
| `amount`      | u64       | Number of tokens to burn               |

**Access**: Any token holder. Allowed even while protocol is paused.

---

### `liquidate`

Seizes a vault's remaining collateral when a position side is underwater. Pays the caller a
configurable reward; remainder goes to the fee treasury.

| Parameter      | Type   | Description                            |
|----------------|--------|----------------------------------------|
| `epoch_id`     | u64    | Target epoch                           |
| `vault_index`  | u64    | Vault index to liquidate               |
| `vault_minter` | Pubkey | Owner of the vault PDA                 |

**Access**: Permissionless (any liquidator bot). Fails if vault is not eligible.

---

### `set_protocol_pause`

Enables or disables the emergency pause. While paused, minting and epoch creation are blocked;
redemptions remain open.

| Parameter | Type | Description      |
|-----------|------|------------------|
| `paused`  | bool | `true` to pause  |

**Access**: Admin only.

---

### `update_fees`

Updates mint, redeem, and recursive fee rates. Hard cap of 500 bps (5%) enforced on-chain.

| Parameter            | Type | Description           |
|----------------------|------|-----------------------|
| `mint_fee_bps`       | u16  | New mint fee          |
| `redeem_fee_bps`     | u16  | New redeem fee        |
| `recursive_fee_bps`  | u16  | New recursive fee     |

**Access**: Admin only.

---

### `transfer_admin`

Transfers protocol admin authority to a new pubkey. The new admin account is passed as an
`UncheckedAccount` (only its key is used). Transferring to the System Program is rejected to
prevent lockout.

**Access**: Current admin only.

---

### `set_mock_oracle_price` *(mock-oracle feature only)*

Writes a raw price and timestamp to a 16-byte program-owned oracle account. This instruction is
**compiled out in production** (requires `mock-oracle` feature, which is excluded from
`--no-default-features` builds).

| Parameter   | Type | Description                        |
|-------------|------|------------------------------------|
| `price_usd` | u64  | Price in USD (6 decimal precision) |
| `timestamp` | i64  | Unix timestamp for the price feed  |

**Access**: Any signer (local test only — this instruction does not exist in production).

---

## 4. PDA Seeds

| Account          | Seeds                                                        |
|------------------|--------------------------------------------------------------|
| `ProtocolConfig` | `["protocol_config"]`                                        |
| `fee_treasury`   | `["fee_treasury"]`                                           |
| `Epoch`          | `["epoch", asset_key, epoch_id.to_le_bytes()]`              |
| `long_mint`      | `["long_mint", asset_key, epoch_id.to_le_bytes()]`          |
| `short_mint`     | `["short_mint", asset_key, epoch_id.to_le_bytes()]`         |
| `PositionVault`  | `["vault", epoch_pda, minter, vault_index.to_le_bytes()]`   |
| `MinterState`    | `["minter_state", minter]`                                   |

All PDAs are derived with `findProgramAddressSync` / `anchor.utils.publicKey.findProgramAddressSync`.

---

## 5. Account Layouts

### `ProtocolConfig` (space: 109 bytes + 8 discriminator)

| Field                    | Type   | Bytes |
|--------------------------|--------|-------|
| `admin`                  | Pubkey | 32    |
| `paused`                 | bool   | 1     |
| `mint_fee_bps`           | u16    | 2     |
| `redeem_fee_bps`         | u16    | 2     |
| `recursive_fee_bps`      | u16    | 2     |
| `liquidation_reward_bps` | u16    | 2     |
| `max_recursive_depth`    | u8     | 1     |
| `oracle_conf_denominator`| u64    | 8     |
| `max_oracle_age_secs`    | u64    | 8     |
| `circuit_breaker_bps`    | u16    | 2     |
| `fee_treasury`           | Pubkey | 32    |
| `total_fees_collected`   | u64    | 8     |
| `bump`                   | u8     | 1     |

### `Epoch` (space: 131 bytes + 8)

| Field               | Type   | Bytes |
|---------------------|--------|-------|
| `epoch_id`          | u64    | 8     |
| `asset_key`         | Pubkey | 32    |
| `start_time`        | i64    | 8     |
| `end_time`          | i64    | 8     |
| `price_band_lower`  | u64    | 8     |
| `price_band_upper`  | u64    | 8     |
| `reference_price`   | u64    | 8     |
| `long_token_mint`   | Pubkey | 32    |
| `short_token_mint`  | Pubkey | 32    |
| `total_collateral`  | u64    | 8     |
| `long_token_supply` | u64    | 8     |
| `short_token_supply`| u64    | 8     |
| `is_active`         | bool   | 1     |
| `bump`              | u8     | 1     |

### `PositionVault` (space: 170 bytes + 8)

| Field                  | Type          | Bytes |
|------------------------|---------------|-------|
| `minter`               | Pubkey        | 32    |
| `epoch`                | Pubkey        | 32    |
| `collateral_mint`      | Pubkey        | 32    |
| `collateral_amount`    | u64           | 8     |
| `entry_price`          | u64           | 8     |
| `long_tokens_minted`   | u64           | 8     |
| `short_tokens_minted`  | u64           | 8     |
| `depth`                | u8            | 1     |
| `parent_vault`         | Option<Pubkey>| 33    |
| `is_liquidated`        | bool          | 1     |
| `created_at`           | i64           | 8     |
| `last_price`           | u64           | 8     |
| `last_price_ts`        | i64           | 8     |
| `index`                | u64           | 8     |
| `bump`                 | u8            | 1     |

### Mock Oracle (raw, 16 bytes — no discriminator)

| Offset | Length | Field      | Type |
|--------|--------|------------|------|
| 0      | 8      | price_usd  | u64 LE |
| 8      | 8      | timestamp  | i64 LE |

---

## 6. Fee Structure

All fees are expressed in **basis points (bps)** where 10,000 bps = 100%.

| Fee                      | Default | Hard Cap | Destination  |
|--------------------------|---------|----------|--------------|
| `mint_fee_bps`           | 10      | 500      | Treasury ATA |
| `redeem_fee_bps`         | 5       | 500      | Treasury ATA |
| `recursive_fee_bps`      | 15      | 500      | Treasury ATA |
| `liquidation_reward_bps` | 50      | 1000     | Liquidator   |

Remainder after liquidation reward goes to the treasury.

---

## 7. Oracle Architecture

### Mock Oracle (localnet / tests)

A 16-byte program-owned account written by `set_mock_oracle_price`. Gated behind the
`mock-oracle` Cargo feature (default on localnet, excluded in production builds).

```
SystemProgram.createAccount {
  owner:      program.programId,
  space:      16,
  lamports:   minRentExempt(16),
}
```

Validation in `get_mock_price` (`oracle.rs`):
1. Account data length ≥ 16
2. Price > 0
3. `clock.unix_timestamp − oracle_timestamp ≤ max_oracle_age_secs` (staleness)
4. *(Optional)* `check_confidence` — skipped if `oracle_conf_denominator == 0`
5. *(Optional)* `check_circuit_breaker` — compares against vault's last recorded price

### Production Oracle (Pyth)

Replace `get_mock_price` calls with the Pyth Solana Receiver SDK
(`pythnet-sdk` / `pyth-solana-receiver-sdk`). Set `oracle_conf_denominator` to a non-zero value
(e.g. 100 → require confidence < 1% of price). Enable the `devnet` feature for devnet feeds.

---

## 8. Security Properties

### Access Control

| Operation             | Guard                                                        |
|-----------------------|--------------------------------------------------------------|
| `initialize_protocol` | `init` on PDA — can only be called once per deployment       |
| Admin instructions    | `constraint = config.admin == admin.key()` (Anchor macro)   |
| Mint authority        | LONG / SHORT mints have `mint::authority = epoch` (PDA only) |
| Vault authority       | `vault_collateral` ATA has `associated_token::authority = vault` |
| `set_mock_oracle_price` | `#[account(owner = crate::ID)]` — only program-owned accounts |

### Integer Safety

All arithmetic uses Rust's checked / saturating variants:
- `checked_mul`, `checked_div`, `checked_add`, `checked_sub` — return `MathOverflow` on failure
- `saturating_mul`, `saturating_div`, `saturating_sub` — used where clamping is the correct
  semantic (e.g. liquidation thresholds)

### Reentrancy

Anchor programs process instructions atomically. CPIs (token transfers / burns) complete within
the same transaction; no callbacks or re-entry paths exist.

### Emergency Controls

- `set_protocol_pause(true)` blocks all minting and epoch creation immediately.
- Redemptions remain open during pause so users can always exit their positions.

### Stack Safety

Solana's BPF VM limits the stack frame to 4096 bytes. All `Account<T>` fields in the three
largest instruction structs (`MintPositionPair`, `RedeemPosition`, `Liquidate`) are wrapped in
`Box<Account<T>>` to move them to the heap.

---

## 9. Known Limitations & Audit Findings

### L-1 · Zero-Sum Vault Economics (Design Choice)

Within a single `PositionVault`, `V_LONG + V_SHORT = 2 × collateral_amount` but the vault
holds only `collateral_amount`. At entry price, both sides are each theoretically worth the full
collateral. In practice:

- The **first** side to fully redeem drains the vault.
- The **second** side receives zero payout.

This is intentional for the zero-sum perpetuals model; the two sides are expected to trade on
secondary markets at their marginal market price, not to be fully redeemed simultaneously by the
same user.

**Mitigation**: Users should be aware that minting a pair and immediately redeeming both sides is
economically neutral only when `net = mint_fee + redeem_fee × 2`. Frontends should warn users
of this property.

### L-2 · ~~`check_confidence` Not Wired into Core Instructions~~ *(Resolved)*

`check_confidence` is called inside `get_pyth_price` (oracle.rs) for all devnet/mainnet oracle
reads. Confidence validation is active when `oracle_conf_denominator > 0`.

### L-3 · ~~Fee Validation Uses Wrong Error Code~~ *(Resolved)*

`initialize_protocol` and `update_fees` now use `TppError::InvalidFeeParam` when a fee
parameter exceeds the cap.

### L-4 · `transfer_admin` Has No Two-Step Confirmation

Admin key is transferred in a single instruction. If the caller passes the wrong `new_admin`,
control is immediately lost.

**Recommendation**: Implement a two-step transfer (nominate + accept) before mainnet deployment,
or use a multisig as the admin key.

### L-5 · Mock Oracle Has No Access Control in Tests

`set_mock_oracle_price` accepts any signer as `authority`. This is intentional for local testing
but underscores the importance of ensuring the `mock-oracle` feature is **excluded from
production builds** (see §10).

---

## 10. Building

### Prerequisites

```bash
# Install Rust (stable)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI (4.x / Agave)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Install Anchor via avm
cargo install --git https://github.com/coral-xyz/avm avm --locked
avm install 0.31.1
avm use 0.31.1
```

### Localnet build (includes mock oracle)

```bash
cd contracts/tpp_protocol
anchor build
```

This produces:
- `target/deploy/tpp_protocol.so`
- `target/idl/tpp_protocol.json`

### Production build (mock oracle excluded)

```bash
anchor build --no-default-features --features idl-build
```

Verify `mock-oracle` is absent from the features list:

```bash
solana-keygen pubkey target/deploy/tpp_protocol-keypair.json
```

---

## 11. Running Tests

Tests run against a local validator started by `anchor test`. All 15 tests should pass.

```bash
cd contracts/tpp_protocol
anchor test
```

Expected output:

```
  TPP Protocol
    ✔ 1. initialises the protocol
    ✔ 2. creates epoch 0
    ✔ 3. mints a position pair (vault 0, admin)
    ✔ 3b. rejects minting with zero collateral
    ✔ 4. redeems half the LONG tokens
    ✔ 5. redeems half the SHORT tokens
    ✔ 6. liquidates a vault when SHORT is underwater (price < 5 % of entry)
    ✔ 7. rejects liquidation when vault is not eligible
    ✔ 8. admin can pause and unpause the protocol
    ✔ 9. pause blocks minting but NOT redemption
    ✔ 10a. admin can update fees
    ✔ 10b. rejects fee update exceeding 5 % cap (501 bps)
    ✔ 10c. rejects fee update by non-admin
    ✔ 11. admin can transfer admin role then transfer back
    ✔ 12. rejects stale oracle price (age > max_oracle_age_secs = 60 s)

  15 passing (~17s)
```

### Test coverage

| Scenario                         | Test(s)  |
|----------------------------------|----------|
| Protocol initialisation          | 1        |
| Epoch creation                   | 2        |
| Minting (happy path)             | 3        |
| Minting (zero collateral reject) | 3b       |
| LONG redemption                  | 4        |
| SHORT redemption                 | 5        |
| Liquidation (eligible vault)     | 6        |
| Liquidation (not eligible)       | 7        |
| Pause / unpause                  | 8        |
| Pause blocks mint, not redeem    | 9        |
| Fee update (valid)               | 10a      |
| Fee cap enforcement              | 10b      |
| Fee update (non-admin rejection) | 10c      |
| Admin transfer                   | 11       |
| Stale oracle rejection           | 12       |

---

## 12. Deployment Checklist

- [x] Replace `mock-oracle` oracle with Pyth pull-oracle (inline `PriceUpdateV2` deserialization, no SDK dep)
- [x] Build with `--no-default-features --features devnet` — `set_mock_oracle_price` is absent from IDL
- [x] `check_confidence` wired into `get_pyth_price` (oracle.rs)
- [x] `TppError::InvalidFeeParam` added; fee validation uses correct error codes
- [x] Oracle owner validated against Pyth Receiver program ID inside `get_oracle_price`
- [ ] Set `oracle_conf_denominator` to a non-zero value (e.g. 100) in `initialize_protocol`
- [ ] Use a multisig (e.g. Squads Protocol) as the `admin` pubkey before mainnet (see L-4)
- [ ] Consider implementing two-step `transfer_admin` before mainnet (see L-4)
- [ ] Verify program ID matches the deployed keypair (`declare_id!` in `lib.rs`)
- [ ] Run `anchor verify` against the deployed program binary for supply-chain integrity

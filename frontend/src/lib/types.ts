// ─── Option Protocol Types ────────────────────────────────────────────────────
// These types mirror the JSON responses from the backend API (/vaults, /positions, etc.)

export type VaultSide = 'LONG' | 'SHORT';

export type TokenType = 'CALL' | 'FLOOR' | 'CAP' | 'PUT' | 'ROOT';

export function getTokenType(isLongSide: boolean, vaultSide: VaultSide): TokenType {
  if (vaultSide === 'LONG') return isLongSide ? 'CALL' : 'FLOOR';
  return isLongSide ? 'CAP' : 'PUT';
}

/**
 * Option vault as returned by GET /vaults and GET /vaults/:pubkey.
 * Field names match the backend DB column names.
 */
export interface OptionVault {
  pubkey: string;
  vault_id: number;
  owner_wallet: string;
  vault_side: VaultSide;
  collateral_mint: string;
  collateral_amount: number;
  /** The CALL/CAP (long) token mint. Also accessible as long_mint. */
  root_mint: string;
  /** Alias for root_mint — the CALL/CAP token mint. */
  long_mint: string;
  /** The FLOOR/PUT (short) token mint. May be empty for older indexed vaults. */
  short_mint: string;
  asset_feed: string;
  /** Strike price in micro-USD (6 dec). e.g. $180 = 180_000_000. */
  strike: number;
  /** Expiry as ISO timestamp string. */
  expiry: string;
  is_settled: boolean;
  settlement_price: number | null;
  created_at: string;
  /** Kept for forward-compat; same value as strike. */
  strike_price?: number;
  /** Kept for forward-compat; unix timestamp equivalent of expiry. */
  expiry_ts?: number;
  reference_price?: number;
  is_active?: boolean;
}

/**
 * Option node (split position) as returned by GET /positions/:wallet
 * and GET /vaults/:pubkey/tree.
 */
export interface OptionNode {
  pubkey: string;
  node_id: number;
  vault_pubkey: string;
  vault_side: VaultSide;
  /** CALL/CAP child mint (left side). */
  long_child_mint: string;
  /** FLOOR/PUT child mint (right side). */
  short_child_mint: string;
  long_backing: number;
  short_backing: number;
  parent_strike: number;
  child_strike: number;
  creation_price: number;
  depth: number;
  parent_node: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export const formatStrike = (microUsdc: number): string =>
  `$${(microUsdc / 1_000_000).toFixed(2)}`;

export const formatLamports = (lamports: number): string =>
  `${(lamports / 1e9).toFixed(4)} SOL`;

export const formatMicroUsdc = (amount: number): string =>
  `$${(amount / 1_000_000).toFixed(2)}`;

// ─── Settlement helpers ───────────────────────────────────────────────────────

/**
 * Compute the settlement payout for `amount` tokens on a given side.
 * Uses locked pool values — same formula as the on-chain settle_vault.
 */
export function calcSettlementPayout(
  vault: OptionVault,
  side: 0 | 1,
  _amount: number
): number {
  if (!vault.settlement_price) return 0;
  const P = vault.settlement_price;
  const K = vault.strike;
  const C = vault.collateral_amount;
  if (side === 0) {
    // CALL/CAP long side
    const callTotal = vault.vault_side === 'LONG'
      ? Math.max(P - K, 0) / P * C
      : Math.min(P, K) / K * C;
    return callTotal; // simplified (full supply)
  }
  const floorTotal = vault.vault_side === 'LONG'
    ? Math.min(P, K) / P * C
    : Math.max(K - P, 0) / K * C;
  return floorTotal;
}

/**
 * Intrinsic value of a token (indicative, pre-expiry).
 */
export function calcIntrinsicValue(
  nodeType: TokenType,
  strikeUsd: number,   // micro-USDC
  backing: number,     // micro-USDC
  oraclePrice: number, // micro-USDC
  _vaultSide?: VaultSide,
): number {
  if (oraclePrice <= 0 || backing <= 0) return 0;
  switch (nodeType) {
    case 'CALL':  return Math.max(oraclePrice - strikeUsd, 0) * backing / oraclePrice;
    case 'FLOOR': return Math.min(oraclePrice, strikeUsd) * backing / oraclePrice;
    case 'PUT':   return strikeUsd > 0 ? Math.max(strikeUsd - oraclePrice, 0) * backing / strikeUsd : 0;
    case 'CAP':   return strikeUsd > 0 ? Math.min(oraclePrice, strikeUsd) * backing / strikeUsd : 0;
    case 'ROOT':  return backing;
  }
}

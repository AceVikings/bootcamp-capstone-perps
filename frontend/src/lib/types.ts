// ─── Option Protocol Types ────────────────────────────────────────────────────

export type VaultSide = 'LONG' | 'SHORT';

/**
 * Semantic token type derived from vault_side + which mint (long vs short).
 *
 * LONG vault (vault_side=0):
 *   long_mint  → CALL  (profits if price > strike)
 *   short_mint → FLOOR (profits up to strike)
 *
 * SHORT vault (vault_side=1):
 *   long_mint  → CAP (profits if price < strike, bounded)
 *   short_mint → PUT (profits if price < strike)
 */
export type TokenType = 'CALL' | 'FLOOR' | 'CAP' | 'PUT' | 'ROOT';

export function getTokenType(isLongSide: boolean, vaultSide: VaultSide): TokenType {
  if (vaultSide === 'LONG') return isLongSide ? 'CALL' : 'FLOOR';
  return isLongSide ? 'CAP' : 'PUT';
}

export interface OptionVault {
  pubkey: string;
  vault_id: number;
  owner_wallet: string;
  vault_side: VaultSide;
  collateral_mint: string;
  collateral_amount: number;
  root_mint: string;        // = long_mint (CALL or CAP)
  long_mint: string;
  short_mint: string;
  asset_feed: string;
  strike_price: number;           // micro-USDC (6 dec)
  expiry_ts: number;              // unix timestamp
  is_active: boolean;
  /** > 0 once settle_vault has been called once */
  settlement_price: number;
  settled_call_total: number;
  settled_floor_total: number;
  settled_long_supply: number;
  settled_short_supply: number;
  creation_price: number;
  created_at: string;
}

export interface OptionNode {
  pubkey: string;
  node_id: number;
  vault_pubkey: string;
  vault_side: VaultSide;
  left_child_mint: string;   // CALL or CAP child
  right_child_mint: string;  // FLOOR or PUT child
  left_backing: number;
  right_backing: number;
  parent_strike: number;     // strike of the source token burned
  child_strike: number;      // strike encoded in the new child tokens
  creation_price: number;
  depth: number;
  parent_node: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── Formatters ────────────────────────────────────────────────────────────────

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
  amount: number
): number {
  if (vault.settlement_price === 0) return 0;
  const [poolTotal, poolSupply] =
    side === 0
      ? [vault.settled_call_total, vault.settled_long_supply]
      : [vault.settled_floor_total, vault.settled_short_supply];
  if (poolSupply === 0) return 0;
  return Math.floor((amount * poolTotal) / poolSupply);
}

/**
 * Intrinsic value of a token (approximate, pre-expiry).
 * Useful for displaying indicative values before settlement is locked.
 */
export function calcIntrinsicValue(
  tokenType: TokenType,
  strikeUsd: number,   // micro-USDC
  backing: number,     // collateral behind this token (micro-USDC)
  oraclePrice: number, // micro-USDC
): number {
  if (oraclePrice <= 0 || backing <= 0) return 0;
  switch (tokenType) {
    case 'CALL':
      return Math.max(oraclePrice - strikeUsd, 0) * backing / oraclePrice;
    case 'FLOOR':
      return Math.min(oraclePrice, strikeUsd) * backing / oraclePrice;
    case 'PUT':
      return strikeUsd > 0
        ? Math.max(strikeUsd - oraclePrice, 0) * backing / strikeUsd
        : 0;
    case 'CAP':
      return strikeUsd > 0
        ? Math.min(oraclePrice, strikeUsd) * backing / strikeUsd
        : 0;
    case 'ROOT':
      return backing;
  }
}

// ─── Option Protocol Types ────────────────────────────────────────────────────

export type VaultSide = 'LONG' | 'SHORT';

export interface OptionVault {
  pubkey: string;
  vault_id: number;
  owner_wallet: string;
  vault_side: VaultSide;
  collateral_mint: string;
  collateral_amount: number;
  root_mint: string;
  asset_feed: string;
  strike: number;             // micro-USDC
  expiry: string;             // ISO timestamp
  is_settled: boolean;
  settlement_price: number | null;
  created_at: string;
}

export interface OptionNode {
  pubkey: string;
  node_id: number;
  vault_pubkey: string;
  vault_side: VaultSide;
  long_child_mint: string;
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

// ─── Formatters ────────────────────────────────────────────────────────────────

export const formatStrike = (microUsdc: number): string =>
  `$${(microUsdc / 1_000_000).toFixed(2)}`;

export const formatLamports = (lamports: number): string =>
  `${(lamports / 1e9).toFixed(4)} SOL`;

export const formatMicroUsdc = (amount: number): string =>
  `$${(amount / 1_000_000).toFixed(2)}`;

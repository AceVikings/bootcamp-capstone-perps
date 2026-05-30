// ─── Option API functions (v2 types) ─────────────────────────────────────────

import type { OptionVault, OptionNode } from './types';

const OPTION_BASE = import.meta.env.VITE_API_URL ?? 'https://raven.vikings.studio/api';

async function optGet<T>(path: string): Promise<T> {
  const res = await fetch(`${OPTION_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchVaults(owner?: string): Promise<OptionVault[]> {
  const url = owner ? `/vaults?owner=${encodeURIComponent(owner)}` : '/vaults';
  const data = await optGet<{ vaults: OptionVault[] } | OptionVault[]>(url);
  return Array.isArray(data) ? data : (data as { vaults: OptionVault[] }).vaults ?? [];
}

export async function fetchVault(pubkey: string): Promise<OptionVault> {
  return optGet<OptionVault>(`/vaults/${pubkey}`);
}

export async function fetchVaultNodes(vaultPubkey: string): Promise<OptionNode[]> {
  const data = await optGet<{ nodes: OptionNode[] } | OptionNode[]>(`/vaults/${vaultPubkey}/nodes`);
  return Array.isArray(data) ? data : (data as { nodes: OptionNode[] }).nodes ?? [];
}

export async function fetchPositions(wallet: string): Promise<OptionNode[]> {
  const data = await optGet<{ nodes: OptionNode[] } | OptionNode[]>(`/positions/${wallet}`);
  return Array.isArray(data) ? data : (data as { nodes: OptionNode[] }).nodes ?? [];
}

/** Resolve any protocol token mint (root, long_child, short_child) to its vault
 *  and, when applicable, the split node that produced it. Returns `null` if the
 *  mint is not recognised by the backend. */
export async function fetchVaultByMint(mint: string): Promise<{
  vault: OptionVault;
  node: OptionNode | null;
  mint_role: 'root' | 'long_child' | 'short_child';
} | null> {
  try {
    return await optGet(`/vaults/by-mint/${encodeURIComponent(mint)}`);
  } catch {
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RootVault {
  pubkey: string;
  vault_id: number;
  owner_wallet: string;
  collateral_mint: string;
  collateral_amount: number;
  long_mint: string;
  short_mint: string;
  asset_feed: string;
  reference_price: number;
  is_active: boolean;
  created_at: string;
}

export interface ClaimNode {
  pubkey: string;
  node_id: number;
  root_vault: string;
  root_id: number;
  owner_wallet: string;
  depth: number;
  parent_node: string | null;
  claim_type: 'LONG' | 'SHORT';
  source_mint: string;
  left_child_mint: string;
  right_child_mint: string;
  creation_price: number;
  created_at: string;
  is_active: boolean;
}

export interface TreeNode {
  claim_type: string;
  mint: string;
  node_pubkey: string;
  is_active: boolean;
  creation_price: number;
  children: TreeNode[];
}

export interface VaultTreeEntry {
  pubkey: string;
  vault_id: number;
  reference_price: number;
  asset_feed: string;
  depth1: TreeNode[];
}

export interface ClaimTreeResponse {
  wallet: string;
  vaults: VaultTreeEntry[];
}

export interface OrderBookLevel {
  price_usdc: number;
  quantity: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface Order {
  id: string;
  trader_wallet: string;
  token_mint: string;
  side: 'BUY' | 'SELL';
  price_usdc: number;
  quantity: number;
  filled_qty: number;
  status: 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';
  nonce: number;
  expiry: string;
  signature: string;
  created_at: string;
}

export interface CreateOrderRequest {
  trader: string;
  token_mint: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price_usdc: number;
  nonce: number;
  expiry: number; // Unix seconds
  signature: string;
}

export interface Trade {
  id: string;
  token_mint: string;
  buyer_wallet: string;
  seller_wallet: string;
  price_usdc: number;
  quantity: number;
  tx_signature: string | null;
  settled_at: string;
}

export interface ProtocolStats {
  tvl_usdc: number;
  total_trades_24h: number;
  total_volume_24h: number;
  active_vaults: number;
  total_claim_nodes: number;
  active_claim_nodes: number;
  unique_wallets: number;
}

export interface FaucetResponse {
  signature: string;
  amount_usdc: number;
}

export interface RegisterVaultRequest {
  pubkey: string;
  vault_id: number;
  owner_wallet: string;
  collateral_mint: string;
  collateral_amount: number;
  long_mint: string;
  short_mint: string;
  asset_feed: string;
  reference_price: number;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
}

// ─── API client ───────────────────────────────────────────────────────────────

export const api = {
  health: () => get<{ status: string; timestamp: string }>('/health'),
  vaults: {
    list: (owner?: string) =>
      get<{ vaults: RootVault[] }>(owner ? `/vaults?owner=${encodeURIComponent(owner)}` : '/vaults')
        .then(r => r.vaults),
    get: (pubkey: string) => get<RootVault>(`/vaults/${pubkey}`),
    register: (body: RegisterVaultRequest) => post<RootVault>('/vaults', body),
  },
  claims: {
    list: (wallet: string) =>
      get<{ wallet: string; claims: ClaimNode[] }>(`/claims/${wallet}`)
        .then(r => r.claims),
    tree: (wallet: string) => get<ClaimTreeResponse>(`/claims/${wallet}/tree`),
    node: (pubkey: string) => get<ClaimNode>(`/claims/node/${pubkey}`),
  },
  orders: {
    book: (mint: string) => get<OrderBook>(`/orders/${mint}/book`),
    create: (body: CreateOrderRequest) =>
      post<{ order: Order }>('/orders', body).then(r => r.order),
    cancel: (id: string, trader: string, signature: string) =>
      del(`/orders/${id}?trader=${encodeURIComponent(trader)}&signature=${encodeURIComponent(signature)}`),
    myOpen: (mint: string, trader: string) =>
      get<{ orders: Order[] }>(`/orders/${mint}/open?trader=${encodeURIComponent(trader)}`).then(r => r.orders),
  },
  trades: {
    recent: (mint: string, limit = 50) =>
      get<{ trades: Trade[] }>(`/trades/${mint}?limit=${limit}`).then(r => r.trades),
  },
  analytics: () => get<ProtocolStats>('/analytics'),
  faucet: (wallet: string) =>
    post<FaucetResponse>('/faucet', { wallet }),
};

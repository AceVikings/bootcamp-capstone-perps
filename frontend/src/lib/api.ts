// ─── Types ────────────────────────────────────────────────────────────────────

export interface Epoch {
  pda: string;
  asset_key: string;
  epoch_id: number;
  ref_price: number;
  long_mint: string;
  short_mint: string;
  tvl: number;
  start_ts: number;
  end_ts: number;
  settled: boolean;
}

export interface Position {
  wallet: string;
  mint: string;
  token_type: 'long' | 'short' | 'long_long' | 'long_short' | 'short_long' | 'short_short';
  balance: number;
  est_value_usdc: number;
  entry_price: number;
  unrealized_pnl: number;
  epoch_pda: string;
  depth: 1 | 2;
}

export interface ClaimNode {
  pubkey: string;
  wallet: string;
  parent: string | null;
  token_type: string;
  mint: string;
  depth: number;
  split_price: number | null;
  balance: number;
  est_value_usdc: number;
  status: 'active' | 'merged';
  created_at: number;
}

export interface ClaimTree {
  wallet: string;
  nodes: ClaimNode[];
  edges: { from: string; to: string }[];
}

export interface OrderBook {
  mint: string;
  bids: { price: number; size: number; total: number }[];
  asks: { price: number; size: number; total: number }[];
  last_price: number;
}

export interface Order {
  id: string;
  wallet: string;
  mint: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  filled: number;
  status: 'open' | 'filled' | 'cancelled';
  created_at: number;
}

export interface CreateOrderRequest {
  wallet: string;
  mint: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  signature: string;
}

export interface Trade {
  id: string;
  mint: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  buyer: string;
  seller: string;
  ts: number;
}

export interface Analytics {
  total_tvl: number;
  volume_24h: number;
  active_epochs: number;
  unique_wallets: number;
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
  epochs: {
    list: () => get<Epoch[]>('/epochs'),
    get: (pda: string) => get<Epoch>(`/epochs/${pda}`),
  },
  positions: {
    get: (wallet: string) => get<Position[]>(`/positions/${wallet}`),
  },
  claims: {
    list: (wallet: string) => get<ClaimNode[]>(`/claims/${wallet}`),
    tree: (wallet: string) => get<ClaimTree>(`/claims/${wallet}/tree`),
    node: (pubkey: string) => get<ClaimNode>(`/claims/node/${pubkey}`),
  },
  orders: {
    book: (mint: string) => get<OrderBook>(`/orders/${mint}/book`),
    create: (body: CreateOrderRequest) => post<Order>('/orders', body),
    cancel: (id: string) => del(`/orders/${id}`),
  },
  trades: {
    recent: (mint: string) => get<Trade[]>(`/trades/${mint}`),
  },
  analytics: () => get<Analytics>('/analytics'),
};

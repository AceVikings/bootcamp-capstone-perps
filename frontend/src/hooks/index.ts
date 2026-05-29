import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { RootVault, ClaimNode, ClaimTreeResponse, OrderBook, Trade, ProtocolStats } from '../lib/api';

function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, refetch: run };
}

export function useVaults(owner?: string | null) {
  return useQuery(
    () => api.vaults.list(owner ?? undefined),
    [owner]
  );
}

export function useVault(pubkey: string | null) {
  return useQuery(
    () => (pubkey ? api.vaults.get(pubkey) : Promise.resolve(null as unknown as RootVault)),
    [pubkey]
  );
}

export function useClaims(wallet: string | null) {
  return useQuery(
    () => (wallet ? api.claims.list(wallet) : Promise.resolve([] as ClaimNode[])),
    [wallet]
  );
}

export function useClaimTree(wallet: string | null) {
  return useQuery(
    () => (wallet ? api.claims.tree(wallet) : Promise.resolve(null as unknown as ClaimTreeResponse)),
    [wallet]
  );
}

export function useOrderBook(mint: string | null) {
  return useQuery(
    () => (mint ? api.orders.book(mint) : Promise.resolve(null as unknown as OrderBook)),
    [mint]
  );
}

export function useTrades(mint: string | null) {
  return useQuery(
    () => (mint ? api.trades.recent(mint) : Promise.resolve([] as Trade[])),
    [mint]
  );
}

export function useAnalytics() {
  return useQuery<ProtocolStats>(() => api.analytics());
}


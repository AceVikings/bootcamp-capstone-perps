import { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { api, fetchVaults, fetchVault, fetchVaultNodes, fetchPositions } from '../lib/api';
import type { RootVault, ClaimNode, ClaimTreeResponse, OrderBook, Trade, Order, ProtocolStats } from '../lib/api';
import type { OptionVault, OptionNode } from '../lib/types';

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

export function useMyOrders(mint: string | null, trader: string | null) {
  return useQuery(
    () =>
      mint && trader
        ? api.orders.myOpen(mint, trader)
        : Promise.resolve([] as Order[]),
    [mint, trader]
  );
}

/** Fetch SPL token balance for a given wallet + mint via RPC. Returns amount in whole tokens (already divided by 10^decimals). */
export function useTokenBalance(mint: string | null, wallet: string | null) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mint || !wallet) { setBalance(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const rpcUrl = import.meta.env.VITE_RPC_URL ?? 'https://api.devnet.solana.com';
        const conn = new Connection(rpcUrl, 'confirmed');
        const owner = new PublicKey(wallet);
        const mintPk = new PublicKey(mint);
        const accounts = await conn.getParsedTokenAccountsByOwner(owner, { mint: mintPk });
        if (cancelled) return;
        if (accounts.value.length === 0) { setBalance(0); return; }
        const amt = accounts.value[0].account.data.parsed.info.tokenAmount;
        setBalance(Number(amt.uiAmount ?? 0));
      } catch {
        if (!cancelled) setBalance(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mint, wallet]);

  return { balance, loading };
}

// ─── Option vault hooks (v2) ──────────────────────────────────────────────────

export function useOptionVaults(owner?: string | null) {
  return useQuery<OptionVault[]>(
    () => fetchVaults(owner ?? undefined),
    [owner]
  );
}

export function useOptionVault(pubkey: string | null) {
  return useQuery<OptionVault>(
    () => (pubkey ? fetchVault(pubkey) : Promise.resolve(null as unknown as OptionVault)),
    [pubkey]
  );
}

export function useOptionNodes(vaultPubkey: string | null) {
  return useQuery<OptionNode[]>(
    () => (vaultPubkey ? fetchVaultNodes(vaultPubkey) : Promise.resolve([] as OptionNode[])),
    [vaultPubkey]
  );
}

export function useOptionPositions(wallet: string | null) {
  return useQuery<OptionNode[]>(
    () => (wallet ? fetchPositions(wallet) : Promise.resolve([] as OptionNode[])),
    [wallet]
  );
}


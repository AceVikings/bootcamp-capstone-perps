import { useEffect, useRef, useState, useCallback } from 'react';
import type { OrderBook, Trade, ClaimNode } from './api';

const WS_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/^http/, 'ws');

// ─── useMarketSocket ──────────────────────────────────────────────────────────

interface MarketSocketState {
  orderbook: OrderBook | null;
  recentTrades: Trade[];
  lastPrice: number | null;
  connected: boolean;
}

export function useMarketSocket(mint: string): MarketSocketState {
  const [state, setState] = useState<MarketSocketState>({
    orderbook: null,
    recentTrades: [],
    lastPrice: null,
    connected: false,
  });

  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!mint) return;

    const socket = new WebSocket(`${WS_BASE}/ws`);
    ws.current = socket;

    socket.onopen = () => {
      setState(s => ({ ...s, connected: true }));
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'orderbook', mint }));
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'trades', mint }));
    };

    socket.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string) as {
          type: string;
          data: OrderBook | Trade;
        };
        if (msg.type === 'orderbook') {
          const ob = msg.data as OrderBook;
          setState(s => ({ ...s, orderbook: ob, lastPrice: ob.last_price }));
        } else if (msg.type === 'trade') {
          const trade = msg.data as Trade;
          setState(s => ({
            ...s,
            lastPrice: trade.price,
            recentTrades: [trade, ...s.recentTrades].slice(0, 50),
          }));
        }
      } catch {
        // malformed message — ignore
      }
    };

    socket.onclose = () => setState(s => ({ ...s, connected: false }));
    socket.onerror = () => setState(s => ({ ...s, connected: false }));

    return () => {
      socket.close();
    };
  }, [mint]);

  return state;
}

// ─── useClaimSocket ───────────────────────────────────────────────────────────

interface ClaimEvent {
  type: 'CLAIM_SPLIT' | 'CLAIM_MERGE';
  node: ClaimNode;
  ts: number;
}

interface ClaimSocketState {
  events: ClaimEvent[];
  clearEvents: () => void;
}

export function useClaimSocket(wallet: string): ClaimSocketState {
  const [events, setEvents] = useState<ClaimEvent[]>([]);
  const ws = useRef<WebSocket | null>(null);

  const clearEvents = useCallback(() => setEvents([]), []);

  useEffect(() => {
    if (!wallet) return;

    const socket = new WebSocket(`${WS_BASE}/ws`);
    ws.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'claims', wallet }));
    };

    socket.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string) as ClaimEvent;
        if (msg.type === 'CLAIM_SPLIT' || msg.type === 'CLAIM_MERGE') {
          setEvents(prev => [msg, ...prev]);
        }
      } catch {
        // ignore
      }
    };

    socket.onclose = () => {};
    socket.onerror = () => {};

    return () => {
      socket.close();
    };
  }, [wallet]);

  return { events, clearEvents };
}

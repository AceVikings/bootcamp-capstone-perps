import { useEffect, useRef, useState, useCallback } from 'react';
import type { OrderBook, OrderBookLevel, ClaimNode } from './api';

const WS_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/^http/, 'ws');

// ─── useMarketSocket ──────────────────────────────────────────────────────────

interface MarketSocketState {
  orderbook: OrderBook | null;
  lastPrice: number | null;
  connected: boolean;
}

export function useMarketSocket(mint: string): MarketSocketState {
  const [state, setState] = useState<MarketSocketState>({
    orderbook: null,
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
    };

    socket.onmessage = (e: MessageEvent) => {
      try {
        // Backend broadcasts flat: { type: "ORDER_BOOK", token_mint, bids, asks }
        const msg = JSON.parse(e.data as string) as {
          type: string;
          token_mint?: string;
          bids?: OrderBookLevel[];
          asks?: OrderBookLevel[];
        };
        if (msg.type === 'ORDER_BOOK' && msg.token_mint === mint) {
          const ob: OrderBook = { bids: msg.bids ?? [], asks: msg.asks ?? [] };
          // Derive mid-price from best bid and best ask
          const bestBid = ob.bids[0]?.price_usdc != null ? ob.bids[0].price_usdc / 1e6 : null;
          const bestAsk = ob.asks[0]?.price_usdc != null ? ob.asks[0].price_usdc / 1e6 : null;
          const mid =
            bestBid != null && bestAsk != null
              ? (bestBid + bestAsk) / 2
              : bestBid ?? bestAsk ?? null;
          setState(s => ({ ...s, orderbook: ob, lastPrice: mid }));
        }
      } catch {
        // malformed message — ignore
      }
    };

    socket.onclose = () => setState(s => ({ ...s, connected: false }));
    socket.onerror = () => setState(s => ({ ...s, connected: false }));

    return () => {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }
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

    socket.onopen = () => {};

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
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }
    };
  }, [wallet]);

  return { events, clearEvents };
}


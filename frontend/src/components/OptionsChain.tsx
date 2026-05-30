import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://raven.vikings.studio/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OptionSide {
  vault_pubkey: string | null;
  token_mint: string | null;
  bid_usd: number | null;
  ask_usd: number | null;
  mid_usd: number;
  volume_24h_usd: number;
  open_interest_usd: number;
}

interface ChainCell {
  strike_usd: number;
  expiry_days: number;
  expiry_ts: number;
  call: OptionSide;
  put: OptionSide;
}

interface OptionsChainData {
  underlying_price_usd: number;
  chains: ChainCell[];
  available_expiry_days: number[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtUsd(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  if (v > 0) return `$${v.toFixed(0)}`;
  return '—';
}

function fmtPrice(v: number | null): string {
  if (v === null) return '—';
  return fmtUsd(v);
}

// ── Empty side placeholder ────────────────────────────────────────────────────

const emptySide = (theoretical: number): OptionSide => ({
  vault_pubkey: null,
  token_mint: null,
  bid_usd: null,
  ask_usd: null,
  mid_usd: theoretical,
  volume_24h_usd: 0,
  open_interest_usd: 0,
});

// ── Strike grid + expiry structure (matches seed script) ─────────────────────

const STRIKES = [120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240];
const EXPIRY_DAYS_OPTIONS = [2, 4, 6, 8, 10];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onNavigate?: (hash: string) => void;
}

export function OptionsChain({ onNavigate }: Props) {
  const [data, setData] = useState<OptionsChainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<number>(2);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_BASE}/options-chain?expiry_days=${selectedExpiry}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: OptionsChainData = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedExpiry]);

  const underlying = data?.underlying_price_usd ?? 180;

  // Build a lookup map: strike → ChainCell (for the selected expiry)
  const cellByStrike = new Map<number, ChainCell>();
  if (data) {
    for (const cell of data.chains) {
      cellByStrike.set(Math.round(cell.strike_usd), cell);
    }
  }

  const handleTrade = (mint: string | null) => {
    if (!mint || !onNavigate) return;
    onNavigate(`#/app/trade/${mint}`);
  };

  // Expiry date label
  function expiryLabel(days: number): string {
    const d = new Date(Date.now() + days * 86_400_000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <div className="w-full">
      {/* ── Expiry selector ── */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        <span className="font-mono text-xs text-fg-muted tracking-widest uppercase shrink-0 mr-2">
          Expiry
        </span>
        {EXPIRY_DAYS_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedExpiry(d)}
            className={[
              'px-4 py-1.5 font-mono text-xs tracking-widest uppercase border transition-colors duration-100 shrink-0',
              selectedExpiry === d
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-wire text-fg-muted hover:border-accent/50 hover:text-fg',
            ].join(' ')}
          >
            {d}d&nbsp;
            <span className="opacity-60">{expiryLabel(d)}</span>
          </button>
        ))}
      </div>

      {/* ── Status bar ── */}
      {data && (
        <div className="flex items-center gap-3 mb-4 font-mono text-xs text-fg-muted">
          <Activity size={12} className="text-accent" />
          <span>
            SOL/USD&nbsp;
            <span className="text-fg font-semibold">${underlying.toFixed(2)}</span>
          </span>
          <span className="text-wire">|</span>
          <span>
            {data.chains.length} strike{data.chains.length !== 1 ? 's' : ''} loaded
          </span>
          <span className="ml-auto opacity-50">Live · refreshes every 15s</span>
        </div>
      )}

      {/* ── Loading / error ── */}
      {loading && !data && (
        <div className="py-16 flex items-center justify-center">
          <div className="w-6 h-6 border border-accent/40 border-t-accent rounded-full animate-spin" />
        </div>
      )}
      {error && !data && (
        <div className="py-8 text-center font-mono text-xs text-bear">
          Failed to load options chain: {error}
        </div>
      )}

      {/* ── Chain table ── */}
      {(data || !loading) && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-wire">
                {/* CALL header */}
                <th
                  colSpan={4}
                  className="px-3 py-2 text-center text-bull/80 tracking-widest uppercase text-[10px]"
                >
                  CALL
                </th>
                {/* Strike header */}
                <th className="px-4 py-2 text-center text-fg-muted tracking-widest uppercase text-[10px]">
                  Strike
                </th>
                {/* PUT header */}
                <th
                  colSpan={4}
                  className="px-3 py-2 text-center text-bear/80 tracking-widest uppercase text-[10px]"
                >
                  PUT
                </th>
              </tr>
              <tr className="border-b border-wire text-[10px] text-fg-muted tracking-wider uppercase">
                <th className="px-3 py-1.5 text-right">Volume</th>
                <th className="px-3 py-1.5 text-right">Bid</th>
                <th className="px-3 py-1.5 text-right">Ask</th>
                <th className="px-3 py-1.5 text-right pr-4">Mid</th>
                {/* Strike column */}
                <th className="px-4 py-1.5 text-center font-semibold text-fg">
                  —
                </th>
                <th className="pl-4 px-3 py-1.5 text-left">Mid</th>
                <th className="px-3 py-1.5 text-left">Bid</th>
                <th className="px-3 py-1.5 text-left">Ask</th>
                <th className="px-3 py-1.5 text-left">Volume</th>
              </tr>
            </thead>
            <tbody>
              {STRIKES.map((strike) => {
                const cell = cellByStrike.get(strike);
                const call = cell?.call ?? emptySide(0);
                const put = cell?.put ?? emptySide(0);

                // ITM detection
                const callItm = strike < underlying;
                const putItm = strike > underlying;
                const atm = Math.abs(strike - underlying) < 5;

                const rowBase = [
                  'border-b border-wire/40 transition-colors duration-100',
                  'hover:bg-surface-2/50 cursor-pointer',
                  atm ? 'bg-accent/5' : '',
                ].join(' ');

                return (
                  <tr key={strike} className={rowBase}>
                    {/* ── CALL columns ── */}
                    <td
                      className={[
                        'px-3 py-2.5 text-right',
                        callItm ? 'bg-bull/5' : '',
                      ].join(' ')}
                    >
                      <span className="text-fg-muted">{fmtVol(call.volume_24h_usd)}</span>
                    </td>
                    <td
                      className={[
                        'px-3 py-2.5 text-right',
                        callItm ? 'bg-bull/5' : '',
                      ].join(' ')}
                    >
                      <span className="text-bull/80">{fmtPrice(call.bid_usd)}</span>
                    </td>
                    <td
                      className={[
                        'px-3 py-2.5 text-right',
                        callItm ? 'bg-bull/5' : '',
                      ].join(' ')}
                    >
                      <span className="text-bear/80">{fmtPrice(call.ask_usd)}</span>
                    </td>
                    <td
                      className={[
                        'px-3 py-2.5 text-right pr-4',
                        callItm ? 'bg-bull/5' : '',
                      ].join(' ')}
                      onClick={() => handleTrade(call.token_mint)}
                    >
                      <span
                        className={[
                          'font-semibold',
                          callItm ? 'text-bull' : 'text-fg',
                          call.token_mint ? 'hover:text-accent underline decoration-dotted cursor-pointer' : '',
                        ].join(' ')}
                      >
                        {fmtUsd(call.mid_usd)}
                      </span>
                      {callItm && (
                        <TrendingUp size={10} className="inline ml-1 text-bull opacity-60" />
                      )}
                    </td>

                    {/* ── Strike ── */}
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={[
                          'font-semibold tracking-wide',
                          atm ? 'text-accent' : 'text-fg',
                        ].join(' ')}
                      >
                        ${strike}
                      </span>
                      {atm && (
                        <span className="block text-[9px] text-accent/60 tracking-widest uppercase">
                          ATM
                        </span>
                      )}
                    </td>

                    {/* ── PUT columns ── */}
                    <td
                      className={[
                        'pl-4 px-3 py-2.5 text-left',
                        putItm ? 'bg-bear/5' : '',
                      ].join(' ')}
                      onClick={() => handleTrade(put.token_mint)}
                    >
                      <span
                        className={[
                          'font-semibold',
                          putItm ? 'text-bear' : 'text-fg',
                          put.token_mint ? 'hover:text-accent underline decoration-dotted cursor-pointer' : '',
                        ].join(' ')}
                      >
                        {fmtUsd(put.mid_usd)}
                      </span>
                      {putItm && (
                        <TrendingDown size={10} className="inline ml-1 text-bear opacity-60" />
                      )}
                    </td>
                    <td
                      className={[
                        'px-3 py-2.5 text-left',
                        putItm ? 'bg-bear/5' : '',
                      ].join(' ')}
                    >
                      <span className="text-bull/80">{fmtPrice(put.bid_usd)}</span>
                    </td>
                    <td
                      className={[
                        'px-3 py-2.5 text-left',
                        putItm ? 'bg-bear/5' : '',
                      ].join(' ')}
                    >
                      <span className="text-bear/80">{fmtPrice(put.ask_usd)}</span>
                    </td>
                    <td
                      className={[
                        'px-3 py-2.5 text-left',
                        putItm ? 'bg-bear/5' : '',
                      ].join(' ')}
                    >
                      <span className="text-fg-muted">{fmtVol(put.volume_24h_usd)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── Legend ── */}
          <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-mono text-fg-muted px-1">
            <span>
              <span className="inline-block w-2 h-2 bg-bull/30 mr-1" />
              ITM Call (strike &lt; spot)
            </span>
            <span>
              <span className="inline-block w-2 h-2 bg-bear/30 mr-1" />
              ITM Put (strike &gt; spot)
            </span>
            <span>
              <span className="inline-block w-2 h-2 bg-accent/20 mr-1" />
              ATM (±$5 of spot)
            </span>
            <span className="ml-auto opacity-60">
              Mid = actual mid if orderbook exists · theoretical (BS, σ=85%) otherwise
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

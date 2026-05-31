import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { ArrowRight, TrendingUp, TrendingDown, Activity, ChevronRight } from 'lucide-react';
import { useAnalytics } from '../hooks';
import { fmtUsdc } from '../lib/format';

interface Props {
  onNavigate: (hash: string) => void;
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://raven.vikings.studio';

// ── Types ──────────────────────────────────────────────────────────────────────

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

interface ChainData {
  underlying_price_usd: number;
  chains: ChainCell[];
  available_expiry_days: number[];
}

type CollateralType = 'SOL' | 'USDC';
type OptionType = 'CALL' | 'PUT';

interface SelectedOption {
  strike: number;
  type: OptionType;
  cell: ChainCell;
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtUsd(v: number | null): string {
  if (v === null) return '—';
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

// ── Buy/Mint panel ──────────────────────────────────────────────────────────────

function BuyPanel({
  selected,
  spotPrice,
  onNavigate,
}: {
  selected: SelectedOption | null;
  spotPrice: number;
  onNavigate: (h: string) => void;
}) {
  const { connected } = useWallet();
  const [qty, setQty] = useState('1');
  const [collateral, setCollateral] = useState<CollateralType>('USDC');

  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
        <div className="w-10 h-10 border border-wire rounded-full flex items-center justify-center mb-4">
          <ChevronRight size={16} className="text-fg-muted" />
        </div>
        <p className="font-mono text-xs text-fg-muted tracking-wide">
          Select a strike to trade
        </p>
        <p className="font-mono text-[10px] text-fg-muted/60 mt-2">
          Click any row in the chain
        </p>
      </div>
    );
  }

  const side = selected.type === 'CALL' ? selected.cell.call : selected.cell.put;
  const premium = side.ask_usd ?? side.mid_usd;
  const qtyNum = Math.max(parseFloat(qty) || 0, 0);
  const totalCost = premium * qtyNum;
  const isItm =
    selected.type === 'CALL'
      ? selected.strike < spotPrice
      : selected.strike > spotPrice;

  const mint = side.token_mint;

  return (
    <div className="p-5 flex flex-col gap-5">
      {/* Option summary */}
      <div className="border border-wire p-4 bg-surface-2">
        <div className="flex items-center justify-between mb-3">
          <span
            className={`font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 ${
              selected.type === 'CALL'
                ? 'bg-bull/20 text-bull'
                : 'bg-bear/20 text-bear'
            }`}
          >
            {selected.type}
          </span>
          {isItm && (
            <span className="font-mono text-[9px] tracking-widest uppercase text-accent px-1.5 py-0.5 bg-accent/10">
              ITM
            </span>
          )}
        </div>
        <div className="font-mono text-2xl font-semibold text-fg mb-1">
          ${selected.strike.toFixed(2)}
        </div>
        <div className="font-mono text-[10px] text-fg-muted">SOL/USDC · {selected.cell.expiry_days}d expiry</div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          {[
            { l: 'Bid', v: fmtUsd(side.bid_usd) },
            { l: 'Mid', v: fmtUsd(side.mid_usd) },
            { l: 'Ask', v: fmtUsd(side.ask_usd) },
          ].map(({ l, v }) => (
            <div key={l}>
              <div className="font-mono text-[9px] uppercase text-fg-muted mb-0.5">{l}</div>
              <div className="font-mono text-xs text-fg">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quantity */}
      <div>
        <label className="font-mono text-[10px] tracking-widest uppercase text-fg-muted block mb-2">
          Contracts
        </label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={qty}
          onChange={e => setQty(e.target.value)}
          className="w-full bg-surface-2 border border-wire text-fg font-mono text-sm px-3 py-2 focus:border-accent focus:outline-none"
          placeholder="1.00"
        />
      </div>

      {/* Collateral */}
      <div>
        <label className="font-mono text-[10px] tracking-widest uppercase text-fg-muted block mb-2">
          Pay With
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(['USDC', 'SOL'] as CollateralType[]).map(c => (
            <button
              key={c}
              onClick={() => setCollateral(c)}
              className={`font-mono text-xs py-2 border transition-colors ${
                collateral === c
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-wire text-fg-muted hover:border-accent/50 hover:text-fg'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Cost summary */}
      <div className="border border-wire/60 p-3 bg-surface-2/50">
        <div className="flex justify-between font-mono text-xs mb-1.5">
          <span className="text-fg-muted">Premium × qty</span>
          <span className="text-fg">{fmtUsd(premium)} × {qtyNum}</span>
        </div>
        <div className="flex justify-between font-mono text-xs font-semibold border-t border-wire/40 pt-1.5">
          <span className="text-fg-muted">Total</span>
          <span className="text-fg">{fmtUsd(totalCost)} {collateral}</span>
        </div>
      </div>

      {/* Action buttons */}
      {connected ? (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => mint && onNavigate(`#/app/trade/${mint}`)}
            disabled={!mint}
            className="w-full py-3 bg-accent text-void font-mono text-xs tracking-widest uppercase hover:bg-accent-bright transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Buy {selected.type}
          </button>
          <button
            onClick={() => onNavigate('#/app/deposit')}
            className="w-full py-2 border border-wire text-fg-muted font-mono text-[10px] tracking-widest uppercase hover:border-accent/50 hover:text-fg transition-colors"
          >
            Mint via Vault
          </button>
        </div>
      ) : (
        <div className="text-center font-mono text-[10px] text-fg-muted border border-wire py-3">
          Connect wallet to trade
        </div>
      )}

      {/* OI / Volume footer */}
      <div className="flex justify-between font-mono text-[9px] text-fg-muted/60 pt-1 border-t border-wire/30">
        <span>OI: {fmtVol(side.open_interest_usd)}</span>
        <span>24h Vol: {fmtVol(side.volume_24h_usd)}</span>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export function Dashboard({ onNavigate }: Props) {
  const { data: analytics } = useAnalytics();
  const [chainData, setChainData] = useState<ChainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SelectedOption | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/options-chain`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ChainData = await res.json();
        if (!cancelled) setChainData(json);
      } catch {
        // keep previous data on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const spot = chainData?.underlying_price_usd ?? 182.47;

  const cells = chainData?.chains ?? [];
  const strikeMap = new Map<number, ChainCell>();
  for (const c of cells) {
    const existing = strikeMap.get(c.strike_usd);
    if (!existing || c.call.volume_24h_usd > existing.call.volume_24h_usd) {
      strikeMap.set(c.strike_usd, c);
    }
  }
  const strikes = Array.from(strikeMap.keys()).sort((a, b) => a - b);

  function selectRow(strike: number, type: OptionType) {
    const cell = strikeMap.get(strike);
    if (!cell) return;
    setSelected(prev =>
      prev?.strike === strike && prev.type === type ? null : { strike, type, cell }
    );
  }

  return (
    <div className="min-h-screen bg-void pt-20">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-1">
              Raven Protocol &nbsp;·&nbsp; SOL / USDC
            </div>
            <div className="flex items-baseline gap-3">
              <h1 className="font-display text-3xl tracking-tighter text-fg">Options Markets</h1>
              <span className="font-mono text-xl font-semibold text-fg">${spot.toFixed(2)}</span>
              {chainData && (
                <span className="flex items-center gap-1 font-mono text-xs text-bull">
                  <Activity size={10} />
                  Live
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => onNavigate('#/app/deposit')}
            className="flex items-center gap-2 px-5 py-3 bg-accent text-void font-mono text-xs tracking-widest uppercase hover:bg-accent-bright transition-colors shrink-0"
          >
            Create Vault
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px border border-wire mb-8 bg-wire">
          {[
            { label: 'Total TVL', value: analytics ? `$${fmtUsdc(analytics.tvl_usdc / 1e6, 2)}` : '—' },
            { label: '24h Volume', value: analytics ? `$${fmtUsdc(analytics.total_volume_24h / 1e12, 2)}` : '—' },
            { label: 'Open Strikes', value: String(strikes.length) },
            { label: 'Active Vaults', value: analytics ? String(analytics.active_vaults) : '—' },
          ].map(stat => (
            <div key={stat.label} className="bg-surface p-4">
              <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-fg-muted mb-1.5">{stat.label}</div>
              <div className="font-mono text-lg text-fg">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div className="flex gap-px bg-wire border border-wire">

          {/* Options chain table */}
          <div className="flex-1 bg-surface overflow-x-auto min-w-0">

            {/* Table header */}
            <div className="sticky top-0 bg-surface z-10 border-b border-wire">
              <div className="grid grid-cols-[1fr_60px_1fr] text-[10px] font-mono tracking-widest uppercase">
                <div className="text-center py-2.5 text-bear/80 border-r border-wire">PUT</div>
                <div className="text-center py-2.5 text-fg-muted">Strike</div>
                <div className="text-center py-2.5 text-bull/80 border-l border-wire">CALL</div>
              </div>
              <div className="grid grid-cols-[repeat(4,1fr)_60px_repeat(4,1fr)] text-[9px] font-mono tracking-wider uppercase text-fg-muted border-t border-wire/40">
                <div className="py-2 px-2 text-right">Vol</div>
                <div className="py-2 px-2 text-right">OI</div>
                <div className="py-2 px-2 text-right text-bull/70">Bid</div>
                <div className="py-2 px-2 text-right text-bear/70">Ask</div>
                <div className="py-2 text-center">—</div>
                <div className="py-2 px-2 text-left text-bull/70">Bid</div>
                <div className="py-2 px-2 text-left text-bear/70">Ask</div>
                <div className="py-2 px-2 text-left">OI</div>
                <div className="py-2 px-2 text-left">Vol</div>
              </div>
            </div>

            {/* Loading spinner */}
            {loading && !chainData && (
              <div className="py-20 flex items-center justify-center">
                <div className="w-5 h-5 border border-accent/40 border-t-accent rounded-full animate-spin" />
              </div>
            )}

            {/* Strike rows */}
            {strikes.map(strike => {
              const cell = strikeMap.get(strike)!;
              const call = cell.call;
              const put = cell.put;
              const callItm = strike < spot;
              const putItm = strike > spot;
              const atm = Math.abs(strike - spot) < 2.5;
              const selCall = selected?.strike === strike && selected.type === 'CALL';
              const selPut  = selected?.strike === strike && selected.type === 'PUT';

              const callBase = `py-2.5 px-2 font-mono text-xs transition-colors cursor-pointer ${callItm ? 'bg-bull/5' : ''} ${selCall ? 'bg-accent/10' : 'hover:bg-bull/10'}`;
              const putBase  = `py-2.5 px-2 font-mono text-xs transition-colors cursor-pointer ${putItm ? 'bg-bear/5' : ''} ${selPut  ? 'bg-accent/10' : 'hover:bg-bear/10'}`;

              return (
                <div
                  key={strike}
                  className={`grid grid-cols-[repeat(4,1fr)_60px_repeat(4,1fr)] border-b border-wire/30 ${atm ? 'bg-accent/5' : ''}`}
                >
                  {/* PUT cols: Vol / OI / Bid / Ask */}
                  <div className={`${putBase} text-right`} onClick={() => selectRow(strike, 'PUT')}>
                    <span className="text-fg-muted">{fmtVol(put.volume_24h_usd)}</span>
                  </div>
                  <div className={`${putBase} text-right`} onClick={() => selectRow(strike, 'PUT')}>
                    <span className="text-fg-muted">{fmtVol(put.open_interest_usd)}</span>
                  </div>
                  <div className={`${putBase} text-right`} onClick={() => selectRow(strike, 'PUT')}>
                    <span className="text-bull/80">{fmtUsd(put.bid_usd)}</span>
                  </div>
                  <div className={`${putBase} text-right`} onClick={() => selectRow(strike, 'PUT')}>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-bear/80">{fmtUsd(put.ask_usd)}</span>
                      {putItm && <TrendingDown size={9} className="text-bear opacity-60 shrink-0" />}
                    </div>
                    <div className="text-[9px] text-fg-muted">{fmtUsd(put.mid_usd)}</div>
                  </div>

                  {/* Strike center */}
                  <div className="py-2.5 text-center font-mono text-xs font-semibold border-l border-r border-wire/40">
                    <span className={atm ? 'text-accent' : 'text-fg'}>${strike.toFixed(0)}</span>
                    {atm && <div className="text-[8px] text-accent/70 tracking-widest uppercase">ATM</div>}
                  </div>

                  {/* CALL cols: Bid / Ask / OI / Vol */}
                  <div className={`${callBase} text-left`} onClick={() => selectRow(strike, 'CALL')}>
                    <div className="flex items-center gap-1">
                      <span className="text-bull/80">{fmtUsd(call.bid_usd)}</span>
                      {callItm && <TrendingUp size={9} className="text-bull opacity-60 shrink-0" />}
                    </div>
                    <div className="text-[9px] text-fg-muted">{fmtUsd(call.mid_usd)}</div>
                  </div>
                  <div className={`${callBase} text-left`} onClick={() => selectRow(strike, 'CALL')}>
                    <span className="text-bear/80">{fmtUsd(call.ask_usd)}</span>
                  </div>
                  <div className={`${callBase} text-left`} onClick={() => selectRow(strike, 'CALL')}>
                    <span className="text-fg-muted">{fmtVol(call.open_interest_usd)}</span>
                  </div>
                  <div className={`${callBase} text-left`} onClick={() => selectRow(strike, 'CALL')}>
                    <span className="text-fg-muted">{fmtVol(call.volume_24h_usd)}</span>
                  </div>
                </div>
              );
            })}

            {!loading && strikes.length === 0 && (
              <div className="py-16 text-center font-mono text-xs text-fg-muted">
                No active strikes found
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-[9px] font-mono text-fg-muted px-3 py-3 border-t border-wire/40">
              <span><span className="inline-block w-2 h-2 bg-bull/25 mr-1" />ITM Call</span>
              <span><span className="inline-block w-2 h-2 bg-bear/25 mr-1" />ITM Put</span>
              <span><span className="inline-block w-2 h-2 bg-accent/20 mr-1" />ATM</span>
              <span className="ml-auto opacity-50">Refreshes every 15s</span>
            </div>
          </div>

          {/* Buy/Mint panel */}
          <div className="w-72 shrink-0 bg-surface border-l border-wire">
            <div className="border-b border-wire px-5 py-3 font-mono text-[10px] tracking-widest uppercase text-fg-muted">
              {selected ? `${selected.type} $${selected.strike.toFixed(0)}` : 'Order'}
            </div>
            <BuyPanel selected={selected} spotPrice={spot} onNavigate={onNavigate} />
          </div>

        </div>
      </div>
    </div>
  );
}

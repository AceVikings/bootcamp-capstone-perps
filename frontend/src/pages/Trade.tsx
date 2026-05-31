import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { WalletGate } from '../components/app/WalletGate';
import { OrderBook } from '../components/app/OrderBook';
import { OrderForm } from '../components/app/OrderForm';
import { TradeList } from '../components/app/TradeList';
import { PriceChart } from '../components/app/PriceChart';
import { ExpiryCountdown } from '../components/app/ExpiryCountdown';
import { useMarketSocket } from '../lib/ws';
import { useTrades, useOrderBook, useMyOrders, useTokenBalance } from '../hooks';
import { api, fetchVaultByMint, fetchOraclePrice } from '../lib/api';
import { deriveShortMint } from '../lib/anchor';
import { fmtUsdc, truncAddr } from '../lib/format';
import { USDC_MINT } from '../lib/constants';
import type { OptionVault } from '../lib/types';

// ─── Black-Scholes (σ = 85%, r = 0) ─────────────────────────────────────────

function normCdf(x: number): number {
  const a1=0.3193815, a2=-0.3565638, a3=1.7814779, a4=-1.8212560, a5=1.3302744;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t*(a1+t*(a2+t*(a3+t*(a4+t*a5))));
  const p = 1 - 0.39894228*Math.exp(-x*x/2)*poly;
  return x >= 0 ? p : 1 - p;
}

function bsPremium(S: number, K: number, T: number, sigma = 0.85) {
  if (T <= 0) return { call: Math.max(S-K,0), put: Math.max(K-S,0) };
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S/K) + 0.5*sigma*sigma*T) / (sigma*sqrtT);
  const d2 = d1 - sigma*sqrtT;
  return {
    call: S*normCdf(d1) - K*normCdf(d2),
    put:  K*normCdf(-d2) - S*normCdf(-d1),
  };
}

/** Returns fair mid-price in USDC for a given token type. */
function calcFairValue(
  tokenType: TokenKind,
  oracleUsd: number,
  strikeUsd: number,
  expiryTs: number,
): number {
  const T = Math.max(0, (expiryTs - Date.now()/1000) / (365*24*3600));
  const { call, put } = bsPremium(oracleUsd, strikeUsd, T);
  switch (tokenType) {
    case 'CALL':  return call;
    case 'FLOOR': return oracleUsd - call;   // CALL + FLOOR = oracle (wSOL price)
    case 'PUT':   return put;
    case 'CAP':   return strikeUsd - put;    // PUT + CAP = strike (USDC)
    default:      return oracleUsd;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TokenKind = 'CALL' | 'FLOOR' | 'PUT' | 'CAP' | 'UNKNOWN';

interface VaultContext {
  vault:       OptionVault;
  isLongSide:  boolean; // true = current mint is the CALL/CAP (long) side
  longMint:    string;  // CALL or CAP mint
  shortMint:   string;  // FLOOR or PUT mint
  longKind:    TokenKind;
  shortKind:   TokenKind;
  strikeUsd:   number;
  expiryTs:    number;
}

interface Props {
  market:     string; // the token mint being traded
  onNavigate: (hash: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Trade({ market, onNavigate }: Props) {
  const { connected, publicKey, signMessage } = useWallet();
  const traderKey = publicKey?.toBase58() ?? null;

  // ── Vault context resolution ──────────────────────────────────────────────
  const [ctx,         setCtx]         = useState<VaultContext | null>(null);
  const [ctxLoading,  setCtxLoading]  = useState(true);
  const [oracleUsd,   setOracleUsd]   = useState(180);
  const [prefillPrice, setPrefillPrice] = useState<number | undefined>();
  const [prefillSize,  setPrefillSize]  = useState<number | undefined>();

  useEffect(() => {
    setCtx(null); setCtxLoading(true);
    let cancelled = false;

    Promise.all([fetchVaultByMint(market), fetchOraclePrice()]).then(([resolved, oracle]) => {
      if (cancelled) return;
      setOracleUsd(oracle);

      if (!resolved) { setCtxLoading(false); return; }

      const v = resolved.vault;
      const longMint  = v.long_mint || v.root_mint || '';
      // Derive short_mint from the vault PDA (not stored in the indexed DB)
      let shortMint = '';
      try {
        shortMint = deriveShortMint(new PublicKey(v.pubkey)).toBase58();
      } catch { /* vault pubkey invalid */ }

      const isLongSide = market === longMint;
      const vaultSide  = v.vault_side as 'LONG' | 'SHORT';
      const longKind:  TokenKind = vaultSide === 'LONG' ? 'CALL'  : 'CAP';
      const shortKind: TokenKind = vaultSide === 'LONG' ? 'FLOOR' : 'PUT';

      const strikeUsd = (v.strike ?? v.strike_price ?? 0) / 1_000_000;
      const expiryTs  = v.expiry ? new Date(v.expiry).getTime() / 1000 : 0;

      setCtx({ vault: v, isLongSide, longMint, shortMint, longKind, shortKind, strikeUsd, expiryTs });
      setCtxLoading(false);
    }).catch(() => setCtxLoading(false));

    return () => { cancelled = true; };
  }, [market]);

  // ── Current token identity ────────────────────────────────────────────────
  const tokenKind: TokenKind = ctx
    ? (ctx.isLongSide ? ctx.longKind : ctx.shortKind)
    : 'UNKNOWN';

  const complementMint: string | null = ctx
    ? (ctx.isLongSide ? ctx.shortMint : ctx.longMint)
    : null;

  const complementKind: TokenKind = ctx
    ? (ctx.isLongSide ? ctx.shortKind : ctx.longKind)
    : 'UNKNOWN';

  // ── Balances ─────────────────────────────────────────────────────────────
  const { balance: tokenBal }      = useTokenBalance(connected ? market : null, traderKey);
  const { balance: complementBal } = useTokenBalance(connected && complementMint ? complementMint : null, traderKey);
  const { balance: usdcBal }       = useTokenBalance(connected ? USDC_MINT : null, traderKey);

  // ── BS fair values ────────────────────────────────────────────────────────
  const fairValue     = ctx ? calcFairValue(tokenKind,      oracleUsd, ctx.strikeUsd, ctx.expiryTs) : null;
  const compFairValue = ctx ? calcFairValue(complementKind, oracleUsd, ctx.strikeUsd, ctx.expiryTs) : null;

  // ── Market data ───────────────────────────────────────────────────────────
  const { orderbook: wsBook, lastPrice: wsLast, connected: wsConnected } = useMarketSocket(market);
  const { data: httpBook }   = useOrderBook(market);
  const { data: httpTrades } = useTrades(market);
  const { data: myOrders }   = useMyOrders(connected ? market : null, traderKey);

  const orderbook   = wsBook ?? httpBook;
  const httpMid     = httpBook?.bids[0] && httpBook?.asks[0]
    ? (httpBook.bids[0].price_usdc + httpBook.asks[0].price_usdc) / 2 / 1e6
    : httpBook?.bids[0]?.price_usdc != null ? httpBook.bids[0].price_usdc / 1e6
    : httpBook?.asks[0]?.price_usdc != null ? httpBook.asks[0].price_usdc / 1e6
    : null;
  const lastPrice   = wsLast ?? httpMid;
  const allTrades   = httpTrades ?? [];

  // ── Pre-fill sell form when user clicks "Sell at BS price" ────────────────
  const handleSellAtFair = useCallback(() => {
    if (fairValue == null) return;
    setPrefillPrice(parseFloat((fairValue * 1.05).toFixed(6)));   // ask = BS mid × 1.05
    if (tokenBal != null && tokenBal > 0) setPrefillSize(tokenBal);
  }, [fairValue, tokenBal]);

  // ── Order submission ──────────────────────────────────────────────────────
  async function handleOrder(side: 'buy' | 'sell', price: number, size: number) {
    if (!publicKey || !signMessage) throw new Error('Wallet not connected');
    const trader   = publicKey.toBase58();
    const sideUpper = side.toUpperCase() as 'BUY' | 'SELL';
    const quantity  = Math.round(size  * 1_000_000);
    const priceUsdc = Math.round(price * 1_000_000);
    const nonce     = Date.now();
    const expiry    = Math.floor(Date.now()/1000) + 3600;
    const msg       = `${trader}|${market}|${sideUpper}|${quantity}|${priceUsdc}|${nonce}|${expiry}`;
    const sigBytes  = await signMessage(new TextEncoder().encode(msg));
    const signature = btoa(String.fromCharCode(...sigBytes));
    await api.orders.create({ trader, token_mint: market, side: sideUpper, quantity, price_usdc: priceUsdc, nonce, expiry, signature });
    // clear prefill after submit
    setPrefillPrice(undefined);
    setPrefillSize(undefined);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function kindColor(k: TokenKind) {
    if (k === 'CALL' || k === 'CAP')  return 'text-bull';
    if (k === 'PUT')                  return 'text-bear';
    if (k === 'FLOOR')                return 'text-accent';
    return 'text-fg-muted';
  }

  function kindBg(k: TokenKind) {
    if (k === 'CALL' || k === 'CAP')  return 'bg-bull/10 border-bull/40';
    if (k === 'PUT')                  return 'bg-bear/10 border-bear/40';
    if (k === 'FLOOR')                return 'bg-accent/10 border-accent/40';
    return 'bg-surface-2 border-wire';
  }

  const isExpired = ctx ? (new Date(ctx.vault.expiry ?? '').getTime() < Date.now()) : false;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-void pt-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8">

        {/* ── Context strip ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 mb-6 border border-wire/50 bg-surface px-4 py-3">
          {/* Token type badge */}
          {tokenKind !== 'UNKNOWN' ? (
            <span className={`font-mono text-xs tracking-widest uppercase px-2 py-1 border ${kindBg(tokenKind)} ${kindColor(tokenKind)}`}>
              {tokenKind}
            </span>
          ) : (
            <span className="font-mono text-xs text-fg-muted">
              {ctxLoading ? 'Resolving…' : truncAddr(market)}
            </span>
          )}

          {ctx && (
            <>
              <span className="font-mono text-xs text-fg">
                Strike <span className="text-accent">${ctx.strikeUsd.toFixed(0)}</span>
              </span>
              <span className="font-mono text-xs text-fg-muted">·</span>
              <span className="font-mono text-xs text-fg-muted">
                Oracle <span className="text-fg">${oracleUsd.toFixed(2)}</span>
              </span>
              <span className="font-mono text-xs text-fg-muted">·</span>
              <ExpiryCountdown expiry={ctx.vault.expiry ?? ''} />
              {isExpired && (
                <span className="font-mono text-[9px] uppercase tracking-widest text-bear bg-bear/10 px-2 py-0.5 border border-bear/30">
                  Expired
                </span>
              )}
            </>
          )}

          {fairValue != null && (
            <span className="ml-auto font-mono text-xs text-fg-muted">
              BS fair <span className="text-fg">${fmtUsdc(fairValue, 4)}</span>
              <span className="text-fg-muted/50 mx-1">·</span>
              ask <span className="text-bull">${fmtUsdc(fairValue * 1.05, 4)}</span>
            </span>
          )}

          <span className={`font-mono text-[9px] uppercase tracking-widest ${wsConnected ? 'text-bull' : 'text-fg-muted'}`}>
            {wsConnected ? '● live' : '○ offline'}
          </span>
        </div>

        {/* ── Two-column grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">

          {/* LEFT ─────────────────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* My Positions in this vault */}
            {connected && ctx && (
              <div className="border border-wire bg-surface">
                <div className="px-4 py-2.5 border-b border-wire">
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted">
                    My Position in this vault
                  </span>
                </div>

                <div className="divide-y divide-wire/40">
                  {/* Current token row */}
                  <PositionRow
                    label={tokenKind}
                    mint={market}
                    balance={tokenBal}
                    fairValue={fairValue}
                    isCurrent
                    kindColor={kindColor(tokenKind)}
                    onSell={handleSellAtFair}
                    onTrade={() => {/* already here */}}
                  />

                  {/* Complement token row */}
                  {complementMint && (
                    <PositionRow
                      label={complementKind}
                      mint={complementMint}
                      balance={complementBal}
                      fairValue={compFairValue}
                      isCurrent={false}
                      kindColor={kindColor(complementKind)}
                      onSell={() => {
                        // Navigate to complement's trade page with pre-filled sell
                        onNavigate(`#/app/trade/${complementMint}`);
                      }}
                      onTrade={() => onNavigate(`#/app/trade/${complementMint}`)}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Price chart */}
            <div className="bg-surface border border-wire">
              <div className="flex gap-1 px-3 pt-3">
                {/* No timeframe selector needed — just show the chart */}
              </div>
              <div className="bg-[#050410]">
                <PriceChart trades={allTrades} timeframe="15m" />
              </div>
            </div>

            {/* Settle CTA post-expiry */}
            {isExpired && ctx && (
              <div className="border border-bear/30 bg-bear/5 px-4 py-3">
                <p className="font-mono text-xs text-bear mb-2">This option has expired.</p>
                <button
                  onClick={() => onNavigate(`#/app/settle/${ctx.vault.pubkey}`)}
                  className="font-mono text-[10px] uppercase tracking-widest text-bear hover:text-fg transition-colors"
                >
                  Settle position →
                </button>
              </div>
            )}

            {/* Split CTA */}
            {!isExpired && ctx && tokenBal != null && tokenBal > 0
              && (tokenKind === 'CALL' || tokenKind === 'PUT') && (
              <div className="border border-accent/25 bg-accent/5 px-4 py-3 text-[10px] font-mono text-fg-muted">
                <p className="text-fg mb-1.5">
                  Use your {tokenKind} as collateral — no extra deposit required.
                </p>
                <p className="mb-2">
                  Split into a {tokenKind === 'CALL' ? 'higher-strike CALL + FLOOR spread' : 'lower-strike PUT + CAP spread'} and collect premium on the spread component.
                </p>
                <button
                  onClick={() => onNavigate(`#/app/split/${market}`)}
                  className="px-3 py-1.5 bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 transition-colors uppercase tracking-widest"
                >
                  Split → {tokenKind === 'CALL' ? 'Higher' : 'Lower'} Strike ↗
                </button>
              </div>
            )}
          </div>

          {/* RIGHT ────────────────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Order book */}
            <div className="bg-surface border border-wire p-4">
              <h3 className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-3">Order Book</h3>
              <OrderBook data={orderbook} lastPrice={lastPrice} onPriceClick={p => setPrefillPrice(p)} />
            </div>

            {/* Place order */}
            <div className="bg-surface border border-wire p-4">
              <h3 className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-3">
                Place Order
                {fairValue != null && (
                  <span className="ml-2 font-mono text-[9px] text-fg-muted normal-case tracking-normal">
                    BS fair: <span className="text-fg">${fmtUsdc(fairValue, 4)}</span>
                  </span>
                )}
              </h3>
              <WalletGate walletConnected={connected}>
                <OrderForm
                  prefillPrice={prefillPrice}
                  prefillSize={prefillSize}
                  bsFairValue={fairValue ?? undefined}
                  onSubmit={handleOrder}
                  disabled={!connected}
                  tokenBalance={tokenBal}
                  usdcBalance={usdcBal}
                  tokenKind={tokenKind}
                />
              </WalletGate>
            </div>

            {/* My open orders */}
            {connected && (
              <div className="bg-surface border border-wire p-4">
                <h3 className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-3">My Open Orders</h3>
                {myOrders && myOrders.length > 0 ? (
                  <table className="w-full font-mono text-[10px]">
                    <thead>
                      <tr className="border-b border-wire text-fg-muted">
                        <th className="text-left py-1">Side</th>
                        <th className="text-right py-1">Price</th>
                        <th className="text-right py-1">Size</th>
                        <th className="text-right py-1">Filled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myOrders.map(o => (
                        <tr key={o.id} className={o.side === 'BUY' ? 'text-bull' : 'text-bear'}>
                          <td className="py-1">{o.side}</td>
                          <td className="text-right py-1">${(o.price_usdc/1e6).toFixed(4)}</td>
                          <td className="text-right py-1">{(o.quantity/1e6).toFixed(2)}</td>
                          <td className="text-right py-1">{(o.filled_qty/1e6).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="font-mono text-[10px] text-fg-muted">No open orders</p>
                )}
              </div>
            )}

            {/* Recent trades */}
            <div className="bg-surface border border-wire p-4">
              <h3 className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-3">Recent Trades</h3>
              <TradeList trades={allTrades} />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Position row sub-component ───────────────────────────────────────────────

interface PositionRowProps {
  label:      string;
  mint:       string;
  balance:    number | null;
  fairValue:  number | null;
  isCurrent:  boolean;
  kindColor:  string;
  onSell:     () => void;
  onTrade:    () => void;
}

function PositionRow({ label, mint, balance, fairValue, isCurrent, kindColor, onSell, onTrade }: PositionRowProps) {
  const hasBalance = balance != null && balance > 0;
  return (
    <div className={`px-4 py-3 flex items-center justify-between gap-3 ${isCurrent ? 'bg-surface-2/30' : ''}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`font-mono text-xs tracking-widest uppercase font-medium ${kindColor}`}>{label}</span>
        <span className="font-mono text-[10px] text-fg-muted truncate" title={mint}>{mint.slice(0,10)}…</span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {/* Balance */}
        <div className="text-right">
          <div className="font-mono text-sm text-fg">{balance != null ? balance.toFixed(4) : '—'}</div>
          <div className="font-mono text-[9px] text-fg-muted">tokens</div>
        </div>
        {/* BS fair value */}
        {fairValue != null && (
          <div className="text-right hidden sm:block">
            <div className="font-mono text-xs text-fg-muted">fair</div>
            <div className="font-mono text-xs text-fg">${fmtUsdc(fairValue, 4)}</div>
          </div>
        )}
        {/* Actions */}
        <div className="flex gap-2">
          {hasBalance && (
            <button
              onClick={onSell}
              className="font-mono text-[9px] tracking-widest uppercase px-2 py-1.5 bg-bear/15 border border-bear/40 text-bear hover:bg-bear hover:text-void transition-colors whitespace-nowrap"
            >
              Sell
            </button>
          )}
          {!isCurrent && (
            <button
              onClick={onTrade}
              className="font-mono text-[9px] tracking-widest uppercase px-2 py-1.5 border border-wire text-fg-muted hover:border-accent hover:text-fg transition-colors"
            >
              Trade
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

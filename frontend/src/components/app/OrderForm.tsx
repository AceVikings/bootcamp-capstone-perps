import { useState, useEffect } from 'react';
import { fmtUsdc } from '../../lib/format';

interface Props {
  prefillPrice?:  number;
  prefillSize?:   number;
  bsFairValue?:   number;    // Black-Scholes theoretical mid price
  onSubmit:       (side: 'buy' | 'sell', price: number, size: number) => Promise<void>;
  disabled?:      boolean;
  tokenBalance?:  number | null;
  usdcBalance?:   number | null;
  tokenKind?:     string;    // 'CALL' | 'FLOOR' | 'PUT' | 'CAP' | 'UNKNOWN'
}

export function OrderForm({
  prefillPrice,
  prefillSize,
  bsFairValue,
  onSubmit,
  disabled,
  tokenBalance,
  usdcBalance,
  tokenKind = 'TOKEN',
}: Props) {
  const [side,       setSide]       = useState<'buy' | 'sell'>('sell');
  const [price,      setPrice]      = useState('');
  const [size,       setSize]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState(false);

  // Apply pre-fills from parent (e.g. clicking "Sell at BS" or clicking orderbook row)
  useEffect(() => {
    if (prefillPrice != null) {
      setPrice(prefillPrice.toFixed(6));
      setSide('sell');    // pre-fill always implies selling at that price
    }
  }, [prefillPrice]);

  useEffect(() => {
    if (prefillSize != null) setSize(prefillSize.toFixed(6));
  }, [prefillSize]);

  const priceNum = parseFloat(price) || 0;
  const sizeNum  = parseFloat(size)  || 0;
  const total    = priceNum * sizeNum;

  // Cost check for buy side
  const buyTotalUsdc = side === 'buy' ? total : null;
  const insufficientUsdc = side === 'buy' && usdcBalance != null && buyTotalUsdc != null && buyTotalUsdc > usdcBalance;
  const insufficientTokens = side === 'sell' && tokenBalance != null && sizeNum > tokenBalance;

  // BS suggestion buttons
  const bsAsk = bsFairValue != null ? bsFairValue * 1.05 : null;
  const bsBid = bsFairValue != null ? bsFairValue * 0.95 : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!priceNum || !sizeNum || priceNum <= 0 || sizeNum <= 0) {
      setError('Enter a valid price and size'); return;
    }
    if (insufficientUsdc)    { setError('Insufficient USDC balance'); return; }
    if (insufficientTokens)  { setError(`Insufficient ${tokenKind} balance`); return; }
    setError(null); setSubmitting(true); setSuccess(false);
    try {
      await onSubmit(side, priceNum, sizeNum);
      setPrice(''); setSize('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Place order">
      {/* Side tabs */}
      <div className="flex border border-wire mb-4" role="tablist">
        <button type="button" role="tab" aria-selected={side === 'buy'}
          onClick={() => setSide('buy')}
          className={`flex-1 py-2 font-mono text-xs tracking-widest uppercase transition-colors ${
            side === 'buy' ? 'bg-bull/20 text-bull' : 'text-fg-muted hover:text-fg'
          }`}>
          Buy
        </button>
        <button type="button" role="tab" aria-selected={side === 'sell'}
          onClick={() => setSide('sell')}
          className={`flex-1 py-2 font-mono text-xs tracking-widest uppercase transition-colors ${
            side === 'sell' ? 'bg-bear/20 text-bear' : 'text-fg-muted hover:text-fg'
          }`}>
          Sell
        </button>
      </div>

      <div className="space-y-3">

        {/* BS price suggestion buttons */}
        {bsFairValue != null && (
          <div className="flex gap-1.5">
            {side === 'buy' && bsBid != null && (
              <button type="button"
                onClick={() => setPrice(bsBid.toFixed(6))}
                className="flex-1 py-1.5 font-mono text-[9px] uppercase tracking-widest border border-bull/40 text-bull hover:bg-bull/10 transition-colors">
                BS bid ${fmtUsdc(bsBid, 4)}
              </button>
            )}
            {side === 'sell' && bsAsk != null && (
              <button type="button"
                onClick={() => {
                  setPrice(bsAsk.toFixed(6));
                  if (tokenBalance != null && tokenBalance > 0) setSize(tokenBalance.toFixed(6));
                }}
                className="flex-1 py-1.5 font-mono text-[9px] uppercase tracking-widest border border-bear/40 text-bear hover:bg-bear/10 transition-colors">
                BS ask ${fmtUsdc(bsAsk, 4)}
              </button>
            )}
            <button type="button"
              onClick={() => setPrice(bsFairValue.toFixed(6))}
              className="flex-1 py-1.5 font-mono text-[9px] uppercase tracking-widest border border-wire text-fg-muted hover:border-accent/40 hover:text-fg transition-colors">
              Mid ${fmtUsdc(bsFairValue, 4)}
            </button>
          </div>
        )}

        {/* Price input */}
        <div>
          <label htmlFor="order-price"
            className="block font-mono text-[10px] tracking-widest uppercase text-fg-muted mb-1">
            Price (USDC per token)
          </label>
          <input id="order-price" type="number" min="0" step="0.000001"
            value={price} onChange={e => setPrice(e.target.value)}
            placeholder="0.000000"
            className="w-full bg-surface-2 border border-wire text-fg font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent"
          />
        </div>

        {/* Size input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="order-size"
              className="font-mono text-[10px] tracking-widest uppercase text-fg-muted">
              Size ({tokenKind} tokens)
            </label>
            {/* Max button */}
            {side === 'sell' && tokenBalance != null && tokenBalance > 0 && (
              <button type="button"
                onClick={() => setSize(tokenBalance.toFixed(6))}
                className="font-mono text-[9px] uppercase tracking-widest text-accent hover:text-accent-bright transition-colors">
                Max
              </button>
            )}
            {side === 'buy' && usdcBalance != null && priceNum > 0 && (
              <button type="button"
                onClick={() => setSize(Math.floor(usdcBalance / priceNum * 1e4)/1e4 + '')}
                className="font-mono text-[9px] uppercase tracking-widest text-accent hover:text-accent-bright transition-colors">
                Max
              </button>
            )}
          </div>
          <input id="order-size" type="number" min="0" step="0.000001"
            value={size} onChange={e => setSize(e.target.value)}
            placeholder="0.000000"
            className={`w-full bg-surface-2 border text-fg font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent ${
              insufficientTokens ? 'border-bear/60' : 'border-wire'
            }`}
          />
          {/* Balance hints */}
          <div className="mt-1 flex justify-between font-mono text-[10px] text-fg-muted">
            {side === 'sell' && tokenBalance != null && (
              <span>Balance: <span className={insufficientTokens ? 'text-bear' : 'text-fg'}>
                {tokenBalance.toLocaleString('en-US', { maximumFractionDigits: 4 })} {tokenKind}
              </span></span>
            )}
            {side === 'buy' && usdcBalance != null && (
              <span>USDC available: <span className={insufficientUsdc ? 'text-bear' : 'text-fg'}>
                {usdcBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
              </span></span>
            )}
          </div>
        </div>

        {/* Total */}
        <div>
          <label className="block font-mono text-[10px] tracking-widest uppercase text-fg-muted mb-1">
            Total (USDC)
          </label>
          <div className={`w-full border font-mono text-sm px-3 py-2 select-none ${
            insufficientUsdc ? 'border-bear/60 text-bear' : 'border-wire/50 text-fg-muted'
          }`}>
            {total > 0 ? `$${fmtUsdc(total, 4)}` : '—'}
          </div>
        </div>

        {error && <p className="font-mono text-[10px] text-bear" role="alert">{error}</p>}
        {success && <p className="font-mono text-[10px] text-bull">Order submitted ✓</p>}

        <button type="submit"
          disabled={disabled || submitting}
          className={`w-full py-3 font-mono text-xs tracking-widest uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            side === 'buy'
              ? 'bg-bull/20 border border-bull text-bull hover:bg-bull hover:text-void'
              : 'bg-bear/20 border border-bear text-bear hover:bg-bear hover:text-void'
          }`}>
          {submitting ? 'Signing…' : side === 'buy' ? `Buy ${tokenKind}` : `Sell ${tokenKind} →`}
        </button>
      </div>
    </form>
  );
}

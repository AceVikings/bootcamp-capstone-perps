import { useState, useEffect } from 'react';
import { fmtUsdc } from '../../lib/format';

interface Props {
  prefillPrice?: number;
  onSubmit: (side: 'buy' | 'sell', price: number, size: number) => Promise<void>;
  disabled?: boolean;
  tokenBalance?: number | null;   // whole-token balance (for sell side)
  usdcBalance?: number | null;    // USDC balance (for buy side)
}

export function OrderForm({ prefillPrice, onSubmit, disabled, tokenBalance, usdcBalance }: Props) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState('');
  const [size, setSize] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefillPrice != null) setPrice(String(prefillPrice));
  }, [prefillPrice]);

  const total = Number(price) * Number(size);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const p = Number(price);
    const s = Number(size);
    if (!p || !s || p <= 0 || s <= 0) {
      setError('Enter a valid price and size');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(side, p, s);
      setPrice('');
      setSize('');
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
        <button
          type="button"
          role="tab"
          aria-selected={side === 'buy'}
          onClick={() => setSide('buy')}
          className={`flex-1 py-2 font-mono text-xs tracking-widest uppercase transition-colors ${
            side === 'buy' ? 'bg-bull/20 text-bull' : 'text-fg-muted hover:text-fg'
          }`}
        >
          Buy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={side === 'sell'}
          onClick={() => setSide('sell')}
          className={`flex-1 py-2 font-mono text-xs tracking-widest uppercase transition-colors ${
            side === 'sell' ? 'bg-bear/20 text-bear' : 'text-fg-muted hover:text-fg'
          }`}
        >
          Sell
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="order-price" className="block font-mono text-[10px] tracking-widest uppercase text-fg-muted mb-1">
            Price (USDC)
          </label>
          <input
            id="order-price"
            type="number"
            min="0"
            step="0.0001"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="0.0000"
            className="w-full bg-surface-2 border border-wire text-fg font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent"
            aria-label="Price in USDC"
          />
        </div>

        <div>
          <label htmlFor="order-size" className="block font-mono text-[10px] tracking-widest uppercase text-fg-muted mb-1">
            Size (tokens)
          </label>
          <input
            id="order-size"
            type="number"
            min="0"
            step="0.01"
            value={size}
            onChange={e => setSize(e.target.value)}
            placeholder="0.00"
            className="w-full bg-surface-2 border border-wire text-fg font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent"
            aria-label="Size in tokens"
          />
          {side === 'sell' && tokenBalance != null && (
            <p className="mt-1 font-mono text-[10px] text-fg-muted">
              Balance: <span className="text-fg">{tokenBalance.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span> tokens
            </p>
          )}
          {side === 'buy' && usdcBalance != null && (
            <p className="mt-1 font-mono text-[10px] text-fg-muted">
              Balance: <span className="text-fg">{usdcBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span> USDC
            </p>
          )}
        </div>

        <div>
          <label className="block font-mono text-[10px] tracking-widest uppercase text-fg-muted mb-1">
            Total (USDC)
          </label>
          <div className="w-full bg-surface border border-wire/50 text-fg-muted font-mono text-sm px-3 py-2 select-none">
            {total > 0 ? `$${fmtUsdc(total)}` : '—'}
          </div>
        </div>

        {error && (
          <p className="font-mono text-[10px] text-bear" role="alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={disabled || submitting}
          className={`w-full py-3 font-mono text-xs tracking-widest uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            side === 'buy'
              ? 'bg-bull/20 border border-bull text-bull hover:bg-bull hover:text-void'
              : 'bg-bear/20 border border-bear text-bear hover:bg-bear hover:text-void'
          }`}
          aria-label={`Submit ${side} order`}
        >
          {submitting ? 'Signing…' : `${side === 'buy' ? 'Buy' : 'Sell'} →`}
        </button>
      </div>
    </form>
  );
}

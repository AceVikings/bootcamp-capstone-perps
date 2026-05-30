import { fmtUsdc } from '../../lib/format';
import type { OrderBook as OrderBookType, OrderBookLevel } from '../../lib/api';

interface Props {
  data: OrderBookType | null;
  lastPrice?: number | null;
  onPriceClick?: (price: number) => void;
}

function withTotals(levels: OrderBookLevel[]) {
  let running = 0;
  return levels.map(l => {
    running += l.quantity;
    return { ...l, total: running };
  });
}

export function OrderBook({ data, lastPrice, onPriceClick }: Props) {
  if (!data) {
    return (
      <div className="py-8 text-center font-mono text-xs text-fg-muted">Loading orderbook…</div>
    );
  }

  const asks = withTotals([...data.asks].reverse().slice(0, 12));
  const bids = withTotals(data.bids.slice(0, 12));

  // lastPrice is already in display USDC dollars (pre-divided); fallback computes from micro-units
  const displayMid =
    lastPrice ??
    (data.bids.length && data.asks.length
      ? (data.bids[0].price_usdc + data.asks[0].price_usdc) / 2 / 1e6
      : (data.bids[0]?.price_usdc ?? data.asks[0]?.price_usdc ?? 0) / 1e6);

  return (
    <div className="font-mono text-xs" aria-label="Orderbook">
      {/* Header */}
      <div className="grid grid-cols-3 py-2 border-b border-wire text-[10px] tracking-[0.12em] uppercase text-fg-muted">
        <span>Price (USDC)</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks */}
      <div className="divide-y divide-wire/30">
        {asks.map((row, i) => (
          <button
            key={i}
            onClick={() => onPriceClick?.(row.price_usdc / 1e6)}
            className="grid grid-cols-3 w-full py-1 hover:bg-bear/10 transition-colors text-left"
            aria-label={`Ask ${fmtUsdc(row.price_usdc / 1e6, 4)} qty ${(row.quantity / 1e6).toLocaleString()}`}
          >
            <span className="text-bear">{fmtUsdc(row.price_usdc / 1e6, 4)}</span>
            <span className="text-right text-fg-muted">{(row.quantity / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            <span className="text-right text-fg-muted">{(row.total / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          </button>
        ))}
      </div>

      {/* Mid price */}
      <div className="py-2 text-center border-y border-wire my-1">
        <span className="text-fg text-sm font-mono">${fmtUsdc(displayMid, 4)}</span>
      </div>

      {/* Bids */}
      <div className="divide-y divide-wire/30">
        {bids.map((row, i) => (
          <button
            key={i}
            onClick={() => onPriceClick?.(row.price_usdc / 1e6)}
            className="grid grid-cols-3 w-full py-1 hover:bg-bull/10 transition-colors text-left"
            aria-label={`Bid ${fmtUsdc(row.price_usdc / 1e6, 4)} qty ${(row.quantity / 1e6).toLocaleString()}`}
          >
            <span className="text-bull">{fmtUsdc(row.price_usdc / 1e6, 4)}</span>
            <span className="text-right text-fg-muted">{(row.quantity / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            <span className="text-right text-fg-muted">{(row.total / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


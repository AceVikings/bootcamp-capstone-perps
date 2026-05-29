import { fmtUsdc } from '../../lib/format';
import type { OrderBook as OrderBookType } from '../../lib/api';

interface Props {
  data: OrderBookType | null;
  onPriceClick?: (price: number) => void;
}

export function OrderBook({ data, onPriceClick }: Props) {
  if (!data) {
    return (
      <div className="py-8 text-center font-mono text-xs text-fg-muted">Loading orderbook…</div>
    );
  }

  const asks = [...data.asks].reverse().slice(0, 12);
  const bids = data.bids.slice(0, 12);

  return (
    <div className="font-mono text-xs" aria-label="Orderbook">
      {/* Header */}
      <div className="grid grid-cols-3 py-2 border-b border-wire text-[10px] tracking-[0.12em] uppercase text-fg-muted">
        <span>Price (USDC)</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks */}
      <div className="divide-y divide-wire/30">
        {asks.map((row, i) => (
          <button
            key={i}
            onClick={() => onPriceClick?.(row.price)}
            className="grid grid-cols-3 w-full py-1 hover:bg-bear/10 transition-colors text-left"
            aria-label={`Ask ${row.price} size ${row.size}`}
          >
            <span className="text-bear">{fmtUsdc(row.price, 4)}</span>
            <span className="text-right text-fg-muted">{fmtUsdc(row.size, 2)}</span>
            <span className="text-right text-fg-muted">{fmtUsdc(row.total, 2)}</span>
          </button>
        ))}
      </div>

      {/* Mid price */}
      <div className="py-2 text-center border-y border-wire my-1">
        <span className="text-fg text-sm font-mono">${fmtUsdc(data.last_price, 4)}</span>
      </div>

      {/* Bids */}
      <div className="divide-y divide-wire/30">
        {bids.map((row, i) => (
          <button
            key={i}
            onClick={() => onPriceClick?.(row.price)}
            className="grid grid-cols-3 w-full py-1 hover:bg-bull/10 transition-colors text-left"
            aria-label={`Bid ${row.price} size ${row.size}`}
          >
            <span className="text-bull">{fmtUsdc(row.price, 4)}</span>
            <span className="text-right text-fg-muted">{fmtUsdc(row.size, 2)}</span>
            <span className="text-right text-fg-muted">{fmtUsdc(row.total, 2)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

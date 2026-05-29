import { fmtUsdc, fmtTime } from '../../lib/format';
import type { Trade } from '../../lib/api';

interface Props {
  trades: Trade[];
}

export function TradeList({ trades }: Props) {
  if (trades.length === 0) {
    return (
      <div className="py-6 text-center font-mono text-xs text-fg-muted">No recent trades</div>
    );
  }

  return (
    <div aria-label="Recent trades">
      <div className="grid grid-cols-4 py-2 border-b border-wire text-[10px] tracking-[0.12em] uppercase text-fg-muted font-mono">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Side</span>
      </div>
      <div className="divide-y divide-wire/30 max-h-64 overflow-y-auto">
        {trades.slice(0, 20).map(trade => (
          <div
            key={trade.id}
            className="grid grid-cols-4 py-1 font-mono text-xs"
            role="row"
          >
            <span className="text-fg-muted">{fmtTime(trade.ts)}</span>
            <span className={`text-right ${trade.side === 'buy' ? 'text-bull' : 'text-bear'}`}>
              {fmtUsdc(trade.price, 4)}
            </span>
            <span className="text-right text-fg-muted">{fmtUsdc(trade.size, 2)}</span>
            <span className={`text-right uppercase tracking-wide ${trade.side === 'buy' ? 'text-bull' : 'text-bear'}`}>
              {trade.side}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

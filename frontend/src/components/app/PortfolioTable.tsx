import { fmtUsdc, fmtPnl, tokenTypeLabel, truncAddr } from '../../lib/format';
import { TokenTypeBadge } from './TokenTypeBadge';
import type { Position } from '../../lib/api';

interface Props {
  positions: Position[];
  onTrade: (mint: string) => void;
  onSplit: (mint: string) => void;
  onMerge?: (mint: string) => void;
  onRedeem?: (mint: string) => void;
}

export function PortfolioTable({ positions, onTrade, onSplit, onMerge, onRedeem }: Props) {
  if (positions.length === 0) {
    return (
      <div className="py-12 text-center font-mono text-xs text-fg-muted">
        No open positions
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" aria-label="Portfolio positions">
        <thead>
          <tr className="border-b border-wire">
            {['Asset', 'Type', 'Depth', 'Balance', 'Est. Value', 'Entry', 'Unreal. P&L', 'Actions'].map(h => (
              <th key={h} className={`font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted py-3 pr-3 ${h === 'Actions' ? 'text-right' : 'text-left'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map(pos => {
            const pnlPositive = pos.unrealized_pnl >= 0;
            return (
              <tr key={pos.mint} className="border-b border-wire/40 hover:bg-surface-2/30 transition-colors">
                <td className="font-mono text-fg py-3 pr-3">{truncAddr(pos.mint)}</td>
                <td className="py-3 pr-3">
                  <TokenTypeBadge type={pos.token_type} size="sm" />
                </td>
                <td className="font-mono text-fg-muted py-3 pr-3">{pos.depth}</td>
                <td className="font-mono text-fg py-3 pr-3">{pos.balance.toLocaleString()}</td>
                <td className="font-mono text-fg py-3 pr-3">${fmtUsdc(pos.est_value_usdc)}</td>
                <td className="font-mono text-fg-muted py-3 pr-3">${fmtUsdc(pos.entry_price, 4)}</td>
                <td className={`font-mono py-3 pr-3 ${pnlPositive ? 'text-bull' : 'text-bear'}`}>
                  {fmtPnl(pos.unrealized_pnl)}
                </td>
                <td className="py-3 text-right">
                  <div className="flex gap-1.5 justify-end flex-wrap">
                    <button
                      onClick={() => onTrade(pos.mint)}
                      className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 border border-accent/50 text-accent hover:bg-accent hover:text-void transition-colors"
                      aria-label={`Trade ${tokenTypeLabel(pos.token_type)}`}
                    >
                      Trade
                    </button>
                    {pos.depth === 1 && (
                      <button
                        onClick={() => onSplit(pos.mint)}
                        className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 border border-fg-muted/40 text-fg-muted hover:text-fg transition-colors"
                        aria-label={`Split ${tokenTypeLabel(pos.token_type)}`}
                      >
                        Split
                      </button>
                    )}
                    {onMerge && pos.depth === 2 && (
                      <button
                        onClick={() => onMerge(pos.mint)}
                        className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 border border-fg-muted/40 text-fg-muted hover:text-fg transition-colors"
                        aria-label={`Merge ${tokenTypeLabel(pos.token_type)}`}
                      >
                        Merge
                      </button>
                    )}
                    {onRedeem && pos.depth === 1 && (
                      <button
                        onClick={() => onRedeem(pos.mint)}
                        className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 border border-fg-muted/40 text-fg-muted hover:text-fg transition-colors"
                        aria-label={`Redeem ${tokenTypeLabel(pos.token_type)}`}
                      >
                        Redeem
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { fmtUsdc, truncAddr } from '../../lib/format';
import { TokenTypeBadge } from './TokenTypeBadge';
import type { ClaimNode } from '../../lib/api';

interface Props {
  claims: ClaimNode[];
  onTrade: (mint: string) => void;
  onSplit: (pubkey: string) => void;
  onMerge: (pubkey: string) => void;
}

export function PortfolioTable({ claims, onTrade, onSplit, onMerge }: Props) {
  if (claims.length === 0) {
    return (
      <div className="py-12 text-center font-mono text-xs text-fg-muted">
        No option token positions
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" aria-label="Option token positions">
        <thead>
          <tr className="border-b border-wire">
            {['Source Mint', 'Type', 'Depth', 'Entry Price', 'Status', 'Actions'].map(h => (
              <th
                key={h}
                className={`font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted py-3 pr-3 ${h === 'Actions' ? 'text-right' : 'text-left'}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {claims.map(node => (
            <tr key={node.pubkey} className="border-b border-wire/40 hover:bg-surface-2/30 transition-colors">
              <td className="font-mono text-fg py-3 pr-3">{truncAddr(node.source_mint)}</td>
              <td className="py-3 pr-3">
                <TokenTypeBadge type={node.claim_type.toLowerCase()} size="sm" />
              </td>
              <td className="font-mono text-fg-muted py-3 pr-3">{node.depth}</td>
              <td className="font-mono text-fg-muted py-3 pr-3">${fmtUsdc(node.creation_price / 1e6, 4)}</td>
              <td className="py-3 pr-3">
                <span className={`font-mono text-[9px] tracking-widest uppercase ${node.is_active ? 'text-bull' : 'text-fg-muted'}`}>
                  {node.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="py-3 text-right">
                <div className="flex gap-1.5 justify-end flex-wrap">
                  <button
                    onClick={() => onTrade(node.source_mint)}
                    disabled={!node.is_active}
                    className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 border border-accent/50 text-accent hover:bg-accent hover:text-void transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={`Trade ${node.claim_type}`}
                  >
                    Trade
                  </button>
                  {node.depth < 8 && node.is_active && (
                    <button
                      onClick={() => onSplit(node.source_mint)}
                      className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 border border-fg-muted/40 text-fg-muted hover:text-fg transition-colors"
                      aria-label={`Split ${node.claim_type}`}
                    >
                      Split
                    </button>
                  )}
                  {node.left_child_mint && node.left_child_mint.length > 0 && node.is_active && (
                    <button
                      onClick={() => onMerge(node.pubkey)}
                      className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 border border-fg-muted/40 text-fg-muted hover:text-fg transition-colors"
                      aria-label={`Merge children of ${node.claim_type}`}
                    >
                      Merge
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


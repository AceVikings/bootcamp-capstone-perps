import { useWallet } from '@solana/wallet-adapter-react';
import { WalletGate } from '../components/app/WalletGate';
import { PortfolioTable } from '../components/app/PortfolioTable';
import { ClaimTreeGraph } from '../components/app/ClaimTreeGraph';
import { usePositions, useClaimTree } from '../hooks';
import { fmtUsdc, fmtPnl } from '../lib/format';

interface Props {
  onNavigate: (hash: string) => void;
}

export function Portfolio({ onNavigate }: Props) {
  const { connected, publicKey } = useWallet();
  const walletAddr = publicKey?.toBase58() ?? null;

  const { data: positions, loading: posLoading } = usePositions(walletAddr);
  const { data: tree, loading: treeLoading } = useClaimTree(walletAddr);

  const totalValue = positions?.reduce((s, p) => s + p.est_value_usdc, 0) ?? 0;
  const realizedPnl = 0; // would come from separate API endpoint
  const unrealizedPnl = positions?.reduce((s, p) => s + p.unrealized_pnl, 0) ?? 0;
  const openPositions = positions?.length ?? 0;
  const maxDepth = positions ? Math.max(0, ...positions.map(p => p.depth)) : 0;

  return (
    <div className="min-h-screen bg-void pt-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">

        <WalletGate walletConnected={connected}>

          {/* Summary bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px border border-wire mb-10 bg-wire">
            {[
              { label: 'Portfolio Value', value: `$${fmtUsdc(totalValue)}` },
              { label: 'Realized P&L', value: fmtPnl(realizedPnl) },
              { label: 'Open Positions', value: String(openPositions) },
              { label: 'Max Claim Depth', value: String(maxDepth) },
            ].map(stat => (
              <div key={stat.label} className="bg-surface p-5">
                <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted mb-2">{stat.label}</div>
                <div className={`font-mono text-xl ${
                  stat.label.includes('P&L')
                    ? unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'
                    : 'text-fg'
                }`}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Positions table */}
          <section className="mb-10" aria-labelledby="positions-heading">
            <h2 id="positions-heading" className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-4">
              Positions
            </h2>
            <div className="bg-surface border border-wire p-4">
              {posLoading ? (
                <div className="py-8 text-center font-mono text-xs text-fg-muted">Loading…</div>
              ) : (
                <PortfolioTable
                  positions={positions ?? []}
                  onTrade={mint => onNavigate(`#/app/trade/${mint}`)}
                  onSplit={mint => onNavigate(`#/app/split/${mint}`)}
                  onMerge={mint => console.log('merge', mint)}
                  onRedeem={mint => console.log('redeem', mint)}
                />
              )}
            </div>
          </section>

          {/* Claim tree */}
          <section aria-labelledby="tree-heading">
            <h2 id="tree-heading" className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-4">
              Claim Tree
            </h2>
            <div className="bg-surface border border-wire p-4">
              {treeLoading ? (
                <div className="py-8 text-center font-mono text-xs text-fg-muted">Loading…</div>
              ) : (
                <ClaimTreeGraph tree={tree} />
              )}
            </div>
          </section>

        </WalletGate>
      </div>
    </div>
  );
}

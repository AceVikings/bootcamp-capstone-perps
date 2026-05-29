import { useWallet } from '@solana/wallet-adapter-react';
import { WalletGate } from '../components/app/WalletGate';
import { PortfolioTable } from '../components/app/PortfolioTable';
import { ClaimTreeGraph } from '../components/app/ClaimTreeGraph';
import { useClaims, useClaimTree } from '../hooks';

interface Props {
  onNavigate: (hash: string) => void;
}

export function Portfolio({ onNavigate }: Props) {
  const { connected, publicKey } = useWallet();
  const walletAddr = publicKey?.toBase58() ?? null;

  const { data: claims, loading: claimsLoading } = useClaims(walletAddr);
  const { loading: treeLoading } = useClaimTree(walletAddr);

  const activeCount = claims?.filter(c => c.is_active).length ?? 0;
  const maxDepth = claims ? Math.max(0, ...claims.map(c => c.depth)) : 0;
  const totalNodes = claims?.length ?? 0;

  return (
    <div className="min-h-screen bg-void pt-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">

        <WalletGate walletConnected={connected}>

          {/* Summary bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px border border-wire mb-10 bg-wire">
            {[
              { label: 'Active Claims', value: String(activeCount) },
              { label: 'Total Nodes', value: String(totalNodes) },
              { label: 'Max Depth', value: String(maxDepth) },
              { label: 'Status', value: totalNodes > 0 ? 'Active' : 'Empty' },
            ].map(stat => (
              <div key={stat.label} className="bg-surface p-5">
                <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted mb-2">{stat.label}</div>
                <div className="font-mono text-xl text-fg">{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Claims table */}
          <section className="mb-10" aria-labelledby="claims-heading">
            <h2 id="claims-heading" className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-4">
              Claim Nodes
            </h2>
            <div className="bg-surface border border-wire p-4">
              {claimsLoading ? (
                <div className="py-8 text-center font-mono text-xs text-fg-muted">Loading…</div>
              ) : (
                <PortfolioTable
                  claims={claims ?? []}
                  onTrade={mint => onNavigate(`#/app/trade/${mint}`)}
                  onSplit={pubkey => onNavigate(`#/app/split/${pubkey}`)}
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
                <ClaimTreeGraph nodes={claims} />
              )}
            </div>
          </section>

        </WalletGate>
      </div>
    </div>
  );
}


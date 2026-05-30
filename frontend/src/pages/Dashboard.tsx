import { useWallet } from '@solana/wallet-adapter-react';
import { ArrowRight } from 'lucide-react';
import { WalletGate } from '../components/app/WalletGate';
import { VaultTable } from '../components/app/EpochTable';
import { PortfolioTable } from '../components/app/PortfolioTable';
import { useVaults, useClaims, useAnalytics } from '../hooks';
import { fmtUsdc } from '../lib/format';

interface Props {
  onNavigate: (hash: string) => void;
}

export function Dashboard({ onNavigate }: Props) {
  const { publicKey, connected } = useWallet();
  const walletAddr = publicKey?.toBase58() ?? null;

  const { data: vaults, loading: vaultsLoading } = useVaults();
  const { data: claims, loading: claimsLoading } = useClaims(walletAddr);
  const { data: analytics } = useAnalytics();

  return (
    <div className="min-h-screen bg-void pt-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-1">Raven Protocol</div>
            <h1 className="font-display text-3xl tracking-tighter text-fg">Overview</h1>
          </div>
          <button
            onClick={() => onNavigate('#/app/deposit')}
            className="flex items-center gap-2 px-5 py-3 bg-accent text-void font-mono text-xs tracking-widest uppercase hover:bg-accent-bright transition-colors shrink-0"
          >
            DEPOSIT &amp; CREATE CLAIMS
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Protocol Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px border border-wire mb-10 bg-wire">
          {[
            { label: 'Total TVL', value: analytics ? `$${fmtUsdc(analytics.tvl_usdc / 1e6, 2)}` : '—' },
            { label: '24h Volume', value: analytics ? `$${fmtUsdc(analytics.total_volume_24h / 1e12, 2)}` : '—' },
            { label: 'Active Vaults', value: analytics ? String(analytics.active_vaults) : '—' },
            { label: 'Unique Wallets', value: analytics ? String(analytics.unique_wallets) : '—' },
          ].map(stat => (
            <div key={stat.label} className="bg-surface p-5">
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted mb-2">{stat.label}</div>
              <div className="font-mono text-xl text-fg">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Active Vaults */}
        <section className="mb-10" aria-labelledby="vaults-heading">
          <h2 id="vaults-heading" className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-4">
            Active Vaults
          </h2>
          <div className="bg-surface border border-wire p-4">
            {vaultsLoading ? (
              <div className="py-8 text-center font-mono text-xs text-fg-muted">Loading…</div>
            ) : (
              <VaultTable
                vaults={vaults ?? []}
                onTrade={mint => onNavigate(`#/app/trade/${mint}`)}
              />
            )}
          </div>
        </section>

        {/* Your Claims */}
        <section aria-labelledby="claims-heading">
          <h2 id="claims-heading" className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-4">
            Your Claims
          </h2>
          <WalletGate walletConnected={connected}>
            <div className="bg-surface border border-wire p-4">
              {claimsLoading ? (
                <div className="py-8 text-center font-mono text-xs text-fg-muted">Loading…</div>
              ) : (
                <PortfolioTable
                  claims={claims ?? []}
                  onTrade={mint => onNavigate(`#/app/trade/${mint}`)}
                  onSplit={pubkey => onNavigate(`#/app/split/${pubkey}`)}
                  onMerge={pubkey => onNavigate(`#/app/merge/${pubkey}`)}
                />
              )}
            </div>
          </WalletGate>
        </section>

      </div>
    </div>
  );
}


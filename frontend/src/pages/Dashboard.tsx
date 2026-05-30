import { useWallet } from '@solana/wallet-adapter-react';
import { ArrowRight } from 'lucide-react';
import { WalletGate } from '../components/app/WalletGate';
import { PortfolioTable } from '../components/app/PortfolioTable';
import { ExpiryCountdown } from '../components/app/ExpiryCountdown';
import { useVaults, useClaims, useAnalytics, useOptionVaults } from '../hooks';
import { fmtUsdc, truncAddr } from '../lib/format';
import { formatStrike, formatMicroUsdc } from '../lib/types';
import type { OptionVault } from '../lib/types';

interface Props {
  onNavigate: (hash: string) => void;
}

const MOCK_ORACLE_PRICE = 182_470_000; // $182.47 micro-USDC

function VaultCard({ vault, isOwner, onNavigate }: { vault: OptionVault; isOwner: boolean; onNavigate: (h: string) => void }) {
  return (
    <button
      onClick={() => onNavigate(`#/app/vault/${vault.pubkey}`)}
      className="w-full text-left bg-surface-2 border border-wire hover:border-accent transition-colors p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm font-semibold text-fg">{formatStrike(vault.strike)}</span>
        {isOwner && (
          <span className="font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 bg-accent/20 text-accent">
            Yours
          </span>
        )}
      </div>
      <div className="font-mono text-[10px] text-fg-muted mb-1">
        {formatMicroUsdc(vault.collateral_amount)}
      </div>
      <div className="flex items-center justify-between">
        <ExpiryCountdown expiry={vault.expiry} />
        <span className="font-mono text-[9px] text-fg-muted">{truncAddr(vault.owner_wallet)}</span>
      </div>
    </button>
  );
}

export function Dashboard({ onNavigate }: Props) {
  const { publicKey, connected } = useWallet();
  const walletAddr = publicKey?.toBase58() ?? null;

  const { data: claims, loading: claimsLoading } = useClaims(walletAddr);
  const { data: analytics } = useAnalytics();
  const { data: optionVaults, loading: vaultsLoading } = useOptionVaults();

  const longVaults = (optionVaults ?? []).filter(v => v.vault_side === 'LONG' && !v.is_settled);
  const shortVaults = (optionVaults ?? []).filter(v => v.vault_side === 'SHORT' && !v.is_settled);

  return (
    <div className="min-h-screen bg-void pt-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-1">
              Raven Protocol &nbsp;·&nbsp; SOL/USDC &nbsp;
              <span className="text-fg font-semibold">{formatMicroUsdc(MOCK_ORACLE_PRICE)}</span>
            </div>
            <h1 className="font-display text-3xl tracking-tighter text-fg">Options Markets</h1>
          </div>
          <button
            onClick={() => onNavigate('#/app/deposit')}
            className="flex items-center gap-2 px-5 py-3 bg-accent text-void font-mono text-xs tracking-widest uppercase hover:bg-accent-bright transition-colors shrink-0"
          >
            Create Vault
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Protocol Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px border border-wire mb-10 bg-wire">
          {[
            { label: 'Total TVL', value: analytics ? `$${fmtUsdc(analytics.tvl_usdc / 1e6, 2)}` : '—' },
            { label: '24h Volume', value: analytics ? `$${fmtUsdc(analytics.total_volume_24h / 1e12, 2)}` : '—' },
            { label: 'Active Vaults', value: analytics ? String(analytics.active_vaults) : String(longVaults.length + shortVaults.length) },
            { label: 'Unique Wallets', value: analytics ? String(analytics.unique_wallets) : '—' },
          ].map(stat => (
            <div key={stat.label} className="bg-surface p-5">
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted mb-2">{stat.label}</div>
              <div className="font-mono text-xl text-fg">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Two-column vault grid */}
        <div className="grid md:grid-cols-2 gap-px bg-wire border border-wire mb-10">
          {/* Long vaults */}
          <div className="bg-surface p-5">
            <h2 className="font-mono text-[10px] tracking-[0.2em] uppercase mb-1">
              <span className="text-bull">▲ Open Long Vaults</span>
            </h2>
            <div className="font-mono text-[9px] text-fg-muted mb-4">Bullish · SOL-collateralised</div>
            {vaultsLoading ? (
              <div className="py-6 text-center font-mono text-xs text-fg-muted">Loading…</div>
            ) : longVaults.length === 0 ? (
              <div className="py-6 text-center font-mono text-xs text-fg-muted border border-dashed border-wire">
                No open long vaults
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {longVaults.map(v => (
                  <VaultCard
                    key={v.pubkey}
                    vault={v}
                    isOwner={v.owner_wallet === walletAddr}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Short vaults */}
          <div className="bg-surface p-5">
            <h2 className="font-mono text-[10px] tracking-[0.2em] uppercase mb-1">
              <span className="text-bear">▼ Open Short Vaults</span>
            </h2>
            <div className="font-mono text-[9px] text-fg-muted mb-4">Bearish · USDC-collateralised</div>
            {vaultsLoading ? (
              <div className="py-6 text-center font-mono text-xs text-fg-muted">Loading…</div>
            ) : shortVaults.length === 0 ? (
              <div className="py-6 text-center font-mono text-xs text-fg-muted border border-dashed border-wire">
                No open short vaults
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {shortVaults.map(v => (
                  <VaultCard
                    key={v.pubkey}
                    vault={v}
                    isOwner={v.owner_wallet === walletAddr}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Your Positions */}
        <section aria-labelledby="positions-heading">
          <h2 id="positions-heading" className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-4">
            Your Option Positions
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

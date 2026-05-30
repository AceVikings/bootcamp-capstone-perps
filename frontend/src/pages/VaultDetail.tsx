import { useWallet } from '@solana/wallet-adapter-react';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { WalletGate } from '../components/app/WalletGate';
import { OptionTreeGraph } from '../components/app/OptionTreeGraph';
import { ExpiryCountdown } from '../components/app/ExpiryCountdown';
import { useOptionVault, useOptionNodes } from '../hooks';
import { formatStrike, formatMicroUsdc } from '../lib/types';
import { truncAddr } from '../lib/format';

interface Props {
  pubkey: string;
  onNavigate: (hash: string) => void;
}

// Placeholder oracle price until live price feed is wired
const MOCK_ORACLE_PRICE = 182_470_000; // $182.47 in micro-USDC

export function VaultDetail({ pubkey, onNavigate }: Props) {
  const { connected } = useWallet();
  const { data: vault, loading: vaultLoading, error: vaultError } = useOptionVault(pubkey);
  const { data: nodes, loading: nodesLoading } = useOptionNodes(pubkey);

  const oraclePrice = MOCK_ORACLE_PRICE;

  const pnlRaw = vault
    ? (oraclePrice - vault.strike) * (vault.collateral_amount / 1e6)
    : null;

  return (
    <div className="min-h-screen bg-void pt-20">
      <div className="max-w-6xl mx-auto px-6 lg:px-12 py-10">

        {/* Back */}
        <button
          onClick={() => onNavigate('#/app')}
          className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted hover:text-fg mb-8 transition-colors"
        >
          <ArrowLeft size={12} /> Dashboard
        </button>

        <WalletGate walletConnected={connected}>
          {vaultLoading && (
            <div className="py-16 text-center font-mono text-xs text-fg-muted">Loading vault…</div>
          )}

          {vaultError && !vaultLoading && (
            <div className="py-16 text-center font-mono text-xs text-bear">{vaultError}</div>
          )}

          {vault && (
            <>
              {/* Header panel */}
              <div className="bg-surface border border-wire p-6 mb-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span
                        className={`font-mono text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 border ${
                          vault.vault_side === 'LONG'
                            ? 'border-bull text-bull bg-bull/10'
                            : 'border-bear text-bear bg-bear/10'
                        }`}
                      >
                        {vault.vault_side}
                      </span>
                      <span className="font-mono text-[10px] text-fg-muted tracking-widest uppercase">
                        Vault #{vault.vault_id}
                      </span>
                    </div>
                    <h1 className="font-display text-2xl tracking-tighter text-fg mt-1">
                      Strike {formatStrike(vault.strike)}
                    </h1>
                  </div>

                  <div className="flex gap-3">
                    {!vault.is_settled && (
                      <button
                        onClick={() => onNavigate(`#/app/trade/${vault.root_mint}`)}
                        className="flex items-center gap-2 px-4 py-2 border border-accent text-accent font-mono text-[10px] tracking-widest uppercase hover:bg-accent/10 transition-colors"
                      >
                        Trade <ArrowRight size={10} />
                      </button>
                    )}
                    {vault.is_settled && (
                      <button
                        onClick={() => onNavigate(`#/app/settle/${pubkey}`)}
                        className="flex items-center gap-2 px-4 py-2 bg-bear text-void font-mono text-[10px] tracking-widest uppercase hover:opacity-90 transition-opacity"
                      >
                        Settle
                      </button>
                    )}
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-wire border border-wire">
                  {[
                    {
                      label: 'Strike',
                      value: formatStrike(vault.strike),
                    },
                    {
                      label: 'Oracle Price',
                      value: formatMicroUsdc(oraclePrice),
                    },
                    {
                      label: 'Collateral',
                      value: formatMicroUsdc(vault.collateral_amount),
                    },
                    {
                      label: 'Expires',
                      value: <ExpiryCountdown expiry={vault.expiry} />,
                    },
                  ].map(s => (
                    <div key={s.label} className="bg-surface p-4">
                      <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-fg-muted mb-1">{s.label}</div>
                      <div className="font-mono text-sm text-fg">{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* P&L */}
                {pnlRaw !== null && (
                  <div className="mt-3 font-mono text-xs text-fg-muted">
                    Unrealised P&amp;L:&nbsp;
                    <span className={pnlRaw >= 0 ? 'text-bull' : 'text-bear'}>
                      {pnlRaw >= 0 ? '+' : ''}{formatMicroUsdc(pnlRaw)}
                    </span>
                    &nbsp;·&nbsp;
                    <a
                      href={`https://explorer.solana.com/address/${pubkey}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:text-accent-bright inline-flex items-center gap-1"
                    >
                      {truncAddr(pubkey)} <ExternalLink size={10} />
                    </a>
                  </div>
                )}
              </div>

              {/* Option tree */}
              <div className="bg-surface border border-wire p-6 mb-6">
                <h2 className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-4">
                  Option Tree
                </h2>
                {nodesLoading ? (
                  <div className="py-8 text-center font-mono text-xs text-fg-muted">Loading tree…</div>
                ) : (
                  <OptionTreeGraph
                    vault={vault}
                    nodes={nodes ?? []}
                    oraclePrice={oraclePrice}
                    onNodeClick={node => {
                      if (node) onNavigate(`#/app/trade/${node.long_child_mint}`);
                      else onNavigate(`#/app/trade/${vault.root_mint}`);
                    }}
                  />
                )}
              </div>

              {/* Settlement status */}
              {vault.is_settled && vault.settlement_price !== null && (
                <div className="bg-surface border border-bear p-5">
                  <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-bear mb-2">
                    Settled
                  </div>
                  <div className="font-mono text-sm text-fg">
                    Final price: {formatMicroUsdc(vault.settlement_price)}
                  </div>
                  <button
                    onClick={() => onNavigate(`#/app/settle/${pubkey}`)}
                    className="mt-3 font-mono text-[10px] tracking-widest uppercase text-bear hover:text-fg transition-colors"
                  >
                    → Claim settlement
                  </button>
                </div>
              )}
            </>
          )}
        </WalletGate>
      </div>
    </div>
  );
}

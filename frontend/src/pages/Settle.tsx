import { useWallet } from '@solana/wallet-adapter-react';
import { ArrowLeft } from 'lucide-react';
import { WalletGate } from '../components/app/WalletGate';
import { ExpiryCountdown } from '../components/app/ExpiryCountdown';
import { IntrinsicValue } from '../components/app/IntrinsicValue';
import { useOptionVault, useOptionNodes } from '../hooks';
import { formatStrike, formatMicroUsdc } from '../lib/types';
import { getNodeType } from '../lib/options';
import { truncAddr } from '../lib/format';

interface Props {
  pubkey: string;
  onNavigate: (hash: string) => void;
}

const MOCK_ORACLE_PRICE = 182_470_000;

export function Settle({ pubkey, onNavigate }: Props) {
  const { connected } = useWallet();
  const { data: vault, loading: vaultLoading } = useOptionVault(pubkey);
  const { data: nodes, loading: nodesLoading } = useOptionNodes(pubkey);

  const settledPrice = vault?.settlement_price ?? MOCK_ORACLE_PRICE;
  const nodesArr = nodes ?? [];

  return (
    <div className="min-h-screen bg-void pt-20">
      <div className="max-w-3xl mx-auto px-6 lg:px-12 py-10">

        {/* Back */}
        <button
          onClick={() => onNavigate(vault ? `#/app/vault/${pubkey}` : '#/app')}
          className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted hover:text-fg mb-8 transition-colors"
        >
          <ArrowLeft size={12} /> {vault ? 'Vault' : 'Dashboard'}
        </button>

        <WalletGate walletConnected={connected}>
          {(vaultLoading || nodesLoading) && (
            <div className="py-16 text-center font-mono text-xs text-fg-muted">Loading settlement data…</div>
          )}

          {!vaultLoading && vault && (
            <>
              {/* Header */}
              <div className="mb-8">
                <h1 className="font-display text-3xl tracking-tighter text-fg mb-2">
                  Settle Vault
                </h1>
                <div className="flex flex-wrap gap-4 font-mono text-xs text-fg-muted">
                  <span>Strike: {formatStrike(vault.strike)}</span>
                  <span>·</span>
                  <span>
                    <ExpiryCountdown expiry={vault.expiry} />
                  </span>
                  <span>·</span>
                  <span>{truncAddr(pubkey)}</span>
                </div>
              </div>

              {/* Settlement price */}
              <div className="bg-surface border border-wire p-5 mb-6">
                <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-fg-muted mb-1">
                  Oracle settlement price
                </div>
                <div className="font-mono text-2xl text-fg">
                  {vault.settlement_price !== null
                    ? formatMicroUsdc(vault.settlement_price)
                    : '—'}
                </div>
                {!vault.is_settled && (
                  <div className="mt-2 font-mono text-[10px] text-fg-muted">
                    Vault has not been settled on-chain yet. Settlement price will be locked by the oracle.
                  </div>
                )}
              </div>

              {/* Node list */}
              {nodesArr.length === 0 ? (
                <div className="py-8 text-center font-mono text-xs text-fg-muted border border-wire">
                  No option nodes found for this vault.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {nodesArr.map(node => {
                    const type = getNodeType(true, vault.vault_side);
                    const backing = node.long_backing;

                    return (
                      <div key={node.pubkey} className="bg-surface border border-wire p-5">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <div className="font-mono text-xs font-semibold text-fg mb-1">
                              {type}({formatStrike(node.child_strike)})
                            </div>
                            <div className="font-mono text-[10px] text-fg-muted">
                              {truncAddr(node.long_child_mint)}
                            </div>
                          </div>
                          <IntrinsicValue
                            nodeType={type}
                            strike={node.child_strike}
                            backing={backing}
                            oraclePrice={settledPrice}
                            vaultSide={vault.vault_side}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-px bg-wire mb-4">
                          <div className="bg-surface-2 p-3">
                            <div className="font-mono text-[9px] uppercase text-fg-muted mb-0.5">Backing</div>
                            <div className="font-mono text-xs text-fg">{formatMicroUsdc(backing)}</div>
                          </div>
                          <div className="bg-surface-2 p-3">
                            <div className="font-mono text-[9px] uppercase text-fg-muted mb-0.5">Depth</div>
                            <div className="font-mono text-xs text-fg">{node.depth}</div>
                          </div>
                        </div>

                        <button
                          disabled={!vault.is_settled}
                          className={[
                            'w-full py-2.5 font-mono text-[10px] tracking-[0.2em] uppercase transition-colors',
                            vault.is_settled
                              ? 'bg-bull text-void hover:opacity-90 cursor-pointer'
                              : 'bg-surface-2 text-fg-muted cursor-not-allowed border border-wire',
                          ].join(' ')}
                          title={!vault.is_settled ? 'Vault must be settled on-chain first' : undefined}
                        >
                          {vault.is_settled ? `Settle ${type} tokens` : 'Awaiting settlement'}
                        </button>
                      </div>
                    );
                  })}

                  {vault.is_settled && nodesArr.length > 1 && (
                    <button className="w-full py-3 font-mono text-[10px] tracking-[0.2em] uppercase bg-bull text-void hover:opacity-90 transition-opacity">
                      Settle All
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </WalletGate>
      </div>
    </div>
  );
}

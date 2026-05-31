import { useWallet } from '@solana/wallet-adapter-react';
import { WalletGate } from '../components/app/WalletGate';
import { ExpiryCountdown } from '../components/app/ExpiryCountdown';
import { IntrinsicValue } from '../components/app/IntrinsicValue';
import { useOptionVaults, useOptionPositions } from '../hooks';
import { truncAddr } from '../lib/format';
import { formatStrike, formatMicroUsdc } from '../lib/types';
import { getNodeType } from '../lib/options';

interface Props {
  onNavigate: (hash: string) => void;
}

const MOCK_ORACLE_PRICE = 182_470_000;

export function Portfolio({ onNavigate }: Props) {
  const { connected, publicKey } = useWallet();
  const walletAddr = publicKey?.toBase58() ?? null;

  const { data: optVaults, loading: vaultsLoading } = useOptionVaults(walletAddr);
  const { data: positions, loading: positionsLoading } = useOptionPositions(walletAddr);

  const oraclePrice = MOCK_ORACLE_PRICE;

  return (
    <div className="min-h-screen bg-void pt-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">

        <WalletGate walletConnected={connected}>

          {/* My Vaults */}
          <section className="mb-10" aria-labelledby="vaults-heading">
            <h2 id="vaults-heading" className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-4">
              My Vaults
            </h2>
            <div className="bg-surface border border-wire p-4">
              {vaultsLoading ? (
                <div className="py-8 text-center font-mono text-xs text-fg-muted">Loading…</div>
              ) : !optVaults || optVaults.length === 0 ? (
                <div className="py-12 text-center font-mono text-xs text-fg-muted border border-dashed border-wire">
                  No vaults —{' '}
                  <button onClick={() => onNavigate('#/app/deposit')} className="text-accent hover:text-accent-bright transition-colors">
                    create one
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" aria-label="My option vaults">
                    <thead>
                      <tr className="border-b border-wire">
                        {['ID', 'Side', 'Strike', 'Expires', 'Collateral', 'Status'].map(h => (
                          <th key={h} className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted py-3 pr-4 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {optVaults.map(v => (
                        <tr
                          key={v.pubkey}
                          className="border-b border-wire/40 hover:bg-surface-2/30 transition-colors cursor-pointer"
                          onClick={() => onNavigate(`#/app/vault/${v.pubkey}`)}
                        >
                          <td className="font-mono text-fg-muted py-3 pr-4">#{v.vault_id}</td>
                          <td className="py-3 pr-4">
                            <span className={`font-mono text-[9px] tracking-widest uppercase ${v.vault_side === 'LONG' ? 'text-bull' : 'text-bear'}`}>
                              {v.vault_side}
                            </span>
                          </td>
                          <td className="font-mono text-fg py-3 pr-4">{formatStrike(v.strike)}</td>
                          <td className="py-3 pr-4"><ExpiryCountdown expiry={v.expiry} /></td>
                          <td className="font-mono text-fg py-3 pr-4">{formatMicroUsdc(v.collateral_amount)}</td>
                          <td className="py-3 pr-4">
                            {v.is_settled ? (
                              <button
                                onClick={e => { e.stopPropagation(); onNavigate(`#/app/settle/${v.pubkey}`); }}
                                className="font-mono text-[9px] tracking-widest uppercase text-bear hover:text-fg transition-colors"
                              >
                                Settle
                              </button>
                            ) : (
                              <span className="font-mono text-[9px] tracking-widest uppercase text-bull">Active</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* My Positions */}
          <section className="mb-10" aria-labelledby="positions-heading">
            <h2 id="positions-heading" className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-4">
              My Positions
            </h2>
            <div className="bg-surface border border-wire p-4">
              {positionsLoading ? (
                <div className="py-8 text-center font-mono text-xs text-fg-muted">Loading…</div>
              ) : !positions || positions.length === 0 ? (
                <div className="py-12 text-center font-mono text-xs text-fg-muted border border-dashed border-wire">
                  No option positions
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" aria-label="My option positions">
                    <thead>
                      <tr className="border-b border-wire">
                        {['Mint', 'Type', 'Strike', 'Status', 'Backing', 'Intrinsic Value', 'Action'].map(h => (
                          <th key={h} className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted py-3 pr-4 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map(node => {
                        const type = getNodeType(true, node.vault_side);
                        const strikeUsd = node.child_strike / 1e6;
                        const oraclePriceUsd = oraclePrice / 1e6;
                        const isCall = type === 'CALL' || type === 'CAP';
                        const isPut  = type === 'PUT'  || type === 'FLOOR';
                        const itm = isCall ? oraclePriceUsd > strikeUsd : isPut ? oraclePriceUsd < strikeUsd : null;
                        const atm = Math.abs(oraclePriceUsd - strikeUsd) / oraclePriceUsd < 0.015;
                        const statusLabel = atm ? 'ATM' : itm === true ? 'ITM' : itm === false ? 'OTM' : '—';
                        const statusCls = atm
                          ? 'text-accent bg-accent/10'
                          : itm === true
                          ? 'text-bull bg-bull/10'
                          : itm === false
                          ? 'text-bear bg-bear/10'
                          : 'text-fg-muted';
                        return (
                          <tr key={node.pubkey} className="border-b border-wire/40">
                            <td className="font-mono text-fg-muted py-3 pr-4" title={node.long_child_mint}>{truncAddr(node.long_child_mint)}</td>
                            <td className="font-mono text-fg py-3 pr-4">{type}</td>
                            <td className="font-mono text-fg py-3 pr-4">{formatStrike(node.child_strike)}</td>
                            <td className="py-3 pr-4">
                              <span className={`font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 ${statusCls}`}>{statusLabel}</span>
                            </td>
                            <td className="font-mono text-fg py-3 pr-4">{formatMicroUsdc(node.long_backing)}</td>
                            <td className="py-3 pr-4">
                              <IntrinsicValue
                                nodeType={type}
                                strike={node.child_strike}
                                backing={node.long_backing}
                                oraclePrice={oraclePrice}
                                vaultSide={node.vault_side}
                              />
                            </td>
                            <td className="py-3 pr-4">
                              <button
                                onClick={() => onNavigate(`#/app/settle/${node.vault_pubkey}`)}
                                className="font-mono text-[9px] tracking-widest uppercase text-bear hover:text-fg transition-colors"
                              >
                                Settle
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>



        </WalletGate>
      </div>
    </div>
  );
}


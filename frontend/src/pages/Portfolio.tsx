import { useState, useEffect, useMemo } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { ArrowRight, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { ExpiryCountdown } from '../components/app/ExpiryCountdown';
import { useOptionVaults } from '../hooks';
import { formatStrike, formatMicroUsdc } from '../lib/types';
import { deriveShortMint } from '../lib/anchor';

interface Props {
  onNavigate: (hash: string) => void;
}

// Mock oracle price used for ITM/OTM display ($182.47)
const MOCK_ORACLE_USD = 182.47;

/** Fetch all SPL token balances for a wallet in one RPC call. */
async function fetchAllTokenBalances(wallet: string): Promise<Map<string, number>> {
  const rpcUrl = import.meta.env.VITE_RPC_URL ?? 'https://api.devnet.solana.com';
  const conn = new Connection(rpcUrl, 'confirmed');
  const map = new Map<string, number>();
  try {
    const owner = new PublicKey(wallet);
    const accounts = await conn.getParsedTokenAccountsByOwner(owner, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    });
    for (const { account } of accounts.value) {
      const info = account.data.parsed.info;
      const mint: string = info.mint;
      const amt: number = Number(info.tokenAmount.uiAmount ?? 0);
      if (amt > 0) map.set(mint, amt);
    }
  } catch { /* network error, return empty */ }
  return map;
}

type Moneyness = 'ITM' | 'ATM' | 'OTM';

function moneyness(side: 'CALL' | 'PUT' | string, strikeUsd: number, oracle: number): Moneyness {
  const diff = Math.abs(oracle - strikeUsd) / oracle;
  if (diff < 0.015) return 'ATM';
  if (side === 'CALL') return oracle > strikeUsd ? 'ITM' : 'OTM';
  if (side === 'PUT')  return oracle < strikeUsd ? 'ITM' : 'OTM';
  return 'OTM';
}

function MoneynessTag({ status }: { status: Moneyness }) {
  return (
    <span className={`font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 ${
      status === 'ITM' ? 'bg-bull/10 text-bull' :
      status === 'ATM' ? 'bg-accent/10 text-accent' :
                         'bg-bear/10 text-bear'
    }`}>
      {status}
    </span>
  );
}

export function Portfolio({ onNavigate }: Props) {
  const { connected, publicKey } = useWallet();
  const walletAddr = publicKey?.toBase58() ?? null;

  // Option vaults owned by the user (indexed by backend)
  const { data: optVaults, loading: vaultsLoading, refetch } = useOptionVaults(walletAddr);

  // On-chain token balances (keyed by mint pubkey)
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [balancesLoading, setBalancesLoading] = useState(false);

  useEffect(() => {
    if (!walletAddr) { setBalances(new Map()); return; }
    setBalancesLoading(true);
    fetchAllTokenBalances(walletAddr).then(map => {
      setBalances(map);
      setBalancesLoading(false);
    });
  }, [walletAddr]);

  // Derive the short_mint for each vault from its on-chain PDA.
  // The backend only stores root_mint (= long_mint = CALL/CAP); FLOOR/PUT must be derived.
  const vaultShortMints = useMemo(() => {
    const map = new Map<string, string>(); // vault pubkey → short_mint pubkey
    for (const v of (optVaults ?? [])) {
      try {
        map.set(v.pubkey, deriveShortMint(new PublicKey(v.pubkey)).toBase58());
      } catch { /* invalid pubkey — skip */ }
    }
    return map;
  }, [optVaults]);

  // Build a mint → { tokenType, vault } lookup for labelling in "All Holdings"
  const mintTypeMap = useMemo(() => {
    const map = new Map<string, { type: string; vault: typeof optVaults extends null ? never : NonNullable<typeof optVaults>[number] }>();
    for (const v of (optVaults ?? [])) {
      const isLong = v.vault_side === 'LONG';
      const longKind  = isLong ? 'CALL'  : 'CAP';
      const shortKind = isLong ? 'FLOOR' : 'PUT';
      const lm = v.long_mint || v.root_mint;
      const sm = vaultShortMints.get(v.pubkey) ?? '';
      if (lm) map.set(lm, { type: longKind, vault: v });
      if (sm) map.set(sm, { type: shortKind, vault: v });
    }
    return map;
  }, [optVaults, vaultShortMints]);

  // Derived: vaults where the user still holds some tokens (long OR short)
  const activeVaults = (optVaults ?? []).filter(v => {
    const lm = v.long_mint || v.root_mint;
    const sm = vaultShortMints.get(v.pubkey) ?? '';
    return (balances.get(lm) ?? 0) > 0 || (sm && (balances.get(sm) ?? 0) > 0);
  });

  // All mints the user holds that belong to the protocol (identified via mintTypeMap)
  const heldProtocolMints = [...balances.entries()].filter(([m]) => mintTypeMap.has(m));

  const isLoading = vaultsLoading || balancesLoading;

  if (!connected) {
    return (
      <div className="min-h-screen bg-void pt-20 flex items-center justify-center">
        <div className="text-center">
          <p className="font-mono text-sm text-fg-muted mb-6">Connect your wallet to view positions</p>
          <WalletMultiButton className="!font-mono !text-xs !tracking-widest !uppercase" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void pt-20">
      <div className="max-w-5xl mx-auto px-6 lg:px-12 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px w-8 bg-accent" />
              <span className="font-mono text-xs tracking-[0.25em] uppercase text-fg/65">Raven Protocol</span>
            </div>
            <h1 className="font-display text-3xl leading-none tracking-tighter text-fg">Portfolio</h1>
            {walletAddr && (
              <p className="font-mono text-[10px] text-fg-muted mt-1">
                {walletAddr.slice(0, 8)}…{walletAddr.slice(-6)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { refetch(); if (walletAddr) fetchAllTokenBalances(walletAddr).then(setBalances); }}
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg transition-colors"
            >
              <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => onNavigate('#/app/deposit')}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-void font-mono text-xs tracking-widest uppercase hover:bg-accent-bright transition-colors"
            >
              MINT NEW <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 flex items-center justify-center gap-3 text-fg-muted">
            <Loader2 size={18} className="animate-spin" />
            <span className="font-mono text-xs">Loading positions…</span>
          </div>
        ) : (

          <>
            {/* ── Minted Positions ─────────────────────────────────────────── */}
            <section className="mb-8">
              <h2 className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-4">
                Minted Positions
                <span className="ml-2 text-fg/40">({activeVaults.length})</span>
              </h2>

              {activeVaults.length === 0 ? (
                <div className="border border-dashed border-wire p-10 text-center">
                  <p className="font-mono text-xs text-fg-muted mb-4">No active option positions</p>
                  <button
                    onClick={() => onNavigate('#/app/deposit')}
                    className="font-mono text-xs text-accent hover:text-accent-bright transition-colors"
                  >
                    Mint your first option tokens →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeVaults.map(v => {
                    const strikeUsd    = (v.strike ?? 0) / 1_000_000;
                    // long_mint normalised from root_mint in fetchVaults
                    const longMintAddr  = v.long_mint  || v.root_mint;
                    // short_mint derived on-chain from vault PDA (not stored in DB)
                    const shortMintAddr = vaultShortMints.get(v.pubkey) ?? v.short_mint ?? '';
                    const longBal       = balances.get(longMintAddr)  ?? 0;
                    const shortBal      = shortMintAddr ? (balances.get(shortMintAddr) ?? 0) : 0;
                    const isLong       = v.vault_side === 'LONG';
                    const longName     = isLong ? 'CALL' : 'CAP';
                    const shortName    = isLong ? 'FLOOR' : 'PUT';
                    const primarySide  = isLong ? 'CALL' : 'PUT';
                    const mm           = moneyness(primarySide, strikeUsd, MOCK_ORACLE_USD);
                    const isExpired    = v.expiry ? new Date(v.expiry as string) < new Date() : false;

                    return (
                      <div key={v.pubkey} className="border border-wire bg-surface hover:border-accent/30 transition-colors">
                        {/* Vault header */}
                        <div className="px-4 py-3 border-b border-wire/50 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`font-mono text-[9px] tracking-widest uppercase ${isLong ? 'text-bull' : 'text-bear'}`}>
                              {isLong ? 'LONG' : 'SHORT'}
                            </span>
                            <span className="font-mono text-sm text-fg">${strikeUsd.toFixed(0)} Strike</span>
                            <MoneynessTag status={mm} />
                            {isExpired && (
                              <span className="font-mono text-[9px] tracking-widest uppercase text-bear bg-bear/10 px-1.5 py-0.5">
                                EXPIRED
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <ExpiryCountdown expiry={v.expiry ?? ''} />
                            <a
                              href={`https://explorer.solana.com/address/${v.pubkey}?cluster=devnet`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-fg-muted hover:text-fg transition-colors"
                              title="View on explorer"
                            >
                              <ExternalLink size={12} />
                            </a>
                          </div>
                        </div>

                        {/* Token balances */}
                        <div className="px-4 py-3 grid grid-cols-2 gap-4">
                          {/* Long side token */}
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-mono text-[9px] uppercase tracking-widest text-fg-muted mb-0.5">{longName} Token</div>
                              <div className="font-mono text-xs text-fg-muted" title={longMintAddr}>{longMintAddr.slice(0, 12)}…</div>
                            </div>
                            <div className="text-right">
                              {longBal > 0 ? (
                                <>
                                  <div className="font-mono text-sm font-medium text-bull">{longBal.toFixed(4)}</div>
                                  <div className="font-mono text-[10px] text-fg-muted">tokens</div>
                                </>
                              ) : (
                                <div className="font-mono text-xs text-fg-muted">—</div>
                              )}
                            </div>
                          </div>

                          {/* Short side token */}
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-mono text-[9px] uppercase tracking-widest text-fg-muted mb-0.5">{shortName} Token</div>
                              <div className="font-mono text-xs text-fg-muted" title={shortMintAddr}>{shortMintAddr ? `${shortMintAddr.slice(0, 12)}…` : 'N/A'}</div>
                            </div>
                            <div className="text-right">
                              {shortBal > 0 ? (
                                <>
                                  <div className="font-mono text-sm font-medium text-accent">{shortBal.toFixed(4)}</div>
                                  <div className="font-mono text-[10px] text-fg-muted">tokens</div>
                                </>
                              ) : (
                                <div className="font-mono text-xs text-fg-muted">—</div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Collateral & actions */}
                        <div className="px-4 py-2.5 border-t border-wire/30 bg-surface-2/40 flex items-center justify-between">
                          <div className="flex items-center gap-4 font-mono text-[10px] text-fg-muted">
                            <span>Collateral: <span className="text-fg">{formatMicroUsdc(v.collateral_amount)}</span></span>
                            {strikeUsd > 0 && (
                              <span>Strike: <span className="text-fg">{formatStrike(v.strike ?? 0)}</span></span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {longBal > 0 && (
                              <button
                                onClick={() => onNavigate(`#/app/split/${longMintAddr}`)}
                                className="font-mono text-[9px] tracking-widest uppercase text-accent hover:text-accent-bright transition-colors"
                              >
                                Split {longName}
                              </button>
                            )}
                            {longBal > 0 && (
                              <button
                                onClick={() => onNavigate(`#/app/trade/${longMintAddr}`)}
                                className="font-mono text-[9px] tracking-widest uppercase text-fg-muted hover:text-fg transition-colors"
                              >
                                Trade {longName}
                              </button>
                            )}
                            {shortBal > 0 && shortMintAddr && (
                              <button
                                onClick={() => onNavigate(`#/app/trade/${shortMintAddr}`)}
                                className="font-mono text-[9px] tracking-widest uppercase text-fg-muted hover:text-fg transition-colors"
                              >
                                Trade {shortName}
                              </button>
                            )}
                            {isExpired && (
                              <button
                                onClick={() => onNavigate(`#/app/settle/${v.pubkey}`)}
                                className="font-mono text-[9px] tracking-widest uppercase text-bear hover:text-fg transition-colors"
                              >
                                Settle
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── All Protocol Token Holdings ──────────────────────────────── */}
            {heldProtocolMints.length > 0 && (
              <section className="mb-8">
                <h2 className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-4">
                  All Option Token Holdings
                  <span className="ml-2 text-fg/40">({heldProtocolMints.length})</span>
                </h2>
                <div className="border border-wire bg-surface overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-wire">
                        {['Type', 'Strike', 'Mint', 'Balance', 'Actions'].map(h => (
                          <th key={h} className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted py-3 px-4 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heldProtocolMints.map(([mint, bal]) => {
                        const info = mintTypeMap.get(mint);
                        const tokenType = info?.type ?? '—';
                        const strikeUsd = info ? (info.vault.strike ?? 0) / 1_000_000 : null;
                        const typeCls =
                          tokenType === 'CALL' ? 'text-bull' :
                          tokenType === 'PUT'  ? 'text-bear' :
                          tokenType === 'FLOOR' ? 'text-accent' :
                          tokenType === 'CAP'   ? 'text-bull' : 'text-fg-muted';
                        const isCallOrCap = tokenType === 'CALL' || tokenType === 'CAP';
                        return (
                        <tr key={mint} className="border-b border-wire/40 hover:bg-surface-2/30 transition-colors">
                          <td className="py-3 px-4">
                            <span className={`font-mono text-[9px] tracking-widest uppercase font-medium ${typeCls}`}>
                              {tokenType}
                            </span>
                          </td>
                          <td className="font-mono text-fg py-3 px-4">
                            {strikeUsd != null ? `$${strikeUsd.toFixed(0)}` : '—'}
                          </td>
                          <td className="font-mono text-fg-muted py-3 px-4" title={mint}>
                            {mint.slice(0, 12)}…
                          </td>
                          <td className="font-mono text-fg py-3 px-4">{bal.toFixed(4)}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => onNavigate(`#/app/trade/${mint}`)}
                                className="font-mono text-[9px] tracking-widest uppercase text-accent hover:text-accent-bright transition-colors"
                              >
                                Trade
                              </button>
                              {isCallOrCap && (
                                <button
                                  onClick={() => onNavigate(`#/app/split/${mint}`)}
                                  className="font-mono text-[9px] tracking-widest uppercase text-fg-muted hover:text-fg transition-colors"
                                >
                                  Split
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
              </section>
            )}

            {/* ── Empty state ───────────────────────────────────────────────── */}
            {activeVaults.length === 0 && heldProtocolMints.length === 0 && !isLoading && (
              <div className="py-16 text-center border border-dashed border-wire">
                <p className="font-mono text-sm text-fg-muted mb-2">No option tokens in this wallet</p>
                <p className="font-mono text-xs text-fg-muted/70 mb-6">
                  Mint options or buy tokens on the orderbook to see them here
                </p>
                <button
                  onClick={() => onNavigate('#/app/deposit')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-void font-mono text-xs tracking-widest uppercase hover:bg-accent-bright transition-colors"
                >
                  MINT FIRST OPTIONS <ArrowRight size={12} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

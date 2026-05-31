import { useState, useCallback, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  ChevronDown, ArrowRight, CheckCircle2, ExternalLink,
  AlertCircle, Droplets, Loader2,
} from 'lucide-react';
import {
  buildSetMockOraclePriceTx,
  buildCreateRootVaultTx,
  getAta,
} from '../lib/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { MARKETS, USDC_MINT, WSOL_MINT, STRIKES_USD, EXPIRY_DAYS } from '../lib/constants';
import { api } from '../lib/api';

const MINT_FEE_BPS = 10; // 0.10 %

const EXPIRY_LABELS: Record<number, string> = { 2: '2d', 4: '4d', 6: '6d', 8: '8d', 10: '10d' };

// ─── Collateral config per option type ────────────────────────────────────────
// CALL: wSOL collateral (9 dec) — payout = max(P-K,0)/P × wSOL → bounded ≤ 1 wSOL
// PUT:  USDC collateral (6 dec) — payout = max(K-P,0)/K × USDC → bounded ≤ K USDC
const COLLATERAL: Record<'CALL' | 'PUT', {
  mint:     string;
  decimals: number;
  symbol:   string;
  decimalsMultiplier: number;
  faucetAmount: number;   // human-readable units shown in UI
  faucetToken: 'WSOL' | 'USDC';
}> = {
  CALL: {
    mint:     WSOL_MINT,
    decimals: 9,
    symbol:   'wSOL',
    decimalsMultiplier: 1_000_000_000,
    faucetAmount: 10,
    faucetToken: 'WSOL',
  },
  PUT: {
    mint:     USDC_MINT,
    decimals: 6,
    symbol:   'USDC',
    decimalsMultiplier: 1_000_000,
    faucetAmount: 1_000,
    faucetToken: 'USDC',
  },
};

interface Props { onNavigate: (hash: string) => void; }

interface MintResult {
  signature: string;
  longMint:  string;
  shortMint: string;
  strikeUsd: number;
  expiryDays: number;
  side: 'CALL' | 'PUT';
  collateralSymbol: string;
}

export function Deposit({ onNavigate }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();

  // ── Form state ────────────────────────────────────────────────────────────
  const [market,     setMarket]     = useState(MARKETS[2]);
  const [assetOpen,  setAssetOpen]  = useState(false);
  const [strikeUsd,  setStrikeUsd]  = useState(STRIKES_USD[6]); // $180
  const [expiryDays, setExpiryDays] = useState(EXPIRY_DAYS[0]);
  const [side,       setSide]       = useState<'CALL' | 'PUT'>('CALL');
  const [amount,     setAmount]     = useState('');

  // ── Tx state ──────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [result,     setResult]     = useState<MintResult | null>(null);

  // ── Balance / faucet ─────────────────────────────────────────────────────
  const [balance,        setBalance]        = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [fauceting,      setFauceting]      = useState(false);
  const [faucetSig,      setFaucetSig]      = useState<string | null>(null);

  const col = COLLATERAL[side]; // shorthand for current collateral config

  // Fetch the balance of the collateral token for the current side
  const fetchBalance = useCallback(async () => {
    if (!wallet.publicKey) return;
    setBalanceLoading(true);
    try {
      const ata  = getAta(new PublicKey(col.mint), wallet.publicKey);
      const info = await connection.getTokenAccountBalance(ata).catch(() => null);
      setBalance(info ? parseFloat(info.value.uiAmountString ?? '0') : 0);
    } finally {
      setBalanceLoading(false);
    }
  }, [connection, wallet.publicKey, col.mint]);

  // Re-fetch whenever side or wallet changes
  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      setBalance(null); // clear stale balance immediately
      fetchBalance();
    } else {
      setBalance(null);
    }
    setFaucetSig(null); // clear faucet success when switching sides
  }, [wallet.connected, wallet.publicKey, fetchBalance, side]);

  const handleFaucet = useCallback(async () => {
    if (!wallet.publicKey) return;
    setError(null); setFaucetSig(null); setFauceting(true);
    try {
      const res = await api.faucet(wallet.publicKey.toBase58(), col.faucetToken);
      setFaucetSig(res.signature);
      await fetchBalance();
    } catch (e) {
      setError(`Faucet error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFauceting(false);
    }
  }, [wallet.publicKey, col.faucetToken, fetchBalance]);

  const amountNum = parseFloat(amount) || 0;
  const fee = (amountNum * MINT_FEE_BPS) / 10_000;
  const net = amountNum - fee;

  const insufficientBalance =
    wallet.connected && balance !== null && !balanceLoading &&
    (balance === 0 || (amountNum > 0 && amountNum > balance));

  const showFaucet = insufficientBalance && !fauceting && !faucetSig;

  const longLabel  = side === 'CALL' ? 'CALL' : 'CAP';
  const shortLabel = side === 'CALL' ? 'FLOOR' : 'PUT';
  const vaultSideNum = side === 'CALL' ? 0 : 1;

  function parseError(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes('0xbc4') || raw.includes('AccountNotInitialized'))
      return `${col.symbol} account not found. Use the faucet to initialise it.`;
    if (raw.includes('0x1') || raw.toLowerCase().includes('insufficient funds'))
      return `Insufficient ${col.symbol} (have ${balance ?? 0}). Use the faucet.`;
    if (raw.toLowerCase().includes('user rejected') || raw.toLowerCase().includes('rejected the request'))
      return 'Transaction cancelled in wallet.';
    if (raw.includes('Blockhash not found') || raw.toLowerCase().includes('blockhash'))
      return 'Transaction expired. Please try again.';
    return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
  }

  async function sendAndVerify(
    signed: Parameters<typeof connection.sendRawTransaction>[0],
    label:  string
  ): Promise<string> {
    const sig = await connection.sendRawTransaction(signed, { skipPreflight: true });
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    const tx = await connection.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (!tx) throw new Error(`${label}: not found on-chain after confirmation`);
    if (tx.meta?.err) throw new Error(`${label} failed: ${JSON.stringify(tx.meta.err)}`);
    return sig;
  }

  const handleMint = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) {
      setError('Connect your wallet first.'); return;
    }
    if (amountNum <= 0) { setError(`Enter a valid ${col.symbol} amount.`); return; }
    setError(null); setSubmitting(true);

    try {
      const anchorWallet  = wallet as unknown as AnchorWallet;
      const oraclePubkey  = new PublicKey(market.oracle);
      const collateralMintPk = new PublicKey(col.mint);

      // 1. Refresh mock oracle
      const oracleTx = await buildSetMockOraclePriceTx(
        connection, anchorWallet, oraclePubkey, new BN(market.mockPriceUsd)
      );
      await sendAndVerify((await wallet.signTransaction(oracleTx)).serialize(), 'Oracle update');

      // 2. Amount in smallest token units (9 dec for wSOL, 6 dec for USDC)
      const collateralUnits = new BN(Math.floor(amountNum * col.decimalsMultiplier));
      const vaultId         = new BN(Date.now() % 2 ** 31);
      const strikeMicro     = new BN(strikeUsd * 1_000_000);
      const expiryTs        = new BN(Math.floor(Date.now() / 1000) + expiryDays * 86_400);

      const { tx: vaultTx, longMint, shortMint } = await buildCreateRootVaultTx(
        connection, anchorWallet,
        vaultId, market.feedId, oraclePubkey,
        collateralUnits, strikeMicro, expiryTs, vaultSideNum,
        collateralMintPk
      );
      const vaultSig = await sendAndVerify(
        (await wallet.signTransaction(vaultTx)).serialize(),
        'Mint option tokens'
      );

      setResult({
        signature: vaultSig,
        longMint:  longMint.toBase58(),
        shortMint: shortMint.toBase58(),
        strikeUsd,
        expiryDays,
        side,
        collateralSymbol: col.symbol,
      });
    } catch (e) {
      setError(parseError(e));
    } finally {
      setSubmitting(false);
    }
  }, [wallet, connection, amountNum, market, strikeUsd, expiryDays, side, col, vaultSideNum]);

  // ── Success screen ────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="min-h-screen bg-void pt-20 flex items-start justify-center px-4">
        <div className="mt-16 w-full max-w-lg border border-accent/40 bg-surface p-8">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 size={24} className="text-bull shrink-0" />
            <h2 className="font-display text-2xl text-fg">Option Tokens Minted</h2>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-5 font-mono text-xs">
            {[
              { label: 'Type',       value: result.side,                         cls: result.side === 'CALL' ? 'text-bull' : 'text-bear' },
              { label: 'Strike',     value: `$${result.strikeUsd}`,              cls: 'text-fg' },
              { label: 'Expiry',     value: `${result.expiryDays}d`,             cls: 'text-fg' },
              { label: 'Collateral', value: result.collateralSymbol,             cls: 'text-accent' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="border border-wire p-3">
                <div className="text-[10px] uppercase tracking-widest text-fg-muted mb-1">{label}</div>
                <div className={cls}>{value}</div>
              </div>
            ))}
          </div>

          <div className="font-mono text-[10px] text-fg-muted mb-1 uppercase tracking-widest">Transaction</div>
          <a
            href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 font-mono text-sm text-accent hover:text-accent-bright break-all mb-6"
          >
            {result.signature.slice(0, 24)}… <ExternalLink size={12} className="shrink-0" />
          </a>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="border border-wire p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted mb-1">{result.side === 'CALL' ? 'CALL' : 'CAP'} Token</div>
              <div className="font-mono text-xs text-fg truncate" title={result.longMint}>{result.longMint.slice(0, 16)}…</div>
            </div>
            <div className="border border-wire p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted mb-1">{result.side === 'CALL' ? 'FLOOR' : 'PUT'} Token</div>
              <div className="font-mono text-xs text-fg truncate" title={result.shortMint}>{result.shortMint.slice(0, 16)}…</div>
            </div>
          </div>

          <div className="mb-6 border border-accent/25 bg-accent/5 px-4 py-3 text-xs font-mono text-fg-muted space-y-1">
            <p className="text-fg font-semibold tracking-wide mb-1">What you can do now</p>
            <p><span className="text-accent">→ Collect premium:</span> Sell the {result.side === 'CALL' ? 'FLOOR' : 'CAP'} token and keep the pure {result.side}.</p>
            <p><span className="text-accent">→ Deepen the strike:</span> Split your {result.side === 'CALL' ? 'CALL' : 'PUT'} into a higher-strike position — no extra collateral.</p>
          </div>

          <div className="flex flex-col gap-3">
            <button onClick={() => onNavigate(`#/app/trade/${result.longMint}`)}
              className="w-full flex items-center justify-between px-5 py-3 bg-accent text-void font-mono text-xs tracking-widest uppercase hover:bg-accent-bright transition-colors">
              TRADE {result.side === 'CALL' ? 'CALL' : 'CAP'} TOKEN <ArrowRight size={14} />
            </button>
            <button onClick={() => onNavigate(`#/app/split/${result.longMint}`)}
              className="w-full flex items-center justify-between px-5 py-3 border border-accent text-accent font-mono text-xs tracking-widest uppercase hover:bg-accent hover:text-void transition-colors">
              SPLIT INTO HIGHER STRIKE <ArrowRight size={14} />
            </button>
            <button onClick={() => onNavigate('#/app/portfolio')}
              className="w-full px-5 py-3 border border-wire text-fg-muted font-mono text-xs tracking-widest uppercase hover:border-accent hover:text-fg transition-colors">
              VIEW PORTFOLIO
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Mint form ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-void pt-20 flex items-start justify-center px-4">
      <div className="mt-16 w-full max-w-lg">

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px w-8 bg-accent" />
            <span className="font-mono text-xs tracking-[0.25em] uppercase text-fg/65">Raven Protocol</span>
          </div>
          <h1 className="font-display text-4xl leading-none tracking-tighter text-fg">
            Mint Option Tokens
          </h1>
          <p className="font-mono text-sm text-fg-muted mt-3 leading-relaxed">
            {side === 'CALL'
              ? <>Deposit <span className="text-accent">wSOL</span> → CALL + FLOOR. CALL profits when price exceeds strike at expiry.</>
              : <>Deposit <span className="text-accent">USDC</span> → CAP + PUT. PUT profits when price falls below strike at expiry.</>}
          </p>
        </div>

        <div className="border border-accent/30 bg-surface p-6 space-y-5">

          {/* Option type */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-muted block mb-2">Option Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['CALL', 'PUT'] as const).map(s => (
                <button key={s} type="button" onClick={() => { setSide(s); setAmount(''); }}
                  className={`py-3 font-mono text-xs tracking-widest uppercase transition-colors border ${
                    side === s
                      ? s === 'CALL' ? 'bg-bull/10 border-bull text-bull' : 'bg-bear/10 border-bear text-bear'
                      : 'border-wire text-fg-muted hover:border-accent/40'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
            {/* Collateral explanation — changes with side */}
            <div className="mt-2 border border-wire/40 bg-surface-2 px-3 py-2 font-mono text-[10px] text-fg-muted leading-relaxed">
              {side === 'CALL' ? (
                <>
                  <span className="text-accent font-medium">wSOL collateral</span> — CALL payout = max(P−K, 0) / P × wSOL deposited.
                  When P→∞, payout approaches 1 wSOL. The collateral scales with price, so it's always sufficient.
                </>
              ) : (
                <>
                  <span className="text-accent font-medium">USDC collateral</span> — PUT payout = max(K−P, 0) / K × USDC deposited.
                  Maximum payout = K (full collateral) when P=0. USDC covers the worst case exactly.
                </>
              )}
            </div>
          </div>

          {/* Underlying asset */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-muted block mb-2">Underlying</label>
            <div className="relative">
              <button type="button" onClick={() => setAssetOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 border border-wire bg-surface-2 text-fg font-mono text-sm hover:border-accent/50 transition-colors">
                {market.label}
                <ChevronDown size={14} className={`text-fg-muted transition-transform ${assetOpen ? 'rotate-180' : ''}`} />
              </button>
              {assetOpen && (
                <div className="absolute top-full left-0 right-0 z-20 border border-wire bg-surface-2 shadow-xl">
                  {MARKETS.map(m => (
                    <button key={m.label} type="button"
                      onClick={() => { setMarket(m); setAssetOpen(false); }}
                      className="w-full px-4 py-2.5 text-left font-mono text-sm text-fg hover:bg-accent/10 transition-colors">
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Strike price */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-muted block mb-2">Strike Price</label>
            <div className="grid grid-cols-7 gap-1.5">
              {STRIKES_USD.map(s => (
                <button key={s} type="button" onClick={() => setStrikeUsd(s)}
                  className={`py-2 font-mono text-[10px] transition-colors border ${
                    strikeUsd === s ? 'bg-accent/15 border-accent text-accent' : 'border-wire text-fg-muted hover:border-accent/40 hover:text-fg'
                  }`}>
                  ${s}
                </button>
              ))}
            </div>
          </div>

          {/* Expiry */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-muted block mb-2">Expiry</label>
            <div className="grid grid-cols-5 gap-2">
              {EXPIRY_DAYS.map(d => (
                <button key={d} type="button" onClick={() => setExpiryDays(d)}
                  className={`py-3 font-mono text-xs tracking-widest uppercase transition-colors border ${
                    expiryDays === d ? 'bg-accent/15 border-accent text-accent' : 'border-wire text-fg-muted hover:border-accent/40 hover:text-fg'
                  }`}>
                  {EXPIRY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Collateral amount */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="deposit-amount"
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-muted">
                Collateral ({col.symbol})
              </label>
              {wallet.connected && (
                <span className="font-mono text-[10px] text-fg-muted">
                  {balanceLoading
                    ? <Loader2 size={10} className="inline animate-spin" />
                    : <>Balance: <span className={insufficientBalance ? 'text-bear' : 'text-bull'}>{balance ?? '—'} {col.symbol}</span></>}
                </span>
              )}
            </div>
            <div className="relative">
              <input id="deposit-amount" type="number" min="0"
                step={side === 'CALL' ? '0.001' : '0.01'}
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className={`w-full px-4 py-3 border bg-surface-2 text-fg font-mono text-sm placeholder:text-fg/25 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                  insufficientBalance && amountNum > 0 ? 'border-bear/60 focus:border-bear' : 'border-wire focus:border-accent/60'
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-fg-muted">{col.symbol}</span>
            </div>
          </div>

          {/* Faucet */}
          {showFaucet && (
            <div className="border border-bear/30 bg-bear/5 p-4">
              <div className="flex items-start gap-3">
                <Droplets size={16} className="text-bear shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-fg mb-1">
                    {balance === 0
                      ? `No ${col.symbol} in your wallet`
                      : `Need ${amountNum.toFixed(side === 'CALL' ? 3 : 2)} ${col.symbol}, have ${balance?.toFixed(side === 'CALL' ? 3 : 2)}`}
                  </div>
                  <div className="font-mono text-[10px] text-fg-muted mb-3">
                    Get {col.faucetAmount} devnet {col.symbol} instantly.
                  </div>
                  <button type="button" onClick={handleFaucet}
                    className="flex items-center gap-2 px-4 py-2 bg-bear text-void font-mono text-xs tracking-widest uppercase hover:opacity-80 transition-colors">
                    <Droplets size={12} /> GET {col.faucetAmount} TEST {col.symbol}
                  </button>
                </div>
              </div>
            </div>
          )}

          {fauceting && (
            <div className="flex items-center gap-2 border border-accent/20 bg-accent/5 p-3">
              <Loader2 size={14} className="text-accent animate-spin shrink-0" />
              <span className="font-mono text-xs text-fg-muted">Minting {col.faucetAmount} test {col.symbol}…</span>
            </div>
          )}

          {faucetSig && (
            <div className="flex items-start gap-2 border border-bull/30 bg-bull/5 p-3">
              <CheckCircle2 size={14} className="text-bull shrink-0 mt-0.5" />
              <div>
                <div className="font-mono text-xs text-bull mb-1">{col.faucetAmount} test {col.symbol} sent!</div>
                <a href={`https://explorer.solana.com/tx/${faucetSig}?cluster=devnet`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 font-mono text-[10px] text-accent hover:text-accent-bright">
                  {faucetSig.slice(0, 20)}… <ExternalLink size={10} />
                </a>
              </div>
            </div>
          )}

          {/* Output preview */}
          {amountNum > 0 && (
            <div className="border border-wire/50 bg-surface-2 p-4 space-y-2">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-fg-muted">Mint fee ({MINT_FEE_BPS} bps)</span>
                <span className="text-fg">{fee.toFixed(side === 'CALL' ? 4 : 4)} {col.symbol}</span>
              </div>
              <div className="border-t border-wire/40 pt-2 flex justify-between font-mono text-xs">
                <span className="text-fg-muted">You receive</span>
                <span className="text-fg font-medium">
                  {(net / 2).toFixed(4)} {longLabel} + {(net / 2).toFixed(4)} {shortLabel}
                </span>
              </div>
              <div className="border-t border-wire/40 pt-2 font-mono text-[10px] text-fg-muted space-y-0.5">
                {side === 'CALL' ? (
                  <>
                    <div>CALL at expiry: <span className="text-fg">max(P − ${strikeUsd}, 0) / P × {col.symbol}</span></div>
                    <div>FLOOR at expiry: <span className="text-fg">min(P, ${strikeUsd}) / P × {col.symbol}</span></div>
                  </>
                ) : (
                  <>
                    <div>PUT at expiry: <span className="text-fg">max(${strikeUsd} − P, 0) / ${strikeUsd} × {col.symbol}</span></div>
                    <div>CAP at expiry: <span className="text-fg">min(P, ${strikeUsd}) / ${strikeUsd} × {col.symbol}</span></div>
                  </>
                )}
              </div>
              <div className="border-t border-wire/40 pt-2 grid grid-cols-3 gap-2 font-mono text-[10px] text-fg-muted">
                <div>Market: <span className="text-fg">{market.label}</span></div>
                <div>Strike: <span className="text-fg">${strikeUsd}</span></div>
                <div>Expiry: <span className="text-fg">{expiryDays}d</span></div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 border border-bear/40 bg-bear/5 p-3">
              <AlertCircle size={14} className="text-bear shrink-0 mt-0.5" />
              <span className="font-mono text-xs text-bear">{error}</span>
            </div>
          )}

          {!wallet.connected ? (
            <WalletMultiButton className="!w-full !justify-center !font-mono !text-xs !tracking-widest !uppercase" />
          ) : (
            <button type="button" onClick={handleMint}
              disabled={submitting || amountNum <= 0 || !!insufficientBalance}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-accent text-void font-mono text-sm tracking-widest uppercase hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {submitting ? 'MINTING…' : `MINT ${side} TOKENS`}
              {!submitting && <ArrowRight size={14} />}
            </button>
          )}
        </div>

        <div className="mt-4 px-1 font-mono text-[10px] text-fg-muted leading-relaxed">
          Option tokens are non-custodial. Collateral is locked in on-chain vaults.
          You retain full control through your wallet.
        </div>
      </div>
    </div>
  );
}

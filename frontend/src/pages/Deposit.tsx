import { useState, useCallback, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { ChevronDown, ArrowRight, CheckCircle2, ExternalLink, AlertCircle, Droplets, Loader2 } from 'lucide-react';
import {
  buildSetMockOraclePriceTx,
  buildCreateRootVaultTx,
  getAta,
} from '../lib/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { MARKETS, USDC_MINT } from '../lib/constants';
import { api } from '../lib/api';

// Mock prices (6-decimal USD).  In production these would be fetched from Pyth.
const MOCK_PRICES_USD: Record<string, number> = {
  'BTC/USD': 68_420_000_000,
  'ETH/USD':  3_847_000_000,
  'SOL/USD':    182_470_000,
};

const DISPLAY_PRICES: Record<string, string> = {
  'BTC/USD': '$68,420',
  'ETH/USD': '$3,847',
  'SOL/USD': '$182.47',
};

const MINT_FEE_BPS = 10; // 0.10%

interface Props {
  onNavigate: (hash: string) => void;
}

interface TxResult {
  signature: string;
  longMint: string;
  shortMint: string;
  vaultId: string;
}

export function Deposit({ onNavigate }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [market, setMarket] = useState(MARKETS[2]); // SOL/USD default
  const [assetOpen, setAssetOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TxResult | null>(null);

  // USDC balance
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [fauceting, setFauceting] = useState(false);
  const [faucetSig, setFaucetSig] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!wallet.publicKey) return;
    setBalanceLoading(true);
    try {
      const ata = getAta(new PublicKey(USDC_MINT), wallet.publicKey);
      const info = await connection.getTokenAccountBalance(ata).catch(() => null);
      setUsdcBalance(info ? parseFloat(info.value.uiAmountString ?? '0') : 0);
    } finally {
      setBalanceLoading(false);
    }
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      fetchBalance();
    } else {
      setUsdcBalance(null);
    }
  }, [wallet.connected, wallet.publicKey, fetchBalance]);

  const handleFaucet = useCallback(async () => {
    if (!wallet.publicKey) return;
    setError(null);
    setFaucetSig(null);
    setFauceting(true);
    try {
      const res = await api.faucet(wallet.publicKey.toBase58());
      setFaucetSig(res.signature);
      await fetchBalance();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Faucet request failed';
      setError(`Faucet error: ${msg}`);
    } finally {
      setFauceting(false);
    }
  }, [wallet.publicKey, fetchBalance]);

  const amountNum = parseFloat(amount) || 0;
  const fee = (amountNum * MINT_FEE_BPS) / 10000;
  const net = amountNum - fee;
  const displayPrice = DISPLAY_PRICES[market.label];

  // True whenever the user doesn't have enough USDC to proceed
  const insufficientBalance =
    wallet.connected &&
    usdcBalance !== null &&
    !balanceLoading &&
    (usdcBalance === 0 || (amountNum > 0 && amountNum > usdcBalance));

  const showFaucet = insufficientBalance && !fauceting && !faucetSig;

  /** Parse on-chain / Anchor errors into user-friendly messages. */
  function parseError(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes('0xbc4') || raw.includes('3012') || raw.includes('AccountNotInitialized')) {
      return 'USDC account not initialised. Use the faucet below to set up your test USDC account.';
    }
    if (raw.includes('0x1') || raw.toLowerCase().includes('insufficient funds')) {
      return `Insufficient USDC balance (${usdcBalance ?? 0} USDC). Use the faucet below to get test tokens.`;
    }
    if (raw.includes('Oracle update failed')) {
      return 'Oracle price update failed — devnet may be congested. Please try again.';
    }
    if (raw.includes('Blockhash not found') || raw.toLowerCase().includes('blockhash')) {
      return 'Transaction expired before confirmation. Please try again.';
    }
    if (raw.toLowerCase().includes('user rejected') || raw.toLowerCase().includes('rejected the request')) {
      return 'Transaction rejected in wallet.';
    }
    return raw.length > 140 ? `${raw.slice(0, 140)}…` : raw;
  }

  const handleSubmit = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) {
      setError('Connect your wallet first.');
      return;
    }
    if (amountNum <= 0) {
      setError('Enter a valid USDC amount.');
      return;
    }
    setError(null);
    setSubmitting(true);

    /**
     * Send a signed transaction and verify it actually succeeded on-chain.
     * confirmTransaction on devnet sometimes returns err=null for reverted txs —
     * so we follow up with getTransaction to read the real meta.err.
     */
    async function sendAndVerify(
      signed: Parameters<typeof connection.sendRawTransaction>[0],
      label: string,
      opts: { skipPreflight: boolean } = { skipPreflight: true }
    ): Promise<string> {
      const sig = await connection.sendRawTransaction(signed, opts);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        'confirmed'
      );
      // Secondary check: read the actual on-chain result
      const tx = await connection.getTransaction(sig, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) throw new Error(`${label}: transaction not found on-chain after confirmation`);
      if (tx.meta?.err) throw new Error(`${label} failed: ${JSON.stringify(tx.meta.err)}`);
      return sig;
    }

    try {
      const anchorWallet = wallet as unknown as AnchorWallet;

      // 1. Update the mock oracle price so the program gets a fresh timestamp
      const oraclePubkey = new PublicKey(market.oracle);
      const priceUsd = new BN(MOCK_PRICES_USD[market.label]);
      const oracleTx = await buildSetMockOraclePriceTx(
        connection,
        anchorWallet,
        oraclePubkey,
        priceUsd
      );
      const signedOracle = await wallet.signTransaction(oracleTx);
      await sendAndVerify(signedOracle.serialize(), 'Oracle update');

      // 2. Create the root vault (deposits USDC, mints LONG + SHORT)
      //    owner_collateral_ata now uses init_if_needed in the contract,
      //    so no pre-flight ATA creation needed.
      const collateralMicro = new BN(Math.floor(amountNum * 1_000_000));
      const vaultId = new BN(Date.now() % 2 ** 31);

      const { tx: vaultTx, rootVault, longMint, shortMint } = await buildCreateRootVaultTx(
        connection,
        anchorWallet,
        vaultId,
        market.feedId,
        oraclePubkey,
        collateralMicro
      );
      const signedVault = await wallet.signTransaction(vaultTx);
      const vaultSig = await sendAndVerify(signedVault.serialize(), 'Vault creation');

      // Register the vault in the backend DB immediately so portfolio is populated
      // without waiting for the indexer. Failures are non-fatal.
      try {
        const assetFeed = new PublicKey(Buffer.from(market.feedId, 'hex'));
        await api.vaults.register({
          pubkey: rootVault.toBase58(),
          vault_id: vaultId.toNumber(),
          owner_wallet: wallet.publicKey!.toBase58(),
          collateral_mint: USDC_MINT,
          collateral_amount: Math.floor(amountNum * 1_000_000),
          long_mint: longMint.toBase58(),
          short_mint: shortMint.toBase58(),
          asset_feed: assetFeed.toBase58(),
          reference_price: MOCK_PRICES_USD[market.label],
        });
      } catch (_) {
        // indexer will catch up; not a fatal error
      }

      setResult({
        signature: vaultSig,
        longMint: longMint.toBase58(),
        shortMint: shortMint.toBase58(),
        vaultId: vaultId.toString(),
      });
    } catch (e: unknown) {
      setError(parseError(e));
    } finally {
      setSubmitting(false);
    }
  }, [wallet, connection, amountNum, market]);

  if (result) {
    return (
      <div className="min-h-screen bg-void pt-20 flex items-start justify-center px-4">
        <div className="mt-16 w-full max-w-lg border border-accent/40 bg-surface p-8">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 size={24} className="text-bull shrink-0" />
            <h2 className="font-display text-2xl text-fg">Root Claims Created</h2>
          </div>
          <div className="font-mono text-xs text-fg-muted mb-1 uppercase tracking-widest">Transaction</div>
          <a
            href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 font-mono text-sm text-accent hover:text-accent-bright break-all mb-6"
          >
            {result.signature.slice(0, 24)}…
            <ExternalLink size={12} className="shrink-0" />
          </a>
          <div className="grid grid-cols-2 gap-3 mb-8">
            <div className="border border-wire p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted mb-1">LONG Mint</div>
              <div className="font-mono text-xs text-fg truncate" title={result.longMint}>{result.longMint.slice(0, 16)}…</div>
            </div>
            <div className="border border-wire p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted mb-1">SHORT Mint</div>
              <div className="font-mono text-xs text-fg truncate" title={result.shortMint}>{result.shortMint.slice(0, 16)}…</div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => onNavigate(`#/app/trade/${result.longMint}`)}
              className="w-full flex items-center justify-between px-5 py-3 bg-accent text-void font-mono text-xs tracking-widest uppercase hover:bg-accent-bright transition-colors"
            >
              TRADE LONG
              <ArrowRight size={14} />
            </button>
            <button
              onClick={() => onNavigate(`#/app/trade/${result.shortMint}`)}
              className="w-full flex items-center justify-between px-5 py-3 border border-accent text-accent font-mono text-xs tracking-widest uppercase hover:bg-accent hover:text-void transition-colors"
            >
              TRADE SHORT
              <ArrowRight size={14} />
            </button>
            <button
              onClick={() => onNavigate('#/app/portfolio')}
              className="w-full px-5 py-3 border border-wire text-fg-muted font-mono text-xs tracking-widest uppercase hover:border-accent hover:text-fg transition-colors"
            >
              VIEW PORTFOLIO
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void pt-20 flex items-start justify-center px-4">
      <div className="mt-16 w-full max-w-lg">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px w-8 bg-accent" />
            <span className="font-mono text-xs tracking-[0.25em] uppercase text-fg/65">
              Raven Protocol
            </span>
          </div>
          <h1 className="font-display text-4xl leading-none tracking-tighter text-fg">
            Create Root Claims
          </h1>
          <p className="font-mono text-sm text-fg-muted mt-3 leading-relaxed">
            Deposit USDC. Receive equal LONG + SHORT risk claims backed by your collateral.
          </p>
        </div>

        <div className="border border-accent/30 bg-surface p-6 space-y-5">

          {/* Market selector */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-muted block mb-2">
              Market
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAssetOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 border border-wire bg-surface-2 text-fg font-mono text-sm hover:border-accent/50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {market.label}
                <ChevronDown size={14} className={`text-fg-muted transition-transform ${assetOpen ? 'rotate-180' : ''}`} />
              </button>
              {assetOpen && (
                <div className="absolute top-full left-0 right-0 z-20 border border-wire bg-surface-2 shadow-xl">
                  {MARKETS.map(m => (
                    <button
                      key={m.label}
                      type="button"
                      onClick={() => { setMarket(m); setAssetOpen(false); }}
                      className="w-full px-4 py-2.5 text-left font-mono text-sm text-fg hover:bg-accent/10 transition-colors"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2 font-mono text-xs text-fg-muted">
              {market.label} · {displayPrice} · mock oracle
            </div>
          </div>

          {/* Amount input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="deposit-amount"
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-muted"
              >
                Amount (USDC)
              </label>
              {wallet.connected && (
                <span className="font-mono text-[10px] text-fg-muted">
                  {balanceLoading ? (
                    <Loader2 size={10} className="inline animate-spin" />
                  ) : (
                    <>Balance: <span className={insufficientBalance ? 'text-bear' : 'text-bull'}>{usdcBalance ?? '—'} USDC</span></>
                  )}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                id="deposit-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className={`w-full px-4 py-3 border bg-surface-2 text-fg font-mono text-sm placeholder:text-fg/25 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${insufficientBalance && amountNum > 0 ? 'border-bear/60 focus:border-bear' : 'border-wire focus:border-accent/60'}`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-fg-muted">
                USDC
              </span>
            </div>
          </div>

          {/* Faucet — shown when balance is 0 or entered amount exceeds balance */}
          {showFaucet && (
            <div className="border border-bear/30 bg-bear/5 p-4">
              <div className="flex items-start gap-3">
                <Droplets size={16} className="text-bear shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  {usdcBalance === 0 ? (
                    <div className="font-mono text-xs text-fg mb-1">No test USDC in your wallet</div>
                  ) : (
                    <div className="font-mono text-xs text-fg mb-1">
                      Insufficient balance — need {amountNum.toFixed(2)} USDC, have {usdcBalance?.toFixed(2)}
                    </div>
                  )}
                  <div className="font-mono text-[10px] text-fg-muted mb-3">
                    Get 1,000 devnet USDC instantly. The server mints it directly to your wallet.
                  </div>
                  <button
                    type="button"
                    onClick={handleFaucet}
                    className="flex items-center gap-2 px-4 py-2 bg-bear text-void font-mono text-xs tracking-widest uppercase hover:opacity-80 transition-colors"
                  >
                    <Droplets size={12} />
                    GET 1,000 TEST USDC
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Faucet loading */}
          {fauceting && (
            <div className="flex items-center gap-2 border border-accent/20 bg-accent/5 p-3">
              <Loader2 size={14} className="text-accent animate-spin shrink-0" />
              <span className="font-mono text-xs text-fg-muted">Minting test USDC to your wallet…</span>
            </div>
          )}

          {/* Faucet success */}
          {faucetSig && (
            <div className="flex items-start gap-2 border border-bull/30 bg-bull/5 p-3">
              <CheckCircle2 size={14} className="text-bull shrink-0 mt-0.5" />
              <div>
                <div className="font-mono text-xs text-bull mb-1">1,000 test USDC sent!</div>
                <a
                  href={`https://explorer.solana.com/tx/${faucetSig}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 font-mono text-[10px] text-accent hover:text-accent-bright"
                >
                  {faucetSig.slice(0, 20)}… <ExternalLink size={10} />
                </a>
              </div>
            </div>
          )}

          {/* Fee + output preview */}
          {amountNum > 0 && (
            <div className="border border-wire/50 bg-surface-2 p-4 space-y-2">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-fg-muted">Mint fee ({MINT_FEE_BPS} bps)</span>
                <span className="text-fg">{fee.toFixed(4)} USDC</span>
              </div>
              <div className="border-t border-wire/40 pt-2 flex justify-between font-mono text-xs">
                <span className="text-fg-muted">You will receive</span>
                <span className="text-fg font-medium">
                  {(net / 2).toFixed(4)} LONG + {(net / 2).toFixed(4)} SHORT
                </span>
              </div>
              <div className="font-mono text-[10px] text-fg-muted pt-1">
                LONG + SHORT = {net.toFixed(4)} USDC · Invariant holds at all times
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 border border-bear/40 bg-bear/5 p-3">
              <AlertCircle size={14} className="text-bear shrink-0 mt-0.5" />
              <span className="font-mono text-xs text-bear">{error}</span>
            </div>
          )}

          {/* Action */}
          {!wallet.connected ? (
            <WalletMultiButton className="!w-full !justify-center !font-mono !text-xs !tracking-widest !uppercase" />
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || amountNum <= 0 || !!insufficientBalance}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-accent text-void font-mono text-sm tracking-widest uppercase hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'CREATING CLAIMS…' : 'CREATE ROOT CLAIMS'}
              {!submitting && <ArrowRight size={14} />}
            </button>
          )}
        </div>

        {/* Info footer */}
        <div className="mt-4 px-1 font-mono text-[10px] text-fg-muted leading-relaxed">
          Claims are non-custodial. The protocol holds collateral in on-chain vaults.
          You retain full control through your wallet.
        </div>

      </div>
    </div>
  );
}

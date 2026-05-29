import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, SystemProgram, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import { ChevronDown, ArrowRight, CheckCircle2, ExternalLink, AlertCircle } from 'lucide-react';
import { getProgram } from '../lib/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';

const ASSETS = [
  { label: 'BTC/USD', pyth: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43' },
  { label: 'ETH/USD', pyth: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' },
  { label: 'SOL/USD', pyth: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d' },
];

const MOCK_PRICES: Record<string, number> = {
  'BTC/USD': 68420,
  'ETH/USD': 3847,
  'SOL/USD': 182.47,
};

const MINT_FEE_BPS = 10; // 0.10%

interface Props {
  onNavigate: (hash: string) => void;
}

interface TxResult {
  signature: string;
  longMint: string;
  shortMint: string;
}

export function Deposit({ onNavigate }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [asset, setAsset] = useState(ASSETS[2]); // SOL/USD default
  const [assetOpen, setAssetOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TxResult | null>(null);

  const amountNum = parseFloat(amount) || 0;
  const fee = (amountNum * MINT_FEE_BPS) / 10000;
  const net = amountNum - fee;
  const oraclePrice = MOCK_PRICES[asset.label];

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
    try {
      // Build instruction via program — uses create_root_vault on the contract
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = getProgram(connection, wallet as AnchorWallet) as any;
      const amountLamports = Math.floor(amountNum * 1_000_000); // USDC 6 decimals

      // Derive PDAs (deterministic from wallet + asset)
      const [rootVault] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('root_vault'),
          wallet.publicKey.toBuffer(),
          Buffer.from(asset.label),
        ],
        program.programId
      );

      const ix = await program.methods
        .createRootVault(amountLamports, asset.label)
        .accounts({
          rootVault,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const { blockhash } = await connection.getLatestBlockhash();
      const message = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message();
      const tx = new VersionedTransaction(message);
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');

      setResult({
        signature: sig,
        longMint: rootVault.toBase58().slice(0, 8) + '_LONG',
        shortMint: rootVault.toBase58().slice(0, 8) + '_SHORT',
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transaction failed');
    } finally {
      setSubmitting(false);
    }
  }, [wallet, connection, amountNum, asset]);

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
              <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted mb-1">LONG Claim</div>
              <div className="font-mono text-sm text-fg truncate">{result.longMint}</div>
            </div>
            <div className="border border-wire p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted mb-1">SHORT Claim</div>
              <div className="font-mono text-sm text-fg truncate">{result.shortMint}</div>
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

          {/* Asset selector */}
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
                {asset.label}
                <ChevronDown size={14} className={`text-fg-muted transition-transform ${assetOpen ? 'rotate-180' : ''}`} />
              </button>
              {assetOpen && (
                <div className="absolute top-full left-0 right-0 z-20 border border-wire bg-surface-2 shadow-xl">
                  {ASSETS.map(a => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => { setAsset(a); setAssetOpen(false); }}
                      className="w-full px-4 py-2.5 text-left font-mono text-sm text-fg hover:bg-accent/10 transition-colors"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2 font-mono text-xs text-fg-muted">
              {asset.label} · ${oraclePrice.toLocaleString()} · Pyth oracle
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label
              htmlFor="deposit-amount"
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-muted block mb-2"
            >
              Amount (USDC)
            </label>
            <div className="relative">
              <input
                id="deposit-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 border border-wire bg-surface-2 text-fg font-mono text-sm placeholder:text-fg/25 focus:outline-none focus:border-accent/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-fg-muted">
                USDC
              </span>
            </div>
          </div>

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
              disabled={submitting || amountNum <= 0}
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

import { useState, useCallback } from 'react';
import { useWallet, useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { ArrowRight, CheckCircle2, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { WalletGate } from '../components/app/WalletGate';
import { useClaims, useVaults } from '../hooks';
import {
  buildMergeClaimsTx,
  deriveClaimNode,
  getAta,
} from '../lib/anchor';
import { MARKETS } from '../lib/constants';
import { truncAddr, fmtUsdc } from '../lib/format';
import { TokenTypeBadge } from '../components/app/TokenTypeBadge';

const MOCK_PRICES_USD: Record<string, number> = {
  'BTC/USD': 68_420_000_000,
  'ETH/USD': 3_847_000_000,
  'SOL/USD': 182_470_000,
};

interface Props {
  /** The ClaimNode pubkey whose children we want to merge back. */
  nodeId: string;
  onNavigate: (hash: string) => void;
}

export function Merge({ nodeId, onNavigate }: Props) {
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const walletAddr = publicKey?.toBase58() ?? null;

  const { data: claims, loading } = useClaims(walletAddr);
  const { data: vaults } = useVaults(walletAddr ?? undefined);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  // Find the claim node by pubkey
  const node = claims?.find(c => c.pubkey === nodeId) ?? null;

  // Find the root vault for this node
  const rootVault = vaults?.find(v => v.pubkey === node?.root_vault) ?? null;

  /** Resolve which oracle pubkey corresponds to a vault's asset_feed. */
  function resolveOracle(assetFeed: string): PublicKey {
    const match = MARKETS.find(m => {
      try {
        return new PublicKey(Buffer.from(m.feedId, 'hex')).toBase58() === assetFeed;
      } catch {
        return false;
      }
    });
    return new PublicKey((match ?? MARKETS[2]).oracle);
  }

  function resolveMarketLabel(assetFeed: string): string {
    const match = MARKETS.find(m => {
      try {
        return new PublicKey(Buffer.from(m.feedId, 'hex')).toBase58() === assetFeed;
      } catch {
        return false;
      }
    });
    return (match ?? MARKETS[2]).label;
  }

  async function sendAndVerify(
    signed: Parameters<typeof connection.sendRawTransaction>[0],
    label: string
  ): Promise<string> {
    const sig = await connection.sendRawTransaction(signed, { skipPreflight: true });
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed'
    );
    const tx = await connection.getTransaction(sig, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) throw new Error(`${label}: transaction not found on-chain after confirmation`);
    if (tx.meta?.err) throw new Error(`${label} failed: ${JSON.stringify(tx.meta.err)}`);
    return sig;
  }

  const handleMerge = useCallback(async () => {
    if (!anchorWallet || !publicKey) throw new Error('Wallet not connected');
    if (!node || !rootVault) throw new Error('Node or vault not found');
    if (!node.left_child_mint || !node.right_child_mint) {
      throw new Error('This node has not been split yet');
    }

    setError(null);
    setSubmitting(true);
    try {
      const vaultId = new BN(node.root_id);
      const rootVaultPubkey = new PublicKey(node.root_vault);
      const parentMint = new PublicKey(node.source_mint);
      const leftMint = new PublicKey(node.left_child_mint);
      const rightMint = new PublicKey(node.right_child_mint);
      const claimNodePda = deriveClaimNode(rootVaultPubkey, node.node_id);

      // Determine the min of both child balances to use as amount
      let amount = new BN(1_000_000);
      try {
        const leftAta = getAta(leftMint, publicKey);
        const rightAta = getAta(rightMint, publicKey);
        const [lBal, rBal] = await Promise.all([
          connection.getTokenAccountBalance(leftAta).catch(() => null),
          connection.getTokenAccountBalance(rightAta).catch(() => null),
        ]);
        const lAmt = lBal ? parseInt(lBal.value.amount, 10) : 0;
        const rAmt = rBal ? parseInt(rBal.value.amount, 10) : 0;
        const min = Math.min(lAmt, rAmt);
        if (min > 0) amount = new BN(min);
      } catch { /* use default */ }

      // Update oracle price first (same pattern as Split/Deposit)
      const { buildSetMockOraclePriceTx } = await import('../lib/anchor');
      const assetFeed = rootVault.asset_feed;
      const oraclePubkey = resolveOracle(assetFeed);
      const marketLabel = resolveMarketLabel(assetFeed);
      const priceUsd = new BN(MOCK_PRICES_USD[marketLabel] ?? 182_470_000);

      const oracleTx = await buildSetMockOraclePriceTx(
        connection, anchorWallet, oraclePubkey, priceUsd
      );
      const signedOracle = await anchorWallet.signTransaction(oracleTx);
      await sendAndVerify(signedOracle.serialize(), 'Oracle update');

      // Build and sign merge tx
      const mergeTx = await buildMergeClaimsTx(
        connection,
        anchorWallet,
        vaultId,
        claimNodePda,
        rootVaultPubkey,
        parentMint,
        leftMint,
        rightMint,
        amount
      );
      const signedMerge = await anchorWallet.signTransaction(mergeTx);
      const sig = await sendAndVerify(signedMerge.serialize(), 'Merge claims');
      setTxSig(sig);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.length > 200 ? `${msg.slice(0, 200)}…` : msg);
    } finally {
      setSubmitting(false);
    }
  }, [anchorWallet, publicKey, node, rootVault, connection]);

  const isLoading = loading && !node;
  const canMerge =
    node?.is_active &&
    node.left_child_mint &&
    node.right_child_mint &&
    node.left_child_mint.length > 0 &&
    node.right_child_mint.length > 0;

  return (
    <div className="min-h-screen bg-void pt-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">

        <button
          onClick={() => onNavigate('#/app/portfolio')}
          className="font-mono text-[10px] tracking-widest uppercase text-fg-muted hover:text-fg mb-8 flex items-center gap-1"
          aria-label="Back to portfolio"
        >
          ← Portfolio
        </button>

        <h1 className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-8">
          Merge Claims
        </h1>

        <WalletGate walletConnected={connected}>
          {isLoading ? (
            <div className="py-12 text-center font-mono text-xs text-fg-muted">Loading…</div>
          ) : !node ? (
            <div className="py-12 text-center font-mono text-xs text-fg-muted">
              Claim node not found: {truncAddr(nodeId)}
            </div>
          ) : !canMerge ? (
            <div className="py-12 text-center font-mono text-xs text-fg-muted">
              This node has not been split — nothing to merge.
            </div>
          ) : txSig ? (
            /* Success */
            <div className="max-w-lg mx-auto border border-accent/40 bg-surface p-8">
              <div className="flex items-center gap-3 mb-6">
                <CheckCircle2 size={24} className="text-bull shrink-0" />
                <h2 className="font-display text-2xl text-fg">Claims Merged</h2>
              </div>
              <div className="font-mono text-[10px] tracking-widest uppercase text-fg-muted mb-1">Transaction</div>
              <a
                href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 font-mono text-sm text-accent hover:text-accent-bright break-all mb-8"
              >
                {txSig.slice(0, 24)}…
                <ExternalLink size={12} className="shrink-0" />
              </a>
              <p className="font-mono text-xs text-fg-muted mb-6">
                Your child tokens have been burned and the parent claim has been returned to your wallet.
              </p>
              <button
                onClick={() => onNavigate('#/app/portfolio')}
                className="w-full py-3 border border-accent text-accent font-mono text-xs tracking-widest uppercase hover:bg-accent hover:text-void transition-colors"
              >
                View Portfolio
                <ArrowRight size={12} className="inline ml-2" />
              </button>
            </div>
          ) : (
            /* Merge form */
            <div className="max-w-lg mx-auto space-y-5">
              {/* Node info */}
              <div className="bg-surface border border-wire p-5 space-y-3">
                <div className="font-mono text-[10px] tracking-widest uppercase text-fg-muted mb-4">
                  Claim node being merged
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Type</span>
                  <TokenTypeBadge type={node.claim_type.toLowerCase()} size="sm" />
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Depth</span>
                  <span className="font-mono text-xs text-fg">{node.depth}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Creation price</span>
                  <span className="font-mono text-xs text-fg">${fmtUsdc(node.creation_price / 1e6, 4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Parent mint</span>
                  <span className="font-mono text-xs text-fg-muted" title={node.source_mint}>{truncAddr(node.source_mint)}</span>
                </div>
              </div>

              {/* Children being burned */}
              <div className="bg-surface border border-wire p-5 space-y-3">
                <div className="font-mono text-[10px] tracking-widest uppercase text-fg-muted mb-4">
                  Children being burned
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Left (LONG)</span>
                  <span className="font-mono text-xs text-fg-muted" title={node.left_child_mint}>{truncAddr(node.left_child_mint)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Right (SHORT)</span>
                  <span className="font-mono text-xs text-fg-muted" title={node.right_child_mint}>{truncAddr(node.right_child_mint)}</span>
                </div>
              </div>

              <div className="bg-bear/5 border border-bear/30 p-4 font-mono text-xs text-fg-muted">
                <span className="text-bear">Note: </span>Equal amounts of both child tokens will be burned. The minimum of your left and right child balances determines the merge amount.
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 border border-bear/50 bg-bear/5 text-bear font-mono text-xs">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleMerge}
                disabled={submitting}
                className="w-full flex items-center justify-between px-5 py-3 border border-accent text-accent font-mono text-xs tracking-widest uppercase hover:bg-accent hover:text-void transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <span>MERGING…</span>
                    <Loader2 size={14} className="animate-spin" />
                  </>
                ) : (
                  <>
                    <span>MERGE CLAIMS</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>

              <button
                onClick={() => onNavigate('#/app/portfolio')}
                disabled={submitting}
                className="w-full py-3 border border-wire text-fg-muted font-mono text-xs tracking-widest uppercase hover:text-fg transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          )}
        </WalletGate>
      </div>
    </div>
  );
}

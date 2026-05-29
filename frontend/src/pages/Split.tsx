import { useWallet, useAnchorWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { WalletGate } from '../components/app/WalletGate';
import { SplitWizard } from '../components/app/SplitWizard';
import { useClaims } from '../hooks';
import { buildSplitClaimTx } from '../lib/anchor';
import { PublicKey } from '@solana/web3.js';

interface Props {
  nodeId: string; // mint or claim pubkey
  onNavigate: (hash: string) => void;
}

export function Split({ nodeId, onNavigate }: Props) {
  const { connected, publicKey, sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const walletAddr = publicKey?.toBase58() ?? null;

  const { data: claims, loading } = useClaims(walletAddr);
  const node = claims?.find(c => c.mint === nodeId || c.pubkey === nodeId) ?? null;

  async function handleSplit(splitPrice: number): Promise<{ signature: string }> {
    if (!anchorWallet || !node) throw new Error('Wallet not ready');
    const tx = await buildSplitClaimTx(
      connection,
      anchorWallet,
      new PublicKey(node.pubkey),
      splitPrice
    );
    const sig = await sendTransaction(tx, connection);
    await connection.confirmTransaction(sig, 'confirmed');
    return { signature: sig };
  }

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
          Recursive Split
        </h1>

        <WalletGate walletConnected={connected}>
          {loading ? (
            <div className="py-12 text-center font-mono text-xs text-fg-muted">Loading…</div>
          ) : !node ? (
            <div className="py-12 text-center font-mono text-xs text-fg-muted">
              Claim not found: {nodeId}
            </div>
          ) : (
            <SplitWizard
              node={node}
              oraclePrice={null}
              onSplit={handleSplit}
              onDone={() => onNavigate('#/app/portfolio')}
            />
          )}
        </WalletGate>

      </div>
    </div>
  );
}

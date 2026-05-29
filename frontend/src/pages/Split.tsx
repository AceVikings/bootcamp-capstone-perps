import { useWallet, useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { WalletGate } from '../components/app/WalletGate';
import { SplitWizard } from '../components/app/SplitWizard';
import { useVaults, useClaims } from '../hooks';
import { buildSetMockOraclePriceTx, buildSplitClaimTx, getAta } from '../lib/anchor';
import { MARKETS } from '../lib/constants';
import type { ClaimNode } from '../lib/api';

// Mock prices matching devnet oracle state (6-decimal USD, same as Deposit.tsx)
const MOCK_PRICES_USD: Record<string, number> = {
  'BTC/USD': 68_420_000_000,
  'ETH/USD': 3_847_000_000,
  'SOL/USD': 182_470_000,
};

interface Props {
  nodeId: string; // LONG or SHORT mint pubkey (or child mint for deep splits)
  onNavigate: (hash: string) => void;
}

export function Split({ nodeId, onNavigate }: Props) {
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const walletAddr = publicKey?.toBase58() ?? null;

  const { data: vaults } = useVaults();
  const { data: claims, loading } = useClaims(walletAddr);

  // Check if nodeId is a root vault LONG or SHORT mint
  const vault = vaults?.find(v => v.long_mint === nodeId || v.short_mint === nodeId) ?? null;

  // For deep splits: find claim node whose left/right child mint matches
  const parentClaim = claims?.find(c =>
    c.left_child_mint === nodeId || c.right_child_mint === nodeId
  ) ?? null;

  // Build a ClaimNode-like object for SplitWizard
  const syntheticNode: ClaimNode | null = vault
    ? {
        pubkey: vault.pubkey,
        node_id: 0,
        root_vault: vault.pubkey,
        root_id: vault.vault_id,
        owner_wallet: walletAddr ?? '',
        depth: 0,
        parent_node: null,
        claim_type: vault.long_mint === nodeId ? 'LONG' : 'SHORT',
        source_mint: nodeId,
        left_child_mint: '',
        right_child_mint: '',
        creation_price: vault.reference_price,
        created_at: vault.created_at,
        is_active: vault.is_active,
      }
    : parentClaim
      ? {
          ...parentClaim,
          claim_type: parentClaim.left_child_mint === nodeId ? 'LONG' : 'SHORT',
          source_mint: nodeId,
        }
      : null;

  const isLoading = loading && !vault;

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

  /** Resolve which market label corresponds to a vault's asset_feed. */
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

  async function handleSplit(_price: number): Promise<{ signature: string }> {
    if (!anchorWallet || !publicKey) throw new Error('Wallet not connected');
    if (!vault && !parentClaim) throw new Error('Cannot find vault for this mint');

    let vaultId: BN;
    let rootVaultPubkey: PublicKey;
    let assetFeed: string;

    if (vault) {
      vaultId = new BN(vault.vault_id);
      rootVaultPubkey = new PublicKey(vault.pubkey);
      assetFeed = vault.asset_feed;
    } else {
      // Deep split — parentClaim is set
      const rootVault = vaults?.find(v => v.pubkey === parentClaim!.root_vault);
      vaultId = new BN(parentClaim!.root_id);
      rootVaultPubkey = new PublicKey(parentClaim!.root_vault);
      assetFeed = rootVault?.asset_feed ?? '';
    }

    const oraclePubkey = resolveOracle(assetFeed);
    const marketLabel = resolveMarketLabel(assetFeed);
    const priceUsd = new BN(MOCK_PRICES_USD[marketLabel] ?? 182_470_000);

    /**
     * Send a signed transaction and verify it actually succeeded on-chain.
     * devnet's confirmTransaction can return err=null for reverted txs —
     * so we follow up with getTransaction to read the real meta.err.
     */
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

    // 1. Update oracle price
    const oracleTx = await buildSetMockOraclePriceTx(
      connection, anchorWallet, oraclePubkey, priceUsd
    );
    const signedOracle = await anchorWallet.signTransaction(oracleTx);
    await sendAndVerify(signedOracle.serialize(), 'Oracle update');

    // 2. Fetch user's token balance for the source mint
    const sourceMintPubkey = new PublicKey(nodeId);
    let amount = new BN(1_000_000); // default: 1 token
    try {
      const ataAddr = getAta(sourceMintPubkey, publicKey);
      const bal = await connection.getTokenAccountBalance(ataAddr);
      if (bal.value.amount && bal.value.amount !== '0') {
        amount = new BN(bal.value.amount);
      }
    } catch { /* use default */ }

    // 3. Build and send the split transaction
    const newNodeId = new BN(Date.now() % (2 ** 31));
    const splitTx = await buildSplitClaimTx(
      connection,
      anchorWallet,
      vaultId,
      newNodeId,
      sourceMintPubkey,
      rootVaultPubkey,
      oraclePubkey,
      amount
    );
    const signedSplit = await anchorWallet.signTransaction(splitTx);
    const splitSig = await sendAndVerify(signedSplit.serialize(), 'Split claim');
    return { signature: splitSig };
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
          {isLoading ? (
            <div className="py-12 text-center font-mono text-xs text-fg-muted">Loading…</div>
          ) : !syntheticNode ? (
            <div className="py-12 text-center font-mono text-xs text-fg-muted">
              Mint not found in your vaults: {nodeId}
            </div>
          ) : (
            <SplitWizard
              node={syntheticNode}
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

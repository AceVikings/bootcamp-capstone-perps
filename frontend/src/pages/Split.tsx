import { useState, useEffect } from 'react';
import { useWallet, useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { WalletGate } from '../components/app/WalletGate';
import { SplitWizard } from '../components/app/SplitWizard';
import { useOptionVaults, useClaims } from '../hooks';
import { buildSetMockOraclePriceTx, buildSplitClaimTx, getAta } from '../lib/anchor';
import { fetchVaultByMint } from '../lib/api';
import { MARKETS } from '../lib/constants';
import type { ClaimNode } from '../lib/api';
import type { OptionVault, OptionNode } from '../lib/types';

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

/** Resolved data when the token was bought on the market (not in user's own vaults). */
interface ResolvedMint {
  vault: OptionVault;
  node: OptionNode | null;
  mint_role: 'root' | 'long_child' | 'short_child';
}

export function Split({ nodeId, onNavigate }: Props) {
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const walletAddr = publicKey?.toBase58() ?? null;

  // useOptionVaults returns normalized OptionVault[] with long_mint = root_mint fallback
  const { data: vaults } = useOptionVaults(walletAddr);
  const { data: claims, loading: claimsLoading } = useClaims(walletAddr);

  // Fallback for tokens bought on the secondary market (not in user's own vaults)
  const [resolvedMint, setResolvedMint] = useState<ResolvedMint | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveFailed, setResolveFailed] = useState(false);

  // Check if nodeId is a root vault LONG or SHORT mint.
  // long_mint is normalised from root_mint in fetchVaults; match on both for safety.
  const vault = vaults?.find(v =>
    v.long_mint === nodeId || v.root_mint === nodeId || v.short_mint === nodeId
  ) ?? null;

  // For deep splits: find claim node whose left/right child mint matches
  const parentClaim = claims?.find(c =>
    c.left_child_mint === nodeId || c.right_child_mint === nodeId
  ) ?? null;

  const ownedByUser = Boolean(vault || parentClaim);

  // When the token isn't in the user's own vaults, look it up via the API.
  // This handles CALL/FLOOR/PUT/CAP tokens bought on the orderbook.
  useEffect(() => {
    if (ownedByUser || claimsLoading || !nodeId) return;
    let cancelled = false;
    setResolving(true);
    setResolveFailed(false);
    fetchVaultByMint(nodeId).then(result => {
      if (cancelled) return;
      setResolvedMint(result);
      setResolveFailed(result === null);
      setResolving(false);
    });
    return () => { cancelled = true; };
  }, [nodeId, ownedByUser, claimsLoading]);

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
        // root_mint / long_mint is always the CALL/CAP (long) side
        claim_type: (vault.long_mint === nodeId || vault.root_mint === nodeId) ? 'LONG' : 'SHORT',
        source_mint: nodeId,
        left_child_mint: '',
        right_child_mint: '',
        creation_price: (vault.strike ?? vault.reference_price ?? 0),
        created_at: vault.created_at,
        is_active: vault.is_active ?? true,
      }
    : parentClaim
      ? {
          ...parentClaim,
          claim_type: parentClaim.left_child_mint === nodeId ? 'LONG' : 'SHORT',
          source_mint: nodeId,
        }
      : resolvedMint
        ? {
            pubkey: resolvedMint.vault.pubkey,
            node_id: resolvedMint.node?.node_id ?? 0,
            root_vault: resolvedMint.vault.pubkey,
            root_id: resolvedMint.vault.vault_id,
            owner_wallet: walletAddr ?? '',
            // depth of the node that created this mint; the next split is one level deeper
            depth: resolvedMint.node?.depth ?? 0,
            parent_node: resolvedMint.node?.pubkey ?? null,
            // 'root' = long/CALL mint (backend always stores root_mint = long_mint)
            // 'long_child' = CALL/CAP child from a split
            // 'short_child' = FLOOR/PUT child from a split
            claim_type: (resolvedMint.mint_role === 'root' || resolvedMint.mint_role === 'long_child') ? 'LONG' : 'SHORT',
            source_mint: nodeId,
            left_child_mint: '',
            right_child_mint: '',
            creation_price: resolvedMint.vault.strike,
            created_at: resolvedMint.vault.created_at,
            is_active: true,
          }
        : null;

  /** For UI banner — determine whether this is a CALL/CAP (bullish) position.
   *  claim_type 'LONG' always means CALL (for LONG vault) or CAP (for SHORT vault) —
   *  both are the "upside" token that benefits from or is bounded upward.
   *  Simplification: 'LONG' claim_type → show CALL-side split explanation.
   */
  const isCallSide: boolean = syntheticNode?.claim_type === 'LONG';

  const currentStrike: number | null =
    resolvedMint?.node?.child_strike ??
    resolvedMint?.vault.strike ??
    (parentClaim ? null : vault?.reference_price ?? null);

  const isLoading = (claimsLoading && !vault) || resolving;

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
    if (!vault && !parentClaim && !resolvedMint) throw new Error('Cannot find vault for this mint');

    let vaultId: BN;
    let rootVaultPubkey: PublicKey;
    let assetFeed: string;

    if (vault) {
      vaultId = new BN(vault.vault_id);
      rootVaultPubkey = new PublicKey(vault.pubkey);
      assetFeed = vault.asset_feed;
    } else if (resolvedMint) {
      // Market-bought token: vault info resolved from the backend
      vaultId = new BN(resolvedMint.vault.vault_id);
      rootVaultPubkey = new PublicKey(resolvedMint.vault.pubkey);
      assetFeed = resolvedMint.vault.asset_feed;
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
    // child_strike: use current strike + $10 (next rung in the chain).
    // Stored as micro-USD (6 dec).  Falls back to a sensible default if unknown.
    const parentStrikeMicro: number =
      syntheticNode?.parent_node !== undefined && syntheticNode?.creation_price
        ? syntheticNode.creation_price
        : 180_000_000; // $180 default
    const childStrikeMicro = new BN(parentStrikeMicro + 10_000_000); // +$10 per rung

    const newNodeId = new BN(Date.now() % (2 ** 31));
    const splitTx = await buildSplitClaimTx(
      connection,
      anchorWallet,
      vaultId,
      newNodeId,
      sourceMintPubkey,
      rootVaultPubkey,
      oraclePubkey,
      amount,
      childStrikeMicro
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

        {/* Collateral efficiency explanation */}
        {syntheticNode && (
          <div className="mb-8 rounded-lg border border-wire/40 bg-surface/60 px-5 py-4 text-xs font-mono text-fg-muted leading-relaxed">
            <p className="text-fg mb-1 font-semibold tracking-wide">
              How collateral efficiency works
            </p>
            {isCallSide ? (
              <>
                <p>
                  Your <span className="text-bull">CALL</span>{currentStrike != null ? ` at $${(currentStrike / 1e6).toFixed(0)}` : ''} is the collateral for the next strike.
                  Splitting it gives you a <span className="text-bull">CALL</span> at a higher strike
                  + a <span className="text-accent">FLOOR</span> spread — no additional USDC required.
                </p>
                <p className="mt-1">
                  Sell the <span className="text-accent">FLOOR</span> to return to a pure directional position,
                  or hold both for a spread strategy.
                </p>
              </>
            ) : (
              <>
                <p>
                  Your <span className="text-bear">PUT</span>{currentStrike != null ? ` at $${(currentStrike / 1e6).toFixed(0)}` : ''} is the collateral for the next strike.
                  Splitting it gives you a <span className="text-bear">PUT</span> at a lower strike
                  + a <span className="text-accent">CAP</span> spread — no additional USDC required.
                </p>
                <p className="mt-1">
                  Sell the <span className="text-accent">CAP</span> to return to a pure directional position,
                  or hold both for a spread strategy.
                </p>
              </>
            )}
            {!ownedByUser && resolvedMint && (
              <p className="mt-2 text-fg-muted/70">
                This token was purchased on the orderbook. You can split it because
                the protocol validates token ownership, not the original depositor.
              </p>
            )}
          </div>
        )}

        <WalletGate walletConnected={connected}>
          {isLoading ? (
            <div className="py-12 text-center font-mono text-xs text-fg-muted">
              {resolving ? 'Resolving token…' : 'Loading…'}
            </div>
          ) : !syntheticNode ? (
            <div className="py-12 text-center font-mono text-xs text-fg-muted">
              {resolveFailed
                ? `Token not recognised by the protocol: ${nodeId}`
                : `Mint not found in your vaults: ${nodeId}`}
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

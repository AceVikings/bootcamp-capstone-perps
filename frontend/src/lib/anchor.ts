import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import idl from './idl/tpp_protocol.json';
import { PROGRAM_ID, CONFIG_PDA, FEE_TREASURY_PDA, USDC_MINT } from './constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TppProtocol = any;

// ─── Well-known program IDs ────────────────────────────────────────────────
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
// Agave 4.0 devnet ships a new ATA program at a slightly different address
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// ─── PDA helpers ──────────────────────────────────────────────────────────
const PROG = new PublicKey(PROGRAM_ID);

/** Convert a number/BN to an 8-byte little-endian Buffer (u64). */
function u64LeBytes(n: number | BN): Buffer {
  const bn = BN.isBN(n) ? n : new BN(n);
  return bn.toArrayLike(Buffer, 'le', 8);
}

/** Derive the root_vault PDA for a given owner + vaultId. */
export function deriveRootVault(owner: PublicKey, vaultId: number | BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('root_vault'), owner.toBuffer(), u64LeBytes(vaultId)],
    PROG
  )[0];
}

/** Derive the long_mint PDA for a root vault. */
export function deriveLongMint(rootVault: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('long_mint'), rootVault.toBuffer()],
    PROG
  )[0];
}

/** Derive the short_mint PDA for a root vault. */
export function deriveShortMint(rootVault: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('short_mint'), rootVault.toBuffer()],
    PROG
  )[0];
}

/** Derive the claim_node PDA for a given root vault + nodeId. */
export function deriveClaimNode(rootVault: PublicKey, nodeId: number | BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('claim_node'), rootVault.toBuffer(), u64LeBytes(nodeId)],
    PROG
  )[0];
}

/** Derive the left_child_mint PDA (created by split_claim at nodeId). */
export function deriveLeftChildMint(rootVault: PublicKey, nodeId: number | BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('left_child'), rootVault.toBuffer(), u64LeBytes(nodeId)],
    PROG
  )[0];
}

/** Derive the right_child_mint PDA (created by split_claim at nodeId). */
export function deriveRightChildMint(rootVault: PublicKey, nodeId: number | BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('right_child'), rootVault.toBuffer(), u64LeBytes(nodeId)],
    PROG
  )[0];
}

/**
 * Build an idempotent "create ATA" instruction.
 * Uses the AssociatedTokenProgram's idempotent variant (data byte = 1)
 * so it succeeds whether or not the account already exists.
 */
export function createAtaIdempotentIx(
  payer: PublicKey,
  ata: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]), // 1 = idempotent variant (noop if already exists)
  });
}

/** Derive the Associated Token Address (ATA) for an owner+mint pair. */
export function getAta(mint: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

// ─── Program factory ──────────────────────────────────────────────────────

export function getProgram(connection: Connection, wallet: AnchorWallet) {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'processed',
  });
  return new Program<TppProtocol>(idl as TppProtocol, provider);
}

// ─── Instruction builders ─────────────────────────────────────────────────

/**
 * Update a mock oracle account's price (called before createRootVault / splitClaim).
 * The oracle account must already exist on-chain (created by devnet-init.ts).
 *
 * @param oraclePubkey  The oracle account pubkey (from MARKETS constant).
 * @param priceUsd      6-decimal USD price (e.g. 68420 USD → 68_420_000_000).
 */
export async function buildSetMockOraclePriceTx(
  connection: Connection,
  wallet: AnchorWallet,
  oraclePubkey: PublicKey,
  priceUsd: number | BN
): Promise<Transaction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = getProgram(connection, wallet) as any;
  const ix = await program.methods
    .setMockOraclePrice(BN.isBN(priceUsd) ? priceUsd : new BN(priceUsd))
    .accounts({
      oracle: oraclePubkey,
      authority: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

/**
 * Create a new options vault.
 *
 * vault_side = 0: LONG vault — long_mint = CALL@strike, short_mint = FLOOR@strike
 * vault_side = 1: SHORT vault — long_mint = CAP@strike,  short_mint = PUT@strike
 *
 * @param vaultId          Unique u64 ID for this vault.
 * @param assetFeedHex     32-byte Pyth price feed ID as hex (no 0x), or oracle pubkey bytes.
 * @param oraclePubkey     Mock oracle account for this market.
 * @param collateralAmount Collateral in USDC micro-units (6 decimals).
 * @param strikePrice      Option strike in micro-USD (e.g. $180 = 180_000_000).
 * @param expiryTs         Unix timestamp of option expiry (must be in the future).
 * @param vaultSide        0 = LONG/CALL vault, 1 = SHORT/PUT vault.
 * @param collateralMint   Defaults to devnet USDC from constants.
 */
export async function buildCreateRootVaultTx(
  connection: Connection,
  wallet: AnchorWallet,
  vaultId: number | BN,
  assetFeedHex: string,
  oraclePubkey: PublicKey,
  collateralAmount: number | BN,
  strikePrice: number | BN,
  expiryTs: number | BN,
  vaultSide: number = 0,
  collateralMint: PublicKey = new PublicKey(USDC_MINT)
): Promise<{ tx: Transaction; rootVault: PublicKey; longMint: PublicKey; shortMint: PublicKey }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = getProgram(connection, wallet) as any;
  const owner = wallet.publicKey;

  const rootVault = deriveRootVault(owner, vaultId);
  const longMint  = deriveLongMint(rootVault);
  const shortMint = deriveShortMint(rootVault);

  const ownerCollateralAta  = getAta(collateralMint, owner);
  const vaultCollateralAta  = getAta(collateralMint, rootVault);
  const ownerLongAta        = getAta(longMint, owner);
  const ownerShortAta       = getAta(shortMint, owner);
  const treasuryCollateralAta = getAta(collateralMint, new PublicKey(FEE_TREASURY_PDA));

  // asset_feed is a Pubkey (32 bytes of Pyth feed ID or mock oracle key)
  const assetFeed = new PublicKey(Buffer.from(assetFeedHex, 'hex'));

  const ix = await program.methods
    .createRootVault(
      BN.isBN(vaultId) ? vaultId : new BN(vaultId),
      assetFeed,
      BN.isBN(collateralAmount) ? collateralAmount : new BN(collateralAmount),
      BN.isBN(strikePrice) ? strikePrice : new BN(strikePrice),
      BN.isBN(expiryTs) ? expiryTs : new BN(expiryTs),
      vaultSide,
    )
    .accounts({
      config: new PublicKey(CONFIG_PDA),
      rootVault,
      longMint,
      shortMint,
      ownerCollateralAta,
      vaultCollateralAta,
      ownerLongAta,
      ownerShortAta,
      treasuryCollateralAta,
      collateralMint,
      feeTreasury: new PublicKey(FEE_TREASURY_PDA),
      oracle: oraclePubkey,
      owner,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.feePayer = owner;
  tx.recentBlockhash = blockhash;

  // Prepend idempotent ATA-create (safe no-op if account already exists)
  tx.add(createAtaIdempotentIx(owner, ownerCollateralAta, owner, collateralMint));
  tx.add(ix);

  return { tx, rootVault, longMint, shortMint };
}

/**
 * Split a claim token (CALL/FLOOR/CAP/PUT) into two child tokens at a new strike.
 *
 * For LONG vaults: burns CALL@K → left_child (CALL@childStrike) + right_child (FLOOR@childStrike)
 * For SHORT vaults: burns CAP@K → left_child (CAP@childStrike)  + right_child (PUT@childStrike)
 *
 * @param vaultId      The vault this claim belongs to.
 * @param nodeId       Unique node ID for the new ClaimNode.
 * @param sourceMint   The token mint being split.
 * @param rootVault    The root vault PDA.
 * @param oraclePubkey Oracle account for price check.
 * @param amount       Amount of source tokens to split (micro-units).
 * @param childStrike  Strike price for the child tokens (micro-USD, e.g. $190 = 190_000_000).
 * @param parentAccount For depth-1 splits pass rootVault; for depth-2+ pass the parent ClaimNode PDA.
 */
export async function buildSplitClaimTx(
  connection: Connection,
  wallet: AnchorWallet,
  vaultId: number | BN,
  nodeId: number | BN,
  sourceMint: PublicKey,
  rootVault: PublicKey,
  oraclePubkey: PublicKey,
  amount: number | BN,
  childStrike: number | BN,
  parentAccount?: PublicKey,
): Promise<Transaction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = getProgram(connection, wallet) as any;
  const caller = wallet.publicKey;

  const claimNode      = deriveClaimNode(rootVault, nodeId);
  const leftChildMint  = deriveLeftChildMint(rootVault, nodeId);
  const rightChildMint = deriveRightChildMint(rootVault, nodeId);

  const callerSourceAta = getAta(sourceMint, caller);
  const callerLeftAta   = getAta(leftChildMint, caller);
  const callerRightAta  = getAta(rightChildMint, caller);

  // Depth-1 split: parentAccount = rootVault; deeper splits pass ClaimNode PDA
  const parent = parentAccount ?? rootVault;

  const ix = await program.methods
    .splitClaim(
      BN.isBN(vaultId) ? vaultId : new BN(vaultId),
      BN.isBN(nodeId) ? nodeId : new BN(nodeId),
      BN.isBN(amount) ? amount : new BN(amount),
      BN.isBN(childStrike) ? childStrike : new BN(childStrike),
    )
    .accounts({
      config: new PublicKey(CONFIG_PDA),
      rootVault,
      claimNode,
      leftChildMint,
      rightChildMint,
      sourceMint,
      callerSourceAta,
      callerLeftAta,
      callerRightAta,
      parentAccount: parent,
      oracle: oraclePubkey,
      caller,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  tx.feePayer = caller;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

/**
 * Merge two child claims back into their parent mint.
 *
 * @param vaultId      The vault the claim_node belongs to.
 * @param claimNodePda The ClaimNode PDA (from deriveClaimNode).
 * @param rootVault    The root vault PDA.
 * @param parentMint   The parent mint to receive.
 * @param leftMint     The left child mint being burned.
 * @param rightMint    The right child mint being burned.
 * @param amount       Amount of each child token to burn (micro-units).
 */
export async function buildMergeClaimsTx(
  connection: Connection,
  wallet: AnchorWallet,
  vaultId: number | BN,
  claimNodePda: PublicKey,
  rootVault: PublicKey,
  parentMint: PublicKey,
  leftMint: PublicKey,
  rightMint: PublicKey,
  amount: number | BN
): Promise<Transaction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = getProgram(connection, wallet) as any;
  const caller = wallet.publicKey;

  const callerParentAta = getAta(parentMint, caller);
  const callerLeftAta = getAta(leftMint, caller);
  const callerRightAta = getAta(rightMint, caller);

  const ix = await program.methods
    .mergeClaims(
      BN.isBN(vaultId) ? vaultId : new BN(vaultId),
      BN.isBN(amount) ? amount : new BN(amount)
    )
    .accounts({
      config: new PublicKey(CONFIG_PDA),
      rootVault,
      claimNode: claimNodePda,
      parentMint,
      leftChildMint: leftMint,
      rightChildMint: rightMint,
      callerParentAta,
      callerLeftAta,
      callerRightAta,
      caller,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  tx.feePayer = caller;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

/**
 * Settle a vault after expiry (post-expiry, one side at a time).
 *
 * Locks the settlement oracle price on the first call. Subsequent calls use
 * the stored settlement_price so every settler gets the same per-token rate.
 *
 * @param vaultId    Vault ID.
 * @param rootVault  Root vault PDA.
 * @param side       0 = LONG/CALL side; 1 = SHORT/FLOOR-or-PUT side.
 * @param amount     Amount of the respective tokens to burn.
 * @param oraclePubkey Oracle account (only read on first call to lock price).
 * @param collateralMint Defaults to devnet USDC.
 */
export async function buildSettleVaultTx(
  connection: Connection,
  wallet: AnchorWallet,
  vaultId: number | BN,
  rootVault: PublicKey,
  side: number,
  amount: number | BN,
  oraclePubkey: PublicKey,
  collateralMint: PublicKey = new PublicKey(USDC_MINT)
): Promise<Transaction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = getProgram(connection, wallet) as any;
  const caller = wallet.publicKey;

  const longMint  = deriveLongMint(rootVault);
  const shortMint = deriveShortMint(rootVault);

  // The caller passes their ATA for the side they are settling
  const callerTokenAta     = getAta(side === 0 ? longMint : shortMint, caller);
  const callerCollateralAta = getAta(collateralMint, caller);
  const vaultCollateralAta  = getAta(collateralMint, rootVault);
  const treasuryCollateralAta = getAta(collateralMint, new PublicKey(FEE_TREASURY_PDA));

  const ix = await program.methods
    .settleVault(
      BN.isBN(vaultId) ? vaultId : new BN(vaultId),
      side,
      BN.isBN(amount) ? amount : new BN(amount),
    )
    .accounts({
      config: new PublicKey(CONFIG_PDA),
      rootVault,
      longMint,
      shortMint,
      callerTokenAta,
      callerCollateralAta,
      vaultCollateralAta,
      treasuryCollateralAta,
      collateralMint,
      feeTreasury: new PublicKey(FEE_TREASURY_PDA),
      oracle: oraclePubkey,
      caller,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  tx.feePayer = caller;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

/**
 * Redeem equal LONG + SHORT root claims for the underlying USDC collateral.
 * Only available before expiry. Use buildSettleVaultTx after expiry.
 *
 * @param vaultId          Vault ID.
 * @param rootVault        Root vault PDA.
 * @param collateralMint   Defaults to devnet USDC from constants.
 * @param amount           Amount (micro-units of LONG + SHORT) to redeem.
 */
export async function buildRedeemRootTx(
  connection: Connection,
  wallet: AnchorWallet,
  vaultId: number | BN,
  rootVault: PublicKey,
  amount: number | BN,
  collateralMint: PublicKey = new PublicKey(USDC_MINT)
): Promise<Transaction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = getProgram(connection, wallet) as any;
  const caller = wallet.publicKey;

  const longMint = deriveLongMint(rootVault);
  const shortMint = deriveShortMint(rootVault);

  const callerLongAta = getAta(longMint, caller);
  const callerShortAta = getAta(shortMint, caller);
  const callerCollateralAta = getAta(collateralMint, caller);
  const vaultCollateralAta = getAta(collateralMint, rootVault);
  const treasuryCollateralAta = getAta(collateralMint, new PublicKey(FEE_TREASURY_PDA));

  const ix = await program.methods
    .redeemRoot(
      BN.isBN(vaultId) ? vaultId : new BN(vaultId),
      BN.isBN(amount) ? amount : new BN(amount)
    )
    .accounts({
      config: new PublicKey(CONFIG_PDA),
      rootVault,
      longMint,
      shortMint,
      callerLongAta,
      callerShortAta,
      callerCollateralAta,
      vaultCollateralAta,
      treasuryCollateralAta,
      collateralMint,
      feeTreasury: new PublicKey(FEE_TREASURY_PDA),
      caller,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  tx.feePayer = caller;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

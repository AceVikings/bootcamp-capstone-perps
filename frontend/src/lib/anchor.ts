import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import idl from '../../../contracts/target/idl/tpp_protocol.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TppProtocol = any;

export function getProgram(connection: Connection, wallet: AnchorWallet) {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  return new Program<TppProtocol>(idl as TppProtocol, provider);
}

export async function buildMintPositionPairTx(
  connection: Connection,
  wallet: AnchorWallet,
  epochPda: PublicKey,
  usdcMint: PublicKey,
  amount: number
): Promise<Transaction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = getProgram(connection, wallet) as any;
  const ix = await program.methods
    .mintPositionPair(amount)
    .accounts({ epoch: epochPda, usdcMint })
    .instruction();
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

export async function buildRedeemPositionTx(
  connection: Connection,
  wallet: AnchorWallet,
  epochPda: PublicKey,
  longMint: PublicKey,
  shortMint: PublicKey,
  amount: number
): Promise<Transaction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = getProgram(connection, wallet) as any;
  const ix = await program.methods
    .redeemPosition(amount)
    .accounts({ epoch: epochPda, longMint, shortMint })
    .instruction();
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

export async function buildSplitClaimTx(
  connection: Connection,
  wallet: AnchorWallet,
  claimPda: PublicKey,
  splitPrice: number
): Promise<Transaction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = getProgram(connection, wallet) as any;
  const ix = await program.methods
    .splitClaim(splitPrice)
    .accounts({ claim: claimPda, owner: wallet.publicKey })
    .instruction();
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

export async function buildMergeClaimsTx(
  connection: Connection,
  wallet: AnchorWallet,
  claimA: PublicKey,
  claimB: PublicKey
): Promise<Transaction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = getProgram(connection, wallet) as any;
  const ix = await program.methods
    .mergeClaims()
    .accounts({ claimA, claimB, owner: wallet.publicKey })
    .instruction();
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

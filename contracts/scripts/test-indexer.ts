/**
 * Quick test: create vault 9999 on devnet to verify indexer picks it up.
 * Run: npx ts-node -P tsconfig.json scripts/test-indexer.ts
 */
import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const IDL = require('../target/idl/tpp_protocol.json');
const WALLET_PATH = `${process.env.HOME}/.config/solana/tpp-devnet.json`;
const USDC_FILE   = path.join(__dirname, 'devnet-usdc-mint.json');
const ORACLE_FILE = path.join(__dirname, 'devnet-oracles.json');
const RPC = 'https://api.devnet.solana.com';

async function main() {
  const adminKp  = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH,'utf-8'))));
  const usdcKp   = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(USDC_FILE,'utf-8'))));
  const usdcMint = usdcKp.publicKey;

  const oracles   = JSON.parse(fs.readFileSync(ORACLE_FILE,'utf-8'));
  // Pick any oracle key
  const oracleKey = Object.keys(oracles).find(k => !k.endsWith('_SEED') || k === 'SOL_SEED') || Object.keys(oracles)[0];
  const oracleKp  = Keypair.fromSecretKey(new Uint8Array(oracles[oracleKey]));

  const conn = new Connection(RPC, 'confirmed');
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(adminKp), { commitment: 'confirmed' });
  const program  = new anchor.Program(IDL as any, provider);
  const PROG = program.programId;

  const [cfgPda] = PublicKey.findProgramAddressSync([Buffer.from('protocol_config')], PROG);
  const [ftPda]  = PublicKey.findProgramAddressSync([Buffer.from('fee_treasury')],    PROG);

  const vaultId = new BN(9997);
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('root_vault'), adminKp.publicKey.toBuffer(), vaultId.toArrayLike(Buffer,'le',8)], PROG
  );
  const [longMint]  = PublicKey.findProgramAddressSync([Buffer.from('long_mint'),  vaultPda.toBuffer()], PROG);
  const [shortMint] = PublicKey.findProgramAddressSync([Buffer.from('short_mint'), vaultPda.toBuffer()], PROG);

  // Check existing
  if (await conn.getAccountInfo(vaultPda)) {
    console.log('Vault 9999 already exists — indexer should have caught it already');
    console.log('Vault PDA:', vaultPda.toBase58());
    return;
  }

  const ownerCollateral = await getAssociatedTokenAddress(usdcMint, adminKp.publicKey);
  const vaultCollateral = await getAssociatedTokenAddress(usdcMint, vaultPda, true);
  const ownerLong  = await getAssociatedTokenAddress(longMint,  adminKp.publicKey);
  const ownerShort = await getAssociatedTokenAddress(shortMint, adminKp.publicKey);
  const treasury   = await getAssociatedTokenAddress(usdcMint, ftPda, true);

  // Update oracle price first
  console.log(`Using oracle: ${oracleKp.publicKey.toBase58()} (key: ${oracleKey})`);
  await program.methods.setMockOraclePrice(new BN(180_000_000))
    .accounts({ oracle: oracleKp.publicKey, authority: adminKp.publicKey, systemProgram: SystemProgram.programId })
    .signers([adminKp])
    .rpc({ commitment: 'confirmed' });
  console.log('Oracle refreshed');

  const expiryTs    = Math.floor(Date.now()/1000) + 30*86400;
  const strikePrice = 180_000_000;

  console.log('Creating vault 9999 (strike=$180, expiry=+30d)…');
  const sig = await program.methods
    .createRootVault(vaultId, oracleKp.publicKey, new BN(5_000_000), new BN(strikePrice), new BN(expiryTs), 0)
    .accounts({
      config: cfgPda, rootVault: vaultPda, longMint, shortMint,
      ownerCollateralAta: ownerCollateral, vaultCollateralAta: vaultCollateral,
      ownerLongAta: ownerLong, ownerShortAta: ownerShort,
      treasuryCollateralAta: treasury, collateralMint: usdcMint,
      feeTreasury: ftPda, oracle: oracleKp.publicKey, owner: adminKp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKp])
    .rpc({ commitment: 'confirmed' });

  console.log('Transaction confirmed:', sig);
  console.log('Vault PDA  :', vaultPda.toBase58());
  console.log('Long  mint :', longMint.toBase58());
  console.log('Short mint :', shortMint.toBase58());
  console.log('\nNow check the backend DB in ~5s:');
  console.log('  GET http://34.173.208.49:8080/vaults');
}
main().catch(e => { console.error(e?.message || e); process.exit(1); });

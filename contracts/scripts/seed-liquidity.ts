/**
 * Raven Protocol — Devnet Seed Liquidity Script
 *
 * Creates a full SOL/USD options chain on devnet:
 *   Strikes  : $120, $130, $140, … $240 (13 strikes, $10 step)
 *   Expiries : 2 / 4 / 6 / 8 / 10 days from now
 *
 * For each expiry tier:
 *   LONG vault  (wSOL collateral, mock oracle @ $250)
 *     → 13 chained splits → CALL@120 … CALL@240
 *   SHORT vault (USDC collateral, mock oracle @ $110)
 *     → 13 chained splits → PUT@240 … PUT@120
 *
 * After all on-chain setup, posts bid/ask LIMIT orders to the backend
 * for every CALL and PUT token using Black-Scholes premiums.
 *
 * Prerequisites
 * ─────────────
 *   1. anchor build          ← regenerates IDL with the new instructions
 *   2. anchor deploy --provider.cluster devnet
 *   3. Admin wallet (~/.config/solana/tpp-devnet.json) has ≥ 0.5 SOL
 *   4. scripts/devnet-usdc-mint.json exists (created by devnet-init.ts)
 *   5. Backend running with SKIP_MINT_VALIDATION=true
 *
 * Run:
 *   cd contracts
 *   npx ts-node -P tsconfig.json scripts/seed-liquidity.ts
 */

import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from '@solana/spl-token';
import * as nacl from 'tweetnacl';
import * as fs from 'fs';
import * as path from 'path';

// ─── IDL (must run `anchor build` first) ─────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDL = require('../target/idl/tpp_protocol.json');

// Avoid TS2589 deep generic inference on Program<IDL> method chains
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnchorProgram = { methods: any; programId: PublicKey };

// ─── Config ──────────────────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
const WALLET_PATH =
  process.env.SEED_KEYPAIR ??
  `${process.env.HOME}/.config/solana/tpp-devnet.json`;
const BACKEND_URL =
  process.env.BACKEND_URL ?? 'https://raven.vikings.studio/api';

const SCRIPTS_DIR = path.join(__dirname);
const USDC_MINT_FILE = path.join(SCRIPTS_DIR, 'devnet-usdc-mint.json');
const ORACLES_FILE = path.join(SCRIPTS_DIR, 'devnet-oracles.json');
const SEED_STATE_FILE = path.join(SCRIPTS_DIR, 'seed-state.json');

// ─── Options chain parameters ────────────────────────────────────────────────
const STRIKES_USD = [120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240];
const EXPIRY_DAYS = [2, 4, 6, 8, 10];

// Mock oracle prices: LONG vaults use $250 (all CALLs are ITM → positive backing)
//                    SHORT vaults use $110 (all PUTs are ITM → positive backing)
const LONG_ORACLE_PRICE_USD = 250; // $250 in USD
const SHORT_ORACLE_PRICE_USD = 110; // $110 in USD
const LONG_ORACLE_PRICE = LONG_ORACLE_PRICE_USD * 1_000_000; // micro-USD (6 dec)
const SHORT_ORACLE_PRICE = SHORT_ORACLE_PRICE_USD * 1_000_000;

// Collateral amounts (both in 6-decimal units)
const LONG_VAULT_AMOUNT = 13_000_000; // 13M wSOL lamports ≈ 0.013 wSOL
const SHORT_VAULT_AMOUNT = 26_000_000; // 26M USDC micro = 26 USDC

// BS parameters (backend uses same σ=85%)
const SIGMA = 0.85;
// Display price for BS calculations (current market price stored in DB)
const MARKET_PRICE_USD = 180;

// Vault ID offsets to avoid collision with devnet-init.ts vaults
const LONG_VAULT_ID_BASE = 1000;
const SHORT_VAULT_ID_BASE = 2000;

// ─── PDA helpers ─────────────────────────────────────────────────────────────
function configPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_config')],
    programId
  )[0];
}

function feeTreasuryPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('fee_treasury')],
    programId
  )[0];
}

function vaultPda(owner: PublicKey, vaultId: BN, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('option_vault'),
      owner.toBuffer(),
      vaultId.toArrayLike(Buffer, 'le', 8),
    ],
    programId
  )[0];
}

function rootMintPda(vault: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('root_mint'), vault.toBuffer()],
    programId
  )[0];
}

function longChildMintPda(vault: PublicKey, nodeId: BN, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('long_mint'),
      vault.toBuffer(),
      nodeId.toArrayLike(Buffer, 'le', 8),
    ],
    programId
  )[0];
}

function shortChildMintPda(vault: PublicKey, nodeId: BN, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('short_mint'),
      vault.toBuffer(),
      nodeId.toArrayLike(Buffer, 'le', 8),
    ],
    programId
  )[0];
}

// ─── Black-Scholes helpers ────────────────────────────────────────────────────
function normCdf(x: number): number {
  const a1 = 0.3193815;
  const a2 = -0.3565638;
  const a3 = 1.7814779;
  const a4 = -1.8212560;
  const a5 = 1.3302744;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  const p = 1 - 0.3989422820 * Math.exp((-x * x) / 2) * poly;
  return x >= 0 ? p : 1 - p;
}

function bsCall(s: number, k: number, tYears: number, sigma: number): number {
  if (tYears <= 0) return Math.max(s - k, 0);
  const sqrtT = Math.sqrt(tYears);
  const d1 = (Math.log(s / k) + 0.5 * sigma * sigma * tYears) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return s * normCdf(d1) - k * normCdf(d2);
}

function bsPut(s: number, k: number, tYears: number, sigma: number): number {
  if (tYears <= 0) return Math.max(k - s, 0);
  const sqrtT = Math.sqrt(tYears);
  const d1 = (Math.log(s / k) + 0.5 * sigma * sigma * tYears) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return k * normCdf(-d2) - s * normCdf(-d1);
}

// ─── Oracle helpers ───────────────────────────────────────────────────────────

function loadOrCreateOracleStore(): { longKp: Keypair; shortKp: Keypair; fresh: boolean } {
  if (fs.existsSync(ORACLES_FILE)) {
    const data = JSON.parse(fs.readFileSync(ORACLES_FILE, 'utf-8')) as Record<string, number[]>;
    if (data['LONG_SEED'] && data['SHORT_SEED']) {
      return {
        longKp: Keypair.fromSecretKey(new Uint8Array(data['LONG_SEED'])),
        shortKp: Keypair.fromSecretKey(new Uint8Array(data['SHORT_SEED'])),
        fresh: false,
      };
    }
  }
  const longKp = Keypair.generate();
  const shortKp = Keypair.generate();

  // Merge with existing oracle store
  const existing: Record<string, number[]> = fs.existsSync(ORACLES_FILE)
    ? JSON.parse(fs.readFileSync(ORACLES_FILE, 'utf-8'))
    : {};
  existing['LONG_SEED'] = Array.from(longKp.secretKey);
  existing['SHORT_SEED'] = Array.from(shortKp.secretKey);
  fs.writeFileSync(ORACLES_FILE, JSON.stringify(existing, null, 2));
  return { longKp, shortKp, fresh: true };
}

async function createOracleAccount(
  connection: Connection,
  payer: Keypair,
  oracleKp: Keypair,
  programId: PublicKey
): Promise<void> {
  const info = await connection.getAccountInfo(oracleKp.publicKey);
  if (info) {
    console.log(`  Oracle ${oracleKp.publicKey.toBase58().slice(0, 8)}… already exists`);
    return;
  }
  const lamports = await connection.getMinimumBalanceForRentExemption(16);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: oracleKp.publicKey,
      lamports,
      space: 16,
      programId,
    })
  );
  await sendAndConfirmTransaction(connection, tx, [payer, oracleKp], {
    commitment: 'confirmed',
  });
  console.log(`  Created oracle ${oracleKp.publicKey.toBase58()}`);
}

async function setOraclePrice(
  program: AnchorProgram,
  authority: Keypair,
  oracle: Keypair,
  priceUsd: number
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000) - 10; // 10s in the past
  await program.methods
    .setMockOraclePrice(new BN(priceUsd), new BN(timestamp))
    .accounts({
      oracle: oracle.publicKey,
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc({ commitment: 'confirmed' });
}

// ─── wSOL helper ──────────────────────────────────────────────────────────────
async function ensureWsolBalance(
  connection: Connection,
  payer: Keypair,
  lamports: number
): Promise<PublicKey> {
  const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, payer.publicKey);
  const tx = new Transaction();

  const ataInfo = await connection.getAccountInfo(wsolAta);
  if (!ataInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        wsolAta,
        payer.publicKey,
        NATIVE_MINT
      )
    );
  }

  tx.add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: wsolAta,
      lamports,
    })
  );
  tx.add(createSyncNativeInstruction(wsolAta));

  await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'confirmed' });
  return wsolAta;
}

// ─── Order posting ────────────────────────────────────────────────────────────
function buildOrderMessage(
  trader: string,
  tokenMint: string,
  side: string,
  quantity: number,
  priceUsdc: number,
  nonce: number,
  expiry: number
): string {
  return `${trader}|${tokenMint}|${side}|${quantity}|${priceUsdc}|${nonce}|${expiry}`;
}

async function postOrder(
  admin: Keypair,
  tokenMint: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  priceUsdc: number
): Promise<boolean> {
  const nonce = Math.floor(Math.random() * 1_000_000_000);
  const expiry = Math.floor(Date.now() / 1000) + 86400 * 30; // 30d
  const trader = admin.publicKey.toBase58();

  const msg = buildOrderMessage(trader, tokenMint, side, quantity, priceUsdc, nonce, expiry);
  const sig = nacl.sign.detached(
    Buffer.from(msg, 'utf-8'),
    admin.secretKey
  );

  try {
    const resp = await fetch(`${BACKEND_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trader,
        token_mint: tokenMint,
        side,
        quantity,
        price_usdc: priceUsdc,
        nonce,
        expiry,
        signature: Buffer.from(sig).toString('base64'),
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.warn(`    ⚠ Order ${side} ${tokenMint.slice(0, 8)}… failed: ${text}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`    ⚠ Order post error: ${err}`);
    return false;
  }
}

async function seedOrderBook(
  admin: Keypair,
  mintPubkey: PublicKey,
  strikeUsd: number,
  expiryDays: number,
  isCall: boolean
): Promise<void> {
  const mint = mintPubkey.toBase58();
  const s = MARKET_PRICE_USD;
  const k = strikeUsd;
  const tYears = expiryDays / 365;
  const mid = isCall
    ? bsCall(s, k, tYears, SIGMA)
    : bsPut(s, k, tYears, SIGMA);

  if (mid <= 0) {
    console.log(
      `    Skipping orders for ${isCall ? 'CALL' : 'PUT'}@$${k} (${expiryDays}d): mid=$0`
    );
    return;
  }

  // Bid/ask spread of ±5%
  const bidUsd = mid * 0.95;
  const askUsd = mid * 1.05;

  // Convert to USDC micro units (6 decimals)
  const bidUsdc = Math.max(1, Math.round(bidUsd * 1_000_000));
  const askUsdc = Math.max(2, Math.round(askUsd * 1_000_000));

  // Order quantity: 500_000 = 0.5 tokens
  const qty = 500_000;

  await postOrder(admin, mint, 'SELL', qty, askUsdc);
  await postOrder(admin, mint, 'BUY', qty, bidUsdc);

  // Extra depth: smaller orders at wider spreads
  await postOrder(admin, mint, 'SELL', qty * 2, Math.round(askUsdc * 1.10));
  await postOrder(admin, mint, 'BUY', qty * 2, Math.round(bidUsdc * 0.90));

  console.log(
    `    ${isCall ? 'CALL' : 'PUT'}@$${k} (${expiryDays}d): bid=$${bidUsd.toFixed(2)} ask=$${askUsd.toFixed(2)}`
  );
}

// ─── Vault helpers ────────────────────────────────────────────────────────────
async function createLongVault(
  program: AnchorProgram,
  admin: Keypair,
  vaultId: BN,
  oracleKp: Keypair,
  wsolAta: PublicKey,
  expiry: number,
  programId: PublicKey
): Promise<{ vault: PublicKey; rootMint: PublicKey }> {
  const vault = vaultPda(admin.publicKey, vaultId, programId);
  const rootMint = rootMintPda(vault, programId);
  const vaultCollateral = await getAssociatedTokenAddress(NATIVE_MINT, vault, true);
  const ownerRootToken = await getAssociatedTokenAddress(rootMint, admin.publicKey);

  await program.methods
    .createLongVault(vaultId, oracleKp.publicKey, new BN(LONG_VAULT_AMOUNT), new BN(expiry))
    .accounts({
      config: configPda(programId),
      vault,
      collateralMint: NATIVE_MINT,
      vaultCollateral,
      rootMint,
      ownerCollateral: wsolAta,
      ownerRootToken,
      oracleFeed: oracleKp.publicKey,
      owner: admin.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([admin])
    .rpc({ commitment: 'confirmed' });

  return { vault, rootMint };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createShortVault(
  program: AnchorProgram,
  admin: Keypair,
  vaultId: BN,
  oracleKp: Keypair,
  usdcMint: PublicKey,
  usdcAta: PublicKey,
  expiry: number,
  programId: PublicKey
): Promise<{ vault: PublicKey; rootMint: PublicKey }> {
  const vault = vaultPda(admin.publicKey, vaultId, programId);
  const rootMint = rootMintPda(vault, programId);
  const vaultCollateral = await getAssociatedTokenAddress(usdcMint, vault, true);
  const ownerRootToken = await getAssociatedTokenAddress(rootMint, admin.publicKey);

  await program.methods
    .createShortVault(vaultId, oracleKp.publicKey, new BN(SHORT_VAULT_AMOUNT), new BN(expiry))
    .accounts({
      config: configPda(programId),
      vault,
      collateralMint: usdcMint,
      vaultCollateral,
      rootMint,
      ownerCollateral: usdcAta,
      ownerRootToken,
      oracleFeed: oracleKp.publicKey,
      owner: admin.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([admin])
    .rpc({ commitment: 'confirmed' });

  return { vault, rootMint };
}

/**
 * Runs a chain of 13 splits on a LONG vault to produce CALL@$120 … CALL@$240.
 *
 * LONG vault split semantics:
 *   child_strike = parent_strike + TICK_SIZE
 *   long_child  = CALL token (has backing when oracle > child_strike)
 *   short_child = FLOOR token (becomes parent for next split)
 *
 * Chain: root → split@110 → CALL@120 + FLOOR@120
 *              → split@120 → CALL@130 + FLOOR@130
 *              → ...
 *              → split@230 → CALL@240 + FLOOR@240
 *
 * Returns array of CALL mint pubkeys indexed by strike index (0==$120, 12==$240).
 */
async function chainSplitLong(
  program: AnchorProgram,
  connection: Connection,
  admin: Keypair,
  vaultId: BN,
  vault: PublicKey,
  rootMint: PublicKey,
  oracleKp: Keypair,
  programId: PublicKey
): Promise<PublicKey[]> {
  const callMints: PublicKey[] = [];

  for (let i = 0; i < STRIKES_USD.length; i++) {
    const nodeId = new BN(i);
    const strikeUsd = STRIKES_USD[i];
    // child_strike = parent_strike + TICK_SIZE  →  parent_strike = child_strike - TICK_SIZE
    const parentStrikeUsd = (strikeUsd - 10) * 1_000_000;

    // Parent mint: root_mint for node 0, else FLOOR (short_child) of previous node
    const parentMint =
      i === 0 ? rootMint : shortChildMintPda(vault, new BN(i - 1), programId);

    const ownerParentToken = await getAssociatedTokenAddress(parentMint, admin.publicKey);
    const longChildMint = longChildMintPda(vault, nodeId, programId);
    const shortChildMint = shortChildMintPda(vault, nodeId, programId);
    const ownerLongToken = await getAssociatedTokenAddress(longChildMint, admin.publicKey);
    const ownerShortToken = await getAssociatedTokenAddress(shortChildMint, admin.publicKey);
    const nodePda = PublicKey.findProgramAddressSync(
      [
        Buffer.from('option_node'),
        vault.toBuffer(),
        nodeId.toArrayLike(Buffer, 'le', 8),
      ],
      programId
    )[0];

    // Use the actual parent token balance so we burn exactly what we have
    let splitAmount: number;
    if (i === 0) {
      splitAmount = LONG_VAULT_AMOUNT;
    } else {
      const parentAcct = await getAccount(connection, ownerParentToken);
      splitAmount = Number(parentAcct.amount);
      if (splitAmount === 0) {
        console.warn(`  ⚠ CALL@$${strikeUsd}: parent balance is 0, skipping`);
        callMints.push(longChildMint); // push placeholder
        continue;
      }
    }

    await program.methods
      .splitOption(vaultId, nodeId, new BN(splitAmount), new BN(parentStrikeUsd))
      .accounts({
        config: configPda(programId),
        vault,
        node: nodePda,
        parentMint,
        longChildMint,
        shortChildMint,
        ownerParentToken,
        ownerLongToken,
        ownerShortToken,
        oracleFeed: oracleKp.publicKey,
        owner: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc({ commitment: 'confirmed' });

    callMints.push(longChildMint);
    process.stdout.write(`  ✓ CALL@$${strikeUsd} `);
  }
  console.log();
  return callMints;
}

/**
 * Runs a chain of 13 splits on a SHORT vault to produce PUT@$240 … PUT@$120.
 *
 * SHORT vault split semantics:
 *   child_strike = parent_strike - TICK_SIZE
 *   long_child  = CAP token  (becomes parent for next split)
 *   short_child = PUT token  (has backing when child_strike > oracle)
 *
 * Chain: root → split@250 → CAP@240 + PUT@240
 *              → split@240 → CAP@230 + PUT@230
 *              → ...
 *              → split@130 → CAP@120 + PUT@120
 *
 * Returns array of PUT mint pubkeys indexed [0=PUT@$240, 12=PUT@$120].
 * Caller maps index i to STRIKES_USD[12 - i] to get the strike.
 */
async function chainSplitShort(
  program: AnchorProgram,
  connection: Connection,
  admin: Keypair,
  vaultId: BN,
  vault: PublicKey,
  rootMint: PublicKey,
  oracleKp: Keypair,
  programId: PublicKey
): Promise<PublicKey[]> {
  // PUT mints indexed from highest to lowest strike
  const putMints: PublicKey[] = [];

  for (let i = 0; i < STRIKES_USD.length; i++) {
    const nodeId = new BN(i);
    // Splits go from $250 down to $130, producing PUT@$240 … PUT@$120
    const strikesDesc = [...STRIKES_USD].reverse(); // [240, 230, ..., 120]
    const strikeUsd = strikesDesc[i];
    // child_strike = parent_strike - TICK_SIZE  →  parent_strike = child_strike + TICK_SIZE
    const parentStrikeUsd = (strikeUsd + 10) * 1_000_000;

    // Parent mint: root_mint for node 0, else CAP (long_child) of previous node
    const parentMint =
      i === 0 ? rootMint : longChildMintPda(vault, new BN(i - 1), programId);

    const ownerParentToken = await getAssociatedTokenAddress(parentMint, admin.publicKey);
    const longChildMint = longChildMintPda(vault, nodeId, programId);
    const shortChildMint = shortChildMintPda(vault, nodeId, programId);
    const ownerLongToken = await getAssociatedTokenAddress(longChildMint, admin.publicKey);
    const ownerShortToken = await getAssociatedTokenAddress(shortChildMint, admin.publicKey);
    const nodePda = PublicKey.findProgramAddressSync(
      [
        Buffer.from('option_node'),
        vault.toBuffer(),
        nodeId.toArrayLike(Buffer, 'le', 8),
      ],
      programId
    )[0];

    // Use the actual parent token balance so we burn exactly what we have
    let splitAmount: number;
    if (i === 0) {
      splitAmount = SHORT_VAULT_AMOUNT;
    } else {
      const parentAcct = await getAccount(connection, ownerParentToken);
      splitAmount = Number(parentAcct.amount);
      if (splitAmount === 0) {
        console.warn(`  ⚠ PUT@$${strikeUsd}: parent balance is 0, skipping`);
        putMints.push(shortChildMint); // push placeholder
        continue;
      }
    }

    await program.methods
      .splitOption(vaultId, nodeId, new BN(splitAmount), new BN(parentStrikeUsd))
      .accounts({
        config: configPda(programId),
        vault,
        node: nodePda,
        parentMint,
        longChildMint,
        shortChildMint,
        ownerParentToken,
        ownerLongToken,
        ownerShortToken,
        oracleFeed: oracleKp.publicKey,
        owner: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc({ commitment: 'confirmed' });

    putMints.push(shortChildMint);
    process.stdout.write(`  ✓ PUT@$${strikeUsd} `);
  }
  console.log();
  return putMints;
}

// ─── Seed state persistence ───────────────────────────────────────────────────
interface SeedState {
  initialized: boolean;
  expirySlots: Array<{
    expiryDays: number;
    longVaultId: number;
    shortVaultId: number;
    callMints: string[];   // indexed 0=CALL@120 … 12=CALL@240
    putMints: string[];    // indexed 0=PUT@240 … 12=PUT@120
    ordersPosted: boolean;
  }>;
}

function loadSeedState(): SeedState {
  if (fs.existsSync(SEED_STATE_FILE)) {
    return JSON.parse(fs.readFileSync(SEED_STATE_FILE, 'utf-8'));
  }
  return { initialized: false, expirySlots: [] };
}

function saveSeedState(state: SeedState): void {
  fs.writeFileSync(SEED_STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // ── Load keypairs ──────────────────────────────────────────────────────────
  const adminKp = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );

  if (!fs.existsSync(USDC_MINT_FILE)) {
    console.error(
      `ERROR: ${USDC_MINT_FILE} not found.\nRun devnet-init.ts first to create the test USDC mint.`
    );
    process.exit(1);
  }
  const usdcMintKp = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(USDC_MINT_FILE, 'utf-8')))
  );
  const usdcMint = usdcMintKp.publicKey;

  // ── Connect ────────────────────────────────────────────────────────────────
  const connection = new Connection(RPC_URL, 'confirmed');
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(adminKp),
    { commitment: 'confirmed' }
  );
  const program: AnchorProgram = new anchor.Program(IDL as any, provider);
  const PROGRAM_ID = program.programId;

  const balance = await connection.getBalance(adminKp.publicKey);
  console.log('═'.repeat(60));
  console.log('  Raven Protocol — Seed Liquidity');
  console.log('═'.repeat(60));
  console.log(`  Admin        : ${adminKp.publicKey.toBase58()}`);
  console.log(`  Program      : ${PROGRAM_ID.toBase58()}`);
  console.log(`  SOL balance  : ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`  USDC mint    : ${usdcMint.toBase58()}`);
  console.log(`  Backend      : ${BACKEND_URL}`);
  console.log('─'.repeat(60));

  if (balance < 0.3 * LAMPORTS_PER_SOL) {
    console.error('ERROR: Admin wallet needs at least 0.3 SOL. Please fund it first.');
    process.exit(1);
  }

  // ── Protocol config ────────────────────────────────────────────────────────
  const cfgPda = configPda(PROGRAM_ID);
  const ftPda = feeTreasuryPda(PROGRAM_ID);
  const cfgInfo = await connection.getAccountInfo(cfgPda);

  if (!cfgInfo) {
    console.log('\n[1/6] Initializing protocol config…');
    await program.methods
      .initialize(
        10, // fee_bps = 0.10%
        20, // max_recursive_depth (needs ≥ 13 for full chain)
        new BN(0), // oracle_conf_denominator (0 = disabled)
        new BN(3600), // max_oracle_age_secs
        usdcMint
      )
      .accounts({
        config: cfgPda,
        feeTreasury: ftPda,
        admin: adminKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKp])
      .rpc({ commitment: 'confirmed' });
    console.log('  ✓ Protocol initialized');
  } else {
    console.log('\n[1/6] Protocol config already exists ✓');
  }

  // ── Oracle accounts ────────────────────────────────────────────────────────
  console.log('\n[2/6] Creating mock oracle accounts…');
  const { longKp: longOracleKp, shortKp: shortOracleKp } = loadOrCreateOracleStore();

  await createOracleAccount(connection, adminKp, longOracleKp, PROGRAM_ID);
  await createOracleAccount(connection, adminKp, shortOracleKp, PROGRAM_ID);
  console.log(`  Long  oracle : ${longOracleKp.publicKey.toBase58()} (price=$${LONG_ORACLE_PRICE_USD})`);
  console.log(`  Short oracle : ${shortOracleKp.publicKey.toBase58()} (price=$${SHORT_ORACLE_PRICE_USD})`);

  // Set initial oracle prices
  await setOraclePrice(program, adminKp, longOracleKp, LONG_ORACLE_PRICE);
  await setOraclePrice(program, adminKp, shortOracleKp, SHORT_ORACLE_PRICE);
  console.log('  ✓ Oracle prices set');

  // ── wSOL: wrap enough SOL for all LONG vaults ─────────────────────────────
  const totalWsolNeeded = LONG_VAULT_AMOUNT * EXPIRY_DAYS.length;
  console.log(`\n[3/6] Wrapping ${(totalWsolNeeded / 1e9).toFixed(6)} SOL → wSOL…`);
  const wsolAta = await ensureWsolBalance(connection, adminKp, totalWsolNeeded);
  console.log(`  ✓ wSOL ATA: ${wsolAta.toBase58()}`);

  // ── USDC: mint enough for all SHORT vaults ─────────────────────────────────
  const totalUsdcNeeded = SHORT_VAULT_AMOUNT * EXPIRY_DAYS.length;
  console.log(`\n[4/6] Minting ${totalUsdcNeeded / 1_000_000} USDC for SHORT vault collateral…`);
  const usdcAtaInfo = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKp,
    usdcMint,
    adminKp.publicKey
  );
  const usdcAta = usdcAtaInfo.address;
  const usdcBal = await getAccount(connection, usdcAta);
  if (Number(usdcBal.amount) < totalUsdcNeeded) {
    const toMint = totalUsdcNeeded - Number(usdcBal.amount);
    await mintTo(connection, adminKp, usdcMint, usdcAta, adminKp, toMint);
    console.log(`  ✓ Minted ${toMint / 1_000_000} USDC`);
  } else {
    console.log(`  ✓ USDC balance sufficient (${Number(usdcBal.amount) / 1_000_000} USDC)`);
  }

  // ── Load or initialize seed state ─────────────────────────────────────────
  const seedState = loadSeedState();

  // ── Vault creation + splits ────────────────────────────────────────────────
  console.log('\n[5/6] Creating vaults and splits…');

  for (let ei = 0; ei < EXPIRY_DAYS.length; ei++) {
    const days = EXPIRY_DAYS[ei];
    const expiry = Math.floor(Date.now() / 1000) + days * 86_400;

    const longVaultId = new BN(LONG_VAULT_ID_BASE + ei);
    const shortVaultId = new BN(SHORT_VAULT_ID_BASE + ei);

    // Check if this expiry slot is already done
    const existingSlot = seedState.expirySlots.find(
      (s) => s.expiryDays === days && s.longVaultId === LONG_VAULT_ID_BASE + ei
    );
    if (existingSlot && existingSlot.callMints.length === STRIKES_USD.length) {
      console.log(`\n  Expiry ${days}d — already seeded, skipping vault/splits`);
      continue;
    }

    console.log(`\n  ── Expiry ${days}d (vault_id LONG=${LONG_VAULT_ID_BASE + ei}, SHORT=${SHORT_VAULT_ID_BASE + ei}) ──`);

    // Refresh oracle timestamps before vault creation
    await setOraclePrice(program, adminKp, longOracleKp, LONG_ORACLE_PRICE);
    await setOraclePrice(program, adminKp, shortOracleKp, SHORT_ORACLE_PRICE);

    // LONG vault
    console.log(`  Creating LONG vault (wSOL @ oracle=$${LONG_ORACLE_PRICE_USD})…`);
    const { vault: longVault, rootMint: longRootMint } = await createLongVault(
      program, adminKp, longVaultId, longOracleKp, wsolAta, expiry, PROGRAM_ID
    );
    console.log(`  ✓ LONG vault: ${longVault.toBase58()}`);

    // Chain-split LONG → CALL@120…CALL@240
    console.log('  Splitting CALL tokens:');
    const callMints = await chainSplitLong(
      program, connection, adminKp, longVaultId, longVault, longRootMint, longOracleKp, PROGRAM_ID
    );

    // SHORT vault
    console.log(`  Creating SHORT vault (USDC @ oracle=$${SHORT_ORACLE_PRICE_USD})…`);
    const { vault: shortVault, rootMint: shortRootMint } = await createShortVault(
      program, adminKp, shortVaultId, shortOracleKp, usdcMint, usdcAta, expiry, PROGRAM_ID
    );
    console.log(`  ✓ SHORT vault: ${shortVault.toBase58()}`);

    // Chain-split SHORT → PUT@240…PUT@120
    console.log('  Splitting PUT tokens:');
    const putMintsDesc = await chainSplitShort(
      program, connection, adminKp, shortVaultId, shortVault, shortRootMint, shortOracleKp, PROGRAM_ID
    );

    // Save to seed state
    seedState.expirySlots.push({
      expiryDays: days,
      longVaultId: LONG_VAULT_ID_BASE + ei,
      shortVaultId: SHORT_VAULT_ID_BASE + ei,
      callMints: callMints.map((p) => p.toBase58()),
      putMints: putMintsDesc.map((p) => p.toBase58()),
      ordersPosted: false,
    });
    saveSeedState(seedState);
  }

  // ── Post orders ────────────────────────────────────────────────────────────
  console.log('\n[6/6] Posting bid/ask orders to backend…');

  for (const slot of seedState.expirySlots) {
    if (slot.ordersPosted) {
      console.log(`  Expiry ${slot.expiryDays}d — orders already posted`);
      continue;
    }

    console.log(`\n  ── Expiry ${slot.expiryDays}d ──`);

    // CALL orders (indexed 0=CALL@120 … 12=CALL@240)
    for (let si = 0; si < STRIKES_USD.length; si++) {
      const mint = new PublicKey(slot.callMints[si]);
      await seedOrderBook(adminKp, mint, STRIKES_USD[si], slot.expiryDays, true);
    }

    // PUT orders (indexed 0=PUT@240 … 12=PUT@120)
    const strikesDesc = [...STRIKES_USD].reverse();
    for (let si = 0; si < strikesDesc.length; si++) {
      const mint = new PublicKey(slot.putMints[si]);
      await seedOrderBook(adminKp, mint, strikesDesc[si], slot.expiryDays, false);
    }

    slot.ordersPosted = true;
    saveSeedState(seedState);
  }

  // ── Write frontend constants ───────────────────────────────────────────────
  const constantsPath = path.join(__dirname, '../../frontend/src/lib/constants.ts');
  const callMintsByExpiryStrike: Record<string, string> = {};
  const putMintsByExpiryStrike: Record<string, string> = {};
  const strikesDesc = [...STRIKES_USD].reverse();

  for (const slot of seedState.expirySlots) {
    for (let si = 0; si < STRIKES_USD.length; si++) {
      const key = `CALL_${STRIKES_USD[si]}_${slot.expiryDays}D`;
      callMintsByExpiryStrike[key] = slot.callMints[si];
    }
    for (let si = 0; si < strikesDesc.length; si++) {
      const key = `PUT_${strikesDesc[si]}_${slot.expiryDays}D`;
      putMintsByExpiryStrike[key] = slot.putMints[si];
    }
  }

  const constantsContent = `// AUTO-GENERATED by scripts/seed-liquidity.ts — do not edit manually
// Re-run the script to regenerate after new vaults are seeded.

export const PROGRAM_ID = '${program.programId.toBase58()}';
export const USDC_MINT = '${usdcMint.toBase58()}';
export const LONG_ORACLE = '${longOracleKp.publicKey.toBase58()}';
export const SHORT_ORACLE = '${shortOracleKp.publicKey.toBase58()}';

export const CALL_MINTS: Record<string, string> = ${JSON.stringify(callMintsByExpiryStrike, null, 2)};

export const PUT_MINTS: Record<string, string> = ${JSON.stringify(putMintsByExpiryStrike, null, 2)};

export const STRIKES_USD = ${JSON.stringify(STRIKES_USD)};
export const EXPIRY_DAYS = ${JSON.stringify(EXPIRY_DAYS)};
`;

  // Only write if lib directory exists
  const libDir = path.join(__dirname, '../../frontend/src/lib');
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
  }
  fs.writeFileSync(constantsPath, constantsContent);
  console.log(`\n  ✓ Frontend constants written to ${constantsPath}`);

  console.log('\n' + '═'.repeat(60));
  console.log('  Seed liquidity complete!');
  console.log(`  ${EXPIRY_DAYS.length} expiries × ${STRIKES_USD.length} strikes`);
  console.log(`  = ${EXPIRY_DAYS.length * STRIKES_USD.length} CALL + ${EXPIRY_DAYS.length * STRIKES_USD.length} PUT tokens`);
  console.log(`  State saved to: ${SEED_STATE_FILE}`);
  console.log('═'.repeat(60));
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});

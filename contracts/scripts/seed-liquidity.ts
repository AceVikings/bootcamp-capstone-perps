/**
 * Raven Protocol — Devnet Seed Liquidity Script
 *
 * Creates a SOL/USD options chain on devnet using the actual on-chain IDL.
 *
 * Options structure:
 *   CALL chain (LONG vault, vault_side=0):
 *     Deposit USDC → get CALL@K + FLOOR@K root tokens
 *     Split CALL@K → CALL@K' + FLOOR@K' (K' = K + $10 per level)
 *     Resulting tokens: CALL@120 … CALL@240 (13 strikes)
 *
 *   PUT chain (SHORT vault, vault_side=1):
 *     Deposit USDC → get CAP@K + PUT@K root tokens
 *     Split CAP@K → CAP@K' + PUT@K' (K' = K - $10 per level)
 *     Resulting tokens: PUT@240 … PUT@120 (13 strikes)
 *
 * Prerequisites:
 *   1. anchor build && anchor deploy --provider.cluster devnet
 *   2. scripts/devnet-usdc-mint.json exists (created by devnet-init.ts)
 *   3. scripts/devnet-oracles.json exists with mock oracle keypairs
 *   4. Backend running (optional, for order seeding)
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
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from '@solana/spl-token';
import * as nacl from 'tweetnacl';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDL = require('../target/idl/tpp_protocol.json');

// Avoid TS deep inference issues on Program method chains
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnchorProgram = { methods: any; programId: PublicKey };

// ─── Config ──────────────────────────────────────────────────────────────────
const RPC_URL    = process.env.RPC_URL    ?? 'https://api.devnet.solana.com';
const WALLET_PATH = process.env.SEED_KEYPAIR ?? `${process.env.HOME}/.config/solana/tpp-devnet.json`;
const BACKEND_URL = process.env.BACKEND_URL ?? 'https://raven.vikings.studio/api';

const SCRIPTS_DIR    = path.join(__dirname);
const USDC_MINT_FILE = path.join(SCRIPTS_DIR, 'devnet-usdc-mint.json');
const ORACLES_FILE   = path.join(SCRIPTS_DIR, 'devnet-oracles.json');
const SEED_STATE_FILE = path.join(SCRIPTS_DIR, 'seed-state.json');

// ─── Options chain parameters ─────────────────────────────────────────────
const STRIKES_USD = [120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240];
const EXPIRY_DAYS = [2, 4, 6, 8, 10];

// Oracle prices for oracle refresh (current SOL mock price)
const ORACLE_PRICE_USD  = 180;                           // $180.00
const ORACLE_PRICE      = ORACLE_PRICE_USD * 1_000_000;  // 180_000_000 (6 dec)

// Collateral per vault (USDC, 6 dec): enough to produce meaningful token amounts
const VAULT_COLLATERAL = 26_000_000; // 26 USDC per vault

// Black-Scholes parameters
const SIGMA = 0.85;
const MARKET_PRICE_USD = 180;

// Vault ID offsets to avoid collision with devnet-init.ts vaults
const CALL_VAULT_ID_BASE  = 1000;
const PUT_VAULT_ID_BASE   = 2000;

// ─── PDA helpers (match actual contract seeds) ────────────────────────────

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

/** root_vault PDA: ["root_vault", owner, vault_id LE8] */
function rootVaultPda(owner: PublicKey, vaultId: BN, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('root_vault'),
      owner.toBuffer(),
      vaultId.toArrayLike(Buffer, 'le', 8),
    ],
    programId
  )[0];
}

/** long_mint PDA: ["long_mint", root_vault] */
function longMintPda(vault: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('long_mint'), vault.toBuffer()],
    programId
  )[0];
}

/** short_mint PDA: ["short_mint", root_vault] */
function shortMintPda(vault: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('short_mint'), vault.toBuffer()],
    programId
  )[0];
}

/** claim_node PDA: ["claim_node", root_vault, node_id LE8] */
function claimNodePda(vault: PublicKey, nodeId: BN, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('claim_node'),
      vault.toBuffer(),
      nodeId.toArrayLike(Buffer, 'le', 8),
    ],
    programId
  )[0];
}

/** left_child_mint PDA: ["left_child", root_vault, node_id LE8] */
function leftChildMintPda(vault: PublicKey, nodeId: BN, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('left_child'),
      vault.toBuffer(),
      nodeId.toArrayLike(Buffer, 'le', 8),
    ],
    programId
  )[0];
}

/** right_child_mint PDA: ["right_child", root_vault, node_id LE8] */
function rightChildMintPda(vault: PublicKey, nodeId: BN, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('right_child'),
      vault.toBuffer(),
      nodeId.toArrayLike(Buffer, 'le', 8),
    ],
    programId
  )[0];
}

// ─── Black-Scholes helpers ────────────────────────────────────────────────

function normCdf(x: number): number {
  const a1=0.3193815, a2=-0.3565638, a3=1.7814779, a4=-1.8212560, a5=1.3302744;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  const p = 1 - 0.3989422820 * Math.exp((-x * x) / 2) * poly;
  return x >= 0 ? p : 1 - p;
}

function bsCall(s: number, k: number, tYears: number, sigma: number): number {
  if (tYears <= 0) return Math.max(s - k, 0);
  const sqrtT = Math.sqrt(tYears);
  const d1 = (Math.log(s / k) + 0.5 * sigma * sigma * tYears) / (sigma * sqrtT);
  return s * normCdf(d1) - k * normCdf(d1 - sigma * sqrtT);
}

function bsPut(s: number, k: number, tYears: number, sigma: number): number {
  if (tYears <= 0) return Math.max(k - s, 0);
  const sqrtT = Math.sqrt(tYears);
  const d1 = (Math.log(s / k) + 0.5 * sigma * sigma * tYears) / (sigma * sqrtT);
  return k * normCdf(-(d1 - sigma * sqrtT)) - s * normCdf(-d1);
}

// ─── Oracle helpers ───────────────────────────────────────────────────────

function loadOrCreateOracleStore(): Keypair {
  if (fs.existsSync(ORACLES_FILE)) {
    const data = JSON.parse(fs.readFileSync(ORACLES_FILE, 'utf-8')) as Record<string, number[]>;
    if (data['SOL_SEED']) {
      return Keypair.fromSecretKey(new Uint8Array(data['SOL_SEED']));
    }
  }
  const kp = Keypair.generate();
  const existing: Record<string, number[]> = fs.existsSync(ORACLES_FILE)
    ? JSON.parse(fs.readFileSync(ORACLES_FILE, 'utf-8'))
    : {};
  existing['SOL_SEED'] = Array.from(kp.secretKey);
  fs.writeFileSync(ORACLES_FILE, JSON.stringify(existing, null, 2));
  return kp;
}

async function ensureOracleAccount(
  connection: Connection,
  payer: Keypair,
  oracleKp: Keypair,
  programId: PublicKey
): Promise<void> {
  const info = await connection.getAccountInfo(oracleKp.publicKey);
  if (info) {
    console.log(`  Oracle ${oracleKp.publicKey.toBase58().slice(0, 8)}… exists`);
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
  await sendAndConfirmTransaction(connection, tx, [payer, oracleKp], { commitment: 'confirmed' });
  console.log(`  Created oracle ${oracleKp.publicKey.toBase58()}`);
}

async function setOraclePrice(
  program: AnchorProgram,
  authority: Keypair,
  oracle: Keypair,
  priceUsd: number
): Promise<void> {
  // setMockOraclePrice takes a single arg: price_usd (u64).
  // The timestamp is written automatically from Clock::get() inside the program.
  await program.methods
    .setMockOraclePrice(new BN(priceUsd))
    .accounts({
      oracle: oracle.publicKey,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc({ commitment: 'confirmed' });
}

// ─── Order posting ────────────────────────────────────────────────────────

async function postOrder(
  admin: Keypair,
  tokenMint: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  priceUsdc: number
): Promise<boolean> {
  const nonce  = Math.floor(Math.random() * 1_000_000_000);
  const expiry = Math.floor(Date.now() / 1000) + 86400 * 30;
  const trader = admin.publicKey.toBase58();
  const msg    = `${trader}|${tokenMint}|${side}|${quantity}|${priceUsdc}|${nonce}|${expiry}`;
  const sig    = nacl.sign.detached(Buffer.from(msg, 'utf-8'), admin.secretKey);

  try {
    const resp = await fetch(`${BACKEND_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trader, token_mint: tokenMint, side, quantity,
        price_usdc: priceUsdc, nonce, expiry,
        signature: Buffer.from(sig).toString('base64'),
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.warn(`    Order ${side} failed: ${text.slice(0, 80)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`    Order post error: ${err}`);
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
  const mid = isCall
    ? bsCall(MARKET_PRICE_USD, strikeUsd, expiryDays / 365, SIGMA)
    : bsPut(MARKET_PRICE_USD, strikeUsd, expiryDays / 365, SIGMA);

  if (mid <= 0) return;

  const bidUsdc = Math.max(1,  Math.round(mid * 0.95 * 1_000_000));
  const askUsdc = Math.max(2,  Math.round(mid * 1.05 * 1_000_000));
  const qty     = 500_000;

  await postOrder(admin, mintPubkey.toBase58(), 'SELL', qty, askUsdc);
  await postOrder(admin, mintPubkey.toBase58(), 'BUY',  qty, bidUsdc);
  await postOrder(admin, mintPubkey.toBase58(), 'SELL', qty * 2, Math.round(askUsdc * 1.10));
  await postOrder(admin, mintPubkey.toBase58(), 'BUY',  qty * 2, Math.round(bidUsdc * 0.90));

  process.stdout.write(
    `  ${isCall ? 'CALL' : 'PUT'}@$${strikeUsd} (${expiryDays}d) bid=$${(bidUsdc/1e6).toFixed(2)} ask=$${(askUsdc/1e6).toFixed(2)}\n`
  );
}

// ─── Vault creation ───────────────────────────────────────────────────────

async function createOptionsVault(
  program: AnchorProgram,
  connection: Connection,
  admin: Keypair,
  vaultId: BN,
  collateralMint: PublicKey,
  ownerCollateralAta: PublicKey,
  oracle: Keypair,
  strikeUsd: number,  // in dollars (e.g. 180)
  expiryTs: number,   // unix timestamp
  vaultSide: number,  // 0=LONG(CALL), 1=SHORT(PUT)
  usdcMint: PublicKey,
  programId: PublicKey
): Promise<{ vault: PublicKey; longMint: PublicKey; shortMint: PublicKey }> {
  const vault     = rootVaultPda(admin.publicKey, vaultId, programId);
  const longMint  = longMintPda(vault, programId);
  const shortMint = shortMintPda(vault, programId);

  // Idempotent: skip if vault already exists on-chain
  const existing = await connection.getAccountInfo(vault);
  if (existing) {
    console.log(`  Vault ${vault.toBase58().slice(0, 8)}… already exists, skipping`);
    return { vault, longMint, shortMint };
  }

  const vaultCollateralAta = await getAssociatedTokenAddress(collateralMint, vault, true);
  const ownerLongAta       = await getAssociatedTokenAddress(longMint,  admin.publicKey);
  const ownerShortAta      = await getAssociatedTokenAddress(shortMint, admin.publicKey);
  const treasuryAta        = await getAssociatedTokenAddress(usdcMint,  feeTreasuryPda(programId), true);

  const feedPubkey = oracle.publicKey; // using oracle pubkey as feed ID for mock mode

  await program.methods
    .createRootVault(
      vaultId,
      feedPubkey,
      new BN(VAULT_COLLATERAL),
      new BN(strikeUsd * 1_000_000),   // strike in micro-USD
      new BN(expiryTs),
      vaultSide
    )
    .accounts({
      config: configPda(programId),
      rootVault: vault,
      longMint,
      shortMint,
      ownerCollateralAta,
      vaultCollateralAta,
      ownerLongAta,
      ownerShortAta,
      treasuryCollateralAta: treasuryAta,
      collateralMint,
      feeTreasury: feeTreasuryPda(programId),
      oracle: oracle.publicKey,
      owner: admin.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([admin])
    .rpc({ commitment: 'confirmed' });

  return { vault, longMint, shortMint };
}

// ─── Chain split helpers ──────────────────────────────────────────────────

/**
 * Splits a CALL (long_mint) chain for a LONG vault:
 *   Level 0 source: longMint (root CALL@rootStrike)
 *   Each split: burn source → left_child (CALL@nextStrike) + right_child (FLOOR@nextStrike)
 *   Next source: left_child_mint (the deeper CALL)
 *
 * Returns CALL mint at each strike level (callMints[0] = CALL@strikes[0])
 */
async function chainSplitCall(
  program: AnchorProgram,
  connection: Connection,
  admin: Keypair,
  vaultId: BN,
  vault: PublicKey,
  rootLongMint: PublicKey,
  oracle: Keypair,
  strikes: number[], // ascending, e.g. [120,130,...,240]
  expiryTs: number,
  programId: PublicKey
): Promise<PublicKey[]> {
  const callMints: PublicKey[] = [];
  let sourceMint = rootLongMint;
  let parentAccount = vault; // depth-1 split: parent = vault

  for (let i = 0; i < strikes.length; i++) {
    const nodeId    = new BN(i);
    const childStrikeUsd = strikes[i]; // CALL@strikes[i]

    const nodePda   = claimNodePda(vault, nodeId, programId);
    const leftMint  = leftChildMintPda(vault, nodeId, programId);
    const rightMint = rightChildMintPda(vault, nodeId, programId);

    const srcAta    = await getAssociatedTokenAddress(sourceMint, admin.publicKey);
    const leftAta   = await getAssociatedTokenAddress(leftMint,   admin.publicKey);
    const rightAta  = await getAssociatedTokenAddress(rightMint,  admin.publicKey);

    // Refresh oracle before each split
    // Check if this split already happened
    const nodeExists = await connection.getAccountInfo(nodePda);
    if (nodeExists) {
      process.stdout.write(`  CALL@$${childStrikeUsd}(cached) `);
      callMints.push(leftMint);
      sourceMint    = leftMint;
      parentAccount = nodePda;
      continue;
    }

    await setOraclePrice(program, admin, oracle, ORACLE_PRICE);

    const srcBalance = await getAccount(connection, srcAta);
    const splitAmt   = Number(srcBalance.amount);
    if (splitAmt === 0) {
      console.warn(`  Skipping CALL@$${childStrikeUsd}: source balance is 0`);
      callMints.push(leftMint);
      continue;
    }

    await program.methods
      .splitClaim(
        vaultId,
        nodeId,
        new BN(splitAmt),
        new BN(childStrikeUsd * 1_000_000) // child_strike in micro-USD
      )
      .accounts({
        config: configPda(programId),
        rootVault: vault,
        claimNode: nodePda,
        leftChildMint: leftMint,
        rightChildMint: rightMint,
        sourceMint,
        callerSourceAta: srcAta,
        callerLeftAta: leftAta,
        callerRightAta: rightAta,
        parentAccount,
        oracle: oracle.publicKey,
        caller: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc({ commitment: 'confirmed' });

    callMints.push(leftMint); // left_child = CALL@childStrike
    process.stdout.write(`  CALL@$${childStrikeUsd} `);

    // Next source is the left_child of this split (deeper CALL)
    sourceMint    = leftMint;
    parentAccount = nodePda;
  }
  console.log();
  return callMints;
}

/**
 * Splits a PUT (short_mint from a SHORT vault) chain:
 *   Level 0 source: shortMint (root PUT@rootStrike) — actually use longMint (CAP) as source
 *   Each split: burn CAP → left_child (CAP@prevStrike) + right_child (PUT@prevStrike)
 *   Next source: left_child_mint (the shallower CAP)
 *
 * For a SHORT vault, vault_side=1:
 *   long_mint = CAP token (bounded upside)
 *   short_mint = PUT token (downside)
 *
 * When splitting CAP@K:
 *   left_child  = CAP@K' (K' < K, shallower)
 *   right_child = PUT@K' (payoff if price < K')
 *
 * Returns PUT mint at each strike level (putMints[0] = PUT@strikes[0])
 * Strikes are in descending order for PUTs: [240, 230, ..., 120]
 */
async function chainSplitPut(
  program: AnchorProgram,
  connection: Connection,
  admin: Keypair,
  vaultId: BN,
  vault: PublicKey,
  rootLongMint: PublicKey, // CAP token from SHORT vault
  oracle: Keypair,
  strikesDesc: number[], // descending, e.g. [240,230,...,120]
  expiryTs: number,
  programId: PublicKey
): Promise<PublicKey[]> {
  const putMints: PublicKey[] = [];
  let sourceMint = rootLongMint; // CAP token
  let parentAccount = vault;

  for (let i = 0; i < strikesDesc.length; i++) {
    const nodeId    = new BN(i);
    const childStrikeUsd = strikesDesc[i];

    const nodePda   = claimNodePda(vault, nodeId, programId);
    const leftMint  = leftChildMintPda(vault, nodeId, programId);
    const rightMint = rightChildMintPda(vault, nodeId, programId);

    const srcAta    = await getAssociatedTokenAddress(sourceMint, admin.publicKey);
    const leftAta   = await getAssociatedTokenAddress(leftMint,   admin.publicKey);
    const rightAta  = await getAssociatedTokenAddress(rightMint,  admin.publicKey);

    // Check if this split already happened
    const nodeExists = await connection.getAccountInfo(nodePda);
    if (nodeExists) {
      process.stdout.write(`  PUT@$${childStrikeUsd}(cached) `);
      putMints.push(rightMint);
      sourceMint    = leftMint;
      parentAccount = nodePda;
      continue;
    }

    await setOraclePrice(program, admin, oracle, ORACLE_PRICE);

    const srcBalance = await getAccount(connection, srcAta);
    const splitAmt   = Number(srcBalance.amount);
    if (splitAmt === 0) {
      console.warn(`  Skipping PUT@$${childStrikeUsd}: source balance is 0`);
      putMints.push(rightMint);
      continue;
    }

    await program.methods
      .splitClaim(
        vaultId,
        nodeId,
        new BN(splitAmt),
        new BN(childStrikeUsd * 1_000_000)
      )
      .accounts({
        config: configPda(programId),
        rootVault: vault,
        claimNode: nodePda,
        leftChildMint: leftMint,
        rightChildMint: rightMint,
        sourceMint,
        callerSourceAta: srcAta,
        callerLeftAta: leftAta,
        callerRightAta: rightAta,
        parentAccount,
        oracle: oracle.publicKey,
        caller: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc({ commitment: 'confirmed' });

    putMints.push(rightMint); // right_child = PUT@childStrike
    process.stdout.write(`  PUT@$${childStrikeUsd} `);

    sourceMint    = leftMint; // Next CAP (deeper)
    parentAccount = nodePda;
  }
  console.log();
  return putMints;
}

// ─── Seed state persistence ───────────────────────────────────────────────

interface ExpirySlot {
  expiryDays: number;
  callVaultId: number;
  putVaultId: number;
  callMints: string[];   // [CALL@120 … CALL@240]
  putMints: string[];    // [PUT@240 … PUT@120]
  ordersPosted: boolean;
}

interface SeedState {
  expirySlots: ExpirySlot[];
}

function loadSeedState(): SeedState {
  if (fs.existsSync(SEED_STATE_FILE)) {
    return JSON.parse(fs.readFileSync(SEED_STATE_FILE, 'utf-8'));
  }
  return { expirySlots: [] };
}

function saveSeedState(state: SeedState): void {
  fs.writeFileSync(SEED_STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ── Load keypairs ────────────────────────────────────────────────────────
  const adminKp = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );

  if (!fs.existsSync(USDC_MINT_FILE)) {
    console.error(`ERROR: ${USDC_MINT_FILE} not found.\nRun devnet-init.ts first.`);
    process.exit(1);
  }
  const usdcMintKp = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(USDC_MINT_FILE, 'utf-8')))
  );
  const usdcMint = usdcMintKp.publicKey;

  // ── Connect ──────────────────────────────────────────────────────────────
  const connection = new Connection(RPC_URL, 'confirmed');
  const provider   = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(adminKp),
    { commitment: 'confirmed' }
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program: AnchorProgram = new anchor.Program(IDL as any, provider);
  const PROGRAM_ID = program.programId;

  const balance = await connection.getBalance(adminKp.publicKey);
  console.log('═'.repeat(60));
  console.log('  Raven Protocol — Seed Liquidity');
  console.log('═'.repeat(60));
  console.log(`  Admin    : ${adminKp.publicKey.toBase58()}`);
  console.log(`  Program  : ${PROGRAM_ID.toBase58()}`);
  console.log(`  SOL bal  : ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`  USDC mint: ${usdcMint.toBase58()}`);
  console.log('─'.repeat(60));

  if (balance < 0.3 * LAMPORTS_PER_SOL) {
    console.error('ERROR: Need at least 0.3 SOL. Fund the wallet first.');
    process.exit(1);
  }

  // ── Protocol config ──────────────────────────────────────────────────────
  const cfgPda = configPda(PROGRAM_ID);
  const ftPda  = feeTreasuryPda(PROGRAM_ID);
  const cfgInfo = await connection.getAccountInfo(cfgPda);

  if (!cfgInfo) {
    console.log('\n[1/5] Initializing protocol config…');
    await program.methods
      .initialize(
        10,              // mint_fee_bps = 0.10%
        10,              // split_fee_bps
        10,              // merge_fee_bps
        10,              // redeem_fee_bps
        10,              // trade_fee_bps
        30,              // max_recursive_depth (depth grows 2x per level; 13 strikes needs ≥26)
        new BN(0),       // oracle_conf_denominator (0 = disabled)
        new BN(3600)     // max_oracle_age_secs
      )
      .accounts({
        config: cfgPda,
        feeTreasury: ftPda,
        admin: adminKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKp])
      .rpc({ commitment: 'confirmed' });
    console.log('  Protocol initialized ✓');
  } else {
    console.log('\n[1/5] Protocol config already exists — ensuring max_recursive_depth=30…');
    // Bump depth limit so the 13-strike chain works (needs ≥ 26)
    await program.methods
      .updateConfig(30, new BN(0), new BN(3600))
      .accounts({ config: cfgPda, admin: adminKp.publicKey })
      .signers([adminKp])
      .rpc({ commitment: 'confirmed' });
    console.log('  Depth limit updated ✓');
  }

  // ── Oracle account ───────────────────────────────────────────────────────
  console.log('\n[2/5] Setting up mock oracle…');
  const oracleKp = loadOrCreateOracleStore();
  await ensureOracleAccount(connection, adminKp, oracleKp, PROGRAM_ID);
  await setOraclePrice(program, adminKp, oracleKp, ORACLE_PRICE);
  console.log(`  Oracle  : ${oracleKp.publicKey.toBase58()} (price=$${ORACLE_PRICE_USD})`);

  // ── USDC: mint enough for all vaults ─────────────────────────────────────
  const totalUsdcNeeded = VAULT_COLLATERAL * EXPIRY_DAYS.length * 2; // CALL + PUT per expiry
  console.log(`\n[3/5] Ensuring ${totalUsdcNeeded / 1_000_000} USDC for vault collateral…`);
  const usdcAtaInfo = await getOrCreateAssociatedTokenAccount(
    connection, adminKp, usdcMint, adminKp.publicKey
  );
  const usdcAta = usdcAtaInfo.address;
  const usdcBal = await getAccount(connection, usdcAta);
  if (Number(usdcBal.amount) < totalUsdcNeeded) {
    const toMint = totalUsdcNeeded - Number(usdcBal.amount);
    await mintTo(connection, adminKp, usdcMint, usdcAta, adminKp, toMint);
    console.log(`  Minted ${toMint / 1_000_000} USDC ✓`);
  } else {
    console.log(`  Balance sufficient (${Number(usdcBal.amount) / 1_000_000} USDC) ✓`);
  }

  // ── Load seed state ───────────────────────────────────────────────────────
  const seedState = loadSeedState();

  // ── Create vaults + splits ────────────────────────────────────────────────
  console.log('\n[4/5] Creating vaults and splits…');

  const strikesAsc  = STRIKES_USD;                          // [120 … 240]
  const strikesDesc = [...STRIKES_USD].reverse();           // [240 … 120]

  for (let ei = 0; ei < EXPIRY_DAYS.length; ei++) {
    const days       = EXPIRY_DAYS[ei];
    const expiryTs   = Math.floor(Date.now() / 1000) + days * 86_400;
    const callVaultId = new BN(CALL_VAULT_ID_BASE + ei);
    const putVaultId  = new BN(PUT_VAULT_ID_BASE  + ei);

    const existingSlot = seedState.expirySlots.find(
      s => s.expiryDays === days && s.callVaultId === CALL_VAULT_ID_BASE + ei
    );
    if (existingSlot && existingSlot.callMints.length === STRIKES_USD.length) {
      console.log(`\n  Expiry ${days}d — already seeded ✓`);
      continue;
    }

    console.log(`\n  ── Expiry ${days}d (CALL vault_id=${CALL_VAULT_ID_BASE + ei}, PUT vault_id=${PUT_VAULT_ID_BASE + ei}) ──`);

    // Refresh oracle
    await setOraclePrice(program, adminKp, oracleKp, ORACLE_PRICE);

    // ── CALL vault (vault_side=0, strike = lowest strike - $10) ────────────
    // Root vault strike = $110 (one step below $120 first target strike)
    const callRootStrike = STRIKES_USD[0] - 10; // $110
    console.log(`  Creating CALL vault (strike=$${callRootStrike}, expiry=${days}d)…`);
    const { vault: callVault, longMint: callLongMint } = await createOptionsVault(
      program, connection, adminKp, callVaultId, usdcMint, usdcAta,
      oracleKp, callRootStrike, expiryTs, 0, usdcMint, PROGRAM_ID
    );
    console.log(`  CALL vault: ${callVault.toBase58()}`);

    // Chain-split: CALL@110 → CALL@120 → CALL@130 → … → CALL@240
    console.log('  Splitting CALL chain…');
    const callMints = await chainSplitCall(
      program, connection, adminKp,
      callVaultId, callVault, callLongMint,
      oracleKp, strikesAsc, expiryTs, PROGRAM_ID
    );

    // ── PUT vault (vault_side=1, strike = highest strike + $10) ────────────
    const putRootStrike = STRIKES_USD[STRIKES_USD.length - 1] + 10; // $250
    console.log(`  Creating PUT vault (strike=$${putRootStrike}, expiry=${days}d)…`);
    const { vault: putVault, longMint: putCapMint } = await createOptionsVault(
      program, connection, adminKp, putVaultId, usdcMint, usdcAta,
      oracleKp, putRootStrike, expiryTs, 1, usdcMint, PROGRAM_ID
    );
    console.log(`  PUT vault: ${putVault.toBase58()}`);

    // Chain-split: CAP@250 → PUT@240 + CAP@240 → PUT@230 + … → PUT@120
    console.log('  Splitting PUT chain…');
    const putMints = await chainSplitPut(
      program, connection, adminKp,
      putVaultId, putVault, putCapMint,
      oracleKp, strikesDesc, expiryTs, PROGRAM_ID
    );

    // Save to state
    seedState.expirySlots.push({
      expiryDays: days,
      callVaultId: CALL_VAULT_ID_BASE + ei,
      putVaultId:  PUT_VAULT_ID_BASE  + ei,
      callMints: callMints.map(p => p.toBase58()),
      putMints:  putMints.map(p => p.toBase58()),
      ordersPosted: false,
    });
    saveSeedState(seedState);
  }

  // ── Post orders ───────────────────────────────────────────────────────────
  console.log('\n[5/5] Posting bid/ask orders to backend…');

  for (const slot of seedState.expirySlots) {
    if (slot.ordersPosted) {
      console.log(`  Expiry ${slot.expiryDays}d — orders already posted ✓`);
      continue;
    }

    console.log(`\n  ── Expiry ${slot.expiryDays}d ──`);

    // CALL orders [0]=CALL@120 … [12]=CALL@240
    for (let si = 0; si < strikesAsc.length; si++) {
      await seedOrderBook(adminKp, new PublicKey(slot.callMints[si]), strikesAsc[si], slot.expiryDays, true);
    }

    // PUT orders [0]=PUT@240 … [12]=PUT@120
    for (let si = 0; si < strikesDesc.length; si++) {
      await seedOrderBook(adminKp, new PublicKey(slot.putMints[si]), strikesDesc[si], slot.expiryDays, false);
    }

    slot.ordersPosted = true;
    saveSeedState(seedState);
  }

  // ── Write frontend constants ──────────────────────────────────────────────
  const libDir       = path.join(__dirname, '../../frontend/src/lib');
  const constantsPath = path.join(libDir, 'constants.ts');

  if (fs.existsSync(libDir)) {
    const callMintsByKey: Record<string, string> = {};
    const putMintsByKey:  Record<string, string> = {};

    for (const slot of seedState.expirySlots) {
      for (let si = 0; si < strikesAsc.length; si++) {
        callMintsByKey[`CALL_${strikesAsc[si]}_${slot.expiryDays}D`] = slot.callMints[si];
      }
      for (let si = 0; si < strikesDesc.length; si++) {
        putMintsByKey[`PUT_${strikesDesc[si]}_${slot.expiryDays}D`] = slot.putMints[si];
      }
    }

    const content = `// AUTO-GENERATED by scripts/seed-liquidity.ts — do not edit manually
export const PROGRAM_ID   = '${program.programId.toBase58()}';
export const USDC_MINT    = '${usdcMint.toBase58()}';
export const SOL_ORACLE   = '${oracleKp.publicKey.toBase58()}';
export const CONFIG_PDA   = '${configPda(PROGRAM_ID).toBase58()}';
export const FEE_TREASURY_PDA = '${feeTreasuryPda(PROGRAM_ID).toBase58()}';

export const CALL_MINTS: Record<string, string> = ${JSON.stringify(callMintsByKey, null, 2)};

export const PUT_MINTS: Record<string, string> = ${JSON.stringify(putMintsByKey, null, 2)};

export const STRIKES_USD = ${JSON.stringify(strikesAsc)};
export const EXPIRY_DAYS = ${JSON.stringify(EXPIRY_DAYS)};
`;
    fs.writeFileSync(constantsPath, content);
    console.log(`\n  Frontend constants written to ${constantsPath}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  Seed complete!');
  console.log(`  ${EXPIRY_DAYS.length} expiries × ${STRIKES_USD.length} strikes`);
  console.log(`  = ${EXPIRY_DAYS.length * STRIKES_USD.length} CALL + ${EXPIRY_DAYS.length * STRIKES_USD.length} PUT option mints`);
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});

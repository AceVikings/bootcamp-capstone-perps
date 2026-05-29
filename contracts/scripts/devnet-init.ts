/**
 * Fractal Markets — one-time devnet initialisation script
 *
 * Run with:
 *   cd contracts
 *   npx ts-node -P tsconfig.json scripts/devnet-init.ts
 *
 * What it does:
 *  1. Checks whether the protocol config PDA already exists; calls `initialize`
 *     if not.
 *  2. Creates a test-USDC SPL-token mint (or reuses the one saved in
 *     scripts/devnet-usdc-mint.json).
 *  3. Creates mock-oracle accounts (16 bytes, owned by the program) for each
 *     market — or reuses the keypairs saved in scripts/devnet-oracles.json.
 *  4. Sets initial oracle prices.
 *  5. Writes `frontend/src/lib/constants.ts` with all the generated pubkeys so
 *     the frontend never needs to derive them at run-time.
 */

import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const idl = require('../target/idl/tpp_protocol.json');

// ─── Config ──────────────────────────────────────────────────────────────────

const RPC_URL = 'https://api.devnet.solana.com';
const WALLET_PATH = `${process.env.HOME}/.config/solana/tpp-devnet.json`;

// Prices: 6 decimal USD (e.g. $68 420.00 → 68_420_000_000)
const MARKETS = [
  {
    name: 'BTC/USD',
    feedId: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    initPrice: 68_420_000_000,
  },
  {
    name: 'ETH/USD',
    feedId: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    initPrice: 3_847_000_000,
  },
  {
    name: 'SOL/USD',
    feedId: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    initPrice: 182_470_000,
  },
];

const SCRIPTS_DIR = path.join(__dirname);
const ORACLE_KPS_FILE = path.join(SCRIPTS_DIR, 'devnet-oracles.json');
const USDC_MINT_FILE = path.join(SCRIPTS_DIR, 'devnet-usdc-mint.json');
const FRONTEND_CONSTANTS_FILE = path.join(
  __dirname,
  '../../frontend/src/lib/constants.ts'
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadOrCreate(filePath: string): Keypair {
  if (fs.existsSync(filePath)) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(raw));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

function loadOracleKps(): Record<string, number[]> {
  if (fs.existsSync(ORACLE_KPS_FILE)) {
    return JSON.parse(fs.readFileSync(ORACLE_KPS_FILE, 'utf-8'));
  }
  return {};
}

function saveOracleKps(kps: Record<string, number[]>): void {
  fs.writeFileSync(ORACLE_KPS_FILE, JSON.stringify(kps, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ─── Provider ──────────────────────────────────────────────────────────────
  const adminKp = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  const connection = new Connection(RPC_URL, 'confirmed');
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(adminKp),
    { commitment: 'confirmed' }
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new anchor.Program(idl as any, provider);
  const PROGRAM_ID = program.programId;

  console.log('Admin wallet   :', adminKp.publicKey.toBase58());
  console.log('Program ID     :', PROGRAM_ID.toBase58());

  const balance = await connection.getBalance(adminKp.publicKey);
  console.log('Balance        :', (balance / 1e9).toFixed(4), 'SOL');

  // ─── Protocol Config PDA ───────────────────────────────────────────────────
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_config')],
    PROGRAM_ID
  );
  const [feeTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('fee_treasury')],
    PROGRAM_ID
  );

  console.log('\n─── Protocol Config ───────────────────────────────────');
  const configInfo = await connection.getAccountInfo(configPda);
  if (!configInfo) {
    console.log('Initializing protocol config…');
    await program.methods
      .initialize(
        10,   // mint_fee_bps
        10,   // split_fee_bps
        10,   // merge_fee_bps
        10,   // redeem_fee_bps
        10,   // trade_fee_bps
        5,    // max_recursive_depth
        new anchor.BN(0),    // oracle_conf_denominator (0 = disabled)
        new anchor.BN(3600)  // max_oracle_age_secs
      )
      .accounts({
        config: configPda,
        feeTreasury: feeTreasuryPda,
        admin: adminKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: 'confirmed' });
    console.log('Protocol initialized ✓');
  } else {
    console.log('Protocol config already exists at', configPda.toBase58(), '✓');
  }

  // ─── Test USDC Mint ────────────────────────────────────────────────────────
  console.log('\n─── Test USDC Mint ────────────────────────────────────');
  const usdcMintKp = loadOrCreate(USDC_MINT_FILE);
  const usdcMintPubkey = usdcMintKp.publicKey;

  const mintInfo = await connection.getAccountInfo(usdcMintPubkey);
  if (!mintInfo) {
    console.log('Creating test USDC mint…');
    await createMint(
      connection,
      adminKp,
      adminKp.publicKey, // mint authority
      null,              // freeze authority
      6,                 // decimals
      usdcMintKp
    );
    console.log('Test USDC mint created:', usdcMintPubkey.toBase58(), '✓');

    // Mint initial supply to admin
    const adminAta = await getOrCreateAssociatedTokenAccount(
      connection,
      adminKp,
      usdcMintPubkey,
      adminKp.publicKey
    );
    await mintTo(
      connection,
      adminKp,
      usdcMintPubkey,
      adminAta.address,
      adminKp,
      100_000_000_000 // 100,000 USDC
    );
    console.log('Minted 100,000 USDC to admin ✓');
  } else {
    console.log('Test USDC mint already exists:', usdcMintPubkey.toBase58(), '✓');
  }

  // ─── Oracle Accounts ──────────────────────────────────────────────────────
  console.log('\n─── Oracle Accounts ───────────────────────────────────');
  const oracleSecretKeys = loadOracleKps();
  const oraclePubkeys: Record<string, string> = {};

  for (const market of MARKETS) {
    let oracleKp: Keypair;
    if (oracleSecretKeys[market.name]) {
      oracleKp = Keypair.fromSecretKey(new Uint8Array(oracleSecretKeys[market.name]));
    } else {
      oracleKp = Keypair.generate();
      oracleSecretKeys[market.name] = Array.from(oracleKp.secretKey);
      saveOracleKps(oracleSecretKeys);
    }

    const oracleInfo = await connection.getAccountInfo(oracleKp.publicKey);
    if (!oracleInfo) {
      console.log(`Creating oracle for ${market.name}…`);
      const space = 16;
      const lamports = await connection.getMinimumBalanceForRentExemption(space);
      const createTx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: adminKp.publicKey,
          newAccountPubkey: oracleKp.publicKey,
          lamports,
          space,
          programId: PROGRAM_ID,
        })
      );
      await sendAndConfirmTransaction(connection, createTx, [adminKp, oracleKp], {
        commitment: 'confirmed',
      });
      console.log(`  Oracle created: ${oracleKp.publicKey.toBase58()}`);
    } else {
      console.log(`  Oracle exists:  ${oracleKp.publicKey.toBase58()} (${market.name})`);
    }

    // Set (or refresh) oracle price
    await program.methods
      .setMockOraclePrice(new anchor.BN(market.initPrice))
      .accounts({
        oracle: oracleKp.publicKey,
        authority: adminKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: 'confirmed' });
    console.log(`  Price set: $${(market.initPrice / 1_000_000).toFixed(2)} ✓`);

    oraclePubkeys[market.name] = oracleKp.publicKey.toBase58();
  }

  // ─── Write frontend/src/lib/constants.ts ──────────────────────────────────
  console.log('\n─── Writing frontend constants ─────────────────────────');
  const constantsContent = `// ─────────────────────────────────────────────────────────────────────────
// AUTO-GENERATED by contracts/scripts/devnet-init.ts — do NOT edit manually
// Re-run \`npx ts-node -P tsconfig.json scripts/devnet-init.ts\` to update.
// ─────────────────────────────────────────────────────────────────────────

export const PROGRAM_ID = '${PROGRAM_ID.toBase58()}';
export const USDC_MINT = '${usdcMintPubkey.toBase58()}';
export const CONFIG_PDA = '${configPda.toBase58()}';
export const FEE_TREASURY_PDA = '${feeTreasuryPda.toBase58()}';

export interface MarketDef {
  label: string;
  feedId: string;   // 32-byte Pyth price feed ID (hex, no 0x prefix)
  oracle: string;   // devnet mock oracle account pubkey
}

export const MARKETS: MarketDef[] = [
${MARKETS.map(
  m =>
    `  { label: '${m.name}', feedId: '${m.feedId}', oracle: '${oraclePubkeys[m.name]}' },`
).join('\n')}
];
`;

  fs.writeFileSync(FRONTEND_CONSTANTS_FILE, constantsContent, 'utf-8');
  console.log('Wrote', FRONTEND_CONSTANTS_FILE, '✓');

  console.log('\n=== Summary ===');
  console.log('PROGRAM_ID       :', PROGRAM_ID.toBase58());
  console.log('CONFIG_PDA       :', configPda.toBase58());
  console.log('FEE_TREASURY_PDA :', feeTreasuryPda.toBase58());
  console.log('USDC_MINT        :', usdcMintPubkey.toBase58());
  for (const [name, pubkey] of Object.entries(oraclePubkeys)) {
    console.log(`Oracle ${name.padEnd(8)}: ${pubkey}`);
  }
  console.log('\nDone ✓');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

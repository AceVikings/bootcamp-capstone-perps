/**
 * Creates a mock wSOL SPL token mint on devnet.
 *
 * Real wSOL (Native Mint) can't be freely minted — it requires wrapping SOL.
 * For demos we use a custom SPL token with 9 decimals that behaves like wSOL
 * and can be freely minted from the faucet.
 *
 * Run: npx ts-node -P tsconfig.json scripts/create-wsol-mint.ts
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const WALLET_PATH    = `${process.env.HOME}/.config/solana/tpp-devnet.json`;
const WSOL_MINT_FILE = path.join(__dirname, 'devnet-wsol-mint.json');

async function main() {
  const payer = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

  // Idempotent — skip if mint file already exists and the account is on-chain
  if (fs.existsSync(WSOL_MINT_FILE)) {
    const saved = JSON.parse(fs.readFileSync(WSOL_MINT_FILE, 'utf-8'));
    const existingMint = new PublicKey(saved.mint);
    const info = await conn.getAccountInfo(existingMint);
    if (info) {
      console.log('Mock wSOL mint already exists:', existingMint.toBase58());
      console.log('Run devnet-init.ts to add it to frontend constants.');
      return;
    }
  }

  console.log('Creating mock wSOL mint (9 decimals, payer = authority)...');

  // Dedicated keypair for the mint account itself
  const mintKp = Keypair.generate();

  const mint = await createMint(
    conn,
    payer,           // payer
    payer.publicKey, // mint authority — same as keeper → faucet can mint freely
    null,            // no freeze authority
    9,               // 9 decimals — matches real wSOL (1 SOL = 1_000_000_000)
    mintKp
  );

  // Persist both the pubkey and the keypair secret
  fs.writeFileSync(WSOL_MINT_FILE, JSON.stringify({
    mint:   mint.toBase58(),
    secret: Array.from(mintKp.secretKey),
  }, null, 2));

  console.log('Mock wSOL mint created:', mint.toBase58());
  console.log('Keypair saved to:', WSOL_MINT_FILE, '(gitignored)');

  // Mint 100 wSOL to payer for seeding / tests
  const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
  await mintTo(conn, payer, mint, ata.address, payer, 100_000_000_000n);
  console.log('Minted 100 mock wSOL to payer:', ata.address.toBase58());

  console.log('\nNext: add to .env on VM:');
  console.log(`  WSOL_MINT=${mint.toBase58()}`);
}

main().catch(e => { console.error(e?.message ?? e); process.exit(1); });

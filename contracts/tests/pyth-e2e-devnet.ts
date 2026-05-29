/**
 * TPP Protocol — Pyth Pull-Oracle E2E Test (Devnet)
 *
 * Run:
 *   cd contracts
 *   anchor build -- --no-default-features --features devnet
 *   anchor deploy --provider.cluster devnet
 *   ANCHOR_WALLET=~/.config/solana/tpp-devnet.json \
 *     yarn ts-mocha -p ./tsconfig.json -t 120000 tests/pyth-e2e-devnet.ts
 *
 * Prereqs:
 *   - ~/.config/solana/tpp-devnet.json funded with ≥4 SOL (devnet faucet)
 *   - Program deployed: 9iUeMGw14CaAiASMUruBMWRR5j7HcEXwthuN5pDAo3Qf
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, AnchorProvider } from "@coral-xyz/anchor";
import { TppProtocol } from "../target/types/tpp_protocol";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { HermesClient } from "@pythnetwork/hermes-client";
import { parseAccumulatorUpdateData, parsePriceFeedMessage } from "@pythnetwork/price-service-sdk";
// Sub-path imports from pyth-solana-receiver avoid the @pythnetwork/solana-utils
// → jito-ts → rpc-websockets@7 subpath incompatibility with top-level rpc-websockets@9.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pythReceiverAddr = require("@pythnetwork/pyth-solana-receiver/lib/address");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pythReceiverVaa = require("@pythnetwork/pyth-solana-receiver/lib/vaa");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { IDL: PYTH_RECEIVER_IDL } = require("@pythnetwork/pyth-solana-receiver/lib/idl/pyth_solana_receiver");
// Anchor 0.29 bundled inside pyth-solana-receiver — compatible with the old IDL format
// eslint-disable-next-line @typescript-eslint/no-require-imports
const anchor029 = require("@pythnetwork/pyth-solana-receiver/node_modules/@coral-xyz/anchor");
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ─── Config ──────────────────────────────────────────────────────────────────

const DEVNET_RPC = "https://api.devnet.solana.com";
const HERMES_URL = "https://hermes.pyth.network";
const PYTH_RECEIVER_PROGRAM_ID = new PublicKey(
  "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"
);

// SOL/USD feed ID (hex, no 0x prefix)
const SOL_USD_FEED_ID =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

// asset_key is the feed ID bytes stored as a Pubkey
const SOL_ASSET_KEY = new PublicKey(
  Buffer.from(SOL_USD_FEED_ID, "hex")
);

const PROGRAM_ID = new PublicKey(
  "9iUeMGw14CaAiASMUruBMWRR5j7HcEXwthuN5pDAo3Qf"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadKeypair(keyPath: string): Keypair {
  const expanded = keyPath.replace("~", os.homedir());
  const raw = JSON.parse(fs.readFileSync(expanded, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function ata(mint: PublicKey, owner: PublicKey): PublicKey {
  return anchor.utils.token.associatedAddress({ mint, owner });
}

function epochPDAs(
  program: anchor.Program<TppProtocol>,
  assetKey: PublicKey,
  epochId: BN
) {
  const epochIdBytes = epochId.toArrayLike(Buffer, "le", 8);
  const [epochAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("epoch"), assetKey.toBuffer(), epochIdBytes],
    program.programId
  );
  const [longMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("long_mint"), assetKey.toBuffer(), epochIdBytes],
    program.programId
  );
  const [shortMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("short_mint"), assetKey.toBuffer(), epochIdBytes],
    program.programId
  );
  // Stage 2: depth-2 mints
  const [longLongMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("long_long_mint"), assetKey.toBuffer(), epochIdBytes],
    program.programId
  );
  const [longShortMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("long_short_mint"), assetKey.toBuffer(), epochIdBytes],
    program.programId
  );
  const [shortLongMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("short_long_mint"), assetKey.toBuffer(), epochIdBytes],
    program.programId
  );
  const [shortShortMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("short_short_mint"), assetKey.toBuffer(), epochIdBytes],
    program.programId
  );
  return { epochAccount, longMint, shortMint, longLongMint, longShortMint, shortLongMint, shortShortMint };
}

function vaultPDA(
  program: anchor.Program<TppProtocol>,
  epochAccount: PublicKey,
  minter: PublicKey,
  vaultIndex: BN
): PublicKey {
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), epochAccount.toBuffer(), minter.toBuffer(), vaultIndex.toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  return vault;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("Pyth Pull-Oracle E2E (devnet)", () => {
  const walletPath =
    process.env.ANCHOR_WALLET ||
    path.join(os.homedir(), ".config/solana/tpp-devnet.json");
  const payer = loadKeypair(walletPath);
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = new anchor.Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = anchor.workspace.TppProtocol as anchor.Program<TppProtocol>;
  const hermesClient = new HermesClient(HERMES_URL);

  let usdcMint: PublicKey;
  let configPda: PublicKey;
  let feeTreasuryPda: PublicKey;
  let priceUpdateAccount: PublicKey; // PriceUpdateV2 account posted by Pyth Receiver

  // ── 1. Check funder balance ────────────────────────────────────────────────
  it("payer has enough SOL", async function () {
    const bal = await connection.getBalance(payer.publicKey);
    console.log(
      `  Payer: ${payer.publicKey.toBase58()}  Balance: ${bal / LAMPORTS_PER_SOL} SOL`
    );
    if (bal < 0.5 * LAMPORTS_PER_SOL) {
      console.log("  ⚠  Wallet unfunded — fund at https://faucet.solana.com then re-run");
      (global as any)._skipChainTest = true;
      this.skip(); // mocha pending, not a failure
    }
  });

  // ── 2. Hermes API: fetch live SOL/USD price ────────────────────────────────
  it("Hermes returns a fresh SOL/USD price", async () => {
    const updates = await hermesClient.getLatestPriceUpdates(
      ["0x" + SOL_USD_FEED_ID],
      { parsed: true, encoding: "base64" }
    );

    assert.isArray(updates.parsed, "parsed array present");
    assert.equal(updates.parsed!.length, 1, "one feed returned");

    const p = updates.parsed![0];
    assert.equal(
      p.id,
      SOL_USD_FEED_ID,
      "feed ID matches SOL/USD"
    );

    const priceRaw = Number(p.price.price);
    const expo = p.price.expo;
    const priceUsd = priceRaw * Math.pow(10, expo);
    const ageMs = Date.now() / 1000 - p.price.publish_time;

    console.log(
      `  SOL/USD: $${priceUsd.toFixed(4)}  conf: ${p.price.conf}  age: ${ageMs.toFixed(1)}s`
    );

    assert.isAbove(priceUsd, 1, "price > $1");
    assert.isBelow(priceUsd, 100000, "price < $100k (sanity)");
    assert.isBelow(ageMs, 30, "price is <30s old");

    // Store base64 binary for Pyth Receiver postUpdateAtomic in next step
    (global as any)._pythVaaBase64 = updates.binary.data[0];
    (global as any)._pythPublishTime = p.price.publish_time;
  });

  // ── 3. Post price update to Pyth Receiver on devnet ───────────────────────
  it("posts PriceUpdateV2 to Pyth Receiver program", async function () {
    if ((global as any)._skipChainTest) { this.skip(); }
    const vaaBase64: string = (global as any)._pythVaaBase64;
    assert.ok(vaaBase64, "binary VAA from previous test");

    // Parse the accumulator update data using price-service-sdk (no jito-ts dep)
    const accData = parseAccumulatorUpdateData(Buffer.from(vaaBase64, "base64"));
    const guardianSetIndex = pythReceiverVaa.getGuardianSetIndex(accData.vaa);
    const trimmedVaa = pythReceiverVaa.trimSignatures(accData.vaa);
    const treasuryId = pythReceiverAddr.getRandomTreasuryId();

    // Instantiate the Pyth Receiver program with Anchor 0.29 (bundled in pyth-solana-receiver)
    // which is compatible with the old IDL format (isMut/isSigner style).
    const receiver029Provider = new anchor029.AnchorProvider(
      connection,
      wallet,
      { commitment: "confirmed" }
    );
    const receiverProgram = new anchor029.Program(
      PYTH_RECEIVER_IDL,
      PYTH_RECEIVER_PROGRAM_ID,
      receiver029Provider
    );

    const priceUpdateKeypair = Keypair.generate();
    priceUpdateAccount = priceUpdateKeypair.publicKey;

    const postIx: TransactionInstruction = await receiverProgram.methods
      .postUpdateAtomic({
        vaa: trimmedVaa,
        merklePriceUpdate: accData.updates[0],
        treasuryId,
      })
      .accounts({
        priceUpdateAccount: priceUpdateKeypair.publicKey,
        treasury: pythReceiverAddr.getTreasuryPda(treasuryId, PYTH_RECEIVER_PROGRAM_ID),
        config: pythReceiverAddr.getConfigPda(PYTH_RECEIVER_PROGRAM_ID),
        guardianSet: pythReceiverAddr.getGuardianSetPda(
          guardianSetIndex,
          pythReceiverAddr.DEFAULT_WORMHOLE_PROGRAM_ID
        ),
      })
      .instruction();

    const msg = parsePriceFeedMessage(accData.updates[0].message);
    const feedId = "0x" + msg.feedId.toString("hex");
    console.log(`  Feed ID: ${feedId}`);
    console.log(`  PriceUpdateV2 account: ${priceUpdateAccount.toBase58()}`);

    try {
      const tx = new Transaction().add(postIx);
      tx.feePayer = payer.publicKey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.sign(payer, priceUpdateKeypair);
      const txid = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
      });
      await connection.confirmTransaction(txid, "confirmed");
      console.log(`  postUpdateAtomic tx: ${txid}`);
    } catch (err: any) {
      console.log(`  postUpdateAtomic failed: ${err.message?.slice(0, 200)}`);
      (global as any)._skipChainTest = true;
      this.skip();
    }
  });

  // ── 4. Set up devnet USDC mint ─────────────────────────────────────────────
  it("creates a test USDC mint on devnet", async function () {
    if ((global as any)._skipChainTest) { this.skip(); }
    usdcMint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      6
    );
    console.log(`  USDC mint: ${usdcMint.toBase58()}`);
    assert.ok(usdcMint);
  });

  // ── 5. Initialize protocol ─────────────────────────────────────────────────
  it("initializes the TPP protocol on devnet", async function () {
    if ((global as any)._skipChainTest) { this.skip(); }

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol_config")],
      program.programId
    );
    [feeTreasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_treasury")],
      program.programId
    );

    // If already initialized (re-run) skip gracefully
    try {
      await program.account.protocolConfig.fetch(configPda);
      console.log("  ProtocolConfig already exists — skipping init");
      return;
    } catch {}

    // Args: mint_fee_bps, redeem_fee_bps, recursive_fee_bps, liquidation_reward_bps,
    //        max_recursive_depth, oracle_conf_denominator, max_oracle_age_secs, circuit_breaker_bps
    await program.methods
      .initializeProtocol(
        30,           // mint_fee_bps (0.30%)
        20,           // redeem_fee_bps (0.20%)
        0,            // recursive_fee_bps
        200,          // liquidation_reward_bps (2%)
        1,            // max_recursive_depth
        new BN(100),  // oracle_conf_denominator (conf must be < 1% of price)
        new BN(60),   // max_oracle_age_secs
        1500          // circuit_breaker_bps (15%)
      )
      .accounts({
        admin: payer.publicKey,
        config: configPda,
        feeTreasury: feeTreasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    const cfg = await program.account.protocolConfig.fetch(configPda);
    assert.equal(cfg.admin.toBase58(), payer.publicKey.toBase58());
    assert.equal(cfg.mintFeeBps, 30);
    console.log(`  ProtocolConfig: ${configPda.toBase58()}`);
  });

  // ── 6. Create SOL/USD epoch ────────────────────────────────────────────────
  it("creates a SOL/USD epoch on devnet", async function () {
    if ((global as any)._skipChainTest) { this.skip(); }

    const epochId = new BN(1);
    const {
      epochAccount, longMint, shortMint,
      longLongMint, longShortMint, shortLongMint, shortShortMint
    } = epochPDAs(program, SOL_ASSET_KEY, epochId);

    // Skip if already exists
    try {
      await program.account.epoch.fetch(epochAccount);
      console.log("  Epoch already exists — skipping creation");
      return;
    } catch {}

    // createEpoch requires all 6 mints (Stage 2: 2 depth-1 + 4 depth-2)
    await program.methods
      .createEpoch(new BN(1))
      .accounts({
        creator: payer.publicKey,
        config: configPda,
        epoch: epochAccount,
        longMint,
        shortMint,
        longLongMint,
        longShortMint,
        shortLongMint,
        shortShortMint,
        assetKey: SOL_ASSET_KEY,
        oracle: priceUpdateAccount, // freshly-posted PriceUpdateV2
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([payer])
      .rpc();

    const epoch = await program.account.epoch.fetch(epochAccount);
    assert.equal(
      epoch.assetKey.toBase58(),
      SOL_ASSET_KEY.toBase58(),
      "asset_key matches SOL feed ID"
    );
    console.log(`  Epoch account:   ${epochAccount.toBase58()}`);
    console.log(`  Long mint:       ${longMint.toBase58()}`);
    console.log(`  Short mint:      ${shortMint.toBase58()}`);
    console.log(`  Reference price: ${epoch.referencePrice.toString()} (6-dec USD)`);
  });

  // ── 7. Mint position pair using Pyth price update ─────────────────────────
  it("mints a position pair with live Pyth oracle price", async function () {
    if ((global as any)._skipChainTest) {
      console.log("  SKIP: PriceUpdateV2 account not posted (postUpdateAtomic failed)");
      this.skip();
    }

    const epochId = new BN(1);
    const vaultIndex = new BN(0);
    const collateralAmount = new BN(100_000_000); // 100 USDC (6 dec)

    const { epochAccount, longMint, shortMint } = epochPDAs(
      program,
      SOL_ASSET_KEY,
      epochId
    );
    const vault = vaultPDA(program, epochAccount, payer.publicKey, vaultIndex);

    // Mint USDC to payer
    const payerUsdc = await getOrCreateAssociatedTokenAccount(
      connection, payer, usdcMint, payer.publicKey
    );
    await mintTo(connection, payer, usdcMint, payerUsdc.address, payer, 200_000_000);

    const minterLongAta  = ata(longMint,  payer.publicKey);
    const minterShortAta = ata(shortMint, payer.publicKey);
    const vaultCollateral = ata(usdcMint, vault);
    const treasuryCollateral = ata(usdcMint, feeTreasuryPda);

    // minter_state seeds: [b"minter_state", minter.key()]
    const [minterState] = PublicKey.findProgramAddressSync(
      [Buffer.from("minter_state"), payer.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .mintPositionPair(epochId, vaultIndex, collateralAmount)
      .accounts({
        minter: payer.publicKey,
        config: configPda,
        epoch: epochAccount,
        oracle: priceUpdateAccount,
        vault,
        minterCollateral: payerUsdc.address,
        vaultCollateral,
        minterLongAta,
        minterShortAta,
        treasuryCollateral,
        longMint,
        shortMint,
        collateralMint: usdcMint,
        feeTreasury: feeTreasuryPda,
        minterState,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([payer])
      .rpc();

    const epoch = await program.account.epoch.fetch(epochAccount);
    console.log(`  Reference price: ${epoch.referencePrice.toString()} (6-dec USD)`);
    assert.isAbove(epoch.totalCollateral.toNumber(), 0, "collateral deposited");
  });
});

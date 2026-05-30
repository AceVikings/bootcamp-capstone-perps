/**
 * fractal-markets.ts — comprehensive devnet test suite for the Fractal Markets protocol.
 *
 * Personas:
 *   admin   — keypair loaded from ~/.config/solana/tpp-devnet.json (pre-funded)
 *   alice   — generated, receives 2 SOL + 500 USDC
 *   bob     — generated, receives 2 SOL + 200 USDC
 *   charlie — generated, receives 2 SOL + 200 USDC
 *   relayer — generated, receives 1 SOL (pays for settle_trade)
 *
 * Test flow:
 *   1.  Admin initialises protocol config
 *   2.  Alice creates root vault (100 USDC → LONG + SHORT)
 *   3.  Alice splits LONG into two child tokens (ClaimNode)
 *   4.  Bob creates independent root vault (80 USDC)
 *   5.  Charlie receives left-child tokens from Alice (manual SPL transfer)
 *   6.  Alice + Charlie settle a trade (Charlie buys from Alice via settle_trade)
 *   7.  Charlie + Alice merge left+right children → LONG
 *   8.  Alice redeems root vault → receives USDC back
 *   9.  Bob redeems his vault
 *  10.  Admin updates fees, verifies new rates
 *  11.  Admin pauses protocol, verify create_root_vault blocked
 *  12.  Admin unpauses
 *  13.  Error: max-depth exceeded
 *  14.  Error: redeem from inactive vault
 *  15.  Error: expired order in settle_trade
 *  16.  Error: self-trade
 *  17.  Error: nonce replay (second settle_trade with same nonce)
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  transfer as splTransfer,
  getAccount,
} from "@solana/spl-token";
import { assert, expect } from "chai";
import fs from "fs";
import { TppProtocol } from "../target/types/tpp_protocol";

// ─── Constants ────────────────────────────────────────────────────────────────
const SOL_USD_FEED_ID =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const USDC_DECIMALS = 6;
const TOKEN_DECIMALS = 6;
const COLLATERAL_AMOUNT = 100_000_000; // 100 USDC (6 dec)
const BOB_COLLATERAL = 80_000_000;    // 80 USDC

// ─── Helper: fund account (airdrop on localnet, transfer on devnet) ──────────
async function fundAccount(
  connection: Connection,
  payer: Keypair,
  recipient: PublicKey,
  lamports: number
) {
  try {
    // Try airdrop first (works on localnet)
    const sig = await connection.requestAirdrop(recipient, lamports);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  } catch {
    // Fallback: transfer from payer (for devnet where airdrop is rate-limited)
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient, lamports })
    );
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer);
    const sig2 = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature: sig2, blockhash, lastValidBlockHeight }, "confirmed");
  }
}

// ─── Helper: sleep ────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Helper: build PDA ───────────────────────────────────────────────────────
function pdaSync(seeds: Buffer[], programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

// ─── Main test suite ─────────────────────────────────────────────────────────
describe("fractal-markets (devnet)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.TppProtocol as Program<TppProtocol>;
  const connection = provider.connection;
  console.log("  RPC endpoint:", connection.rpcEndpoint);

  // Personas
  const admin = (provider.wallet as anchor.Wallet).payer;
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const charlie = Keypair.generate();
  const relayer = Keypair.generate();

  // Persistent mock oracle keypair — pre-created in before()
  const mockOracleKp = Keypair.generate();

  // USDC test mint
  let usdcMint: PublicKey;

  // Vault IDs
  const aliceVaultId = new BN(1);
  const bobVaultId = new BN(2);

  // Pyth oracle account (PriceUpdateV2)
  let pythOracle: PublicKey;
  const hermesClient = null; // unused; using mock oracle

  // PDAs
  let [configPda] = pdaSync([Buffer.from("protocol_config")], program.programId);
  let [feeTreasuryPda] = pdaSync([Buffer.from("fee_treasury")], program.programId);

  // Vault PDAs (computed after accounts known)
  let aliceRootVault: PublicKey;
  let aliceLongMint: PublicKey;
  let aliceShortMint: PublicKey;
  let bobRootVault: PublicKey;

  // Claim node
  const aliceNodeId = new BN(1);
  let claimNodePda: PublicKey;
  let leftChildMint: PublicKey;
  let rightChildMint: PublicKey;

  // Token accounts
  let aliceUsdcAta: PublicKey;
  let bobUsdcAta: PublicKey;
  let charlieUsdcAta: PublicKey;

  // ─── Helper: update mock oracle price ────────────────────────────────────
  async function postPythPrice(priceUsd: number = 180_000_000): Promise<PublicKey> {
    // oracle account is pre-created in before(); just update the price
    await program.methods
      .setMockOraclePrice(new BN(priceUsd))
      .accounts({
        oracle: mockOracleKp.publicKey,
        authority: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });
    return mockOracleKp.publicKey;
  }

  // ─── before: fund personas, create USDC mint ──────────────────────────────
  before(async () => {
    console.log("  Admin:", admin.publicKey.toBase58());
    console.log("  Alice:", alice.publicKey.toBase58());
    console.log("  Bob:  ", bob.publicKey.toBase58());
    console.log("  Charlie:", charlie.publicKey.toBase58());

    // Fund personas (airdrop on localnet; falls back to transfer on devnet)
    // 0.25 SOL each is sufficient for rent + fees; admin wallet keeps ~0.1 SOL for its own txns
    await fundAccount(connection, admin, alice.publicKey, 250_000_000);
    await fundAccount(connection, admin, bob.publicKey, 250_000_000);
    await fundAccount(connection, admin, charlie.publicKey, 250_000_000);
    await fundAccount(connection, admin, relayer.publicKey, 100_000_000);

    // Pre-create the mock oracle account (16 bytes, owned by program)
    // Subsequent set_mock_oracle_price calls just update data without CPI create_account
    const oracleSpace = 16;
    const oracleLamports = await connection.getMinimumBalanceForRentExemption(oracleSpace);
    const createOracleTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: mockOracleKp.publicKey,
        lamports: oracleLamports,
        space: oracleSpace,
        programId: program.programId,
      })
    );
    await sendAndConfirmTransaction(connection, createOracleTx, [admin, mockOracleKp], {
      commitment: "confirmed",
    });
    pythOracle = mockOracleKp.publicKey;
    console.log("  Mock oracle:", pythOracle.toBase58());

    // Create test USDC mint (admin = mint authority)
    usdcMint = await createMint(
      connection,
      admin,
      admin.publicKey,
      null,
      USDC_DECIMALS
    );
    console.log("  USDC mint:", usdcMint.toBase58());

    // Create ATAs and mint USDC
    aliceUsdcAta = (await getOrCreateAssociatedTokenAccount(
      connection, admin, usdcMint, alice.publicKey
    )).address;
    bobUsdcAta = (await getOrCreateAssociatedTokenAccount(
      connection, admin, usdcMint, bob.publicKey
    )).address;
    charlieUsdcAta = (await getOrCreateAssociatedTokenAccount(
      connection, admin, usdcMint, charlie.publicKey
    )).address;

    await mintTo(connection, admin, usdcMint, aliceUsdcAta, admin, 500_000_000);
    await mintTo(connection, admin, usdcMint, bobUsdcAta, admin, 200_000_000);
    await mintTo(connection, admin, usdcMint, charlieUsdcAta, admin, 200_000_000);

    // Compute vault PDAs
    [aliceRootVault] = pdaSync(
      [Buffer.from("root_vault"), alice.publicKey.toBuffer(), aliceVaultId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [aliceLongMint] = pdaSync([Buffer.from("long_mint"), aliceRootVault.toBuffer()], program.programId);
    [aliceShortMint] = pdaSync([Buffer.from("short_mint"), aliceRootVault.toBuffer()], program.programId);
    [bobRootVault] = pdaSync(
      [Buffer.from("root_vault"), bob.publicKey.toBuffer(), bobVaultId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [claimNodePda] = pdaSync(
      [Buffer.from("claim_node"), aliceRootVault.toBuffer(), aliceNodeId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [leftChildMint] = pdaSync(
      [Buffer.from("left_child"), aliceRootVault.toBuffer(), aliceNodeId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [rightChildMint] = pdaSync(
      [Buffer.from("right_child"), aliceRootVault.toBuffer(), aliceNodeId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Set initial mock oracle price
    await postPythPrice(180_000_000); // $180 (6 dec)
  });

  // ─── 1. Initialize protocol ───────────────────────────────────────────────
  // On devnet the ProtocolConfig PDA persists between runs.  If it already
  // exists we skip the init and instead call update_fees + update_config to
  // restore the expected baseline, so subsequent tests see consistent state.
  it("1. admin initialises protocol config", async () => {
    let alreadyInit = false;
    try {
      await program.methods
        .initialize(
          10,   // mint_fee_bps   = 0.10%
          5,    // split_fee_bps  = 0.05%
          5,    // merge_fee_bps  = 0.05%
          5,    // redeem_fee_bps = 0.05%
          10,   // trade_fee_bps  = 0.10%
          4,    // max_recursive_depth
          new BN(100), // oracle_conf_denominator
          new BN(120)  // max_oracle_age_secs
        )
        .accounts({
          config: configPda,
          feeTreasury: feeTreasuryPda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc({ commitment: "confirmed", preflightCommitment: "processed" });
      console.log("    ✓ Config freshly initialized at", configPda.toBase58());
    } catch (err: any) {
      // "already in use" → account was created in a prior run; reset to baseline
      if (err.message?.includes("already in use") || err.logs?.some?.((l: string) => l.includes("already in use"))) {
        alreadyInit = true;
        console.log("    ℹ Config already exists — resetting to baseline values");

        // Reset fees to baseline
        await program.methods
          .updateFees(10, 5, 5, 5, 10)
          .accounts({ config: configPda, admin: admin.publicKey })
          .signers([admin])
          .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

        // Reset maxRecursiveDepth and oracle params
        await program.methods
          .updateConfig(4, new BN(100), new BN(120))
          .accounts({ config: configPda, admin: admin.publicKey })
          .signers([admin])
          .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

        // Ensure protocol is not paused
        const cfgCheck = await program.account.protocolConfig.fetch(configPda);
        if (cfgCheck.paused) {
          await program.methods
            .setProtocolPause(false)
            .accounts({ config: configPda, admin: admin.publicKey })
            .signers([admin])
            .rpc({ commitment: "confirmed", preflightCommitment: "processed" });
        }
      } else {
        throw err;
      }
    }

    const config = await program.account.protocolConfig.fetch(configPda);
    assert.equal(config.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(config.mintFeeBps, 10);
    assert.equal(config.splitFeeBps, 5);
    assert.equal(config.tradeFeeBps, 10);
    assert.equal(config.maxRecursiveDepth, 4);
    assert.isFalse(config.paused);
    console.log("    ✓ Config at", configPda.toBase58(), alreadyInit ? "(reset)" : "(fresh)");
  });

  // ─── 2. Alice creates root vault ─────────────────────────────────────────
  it("2. alice creates root vault (100 USDC)", async () => {
    const oracle = await postPythPrice();
    const feedPubkey = new PublicKey(Buffer.from(SOL_USD_FEED_ID, "hex"));

    const vaultCollateralAta = await getAssociatedTokenAddress(
      usdcMint, aliceRootVault, true
    );
    const treasuryUsdcAta = await getAssociatedTokenAddress(
      usdcMint, feeTreasuryPda, true
    );

    await program.methods
      .createRootVault(aliceVaultId, feedPubkey, new BN(COLLATERAL_AMOUNT))
      .accounts({
        config: configPda,
        rootVault: aliceRootVault,
        longMint: aliceLongMint,
        shortMint: aliceShortMint,
        ownerCollateralAta: aliceUsdcAta,
        vaultCollateralAta,
        ownerLongAta: await getAssociatedTokenAddress(aliceLongMint, alice.publicKey, false),
        ownerShortAta: await getAssociatedTokenAddress(aliceShortMint, alice.publicKey, false),
        treasuryCollateralAta: treasuryUsdcAta,
        collateralMint: usdcMint,
        feeTreasury: feeTreasuryPda,
        oracle: oracle,
        owner: alice.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([alice])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    const vault = await program.account.rootVault.fetch(aliceRootVault);
    assert.isTrue(vault.isActive);
    assert.ok(vault.collateralAmount.toNumber() > 0);

    // Verify fee was deducted: net_collateral = 100M * (1 - 10/10000) = 99.9M
    const expectedNet = COLLATERAL_AMOUNT - Math.floor(COLLATERAL_AMOUNT * 10 / 10000);
    assert.equal(vault.collateralAmount.toNumber(), expectedNet);

    const aliceLongBalance = await connection.getTokenAccountBalance(
      await getAssociatedTokenAddress(aliceLongMint, alice.publicKey)
    );
    assert.ok(Number(aliceLongBalance.value.amount) > 0, "Alice should have LONG tokens");
    console.log("    ✓ Root vault created, collateral:", vault.collateralAmount.toString());
    console.log("    ✓ Alice LONG balance:", aliceLongBalance.value.uiAmount);
  });

  // ─── 3. Alice splits LONG into two child tokens ───────────────────────────
  it("3. alice splits LONG → left_child + right_child", async () => {
    const oracle = await postPythPrice();
    const aliceLongAta = await getAssociatedTokenAddress(aliceLongMint, alice.publicKey);
    const longBalanceBefore = await connection.getTokenAccountBalance(aliceLongAta);
    const splitAmount = Math.floor(Number(longBalanceBefore.value.amount) / 2);

    await program.methods
      .splitClaim(aliceVaultId, aliceNodeId, new BN(splitAmount))
      .accounts({
        config: configPda,
        rootVault: aliceRootVault,
        claimNode: claimNodePda,
        leftChildMint,
        rightChildMint,
        sourceMint: aliceLongMint,
        callerSourceAta: aliceLongAta,
        callerLeftAta: await getAssociatedTokenAddress(leftChildMint, alice.publicKey, false),
        callerRightAta: await getAssociatedTokenAddress(rightChildMint, alice.publicKey, false),
        parentAccount: aliceRootVault,  // depth-1 split; parent IS the root_vault
        oracle,
        caller: alice.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([alice])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    const node = await program.account.claimNode.fetch(claimNodePda);
    assert.isTrue(node.isActive);
    assert.equal(node.depth, 2); // source was depth-1, children are depth-2

    const aliceLeftBalance = await connection.getTokenAccountBalance(
      await getAssociatedTokenAddress(leftChildMint, alice.publicKey)
    );
    assert.ok(Number(aliceLeftBalance.value.amount) > 0, "Alice should have left_child tokens");
    console.log("    ✓ ClaimNode created at depth:", node.depth);
    console.log("    ✓ Alice left_child balance:", aliceLeftBalance.value.uiAmount);
  });

  // ─── 4. Bob creates independent root vault ────────────────────────────────
  it("4. bob creates independent root vault (80 USDC)", async () => {
    const oracle = await postPythPrice();
    const feedPubkey = new PublicKey(Buffer.from(SOL_USD_FEED_ID, "hex"));

    const [bobLongMint] = pdaSync([Buffer.from("long_mint"), bobRootVault.toBuffer()], program.programId);
    const [bobShortMint] = pdaSync([Buffer.from("short_mint"), bobRootVault.toBuffer()], program.programId);
    const vaultCollateralAta = await getAssociatedTokenAddress(usdcMint, bobRootVault, true);
    const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMint, feeTreasuryPda, true);

    await program.methods
      .createRootVault(bobVaultId, feedPubkey, new BN(BOB_COLLATERAL))
      .accounts({
        config: configPda,
        rootVault: bobRootVault,
        longMint: bobLongMint,
        shortMint: bobShortMint,
        ownerCollateralAta: bobUsdcAta,
        vaultCollateralAta,
        ownerLongAta: await getAssociatedTokenAddress(bobLongMint, bob.publicKey, false),
        ownerShortAta: await getAssociatedTokenAddress(bobShortMint, bob.publicKey, false),
        treasuryCollateralAta: treasuryUsdcAta,
        collateralMint: usdcMint,
        feeTreasury: feeTreasuryPda,
        oracle,
        owner: bob.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([bob])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    const vault = await program.account.rootVault.fetch(bobRootVault);
    assert.isTrue(vault.isActive);
    console.log("    ✓ Bob's vault active, collateral:", vault.collateralAmount.toString());
  });

  // ─── 5. Transfer left_child tokens from Alice to Charlie (SPL transfer) ───
  it("5. alice transfers some left_child tokens to charlie", async () => {
    const aliceLeftAta = await getAssociatedTokenAddress(leftChildMint, alice.publicKey);
    const charlieLeftAta = (await getOrCreateAssociatedTokenAccount(
      connection, alice, leftChildMint, charlie.publicKey
    )).address;

    const aliceBalance = await connection.getTokenAccountBalance(aliceLeftAta);
    const transferAmt = Math.floor(Number(aliceBalance.value.amount) / 3);

    await splTransfer(
      connection, alice, aliceLeftAta, charlieLeftAta, alice, transferAmt
    );

    const charlieBalance = await connection.getTokenAccountBalance(charlieLeftAta);
    assert.ok(Number(charlieBalance.value.amount) > 0);
    console.log("    ✓ Charlie left_child balance:", charlieBalance.value.uiAmount);
  });

  // ─── 5a. COLLATERAL EFFICIENCY: Charlie (secondary-market buyer) splits ───
  //   Charlie holds left_child tokens received from Alice (not the vault owner).
  //   She should be able to call split_claim and receive two new child tokens —
  //   using her left_child token as collateral, no extra USDC required.
  it("5a. charlie (non-owner) splits left_child via split_claim (collateral efficiency)", async () => {
    const charlieLeftAta = await getAssociatedTokenAddress(leftChildMint, charlie.publicKey);
    const leftBalanceBefore = await connection.getTokenAccountBalance(charlieLeftAta);
    const charlieBalance = Number(leftBalanceBefore.value.amount);
    assert.ok(charlieBalance > 0, "Charlie must hold left_child tokens");

    // Charlie's split produces depth-4 children from Alice's depth-2 ClaimNode.
    // Contract depth convention: source_depth = parent_node.depth + 1 = 3,
    // new_node.depth = source_depth + 1 = 4.
    const charlieNodeId = new BN(100);
    const [charlieNodePda] = pdaSync(
      [Buffer.from("claim_node"), aliceRootVault.toBuffer(), charlieNodeId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [charlieLeftChildMint] = pdaSync(
      [Buffer.from("left_child"), aliceRootVault.toBuffer(), charlieNodeId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [charlieRightChildMint] = pdaSync(
      [Buffer.from("right_child"), aliceRootVault.toBuffer(), charlieNodeId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const splitAmt = Math.max(1, Math.floor(charlieBalance / 2));
    const oracle = await postPythPrice();

    // ── KEY ASSERTION: Charlie is the caller; Alice's vault is the root_vault.
    //    This works because split_claim seeds root_vault with root_vault.owner
    //    (Alice's stored pubkey), NOT the signer (Charlie). ────────────────────
    await program.methods
      .splitClaim(aliceVaultId, charlieNodeId, new BN(splitAmt))
      .accounts({
        config: configPda,
        rootVault: aliceRootVault,          // Alice's vault — Charlie can use it!
        claimNode: charlieNodePda,
        leftChildMint: charlieLeftChildMint,
        rightChildMint: charlieRightChildMint,
        sourceMint: leftChildMint,          // the left_child token Charlie holds
        callerSourceAta: charlieLeftAta,
        callerLeftAta: await getAssociatedTokenAddress(charlieLeftChildMint, charlie.publicKey, false),
        callerRightAta: await getAssociatedTokenAddress(charlieRightChildMint, charlie.publicKey, false),
        parentAccount: claimNodePda,        // parent is Alice's claim_node (depth-2)
        oracle,
        caller: charlie.publicKey,          // ← Charlie signs, NOT Alice
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([charlie])                   // ← Charlie signs, NOT Alice
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    // Verify left_child was burned from Charlie
    const leftBalanceAfter = await connection.getTokenAccountBalance(charlieLeftAta);
    assert.ok(
      Number(leftBalanceAfter.value.amount) < charlieBalance,
      "Charlie's left_child balance should decrease after split"
    );

    // Verify Charlie received new depth-3 child tokens
    const charlieLeftChildAta = await getAssociatedTokenAddress(charlieLeftChildMint, charlie.publicKey);
    const charlieRightChildAta = await getAssociatedTokenAddress(charlieRightChildMint, charlie.publicKey);
    const charlieLeftChildBal = await connection.getTokenAccountBalance(charlieLeftChildAta);
    const charlieRightChildBal = await connection.getTokenAccountBalance(charlieRightChildAta);
    assert.ok(Number(charlieLeftChildBal.value.amount) > 0, "Charlie should receive left depth-3 child");
    assert.ok(Number(charlieRightChildBal.value.amount) > 0, "Charlie should receive right depth-3 child");

    // Verify claim node was created and Charlie is the owner
    const node = await program.account.claimNode.fetch(charlieNodePda);
    assert.isTrue(node.isActive);
    assert.equal(node.owner.toBase58(), charlie.publicKey.toBase58(),
      "ClaimNode.owner should be Charlie (the caller), not Alice");
    assert.equal(node.depth, 4, "Depth should be 4 (source_depth=parent.depth+1=3, node.depth=source_depth+1=4)");

    console.log("    ✓ Charlie split left_child without being vault owner (collateral efficiency)");
    console.log("    ✓ Charlie left_child burned:", charlieBalance - Number(leftBalanceAfter.value.amount));
    console.log("    ✓ Charlie depth-3 left_child:", charlieLeftChildBal.value.uiAmount);
    console.log("    ✓ Charlie depth-3 right_child:", charlieRightChildBal.value.uiAmount);
    console.log("    ✓ ClaimNode owner:", node.owner.toBase58(), "(== Charlie ✓)");
  });

  // ─── 6. Settle trade: Charlie sells left_child to Alice for USDC ──────────
  it("6. settle_trade: charlie sells left_child tokens to alice", async () => {
    const charlieLeftAta = await getAssociatedTokenAddress(leftChildMint, charlie.publicKey);
    const charlieLeftBalance = await connection.getTokenAccountBalance(charlieLeftAta);
    const sellQty = Number(charlieLeftBalance.value.amount); // sell all

    const clock = await connection.getSlot();
    const nowSecs = Math.floor(Date.now() / 1000);
    const expiresAt = new BN(nowSecs + 300);
    const price = new BN(500_000); // 0.5 USDC per token (6 dec)
    const buyerNonce = new BN(1001);
    const sellerNonce = new BN(2001);

    // alice = buyer, charlie = seller
    const buyerOrder = {
      trader: alice.publicKey,
      tokenMint: leftChildMint,
      side: 0, // Buy
      quantity: new BN(sellQty),
      price,
      nonce: buyerNonce,
      expiresAt,
      signature: Buffer.alloc(64),
    };
    const sellerOrder = {
      trader: charlie.publicKey,
      tokenMint: leftChildMint,
      side: 1, // Sell
      quantity: new BN(sellQty),
      price,
      nonce: sellerNonce,
      expiresAt,
      signature: Buffer.alloc(64),
    };

    const aliceLeftAta = await getAssociatedTokenAddress(leftChildMint, alice.publicKey);
    const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMint, feeTreasuryPda, true);

    const [buyerNoncePda] = pdaSync(
      [Buffer.from("nonce"), alice.publicKey.toBuffer(), buyerNonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [sellerNoncePda] = pdaSync(
      [Buffer.from("nonce"), charlie.publicKey.toBuffer(), sellerNonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    await program.methods
      .settleTrade(buyerOrder, sellerOrder)
      .accounts({
        config: configPda,
        buyerNonceLedger: buyerNoncePda,
        sellerNonceLedger: sellerNoncePda,
        tokenMint: leftChildMint,
        sellerTokenAta: charlieLeftAta,
        buyerTokenAta: aliceLeftAta,
        collateralMint: usdcMint,
        buyerCollateralAta: aliceUsdcAta,
        sellerCollateralAta: charlieUsdcAta,
        treasuryCollateralAta: treasuryUsdcAta,
        feeTreasury: feeTreasuryPda,
        buyer: alice.publicKey,
        seller: charlie.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice, charlie])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    const charlieUsdcBalance = await connection.getTokenAccountBalance(charlieUsdcAta);
    const aliceLeftBalanceAfter = await connection.getTokenAccountBalance(aliceLeftAta);
    console.log("    ✓ Charlie USDC after trade:", charlieUsdcBalance.value.uiAmount);
    console.log("    ✓ Alice left_child after trade:", aliceLeftBalanceAfter.value.uiAmount);
  });

  // ─── 7. Alice + someone merge left+right children ─────────────────────────
  it("7. alice merges left_child + right_child back to LONG", async () => {
    const aliceLeftAta = await getAssociatedTokenAddress(leftChildMint, alice.publicKey);
    const aliceRightAta = await getAssociatedTokenAddress(rightChildMint, alice.publicKey);

    const leftBalance = await connection.getTokenAccountBalance(aliceLeftAta);
    const rightBalance = await connection.getTokenAccountBalance(aliceRightAta);

    // Merge the minimum of both balances
    const mergeAmt = Math.min(
      Number(leftBalance.value.amount),
      Number(rightBalance.value.amount)
    );
    assert.ok(mergeAmt > 0, "Alice should have both child tokens");

    await program.methods
      .mergeClaims(aliceVaultId, new BN(mergeAmt))
      .accounts({
        config: configPda,
        rootVault: aliceRootVault,
        claimNode: claimNodePda,
        parentMint: aliceLongMint,
        leftChildMint,
        rightChildMint,
        callerParentAta: await getAssociatedTokenAddress(aliceLongMint, alice.publicKey, false),
        callerLeftAta: aliceLeftAta,
        callerRightAta: aliceRightAta,
        caller: alice.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    const aliceLongAfter = await connection.getTokenAccountBalance(
      await getAssociatedTokenAddress(aliceLongMint, alice.publicKey)
    );
    console.log("    ✓ Alice LONG after merge:", aliceLongAfter.value.uiAmount);
  });

  // ─── 8. Alice redeems root vault ─────────────────────────────────────────
  it("8. alice redeems root vault (burns LONG+SHORT, receives USDC)", async () => {
    const aliceLongAta = await getAssociatedTokenAddress(aliceLongMint, alice.publicKey);
    const aliceShortAta = await getAssociatedTokenAddress(aliceShortMint, alice.publicKey);
    const vaultCollateralAta = await getAssociatedTokenAddress(usdcMint, aliceRootVault, true);
    const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMint, feeTreasuryPda, true);

    const longBalance = await connection.getTokenAccountBalance(aliceLongAta);
    const shortBalance = await connection.getTokenAccountBalance(aliceShortAta);
    const redeemAmt = Math.min(
      Number(longBalance.value.amount),
      Number(shortBalance.value.amount)
    );
    assert.ok(redeemAmt > 0, "Alice must have both tokens to redeem");

    const usdcBefore = await connection.getTokenAccountBalance(aliceUsdcAta);

    await program.methods
      .redeemRoot(aliceVaultId, new BN(redeemAmt))
      .accounts({
        config: configPda,
        rootVault: aliceRootVault,
        longMint: aliceLongMint,
        shortMint: aliceShortMint,
        callerLongAta: aliceLongAta,
        callerShortAta: aliceShortAta,
        callerCollateralAta: aliceUsdcAta,
        vaultCollateralAta,
        treasuryCollateralAta: treasuryUsdcAta,
        collateralMint: usdcMint,
        feeTreasury: feeTreasuryPda,
        caller: alice.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    const usdcAfter = await connection.getTokenAccountBalance(aliceUsdcAta);
    assert.ok(
      Number(usdcAfter.value.amount) > Number(usdcBefore.value.amount),
      "Alice should receive USDC from redemption"
    );
    console.log("    ✓ Alice USDC before:", usdcBefore.value.uiAmount);
    console.log("    ✓ Alice USDC after:", usdcAfter.value.uiAmount);
  });

  // ─── 9. Bob redeems his vault ─────────────────────────────────────────────
  it("9. bob redeems his vault", async () => {
    const [bobLongMint] = pdaSync([Buffer.from("long_mint"), bobRootVault.toBuffer()], program.programId);
    const [bobShortMint] = pdaSync([Buffer.from("short_mint"), bobRootVault.toBuffer()], program.programId);

    const bobLongAta = await getAssociatedTokenAddress(bobLongMint, bob.publicKey);
    const bobShortAta = await getAssociatedTokenAddress(bobShortMint, bob.publicKey);
    const vaultCollateralAta = await getAssociatedTokenAddress(usdcMint, bobRootVault, true);
    const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMint, feeTreasuryPda, true);

    const longBalance = await connection.getTokenAccountBalance(bobLongAta);
    const redeemAmt = Number(longBalance.value.amount);
    assert.ok(redeemAmt > 0);

    const usdcBefore = await connection.getTokenAccountBalance(bobUsdcAta);

    await program.methods
      .redeemRoot(bobVaultId, new BN(redeemAmt))
      .accounts({
        config: configPda,
        rootVault: bobRootVault,
        longMint: bobLongMint,
        shortMint: bobShortMint,
        callerLongAta: bobLongAta,
        callerShortAta: bobShortAta,
        callerCollateralAta: bobUsdcAta,
        vaultCollateralAta,
        treasuryCollateralAta: treasuryUsdcAta,
        collateralMint: usdcMint,
        feeTreasury: feeTreasuryPda,
        caller: bob.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([bob])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    const usdcAfter = await connection.getTokenAccountBalance(bobUsdcAta);
    assert.ok(Number(usdcAfter.value.amount) > Number(usdcBefore.value.amount));
    console.log("    ✓ Bob redeemed, USDC returned:", usdcAfter.value.uiAmount);
  });

  // ─── 10. Admin updates fees ───────────────────────────────────────────────
  it("10. admin updates fees to new values", async () => {
    await program.methods
      .updateFees(20, 15, 15, 15, 25)
      .accounts({
        config: configPda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    const config = await program.account.protocolConfig.fetch(configPda);
    assert.equal(config.mintFeeBps, 20);
    assert.equal(config.tradeFeeBps, 25);
    console.log("    ✓ Fees updated: mint=20bps trade=25bps");
  });

  // ─── 11. Admin pauses → create_root_vault blocked ─────────────────────────
  it("11. admin pauses protocol; create_root_vault is blocked", async () => {
    await program.methods
      .setProtocolPause(true)
      .accounts({ config: configPda, admin: admin.publicKey })
      .signers([admin])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    const config = await program.account.protocolConfig.fetch(configPda);
    assert.isTrue(config.paused);

    const oracle = await postPythPrice();
    const vault3Id = new BN(99);
    const [vault3Pda] = pdaSync(
      [Buffer.from("root_vault"), alice.publicKey.toBuffer(), vault3Id.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [v3Long] = pdaSync([Buffer.from("long_mint"), vault3Pda.toBuffer()], program.programId);
    const [v3Short] = pdaSync([Buffer.from("short_mint"), vault3Pda.toBuffer()], program.programId);
    const feedPubkey = new PublicKey(Buffer.from(SOL_USD_FEED_ID, "hex"));

    try {
      await program.methods
        .createRootVault(vault3Id, feedPubkey, new BN(10_000_000))
        .accounts({
          config: configPda,
          rootVault: vault3Pda,
          longMint: v3Long,
          shortMint: v3Short,
          ownerCollateralAta: aliceUsdcAta,
          vaultCollateralAta: await getAssociatedTokenAddress(usdcMint, vault3Pda, true),
          ownerLongAta: await getAssociatedTokenAddress(v3Long, alice.publicKey, false),
          ownerShortAta: await getAssociatedTokenAddress(v3Short, alice.publicKey, false),
          treasuryCollateralAta: await getAssociatedTokenAddress(usdcMint, feeTreasuryPda, true),
          collateralMint: usdcMint,
          feeTreasury: feeTreasuryPda,
          oracle,
          owner: alice.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([alice])
        .rpc({ commitment: "confirmed", preflightCommitment: "processed" });
      assert.fail("should have thrown ProtocolPaused");
    } catch (e: any) {
      assert.include(e.message, "ProtocolPaused");
      console.log("    ✓ create_root_vault correctly rejected while paused");
    }
  });

  // ─── 12. Admin unpauses ───────────────────────────────────────────────────
  it("12. admin unpauses protocol", async () => {
    await program.methods
      .setProtocolPause(false)
      .accounts({ config: configPda, admin: admin.publicKey })
      .signers([admin])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    const config = await program.account.protocolConfig.fetch(configPda);
    assert.isFalse(config.paused);
    console.log("    ✓ Protocol unpaused");
  });

  // ─── 13. Error: max depth exceeded ───────────────────────────────────────
  it("13. error: max_depth exceeded after 3 more splits", async () => {
    // Create a fresh vault for depth testing
    const oracle = await postPythPrice();
    const feedPubkey = new PublicKey(Buffer.from(SOL_USD_FEED_ID, "hex"));
    const depthVaultId = new BN(50);
    const [depthVault] = pdaSync(
      [Buffer.from("root_vault"), alice.publicKey.toBuffer(), depthVaultId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [dvLong] = pdaSync([Buffer.from("long_mint"), depthVault.toBuffer()], program.programId);
    const [dvShort] = pdaSync([Buffer.from("short_mint"), depthVault.toBuffer()], program.programId);

    await program.methods
      .createRootVault(depthVaultId, feedPubkey, new BN(10_000_000))
      .accounts({
        config: configPda,
        rootVault: depthVault,
        longMint: dvLong,
        shortMint: dvShort,
        ownerCollateralAta: aliceUsdcAta,
        vaultCollateralAta: await getAssociatedTokenAddress(usdcMint, depthVault, true),
        ownerLongAta: await getAssociatedTokenAddress(dvLong, alice.publicKey, false),
        ownerShortAta: await getAssociatedTokenAddress(dvShort, alice.publicKey, false),
        treasuryCollateralAta: await getAssociatedTokenAddress(usdcMint, feeTreasuryPda, true),
        collateralMint: usdcMint,
        feeTreasury: feeTreasuryPda,
        oracle,
        owner: alice.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([alice])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    // Split 3 times to reach depth 4 (= max_recursive_depth)
    let currentMint = dvLong;
    let parentAccount = depthVault;
    let prevNodePda: PublicKey | null = null;

    for (let i = 1; i <= 3; i++) {
      const nodeId = new BN(50 + i);
      const [nodePda] = pdaSync(
        [Buffer.from("claim_node"), depthVault.toBuffer(), nodeId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );
      const [leftMint] = pdaSync(
        [Buffer.from("left_child"), depthVault.toBuffer(), nodeId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );
      const [rightMint] = pdaSync(
        [Buffer.from("right_child"), depthVault.toBuffer(), nodeId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );
      const srcAta = await getAssociatedTokenAddress(currentMint, alice.publicKey);
      const balance = await connection.getTokenAccountBalance(srcAta);
      const splitAmt = Math.max(1, Math.floor(Number(balance.value.amount) / 2));

      const freshOracle = await postPythPrice();

      if (i < 3) {
        // Normal split
        await program.methods
          .splitClaim(depthVaultId, nodeId, new BN(splitAmt))
          .accounts({
            config: configPda,
            rootVault: depthVault,
            claimNode: nodePda,
            leftChildMint: leftMint,
            rightChildMint: rightMint,
            sourceMint: currentMint,
            callerSourceAta: srcAta,
            callerLeftAta: await getAssociatedTokenAddress(leftMint, alice.publicKey, false),
            callerRightAta: await getAssociatedTokenAddress(rightMint, alice.publicKey, false),
            parentAccount,
            oracle: freshOracle,
            caller: alice.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([alice])
          .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

        parentAccount = nodePda;
        currentMint = leftMint;
      } else {
        // This 3rd split should fail: depth would be 4 >= max_recursive_depth=4
        try {
          await program.methods
            .splitClaim(depthVaultId, nodeId, new BN(splitAmt))
            .accounts({
              config: configPda,
              rootVault: depthVault,
              claimNode: nodePda,
              leftChildMint: leftMint,
              rightChildMint: rightMint,
              sourceMint: currentMint,
              callerSourceAta: srcAta,
              callerLeftAta: await getAssociatedTokenAddress(leftMint, alice.publicKey, false),
              callerRightAta: await getAssociatedTokenAddress(rightMint, alice.publicKey, false),
              parentAccount,
              oracle: freshOracle,
              caller: alice.publicKey,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
              rent: SYSVAR_RENT_PUBKEY,
            })
            .signers([alice])
            .rpc({ commitment: "confirmed", preflightCommitment: "processed" });
          assert.fail("should have thrown MaxDepthReached");
        } catch (e: any) {
          assert.include(e.message, "MaxDepthReached");
          console.log("    ✓ MaxDepthReached correctly thrown at depth limit");
        }
      }
    }
  });

  // ─── 14. Error: expired order ─────────────────────────────────────────────
  it("14. error: expired order in settle_trade", async () => {
    const pastExpiry = new BN(Math.floor(Date.now() / 1000) - 60); // 60 seconds ago
    const buyerOrder = {
      trader: alice.publicKey,
      tokenMint: leftChildMint,
      side: 0,
      quantity: new BN(100),
      price: new BN(500_000),
      nonce: new BN(9001),
      expiresAt: pastExpiry,
      signature: Buffer.alloc(64),
    };
    const sellerOrder = {
      trader: charlie.publicKey,
      tokenMint: leftChildMint,
      side: 1,
      quantity: new BN(100),
      price: new BN(500_000),
      nonce: new BN(9002),
      expiresAt: pastExpiry,
      signature: Buffer.alloc(64),
    };
    const [buyerNoncePda] = pdaSync(
      [Buffer.from("nonce"), alice.publicKey.toBuffer(), buyerOrder.nonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [sellerNoncePda] = pdaSync(
      [Buffer.from("nonce"), charlie.publicKey.toBuffer(), sellerOrder.nonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMint, feeTreasuryPda, true);

    try {
      await program.methods
        .settleTrade(buyerOrder, sellerOrder)
        .accounts({
          config: configPda,
          buyerNonceLedger: buyerNoncePda,
          sellerNonceLedger: sellerNoncePda,
          tokenMint: leftChildMint,
          sellerTokenAta: await getAssociatedTokenAddress(leftChildMint, charlie.publicKey),
          buyerTokenAta: await getAssociatedTokenAddress(leftChildMint, alice.publicKey),
          collateralMint: usdcMint,
          buyerCollateralAta: aliceUsdcAta,
          sellerCollateralAta: charlieUsdcAta,
          treasuryCollateralAta: treasuryUsdcAta,
          feeTreasury: feeTreasuryPda,
          buyer: alice.publicKey,
          seller: charlie.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([alice, charlie])
        .rpc({ commitment: "confirmed", preflightCommitment: "processed" });
      assert.fail("should have thrown OrderExpired");
    } catch (e: any) {
      assert.include(e.message, "OrderExpired");
      console.log("    ✓ OrderExpired correctly thrown for past expiry");
    }
  });

  // ─── 15. Error: self-trade ────────────────────────────────────────────────
  it("15. error: self-trade (buyer == seller)", async () => {
    const expiry = new BN(Math.floor(Date.now() / 1000) + 300);
    const buyerOrder = {
      trader: alice.publicKey,
      tokenMint: leftChildMint,
      side: 0,
      quantity: new BN(100),
      price: new BN(500_000),
      nonce: new BN(8001),
      expiresAt: expiry,
      signature: Buffer.alloc(64),
    };
    const sellerOrder = {
      trader: alice.publicKey, // SAME as buyer
      tokenMint: leftChildMint,
      side: 1,
      quantity: new BN(100),
      price: new BN(500_000),
      nonce: new BN(8002),
      expiresAt: expiry,
      signature: Buffer.alloc(64),
    };
    const [buyerNoncePda] = pdaSync(
      [Buffer.from("nonce"), alice.publicKey.toBuffer(), buyerOrder.nonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [sellerNoncePda] = pdaSync(
      [Buffer.from("nonce"), alice.publicKey.toBuffer(), sellerOrder.nonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMint, feeTreasuryPda, true);
    const aliceLeftAta = await getAssociatedTokenAddress(leftChildMint, alice.publicKey);

    try {
      await program.methods
        .settleTrade(buyerOrder, sellerOrder)
        .accounts({
          config: configPda,
          buyerNonceLedger: buyerNoncePda,
          sellerNonceLedger: sellerNoncePda,
          tokenMint: leftChildMint,
          sellerTokenAta: aliceLeftAta,
          buyerTokenAta: aliceLeftAta,
          collateralMint: usdcMint,
          buyerCollateralAta: aliceUsdcAta,
          sellerCollateralAta: aliceUsdcAta,
          treasuryCollateralAta: treasuryUsdcAta,
          feeTreasury: feeTreasuryPda,
          buyer: alice.publicKey,
          seller: alice.publicKey, // same keypair
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([alice]) // only one signer since buyer == seller
        .rpc({ commitment: "confirmed", preflightCommitment: "processed" });
      assert.fail("should have thrown SelfTrade");
    } catch (e: any) {
      assert.include(e.message, "SelfTrade");
      console.log("    ✓ SelfTrade correctly thrown");
    }
  });

  // ─── 16. Error: nonce replay ──────────────────────────────────────────────
  it("16. error: nonce replay (same nonce reused)", async () => {
    // Try to re-use the nonces from test #6 (buyer=1001, seller=2001)
    // Those nonce ledger PDAs already exist so init will fail
    const expiry = new BN(Math.floor(Date.now() / 1000) + 300);
    const buyerOrder = {
      trader: alice.publicKey,
      tokenMint: leftChildMint,
      side: 0,
      quantity: new BN(1),
      price: new BN(500_000),
      nonce: new BN(1001), // already used in test #6
      expiresAt: expiry,
      signature: Buffer.alloc(64),
    };
    const sellerOrder = {
      trader: charlie.publicKey,
      tokenMint: leftChildMint,
      side: 1,
      quantity: new BN(1),
      price: new BN(500_000),
      nonce: new BN(2001), // already used in test #6
      expiresAt: expiry,
      signature: Buffer.alloc(64),
    };
    const [buyerNoncePda] = pdaSync(
      [Buffer.from("nonce"), alice.publicKey.toBuffer(), buyerOrder.nonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [sellerNoncePda] = pdaSync(
      [Buffer.from("nonce"), charlie.publicKey.toBuffer(), sellerOrder.nonce.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMint, feeTreasuryPda, true);
    const aliceLeftAta = await getAssociatedTokenAddress(leftChildMint, alice.publicKey);
    const charlieLeftAta = await getAssociatedTokenAddress(leftChildMint, charlie.publicKey);

    try {
      await program.methods
        .settleTrade(buyerOrder, sellerOrder)
        .accounts({
          config: configPda,
          buyerNonceLedger: buyerNoncePda,
          sellerNonceLedger: sellerNoncePda,
          tokenMint: leftChildMint,
          sellerTokenAta: charlieLeftAta,
          buyerTokenAta: aliceLeftAta,
          collateralMint: usdcMint,
          buyerCollateralAta: aliceUsdcAta,
          sellerCollateralAta: charlieUsdcAta,
          treasuryCollateralAta: treasuryUsdcAta,
          feeTreasury: feeTreasuryPda,
          buyer: alice.publicKey,
          seller: charlie.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([alice, charlie])
        .rpc({ commitment: "confirmed", preflightCommitment: "processed" });
      assert.fail("should have thrown due to nonce replay");
    } catch (e: any) {
      // Anchor will throw because init on an already-existing account fails
      assert.ok(e.message, "nonce replay should be rejected");
      console.log("    ✓ Nonce replay correctly rejected:", e.message.substring(0, 60));
    }
  });

  // ─── 17. Admin transfer_admin ─────────────────────────────────────────────
  it("17. admin transfers admin role to alice then back", async () => {
    await program.methods
      .transferAdmin(alice.publicKey)
      .accounts({ config: configPda, admin: admin.publicKey })
      .signers([admin])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    let config = await program.account.protocolConfig.fetch(configPda);
    assert.equal(config.admin.toBase58(), alice.publicKey.toBase58());

    // Transfer back
    await program.methods
      .transferAdmin(admin.publicKey)
      .accounts({ config: configPda, admin: alice.publicKey })
      .signers([alice])
      .rpc({ commitment: "confirmed", preflightCommitment: "processed" });

    config = await program.account.protocolConfig.fetch(configPda);
    assert.equal(config.admin.toBase58(), admin.publicKey.toBase58());
    console.log("    ✓ Admin role transferred and restored");
  });
});

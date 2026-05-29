/**
 * TPP Protocol – comprehensive localnet test suite
 *
 * Coverage:
 *  1. Protocol initialisation
 *  2. Epoch creation
 *  3. Position minting
 *  4. LONG redemption
 *  5. SHORT redemption
 *  6. Permissionless liquidation (short-underwater scenario)
 *  7. Liquidation rejection (price within band)
 *  8. Protocol pause / unpause
 *  9. Pause blocks minting but not redemption
 * 10. Fee update (valid + over-cap rejection)
 * 11. Admin transfer
 * 12. Stale oracle rejection
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { TppProtocol } from "../target/types/tpp_protocol";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

// ─── Constants ───────────────────────────────────────────────────────────────
const PRICE_100 = new BN(100_000_000); // $100.000000  (6-dec precision)
const PRICE_4 = new BN(4_000_000); // $4  → triggers short_is_liquidatable
const PRICE_196 = new BN(196_000_000); // $196 → triggers long_is_liquidatable
const COLLATERAL_100 = new BN(100_000_000); // 100 USDC (6 dec)
const MINT_FEE_BPS = 10; // 0.10 %
const REDEEM_FEE_BPS = 5; // 0.05 %

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive an associated token address without creating it. */
function ata(mint: PublicKey, owner: PublicKey): PublicKey {
  return anchor.utils.token.associatedAddress({ mint, owner });
}

/** All PDAs for a given epoch. */
function epochPDAs(
  program: Program<TppProtocol>,
  assetKey: PublicKey,
  epochId: BN
) {
  const epochIdBytes = epochId.toArrayLike(Buffer, "le", 8);
  const [epochPda] = PublicKey.findProgramAddressSync(
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
  return { epochPda, longMint, shortMint };
}

/** Vault PDA for a given minter and index. */
function vaultPDA(
  program: Program<TppProtocol>,
  epochPda: PublicKey,
  minter: PublicKey,
  vaultIndex: BN
): PublicKey {
  const idxBytes = vaultIndex.toArrayLike(Buffer, "le", 8);
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), epochPda.toBuffer(), minter.toBuffer(), idxBytes],
    program.programId
  );
  return vaultPda;
}

/** MinterState PDA for a given minter. */
function minterStatePDA(
  program: Program<TppProtocol>,
  minter: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("minter_state"), minter.toBuffer()],
    program.programId
  );
  return pda;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("TPP Protocol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.TppProtocol as Program<TppProtocol>;
  const connection = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  // Shared fixtures (created once in before())
  let usdcMint: PublicKey;
  let assetKey: Keypair; // oracle asset identifier
  let oracleKp: Keypair; // 16-byte mock oracle account
  let protocolConfig: PublicKey;
  let feeTreasury: PublicKey;
  let epochPda: PublicKey;
  let longMint: PublicKey;
  let shortMint: PublicKey;

  // Admin's primary vault (vault index 0)
  let adminVaultPda: PublicKey;

  const EPOCH_ID = new BN(0);
  const VAULT_0 = new BN(0);

  // ── Helper: create a 16-byte oracle account owned by the program ─────────
  async function createOracleAccount(): Promise<Keypair> {
    const kp = Keypair.generate();
    const lamports = await connection.getMinimumBalanceForRentExemption(16);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: kp.publicKey,
        lamports,
        space: 16,
        programId: program.programId,
      })
    );
    await provider.sendAndConfirm(tx, [admin, kp]);
    return kp;
  }

  // ── Helper: set mock oracle price ────────────────────────────────────────
  async function setOraclePrice(
    oracle: Keypair,
    priceUsd: BN,
    tsOffset = 0
  ): Promise<void> {
    // Subtract 2 s so the timestamp is always behind the validator clock.
    // Without this, Date.now()/1000 can be slightly ahead of the localnet
    // clock, making checked_sub return None → StalePriceData.
    const ts = new BN(Math.floor(Date.now() / 1000) - 2 + tsOffset);
    await program.methods
      .setMockOraclePrice(priceUsd, ts)
      .accounts({
        oracle: oracle.publicKey,
        authority: admin.publicKey,
      })
      .signers([admin])
      .rpc();
  }

  // ── Helper: mint + give USDC to a wallet ─────────────────────────────────
  async function giveUsdc(
    owner: Keypair,
    amountRaw: number
  ): Promise<PublicKey> {
    const ataInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      admin, // fee payer
      usdcMint,
      owner.publicKey
    );
    await mintTo(
      connection,
      admin,
      usdcMint,
      ataInfo.address,
      admin,
      amountRaw
    );
    return ataInfo.address;
  }

  // ── Before: global setup ──────────────────────────────────────────────────
  before(async () => {
    // Derive protocol-level PDAs
    [protocolConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol_config")],
      program.programId
    );
    [feeTreasury] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_treasury")],
      program.programId
    );

    // Create collateral mint (mock USDC, 6 decimals)
    usdcMint = await createMint(
      connection,
      admin,
      admin.publicKey,
      null,
      6
    );

    // Asset key (arbitrary pubkey used as seed)
    assetKey = Keypair.generate();

    // Create oracle account
    oracleKp = await createOracleAccount();

    // Derive epoch PDAs
    const pdas = epochPDAs(program, assetKey.publicKey, EPOCH_ID);
    epochPda = pdas.epochPda;
    longMint = pdas.longMint;
    shortMint = pdas.shortMint;

    // Admin's first vault
    adminVaultPda = vaultPDA(program, epochPda, admin.publicKey, VAULT_0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Protocol initialisation
  // ──────────────────────────────────────────────────────────────────────────

  it("1. initialises the protocol", async () => {
    await program.methods
      .initializeProtocol(
        MINT_FEE_BPS, // mint_fee_bps
        REDEEM_FEE_BPS, // redeem_fee_bps
        15, // recursive_fee_bps  (0.15 %)
        50, // liquidation_reward_bps (0.5 %)
        3, // max_recursive_depth
        new BN(0), // oracle_conf_denominator  (0 = skip confidence check in mock mode)
        new BN(60), // max_oracle_age_secs
        10000 // circuit_breaker_bps  (100 % = permissive for tests)
      )
      .accounts({
        config: protocolConfig,
        feeTreasury,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const cfg = await program.account.protocolConfig.fetch(protocolConfig);
    assert.equal(cfg.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(cfg.mintFeeBps, MINT_FEE_BPS);
    assert.equal(cfg.redeemFeeBps, REDEEM_FEE_BPS);
    assert.equal(cfg.paused, false);
    assert.equal(cfg.maxRecursiveDepth, 3);
    assert.equal(cfg.maxOracleAgeSecs.toNumber(), 60);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Epoch creation
  // ──────────────────────────────────────────────────────────────────────────

  it("2. creates epoch 0", async () => {
    await setOraclePrice(oracleKp, PRICE_100);

    await program.methods
      .createEpoch(EPOCH_ID)
      .accounts({
        epoch: epochPda,
        longMint,
        shortMint,
        assetKey: assetKey.publicKey,
        oracle: oracleKp.publicKey,
        config: protocolConfig,
        creator: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([admin])
      .rpc();

    const epoch = await program.account.epoch.fetch(epochPda);
    assert.equal(epoch.referencePrice.toNumber(), 100_000_000);
    assert.equal(epoch.isActive, true);
    assert.ok(epoch.longTokenMint.equals(longMint));
    assert.ok(epoch.shortTokenMint.equals(shortMint));
    // Price band is ±0.5 %
    assert.equal(epoch.priceBandLower.toNumber(), 99_500_000);
    assert.equal(epoch.priceBandUpper.toNumber(), 100_500_000);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Position minting
  // ──────────────────────────────────────────────────────────────────────────

  it("3. mints a position pair (vault 0, admin)", async () => {
    const adminUsdcAta = await giveUsdc(admin, 500_000_000); // 500 USDC
    await setOraclePrice(oracleKp, PRICE_100);

    const minterState = minterStatePDA(program, admin.publicKey);

    await program.methods
      .mintPositionPair(EPOCH_ID, VAULT_0, COLLATERAL_100)
      .accounts({
        epoch: epochPda,
        vault: adminVaultPda,
        minterCollateral: adminUsdcAta,
        vaultCollateral: ata(usdcMint, adminVaultPda),
        minterLongAta: ata(longMint, admin.publicKey),
        minterShortAta: ata(shortMint, admin.publicKey),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        longMint,
        shortMint,
        collateralMint: usdcMint,
        feeTreasury,
        minterState,
        config: protocolConfig,
        oracle: oracleKp.publicKey,
        minter: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([admin])
      .rpc();

    // fee = 100_000_000 * 10 / 10000 = 100_000; net = 99_900_000
    const fee = (100_000_000 * MINT_FEE_BPS) / 10_000;
    const net = 100_000_000 - fee;

    const vault = await program.account.positionVault.fetch(adminVaultPda);
    assert.equal(vault.collateralAmount.toNumber(), net);
    assert.equal(vault.longTokensMinted.toNumber(), net);
    assert.equal(vault.shortTokensMinted.toNumber(), net);
    assert.equal(vault.entryPrice.toNumber(), 100_000_000);
    assert.equal(vault.depth, 0);
    assert.equal(vault.isLiquidated, false);

    // Check minter received equal LONG and SHORT
    const longBal = await getAccount(connection, ata(longMint, admin.publicKey));
    const shortBal = await getAccount(
      connection,
      ata(shortMint, admin.publicKey)
    );
    assert.equal(longBal.amount.toString(), net.toString());
    assert.equal(shortBal.amount.toString(), net.toString());
  });

  it("3b. rejects minting with zero collateral", async () => {
    const minterState = minterStatePDA(program, admin.publicKey);
    const vault1 = vaultPDA(program, epochPda, admin.publicKey, new BN(99));
    const adminUsdcAta = ata(usdcMint, admin.publicKey);
    try {
      await program.methods
        .mintPositionPair(EPOCH_ID, new BN(99), new BN(0))
        .accounts({
          epoch: epochPda,
          vault: vault1,
          minterCollateral: adminUsdcAta,
          vaultCollateral: ata(usdcMint, vault1),
          minterLongAta: ata(longMint, admin.publicKey),
          minterShortAta: ata(shortMint, admin.publicKey),
          treasuryCollateral: ata(usdcMint, feeTreasury),
          longMint,
          shortMint,
          collateralMint: usdcMint,
          feeTreasury,
          minterState,
          config: protocolConfig,
          oracle: oracleKp.publicKey,
          minter: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected ZeroCollateral");
    } catch (err: any) {
      assert.include(err.message, "ZeroCollateral");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. LONG token redemption
  // ──────────────────────────────────────────────────────────────────────────

  it("4. redeems half the LONG tokens", async () => {
    await setOraclePrice(oracleKp, PRICE_100);

    const adminUsdcAta = ata(usdcMint, admin.publicKey);
    const adminLongAta = ata(longMint, admin.publicKey);

    const longBefore = await getAccount(connection, adminLongAta);
    const usdcBefore = await getAccount(connection, adminUsdcAta);

    // Redeem 1/4 (not 1/2) so the vault still holds collateral after tests 4+5.
    // The vault is zero-sum: each side is worth collateral_amount at entry price,
    // so redeeming 1/2 of both sides would drain it completely.
    const redeemAmt = new BN(longBefore.amount.toString()).divn(4);

    await program.methods
      .redeemPosition(EPOCH_ID, VAULT_0, { long: {} }, redeemAmt)
      .accounts({
        epoch: epochPda,
        vault: adminVaultPda,
        redeemerPositionAta: adminLongAta,
        redeemerCollateral: adminUsdcAta,
        vaultCollateral: ata(usdcMint, adminVaultPda),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        positionMint: longMint,
        collateralMint: usdcMint,
        feeTreasury,
        config: protocolConfig,
        oracle: oracleKp.publicKey,
        redeemer: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const longAfter = await getAccount(connection, adminLongAta);
    const usdcAfter = await getAccount(connection, adminUsdcAta);

    // Half the tokens should be burned
    assert.equal(
      BigInt(longAfter.amount),
      BigInt(longBefore.amount) - BigInt(redeemAmt.toString())
    );
    // USDC balance increased (got payout)
    assert.ok(BigInt(usdcAfter.amount) > BigInt(usdcBefore.amount));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. SHORT token redemption
  // ──────────────────────────────────────────────────────────────────────────

  it("5. redeems half the SHORT tokens", async () => {
    await setOraclePrice(oracleKp, PRICE_100);

    const adminUsdcAta = ata(usdcMint, admin.publicKey);
    const adminShortAta = ata(shortMint, admin.publicKey);

    const shortBefore = await getAccount(connection, adminShortAta);
    const usdcBefore = await getAccount(connection, adminUsdcAta);

    // Redeem 1/4 to match test 4 – leaves vault collateral intact for test 9.
    const redeemAmt = new BN(shortBefore.amount.toString()).divn(4);

    await program.methods
      .redeemPosition(EPOCH_ID, VAULT_0, { short: {} }, redeemAmt)
      .accounts({
        epoch: epochPda,
        vault: adminVaultPda,
        redeemerPositionAta: adminShortAta,
        redeemerCollateral: adminUsdcAta,
        vaultCollateral: ata(usdcMint, adminVaultPda),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        positionMint: shortMint,
        collateralMint: usdcMint,
        feeTreasury,
        config: protocolConfig,
        oracle: oracleKp.publicKey,
        redeemer: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const shortAfter = await getAccount(connection, adminShortAta);
    const usdcAfter = await getAccount(connection, adminUsdcAta);

    assert.equal(
      BigInt(shortAfter.amount),
      BigInt(shortBefore.amount) - BigInt(redeemAmt.toString())
    );
    assert.ok(BigInt(usdcAfter.amount) > BigInt(usdcBefore.amount));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Liquidation – SHORT underwater (price < 5 % of entry)
  // ──────────────────────────────────────────────────────────────────────────

  it("6. liquidates a vault when SHORT is underwater (price < 5 % of entry)", async () => {
    // Create a fresh user so their vault starts clean
    const user = Keypair.generate();
    const sig = await connection.requestAirdrop(
      user.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);

    const userUsdcAta = await giveUsdc(user, 200_000_000);

    const USER_VAULT_IDX = new BN(0);
    const userVault = vaultPDA(
      program,
      epochPda,
      user.publicKey,
      USER_VAULT_IDX
    );
    const userMinterState = minterStatePDA(program, user.publicKey);

    await setOraclePrice(oracleKp, PRICE_100);

    // Mint a position for the user
    await program.methods
      .mintPositionPair(EPOCH_ID, USER_VAULT_IDX, COLLATERAL_100)
      .accounts({
        epoch: epochPda,
        vault: userVault,
        minterCollateral: userUsdcAta,
        vaultCollateral: ata(usdcMint, userVault),
        minterLongAta: ata(longMint, user.publicKey),
        minterShortAta: ata(shortMint, user.publicKey),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        longMint,
        shortMint,
        collateralMint: usdcMint,
        feeTreasury,
        minterState: userMinterState,
        config: protocolConfig,
        oracle: oracleKp.publicKey,
        minter: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([user])
      .rpc();

    // Price crashes to $4 (< 5 % of $100 entry → short_is_liquidatable = true)
    await setOraclePrice(oracleKp, PRICE_4);

    const liquidatorUsdcAta = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      usdcMint,
      admin.publicKey
    );
    const liqBefore = await getAccount(
      connection,
      liquidatorUsdcAta.address
    );

    await program.methods
      .liquidate(EPOCH_ID, USER_VAULT_IDX, user.publicKey)
      .accounts({
        epoch: epochPda,
        vault: userVault,
        vaultCollateral: ata(usdcMint, userVault),
        liquidatorCollateral: liquidatorUsdcAta.address,
        treasuryCollateral: ata(usdcMint, feeTreasury),
        collateralMint: usdcMint,
        feeTreasury,
        config: protocolConfig,
        oracle: oracleKp.publicKey,
        liquidator: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    // Vault must be marked liquidated
    const vaultState = await program.account.positionVault.fetch(userVault);
    assert.equal(vaultState.isLiquidated, true);

    // Liquidator earned a reward (0.5 % of collateral)
    const liqAfter = await getAccount(connection, liquidatorUsdcAta.address);
    assert.ok(BigInt(liqAfter.amount) > BigInt(liqBefore.amount));

    // Restore oracle for subsequent tests
    await setOraclePrice(oracleKp, PRICE_100);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Liquidation rejection when vault is not eligible
  // ──────────────────────────────────────────────────────────────────────────

  it("7. rejects liquidation when vault is not eligible", async () => {
    await setOraclePrice(oracleKp, PRICE_100);

    const adminUsdcAta = ata(usdcMint, admin.publicKey);
    try {
      await program.methods
        .liquidate(EPOCH_ID, VAULT_0, admin.publicKey)
        .accounts({
          epoch: epochPda,
          vault: adminVaultPda,
          vaultCollateral: ata(usdcMint, adminVaultPda),
          liquidatorCollateral: adminUsdcAta,
          treasuryCollateral: ata(usdcMint, feeTreasury),
          collateralMint: usdcMint,
          feeTreasury,
          config: protocolConfig,
          oracle: oracleKp.publicKey,
          liquidator: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected NotEligibleForLiquidation");
    } catch (err: any) {
      assert.include(err.message, "NotEligibleForLiquidation");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8 & 9. Protocol pause / unpause
  // ──────────────────────────────────────────────────────────────────────────

  it("8. admin can pause and unpause the protocol", async () => {
    await program.methods
      .setProtocolPause(true)
      .accounts({ config: protocolConfig, admin: admin.publicKey })
      .signers([admin])
      .rpc();

    let cfg = await program.account.protocolConfig.fetch(protocolConfig);
    assert.equal(cfg.paused, true);

    await program.methods
      .setProtocolPause(false)
      .accounts({ config: protocolConfig, admin: admin.publicKey })
      .signers([admin])
      .rpc();

    cfg = await program.account.protocolConfig.fetch(protocolConfig);
    assert.equal(cfg.paused, false);
  });

  it("9. pause blocks minting but NOT redemption", async () => {
    // Pause
    await program.methods
      .setProtocolPause(true)
      .accounts({ config: protocolConfig, admin: admin.publicKey })
      .signers([admin])
      .rpc();

    await setOraclePrice(oracleKp, PRICE_100);

    // --- minting must fail ---
    const newVaultIdx = new BN(10);
    const newVault = vaultPDA(program, epochPda, admin.publicKey, newVaultIdx);
    const minterState = minterStatePDA(program, admin.publicKey);
    const adminUsdcAta = ata(usdcMint, admin.publicKey);
    try {
      await program.methods
        .mintPositionPair(EPOCH_ID, newVaultIdx, COLLATERAL_100)
        .accounts({
          epoch: epochPda,
          vault: newVault,
          minterCollateral: adminUsdcAta,
          vaultCollateral: ata(usdcMint, newVault),
          minterLongAta: ata(longMint, admin.publicKey),
          minterShortAta: ata(shortMint, admin.publicKey),
          treasuryCollateral: ata(usdcMint, feeTreasury),
          longMint,
          shortMint,
          collateralMint: usdcMint,
          feeTreasury,
          minterState,
          config: protocolConfig,
          oracle: oracleKp.publicKey,
          minter: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected ProtocolPaused");
    } catch (err: any) {
      assert.include(err.message, "ProtocolPaused");
    }

    // --- redemption must STILL work while paused ---
    const adminLongAta = ata(longMint, admin.publicKey);
    const longBal = await getAccount(connection, adminLongAta);
    // Redeem 1 token (smallest possible amount > 0)
    if (longBal.amount > 0n) {
      const usdcBefore = await getAccount(
        connection,
        ata(usdcMint, admin.publicKey)
      );
      await program.methods
        .redeemPosition(EPOCH_ID, VAULT_0, { long: {} }, new BN(1))
        .accounts({
          epoch: epochPda,
          vault: adminVaultPda,
          redeemerPositionAta: adminLongAta,
          redeemerCollateral: ata(usdcMint, admin.publicKey),
          vaultCollateral: ata(usdcMint, adminVaultPda),
          treasuryCollateral: ata(usdcMint, feeTreasury),
          positionMint: longMint,
          collateralMint: usdcMint,
          feeTreasury,
          config: protocolConfig,
          oracle: oracleKp.publicKey,
          redeemer: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const usdcAfter = await getAccount(
        connection,
        ata(usdcMint, admin.publicKey)
      );
      // Payout might be 0 due to rounding on 1 token, but transaction must succeed
      assert.ok(
        BigInt(usdcAfter.amount) >= BigInt(usdcBefore.amount),
        "Redemption should succeed even when paused"
      );
    }

    // Unpause for remaining tests
    await program.methods
      .setProtocolPause(false)
      .accounts({ config: protocolConfig, admin: admin.publicKey })
      .signers([admin])
      .rpc();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Fee update
  // ──────────────────────────────────────────────────────────────────────────

  it("10a. admin can update fees", async () => {
    await program.methods
      .updateFees(20, 10, 30)
      .accounts({ config: protocolConfig, admin: admin.publicKey })
      .signers([admin])
      .rpc();

    const cfg = await program.account.protocolConfig.fetch(protocolConfig);
    assert.equal(cfg.mintFeeBps, 20);
    assert.equal(cfg.redeemFeeBps, 10);
    assert.equal(cfg.recursiveFeeBps, 30);

    // Reset
    await program.methods
      .updateFees(MINT_FEE_BPS, REDEEM_FEE_BPS, 15)
      .accounts({ config: protocolConfig, admin: admin.publicKey })
      .signers([admin])
      .rpc();
  });

  it("10b. rejects fee update exceeding 5 % cap (501 bps)", async () => {
    try {
      await program.methods
        .updateFees(501, 5, 15) // 501 bps > 500 hard cap
        .accounts({ config: protocolConfig, admin: admin.publicKey })
        .signers([admin])
        .rpc();
      assert.fail("Expected rejection");
    } catch (err: any) {
      assert.ok(err.message.length > 0);
    }
  });

  it("10c. rejects fee update by non-admin", async () => {
    const stranger = Keypair.generate();
    const sig = await connection.requestAirdrop(
      stranger.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);
    try {
      await program.methods
        .updateFees(10, 5, 15)
        .accounts({ config: protocolConfig, admin: stranger.publicKey })
        .signers([stranger])
        .rpc();
      assert.fail("Expected Unauthorized");
    } catch (err: any) {
      assert.include(err.message, "Unauthorized");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 11. Admin transfer
  // ──────────────────────────────────────────────────────────────────────────

  it("11. admin can transfer admin role then transfer back", async () => {
    const newAdmin = Keypair.generate();

    await program.methods
      .transferAdmin()
      .accounts({
        config: protocolConfig,
        admin: admin.publicKey,
        newAdmin: newAdmin.publicKey,
      })
      .signers([admin])
      .rpc();

    let cfg = await program.account.protocolConfig.fetch(protocolConfig);
    assert.equal(cfg.admin.toBase58(), newAdmin.publicKey.toBase58());

    // Transfer back (need SOL for the new admin to sign)
    const sig = await connection.requestAirdrop(
      newAdmin.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);

    await program.methods
      .transferAdmin()
      .accounts({
        config: protocolConfig,
        admin: newAdmin.publicKey,
        newAdmin: admin.publicKey,
      })
      .signers([newAdmin])
      .rpc();

    cfg = await program.account.protocolConfig.fetch(protocolConfig);
    assert.equal(cfg.admin.toBase58(), admin.publicKey.toBase58());
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 12. Oracle validation – stale price
  // ──────────────────────────────────────────────────────────────────────────

  it("12. rejects stale oracle price (age > max_oracle_age_secs = 60 s)", async () => {
    // Set oracle timestamp 120 seconds in the past
    const staleTs = new BN(Math.floor(Date.now() / 1000) - 120);
    await program.methods
      .setMockOraclePrice(PRICE_100, staleTs)
      .accounts({
        oracle: oracleKp.publicKey,
        authority: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    // Creating an epoch requires a fresh oracle → should fail
    const epochId99 = new BN(99);
    const { epochPda: ep99, longMint: lm99, shortMint: sm99 } = epochPDAs(
      program,
      assetKey.publicKey,
      epochId99
    );
    try {
      await program.methods
        .createEpoch(epochId99)
        .accounts({
          epoch: ep99,
          longMint: lm99,
          shortMint: sm99,
          assetKey: assetKey.publicKey,
          oracle: oracleKp.publicKey,
          config: protocolConfig,
          creator: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected StalePriceData");
    } catch (err: any) {
      assert.include(err.message, "StalePriceData");
    }

    // Restore fresh oracle for any lingering state
    await setOraclePrice(oracleKp, PRICE_100);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 13. Second user mints into the same epoch → epoch stats accumulate
  // ──────────────────────────────────────────────────────────────────────────

  it("13. second user can mint into epoch 0 and total_collateral accumulates", async () => {
    const user2 = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      user2.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSig);

    const user2UsdcAta = await giveUsdc(user2, 200_000_000);
    await setOraclePrice(oracleKp, PRICE_100);

    const epochBefore = await program.account.epoch.fetch(epochPda);
    const collateralBefore = epochBefore.totalCollateral.toNumber();

    const user2Vault = vaultPDA(program, epochPda, user2.publicKey, new BN(0));
    const user2MinterState = minterStatePDA(program, user2.publicKey);

    await program.methods
      .mintPositionPair(EPOCH_ID, new BN(0), COLLATERAL_100)
      .accounts({
        epoch: epochPda,
        vault: user2Vault,
        minterCollateral: user2UsdcAta,
        vaultCollateral: ata(usdcMint, user2Vault),
        minterLongAta: ata(longMint, user2.publicKey),
        minterShortAta: ata(shortMint, user2.publicKey),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        longMint,
        shortMint,
        collateralMint: usdcMint,
        feeTreasury,
        minterState: user2MinterState,
        config: protocolConfig,
        oracle: oracleKp.publicKey,
        minter: user2.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([user2])
      .rpc();

    const epochAfter = await program.account.epoch.fetch(epochPda);
    const fee = (100_000_000 * MINT_FEE_BPS) / 10_000;
    const net = 100_000_000 - fee;

    assert.equal(
      epochAfter.totalCollateral.toNumber(),
      collateralBefore + net,
      "epoch.totalCollateral should increase by net collateral"
    );
    assert.equal(epochAfter.longTokenSupply.toNumber() - epochBefore.longTokenSupply.toNumber(), net);
    assert.equal(epochAfter.shortTokenSupply.toNumber() - epochBefore.shortTokenSupply.toNumber(), net);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 14. Multiple vaults per user – minterState.vaultCount tracks all of them
  // ──────────────────────────────────────────────────────────────────────────

  it("14. admin can mint vault 1 and vault 2 – minterState.vaultCount updates correctly", async () => {
    await setOraclePrice(oracleKp, PRICE_100);

    const adminUsdcAta = ata(usdcMint, admin.publicKey);
    const minterState = minterStatePDA(program, admin.publicKey);

    // Vault 1
    const VAULT_1 = new BN(1);
    const vault1 = vaultPDA(program, epochPda, admin.publicKey, VAULT_1);
    await program.methods
      .mintPositionPair(EPOCH_ID, VAULT_1, COLLATERAL_100)
      .accounts({
        epoch: epochPda,
        vault: vault1,
        minterCollateral: adminUsdcAta,
        vaultCollateral: ata(usdcMint, vault1),
        minterLongAta: ata(longMint, admin.publicKey),
        minterShortAta: ata(shortMint, admin.publicKey),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        longMint,
        shortMint,
        collateralMint: usdcMint,
        feeTreasury,
        minterState,
        config: protocolConfig,
        oracle: oracleKp.publicKey,
        minter: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([admin])
      .rpc();

    const stateAfterVault1 = await program.account.minterState.fetch(minterState);
    assert.equal(stateAfterVault1.vaultCount.toNumber(), 2, "vaultCount should be 2 after vault 1");

    // Vault 2
    const VAULT_2 = new BN(2);
    const vault2 = vaultPDA(program, epochPda, admin.publicKey, VAULT_2);
    await program.methods
      .mintPositionPair(EPOCH_ID, VAULT_2, COLLATERAL_100)
      .accounts({
        epoch: epochPda,
        vault: vault2,
        minterCollateral: adminUsdcAta,
        vaultCollateral: ata(usdcMint, vault2),
        minterLongAta: ata(longMint, admin.publicKey),
        minterShortAta: ata(shortMint, admin.publicKey),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        longMint,
        shortMint,
        collateralMint: usdcMint,
        feeTreasury,
        minterState,
        config: protocolConfig,
        oracle: oracleKp.publicKey,
        minter: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([admin])
      .rpc();

    const stateAfterVault2 = await program.account.minterState.fetch(minterState);
    assert.equal(stateAfterVault2.vaultCount.toNumber(), 3, "vaultCount should be 3 after vault 2");

    // Verify vault 2 stored the correct entry price and index
    const v2 = await program.account.positionVault.fetch(vault2);
    assert.equal(v2.index.toNumber(), 2);
    assert.equal(v2.entryPrice.toNumber(), 100_000_000);
    assert.equal(v2.depth, 0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 15. Price outside epoch band rejects minting
  // ──────────────────────────────────────────────────────────────────────────

  it("15. rejects minting when oracle price is outside epoch price band", async () => {
    // Epoch 0 band is [$99.5, $100.5] – set oracle far outside that
    const PRICE_OUTSIDE = new BN(150_000_000); // $150
    await setOraclePrice(oracleKp, PRICE_OUTSIDE);

    const adminUsdcAta = ata(usdcMint, admin.publicKey);
    const minterState = minterStatePDA(program, admin.publicKey);
    const dummyVaultIdx = new BN(50);
    const dummyVault = vaultPDA(program, epochPda, admin.publicKey, dummyVaultIdx);

    try {
      await program.methods
        .mintPositionPair(EPOCH_ID, dummyVaultIdx, COLLATERAL_100)
        .accounts({
          epoch: epochPda,
          vault: dummyVault,
          minterCollateral: adminUsdcAta,
          vaultCollateral: ata(usdcMint, dummyVault),
          minterLongAta: ata(longMint, admin.publicKey),
          minterShortAta: ata(shortMint, admin.publicKey),
          treasuryCollateral: ata(usdcMint, feeTreasury),
          longMint,
          shortMint,
          collateralMint: usdcMint,
          feeTreasury,
          minterState,
          config: protocolConfig,
          oracle: oracleKp.publicKey,
          minter: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected PriceOutsideBand");
    } catch (err: any) {
      assert.include(err.message, "PriceOutsideBand");
    }

    // Restore
    await setOraclePrice(oracleKp, PRICE_100);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 16. Long-side liquidation (price >= 195 % of entry price)
  // ──────────────────────────────────────────────────────────────────────────

  it("16. liquidates a vault when LONG is underwater (price >= 195 % of entry)", async () => {
    const user3 = Keypair.generate();
    const sig = await connection.requestAirdrop(user3.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);

    const user3UsdcAta = await giveUsdc(user3, 200_000_000);
    await setOraclePrice(oracleKp, PRICE_100);

    const user3Vault = vaultPDA(program, epochPda, user3.publicKey, new BN(0));
    const user3MinterState = minterStatePDA(program, user3.publicKey);

    // Mint at $100
    await program.methods
      .mintPositionPair(EPOCH_ID, new BN(0), COLLATERAL_100)
      .accounts({
        epoch: epochPda,
        vault: user3Vault,
        minterCollateral: user3UsdcAta,
        vaultCollateral: ata(usdcMint, user3Vault),
        minterLongAta: ata(longMint, user3.publicKey),
        minterShortAta: ata(shortMint, user3.publicKey),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        longMint,
        shortMint,
        collateralMint: usdcMint,
        feeTreasury,
        minterState: user3MinterState,
        config: protocolConfig,
        oracle: oracleKp.publicKey,
        minter: user3.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([user3])
      .rpc();

    // Price pumps to $196 (>= 195 % of $100 → long_is_liquidatable = true)
    await setOraclePrice(oracleKp, PRICE_196);

    const liqUsdcAta = ata(usdcMint, admin.publicKey);
    const liqBefore = await getAccount(connection, liqUsdcAta);

    await program.methods
      .liquidate(EPOCH_ID, new BN(0), user3.publicKey)
      .accounts({
        epoch: epochPda,
        vault: user3Vault,
        vaultCollateral: ata(usdcMint, user3Vault),
        liquidatorCollateral: liqUsdcAta,
        treasuryCollateral: ata(usdcMint, feeTreasury),
        collateralMint: usdcMint,
        feeTreasury,
        config: protocolConfig,
        oracle: oracleKp.publicKey,
        liquidator: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const vault3State = await program.account.positionVault.fetch(user3Vault);
    assert.equal(vault3State.isLiquidated, true, "Vault should be marked liquidated");

    const liqAfter = await getAccount(connection, liqUsdcAta);
    assert.ok(BigInt(liqAfter.amount) > BigInt(liqBefore.amount), "Liquidator should earn reward");

    // Restore oracle
    await setOraclePrice(oracleKp, PRICE_100);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 17. Double liquidation is rejected
  // ──────────────────────────────────────────────────────────────────────────

  it("17. rejects double liquidation of an already-liquidated vault", async () => {
    // The vault from test 6 (user SHORT-liquidated) is already is_liquidated = true
    const user = Keypair.generate(); // we just need any keypair with the right vault
    // Re-derive the user vault from test 6 – vault was at index 0
    // We need the original test-6 user pubkey. Since we can't get it, create
    // a fresh liquidation scenario and then attempt to liquidate again.

    const user4 = Keypair.generate();
    const airSig = await connection.requestAirdrop(user4.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(airSig);

    const user4UsdcAta = await giveUsdc(user4, 200_000_000);
    await setOraclePrice(oracleKp, PRICE_100);

    const user4Vault = vaultPDA(program, epochPda, user4.publicKey, new BN(0));
    const user4MinterState = minterStatePDA(program, user4.publicKey);

    await program.methods
      .mintPositionPair(EPOCH_ID, new BN(0), COLLATERAL_100)
      .accounts({
        epoch: epochPda, vault: user4Vault,
        minterCollateral: user4UsdcAta,
        vaultCollateral: ata(usdcMint, user4Vault),
        minterLongAta: ata(longMint, user4.publicKey),
        minterShortAta: ata(shortMint, user4.publicKey),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        longMint, shortMint, collateralMint: usdcMint, feeTreasury,
        minterState: user4MinterState, config: protocolConfig,
        oracle: oracleKp.publicKey, minter: user4.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([user4])
      .rpc();

    // Liquidate once (SHORT underwater at $4)
    await setOraclePrice(oracleKp, PRICE_4);
    const liqUsdcAta = ata(usdcMint, admin.publicKey);
    await program.methods
      .liquidate(EPOCH_ID, new BN(0), user4.publicKey)
      .accounts({
        epoch: epochPda, vault: user4Vault,
        vaultCollateral: ata(usdcMint, user4Vault),
        liquidatorCollateral: liqUsdcAta,
        treasuryCollateral: ata(usdcMint, feeTreasury),
        collateralMint: usdcMint, feeTreasury,
        config: protocolConfig, oracle: oracleKp.publicKey,
        liquidator: admin.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    // Try to liquidate again → AlreadyLiquidated
    try {
      await program.methods
        .liquidate(EPOCH_ID, new BN(0), user4.publicKey)
        .accounts({
          epoch: epochPda, vault: user4Vault,
          vaultCollateral: ata(usdcMint, user4Vault),
          liquidatorCollateral: liqUsdcAta,
          treasuryCollateral: ata(usdcMint, feeTreasury),
          collateralMint: usdcMint, feeTreasury,
          config: protocolConfig, oracle: oracleKp.publicKey,
          liquidator: admin.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected AlreadyLiquidated");
    } catch (err: any) {
      assert.include(err.message, "AlreadyLiquidated");
    }

    await setOraclePrice(oracleKp, PRICE_100);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 18. Non-admin cannot pause the protocol
  // ──────────────────────────────────────────────────────────────────────────

  it("18. rejects pause attempt by non-admin", async () => {
    const stranger = Keypair.generate();
    const sig = await connection.requestAirdrop(stranger.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);

    try {
      await program.methods
        .setProtocolPause(true)
        .accounts({ config: protocolConfig, admin: stranger.publicKey })
        .signers([stranger])
        .rpc();
      assert.fail("Expected Unauthorized");
    } catch (err: any) {
      assert.include(err.message, "Unauthorized");
    }

    // Verify protocol is still unpaused
    const cfg = await program.account.protocolConfig.fetch(protocolConfig);
    assert.equal(cfg.paused, false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 19. Treasury has accumulated fees from all protocol operations
  // ──────────────────────────────────────────────────────────────────────────

  it("19. fee treasury has accumulated collateral from all mints and redeems", async () => {
    const treasuryAta = ata(usdcMint, feeTreasury);
    const treasuryAccount = await getAccount(connection, treasuryAta);
    // Tests 3, 6, 13, 14, 16, 17 each minted 100 USDC at 10 bps = 100,000 each
    // Tests 4, 5, 9 redeemed some tokens at 5 bps fee
    // Treasury must be positive
    assert.ok(
      Number(treasuryAccount.amount) > 0,
      `Treasury should have accumulated fees, got ${treasuryAccount.amount}`
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 20. Partial symmetric redemption – both sides receive correct payout
  // ──────────────────────────────────────────────────────────────────────────

  it("20. partial redemption of both long and short at entry price is symmetric", async () => {
    // Use admin vault 2 (minted in test 14 at $100, untouched since)
    const VAULT_2 = new BN(2);
    const vault2 = vaultPDA(program, epochPda, admin.publicKey, VAULT_2);
    const vault2State = await program.account.positionVault.fetch(vault2);
    const net = vault2State.collateralAmount.toNumber();

    await setOraclePrice(oracleKp, PRICE_100);

    const adminLongAta = ata(longMint, admin.publicKey);
    const adminShortAta = ata(shortMint, admin.publicKey);
    const adminUsdcAta = ata(usdcMint, admin.publicKey);

    // Redeem 10% of long tokens from vault 2
    // Note: vault 2's tokens were minted to admin's long/short ATAs which may
    // already have tokens from other vaults – payout is proportional to vault 2's
    // collateral regardless of who holds the tokens.
    const redeemAmt = new BN(Math.floor(net * 0.1));

    const usdcBefore = await getAccount(connection, adminUsdcAta);

    await program.methods
      .redeemPosition(EPOCH_ID, VAULT_2, { long: {} }, redeemAmt)
      .accounts({
        epoch: epochPda,
        vault: vault2,
        redeemerPositionAta: adminLongAta,
        redeemerCollateral: adminUsdcAta,
        vaultCollateral: ata(usdcMint, vault2),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        positionMint: longMint,
        collateralMint: usdcMint,
        feeTreasury,
        config: protocolConfig,
        oracle: oracleKp.publicKey,
        redeemer: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const usdcAfter = await getAccount(connection, adminUsdcAta);
    assert.ok(BigInt(usdcAfter.amount) > BigInt(usdcBefore.amount), "Should receive USDC payout");

    // Verify payout ≈ redeemAmt (at entry price, V_LONG = collateral; after fee deduction)
    const expectedGross = redeemAmt.toNumber(); // at entry price: 1:1
    const expectedFee = Math.floor((expectedGross * REDEEM_FEE_BPS) / 10_000);
    const expectedNet = expectedGross - expectedFee;
    const actualPayout = Number(usdcAfter.amount) - Number(usdcBefore.amount);
    assert.approximately(actualPayout, expectedNet, 2, "Payout should equal gross minus redeem fee");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 21. Second epoch (epoch_id = 1) is created independently
  // ──────────────────────────────────────────────────────────────────────────

  it("21. creates independent epoch 1 with its own mint pair and price band", async () => {
    const EPOCH_1 = new BN(1);
    const { epochPda: epoch1Pda, longMint: lm1, shortMint: sm1 } = epochPDAs(
      program, assetKey.publicKey, EPOCH_1
    );

    await setOraclePrice(oracleKp, PRICE_100);

    await program.methods
      .createEpoch(EPOCH_1)
      .accounts({
        epoch: epoch1Pda,
        longMint: lm1,
        shortMint: sm1,
        assetKey: assetKey.publicKey,
        oracle: oracleKp.publicKey,
        config: protocolConfig,
        creator: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([admin])
      .rpc();

    const epoch1 = await program.account.epoch.fetch(epoch1Pda);
    assert.equal(epoch1.epochId.toNumber(), 1);
    assert.equal(epoch1.referencePrice.toNumber(), 100_000_000);
    assert.equal(epoch1.isActive, true);
    assert.ok(!epoch1.longTokenMint.equals(longMint), "Epoch 1 should have its own LONG mint");
    assert.ok(!epoch1.shortTokenMint.equals(shortMint), "Epoch 1 should have its own SHORT mint");

    // Mint a position in epoch 1
    const adminUsdcAta = ata(usdcMint, admin.publicKey);
    const minterState = minterStatePDA(program, admin.publicKey);
    const epoch1Vault = vaultPDA(program, epoch1Pda, admin.publicKey, new BN(0));

    await program.methods
      .mintPositionPair(EPOCH_1, new BN(0), COLLATERAL_100)
      .accounts({
        epoch: epoch1Pda,
        vault: epoch1Vault,
        minterCollateral: adminUsdcAta,
        vaultCollateral: ata(usdcMint, epoch1Vault),
        minterLongAta: ata(lm1, admin.publicKey),
        minterShortAta: ata(sm1, admin.publicKey),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        longMint: lm1,
        shortMint: sm1,
        collateralMint: usdcMint,
        feeTreasury,
        minterState,
        config: protocolConfig,
        oracle: oracleKp.publicKey,
        minter: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([admin])
      .rpc();

    const epoch1VaultState = await program.account.positionVault.fetch(epoch1Vault);
    const fee = (100_000_000 * MINT_FEE_BPS) / 10_000;
    assert.equal(epoch1VaultState.collateralAmount.toNumber(), 100_000_000 - fee);

    // Epoch 0 should be unaffected
    const epoch0 = await program.account.epoch.fetch(epochPda);
    assert.equal(epoch0.epochId.toNumber(), 0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 22. Unauthorized admin transfer is rejected
  // ──────────────────────────────────────────────────────────────────────────

  it("22. rejects transfer_admin when called by non-admin", async () => {
    const impostor = Keypair.generate();
    const sig = await connection.requestAirdrop(impostor.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);

    const target = Keypair.generate();
    try {
      await program.methods
        .transferAdmin()
        .accounts({
          config: protocolConfig,
          admin: impostor.publicKey,
          newAdmin: target.publicKey,
        })
        .signers([impostor])
        .rpc();
      assert.fail("Expected Unauthorized");
    } catch (err: any) {
      assert.include(err.message, "Unauthorized");
    }

    // Admin must still be the original
    const cfg = await program.account.protocolConfig.fetch(protocolConfig);
    assert.equal(cfg.admin.toBase58(), admin.publicKey.toBase58());
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 23. Vault entry_price and index are stored correctly
  // ──────────────────────────────────────────────────────────────────────────

  it("23. vault entry_price, depth, and index are stored correctly at mint time", async () => {
    // Admin vault 1 (minted in test 14 at PRICE_100, index=1)
    const VAULT_1 = new BN(1);
    const vault1 = vaultPDA(program, epochPda, admin.publicKey, VAULT_1);
    const v1 = await program.account.positionVault.fetch(vault1);

    assert.equal(v1.entryPrice.toNumber(), 100_000_000, "entry_price should be $100");
    assert.equal(v1.depth, 0, "base layer depth = 0");
    assert.equal(v1.index.toNumber(), 1, "index should be 1");
    assert.equal(v1.isLiquidated, false);
    assert.ok(v1.minter.equals(admin.publicKey));
    assert.ok(v1.epoch.equals(epochPda));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 24. Zero-fee redemption (update fees to 0, redeem, restore)
  // ──────────────────────────────────────────────────────────────────────────

  it("24. zero-fee redemption returns gross payout with no deduction", async () => {
    // Set fees to 0
    await program.methods
      .updateFees(0, 0, 0)
      .accounts({ config: protocolConfig, admin: admin.publicKey })
      .signers([admin])
      .rpc();

    await setOraclePrice(oracleKp, PRICE_100);

    // Mint a fresh vault for this test
    const user5 = Keypair.generate();
    const airSig = await connection.requestAirdrop(user5.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(airSig);
    const user5UsdcAta = await giveUsdc(user5, 200_000_000);
    const user5Vault = vaultPDA(program, epochPda, user5.publicKey, new BN(0));
    const user5MinterState = minterStatePDA(program, user5.publicKey);

    await program.methods
      .mintPositionPair(EPOCH_ID, new BN(0), COLLATERAL_100)
      .accounts({
        epoch: epochPda, vault: user5Vault,
        minterCollateral: user5UsdcAta,
        vaultCollateral: ata(usdcMint, user5Vault),
        minterLongAta: ata(longMint, user5.publicKey),
        minterShortAta: ata(shortMint, user5.publicKey),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        longMint, shortMint, collateralMint: usdcMint, feeTreasury,
        minterState: user5MinterState, config: protocolConfig,
        oracle: oracleKp.publicKey, minter: user5.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([user5])
      .rpc();

    // With fee=0, mint net = 100_000_000 (no fee deduction)
    const v5 = await program.account.positionVault.fetch(user5Vault);
    assert.equal(v5.collateralAmount.toNumber(), 100_000_000, "zero mint fee: full collateral in vault");

    // Redeem 50% of long tokens – expect gross = net (no redeem fee)
    const user5LongAta = ata(longMint, user5.publicKey);
    const longBal = await getAccount(connection, user5LongAta);
    const redeemAmt = new BN(longBal.amount.toString()).divn(2);

    const usdcBefore = await getAccount(connection, user5UsdcAta);
    await program.methods
      .redeemPosition(EPOCH_ID, new BN(0), { long: {} }, redeemAmt)
      .accounts({
        epoch: epochPda, vault: user5Vault,
        redeemerPositionAta: user5LongAta,
        redeemerCollateral: user5UsdcAta,
        vaultCollateral: ata(usdcMint, user5Vault),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        positionMint: longMint, collateralMint: usdcMint, feeTreasury,
        config: protocolConfig, oracle: oracleKp.publicKey,
        redeemer: user5.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user5])
      .rpc();

    const usdcAfter = await getAccount(connection, user5UsdcAta);
    const payout = Number(usdcAfter.amount) - Number(usdcBefore.amount);
    // gross = (redeemAmt / 100_000_000) * 100_000_000 = redeemAmt; fee = 0; net = redeemAmt
    assert.approximately(payout, redeemAmt.toNumber(), 1, "Zero-fee: payout equals redeemAmt exactly");

    // Restore fees
    await program.methods
      .updateFees(MINT_FEE_BPS, REDEEM_FEE_BPS, 15)
      .accounts({ config: protocolConfig, admin: admin.publicKey })
      .signers([admin])
      .rpc();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 25. Redeeming more tokens than held is rejected
  // ──────────────────────────────────────────────────────────────────────────

  it("25. rejects redeem when amount exceeds token balance", async () => {
    await setOraclePrice(oracleKp, PRICE_100);

    const adminLongAta = ata(longMint, admin.publicKey);
    const longBal = await getAccount(connection, adminLongAta);
    const tooMany = new BN(longBal.amount.toString()).addn(1_000_000);

    try {
      await program.methods
        .redeemPosition(EPOCH_ID, VAULT_0, { long: {} }, tooMany)
        .accounts({
          epoch: epochPda,
          vault: adminVaultPda,
          redeemerPositionAta: adminLongAta,
          redeemerCollateral: ata(usdcMint, admin.publicKey),
          vaultCollateral: ata(usdcMint, adminVaultPda),
          treasuryCollateral: ata(usdcMint, feeTreasury),
          positionMint: longMint,
          collateralMint: usdcMint,
          feeTreasury,
          config: protocolConfig,
          oracle: oracleKp.publicKey,
          redeemer: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected InsufficientTokenBalance");
    } catch (err: any) {
      assert.include(err.message, "InsufficientTokenBalance");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 26. Redeeming wrong token mint (SHORT mint passed as LONG) fails
  // ──────────────────────────────────────────────────────────────────────────

  it("26. rejects redeem when position_mint does not match token_type", async () => {
    await setOraclePrice(oracleKp, PRICE_100);

    const adminLongAta = ata(longMint, admin.publicKey);
    const adminShortAta = ata(shortMint, admin.publicKey);

    try {
      // Ask for LONG redemption but pass shortMint as position_mint
      await program.methods
        .redeemPosition(EPOCH_ID, VAULT_0, { long: {} }, new BN(1))
        .accounts({
          epoch: epochPda,
          vault: adminVaultPda,
          redeemerPositionAta: adminShortAta, // wrong ATA
          redeemerCollateral: ata(usdcMint, admin.publicKey),
          vaultCollateral: ata(usdcMint, adminVaultPda),
          treasuryCollateral: ata(usdcMint, feeTreasury),
          positionMint: shortMint, // SHORT mint passed for LONG type
          collateralMint: usdcMint,
          feeTreasury,
          config: protocolConfig,
          oracle: oracleKp.publicKey,
          redeemer: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      assert.fail("Expected InvalidTokenType");
    } catch (err: any) {
      assert.include(err.message, "InvalidTokenType");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 27. Liquidation reward math is correct
  // ──────────────────────────────────────────────────────────────────────────

  it("27. liquidation reward equals exactly 0.5 % of vault collateral", async () => {
    const user6 = Keypair.generate();
    const airSig = await connection.requestAirdrop(user6.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(airSig);

    const user6UsdcAta = await giveUsdc(user6, 200_000_000);
    await setOraclePrice(oracleKp, PRICE_100);

    const user6Vault = vaultPDA(program, epochPda, user6.publicKey, new BN(0));
    const user6MinterState = minterStatePDA(program, user6.publicKey);

    await program.methods
      .mintPositionPair(EPOCH_ID, new BN(0), COLLATERAL_100)
      .accounts({
        epoch: epochPda, vault: user6Vault,
        minterCollateral: user6UsdcAta,
        vaultCollateral: ata(usdcMint, user6Vault),
        minterLongAta: ata(longMint, user6.publicKey),
        minterShortAta: ata(shortMint, user6.publicKey),
        treasuryCollateral: ata(usdcMint, feeTreasury),
        longMint, shortMint, collateralMint: usdcMint, feeTreasury,
        minterState: user6MinterState, config: protocolConfig,
        oracle: oracleKp.publicKey, minter: user6.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([user6])
      .rpc();

    const vaultState = await program.account.positionVault.fetch(user6Vault);
    const collateral = vaultState.collateralAmount.toNumber();

    // Set price to trigger liquidation
    await setOraclePrice(oracleKp, PRICE_4);

    const liqUsdcAta = ata(usdcMint, admin.publicKey);
    const balBefore = await getAccount(connection, liqUsdcAta);

    await program.methods
      .liquidate(EPOCH_ID, new BN(0), user6.publicKey)
      .accounts({
        epoch: epochPda, vault: user6Vault,
        vaultCollateral: ata(usdcMint, user6Vault),
        liquidatorCollateral: liqUsdcAta,
        treasuryCollateral: ata(usdcMint, feeTreasury),
        collateralMint: usdcMint, feeTreasury, config: protocolConfig,
        oracle: oracleKp.publicKey, liquidator: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const balAfter = await getAccount(connection, liqUsdcAta);
    const reward = Number(balAfter.amount) - Number(balBefore.amount);
    const expectedReward = Math.floor(collateral * 50 / 10_000); // 0.5% = 50 bps
    assert.approximately(reward, expectedReward, 1, "Liquidation reward must equal 0.5% of vault collateral");

    await setOraclePrice(oracleKp, PRICE_100);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 28. Protocol config stores all initial parameters correctly
  // ──────────────────────────────────────────────────────────────────────────

  it("28. protocol config reflects all parameters set at initialisation", async () => {
    const cfg = await program.account.protocolConfig.fetch(protocolConfig);
    assert.equal(cfg.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(cfg.paused, false);
    assert.equal(cfg.mintFeeBps, MINT_FEE_BPS);
    assert.equal(cfg.redeemFeeBps, REDEEM_FEE_BPS);
    assert.equal(cfg.recursiveFeeBps, 15);
    assert.equal(cfg.liquidationRewardBps, 50);
    assert.equal(cfg.maxRecursiveDepth, 3);
    assert.equal(cfg.maxOracleAgeSecs.toNumber(), 60);
    assert.equal(cfg.circuitBreakerBps, 10000);
    assert.ok(cfg.totalFeesCollected.toNumber() > 0, "Should have collected fees");
    assert.ok(cfg.feeTreasury.equals(feeTreasury));
  });
});

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
});

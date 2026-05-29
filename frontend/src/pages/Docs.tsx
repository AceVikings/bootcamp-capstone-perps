import { useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';

// ─── LogoMark (same as Navbar) ───────────────────────────────────────────────
function LogoMark({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={className}>
      <path d="M 16 4 L 28 16 L 4 16 Z" fill="currentColor" />
      <path d="M 4 16 L 16 28 L 28 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter" />
      <line x1="4" y1="16" x2="28" y2="16" stroke="#080710" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="1.8" fill="currentColor" />
    </svg>
  );
}

// ─── Code block ──────────────────────────────────────────────────────────────
function Code({ children, caption }: { children: string; caption?: string }) {
  return (
    <div className="my-6">
      {caption && (
        <div className="bg-accent/10 border border-accent/30 border-b-0 px-4 py-2 font-mono text-xs text-accent/90 tracking-wide">
          {caption}
        </div>
      )}
      <pre
        className={`bg-[#050410] border border-accent/20 px-5 py-4 overflow-x-auto font-mono text-xs leading-relaxed text-fg/90 ${caption ? '' : ''}`}
      >
        <code>{children.trim()}</code>
      </pre>
    </div>
  );
}

// ─── Inline token badge ───────────────────────────────────────────────────────
function Token({ children }: { children: string }) {
  return (
    <span className="font-mono text-xs bg-accent/10 border border-accent/25 text-accent px-1.5 py-0.5 rounded-sm">
      {children}
    </span>
  );
}

// ─── Callout ─────────────────────────────────────────────────────────────────
function Callout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="my-6 border-l-2 border-accent pl-5 py-1">
      <div className="font-mono text-xs tracking-[0.15em] uppercase text-accent mb-1">{label}</div>
      <div className="font-display text-sm text-fg-muted leading-relaxed">{children}</div>
    </div>
  );
}

// ─── Section heading ─────────────────────────────────────────────────────────
function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-2xl md:text-3xl text-fg tracking-tight mt-14 mb-4 border-t border-fg/8 pt-10 first:mt-0 first:border-t-0 first:pt-0">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-lg text-fg tracking-tight mt-8 mb-3">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-base text-fg-muted leading-relaxed mb-4">
      {children}
    </p>
  );
}

// ─── Sidebar sections ────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'invariant', label: 'The Invariant' },
  { id: 'example-directional', label: 'Directional Trade' },
  { id: 'example-sell-leg', label: 'Sell a Leg' },
  { id: 'example-collateral', label: 'Use as Collateral' },
  { id: 'example-redeem', label: 'Redeem a Position' },
  { id: 'example-cross', label: 'Cross-Market Composability' },
  { id: 'sdk', label: 'SDK Reference' },
];

// ─── Main Docs component ──────────────────────────────────────────────────────
export function Docs({ onBack }: { onBack: () => void }) {
  const [activeSection, setActiveSection] = useState('overview');

  function scrollTo(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="min-h-screen bg-void text-fg">
      {/* Top bar */}
      <header className="fixed top-0 w-full z-50 bg-void/90 backdrop-blur-sm border-b border-accent/20">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button
              onClick={onBack}
              className="flex items-center gap-2 font-mono text-xs text-fg/70 hover:text-fg transition-colors duration-150 tracking-widest uppercase"
            >
              <ArrowLeft size={14} strokeWidth={1.5} />
              Back
            </button>
            <div className="hidden md:flex items-center gap-2.5">
              <LogoMark className="text-accent" />
              <span className="font-mono text-accent text-sm tracking-[0.2em] uppercase">RIVEN</span>
              <ChevronRight size={12} className="text-fg/40" />
              <span className="font-mono text-xs text-fg/65 tracking-widest uppercase">Docs</span>
            </div>
          </div>
          <span className="font-mono text-xs text-fg/65 tracking-wide hidden sm:block">
            Compose &amp; Trade
          </span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 lg:px-12 pt-24 pb-32 flex gap-12 lg:gap-20">

        {/* Sidebar */}
        <aside className="hidden lg:block w-48 shrink-0">
          <nav className="sticky top-28" aria-label="Docs navigation">
            <div className="font-mono text-xs tracking-[0.2em] uppercase text-fg/65 mb-4">
              Contents
            </div>
            <ul className="space-y-1">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => scrollTo(s.id)}
                    className={`w-full text-left font-mono text-xs tracking-wide py-1.5 border-l-2 pl-3 transition-colors duration-100 ${
                      activeSection === s.id
                        ? 'border-accent text-accent'
                        : 'border-fg/25 text-fg/65 hover:text-fg hover:border-fg/60'
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 max-w-3xl">

          {/* ── Overview ── */}
          <section id="overview">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-8 bg-accent" />
              <span className="font-mono text-xs tracking-[0.25em] uppercase text-fg/65">Documentation</span>
            </div>
            <h1 className="font-display text-[clamp(2rem,4vw,3.5rem)] leading-none tracking-tighter text-fg mb-6">
              Compose &amp; Trade
            </h1>
            <P>
              RIVEN turns every perpetual position into two wallet-native SPL tokens:{' '}
              <Token>pLONG-[asset]</Token> and <Token>pSHORT-[asset]</Token>. Because they live
              in your wallet like any other token, you can transfer, sell, collateralize, or
              combine them with other DeFi primitives — without ever interacting with the protocol
              again.
            </P>
            <P>
              This page walks through the core mechanics and five practical examples showing
              how composability changes what's possible with a perpetual position.
            </P>
          </section>

          {/* ── The Invariant ── */}
          <section id="invariant">
            <H2>The Invariant</H2>
            <P>
              At the heart of RIVEN is a simple mathematical guarantee. At any point in time:
            </P>

            <div className="my-6 bg-[#050410] border border-accent/20 px-6 py-5 text-center">
              <span className="font-display text-2xl text-accent tracking-tight">
                value(pLONG) + value(pSHORT) ≡ C
              </span>
              <div className="font-mono text-xs text-fg/65 mt-2 tracking-wide">
                where C = initial collateral deposited (e.g. 100 USDC)
              </div>
            </div>

            <P>
              When SOL price rises, <Token>pLONG-SOL</Token> gains value and{' '}
              <Token>pSHORT-SOL</Token> loses exactly the same amount. When SOL falls,
              the reverse holds. The sum never changes. This means:
            </P>

            <ul className="space-y-2 mb-6 pl-1">
              {[
                'Holding both tokens is equivalent to holding cash (zero net exposure)',
                'Holding only pLONG is a leveraged long with bounded downside',
                'Holding only pSHORT is a leveraged short with bounded downside',
                'Any partial split gives a fractional exposure between the two',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 font-display text-sm text-fg-muted leading-relaxed">
                  <span className="text-accent mt-0.5 shrink-0">→</span>
                  {item}
                </li>
              ))}
            </ul>

            <Callout label="Key insight">
              Because the invariant is enforced by the protocol at redemption, anyone
              holding both tokens can always redeem for exactly C — regardless of current
              market price. This makes the pair risk-free to hold together.
            </Callout>
          </section>

          {/* ── Example 1 ── */}
          <section id="example-directional">
            <H2>Example 1: Directional Trade</H2>
            <P>
              The simplest use case. You're bullish on SOL. Deposit 100 USDC, receive the
              pair, and immediately sell your <Token>pSHORT-SOL</Token> on the open market.
              You're left with only <Token>pLONG-SOL</Token>.
            </P>

            <Code caption="TypeScript — open a leveraged long">
{`import { RivenClient } from '@riven/sdk';

const riven = new RivenClient({ wallet, connection });

// 1. Deposit 100 USDC → receive pLONG-SOL + pSHORT-SOL
const { pLong, pShort } = await riven.deposit({
  asset:      'SOL',
  collateral: 100_000_000, // 100 USDC (6 decimals)
  leverage:   5,           // 5× → position size: 500 USDC notional
});

// 2. Sell the short leg on Jupiter
const quote = await jupiter.quoteExactIn({
  inputMint:  pShort.mint,
  outputMint: USDC_MINT,
  amount:     pShort.balance,
});

await jupiter.swap(quote, wallet);

// You now hold only pLONG-SOL worth ~50 USDC at entry
// Upside: unbounded (bounded by collateral at 0)
// Downside: max loss = value of pLONG → 0`}
            </Code>

            <Callout label="What you end up with">
              A single token in your wallet that tracks SOL price with leverage. No open
              order. No margin account. No maintenance requirement. Just a token.
            </Callout>
          </section>

          {/* ── Example 2 ── */}
          <section id="example-sell-leg">
            <H2>Example 2: Sell a Leg to Rebalance Exposure</H2>
            <P>
              You've been holding a pair for a while. SOL pumped and you want to take
              partial profits without fully closing. Sell a fraction of your{' '}
              <Token>pLONG-SOL</Token> on any DEX. Your remaining pLONG still tracks
              the position — no protocol interaction required.
            </P>

            <Code caption="TypeScript — partial exit by selling tokens">
{`// Assume you already hold pLONG-SOL in your wallet
// SOL is up 40%, pLONG is worth ~70 USDC out of original 100

// Take 30% profits: sell 30% of your pLONG tokens
const sellAmount = Math.floor(pLongBalance * 0.30);

const quote = await jupiter.quoteExactIn({
  inputMint:  PLONG_SOL_MINT,
  outputMint: USDC_MINT,
  amount:     sellAmount,
});

await jupiter.swap(quote, wallet);

// Remaining pLONG continues to track SOL
// No interaction with RIVEN protocol needed
// No position size change event, no liquidation trigger`}
            </Code>

            <H3>Selling the short leg to go more long</H3>
            <P>
              Alternatively, if you hold the full pair (delta-neutral) and want directional
              exposure, simply sell pSHORT on market. This converts a hedged position
              into a long without re-depositing.
            </P>

            <Code caption="TypeScript — convert neutral pair into a long">
{`// Holding: 100 pLONG-SOL + 100 pSHORT-SOL (delta-neutral, ~100 USDC)
// Goal: go net long SOL without new deposit

const pShortBalance = await getTokenBalance(wallet, PSHORT_SOL_MINT);

const quote = await jupiter.quoteExactIn({
  inputMint:  PSHORT_SOL_MINT,
  outputMint: USDC_MINT,
  amount:     pShortBalance, // sell all short leg
});

await jupiter.swap(quote, wallet);

// Result: holding only pLONG-SOL
// Net delta: +1× SOL (relative to collateral)`}
            </Code>
          </section>

          {/* ── Example 3 ── */}
          <section id="example-collateral">
            <H2>Example 3: Use a Position Token as Collateral</H2>
            <P>
              Since <Token>pLONG-SOL</Token> is a real SPL token, any protocol that accepts
              SPL tokens as collateral can accept it. This lets you stack exposure without
              additional capital.
            </P>

            <Code caption="TypeScript — use pLONG as collateral on a lending protocol">
{`// You hold pLONG-SOL worth ~60 USDC (SOL is up)
// You want USDC liquidity without selling your position

// 1. Deposit pLONG into a lending protocol (e.g. Marginfi, Kamino)
const lendingClient = new MarginfiClient({ wallet, connection });

await lendingClient.deposit({
  mint:   PLONG_SOL_MINT,
  amount: pLongBalance,
});

// 2. Borrow against it
const borrowable = await lendingClient.maxBorrow(USDC_MINT);

await lendingClient.borrow({
  mint:   USDC_MINT,
  amount: Math.floor(borrowable * 0.70), // 70% LTV
});

// You now have USDC in hand AND still benefit from SOL price appreciation
// via your pLONG collateral. Rehypothecated position exposure.`}
            </Code>

            <Callout label="Risk note">
              If SOL price drops significantly, the pLONG collateral value decreases and
              your lending position may face liquidation. The RIVEN invariant still holds —
              but the lending protocol has its own liquidation threshold independent of
              RIVEN.
            </Callout>
          </section>

          {/* ── Example 4 ── */}
          <section id="example-redeem">
            <H2>Example 4: Redeem a Position</H2>
            <P>
              At any time, holding both legs of the same asset and expiry lets you
              redeem the pair for your original collateral. No slippage. No market impact.
              Exact collateral returned.
            </P>

            <Code caption="TypeScript — redeem pLONG + pSHORT for collateral">
{`import { RivenClient } from '@riven/sdk';

const riven = new RivenClient({ wallet, connection });

// Redeem a full pair (must hold equal amounts of both legs)
const redeemable = Math.min(pLongBalance, pShortBalance);

const tx = await riven.redeem({
  asset:   'SOL',
  amount:  redeemable,
});

await sendAndConfirm(tx, connection, wallet);

// Result: pLONG + pSHORT burned, USDC returned to wallet
// Amount returned = C (initial collateral), regardless of SOL price
// This is the invariant guarantee — no oracle needed at redemption`}
            </Code>

            <H3>Partial redemption</H3>
            <P>
              You can redeem any amount as long as you hold equal quantities of both legs.
              Partial redemptions are common when you've rebalanced your exposure and want
              to recover capital on the delta-neutral portion.
            </P>

            <Code caption="TypeScript — partial redeem (recover hedged capital)">
{`// You sold 40% of pSHORT earlier to go long
// You still hold 100 pLONG + 60 pSHORT
// The 60 pSHORT you hold can be paired with 60 pLONG to redeem

const redeemable = pShortBalance; // 60 tokens

const tx = await riven.redeem({
  asset:  'SOL',
  amount: redeemable,
});

// Returns: (60/100) × C USDC back to wallet
// Remaining: 40 pLONG still in wallet (pure long exposure)`}
            </Code>
          </section>

          {/* ── Example 5 ── */}
          <section id="example-cross">
            <H2>Example 5: Cross-Market Composability</H2>
            <P>
              Because position tokens are standard SPL tokens, you can combine legs
              from different RIVEN markets to construct synthetic positions — or use them
              in any DeFi primitive without protocol permission.
            </P>

            <Code caption="TypeScript — synthetic spread position (long SOL, short ETH)">
{`// Construct a SOL/ETH spread:
//   Long SOL (bullish on SOL outperforming ETH)
//   Short ETH (hedge or bearish on ETH)

// Step 1: Deposit 100 USDC into SOL market, sell pSHORT-SOL
const solPair = await riven.deposit({ asset: 'SOL', collateral: 100_000_000 });
await sellToken(solPair.pShort, USDC_MINT); // sell short leg

// Step 2: Deposit 100 USDC into ETH market, sell pLONG-ETH
const ethPair = await riven.deposit({ asset: 'ETH', collateral: 100_000_000 });
await sellToken(ethPair.pLong, USDC_MINT); // sell long leg

// Result:
//   Wallet holds pLONG-SOL  → profits if SOL rises
//   Wallet holds pSHORT-ETH → profits if ETH falls
//   Net position: long SOL/short ETH spread`}
            </Code>

            <Callout label="Composability without permission">
              No RIVEN contract call is required to transfer, swap, or use these tokens
              as collateral. Once minted, position tokens are standard SPL tokens. Any
              wallet, DEX, or lending protocol can hold and transfer them freely.
            </Callout>

            <H3>LP a position token pair</H3>
            <P>
              Depositing <Token>pLONG-SOL</Token>/<Token>USDC</Token> into a CLMM pool
              creates an on-chain orderbook for the long leg. LPs earn fees from position
              traders while gaining directional exposure — a yield-bearing long position.
            </P>

            <Code caption="TypeScript — LP pLONG into a Raydium CLMM pool">
{`// Provide pLONG-SOL / USDC liquidity in a concentrated range
// This earns trading fees while maintaining upside SOL exposure

const raydium = new RaydiumSDK({ wallet, connection });

await raydium.addConcentratedLiquidity({
  tokenA:     PLONG_SOL_MINT,
  tokenB:     USDC_MINT,
  amountA:    pLongBalance,
  amountB:    usdcAmount,
  tickLower:  priceToTick(currentPrice * 0.90), // -10% range
  tickUpper:  priceToTick(currentPrice * 1.25), // +25% range
});

// While in range: earn swap fees on every pLONG trade
// Out of range: hold either pure pLONG or pure USDC`}
            </Code>
          </section>

          {/* ── SDK Reference ── */}
          <section id="sdk">
            <H2>SDK Reference</H2>
            <P>
              The RIVEN TypeScript SDK wraps the on-chain program instructions into
              a typed client. All methods return versioned transactions ready to sign
              and send.
            </P>

            <Code caption="Installation">
{`npm install @riven/sdk`}
            </Code>

            <Code caption="Core methods">
{`import { RivenClient } from '@riven/sdk';

const riven = new RivenClient({ wallet, connection });

// ── Deposit ──────────────────────────────────────────────────────
// Locks collateral and mints a pLONG + pSHORT pair
await riven.deposit({ asset, collateral, leverage });

// ── Redeem ───────────────────────────────────────────────────────
// Burns equal amounts of pLONG + pSHORT, returns collateral
await riven.redeem({ asset, amount });

// ── Quote ────────────────────────────────────────────────────────
// Returns current token values (does not send a transaction)
const quote = await riven.quote({ asset });
// → { pLongValue: number, pShortValue: number, collateral: number }

// ── Markets ──────────────────────────────────────────────────────
// Lists all active markets with their mint addresses
const markets = await riven.getMarkets();
// → [{ asset, pLongMint, pShortMint, collateralMint, totalDeposits }]`}
            </Code>

            <Code caption="TypeScript types">
{`interface DepositParams {
  asset:      string;     // 'SOL' | 'BTC' | 'ETH' | ...
  collateral: number;     // in collateral token base units
  leverage:   number;     // 1–20
}

interface RedeemParams {
  asset:  string;
  amount: number;         // token amount (must hold both legs)
}

interface MarketQuote {
  pLongValue:  number;    // USDC value of 1 pLONG token
  pShortValue: number;    // USDC value of 1 pSHORT token
  collateral:  number;    // pLongValue + pShortValue (≡ C)
}`}
            </Code>

            <div className="mt-12 flex flex-wrap gap-4">
              <a
                href="#"
                className="px-6 py-3 border border-accent/60 text-accent/85 font-mono text-xs tracking-widest uppercase hover:border-accent hover:text-accent transition-colors duration-100"
              >
                GitHub →
              </a>
              <a
                href="#"
                className="px-6 py-3 border border-fg/30 text-fg/65 font-mono text-xs tracking-widest uppercase hover:border-fg/60 hover:text-fg transition-colors duration-100"
              >
                Discord
              </a>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}

// @ts-nocheck
import { useState } from 'react';
import { ArrowLeft, ChevronRight, ArrowRight } from 'lucide-react';

// ─── LogoMark ────────────────────────────────────────────────────────────────
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
      <pre className="bg-[#090817] border border-accent/20 px-5 py-4 overflow-x-auto font-mono text-xs leading-relaxed text-fg/85">
        <code>{children.trim()}</code>
      </pre>
    </div>
  );
}

// ─── Inline token badge ───────────────────────────────────────────────────────
function Token({ children, color }: { children: string; color?: 'bull' | 'bear' | 'accent' }) {
  const cls =
    color === 'bull' ? 'bg-bull/10 border-bull/25 text-bull' :
    color === 'bear' ? 'bg-bear/10 border-bear/25 text-bear' :
    'bg-accent/10 border-accent/25 text-accent';
  return (
    <span className={`font-mono text-xs border px-1.5 py-0.5 rounded-sm ${cls}`}>
      {children}
    </span>
  );
}

// ─── Callout ─────────────────────────────────────────────────────────────────
function Callout({ label, children, variant = 'accent' }: {
  label: string;
  children: React.ReactNode;
  variant?: 'accent' | 'bull' | 'bear';
}) {
  const borderCls = variant === 'bull' ? 'border-bull' : variant === 'bear' ? 'border-bear' : 'border-accent';
  const textCls   = variant === 'bull' ? 'text-bull'   : variant === 'bear' ? 'text-bear'   : 'text-accent';
  return (
    <div className={`my-6 border-l-2 ${borderCls} pl-5 py-1`}>
      <div className={`font-mono text-xs tracking-[0.15em] uppercase ${textCls} mb-1`}>{label}</div>
      <div className="font-display text-sm text-fg-muted leading-relaxed">{children}</div>
    </div>
  );
}

// ─── Typography helpers ───────────────────────────────────────────────────────
function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-2xl md:text-3xl text-fg tracking-tight mt-16 mb-3 border-t border-fg/8 pt-10">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-lg text-fg tracking-tight mt-8 mb-2">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="font-display text-base text-fg-muted leading-relaxed mb-4">{children}</p>;
}

// ─── Claim tree diagram ───────────────────────────────────────────────────────
function ClaimTreeDiagram() {
  const box = (label: string, cls: string) => (
    <div className={`font-mono text-xs px-3 py-1.5 border ${cls}`}>{label}</div>
  );
  return (
    <div className="flex flex-col items-center gap-0 select-none py-4">
      {box('USDC collateral', 'border-accent/50 text-accent bg-accent/5')}
      <div className="w-px h-5 bg-accent/30" />
      <div className="flex items-start gap-16">
        <div className="flex flex-col items-center gap-0">
          {box('LONG', 'border-bull/50 text-bull bg-bull/5')}
          <div className="w-px h-5 bg-bull/30" />
          <div className="flex gap-5">
            <div className="flex flex-col items-center">{box('LONG_LONG', 'border-bull/50 text-bull bg-bull/10')}</div>
            <div className="flex flex-col items-center">{box('LONG_SHORT', 'border-accent/30 text-fg-muted bg-surface-2')}</div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-0">
          {box('SHORT', 'border-bear/50 text-bear bg-bear/5')}
          <div className="w-px h-5 bg-bear/30" />
          <div className="flex gap-5">
            <div className="flex flex-col items-center">{box('SHORT_LONG', 'border-accent/30 text-fg-muted bg-surface-2')}</div>
            <div className="flex flex-col items-center">{box('SHORT_SHORT', 'border-bear/50 text-bear bg-bear/10')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sections list ────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'claims',      label: 'Risk Claims' },
  { id: 'deposit',     label: 'Deposit & Mint' },
  { id: 'trade',       label: 'Trading' },
  { id: 'split',       label: 'Recursive Split' },
  { id: 'merge',       label: 'Merge & Redeem' },
  { id: 'claim-tree',  label: 'Claim Tree' },
  { id: 'risk',        label: 'Risk & Solvency' },
  { id: 'get-started', label: 'Get Started' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Docs() {
  const [activeSection, setActiveSection] = useState('overview');

  function goHome() { window.location.hash = ''; }

  function scrollTo(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="min-h-screen bg-void text-fg">

      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-wire bg-void/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
          <button onClick={goHome} className="flex items-center gap-2 text-fg-muted hover:text-fg transition-colors">
            <ArrowLeft size={14} />
            <LogoMark className="text-accent" />
            <span className="font-mono tracking-[0.1em] uppercase text-xs">Raven Protocol</span>
          </button>
          <div className="flex items-center gap-1 text-xs font-mono text-fg-muted">
            <span className="text-accent">Docs</span>
            <ChevronRight size={12} className="opacity-40" />
            <span className="capitalize">{activeSection.replace('-', ' ')}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 flex gap-0">

        {/* Sidebar */}
        <aside className="hidden lg:block w-56 flex-shrink-0 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto pt-8 pb-16 pr-6">
          <nav className="space-y-0.5">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`w-full text-left px-3 py-2 text-sm font-mono tracking-wide transition-colors border-l ${
                  activeSection === s.id
                    ? 'text-accent bg-accent/8 border-accent'
                    : 'text-fg-muted hover:text-fg hover:bg-surface border-transparent'
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 py-12 pb-24 max-w-3xl">

          {/* ── Overview ── */}
          <section id="overview">
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent mb-3">Protocol Documentation</div>
            <h1 className="font-display text-4xl md:text-5xl text-fg tracking-tight mb-6">Raven Protocol</h1>
            <P>
              Raven Protocol is a fully-collateralized, on-chain risk decomposition protocol built on Solana.
              Market exposure is represented as recursive risk claims — real SPL tokens that are tradeable,
              splittable, and redeemable for collateral at any time.
            </P>
            <P>
              When you deposit USDC, the protocol mints two complementary root claims — <Token color="bull">LONG</Token> and <Token color="bear">SHORT</Token> — that together are always worth exactly what you deposited.
              You can trade one side on the orderbook, split either claim into second-order exposure, or merge complementary claims to reclaim collateral.
            </P>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-wire mt-8 mb-2">
              {[
                { label: 'No Liquidations',   desc: 'Your worst outcome is a claim value reaching zero. You can never owe the protocol money.' },
                { label: 'No Funding Rates',  desc: 'LONG and SHORT supply are always equal. No rebalancing pool, no ongoing cost to hold.' },
                { label: 'Always Solvent',    desc: 'The invariant LONG + SHORT = Collateral is enforced on-chain at every state transition.' },
              ].map(c => (
                <div key={c.label} className="bg-surface p-5">
                  <div className="font-mono text-xs tracking-wide text-accent mb-2">{c.label}</div>
                  <p className="font-display text-sm text-fg-muted leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Claims ── */}
          <section id="claims">
            <H2>Risk Claims</H2>
            <P>
              A <strong className="text-fg">claim</strong> is the core primitive of Raven Protocol.
              Every claim is a real SPL token that represents a fractional right over collateral in the claim tree.
              Claims come in two complementary types: <Token color="bull">LONG</Token> and <Token color="bear">SHORT</Token>.
            </P>
            <P>Each claim tracks:</P>
            <ul className="list-none space-y-2 mb-6 pl-1">
              {[
                ['claim_type',   'LONG or SHORT (or recursive variants: LONG_LONG, SHORT_SHORT …)'],
                ['parent_id',    'the claim this was split from; null for root-level claims'],
                ['root_id',      'traces back to the original USDC deposit vault'],
                ['creation_price', 'oracle price at the moment of split; baseline for value redistribution'],
              ].map(([term, def]) => (
                <li key={term} className="flex items-start gap-3 text-sm">
                  <Token>{term}</Token>
                  <span className="text-fg-muted font-display">{def}</span>
                </li>
              ))}
            </ul>
            <Callout label="The Core Invariant">
              At every node in the claim tree: child_A + child_B = parent. This is enforced on-chain at every state transition.
              If splitting or merging would violate the invariant, the transaction reverts.
            </Callout>
          </section>

          {/* ── Deposit ── */}
          <section id="deposit">
            <H2>Deposit &amp; Mint Root Claims</H2>
            <P>
              Depositing collateral is the entry point for all protocol activity. You call <Token>create_root_vault</Token> with an asset and a USDC amount.
              The program holds your USDC in the on-chain vault and mints equal amounts of <Token color="bull">LONG</Token> and <Token color="bear">SHORT</Token> root claims to your wallet.
            </P>
            <Code caption="What happens on-chain">{`
1. Transfer N USDC from your wallet → root vault
2. Mint N/2 LONG claims → your wallet
3. Mint N/2 SHORT claims → your wallet

Invariant: LONG_supply == SHORT_supply == total_deposits / 2`}
            </Code>
            <H3>Token values</H3>
            <P>Both tokens are claims on the same vault. Individually, their value shifts with the oracle price:</P>
            <div className="bg-[#090817] border border-accent/20 px-5 py-5 my-6 font-mono text-xs leading-loose text-fg/85">
              <div><span className="text-bull">V_LONG</span>  = clamp( V/2 + k × ΔPrice, 0, V )</div>
              <div><span className="text-bear">V_SHORT</span> = V − V_LONG</div>
              <div className="mt-3 text-fg-muted">V       = total vault collateral for this epoch</div>
              <div className="text-fg-muted">k       = leverage coefficient (set per epoch)</div>
              <div className="text-fg-muted">ΔPrice  = (currentPrice − refPrice) / refPrice</div>
            </div>
            <P>
              If price rises 10% and k=1, LONG captures more of the vault and SHORT captures less — but their combined value never changes.
            </P>
            <Callout label="You always get both sides">
              Minting always produces a LONG+SHORT pair. If you only want one side, sell the other on the orderbook immediately after minting.
            </Callout>
          </section>

          {/* ── Trade ── */}
          <section id="trade">
            <H2>Trading</H2>
            <P>
              Because LONG and SHORT are standard SPL tokens, they trade on the protocol's central limit orderbook.
              You can buy and sell without touching the vault — no deposit or redemption required.
            </P>
            <H3>Common strategies</H3>
            <div className="space-y-4 my-6">
              {[
                {
                  title: 'Long an asset',
                  color: 'text-bull',
                  steps: [
                    'Mint a LONG/SHORT pair (or buy LONG directly from the orderbook)',
                    'Sell SHORT on the orderbook',
                    'Hold LONG — its claim value rises as the oracle price rises',
                  ],
                },
                {
                  title: 'Short an asset',
                  color: 'text-bear',
                  steps: [
                    'Mint a LONG/SHORT pair',
                    'Sell LONG on the orderbook',
                    'Hold SHORT — its claim value rises as the oracle price falls',
                  ],
                },
                {
                  title: 'Market-neutral / basis trade',
                  color: 'text-accent',
                  steps: [
                    'Hold both LONG and SHORT (or provide liquidity on both sides)',
                    'Earn from bid/ask spread on each side',
                    'Redeem both at any time for your original collateral',
                  ],
                },
                {
                  title: 'Buy exposure without depositing',
                  color: 'text-fg',
                  steps: [
                    'Buy LONG (or SHORT) directly from the orderbook',
                    'No vault interaction needed — pay orderbook price',
                    'Sell or redeem when you want to exit',
                  ],
                },
              ].map(uc => (
                <div key={uc.title} className="bg-surface border border-wire p-5">
                  <div className={`font-mono text-xs tracking-wide mb-3 ${uc.color}`}>{uc.title}</div>
                  <ol className="space-y-1.5">
                    {uc.steps.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm font-display text-fg-muted">
                        <span className="font-mono text-[10px] text-fg/30 mt-0.5 w-4 flex-shrink-0">{i + 1}.</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <P>
              The current version supports <strong className="text-fg">limit orders</strong>. Place a bid or ask at a specific price;
              the backend matching engine pairs orders and settles on-chain.
            </P>
          </section>

          {/* ── Split ── */}
          <section id="split">
            <H2>Recursive Split</H2>
            <P>
              Any depth-1 token (<Token color="bull">LONG</Token> or <Token color="bear">SHORT</Token>) can be split into a second-level complementary pair.
              This lets you express second-order views on an existing position — amplifying directional conviction or hedging within a leg.
            </P>
            <div className="my-8 bg-[#090817] border border-accent/20 p-6">
              <ClaimTreeDiagram />
            </div>
            <H3>Splitting LONG</H3>
            <P>
              Calling <Token>split_claim</Token> on your LONG tokens burns them and mints equal amounts of <Token color="bull">LONG_LONG</Token> and <Token color="bear">LONG_SHORT</Token>.
              The two new tokens partition the value of the original LONG at the moment of the split:
            </P>
            <Code caption="Split invariant">{`
V(LONG_LONG) + V(LONG_SHORT)  ==  V(LONG)   at split time

LONG_LONG  → gains value if price continues UP   (trend following)
LONG_SHORT → gains value if price reverts DOWN   (mean reversion)`}
            </Code>
            <H3>All four depth-2 tokens</H3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-wire my-6">
              {[
                { token: 'LONG_LONG',  color: 'text-bull',     desc: 'Amplified bullish exposure. Captures extra upside if price rallies strongly above the split price.' },
                { token: 'LONG_SHORT', color: 'text-fg-muted', desc: 'Mean-reversion bet within a long. Gains value if price pulls back after the split.' },
                { token: 'SHORT_LONG', color: 'text-fg-muted', desc: 'Mean-reversion bet within a short. Gains value if price bounces from the short split level.' },
                { token: 'SHORT_SHORT',color: 'text-bear',     desc: 'Amplified bearish exposure. Captures extra downside if price continues to fall below the split price.' },
              ].map(t => (
                <div key={t.token} className="bg-surface p-5">
                  <div className={`font-mono text-xs mb-2 ${t.color}`}>{t.token}</div>
                  <p className="font-display text-sm text-fg-muted leading-relaxed">{t.desc}</p>
                </div>
              ))}
            </div>
            <Callout label="Maximum depth: 2">
              Depth-2 tokens cannot be split further. The protocol enforces a hard cap of one recursive split per token.
              Depth-2 tokens can be merged back to restore the depth-1 parent at any time.
            </Callout>
            <H3>Example: isolated trend leg</H3>
            <Code caption="Isolating LONG_LONG from a long position">{`
1. Deposit 100 USDC  →  receive 100 LONG + 100 SHORT
2. Sell 100 SHORT on orderbook  (go directionally long)
3. Call split_claim(100) on LONG
   →  Burns 100 LONG
   →  Mints 100 LONG_LONG + 100 LONG_SHORT
4. Sell 100 LONG_SHORT on orderbook
   →  Net position: 100 LONG_LONG  (amplified trend exposure)
5. If trend reverses: buy back LONG_SHORT, merge → restore LONG`}
            </Code>
          </section>

          {/* ── Merge & Redeem ── */}
          <section id="merge">
            <H2>Merge & Redeem</H2>
            <H3>Merge (restore depth-1 from depth-2)</H3>
            <P>
              If you hold both depth-2 children of a split, you can merge them. <Token>merge_claims</Token> burns equal amounts of the two child tokens and mints back the parent depth-1 token.
              There is no fee on merge — the exit path is always open.
            </P>
            <Code caption="Merge example">{`
Hold:  50 LONG_LONG + 50 LONG_SHORT
Call:  merge_claims(amount=50)
Gets:  50 LONG restored to wallet   (no fee)`}
            </Code>
            <H3>Redeem (burn token → receive USDC)</H3>
            <P>
              Calling <Token>redeem_position</Token> burns a depth-1 token and returns its proportional share of the epoch vault at the current oracle price.
              You can redeem LONG, SHORT, or both at any time while the epoch is active.
            </P>
            <Code caption="Redeem example">{`
Hold:   100 LONG
Oracle: price up 20% from epoch reference price
Call:   redeem_position(100 LONG)
Gets:   ~60 USDC  (proportional share of vault)`}
            </Code>
            <Callout label="Full exit path" variant="bull">
              To exit completely: merge all depth-2 tokens back to depth-1, then redeem both LONG and SHORT.
              You receive your original deposit minus any accumulated fees.
            </Callout>
            <H3>Fee summary</H3>
            <div className="border border-wire divide-y divide-wire my-6">
              {[
                ['Mint position pair', 'Protocol fee (bps)', 'Shown on Dashboard'],
                ['Split claim',        'Recursive fee (bps)', 'Applied to minted children'],
                ['Merge claims',       'No fee', '—'],
                ['Redeem position',    'No fee', 'Always redeemable'],
              ].map(([action, type, note]) => (
                <div key={action} className="grid grid-cols-3 px-4 py-3 text-xs font-mono">
                  <span className="text-fg">{action}</span>
                  <span className="text-accent">{type}</span>
                  <span className="text-fg-muted">{note}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Claim Tree ── */}
          <section id="claim-tree">
            <H2>Claim Tree</H2>
            <P>
              Every split creates a <strong className="text-fg">ClaimNode</strong> on-chain — a small account that records the tree structure:
              the epoch, both child mints, the oracle price at split time, and whether it is still active.
            </P>
            <P>
              The <strong className="text-fg">Portfolio</strong> page visualizes your full claim tree as an interactive DAG.
              Each node shows the token type, current NAV, and the split price at creation.
              You can click any node to merge, redeem, or (at depth 1) split further.
            </P>
            <Code caption="ClaimNode account (simplified)">{`
ClaimNode {
  node_id:          u64            // unique within epoch
  epoch:            Pubkey         // which epoch
  owner:            Pubkey         // who performed the split
  depth:            u8             // 1 = LONG/SHORT, 2 = depth-2
  parent_node:      Option<Pubkey> // None if depth == 1
  side:             TokenType
  left_child_mint:  Pubkey         // e.g. LONG_LONG
  right_child_mint: Pubkey         // e.g. LONG_SHORT
  split_price:      u64            // oracle price at split (6 dec)
  split_time:       i64
  is_active:        bool           // false after merge
}`}
            </Code>
          </section>

          {/* ── Risk & Solvency ── */}
          <section id="risk">
            <H2>Risk &amp; Solvency</H2>
            <H3>No liquidations</H3>
            <P>
              Traditional perps liquidate your margin when the market moves against you. TPP has no margin.
              The worst outcome for any token is that its claim value reaches zero — but the vault still holds the counterpart's collateral and you never owe anything.
            </P>
            <H3>Symmetric supply</H3>
            <P>
              For every LONG minted, exactly one SHORT is minted. The protocol never takes an imbalanced position and never needs to rebalance a funding-rate pool.
            </P>
            <H3>On-chain solvency invariant</H3>
            <P>The program enforces this at every state transition — if it would be violated, the transaction reverts:</P>
            <div className="bg-[#090817] border border-accent/20 px-5 py-4 my-6 font-mono text-xs text-fg/85 leading-loose">
              <div>V_LONG + V_SHORT  ≡  epoch.total_collateral</div>
              <div className="mt-2">V_LONG_LONG + V_LONG_SHORT  ≡  V_LONG  (at split time)</div>
              <div>V_SHORT_LONG + V_SHORT_SHORT  ≡  V_SHORT  (at split time)</div>
            </div>
            <H3>Oracle dependency</H3>
            <P>
              Redemption values are computed from <strong className="text-fg">Pyth price feeds</strong>.
              The program checks oracle staleness and confidence interval before any redemption or split.
              If the oracle is stale or its confidence too wide, the transaction reverts.
            </P>
            <Callout label="Oracle risk" variant="bear">
              As with all DeFi protocols using external price feeds, extreme oracle events could temporarily affect claim values.
              The confidence interval check mitigates this but does not eliminate it.
            </Callout>
            <H3>Liquidation keeper</H3>
            <P>
              If an epoch's price moves so far that one side's claim value reaches zero, a permissionless <Token>liquidate</Token> instruction
              lets anyone settle the insolvent vault and distribute remaining collateral to surviving token holders.
            </P>
          </section>

          {/* ── Get Started ── */}
          <section id="get-started">
            <H2>Get Started</H2>
            <div className="space-y-4 my-6">
              {[
                {
                  step: '01',
                  title: 'Connect your wallet',
                  desc: 'Click "App" in the navigation and connect a Phantom or Solflare wallet. You need SOL in your wallet for transaction fees.',
                },
                {
                  step: '02',
                  title: 'Find an active epoch',
                  desc: 'The Dashboard lists all active epochs with reference price, TVL, and time remaining. Pick an epoch for the asset you want exposure to.',
                },
                {
                  step: '03',
                  title: 'Mint or buy a position',
                  desc: 'Deposit USDC to mint a LONG+SHORT pair, or buy just the side you want from the Trade orderbook — no deposit required.',
                },
                {
                  step: '04',
                  title: 'Manage in Portfolio',
                  desc: 'View all your tokens in the Portfolio page. From there you can split, merge, trade, or redeem any position at any time.',
                },
              ].map(s => (
                <div key={s.step} className="flex gap-5 bg-surface border border-wire p-5">
                  <div className="font-mono text-2xl text-fg/15 font-bold flex-shrink-0 w-10 pt-0.5">{s.step}</div>
                  <div>
                    <div className="font-mono text-xs tracking-wide text-accent mb-1">{s.title}</div>
                    <p className="font-display text-sm text-fg-muted leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-10">
              <button
                onClick={() => { window.location.hash = '#/app'; }}
                className="flex items-center justify-center gap-2 bg-accent text-void font-mono text-xs tracking-[0.15em] uppercase px-6 py-3 hover:bg-accent-bright transition-colors"
              >
                Open App <ArrowRight size={12} />
              </button>
              <button
                onClick={goHome}
                className="flex items-center justify-center gap-2 border border-wire text-fg-muted font-mono text-xs tracking-[0.15em] uppercase px-6 py-3 hover:border-accent hover:text-fg transition-colors"
              >
                Back to Home
              </button>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}

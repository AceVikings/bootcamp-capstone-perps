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
  { id: 'overview',   label: 'Overview' },
  { id: 'deposit',    label: 'Deposit & Mint' },
  { id: 'trade',      label: 'Trading' },
  { id: 'split',      label: 'Recursive Split' },
  { id: 'merge',      label: 'Merge & Redeem' },
  { id: 'portfolio',  label: 'Portfolio' },
  { id: 'risk',       label: 'Safety & Risk' },
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
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent mb-3">How It Works</div>
            <h1 className="font-display text-4xl md:text-5xl text-fg tracking-tight mb-6">Raven Protocol</h1>
            <P>
              Raven is an on-chain risk trading protocol built on Solana. You deposit USDC and the protocol mints two complementary tokens —
              <Token color="bull"> LONG</Token> and <Token color="bear"> SHORT</Token> — that together are always worth exactly what you deposited.
            </P>
            <P>
              Trade one side, hold both, split into finer exposure, or redeem for USDC at any time. Every token you hold is a real asset in your wallet — not a ledger entry someone else controls.
            </P>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-wire mt-8 mb-2">
              {[
                { label: 'No Liquidations',  desc: 'The worst that can happen is a token reaches zero. You can never owe the protocol anything.' },
                { label: 'No Funding Rates', desc: 'LONG and SHORT supply are always equal, so there is no ongoing cost just to hold your position.' },
                { label: 'Fully Collateral', desc: 'Every token traces back to real USDC locked in an on-chain vault. No fractional reserve, no bad debt.' },
              ].map(c => (
                <div key={c.label} className="bg-surface p-5">
                  <div className="font-mono text-xs tracking-wide text-accent mb-2">{c.label}</div>
                  <p className="font-display text-sm text-fg-muted leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Deposit ── */}
          <section id="deposit">
            <H2>Deposit & Mint</H2>
            <P>
              Depositing USDC is how you enter the protocol. Pick an active vault on the <strong className="text-fg">App</strong> page, choose how much to deposit, and confirm the transaction in your wallet.
            </P>
            <P>
              The protocol instantly mints two tokens directly into your wallet:
            </P>
            <div className="grid grid-cols-2 gap-px bg-wire my-6">
              <div className="bg-surface p-5">
                <div className="font-mono text-xs text-bull mb-2">LONG</div>
                <p className="font-display text-sm text-fg-muted leading-relaxed">
                  Gains value when the oracle price rises above the vault's reference price. The higher the price goes, the more USDC a LONG token is worth.
                </p>
              </div>
              <div className="bg-surface p-5">
                <div className="font-mono text-xs text-bear mb-2">SHORT</div>
                <p className="font-display text-sm text-fg-muted leading-relaxed">
                  Gains value when the oracle price falls. The lower the price drops, the more USDC a SHORT token is worth.
                </p>
              </div>
            </div>
            <Callout label="You always get both sides">
              Minting gives you equal amounts of LONG and SHORT. If you only want one side, sell the other on the orderbook straight after minting.
            </Callout>
            <P>
              The combined value of your LONG and SHORT always equals your original deposit — no matter where the price goes. One side gains exactly what the other loses.
            </P>
          </section>

          {/* ── Trade ── */}
          <section id="trade">
            <H2>Trading</H2>
            <P>
              LONG and SHORT are standard Solana tokens. They trade on the protocol's built-in orderbook just like any other asset — you can buy or sell without depositing anything.
            </P>
            <H3>Common ways to use the orderbook</H3>
            <div className="space-y-4 my-6">
              {[
                {
                  title: 'Go long',
                  color: 'text-bull',
                  steps: [
                    'Mint a LONG + SHORT pair, or just buy LONG directly from the orderbook.',
                    'Sell SHORT to isolate your directional bet.',
                    'Hold LONG — it appreciates as the oracle price rises.',
                  ],
                },
                {
                  title: 'Go short',
                  color: 'text-bear',
                  steps: [
                    'Mint a LONG + SHORT pair.',
                    'Sell LONG to isolate your short.',
                    'Hold SHORT — it appreciates as the oracle price falls.',
                  ],
                },
                {
                  title: 'Stay neutral',
                  color: 'text-accent',
                  steps: [
                    'Hold both LONG and SHORT after minting.',
                    'Your total value is locked to your original deposit regardless of price.',
                    'Redeem both at any time to get your USDC back.',
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
              Place <strong className="text-fg">limit orders</strong> at a specific price. The matching engine fills orders automatically and the settlement is recorded on-chain.
            </P>
          </section>

          {/* ── Split ── */}
          <section id="split">
            <H2>Recursive Split</H2>
            <P>
              Any LONG or SHORT token can be split into a finer pair. This lets you express a second-order view — amplifying your conviction or hedging within a single position leg.
            </P>
            <div className="my-8 bg-[#090817] border border-accent/20 p-6">
              <ClaimTreeDiagram />
            </div>
            <P>
              When you split a LONG token, it burns and mints two new tokens:
            </P>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-wire my-6">
              {[
                { token: 'LONG_LONG',   color: 'text-bull',     desc: 'Amplified bullish exposure. Gains extra value if price keeps climbing above your split price.' },
                { token: 'LONG_SHORT',  color: 'text-fg-muted', desc: 'Mean-reversion within a long. Gains value if price pulls back after you split.' },
                { token: 'SHORT_LONG',  color: 'text-fg-muted', desc: 'Mean-reversion within a short. Gains value if price bounces back up from your short split level.' },
                { token: 'SHORT_SHORT', color: 'text-bear',     desc: 'Amplified bearish exposure. Gains extra value if price continues falling below your split price.' },
              ].map(t => (
                <div key={t.token} className="bg-surface p-5">
                  <div className={`font-mono text-xs mb-2 ${t.color}`}>{t.token}</div>
                  <p className="font-display text-sm text-fg-muted leading-relaxed">{t.desc}</p>
                </div>
              ))}
            </div>
            <Callout label="One level deep">
              You can split any LONG or SHORT once. The resulting depth-2 tokens cannot be split further — but they can always be merged back into their parent.
            </Callout>
            <H3>Example: isolating trend exposure</H3>
            <div className="bg-surface border border-wire divide-y divide-wire my-6">
              {[
                ['Deposit 100 USDC', 'Receive 100 LONG + 100 SHORT'],
                ['Sell 100 SHORT', 'Now purely long the oracle asset'],
                ['Split 100 LONG', 'Burn LONG → mint 100 LONG_LONG + 100 LONG_SHORT'],
                ['Sell 100 LONG_SHORT', 'Net position: 100 LONG_LONG (amplified upside)'],
                ['Price reverses?', 'Buy LONG_SHORT back and merge to restore LONG'],
              ].map(([action, result]) => (
                <div key={action} className="grid grid-cols-2 px-4 py-3 text-xs font-mono">
                  <span className="text-fg">{action}</span>
                  <span className="text-fg-muted">{result}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Merge & Redeem ── */}
          <section id="merge">
            <H2>Merge & Redeem</H2>
            <H3>Merging back to depth-1</H3>
            <P>
              If you hold both children of a split (e.g. LONG_LONG and LONG_SHORT), you can merge them. The two tokens are burned and your original LONG is restored. There is no fee to merge — the exit path is always open.
            </P>
            <H3>Redeeming for USDC</H3>
            <P>
              Redeem any LONG or SHORT token at any time to receive its current USDC value. The token is burned and USDC is sent from the vault to your wallet at the live oracle price. No waiting for epoch end, no permission required.
            </P>
            <Callout label="Complete exit path" variant="bull">
              To fully exit: merge any depth-2 tokens back to depth-1, then redeem LONG and SHORT. You receive your original deposit adjusted for price movement, minus protocol fees.
            </Callout>
            <H3>Fees at a glance</H3>
            <div className="border border-wire divide-y divide-wire my-6">
              {[
                ['Deposit & mint',  'Small protocol fee', 'Shown before you confirm'],
                ['Split',           'Small recursive fee', 'Applied to newly minted children'],
                ['Merge',           'Free', '—'],
                ['Redeem',          'Free', 'Always available'],
              ].map(([action, cost, note]) => (
                <div key={action} className="grid grid-cols-3 px-4 py-3 text-xs font-mono">
                  <span className="text-fg">{action}</span>
                  <span className="text-accent">{cost}</span>
                  <span className="text-fg-muted">{note}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Portfolio ── */}
          <section id="portfolio">
            <H2>Portfolio</H2>
            <P>
              The <strong className="text-fg">Portfolio</strong> page is your control center. It shows every LONG, SHORT, and split token you hold, grouped by vault.
            </P>
            <div className="space-y-3 my-6">
              {[
                { label: 'Token tree',     desc: 'See your full claim tree as a visual diagram — root positions on the left, split children branching right. Each node shows the token type and its current value.' },
                { label: 'Live values',    desc: 'Token values update in real time from the Pyth oracle feed. You always see what your positions are worth right now.' },
                { label: 'One-click actions', desc: 'Click any node to Split, Merge, Trade, or Redeem without leaving the Portfolio page.' },
                { label: 'History',        desc: 'See all past mints, splits, merges, trades, and redeems for your wallet.' },
              ].map(item => (
                <div key={item.label} className="flex gap-4 bg-surface border border-wire p-4">
                  <div className="font-mono text-xs text-accent tracking-wide min-w-[120px] shrink-0 pt-0.5">{item.label}</div>
                  <p className="font-display text-sm text-fg-muted leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Risk ── */}
          <section id="risk">
            <H2>Safety & Risk</H2>
            <H3>You cannot be liquidated</H3>
            <P>
              Traditional perps can liquidate you when the market moves sharply. Raven has no margin. Your tokens can fall in value all the way to zero — but the protocol will never ask you for more money. Whatever USDC you deposited is the most you can lose.
            </P>
            <H3>No ongoing fees just to hold</H3>
            <P>
              Funding rates on traditional perps charge you continuously for holding a position. On Raven, LONG and SHORT supply are always equal — there is no funding pool to rebalance and no cost to simply hold.
            </P>
            <H3>Oracle prices</H3>
            <P>
              Token values and redemptions are calculated from <strong className="text-fg">Pyth price feeds</strong>. If a price feed is stale or its confidence interval is too wide, transactions will pause until the feed recovers. This protects you from acting on bad data.
            </P>
            <Callout label="Oracle risk" variant="bear">
              Like all DeFi protocols that rely on external price feeds, extreme market events could temporarily affect token values. The confidence interval check reduces this risk but cannot eliminate it entirely.
            </Callout>
            <H3>The invariant that protects you</H3>
            <P>
              At every step — deposit, split, merge, redeem — the protocol checks that the combined value of all tokens in a vault equals the total USDC locked in it. If any action would break this rule, the transaction is rejected on-chain. No bad debt can accumulate.
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
                  desc: 'Click the wallet button in the top navigation and connect Phantom or Solflare. You need a small amount of SOL to pay for Solana transaction fees.',
                },
                {
                  step: '02',
                  title: 'Pick a vault',
                  desc: 'Open the App and browse the active vaults. Each vault shows the asset (e.g. SOL/USDC), the current oracle price, and total USDC locked. Pick one that matches your view.',
                },
                {
                  step: '03',
                  title: 'Deposit or buy',
                  desc: 'Deposit USDC to mint a LONG + SHORT pair, or head to the Trade page to buy just the side you want directly from the orderbook — no deposit required.',
                },
                {
                  step: '04',
                  title: 'Manage your positions',
                  desc: 'Everything you hold lives in your Portfolio. Split tokens for finer exposure, merge them back, trade on the orderbook, or redeem for USDC — all in one place.',
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

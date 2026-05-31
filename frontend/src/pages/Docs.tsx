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

// ─── Option tree diagram ──────────────────────────────────────────────────────
function OptionTreeDiagram() {
  const box = (label: string, cls: string) => (
    <div className={`font-mono text-xs px-3 py-1.5 border ${cls} whitespace-nowrap`}>{label}</div>
  );
  return (
    <div className="flex flex-col items-center gap-0 select-none py-4 overflow-x-auto">
      {box('LONG Vault  (10 wSOL locked)', 'border-accent/50 text-accent bg-accent/5')}
      <div className="w-px h-5 bg-accent/30" />
      <div className="flex items-start gap-10">
        <div className="flex flex-col items-center gap-0">
          {box('CALL  K=180', 'border-bull/50 text-bull bg-bull/5')}
          <div className="w-px h-5 bg-bull/30" />
          <div className="flex gap-4">
            <div className="flex flex-col items-center">{box('CALL  K=190', 'border-bull/50 text-bull bg-bull/10')}</div>
            <div className="flex flex-col items-center">{box('FLOOR  K=190', 'border-accent/30 text-fg-muted bg-surface-2')}</div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-0">
          {box('FLOOR  K=180', 'border-accent/50 text-accent bg-accent/5')}
          <div className="w-px h-5 bg-accent/30" />
          <div className="flex gap-4">
            <div className="flex flex-col items-center">{box('CALL  K=170', 'border-bull/30 text-bull/70 bg-surface-2')}</div>
            <div className="flex flex-col items-center">{box('FLOOR  K=170', 'border-accent/30 text-fg-muted bg-surface-2')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sections list ────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'long-vault',  label: 'LONG Vault' },
  { id: 'short-vault', label: 'SHORT Vault' },
  { id: 'splitting',   label: 'Recursive Split' },
  { id: 'payouts',     label: 'Payout Formulas' },
  { id: 'settlement',  label: 'Settlement' },
  { id: 'merge',       label: 'Merge' },
  { id: 'portfolio',   label: 'Portfolio' },
  { id: 'risk',        label: 'Safety & Risk' },
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
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent mb-3">Capital-Efficient Options</div>
            <h1 className="font-display text-4xl md:text-5xl text-fg tracking-tight mb-6">Raven Protocol</h1>
            <P>
              Raven is a collateral-efficient options protocol built on Solana. Deposit wSOL to mint a{' '}
              <Token color="bull">CALL</Token> + <Token color="accent">FLOOR</Token>{' '}
              pair, or deposit USDC to mint a <Token color="bear">PUT</Token> + <Token color="accent">CAP</Token>{' '}
              pair. Every token is a real SPL token in your wallet, backed 1:1 by vault collateral, and settled by Pyth oracle at European expiry.
            </P>
            <P>
              The protocol's key innovation is <strong className="text-fg">collateral reuse across the option tree</strong>.
              After minting, you can sell your CALL for immediate premium while keeping the FLOOR. The buyer receives
              the CALL as an SPL token and can split it into a tighter <Token color="bull">CALL</Token> + <Token color="accent">FLOOR</Token>{' '}
              at the next $10 strike — still backed by the original vault collateral. This chain repeats up to 8 levels
              deep. One deposit backs an entire options market.
            </P>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-wire mt-8 mb-2">
              {[
                { label: 'One Collateral, Many Positions', desc: 'The same vault SOL or USDC backs every token in the split tree. No extra margin is required at any depth level.' },
                { label: 'Premium at Every Level',        desc: 'Each split lets the holder sell the directional leg (CALL or PUT) for fresh premium. Buyers earn by splitting deeper.' },
                { label: 'Pyth Oracle Settlement',        desc: 'European-style expiry. The Pyth price is locked on-chain on first settle and used by all subsequent redeemers.' },
              ].map(c => (
                <div key={c.label} className="bg-surface p-5">
                  <div className="font-mono text-xs tracking-wide text-accent mb-2">{c.label}</div>
                  <p className="font-display text-sm text-fg-muted leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── LONG Vault ── */}
          <section id="long-vault">
            <H2>LONG Vault</H2>
            <P>
              Deposit <strong className="text-fg">wSOL</strong> into a LONG vault. At mint time the protocol reads the Pyth oracle to set the initial strike <code className="font-mono text-xs text-accent">K</code>. Your backing wSOL is locked 1:1 in the vault and two tokens are minted into your wallet:
            </P>
            <div className="grid grid-cols-2 gap-px bg-wire my-6">
              <div className="bg-surface p-5">
                <div className="font-mono text-xs text-bull mb-2">CALL</div>
                <p className="font-display text-sm text-fg-muted leading-relaxed">
                  Pays <code className="font-mono text-xs text-fg/80">max(P_T − K, 0) · backing / P_T</code> wSOL at settlement. In the money when the settlement price exceeds the strike.
                </p>
              </div>
              <div className="bg-surface p-5">
                <div className="font-mono text-xs text-accent mb-2">FLOOR</div>
                <p className="font-display text-sm text-fg-muted leading-relaxed">
                  Pays <code className="font-mono text-xs text-fg/80">min(P_T, K) · backing / P_T</code> wSOL at settlement. Always positive — this is the downside protection leg.
                </p>
              </div>
            </div>
            <Callout label="Invariant">
              CALL + FLOOR &equiv; backing wSOL at every price. One gains exactly what the other gives up.
            </Callout>
            <H3>Earning premium after minting</H3>
            <P>
              After minting, you hold both legs. The typical capital-efficient flow is:
            </P>
            <div className="border border-wire divide-y divide-wire my-6">
              {[
                ['1. Sell the CALL',          'List your CALL on the orderbook. The buyer pays you a premium and receives the CALL token. You keep the FLOOR as downside protection.'],
                ['2. Buyer splits the CALL',  'The buyer can split the CALL at K + $10 to receive a tighter CALL and a FLOOR at the new strike. Both remain backed by your original wSOL deposit.'],
                ['3. Premium earned again',   'The buyer sells the sub-CALL for more premium. The sub-sub-buyer can split again. This continues up to 8 levels deep.'],
                ['4. Same collateral, always','At every depth level, all option tokens in the tree trace back to the same wSOL vault. No additional margin is ever required.'],
              ].map(([step, desc]) => (
                <div key={step} className="grid grid-cols-[1fr_2fr] px-4 py-3 text-xs">
                  <span className="font-mono text-accent pr-4 pt-0.5 shrink-0">{step}</span>
                  <span className="font-display text-fg-muted leading-relaxed">{desc}</span>
                </div>
              ))}
            </div>
            <P>
              Alternatively, keep the CALL and sell the FLOOR for directional long exposure. Either way, your wSOL remains locked in the vault and backs both tokens until settlement or until you hold the complementary pair and merge.
            </P>
          </section>

          {/* ── SHORT Vault ── */}
          <section id="short-vault">
            <H2>SHORT Vault</H2>
            <P>
              Deposit <strong className="text-fg">USDC</strong> into a SHORT vault. The same oracle-derived strike <code className="font-mono text-xs text-accent">K</code> applies. Two tokens are minted:
            </P>
            <div className="grid grid-cols-2 gap-px bg-wire my-6">
              <div className="bg-surface p-5">
                <div className="font-mono text-xs text-bear mb-2">PUT</div>
                <p className="font-display text-sm text-fg-muted leading-relaxed">
                  Pays <code className="font-mono text-xs text-fg/80">max(K − P_T, 0) · backing / K</code> USDC at settlement. In the money when the settlement price is below the strike.
                </p>
              </div>
              <div className="bg-surface p-5">
                <div className="font-mono text-xs text-accent mb-2">CAP</div>
                <p className="font-display text-sm text-fg-muted leading-relaxed">
                  Pays <code className="font-mono text-xs text-fg/80">min(P_T, K) · backing / K</code> USDC at settlement. Tracks price up to the strike — the upside-capped leg of the SHORT vault.
                </p>
              </div>
            </div>
            <Callout label="Invariant">
              PUT + CAP &equiv; backing USDC at every price. The two legs are complementary.
            </Callout>
          </section>

          {/* ── Splitting ── */}
          <section id="splitting">
            <H2>Recursive Split</H2>
            <P>
              Any option node can be split into a finer strike tier. A split burns the parent token and mints two child tokens at a new strike <code className="font-mono text-xs text-accent">child_strike = parent_strike &plusmn; TICK_SIZE</code> where <code className="font-mono text-xs text-accent">TICK_SIZE = $10</code>.
            </P>
            <Callout label="Collateral efficiency — the core mechanic" variant="bull">
              Splitting never creates new collateral. It re-allocates the parent token's backing across two child tokens.
              The same original wSOL deposit backs the CALL at depth 0, both child tokens at depth 1, all four tokens at depth 2, and so on.
              This is what makes premium extraction possible at every level without additional margin.
            </Callout>
            <div className="my-8 bg-[#090817] border border-accent/20 p-6">
              <OptionTreeDiagram />
            </div>
            <P>
              Splitting a <Token color="bull">CALL</Token> at K=180 upward (+$10) produces:
            </P>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-wire my-6">
              {[
                { token: 'CALL  K=190',  color: 'text-bull',    desc: 'A tighter CALL — in the money only above $190. The buyer can sell this for premium or split it again.' },
                { token: 'FLOOR K=190',  color: 'text-accent',  desc: 'Captures the $180–$190 price band. The buyer keeps this as a hedge or sells it separately.' },
                { token: 'PUT  K=170',   color: 'text-bear',    desc: 'Splitting a PUT at K=180 downward gives a tighter PUT — in the money below $170.' },
                { token: 'CAP  K=170',   color: 'text-accent',  desc: 'Captures the $170–$180 price band. Complements the tighter PUT.' },
              ].map(t => (
                <div key={t.token} className="bg-surface p-5">
                  <div className={`font-mono text-xs mb-2 ${t.color}`}>{t.token}</div>
                  <p className="font-display text-sm text-fg-muted leading-relaxed">{t.desc}</p>
                </div>
              ))}
            </div>
            <Callout label="Max depth">
              Each vault supports up to 8 levels of recursive decomposition. Every level narrows the strike by $10 TICK. The collateral invariant CALL + FLOOR &equiv; backing holds at every depth level.
            </Callout>
            <H3>The premium loop</H3>
            <P>
              Because splitting produces a new directional leg (CALL or PUT) that the holder can sell on the orderbook, every participant in the tree can earn premium:
            </P>
            <div className="border border-wire divide-y divide-wire my-6">
              {[
                ['Depositor (depth 0)',  'Mints CALL + FLOOR. Sells CALL for premium. Keeps FLOOR.'],
                ['Buyer A (depth 1)',    'Buys the CALL. Splits into CALL K+10 + FLOOR K+10. Sells sub-CALL for premium.'],
                ['Buyer B (depth 2)',    'Buys the sub-CALL. Splits into CALL K+20 + FLOOR K+20. Sells for more premium.'],
                ['… (up to depth 8)',   'Same collateral backs every token at every level. No additional margin at any step.'],
              ].map(([actor, action]) => (
                <div key={actor} className="grid grid-cols-[1fr_2fr] px-4 py-3 text-xs">
                  <span className="font-mono text-accent pr-4 shrink-0">{actor}</span>
                  <span className="font-display text-fg-muted leading-relaxed">{action}</span>
                </div>
              ))}
            </div>
            <H3>Strike direction rules</H3>
            <div className="border border-wire divide-y divide-wire my-6">
              {[
                ['Split CALL (+TICK)',  'child_strike = parent + $10', 'Tighter upside exposure'],
                ['Split CALL (−TICK)',  'child_strike = parent − $10', 'Wider upside, larger floor'],
                ['Split FLOOR (+TICK)', 'child_strike = parent + $10', 'Narrower floor band'],
                ['Split PUT (−TICK)',   'child_strike = parent − $10', 'Tighter downside exposure'],
                ['Split PUT (+TICK)',   'child_strike = parent + $10', 'Wider downside, larger cap'],
              ].map(([action, formula, effect]) => (
                <div key={action} className="grid grid-cols-3 px-4 py-3 text-xs font-mono">
                  <span className="text-fg">{action}</span>
                  <span className="text-accent">{formula}</span>
                  <span className="text-fg-muted">{effect}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Payout Formulas ── */}
          <section id="payouts">
            <H2>Payout Formulas</H2>
            <P>
              All payouts are computed at settlement using the Pyth oracle price <code className="font-mono text-xs text-accent">P_T</code> locked on-chain at first-settle. <code className="font-mono text-xs text-accent">K</code> is the node strike and <code className="font-mono text-xs text-accent">backing</code> is the collateral locked in the vault.
            </P>
            <div className="space-y-4 my-6">
              {[
                {
                  token: 'CALL',
                  color: 'text-bull',
                  formula: 'max(P_T − K, 0) · backing / P_T',
                  unit: 'wSOL',
                  note: 'Zero below strike. Gains above strike proportional to price appreciation.',
                },
                {
                  token: 'FLOOR',
                  color: 'text-accent',
                  formula: 'min(P_T, K) · backing / P_T',
                  unit: 'wSOL',
                  note: 'Always positive. Equals backing·K/P_T at or above strike, equals backing below strike.',
                },
                {
                  token: 'PUT',
                  color: 'text-bear',
                  formula: 'max(K − P_T, 0) · backing / K',
                  unit: 'USDC',
                  note: 'Zero above strike. Gains below strike proportional to price decline.',
                },
                {
                  token: 'CAP',
                  color: 'text-accent',
                  formula: 'min(P_T, K) · backing / K',
                  unit: 'USDC',
                  note: 'Tracks price up to the strike. Equals backing at or above strike.',
                },
              ].map(f => (
                <div key={f.token} className="bg-surface border border-wire p-5">
                  <div className={`font-mono text-xs tracking-wide mb-2 ${f.color}`}>{f.token}</div>
                  <div className="font-mono text-sm text-fg bg-[#090817] border border-accent/20 px-4 py-2 mb-2">
                    {f.formula} &nbsp;<span className="text-fg/50">({f.unit})</span>
                  </div>
                  <p className="font-display text-sm text-fg-muted">{f.note}</p>
                </div>
              ))}
            </div>
            <Callout label="Invariants">
              CALL + FLOOR &equiv; backing wSOL &nbsp;|&nbsp; PUT + CAP &equiv; backing USDC. Both hold at every price.
            </Callout>
          </section>

          {/* ── Settlement ── */}
          <section id="settlement">
            <H2>Settlement</H2>
            <P>
              Raven Protocol uses <strong className="text-fg">European-style expiry</strong>. Tokens cannot be redeemed for collateral before the settlement timestamp — but they can be traded or merged freely until then.
            </P>
            <H3>How the oracle price is locked</H3>
            <P>
              The <em>first</em> call to the <code className="font-mono text-xs text-accent">settle</code> instruction on a vault reads the Pyth oracle and locks the settlement price <code className="font-mono text-xs text-accent">P_T</code> permanently into the vault account on-chain. Every subsequent settlement call for the same vault uses that same locked price — not a fresh oracle read.
            </P>
            <Callout label="No oracle manipulation window" variant="bull">
              Because P_T is locked by the first settler and reused for all, there is no incentive to delay your settlement call to wait for a favorable oracle reading. The price is locked once and final.
            </Callout>
            <H3>After settlement</H3>
            <P>
              Once a vault is settled, any holder of a CALL, FLOOR, PUT, or CAP token from that vault can redeem their tokens for the corresponding collateral payout using the payout formulas above. The transaction burns the option token and transfers collateral from the vault to your wallet.
            </P>
            <div className="border border-wire divide-y divide-wire my-6">
              {[
                ['Before expiry',  'Trade, split, merge, hold', 'Cannot redeem for collateral'],
                ['At expiry',      'First settle locks P_T',    'Pyth oracle price recorded on-chain'],
                ['After settle',   'Redeem any token',           'Collateral transferred at locked price'],
              ].map(([when, action, note]) => (
                <div key={when} className="grid grid-cols-3 px-4 py-3 text-xs font-mono">
                  <span className="text-fg">{when}</span>
                  <span className="text-accent">{action}</span>
                  <span className="text-fg-muted">{note}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Merge ── */}
          <section id="merge">
            <H2>Merge</H2>
            <P>
              If you hold the complementary pair from any node — <Token color="bull">CALL</Token> + <Token color="accent">FLOOR</Token> (same strike, same vault) or <Token color="bear">PUT</Token> + <Token color="accent">CAP</Token> (same strike, same vault) — you can merge them back into the parent token at any time before expiry.
            </P>
            <P>
              Merging burns both child tokens and restores the parent. No fee, no permission required. The merge path is always open.
            </P>
            <Callout label="Full reversibility" variant="bull">
              Capital is never permanently fragmented. Any split can be reversed by holding the complementary pair and calling merge. You can work back up the tree to recover a higher-level token.
            </Callout>
            <H3>Typical merge scenario</H3>
            <div className="bg-surface border border-wire divide-y divide-wire my-6">
              {[
                ['Hold CALL K=190 + FLOOR K=190', 'Merge →', 'CALL K=180 restored'],
                ['Hold CALL K=180 + FLOOR K=180', 'Merge →', 'Vault node restored'],
                ['Wait for settlement',           'Settle →', 'Redeem for wSOL backing'],
              ].map(([from, arrow, to]) => (
                <div key={from} className="grid grid-cols-[2fr_1fr_2fr] px-4 py-3 text-xs font-mono">
                  <span className="text-fg">{from}</span>
                  <span className="text-accent text-center">{arrow}</span>
                  <span className="text-fg-muted">{to}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Portfolio ── */}
          <section id="portfolio">
            <H2>Portfolio</H2>
            <P>
              The <strong className="text-fg">Portfolio</strong> page shows every vault you have participated in and all option node positions you hold, grouped by vault.
            </P>
            <div className="space-y-3 my-6">
              {[
                { label: 'Vault list',         desc: 'See all LONG and SHORT vaults you have deposited into, with current collateral, strike K, and settlement status.' },
                { label: 'Node positions',     desc: 'Each vault expands to show your CALL, FLOOR, PUT, and CAP token balances at each strike tier.' },
                { label: 'Live oracle price',  desc: 'The current Pyth oracle price is shown alongside your strike K, letting you see instantly whether your option tokens are in or out of the money.' },
                { label: 'One-click actions',  desc: 'Deposit, split, merge, or settle directly from any vault or node row without leaving the Portfolio page.' },
              ].map(item => (
                <div key={item.label} className="flex gap-4 bg-surface border border-wire p-4">
                  <div className="font-mono text-xs text-accent tracking-wide min-w-[130px] shrink-0 pt-0.5">{item.label}</div>
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
              Option payouts are bounded below at zero. A CALL or PUT token can expire worthless — that is the worst case. The protocol never asks for additional margin. Whatever collateral you deposited is the maximum you can lose.
            </P>
            <H3>No ongoing holding costs</H3>
            <P>
              Raven option tokens carry no funding rate. There is no periodic cost just to hold a position. CALL, FLOOR, PUT, and CAP tokens are static SPL tokens — transfer them, trade them, or hold them at zero ongoing cost.
            </P>
            <H3>Oracle price and confidence</H3>
            <P>
              Settlement uses the <strong className="text-fg">Pyth pull oracle</strong>. If the confidence interval is too wide at settlement time, the transaction will revert until the feed recovers. The first successful settlement locks the price permanently, so there is no window for manipulation after that point.
            </P>
            <Callout label="Oracle risk" variant="bear">
              Like all DeFi protocols that rely on external price feeds, extreme market dislocation could affect oracle availability at settlement. The confidence-interval check reduces this risk but cannot eliminate it entirely.
            </Callout>
            <H3>Collateral invariant enforced on-chain</H3>
            <P>
              Every deposit, split, merge, and settle instruction verifies that CALL + FLOOR equals vault wSOL backing (or PUT + CAP equals vault USDC backing). If any instruction would break this invariant, it is rejected on-chain. No bad debt can accumulate by construction.
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
                  desc: 'Click the wallet button in the top navigation. Connect Phantom or Solflare. You need a small amount of SOL to pay Solana transaction fees.',
                },
                {
                  step: '02',
                  title: 'Create a vault',
                  desc: 'Go to the Deposit page. Choose LONG vault (deposit wSOL, receive CALL + FLOOR) or SHORT vault (deposit USDC, receive PUT + CAP). Your collateral is locked 1:1 — no rehypothecation.',
                },
                {
                  step: '03',
                  title: 'Earn premium, let buyers split',
                  desc: 'Sell your CALL (or PUT) on the orderbook for immediate premium — keep the FLOOR (or CAP) as a hedge. Buyers who purchase your CALL can split it into a tighter strike, still backed by your original collateral. This repeats up to 8 levels deep.',
                },
                {
                  step: '04',
                  title: 'Settle or merge',
                  desc: 'At European expiry, call settle to lock the Pyth price and redeem for collateral. Or merge your complementary pair before expiry to recover the parent token.',
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

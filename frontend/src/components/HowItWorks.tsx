import { ArrowDownToLine, SplitSquareHorizontal, Timer } from 'lucide-react';

const STEPS = [
  {
    num: '01',
    icon: ArrowDownToLine,
    title: 'Create a Vault',
    body: 'Deposit wSOL into a LONG vault — the protocol reads the Pyth oracle strike K and mints CALL + FLOOR tokens. Or deposit USDC into a SHORT vault to receive PUT + CAP tokens. Collateral is locked 1:1.',
    detail: 'CALL + FLOOR ≡ backing wSOL (always)',
  },
  {
    num: '02',
    icon: SplitSquareHorizontal,
    title: 'Split into Strike Tiers',
    body: 'Split any node at parent_strike ± $10 TICK. A CALL becomes a tighter CALL at K+$10 plus a FLOOR, up to 8 levels deep. Each child token is independently tradeable on the CLOB orderbook.',
    detail: 'MAX_DEPTH = 8 · TICK = $10',
  },
  {
    num: '03',
    icon: Timer,
    title: 'Settle at Expiry',
    body: 'At European expiry, the first settlement call locks the Pyth price P_T on-chain. CALL pays max(P_T−K,0)·backing/P_T in SOL. FLOOR pays min(P_T,K)·backing/P_T. Or merge complementary pairs to reconstruct the parent before settlement.',
    detail: 'Pyth oracle locked · No dispute window',
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="bg-surface py-24 md:py-32 lg:py-40 relative"
      aria-label="How Raven Protocol works"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-12">

        {/* Section header */}
        <div className="mb-16 md:mb-20">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-8 bg-accent" />
            <span className="font-mono text-xs tracking-[0.25em] uppercase text-fg/65">
              Mechanics
            </span>
          </div>
          <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-none tracking-tighter text-fg">
            How It Works.
          </h2>
        </div>

        {/* Steps */}
        <div className="grid lg:grid-cols-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className={[
                  'py-10',
                  i < STEPS.length - 1
                    ? 'border-b lg:border-b-0 lg:border-r border-accent/15 lg:pr-12'
                    : '',
                  i > 0 ? 'lg:pl-12' : '',
                ].join(' ')}
              >
                {/* Step number + icon row */}
                <div className="flex items-center gap-4 mb-7">
                  <div className="w-11 h-11 border border-accent/40 flex items-center justify-center shrink-0">
                    <Icon size={18} strokeWidth={1.5} className="text-accent" />
                  </div>
                  <span className="font-mono text-xs tracking-[0.2em] uppercase text-fg/65">
                    Step {step.num}
                  </span>
                </div>

                <h3 className="font-display text-2xl md:text-3xl text-fg leading-tight tracking-tight mb-3">
                  {step.title}
                </h3>
                <p className="font-display text-base text-fg-muted leading-relaxed mb-5">
                  {step.body}
                </p>

                <div className="inline-flex border border-accent/20 px-3 py-1.5">
                  <span className="font-mono text-xs text-fg/70 tracking-wide">
                    {step.detail}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom note */}
        <div className="border-t border-accent/15 mt-4 pt-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="font-mono text-xs text-fg-muted tracking-wide max-w-xl">
            All operations are non-custodial and permissionless. Merge your complementary
            pair at any time before expiry. No approval required to transfer option tokens.
          </p>
          <a
            href="#/docs"
            className="shrink-0 px-6 py-3 border border-accent/60 text-accent/85 font-mono text-xs tracking-widest uppercase hover:border-accent hover:text-accent transition-colors duration-100"
          >
            READ FULL DOCS →
          </a>
        </div>
      </div>
    </section>
  );
}

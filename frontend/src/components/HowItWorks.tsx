import { ArrowDownToLine, SplitSquareHorizontal, Network } from 'lucide-react';

const STEPS = [
  {
    num: '01',
    icon: ArrowDownToLine,
    title: 'Deposit Collateral',
    body: 'Lock USDC (or supported assets) into the RIVEN vault. This becomes the invariant backing for your token pair. The protocol acknowledges your deposit on-chain.',
    detail: 'Minimum: 10 USDC · Max leverage: 20×',
  },
  {
    num: '02',
    icon: SplitSquareHorizontal,
    title: 'Receive Token Pair',
    body: 'The protocol mints two SPL tokens: pLONG-[asset] and pSHORT-[asset]. Together they always redeem for exactly your initial collateral. They live in your wallet.',
    detail: 'pLONG + pSHORT ≡ 100 USDC (always)',
  },
  {
    num: '03',
    icon: Network,
    title: 'Compose & Trade',
    body: 'Sell one leg on the open market. Use the other as collateral for a new position. Transfer it. Hold it. Or redeem the pair at any time for your collateral back.',
    detail: 'No expiry · No permission required',
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="bg-surface py-24 md:py-32 lg:py-40 relative"
      aria-label="How RIVEN works"
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
            All operations are non-custodial and permissionless. Redeem your pair
            at any time. No approval required to transfer position tokens.
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

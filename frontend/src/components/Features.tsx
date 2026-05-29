import {
  Layers,
  TimerReset,
  GitBranch,
  ShieldCheck,
  BarChart3,
  Zap,
  type LucideIcon,
} from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  index: string;
  title: string;
  problem: string;
  solution: string;
}

const FEATURES: Feature[] = [
  {
    icon: Layers,
    index: '01',
    title: 'Risk Claims, Not Positions',
    problem: 'Your position is a ledger entry',
    solution:
      'Every position leg is a tradeable risk claim — a real SPL token in your wallet. LONG and SHORT claims are independently transferable, splittable, and redeemable without closing.',
  },
  {
    icon: TimerReset,
    index: '02',
    title: 'No Funding Rates',
    problem: 'Indefinite funding bleed destroys PnL',
    solution:
      'LONG and SHORT supply are always equal. The protocol never creates an imbalance, so there is no rebalancing pool and no ongoing cost to hold a claim.',
  },
  {
    icon: GitBranch,
    index: '03',
    title: 'Recursive Decomposition',
    problem: 'No way to express second-order views',
    solution:
      'Any claim can be split into finer-grained risk: LONG → LONG_LONG + LONG_SHORT. Express extreme bullish, bullish-hedge, or any recursive view. The invariant holds at every level.',
  },
  {
    icon: ShieldCheck,
    index: '04',
    title: 'No Liquidations Ever',
    problem: 'Margin calls wipe positions on volatile moves',
    solution:
      'Claims have no margin. A claim’s value can fall to zero but can never go negative. You can never owe the protocol money. Solvency is enforced by construction.',
  },
  {
    icon: BarChart3,
    index: '05',
    title: 'Market-Driven Prices',
    problem: 'vAMM slippage and LP adverse selection',
    solution:
      'Claim values are market-determined. The protocol guarantees only one thing: LONG + SHORT = parent claim. Actual prices emerge from real CLOB order flow.',
  },
  {
    icon: Zap,
    index: '06',
    title: 'Fully Traceable Collateral',
    problem: 'Protocol insolvency from bad debt',
    solution:
      'Every claim traces back to root collateral through the claim tree. The invariant is enforced on-chain at every state transition. No bad debt can accumulate anywhere.',
  },
];

export function Features() {
  return (
    <section
      id="protocol"
      className="bg-void py-24 md:py-32 lg:py-40 relative"
      aria-label="Protocol features"
    >
      {/* Top rule */}
      <div className="h-1 bg-accent w-full absolute top-0 left-0" />

      <div className="max-w-7xl mx-auto px-6 lg:px-12 relative z-10">

        {/* Section header */}
        <div className="grid lg:grid-cols-2 gap-8 items-end mb-12 md:mb-16">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-8 bg-accent" />
              <span className="font-mono text-xs tracking-[0.25em] uppercase text-fg/65">
                Why Raven
              </span>
            </div>
            <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-none tracking-tighter text-fg">
              Six Properties.
              <br />
              <span className="italic text-fg/85">One Protocol.</span>
            </h2>
          </div>
          <p className="font-display text-lg text-fg-muted leading-relaxed lg:pb-2">
            Every major failure mode of today&apos;s derivatives markets has a structural
            cause. Raven Protocol addresses them at the protocol level — not with band-aids.
          </p>
        </div>

        {/* Problem → Solution rows */}
        <div>
          {FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.index}
                className="group relative grid md:grid-cols-[1fr_64px_1fr] border-t border-fg/8 last:border-b last:border-fg/8"
              >
                {/* Ghost index in background */}
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
                  aria-hidden="true"
                >
                  <span className="font-display font-black text-[10rem] leading-none text-fg/[0.025] tracking-tighter">
                    {feat.index}
                  </span>
                </div>

                {/* Left — The Problem (status quo, muted) */}
                <div className="flex flex-col justify-center py-6 pr-6 md:pr-10 relative z-10">
                  <div className="font-mono text-xs tracking-[0.2em] uppercase text-bear/50 mb-3">
                    The Problem
                  </div>
                  <p className="font-display text-xl md:text-2xl italic text-fg/65 leading-tight">
                    "{feat.problem}"
                  </p>
                </div>

                {/* Center — icon divider */}
                <div className="hidden md:flex flex-col items-center justify-center gap-0 relative z-10">
                  <div className="w-px flex-1 bg-fg/8" />
                  <div className="my-4 p-3 border border-accent/25 bg-void group-hover:border-accent/60 transition-colors duration-200">
                    <Icon size={18} strokeWidth={1.5} className="text-accent" />
                  </div>
                  <div className="w-px flex-1 bg-fg/8" />
                </div>

                {/* Right — The Solution */}
                <div className="flex flex-col justify-center py-6 pl-6 md:pl-10 border-t md:border-t-0 border-fg/8 relative z-10">
                  <div className="font-mono text-xs tracking-[0.2em] uppercase text-fg/60 mb-3">
                    {feat.index} · {feat.title}
                  </div>
                  <p className="font-display text-base md:text-lg text-fg leading-relaxed">
                    {feat.solution}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}



import { useState } from 'react';

// Simulates how value redistributes as price moves
// At price = entry: pLONG = 50, pSHORT = 50 (symmetric)
// At 2× price: pLONG → 100, pSHORT → 0
// At 0.5× price: pLONG → 0, pSHORT → 100
function getValues(priceMultiple: number, collateral: number) {
  const long = Math.min(Math.max(collateral * (priceMultiple - 0.5) * 2, 0), collateral);
  const short = collateral - long;
  return { long: Math.round(long * 100) / 100, short: Math.round(short * 100) / 100 };
}

const COLLATERAL = 100;

const PRICE_SCENARIOS = [
  { label: '−50%', multiple: 0.5 },
  { label: '−25%', multiple: 0.75 },
  { label: 'Entry', multiple: 1.0 },
  { label: '+25%', multiple: 1.25 },
  { label: '+50%', multiple: 1.5 },
  { label: '+100%', multiple: 2.0 },
];

export function TokenMechanics() {
  const [activeIdx, setActiveIdx] = useState(2); // default to "Entry"
  const scenario = PRICE_SCENARIOS[activeIdx];
  const { long, short } = getValues(scenario.multiple, COLLATERAL);
  const longPct = (long / COLLATERAL) * 100;

  const isBull = activeIdx >= 2;

  return (
    <section
      id="mechanics"
      className="bg-void py-24 md:py-32 lg:py-40 relative"
      aria-label="Token mechanics"
    >
      {/* Grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Top rule */}
      <div className="h-1 bg-accent w-full absolute top-0 left-0" />

      <div className="max-w-7xl mx-auto px-6 lg:px-12 relative z-10">

        {/* Section header */}
        <div className="grid lg:grid-cols-2 gap-8 items-end mb-16 md:mb-20">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-8 bg-accent" />
              <span className="font-mono text-xs tracking-[0.25em] uppercase text-fg/65">
                The Invariant
              </span>
            </div>
            <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-none tracking-tighter text-fg">
              Value Redistributes.
              <br />
              <span className="italic text-fg/85">Never Vanishes.</span>
            </h2>
          </div>
          <p className="font-display text-lg text-fg-muted leading-relaxed lg:pb-2">
            As price moves, value shifts between pLONG and pSHORT. But the
            sum always equals your original collateral. This isn't accounting
            magic—it's the invariant built into the protocol.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-0 border border-accent/20">

          {/* ── Left: interactive price selector ── */}
          <div
            className="p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-accent/20"
            style={{ backgroundColor: '#050410' }}
          >
            <div className="font-mono text-xs text-fg/65 tracking-widest uppercase mb-6">
              Simulate Price Movement
            </div>

            {/* Price selector buttons */}
            <div className="grid grid-cols-3 gap-2 mb-8">
              {PRICE_SCENARIOS.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => setActiveIdx(i)}
                  className={`
                    py-2.5 font-mono text-xs tracking-widest uppercase transition-colors duration-100
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1
                    ${i === activeIdx
                      ? 'bg-accent text-void border border-accent'
                      : 'border border-fg/30 text-fg/65 hover:border-fg/60 hover:text-fg'
                    }
                    ${i < 2 ? 'text-bear/80' : i > 2 ? 'text-bull/80' : ''}
                    ${i === activeIdx && i < 2 ? 'bg-bear text-void border-bear' : ''}
                    ${i === activeIdx && i > 2 ? 'bg-bull text-void border-bull' : ''}
                  `}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Live values display */}
            <div className="space-y-3 mb-8">
              {/* pLONG bar */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="font-mono text-xs text-fg/70 tracking-widest uppercase">
                    pLONG-SOL
                  </span>
                  <span className="font-mono text-sm text-accent font-medium">
                    ${long.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 bg-accent/10 border border-accent/20">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${longPct}%` }}
                  />
                </div>
              </div>

              {/* pSHORT bar */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="font-mono text-xs text-fg/70 tracking-widest uppercase">
                    pSHORT-SOL
                  </span>
                  <span className="font-mono text-sm text-accent font-medium">
                    ${short.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 bg-accent/10 border border-accent/20">
                  <div
                    className="h-full bg-accent/50 transition-all duration-300"
                    style={{ width: `${100 - longPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Invariant display */}
            <div className="border border-accent/30 p-4 text-center">
              <div className="font-mono text-xs text-fg/65 tracking-widest uppercase mb-2">
                Combined Value
              </div>
              <div className="font-display text-3xl text-accent">
                ${(long + short).toFixed(2)}{' '}
                <span className="text-fg/65 text-lg">USDC</span>
              </div>
              <div className="font-mono text-xs text-fg/65 tracking-wide mt-1">
                ≡ Initial Collateral (always)
              </div>
            </div>
          </div>

          {/* ── Right: explainer text ── */}
          <div className="p-8 lg:p-10 flex flex-col justify-between">

            {/* Formula */}
            <div>
              <div className="font-mono text-xs text-fg/65 tracking-widest uppercase mb-4">
                The Core Invariant
              </div>
              <div className="border-l-4 border-accent pl-6 mb-8">
                <div className="font-display text-2xl md:text-3xl text-fg leading-tight italic mb-2">
                  "pLONG + pSHORT equals your collateral. Always. At every price. Forever."
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-1 bg-accent/30 shrink-0" />
                  <div>
                    <div className="font-display text-lg text-fg mb-1">
                      Zero Counterparty Risk
                    </div>
                    <p className="font-display text-sm text-fg-muted leading-relaxed">
                      The pair tokens are overcollateralized by construction.
                      No oracle can drain the backing. No bad debt accumulates.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-1 bg-accent/30 shrink-0" />
                  <div>
                    <div className="font-display text-lg text-fg mb-1">
                      Instant Redemption
                    </div>
                    <p className="font-display text-sm text-fg-muted leading-relaxed">
                      Any holder of the complete pair can redeem at any time
                      for the full collateral. No waiting periods, no withdrawal queues.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-1 bg-accent/30 shrink-0" />
                  <div>
                    <div className="font-display text-lg text-fg mb-1">
                      Recursive Collateral
                    </div>
                    <p className="font-display text-sm text-fg-muted leading-relaxed">
                      Because pLONG-SOL is an SPL token with real value, it
                      can be deposited to mint a new pair. Derivatives on
                      derivatives—on-chain and permissionless.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Price state indicator */}
            <div className="border-t border-accent/20 pt-6 mt-8 flex items-center gap-3">
              <div
                className={`w-2.5 h-2.5 ${
                  activeIdx === 2 ? 'bg-accent' : isBull ? 'bg-bull' : 'bg-bear'
                } transition-colors duration-300`}
              />
              <span className="font-mono text-xs text-fg-muted tracking-wide">
                {activeIdx === 2
                  ? 'At entry price — symmetric split'
                  : isBull
                  ? `Price up ${scenario.label} — pLONG gains, pSHORT loses`
                  : `Price down ${scenario.label} — pSHORT gains, pLONG loses`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

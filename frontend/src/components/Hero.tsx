import { ArrowRight } from 'lucide-react';

export function Hero() {
  return (
    <section className="min-h-screen bg-void pt-[72px] flex flex-col relative overflow-hidden">

      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.006) 3px, rgba(255,255,255,0.006) 4px)',
        }}
      />

      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex-1 flex flex-col justify-center py-16 lg:py-24 relative z-10 w-full">
        {/* Switch to two-column only at xl so the oversized type doesn't fight the panel */}
        <div className="grid xl:grid-cols-[1fr_auto] gap-12 xl:gap-20 items-center">

          {/* ── Left: editorial typography ── */}
          <div className="min-w-0">
            {/* Pre-label */}
            <div className="flex items-center gap-3 mb-8 md:mb-12">
              <div className="h-px w-10 bg-accent" />
              <span className="font-mono text-xs tracking-[0.25em] uppercase text-fg/65">
                Powered by Pyth
              </span>
            </div>

            {/* Main headline — sized so it never bleeds past the column */}
            <h1 className="font-display leading-none tracking-tighter text-fg mb-0">
              <span className="block text-[clamp(3.5rem,9vw,8rem)]">MINT ONCE.</span>
              <span className="block text-[clamp(2.5rem,6.5vw,6rem)] italic text-fg/90">
                SPLIT DEEPER.
              </span>
            </h1>

            {/* Decorative rule with box — per design system */}
            <div className="flex items-center gap-3 my-8 md:my-10">
              <div className="h-[3px] w-full max-w-[200px] bg-accent" />
              <div className="w-4 h-4 border-2 border-accent shrink-0" />
            </div>

            {/* Subheadline — accurate mechanism description */}
            <p className="font-display text-lg md:text-xl text-fg/90 leading-relaxed max-w-xl mb-3">
              Deposit SOL, receive a <em>CALL + FLOOR</em> pair. Sell the CALL for instant
              premium — the buyer splits it into a tighter strike, still backed by your
              original collateral. One vault, an entire options tree.
            </p>
            <p className="font-mono text-sm text-fg-muted tracking-wide max-w-xl mb-10 md:mb-12">
              No liquidations. No margin. No bad debt. European-style expiry settled by Pyth oracle.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => { window.location.hash = '/app'; }}
                className="flex items-center gap-2 px-8 py-4 bg-accent text-void font-mono text-sm tracking-widest uppercase hover:bg-accent-bright transition-colors duration-100 focus-visible:outline focus-visible:outline-3 focus-visible:outline-accent focus-visible:outline-offset-3">
                LAUNCH APP
                <ArrowRight size={16} strokeWidth={2} />
              </button>
              <button
                onClick={() => { window.location.hash = '/docs'; }}
                className="px-8 py-4 border-2 border-accent text-accent font-mono text-sm tracking-widest uppercase hover:bg-accent hover:text-void transition-colors duration-100 focus-visible:outline focus-visible:outline-3 focus-visible:outline-accent focus-visible:outline-offset-3">
                READ PROTOCOL
              </button>
            </div>

            {/* Protocol tags */}
            <div className="flex flex-wrap items-center gap-3 mt-8">
              {['CALL / PUT / FLOOR / CAP', 'Capital Efficient', 'Pyth Oracle', 'Non-Custodial'].map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-xs tracking-widest uppercase text-fg/60 border border-fg/25 px-3 py-1"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* ── Right: options tree terminal — visible only at xl ── */}
          <div className="hidden xl:flex flex-col gap-3 w-[340px] shrink-0">

            {/* Terminal window */}
            <div
              className="border border-accent/40 relative overflow-hidden"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                backgroundColor: '#050410',
              }}
            >
              {/* Terminal title bar */}
              <div className="flex items-center justify-between border-b border-accent/20 px-4 py-2.5">
                <span className="font-mono text-xs text-fg/65 tracking-widest uppercase">
                  Options Tree · 10 wSOL
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 border border-accent/30" />
                  <div className="w-2 h-2 border border-accent/30" />
                  <div className="w-2 h-2 bg-accent/60" />
                </div>
              </div>

              <div className="p-4">
                {/* Vault deposit */}
                <div className="border border-accent/30 p-3 mb-3 bg-black/40">
                  <div className="font-mono text-[10px] text-fg/55 tracking-widest uppercase mb-1.5">
                    Vault Deposit
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-3xl text-accent leading-none">
                      10.00
                    </span>
                    <span className="font-mono text-sm text-fg/70">wSOL</span>
                  </div>
                  <div className="font-mono text-[10px] text-fg/45 mt-1">K = $182 · at Pyth oracle price</div>
                </div>

                {/* Step 1: MINT */}
                <div className="flex items-center gap-2 py-2 px-1">
                  <div className="flex-1 border-t border-dashed border-accent/20" />
                  <span className="font-mono text-[9px] text-fg/50 tracking-[0.2em] uppercase px-1.5">
                    MINT PAIR
                  </span>
                  <div className="flex-1 border-t border-dashed border-accent/20" />
                </div>

                {/* Root token pair */}
                <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                  <div className="border-2 border-bull p-3 bg-bull/5">
                    <div className="font-mono text-[10px] text-bull/80 tracking-wide mb-1">
                      CALL K=182
                    </div>
                    <div className="font-mono text-[9px] text-fg/50 leading-snug">
                      → sell for<br />premium
                    </div>
                  </div>
                  <div className="border border-accent/40 p-3">
                    <div className="font-mono text-[10px] text-accent/80 tracking-wide mb-1">
                      FLOOR K=182
                    </div>
                    <div className="font-mono text-[9px] text-fg/50 leading-snug">
                      keep as<br />hedge
                    </div>
                  </div>
                </div>

                {/* Step 2: Buyer splits the CALL */}
                <div className="flex items-center gap-2 py-2 px-1">
                  <div className="flex-1 border-t border-dashed border-bull/20" />
                  <span className="font-mono text-[9px] text-bull/50 tracking-[0.2em] uppercase px-1.5">
                    BUYER SPLITS CALL
                  </span>
                  <div className="flex-1 border-t border-dashed border-bull/20" />
                </div>

                {/* Split token pair — tighter strike */}
                <div className="grid grid-cols-2 gap-1.5 mb-4">
                  <div className="border border-bull/45 p-3">
                    <div className="font-mono text-[10px] text-bull/65 tracking-wide mb-1">
                      CALL K=192
                    </div>
                    <div className="font-mono text-[9px] text-fg/40 leading-snug">
                      tighter<br />upside
                    </div>
                  </div>
                  <div className="border border-accent/25 p-3">
                    <div className="font-mono text-[10px] text-accent/55 tracking-wide mb-1">
                      FLOOR K=192
                    </div>
                    <div className="font-mono text-[9px] text-fg/40 leading-snug">
                      $182–$192<br />band
                    </div>
                  </div>
                </div>

                {/* Invariant */}
                <div className="border-t border-accent/20 pt-3">
                  <p className="font-mono text-[10px] text-fg/65 text-center tracking-wide">
                    10 wSOL backs the full tree{' '}
                    <span className="text-accent font-medium">· always</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Oracle price strip */}
            <div className="border border-accent/20 px-4 py-3 flex items-center gap-4 bg-surface text-xs font-mono">
              <span className="text-fg/65 uppercase tracking-widest">SOL/USDC</span>
              <span className="text-accent font-medium">$182.47</span>
              <span className="text-bull">+2.34%</span>
              <div className="ml-auto h-3 w-px bg-fg/30" />
              <span className="text-fg/65 uppercase tracking-widest">Oracle Live</span>
              <span className="w-1.5 h-1.5 bg-bull animate-blink" />
            </div>
          </div>

        </div>
      </div>

      {/* Bottom heavy rule */}
      <div className="h-1 bg-accent w-full relative z-10" />
    </section>
  );
}

import { ArrowRight, Zap } from 'lucide-react';

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

      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex-1 flex flex-col justify-center py-16 lg:py-24 relative z-10">
        <div className="grid lg:grid-cols-[1fr_auto] gap-12 xl:gap-24 items-center">

          {/* ── Left: editorial typography ── */}
          <div>
            {/* Pre-label */}
            <div className="flex items-center gap-3 mb-8 md:mb-12">
              <div className="h-px w-10 bg-accent" />
              <span className="font-mono text-xs tracking-[0.25em] uppercase text-fg/65">
                Built on Solana
              </span>
              <Zap size={12} strokeWidth={2} className="text-fg/55" />
              <span className="font-mono text-xs tracking-[0.25em] uppercase text-fg/65">
                Genesis Launch
              </span>
            </div>

            {/* Main headline — oversized display type */}
            <h1 className="font-display leading-none tracking-tighter text-fg mb-0">
              <span className="block text-[clamp(4rem,12vw,10rem)]">POSITIONS</span>
              <span className="block text-[clamp(3rem,9vw,7.5rem)] italic text-fg/90">
                AS TOKENS.
              </span>
            </h1>

            {/* Decorative rule with box — per design system */}
            <div className="flex items-center gap-3 my-8 md:my-10">
              <div className="h-[3px] w-full max-w-[200px] bg-accent" />
              <div className="w-4 h-4 border-2 border-accent shrink-0" />
            </div>

            {/* Subheadline */}
            <p className="font-display text-lg md:text-xl text-fg/90 leading-relaxed max-w-xl mb-3">
              The first perpetuals protocol where both legs of every trade
              are <em>transferable SPL tokens</em>.
            </p>
            <p className="font-mono text-sm text-fg-muted tracking-wide max-w-xl mb-10 md:mb-12">
              Transfer it. Collateralize it. Compose it. No ledger entries.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4">
              <button className="flex items-center gap-2 px-8 py-4 bg-accent text-void font-mono text-sm tracking-widest uppercase hover:bg-accent-bright transition-colors duration-100 focus-visible:outline focus-visible:outline-3 focus-visible:outline-accent focus-visible:outline-offset-3">
                LAUNCH APP
                <ArrowRight size={16} strokeWidth={2} />
              </button>
              <button className="px-8 py-4 border-2 border-accent text-accent font-mono text-sm tracking-widest uppercase hover:bg-accent hover:text-void transition-colors duration-100 focus-visible:outline focus-visible:outline-3 focus-visible:outline-accent focus-visible:outline-offset-3">
                READ PROTOCOL
              </button>
            </div>

            {/* Protocol tags */}
            <div className="flex flex-wrap items-center gap-3 mt-8">
              {['SPL Tokens', 'CLOB Matching', 'Composable', 'Non-Custodial'].map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-xs tracking-widest uppercase text-fg/60 border border-fg/25 px-3 py-1"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* ── Right: token pair terminal ── */}
          <div className="hidden lg:flex flex-col gap-3 w-[360px] shrink-0">

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
                  Position Mint
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 border border-accent/30" />
                  <div className="w-2 h-2 border border-accent/30" />
                  <div className="w-2 h-2 bg-accent/60" />
                </div>
              </div>

              <div className="p-5">
                {/* Collateral input */}
                <div className="border border-accent/30 p-4 mb-3 bg-black/40">
                  <div className="font-mono text-xs text-fg/65 tracking-widest uppercase mb-1.5">
                    Collateral Deposit
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-4xl text-accent leading-none">
                      100.00
                    </span>
                    <span className="font-mono text-sm text-fg/70">USDC</span>
                  </div>
                </div>

                {/* Mint arrow */}
                <div className="flex items-center gap-2 py-2.5 px-1">
                  <div className="flex-1 border-t border-dashed border-accent/20" />
                  <span className="font-mono text-xs text-fg/65 tracking-widest uppercase px-2">
                    MINT PAIR
                  </span>
                  <div className="flex-1 border-t border-dashed border-accent/20" />
                </div>

                {/* Token pair output */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="border-2 border-accent p-4 bg-accent/5">
                    <div className="font-mono text-xs text-fg/70 tracking-widest mb-1">
                      pLONG-SOL
                    </div>
                    <div className="font-display text-3xl text-accent leading-none mb-1">
                      84.72
                    </div>
                    <div className="font-mono text-xs text-fg/60 uppercase tracking-wide">
                      ↑ Price rises
                    </div>
                  </div>
                  <div className="border border-accent/40 p-4">
                    <div className="font-mono text-xs text-fg/70 tracking-widest mb-1">
                      pSHORT-SOL
                    </div>
                    <div className="font-display text-3xl text-accent leading-none mb-1">
                      15.28
                    </div>
                    <div className="font-mono text-xs text-fg/60 uppercase tracking-wide">
                      ↓ Price falls
                    </div>
                  </div>
                </div>

                {/* Invariant */}
                <div className="border-t border-accent/20 pt-4">
                  <p className="font-mono text-xs text-fg/70 text-center tracking-wide">
                    pLONG + pSHORT{' '}
                    <span className="text-accent font-medium">≡ 100 USDC</span>
                    {' '}(always)
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

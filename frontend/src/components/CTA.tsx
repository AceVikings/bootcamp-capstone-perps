import { ArrowRight } from 'lucide-react';

export function CTA() {
  return (
    <section
      className="bg-accent relative overflow-hidden py-24 md:py-32 lg:py-40"
      aria-label="Call to action"
    >
      {/* Radial gradient texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: 'radial-gradient(circle at top center, rgba(255,255,255,0.08), transparent 60%)',
        }}
      />
      {/* Diagonal lines texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(0,0,0,0.04) 40px, rgba(0,0,0,0.04) 42px)',
        }}
      />

      <div className="max-w-7xl mx-auto px-6 lg:px-12 relative z-10">
        <div className="max-w-5xl">
          {/* Pre-label */}
          <div className="flex items-center gap-3 mb-8 md:mb-12">
            <div className="h-px w-8 bg-void/40" />
            <span className="font-mono text-xs tracking-[0.25em] uppercase text-void/60">
              Raven Protocol
            </span>
          </div>

          {/* Headline */}
          <h2 className="font-display leading-none tracking-tighter text-void mb-0">
            <span className="block text-[clamp(3.5rem,9vw,8rem)]">TRADE</span>
            <span className="block text-[clamp(2.5rem,7vw,6.5rem)] italic">RISK.</span>
          </h2>

          {/* Decorative rule */}
          <div className="flex items-center gap-3 my-8 md:my-10">
            <div className="h-[3px] w-full max-w-[180px] bg-void" />
            <div className="w-4 h-4 border-2 border-void shrink-0" />
          </div>

          {/* Body */}
          <p className="font-display text-lg md:text-xl text-void/75 leading-relaxed max-w-2xl mb-10 md:mb-12">
            Your position has always been a ledger entry in someone else’s
            database. Raven Protocol makes it a real risk claim — recursively
            decomposable, fully collateralized, and entirely yours.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center gap-4">
            <button className="flex items-center gap-2 px-8 py-4 bg-void text-accent font-mono text-sm tracking-widest uppercase hover:bg-void/90 transition-colors duration-100 focus-visible:outline focus-visible:outline-3 focus-visible:outline-void focus-visible:outline-offset-3">
              LAUNCH APP
              <ArrowRight size={16} strokeWidth={2} />
            </button>
            <button className="px-8 py-4 border-2 border-void text-void font-mono text-sm tracking-widest uppercase hover:bg-void hover:text-accent transition-colors duration-100 focus-visible:outline focus-visible:outline-3 focus-visible:outline-void focus-visible:outline-offset-3">
              READ PROTOCOL
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

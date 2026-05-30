const STATS = [
  {
    value: '$10',
    label: 'Tick Size',
    sub: 'Minimum strike increment per split',
  },
  {
    value: '8',
    label: 'Max Split Depth',
    sub: 'Recursive option decomposition levels',
  },
  {
    value: '100%',
    label: 'Collateral Coverage',
    sub: 'Every token traces to vault SOL or USDC',
  },
  {
    value: '0',
    label: 'Liquidations',
    sub: 'Payouts bounded below at zero',
  },
];

export function Stats() {
  return (
    <section
      className="bg-accent relative overflow-hidden"
      aria-label="Protocol statistics"
    >
      {/* Inverted section texture: white vertical lines on cyan bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(0,0,0,0.04) 1px, rgba(0,0,0,0.04) 2px)',
          backgroundSize: '4px 100%',
        }}
      />

      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 md:py-20 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 divide-x-0 lg:divide-x divide-void/20">
          {STATS.map((stat, i) => (
            <div
              key={i}
              className={`
                flex flex-col justify-center py-8 px-6
                ${i < 2 ? 'border-b border-void/20 lg:border-b-0' : ''}
                ${i % 2 !== 0 ? 'border-l border-void/20 lg:border-l-0' : ''}
                ${i > 0 ? 'lg:pl-8' : ''}
                ${i < STATS.length - 1 ? 'lg:pr-8 lg:border-r lg:border-void/20' : ''}
              `}
            >
              <span className="font-display text-[clamp(3rem,6vw,5rem)] leading-none tracking-tighter text-void mb-2">
                {stat.value}
              </span>
              <span className="font-mono text-xs tracking-widest uppercase text-void/70 mb-1">
                {stat.label}
              </span>
              <span className="font-mono text-xs text-void/50 tracking-wide">
                {stat.sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

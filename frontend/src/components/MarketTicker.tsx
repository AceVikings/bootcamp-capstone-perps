const MARKETS = [
  { pair: 'SOL/USDC', price: '$182.47', change: '+2.34%', bull: true },
  { pair: 'BTC/USDC', price: '$68,420', change: '+1.12%', bull: true },
  { pair: 'ETH/USDC', price: '$3,847', change: '-0.55%', bull: false },
  { pair: 'BONK/USDC', price: '$0.0000284', change: '+8.21%', bull: true },
  { pair: 'JUP/USDC', price: '$1.24', change: '+3.07%', bull: true },
  { pair: 'WIF/USDC', price: '$2.91', change: '-1.88%', bull: false },
  { pair: 'PYTH/USDC', price: '$0.583', change: '+0.44%', bull: true },
  { pair: 'RAY/USDC', price: '$4.17', change: '+5.60%', bull: true },
];

// Duplicate for seamless loop
const TICKER_ITEMS = [...MARKETS, ...MARKETS];

export function MarketTicker() {
  return (
    <div className="relative w-full overflow-hidden bg-surface border-b border-accent/20 py-2.5">
      {/* Left fade */}
      <div
        className="absolute left-0 top-0 h-full w-16 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to right, #080710, transparent)' }}
        aria-hidden="true"
      />
      {/* Right fade */}
      <div
        className="absolute right-0 top-0 h-full w-16 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to left, #080710, transparent)' }}
        aria-hidden="true"
      />

      <div
        className="flex gap-0 animate-marquee w-max"
        aria-label="Live market prices"
      >
        {TICKER_ITEMS.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-6 border-r border-accent/10"
          >
            <span className="font-mono text-xs tracking-widest uppercase text-fg/35">
              {item.pair}
            </span>
            <span className="font-mono text-xs text-fg font-medium">
              {item.price}
            </span>
            <span
              className={`font-mono text-xs ${item.bull ? 'text-bull' : 'text-bear'}`}
            >
              {item.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

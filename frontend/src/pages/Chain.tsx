import { OptionsChain } from '../components/OptionsChain';

interface Props {
  onNavigate: (hash: string) => void;
}

export function Chain({ onNavigate }: Props) {
  return (
    <div className="min-h-screen bg-void pt-20 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* ── Page header ── */}
        <div className="mb-8 border-b border-wire pb-6">
          <p className="font-mono text-xs text-accent tracking-widest uppercase mb-2">
            Options Chain
          </p>
          <h1 className="font-display text-3xl sm:text-4xl text-fg font-semibold mb-2">
            SOL / USD Options
          </h1>
          <p className="text-fg-muted text-sm max-w-xl">
            Full strike grid from $120 to $240. Select an expiry tab to filter by maturity.
            Click any premium to open the order book for that option token.
          </p>
        </div>

        {/* ── Quick nav ── */}
        <div className="flex gap-3 mb-8 text-xs font-mono">
          <button
            onClick={() => onNavigate('#/app')}
            className="text-fg-muted hover:text-fg transition-colors"
          >
            ← Dashboard
          </button>
          <span className="text-wire">·</span>
          <button
            onClick={() => onNavigate('#/app/deposit')}
            className="text-accent hover:text-accent/80 transition-colors"
          >
            + Deposit collateral
          </button>
        </div>

        {/* ── Options chain table ── */}
        <div className="bg-surface border border-wire p-6 sm:p-8">
          <OptionsChain onNavigate={onNavigate} />
        </div>

        {/* ── Info cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          {[
            {
              label: 'Strike grid',
              value: '$120 — $240',
              sub: '$10 increments · 13 strikes',
            },
            {
              label: 'Expiry tiers',
              value: '2 / 4 / 6 / 8 / 10 days',
              sub: 'Rolling calendar from today',
            },
            {
              label: 'Premium model',
              value: 'Black-Scholes',
              sub: 'σ = 85% annual (SOL IV) · r = 0',
            },
          ].map(({ label, value, sub }) => (
            <div key={label} className="border border-wire p-4">
              <p className="font-mono text-[10px] text-fg-muted tracking-widest uppercase mb-1">
                {label}
              </p>
              <p className="font-mono text-sm text-fg font-semibold mb-0.5">{value}</p>
              <p className="font-mono text-[10px] text-fg-muted">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

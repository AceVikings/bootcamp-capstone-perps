import { useState } from 'react';

const STRIKE = 180;       // $180 strike
const SOL_BACKING = 10;   // 10 wSOL for LONG vault
const USDC_BACKING = 1800; // K * backing_sol = 180 * 10 USDC for SHORT vault

const SETTLEMENT_PRICES = [120, 150, 170, 180, 190, 210, 240];

function calcLong(price: number) {
  const call = Math.max(price - STRIKE, 0) * SOL_BACKING / price;
  const floor = Math.min(price, STRIKE) * SOL_BACKING / price;
  return { call: Math.round(call * 1000) / 1000, floor: Math.round(floor * 1000) / 1000 };
}

function calcShort(price: number) {
  const put = Math.max(STRIKE - price, 0) * USDC_BACKING / STRIKE;
  const cap = Math.min(price, STRIKE) * USDC_BACKING / STRIKE;
  return { put: Math.round(put * 100) / 100, cap: Math.round(cap * 100) / 100 };
}

export function TokenMechanics() {
  const [vaultType, setVaultType] = useState<'long' | 'short'>('long');
  const [priceIdx, setPriceIdx] = useState(3); // default to strike price
  const price = SETTLEMENT_PRICES[priceIdx];

  const longVals = calcLong(price);
  const shortVals = calcShort(price);

  const isLong = vaultType === 'long';
  const topVal  = isLong ? longVals.call  : shortVals.put;
  const botVal  = isLong ? longVals.floor : shortVals.cap;
  const backing = isLong ? SOL_BACKING : USDC_BACKING;
  const topLabel = isLong ? 'CALL' : 'PUT';
  const botLabel = isLong ? 'FLOOR' : 'CAP';
  const unit     = isLong ? 'wSOL' : 'USDC';
  const topColor = isLong ? 'bg-bull' : 'bg-bear';
  const topTextColor = isLong ? 'text-bull' : 'text-bear';
  const topPct   = (topVal / backing) * 100;
  const botPct   = (botVal / backing) * 100;

  const topFormula = isLong
    ? `max(P\u2212K, 0) · backing / P`
    : `max(K\u2212P, 0) · backing / K`;
  const botFormula = isLong
    ? `min(P, K) · backing / P`
    : `min(P, K) · backing / K`;

  return (
    <section
      id="mechanics"
      className="bg-void py-24 md:py-32 lg:py-40 relative"
      aria-label="Option payout mechanics"
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
                Payout Mechanics
              </span>
            </div>
            <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-none tracking-tighter text-fg">
              Payouts Are Bounded.
              <br />
              <span className="italic text-fg/85">Never Negative.</span>
            </h2>
          </div>
          <p className="font-display text-lg text-fg-muted leading-relaxed lg:pb-2">
            Select a vault type and settlement price to see how payout distributes
            between the two option tokens. Their sum always equals the vault backing.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-0 border border-accent/20">

          {/* ── Left: interactive simulator ── */}
          <div
            className="p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-accent/20"
            style={{ backgroundColor: '#050410' }}
          >
            {/* Vault type tabs */}
            <div className="grid grid-cols-2 gap-2 mb-8">
              {(['long', 'short'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVaultType(v)}
                  className={`py-2.5 font-mono text-xs tracking-widest uppercase transition-colors duration-100 border
                    ${vaultType === v
                      ? 'bg-accent text-void border-accent'
                      : 'border-fg/30 text-fg/65 hover:border-fg/60 hover:text-fg'
                    }`}
                >
                  {v === 'long' ? 'LONG Vault (wSOL)' : 'SHORT Vault (USDC)'}
                </button>
              ))}
            </div>

            {/* Strike indicator */}
            <div className="font-mono text-xs text-fg/65 tracking-widest uppercase mb-3">
              Strike K = ${STRIKE} · Settlement Price P_T
            </div>

            {/* Price selector */}
            <div className="grid grid-cols-4 gap-1.5 mb-8">
              {SETTLEMENT_PRICES.map((p, i) => (
                <button
                  key={p}
                  onClick={() => setPriceIdx(i)}
                  className={`py-2 font-mono text-xs tracking-widest transition-colors duration-100 border
                    ${i === priceIdx
                      ? 'bg-accent text-void border-accent'
                      : p < STRIKE
                        ? 'border-bear/40 text-bear/70 hover:border-bear hover:text-bear'
                        : p > STRIKE
                          ? 'border-bull/40 text-bull/70 hover:border-bull hover:text-bull'
                          : 'border-fg/40 text-fg/65 hover:border-fg/60'
                    }`}
                >
                  ${p}
                </button>
              ))}
            </div>

            {/* Payout bars */}
            <div className="space-y-4 mb-8">
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className={`font-mono text-xs tracking-widest uppercase ${topTextColor}`}>
                    {topLabel}
                  </span>
                  <span className={`font-mono text-sm font-medium ${topTextColor}`}>
                    {topVal.toFixed(3)} {unit}
                  </span>
                </div>
                <div className="h-2.5 bg-surface border border-fg/15">
                  <div
                    className={`h-full ${topColor} transition-all duration-300`}
                    style={{ width: `${topPct}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="font-mono text-xs text-accent tracking-widest uppercase">
                    {botLabel}
                  </span>
                  <span className="font-mono text-sm text-accent font-medium">
                    {botVal.toFixed(3)} {unit}
                  </span>
                </div>
                <div className="h-2.5 bg-surface border border-fg/15">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${botPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Invariant box */}
            <div className="border border-accent/30 p-4 text-center">
              <div className="font-mono text-xs text-fg/65 tracking-widest uppercase mb-2">
                {topLabel} + {botLabel}
              </div>
              <div className="font-display text-3xl text-accent">
                {(topVal + botVal).toFixed(3)}{` `}
                <span className="text-fg/65 text-lg">{unit}</span>
              </div>
              <div className="font-mono text-xs text-fg/65 tracking-wide mt-1">
                ≡ Vault Backing (always)
              </div>
            </div>
          </div>

          {/* ── Right: formula explainer ── */}
          <div className="p-8 lg:p-10 flex flex-col justify-between">
            <div>
              <div className="font-mono text-xs text-fg/65 tracking-widest uppercase mb-4">
                Payout Formulas (K = ${STRIKE})
              </div>
              <div className="border-l-4 border-accent pl-6 mb-8">
                <div className="font-display text-2xl md:text-3xl text-fg leading-tight italic mb-2">
                  "Every payout is bounded below at zero and above at backing."
                </div>
              </div>

              <div className="space-y-5">
                <div className="border border-fg/10 p-4">
                  <div className={`font-mono text-xs tracking-widest uppercase mb-1 ${topTextColor}`}>
                    {topLabel}
                  </div>
                  <div className="font-mono text-sm text-fg/85">{topFormula}</div>
                  <div className="font-mono text-xs text-fg/50 mt-1">
                    {isLong
                      ? 'Gains above strike. Zero below strike.'
                      : 'Gains below strike. Zero above strike.'}
                  </div>
                </div>

                <div className="border border-fg/10 p-4">
                  <div className="font-mono text-xs text-accent tracking-widest uppercase mb-1">
                    {botLabel}
                  </div>
                  <div className="font-mono text-sm text-fg/85">{botFormula}</div>
                  <div className="font-mono text-xs text-fg/50 mt-1">
                    {isLong
                      ? 'Always positive. Capped at K/P.'
                      : 'Tracks price up to strike. Capped at 100% of backing.'}
                  </div>
                </div>

                <div className="border border-accent/30 p-4">
                  <div className="font-mono text-xs text-fg/65 tracking-widest uppercase mb-1">
                    Invariant
                  </div>
                  <div className="font-mono text-sm text-accent">
                    {topLabel} + {botLabel} ≡ {backing} {unit}
                  </div>
                  <div className="font-mono text-xs text-fg/50 mt-1">
                    Enforced on-chain at every state transition.
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-accent/20 pt-6 mt-8 flex items-center gap-3">
              <div
                className={`w-2.5 h-2.5 transition-colors duration-300 ${
                  price === STRIKE ? 'bg-accent' : price > STRIKE ? 'bg-bull' : 'bg-bear'
                }`}
              />
              <span className="font-mono text-xs text-fg-muted tracking-wide">
                {price === STRIKE
                  ? `P_T = K = $${price} — CALL is zero, FLOOR is max`
                  : price > STRIKE
                  ? `P_T = $${price} > K — ${isLong ? 'CALL in the money' : 'PUT is zero'}`
                  : `P_T = $${price} < K — ${isLong ? 'CALL is zero' : 'PUT in the money'}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

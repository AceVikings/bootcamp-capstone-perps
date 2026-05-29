import { useEffect, useState } from 'react';
import { fmtCountdown, fmtUsdc } from '../../lib/format';
import type { Epoch } from '../../lib/api';

interface Props {
  epochs: Epoch[];
  onTrade: (market: string) => void;
}

export function EpochTable({ epochs, onTrade }: Props) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (epochs.length === 0) {
    return (
      <div className="py-12 text-center font-mono text-xs text-fg-muted tracking-widest uppercase">
        No active epochs
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Active epochs">
        <thead>
          <tr className="border-b border-wire">
            <th className="text-left font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted py-3 pr-4">Asset</th>
            <th className="text-left font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted py-3 pr-4">Epoch ID</th>
            <th className="text-right font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted py-3 pr-4">Ref Price</th>
            <th className="text-right font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted py-3 pr-4">Time Left</th>
            <th className="text-right font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted py-3 pr-4">TVL</th>
            <th className="py-3"></th>
          </tr>
        </thead>
        <tbody>
          {epochs.map(epoch => (
            <tr key={epoch.pda} className="border-b border-wire/50 hover:bg-surface-2/40 transition-colors">
              <td className="font-mono text-xs text-fg py-3 pr-4">
                {epoch.asset_key.slice(0, 6)}…
              </td>
              <td className="font-mono text-xs text-fg-muted py-3 pr-4">#{epoch.epoch_id}</td>
              <td className="font-mono text-xs text-fg text-right py-3 pr-4">
                ${fmtUsdc(epoch.ref_price)}
              </td>
              <td className="font-mono text-xs text-accent text-right py-3 pr-4">
                {epoch.settled ? (
                  <span className="text-fg-muted">Settled</span>
                ) : (
                  fmtCountdown(epoch.end_ts)
                )}
              </td>
              <td className="font-mono text-xs text-fg text-right py-3 pr-4">
                ${fmtUsdc(epoch.tvl, 0)}
              </td>
              <td className="py-3 pl-4">
                <button
                  onClick={() => onTrade(epoch.long_mint)}
                  disabled={epoch.settled}
                  className="font-mono text-[10px] tracking-widest uppercase px-3 py-1.5 border border-accent text-accent hover:bg-accent hover:text-void transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={`Trade epoch ${epoch.epoch_id}`}
                >
                  Trade →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { VaultSide } from '../../lib/types';

interface Props {
  value: VaultSide;
  onChange: (side: VaultSide) => void;
}

export function VaultSideToggle({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-px bg-wire" role="group" aria-label="Vault side">
      <button
        type="button"
        onClick={() => onChange('LONG')}
        aria-pressed={value === 'LONG'}
        className={[
          'flex flex-col gap-1 p-5 transition-colors text-left',
          value === 'LONG'
            ? 'bg-bull/10 border border-bull text-bull'
            : 'bg-surface border border-transparent text-fg-muted hover:bg-surface-2',
        ].join(' ')}
      >
        <span className="font-mono text-xs tracking-[0.15em] uppercase font-semibold">
          LONG — Deposit SOL
        </span>
        <span className="font-mono text-[10px] text-fg-muted mt-1">
          Bullish on SOL
        </span>
        <span className="font-mono text-[10px] text-fg-muted">
          Always overcollateralized
        </span>
      </button>

      <button
        type="button"
        onClick={() => onChange('SHORT')}
        aria-pressed={value === 'SHORT'}
        className={[
          'flex flex-col gap-1 p-5 transition-colors text-left',
          value === 'SHORT'
            ? 'bg-bear/10 border border-bear text-bear'
            : 'bg-surface border border-transparent text-fg-muted hover:bg-surface-2',
        ].join(' ')}
      >
        <span className="font-mono text-xs tracking-[0.15em] uppercase font-semibold">
          SHORT — Deposit USDC
        </span>
        <span className="font-mono text-[10px] text-fg-muted mt-1">
          Bearish on SOL
        </span>
        <span className="font-mono text-[10px] text-fg-muted">
          Always overcollateralized
        </span>
      </button>
    </div>
  );
}

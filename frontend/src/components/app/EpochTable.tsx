import { fmtUsdc } from '../../lib/format';
import type { RootVault } from '../../lib/api';

interface Props {
  vaults: RootVault[];
  onTrade: (market: string) => void;
}

export function VaultTable({ vaults, onTrade }: Props) {
  if (vaults.length === 0) {
    return (
      <div className="py-12 text-center font-mono text-xs text-fg-muted tracking-widest uppercase">
        No active vaults
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Active vaults">
        <thead>
          <tr className="border-b border-wire">
            <th className="text-left font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted py-3 pr-4">Asset Feed</th>
            <th className="text-left font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted py-3 pr-4">Vault ID</th>
            <th className="text-right font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted py-3 pr-4">Ref Price</th>
            <th className="text-right font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted py-3 pr-4">Collateral</th>
            <th className="text-right font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted py-3 pr-4">Status</th>
            <th className="py-3"></th>
          </tr>
        </thead>
        <tbody>
          {vaults.map(vault => (
            <tr key={vault.pubkey} className="border-b border-wire/50 hover:bg-surface-2/40 transition-colors">
              <td className="font-mono text-xs text-fg py-3 pr-4">
                {vault.asset_feed.slice(0, 8)}…
              </td>
              <td className="font-mono text-xs text-fg-muted py-3 pr-4">#{vault.vault_id}</td>
              <td className="font-mono text-xs text-fg text-right py-3 pr-4">
                ${fmtUsdc(vault.reference_price / 1e6, 4)}
              </td>
              <td className="font-mono text-xs text-fg text-right py-3 pr-4">
                ${fmtUsdc(vault.collateral_amount / 1e6, 0)}
              </td>
              <td className="text-right py-3 pr-4">
                <span className={`font-mono text-[9px] tracking-widest uppercase ${vault.is_active ? 'text-bull' : 'text-fg-muted'}`}>
                  {vault.is_active ? 'Active' : 'Closed'}
                </span>
              </td>
              <td className="py-3 pl-4">
                <div className="flex gap-1.5 justify-end">
                  <button
                    onClick={() => onTrade(vault.long_mint)}
                    disabled={!vault.is_active}
                    className="font-mono text-[9px] tracking-widest uppercase px-2 py-1.5 border border-bull/50 text-bull hover:bg-bull hover:text-void transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={`Trade LONG vault ${vault.vault_id}`}
                  >
                    LONG
                  </button>
                  <button
                    onClick={() => onTrade(vault.short_mint)}
                    disabled={!vault.is_active}
                    className="font-mono text-[9px] tracking-widest uppercase px-2 py-1.5 border border-bear/50 text-bear hover:bg-bear hover:text-void transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={`Trade SHORT vault ${vault.vault_id}`}
                  >
                    SHORT
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


import { truncAddr } from '../../lib/format';

interface Props {
  tokenType: string;
  depth: number;
  onNavigate: (segment: string) => void;
}

/**
 * Renders a breadcrumb-style tree path navigator.
 * e.g. for "long_long" it shows: [ROOT] → [LONG] → [LONG_LONG ●]
 */
export function DepthNavigator({ tokenType, depth, onNavigate }: Props) {
  const parts = tokenType.split('_');

  const crumbs: { label: string; key: string; active: boolean }[] = [
    { label: 'ROOT', key: 'root', active: depth === 0 },
  ];

  let accumulated = '';
  for (let i = 0; i < parts.length; i++) {
    accumulated = accumulated ? `${accumulated}_${parts[i]}` : parts[i];
    crumbs.push({
      label: accumulated.toUpperCase(),
      key: accumulated,
      active: i === parts.length - 1,
    });
  }

  return (
    <nav aria-label="Token depth navigator" className="flex items-center gap-1 font-mono text-[10px] tracking-widest flex-wrap">
      {crumbs.map((crumb, i) => (
        <span key={crumb.key} className="flex items-center gap-1">
          {i > 0 && <span className="text-wire">→</span>}
          <button
            onClick={() => !crumb.active && onNavigate(crumb.key)}
            disabled={crumb.active}
            className={`uppercase px-1.5 py-0.5 transition-colors ${
              crumb.active
                ? 'text-accent border border-accent/50 cursor-default'
                : 'text-fg-muted border border-wire hover:text-fg hover:border-fg-muted'
            }`}
            aria-current={crumb.active ? 'page' : undefined}
          >
            {crumb.label}
            {crumb.active && ' ●'}
          </button>
        </span>
      ))}
    </nav>
  );
}

export function truncAddrDisplay(addr: string) {
  return truncAddr(addr, 6);
}

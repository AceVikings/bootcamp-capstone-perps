import { tokenTypeLabel, tokenTypeSide } from '../../lib/format';

interface Props {
  type: string;
  size?: 'sm' | 'md';
}

export function TokenTypeBadge({ type, size = 'md' }: Props) {
  const side = tokenTypeSide(type);
  const label = tokenTypeLabel(type);

  const color =
    side === 'bull'
      ? 'border-bull/50 text-bull bg-bull/10'
      : side === 'bear'
      ? 'border-bear/50 text-bear bg-bear/10'
      : 'border-accent/50 text-accent bg-accent/10';

  const sz = size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-1';

  return (
    <span
      className={`font-mono tracking-[0.15em] uppercase border inline-block ${color} ${sz}`}
      aria-label={label}
    >
      {label}
    </span>
  );
}

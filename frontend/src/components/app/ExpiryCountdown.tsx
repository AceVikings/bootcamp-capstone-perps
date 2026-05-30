import { useEffect, useState } from 'react';

interface Props {
  expiry: string; // ISO timestamp
}

function calcCountdown(expiry: string): string {
  const ms = new Date(expiry).getTime() - Date.now();
  if (ms <= 0) return 'EXPIRED';
  const totalSecs = Math.floor(ms / 1000);
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

export function ExpiryCountdown({ expiry }: Props) {
  const [label, setLabel] = useState(() => calcCountdown(expiry));

  useEffect(() => {
    const tick = () => setLabel(calcCountdown(expiry));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [expiry]);

  const isExpired = label === 'EXPIRED';

  return (
    <span
      className={`font-mono text-xs ${isExpired ? 'text-bear' : 'text-fg-muted'}`}
      aria-label={isExpired ? 'Expired' : `Expires in ${label}`}
    >
      {label}
    </span>
  );
}

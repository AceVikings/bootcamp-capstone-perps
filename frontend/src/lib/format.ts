// ─── Number formatting ────────────────────────────────────────────────────────

export function fmtUsdc(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtTokens(value: number, decimals = 4): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function fmtPnl(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${fmtUsdc(Math.abs(value))}`;
}

// ─── Address formatting ───────────────────────────────────────────────────────

export function truncAddr(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

// ─── Time formatting ──────────────────────────────────────────────────────────

export function fmtCountdown(endsAt: number): string {
  const remaining = Math.max(0, endsAt - Date.now() / 1000);
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = Math.floor(remaining % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

export function fmtAge(ts: number): string {
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function fmtIsoTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// ─── Token type helpers ───────────────────────────────────────────────────────

export function tokenTypeLabel(type: string): string {
  return type.toUpperCase();
}

export function tokenTypeSide(type: string): 'bull' | 'bear' | 'neutral' {
  const t = type.toLowerCase();
  if (t === 'call' || t === 'cap') return 'bull';
  if (t === 'put') return 'bear';
  if (t === 'floor') return 'neutral';
  if (t.startsWith('long')) return 'bull';
  if (t.startsWith('short')) return 'bear';
  return 'neutral';
}

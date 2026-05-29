import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  walletConnected: boolean;
}

export function WalletGate({ children, walletConnected }: Props) {
  if (walletConnected) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="w-16 h-16 border border-accent/30 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="4" y="14" width="24" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" className="text-accent" />
          <path d="M10 14V10a6 6 0 0112 0v4" stroke="currentColor" strokeWidth="1.5" className="text-accent/60" />
          <circle cx="16" cy="22" r="2" fill="currentColor" className="text-accent" />
        </svg>
      </div>
      <div className="text-center">
        <p className="font-display text-lg text-fg mb-1">Wallet required</p>
        <p className="font-mono text-xs text-fg-muted tracking-wide">
          Connect your wallet to access the trading app
        </p>
      </div>
    </div>
  );
}

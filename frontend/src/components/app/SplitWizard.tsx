import { useState } from 'react';
import { fmtUsdc } from '../../lib/format';
import type { ClaimNode } from '../../lib/api';

interface Props {
  node: ClaimNode;
  oraclePrice: number | null;
  onSplit: (price: number) => Promise<{ signature: string }>;
  onDone?: () => void;
}

type Step = 'review' | 'confirm' | 'result';

interface SplitResult {
  ok: boolean;
  signature?: string;
  error?: string;
}

export function SplitWizard({ node, oraclePrice, onSplit, onDone }: Props) {
  const [step, setStep] = useState<Step>('review');
  const [result, setResult] = useState<SplitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const splitPrice = oraclePrice ?? node.split_price ?? 0;
  const longLongEst = node.balance * 0.5;
  const longShortEst = node.balance * 0.5;
  const feeBps = 15;
  const feeUsdc = (node.est_value_usdc * feeBps) / 10000;

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const res = await onSplit(splitPrice);
      setResult({ ok: true, signature: res.signature });
      setStep('result');
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'Transaction failed' });
      setStep('result');
    } finally {
      setSubmitting(false);
    }
  }

  const tokenPath = node.token_type.toUpperCase().replace(/_/g, '_');

  return (
    <div className="max-w-lg mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 font-mono text-[10px] tracking-widest uppercase">
        {(['review', 'confirm', 'result'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`w-5 h-5 flex items-center justify-center border text-[9px] ${step === s ? 'border-accent text-accent' : 'border-wire text-fg-muted'}`}>
              {i + 1}
            </span>
            <span className={step === s ? 'text-accent' : 'text-fg-muted'}>{s}</span>
            {i < 2 && <span className="text-wire">—</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Review */}
      {step === 'review' && (
        <div className="space-y-6">
          <div className="bg-surface border border-wire p-5 space-y-3">
            <div className="font-mono text-[10px] tracking-widest uppercase text-fg-muted mb-4">Token being split</div>
            <Row label="Token type" value={tokenPath} />
            <Row label="Current balance" value={node.balance.toLocaleString()} />
            <Row label="Est. value" value={`$${fmtUsdc(node.est_value_usdc)}`} />
            {oraclePrice != null && (
              <Row label="Oracle price" value={`$${fmtUsdc(oraclePrice, 4)}`} note="Pyth" />
            )}
          </div>

          <div className="bg-surface border border-wire p-5 space-y-3">
            <div className="font-mono text-[10px] tracking-widest uppercase text-fg-muted mb-4">Estimated output</div>
            <Row label={`${tokenPath}_LONG`} value={`~${fmtUsdc(longLongEst, 2)} tokens`} color="bull" />
            <Row label={`${tokenPath}_SHORT`} value={`~${fmtUsdc(longShortEst, 2)} tokens`} color="bear" />
          </div>

          <div className="bg-bear/5 border border-bear/30 p-4 font-mono text-xs text-fg-muted">
            <span className="text-bear">Fee: </span>Recursive split fee: {feeBps} bps (~${fmtUsdc(feeUsdc)} USDC)
          </div>

          <div className="bg-surface border border-wire/50 p-3 font-mono text-[10px] text-fg-muted">
            ⚠ After splitting, individual legs may have lower liquidity
          </div>

          <button
            onClick={() => setStep('confirm')}
            className="w-full py-3 border border-accent text-accent font-mono text-xs tracking-widest uppercase hover:bg-accent hover:text-void transition-colors"
          >
            Continue →
          </button>
        </div>
      )}

      {/* Step 2: Confirm */}
      {step === 'confirm' && (
        <div className="space-y-6">
          <div className="bg-surface border border-wire p-5 space-y-3">
            <div className="font-mono text-[10px] tracking-widest uppercase text-fg-muted mb-4">Confirm split</div>
            <Row label="Splitting" value={tokenPath} />
            <Row label="Split price" value={`$${fmtUsdc(splitPrice, 4)}`} />
            <Row label="Output LONG leg" value={`~${fmtUsdc(longLongEst, 2)} tokens`} color="bull" />
            <Row label="Output SHORT leg" value={`~${fmtUsdc(longShortEst, 2)} tokens`} color="bear" />
            <Row label="Fee" value={`$${fmtUsdc(feeUsdc)}`} />
          </div>

          <p className="font-mono text-xs text-fg-muted text-center">
            Your wallet will prompt for approval
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('review')}
              disabled={submitting}
              className="flex-1 py-3 border border-wire text-fg-muted font-mono text-xs tracking-widest uppercase hover:text-fg transition-colors disabled:opacity-40"
            >
              ← Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="flex-1 py-3 border border-accent text-accent font-mono text-xs tracking-widest uppercase hover:bg-accent hover:text-void transition-colors disabled:opacity-40"
            >
              {submitting ? 'Waiting…' : 'Confirm & Split'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {step === 'result' && result && (
        <div className="space-y-6 text-center">
          {result.ok ? (
            <>
              <div className="text-bull font-mono text-4xl">✓</div>
              <p className="font-display text-lg text-fg">Split successful</p>
              {result.signature && (
                <p className="font-mono text-xs text-fg-muted break-all">
                  Tx:{' '}
                  <a
                    href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline"
                  >
                    {result.signature.slice(0, 16)}…
                  </a>
                </p>
              )}
              <div className="flex gap-3 justify-center pt-4">
                <a
                  href={`#/app/trade/${node.mint}_LONG`}
                  className="px-4 py-2 border border-bull text-bull font-mono text-xs tracking-widest uppercase hover:bg-bull hover:text-void transition-colors"
                >
                  Trade {tokenPath}_LONG
                </a>
                <a
                  href={`#/app/trade/${node.mint}_SHORT`}
                  className="px-4 py-2 border border-bear text-bear font-mono text-xs tracking-widest uppercase hover:bg-bear hover:text-void transition-colors"
                >
                  Trade {tokenPath}_SHORT
                </a>
              </div>
            </>
          ) : (
            <>
              <div className="text-bear font-mono text-4xl">✕</div>
              <p className="font-display text-lg text-fg">Split failed</p>
              <p className="font-mono text-xs text-fg-muted">{result.error}</p>
              <div className="flex gap-3 justify-center pt-4">
                <button
                  onClick={() => { setResult(null); setStep('review'); }}
                  className="px-4 py-2 border border-accent text-accent font-mono text-xs tracking-widest uppercase hover:bg-accent hover:text-void transition-colors"
                >
                  Retry
                </button>
                {onDone && (
                  <button onClick={onDone} className="px-4 py-2 border border-wire text-fg-muted font-mono text-xs tracking-widest uppercase hover:text-fg transition-colors">
                    Cancel
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, note, color }: {
  label: string; value: string; note?: string; color?: 'bull' | 'bear';
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="font-mono text-[10px] tracking-widest uppercase text-fg-muted">{label}</span>
      <span className={`font-mono text-xs ${color === 'bull' ? 'text-bull' : color === 'bear' ? 'text-bear' : 'text-fg'}`}>
        {value}
        {note && <span className="text-fg-muted/60 ml-1">· {note}</span>}
      </span>
    </div>
  );
}

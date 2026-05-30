import type { VaultSide } from '../../lib/types';
import { calcIntrinsicValue } from '../../lib/options';
import type { NodeType } from '../../lib/options';
import { formatMicroUsdc } from '../../lib/types';

interface Props {
  nodeType: NodeType;
  strike: number;      // child_strike in micro-USDC
  backing: number;     // SOL lamports or micro-USDC
  oraclePrice: number; // micro-USDC
  vaultSide: VaultSide;
}

export function IntrinsicValue({ nodeType, strike, backing, oraclePrice, vaultSide }: Props) {
  const value = calcIntrinsicValue(nodeType, strike, backing, oraclePrice, vaultSide);
  const isItm = value > 0;

  return (
    <span
      className={`font-mono text-xs ${isItm ? 'text-bull' : 'text-bear'}`}
      title={`${isItm ? 'ITM' : 'OTM'} · ${formatMicroUsdc(value)}`}
    >
      {isItm ? 'ITM' : 'OTM'} {formatMicroUsdc(value)}
    </span>
  );
}

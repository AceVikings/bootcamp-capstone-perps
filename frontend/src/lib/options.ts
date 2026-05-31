// ─── Option Node Types ────────────────────────────────────────────────────────
//
// Re-exported from types.ts for backward compatibility.
// New code should import from types.ts directly.

export type { TokenType } from './types';
export { getTokenType, calcIntrinsicValue, calcSettlementPayout } from './types';

// Legacy alias
export type NodeType = import('./types').TokenType;

/**
 * @deprecated Use getTokenType from types.ts
 */
export function getNodeType(isLongSide: boolean, vaultSide: 'LONG' | 'SHORT'): NodeType {
  if (vaultSide === 'LONG') return isLongSide ? 'CALL' : 'FLOOR';
  return isLongSide ? 'CAP' : 'PUT';
}

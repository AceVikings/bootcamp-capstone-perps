// ─── Option Node Types ────────────────────────────────────────────────────────

export type NodeType = 'CALL' | 'FLOOR' | 'PUT' | 'CAP' | 'ROOT';

/**
 * Derive the semantic type of a child node from which side it is (long vs short)
 * and what side the vault is.
 */
export function getNodeType(isLongSide: boolean, vaultSide: 'LONG' | 'SHORT'): NodeType {
  if (vaultSide === 'LONG') return isLongSide ? 'CALL' : 'FLOOR';
  return isLongSide ? 'CAP' : 'PUT';
}

/**
 * Calculates the current intrinsic value of an option node.
 * All values in the same denomination (micro-USDC for USDC-settled, lamports for SOL-settled).
 */
export function calcIntrinsicValue(
  nodeType: NodeType,
  strike: number,   // child_strike in micro-USDC
  backing: number,  // SOL lamports or micro-USDC
  price: number,    // current oracle price in micro-USDC
  _vaultSide: 'LONG' | 'SHORT' = 'LONG',
): number {
  if (price <= 0 || backing <= 0) return 0;
  switch (nodeType) {
    case 'CALL':
      return Math.max(price - strike, 0) * backing / price;
    case 'FLOOR':
      return Math.min(price, strike) * backing / price;
    case 'PUT':
      return strike > 0 ? Math.max(strike - price, 0) * backing / strike : 0;
    case 'CAP':
      return strike > 0 ? Math.min(price, strike) * backing / strike : 0;
    case 'ROOT':
      return backing;
  }
}

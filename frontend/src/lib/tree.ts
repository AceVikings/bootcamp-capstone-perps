export interface ClaimNode {
  id: string;
  root_id: string;
  parent_id: string | null;
  claim_type: string;
}

/**
 * Walk the parent chain to produce a path label like "ROOT → LONG → LONG_LONG".
 */
export function buildPathLabel(node: ClaimNode, allNodes: ClaimNode[]): string {
  const parts: string[] = [node.claim_type];
  let current: ClaimNode = node;
  while (current.parent_id) {
    const parent = allNodes.find(n => n.id === current.parent_id);
    if (!parent) break;
    parts.unshift(parent.claim_type);
    current = parent;
  }
  return parts.join(' → ');
}

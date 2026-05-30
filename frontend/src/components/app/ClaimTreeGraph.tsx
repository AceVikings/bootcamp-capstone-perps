import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ClaimNode } from '../../lib/api';
import { tokenTypeSide, fmtUsdc, truncAddr } from '../../lib/format';
import { TokenTypeBadge } from './TokenTypeBadge';
import { useState } from 'react';

interface Props {
  nodes: ClaimNode[] | null;
  onNodeClick?: (node: ClaimNode) => void;
}

function nodeStyle(node: ClaimNode) {
  const side = tokenTypeSide(node.claim_type);
  const active = node.is_active;
  const borderColor =
    side === 'bull' ? '#4A9E64' : side === 'bear' ? '#A85858' : '#8A84BC';
  return {
    background: '#131228',
    border: `1px solid ${active ? borderColor : '#252340'}`,
    opacity: active ? 1 : 0.45,
    boxShadow: active ? `0 0 8px ${borderColor}40` : 'none',
    padding: '8px 12px',
    borderRadius: 0,
    minWidth: 120,
  };
}

export function ClaimTreeGraph({ nodes: claims, onNodeClick }: Props) {
  const [selected, setSelected] = useState<ClaimNode | null>(null);

  if (!claims || claims.length === 0) {
    return (
      <div className="py-12 text-center font-mono text-xs text-fg-muted">
        No claim nodes found
      </div>
    );
  }

  // Layout: group by depth, evenly spaced
  const byDepth: Record<number, ClaimNode[]> = {};
  for (const n of claims) {
    (byDepth[n.depth] ??= []).push(n);
  }

  const flowNodes: Node[] = claims.map(n => {
    const peers = byDepth[n.depth] ?? [];
    const col = peers.indexOf(n);
    const side = tokenTypeSide(n.claim_type);
    const color = side === 'bull' ? '#4A9E64' : side === 'bear' ? '#A85858' : '#8A84BC';
    return {
      id: n.pubkey,
      position: { x: col * 200, y: n.depth * 160 },
      data: {
        label: (
          <div style={{ fontFamily: 'monospace', fontSize: 10, lineHeight: 1.4 }}>
            <div style={{ color, fontWeight: 600, letterSpacing: '0.1em' }}>{n.claim_type}</div>
            <div style={{ color: '#6b6a9a' }}>D{n.depth} · ${fmtUsdc(n.creation_price / 1e6, 3)}</div>
            <div style={{ color: '#6b6a9a' }}>{truncAddr(n.source_mint)}</div>
          </div>
        ),
        claimNode: n,
      },
      style: nodeStyle(n),
    };
  });

  const flowEdges: Edge[] = claims
    .filter(n => n.parent_node != null)
    .map(n => ({
      id: `${n.parent_node}-${n.pubkey}`,
      source: n.parent_node!,
      target: n.pubkey,
      style: { stroke: '#252340', strokeWidth: 1 },
      animated: false,
    }));

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    const claimNode = (node.data as { claimNode: ClaimNode }).claimNode;
    setSelected(claimNode);
    onNodeClick?.(claimNode);
  }

  return (
    <div className="relative">
      <div className="h-[420px] border border-wire bg-[#050410]">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodeClick={handleNodeClick}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#252340" gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {selected && (
        <div className="mt-2 p-4 bg-surface border border-wire font-mono text-xs">
          <div className="flex items-center justify-between mb-3">
            <TokenTypeBadge type={selected.claim_type.toLowerCase()} />
            <button
              onClick={() => setSelected(null)}
              className="text-fg-muted hover:text-fg"
              aria-label="Close detail"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1 text-fg-muted">
            <div><span className="text-fg-muted/60">Source Mint:</span> <span className="text-fg">{truncAddr(selected.source_mint)}</span></div>
            <div><span className="text-fg-muted/60">Depth:</span> <span className="text-fg">{selected.depth}</span></div>
            <div><span className="text-fg-muted/60">Creation Price:</span> <span className="text-fg">${fmtUsdc(selected.creation_price / 1e6, 4)}</span></div>
            <div><span className="text-fg-muted/60">Status:</span> <span className={selected.is_active ? 'text-bull' : 'text-fg-muted'}>{selected.is_active ? 'Active' : 'Inactive'}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}


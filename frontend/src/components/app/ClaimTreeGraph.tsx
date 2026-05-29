import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ClaimTree, ClaimNode } from '../../lib/api';
import { tokenTypeSide, fmtUsdc } from '../../lib/format';
import { TokenTypeBadge } from './TokenTypeBadge';
import { useState } from 'react';

interface Props {
  tree: ClaimTree | null;
  onNodeClick?: (node: ClaimNode) => void;
}

function nodeStyle(node: ClaimNode) {
  const side = tokenTypeSide(node.token_type);
  const active = node.status === 'active';
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

export function ClaimTreeGraph({ tree, onNodeClick }: Props) {
  const [selected, setSelected] = useState<ClaimNode | null>(null);

  if (!tree || tree.nodes.length === 0) {
    return (
      <div className="py-12 text-center font-mono text-xs text-fg-muted">
        No claim nodes found
      </div>
    );
  }

  const nodes: Node[] = tree.nodes.map((n, i) => ({
    id: n.pubkey,
    position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 160 },
    data: { label: n },
    style: nodeStyle(n),
  }));

  const edges: Edge[] = tree.edges.map(e => ({
    id: `${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    style: { stroke: '#252340', strokeWidth: 1 },
    animated: false,
  }));

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    const claimNode = node.data.label as ClaimNode;
    setSelected(claimNode);
    onNodeClick?.(claimNode);
  }

  return (
    <div className="relative">
      <div className="h-[420px] border border-wire bg-[#050410]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
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
            <TokenTypeBadge type={selected.token_type} />
            <button
              onClick={() => setSelected(null)}
              className="text-fg-muted hover:text-fg"
              aria-label="Close detail"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1 text-fg-muted">
            <div><span className="text-fg-muted/60">Mint:</span> <span className="text-fg">{selected.mint}</span></div>
            <div><span className="text-fg-muted/60">Balance:</span> <span className="text-fg">{selected.balance.toLocaleString()}</span></div>
            <div><span className="text-fg-muted/60">Est. Value:</span> <span className="text-fg">${fmtUsdc(selected.est_value_usdc)}</span></div>
            {selected.split_price != null && (
              <div><span className="text-fg-muted/60">Split Price:</span> <span className="text-fg">${fmtUsdc(selected.split_price)}</span></div>
            )}
            <div><span className="text-fg-muted/60">Status:</span> <span className={selected.status === 'active' ? 'text-bull' : 'text-fg-muted'}>{selected.status}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

import type { OptionVault, OptionNode } from '../../lib/types';
import { formatStrike, formatMicroUsdc } from '../../lib/types';
import { getNodeType, calcIntrinsicValue } from '../../lib/options';
import type { NodeType } from '../../lib/options';
import { truncAddr } from '../../lib/format';

interface Props {
  vault: OptionVault;
  nodes: OptionNode[];
  oraclePrice: number;
  onNodeClick: (node: OptionNode | null) => void;
}

function nodeColor(type: NodeType, active: boolean): string {
  if (!active) return '#3a3860';
  switch (type) {
    case 'CALL': return '#4A9E64';
    case 'FLOOR': return '#8A84BC';
    case 'PUT': return '#A85858';
    case 'CAP': return '#8A84BC';
    case 'ROOT': return '#AAA5CE';
  }
}

interface TreeNode {
  node: OptionNode | null; // null = synthetic ROOT
  children: TreeNode[];
}

function buildTree(_vault: OptionVault, nodes: OptionNode[]): TreeNode {
  const rootChildren = nodes.filter(n => n.depth === 0);
  function expand(node: OptionNode): TreeNode {
    const children = nodes.filter(n => n.parent_node === node.pubkey);
    return { node, children: children.map(expand) };
  }
  return {
    node: null,
    children: rootChildren.map(expand),
  };
}

interface NodeCardProps {
  label: string;
  sublabel: string;
  type: NodeType;
  active: boolean;
  onClick: () => void;
}

function NodeCard({ label, sublabel, type, active, onClick }: NodeCardProps) {
  const color = nodeColor(type, active);
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center text-center gap-1 px-3 py-2 border transition-opacity hover:opacity-80"
      style={{
        borderColor: color,
        background: '#131228',
        opacity: active ? 1 : 0.45,
        minWidth: 100,
      }}
      aria-label={`${label} — ${sublabel}`}
    >
      <span className="font-mono text-[10px] font-semibold tracking-wider" style={{ color }}>
        {label}
      </span>
      <span className="font-mono text-[9px] text-fg-muted leading-tight">{sublabel}</span>
    </button>
  );
}

interface TreeColumnProps {
  treeNode: TreeNode;
  vault: OptionVault;
  oraclePrice: number;
  onNodeClick: (node: OptionNode | null) => void;
}

function TreeColumn({ treeNode, vault, oraclePrice, onNodeClick }: TreeColumnProps) {
  const { node, children } = treeNode;

  let label: string;
  let sublabel: string;
  let type: NodeType;
  let active: boolean;

  if (node === null) {
    // Synthetic ROOT
    label = `ROOT_${vault.vault_side}(${formatStrike(vault.strike)})`;
    sublabel = formatMicroUsdc(vault.collateral_amount);
    type = 'ROOT';
    active = !vault.is_settled;
  } else {
    const isLong = node.long_child_mint === vault.root_mint || node.depth % 2 === 0;
    type = getNodeType(isLong, vault.vault_side);
    label = `${type}(${formatStrike(node.child_strike)})`;
    const backing = isLong ? node.long_backing : node.short_backing;
    const iv = calcIntrinsicValue(type, node.child_strike, backing, oraclePrice, vault.vault_side);
    sublabel = `${formatMicroUsdc(backing)} · iv ${formatMicroUsdc(iv)}`;
    active = node.is_active;
  }

  return (
    <div className="flex flex-col items-center gap-0">
      <NodeCard
        label={label}
        sublabel={sublabel}
        type={type}
        active={active}
        onClick={() => onNodeClick(node)}
      />
      {children.length > 0 && (
        <>
          {/* connector line */}
          <div className="w-px h-4 bg-wire" />
          <div className="flex items-start gap-4">
            {children.map((child, i) => (
              <div key={child.node?.pubkey ?? i} className="flex flex-col items-center gap-0">
                <div className="w-px h-4 bg-wire" />
                <TreeColumn
                  treeNode={child}
                  vault={vault}
                  oraclePrice={oraclePrice}
                  onNodeClick={onNodeClick}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function OptionTreeGraph({ vault, nodes, oraclePrice, onNodeClick }: Props) {
  if (!vault) {
    return (
      <div className="py-12 text-center font-mono text-xs text-fg-muted">
        No vault data
      </div>
    );
  }

  const tree = buildTree(vault, nodes);

  return (
    <div className="overflow-x-auto py-6">
      <div className="flex justify-center">
        <div className="flex flex-col items-center gap-0">
          {/* Root vault node */}
          <NodeCard
            label={`ROOT_${vault.vault_side}(${formatStrike(vault.strike)})`}
            sublabel={formatMicroUsdc(vault.collateral_amount)}
            type="ROOT"
            active={!vault.is_settled}
            onClick={() => onNodeClick(null)}
          />
          {nodes.length === 0 && (
            <div className="mt-4 font-mono text-[10px] text-fg-muted">
              No splits yet — {truncAddr(vault.root_mint)}
            </div>
          )}
          {tree.children.length > 0 && (
            <>
              <div className="w-px h-4 bg-wire" />
              <div className="flex items-start gap-8">
                {tree.children.map((child, i) => (
                  <div key={child.node?.pubkey ?? i} className="flex flex-col items-center">
                    <div className="w-px h-4 bg-wire" />
                    <TreeColumn
                      treeNode={child}
                      vault={vault}
                      oraclePrice={oraclePrice}
                      onNodeClick={onNodeClick}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

// features/unified-data/map/TableMapCanvasImpl.tsx — LANE TABLE-MAP
//
// The Map's drawing: cards and lines on React Flow (the library the admin diagrams already use; it
// stays STATIC in here, behind TableMapCanvas's one dynamic door). Positions are fixed by `layoutMap`,
// so nothing moves while counts arrive.

import { useMemo } from "react";
// eslint-disable-next-line no-restricted-syntax -- inside the TableMapCanvas dynamic(ssr:false) front-door gate; React Flow stays STATIC in-gate per the code-splitting skill (rule 3).
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { formatCount } from "@ai-matrx/kit/format";

import { CARD_H, CARD_W, layoutMap, type MapCard, type TableMap } from "./tableMapModel";

export interface TableMapCanvasProps {
  map: TableMap;
  /** The record count when known; undefined shows a dash. */
  countOf: (tableId: string) => number | undefined;
  onOpen: (card: MapCard) => void;
}

interface CardData extends Record<string, unknown> {
  card: MapCard;
  count: number | undefined;
  onOpen: (card: MapCard) => void;
}

function TableCardNode({ data }: NodeProps<Node<CardData>>) {
  const { card, count, onOpen } = data;
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      data-table-map-card={card.id}
      style={{ width: CARD_W, height: CARD_H }}
      className="flex flex-col gap-1 overflow-hidden rounded-lg border border-border bg-card p-3 text-left shadow-sm hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-muted-foreground" />
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-muted-foreground" />
      <span className="truncate text-sm font-medium text-foreground">{card.name}</span>
      <span className="text-xs text-muted-foreground">{count === undefined ? "—" : formatCount(count)} records</span>
      <span className="mt-auto flex flex-col gap-0.5 text-xs text-muted-foreground">
        {card.keyColumns.map((c) => (
          <span key={c} className="truncate">
            {c}
          </span>
        ))}
      </span>
    </button>
  );
}

function OrgHeadNode({ data }: NodeProps<Node<{ name: string }>>) {
  return <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{data.name}</div>;
}

const NODE_TYPES: NodeTypes = { tableCard: TableCardNode, orgHead: OrgHeadNode };

function Canvas({ map, countOf, onOpen }: TableMapCanvasProps) {
  const { nodes, edges } = useMemo(() => {
    const { positions, heads } = layoutMap(map);
    const nodes: Node[] = [
      ...heads.map((h) => ({
        id: `org:${h.id}`,
        type: "orgHead",
        position: { x: h.x, y: h.y },
        data: { name: h.name },
        draggable: false,
        selectable: false,
      })),
      ...map.groups.flatMap((g) =>
        g.cards.map((card) => ({
          id: card.id,
          type: "tableCard",
          position: positions.get(card.id) ?? { x: 0, y: 0 },
          data: { card, count: countOf(card.id), onOpen } satisfies CardData,
          draggable: false,
        })),
      ),
    ];
    const edges: Edge[] = map.links.map((l) => ({
      id: l.id,
      source: l.from,
      target: l.to,
      label: l.label,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      ...(l.twoWay ? { markerStart: { type: MarkerType.ArrowClosed } } : {}),
      style: { strokeWidth: 1.5 },
      labelStyle: { fontSize: 11 },
    }));
    return { nodes, edges };
  }, [map, countOf, onOpen]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function TableMapCanvasImpl(props: TableMapCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

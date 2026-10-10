"use client";

// features/unified-data/map/TableMapCanvasImpl.tsx — LANE TABLE-MAP
//
// The Map's drawing: cards and lines on React Flow (the library the admin diagrams already use; it
// stays STATIC in here, behind TableMapCanvas's one dynamic door). Positions are fixed by `layoutMap`,
// so nothing moves while counts arrive.

import { useMemo, useState } from "react";
// eslint-disable-next-line no-restricted-syntax -- inside the TableMapCanvas dynamic(ssr:false) front-door gate; React Flow stays STATIC in-gate per the code-splitting skill (rule 3).
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { formatCount } from "@ai-matrx/kit/format";

import { CARD_H, CARD_W, type MapCard, type TableMap } from "./tableMapModel";
import { buildCanvasGraph, type CardData } from "./tableMapGraph";

export interface TableMapCanvasProps {
  map: TableMap;
  /** The record count when known; undefined shows a dash. */
  countOf: (tableId: string) => number | undefined;
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
      <span className="text-xs text-muted-foreground">{card.kindWord} · {count === undefined ? "—" : formatCount(count)} records</span>
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

/** More cards than this and the first screen is the top of the page at a readable size, not everything as dots. */
const FIT_ALL_UP_TO = 24;
const READABLE_ZOOM = 0.8;
const FOUND_MAX = 8;

/** "Find a table": type a few letters, press a name, the map moves to its card. */
function FindTable({ map, positions }: { map: TableMap; positions: Map<string, { x: number; y: number }> }) {
  const flow = useReactFlow();
  const [text, setText] = useState("");
  const needle = text.trim().toLowerCase();
  const hits = useMemo(
    () =>
      needle
        ? map.groups
            .flatMap((g) => g.cards.map((c) => ({ card: c, org: g.organizationName })))
            .filter((h) => h.card.name.toLowerCase().includes(needle))
            .slice(0, FOUND_MAX)
        : [],
    [map, needle],
  );
  return (
    <Panel position="top-left" className="w-60">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Find a table"
        aria-label="Find a table"
        data-table-map-find=""
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
      />
      {hits.length > 0 ? (
        <ul className="mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover text-sm shadow-md">
          {hits.map(({ card, org }) => (
            <li key={card.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-2 py-1 text-left hover:bg-accent"
                onClick={() => {
                  const at = positions.get(card.id);
                  if (at) void flow.setCenter(at.x + CARD_W / 2, at.y + CARD_H / 2, { zoom: 1, duration: 300 });
                }}
              >
                <span className="truncate">{card.name}</span>
                <span className="truncate text-xs text-muted-foreground">{org}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

function Canvas({ map, countOf, onOpen }: TableMapCanvasProps) {
  const { nodes, edges, positions } = useMemo(() => {
    return buildCanvasGraph(map, countOf, onOpen);
  }, [map, countOf, onOpen]);

  const cardCount = map.groups.reduce((n, g) => n + g.cards.length, 0);
  const fitAll = cardCount <= FIT_ALL_UP_TO;
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      {...(fitAll
        ? { fitView: true, fitViewOptions: { padding: 0.15, maxZoom: 1 } }
        : { defaultViewport: { x: 24, y: 24, zoom: READABLE_ZOOM } })}
      onlyRenderVisibleElements={!fitAll}
      minZoom={0.05}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={true}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="!bg-card" />
      <FindTable map={map} positions={positions} />
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

// features/unified-data/map/tableMapGraph.ts — LANE TABLE-MAP
//
// The Map's nodes and edges as React Flow wants them, kept apart from the drawing so a test can read
// the one property a real mouse depends on: a card node must take the pointer. (React Flow leaves a
// node that is neither selectable nor draggable at `pointer-events: none`, so a click fell through the
// card to the pane. jsdom computes no styles and cannot see that; this file's output can be asserted.)

import { MarkerType, type Edge, type Node } from "@xyflow/react";

import { layoutMap, type MapCard, type TableMap } from "./tableMapModel";

export interface CardData extends Record<string, unknown> {
  card: MapCard;
  count: number | undefined;
  onOpen: (card: MapCard) => void;
}

export function buildCanvasGraph(
  map: TableMap,
  countOf: (tableId: string) => number | undefined,
  onOpen: (card: MapCard) => void,
) {
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
          // A node takes the pointer only when it is selectable or draggable; without this a real
          // mouse falls through the card to the pane and the press opens nothing.
          selectable: true,
          style: { pointerEvents: "all" as const },
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
  return { nodes, edges, positions };
}

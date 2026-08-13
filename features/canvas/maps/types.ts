// features/canvas/maps/types.ts
//
// Maps = user-authored visual maps. NOT a new entity: a map IS a canvas item
// of type "diagram" (canvas.canvas_items) whose content is the canonical
// `DiagramData` the whole platform already speaks — the same shape an agent
// emits as the `diagram_spec` content-IR kind and the same shape
// InteractiveDiagramBlock renders. See ./FEATURE.md for why.

import type { DiagramData } from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import type { CanvasContentType } from "@/features/canvas/redux/canvasSlice";
import type { ListScopeKind } from "@/lib/list-scope/types";

/** The canvas_items.type value that makes a row a map. */
export const MAP_CANVAS_TYPE = "diagram" as const satisfies CanvasContentType;

/**
 * canvas_items is a per-user table with no org/share RPC surface, so the only
 * scope this list can answer TRUTHFULLY is "mine". Declaring scopes we cannot
 * serve would render tabs whose counts are guesses — worse than absent.
 */
export const MAP_LIST_SCOPES: ListScopeKind[] = ["mine"];

export interface MapListRow {
  id: string;
  title: string;
  description: string | null;
  /** Boxes on the map — the one number that says how big it is. */
  box_count: number;
  arrow_count: number;
  is_favorited: boolean;
  is_archived: boolean;
  is_public: boolean;
  tags: string[];
  updated_at: string;
  created_at: string;
}

export function mapHref(row: Pick<MapListRow, "id">): string {
  return `/maps/${row.id}`;
}

/** A brand-new map: one box, named after the map, so the canvas is never blank. */
export function starterMap(title: string): DiagramData {
  return {
    title,
    type: "flowchart",
    nodes: [
      {
        id: "start",
        label: title,
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
    layout: { direction: "TB" },
  };
}

/**
 * Turn plain typed lines into a first draft.
 *
 * The point is that nobody has to understand boxes-and-arrows as data to get
 * started: they write the steps the way they'd say them out loud, one per
 * line, and get a map they can then drag around. `A -> B` is understood too,
 * for anyone who reaches for it, but it is never required.
 */
export function draftMapFromLines(title: string, text: string): DiagramData {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const nodes: DiagramData["nodes"] = [];
  const edges: DiagramData["edges"] = [];
  const idByLabel = new Map<string, string>();

  const idFor = (label: string): string => {
    const existing = idByLabel.get(label.toLowerCase());
    if (existing) return existing;
    const id = `n-${nodes.length + 1}`;
    idByLabel.set(label.toLowerCase(), id);
    nodes.push({
      id,
      label,
      position: { x: 0, y: nodes.length * 120 },
    });
    return id;
  };

  let previousId: string | null = null;
  for (const line of lines) {
    // "A -> B -> C" (or "→", or "-->") describes the connections explicitly.
    const chain = line.split(/\s*(?:->|-->|→)\s*/).filter(Boolean);
    if (chain.length > 1) {
      let fromId = idFor(chain[0]);
      for (const step of chain.slice(1)) {
        const toId = idFor(step);
        edges.push({ id: `e-${edges.length + 1}`, source: fromId, target: toId });
        fromId = toId;
      }
      previousId = fromId;
      continue;
    }

    // A plain line is the next step after the previous one.
    const id = idFor(line);
    if (previousId && previousId !== id) {
      edges.push({ id: `e-${edges.length + 1}`, source: previousId, target: id });
    }
    previousId = id;
  }

  if (nodes.length === 0) return starterMap(title);

  return {
    title,
    type: "flowchart",
    nodes,
    edges,
    layout: { direction: "TB" },
  };
}

/** Defensive read of a canvas_items.content blob into a DiagramData. */
export function diagramFromCanvasContent(
  content: unknown,
  fallbackTitle: string,
): DiagramData | null {
  if (!content || typeof content !== "object") return null;
  const data = (content as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const candidate = data as Partial<DiagramData>;
  if (!Array.isArray(candidate.nodes)) return null;
  return {
    title: typeof candidate.title === "string" ? candidate.title : fallbackTitle,
    description: candidate.description,
    type: typeof candidate.type === "string" ? candidate.type : "flowchart",
    nodes: candidate.nodes,
    edges: Array.isArray(candidate.edges) ? candidate.edges : [],
    layout: candidate.layout,
    renderHints: candidate.renderHints,
  };
}

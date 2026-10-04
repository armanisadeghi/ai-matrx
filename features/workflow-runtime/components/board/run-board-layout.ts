/**
 * run-board-layout — a workflow DEFINITION laid out as a spatial board.
 *
 * Pure and deterministic: the same definition always yields the same board, so
 * a run reopened tomorrow lands every stage where it was today, and every
 * deliverable is placed before a single byte of output exists.
 *
 *   depth    — longest path from a source (Kahn over the edges). A node sits
 *              one column right of its deepest parent. Nodes caught in a cycle
 *              sit one column right of their deepest placed parent.
 *   order    — inside a column, by the mean row of the node's parents
 *              (barycenter; fewer crossing edges), ties by definition order.
 *   stages   — one frame per column. A tall column wraps into sub-columns of
 *              at most `MAX_ROWS` tiles, so a 20-way fan-out stays a block,
 *              not a 9,000px ribbon.
 *   sizes    — a step is 560×440; a deliverable (what the reader keeps) is
 *              720×560, because kinds are tuned for the 720px chat column.
 *
 * Nothing here knows about React, Redux or the spatial engine.
 */

export interface RunBoardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RunBoardLayoutInput {
  nodes: ReadonlyArray<{ id: string }>;
  edges: ReadonlyArray<{ source: string; target: string }>;
  /** Nodes that produce something the reader keeps — drawn larger. */
  deliverableIds?: ReadonlySet<string>;
}

export interface RunBoardTileLayout {
  nodeId: string;
  rect: RunBoardRect;
  /** Column (stage) index, 0-based. */
  layer: number;
  deliverable: boolean;
}

export interface RunBoardFrameLayout {
  id: string;
  layer: number;
  rect: RunBoardRect;
  /** Node ids in this stage, in board order. */
  nodeIds: string[];
}

export interface RunBoardEdgeLayout {
  id: string;
  from: string;
  to: string;
}

export interface RunBoardLayout {
  tiles: RunBoardTileLayout[];
  frames: RunBoardFrameLayout[];
  edges: RunBoardEdgeLayout[];
  /** Nodes per layer, in board order. */
  layers: string[][];
}

export const STEP_TILE = { w: 560, h: 440 } as const;
export const DELIVERABLE_TILE = { w: 720, h: 560 } as const;
/** Tiles per sub-column before a stage wraps sideways. */
export const MAX_ROWS = 4;
export const TILE_GAP = 40;
export const FRAME_PAD = 48;
/** Frame edge to frame edge — room for the edge curves and stage labels. */
export const STAGE_GAP = 200;

export function layoutWorkflowRunBoard(input: RunBoardLayoutInput): RunBoardLayout {
  const deliverables = input.deliverableIds ?? new Set<string>();
  const order = new Map<string, number>();
  input.nodes.forEach((node, index) => {
    if (!order.has(node.id)) order.set(node.id, index);
  });
  const ids = [...order.keys()];

  // Valid, de-duplicated edges only: both ends known, no self-loops.
  const edges: RunBoardEdgeLayout[] = [];
  const seen = new Set<string>();
  const parents = new Map<string, string[]>(ids.map((id) => [id, []]));
  const children = new Map<string, string[]>(ids.map((id) => [id, []]));
  const parentsOf = (id: string) => parents.get(id) ?? [];
  const childrenOf = (id: string) => children.get(id) ?? [];
  const orderOf = (id: string) => order.get(id) ?? 0;
  for (const edge of input.edges) {
    if (!order.has(edge.source) || !order.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    const key = `${edge.source}->${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ id: key, from: edge.source, to: edge.target });
    parentsOf(edge.target).push(edge.source);
    childrenOf(edge.source).push(edge.target);
  }

  // ── depth: longest path (Kahn), definition order as the tie-break ────────
  const depth = new Map<string, number>();
  const depthOf = (id: string) => depth.get(id) ?? 0;
  const placed = new Set<string>();
  const indegree = new Map<string, number>(ids.map((id) => [id, parentsOf(id).length]));
  const ready = ids.filter((id) => indegree.get(id) === 0);
  while (ready.length > 0) {
    ready.sort((a, b) => orderOf(a) - orderOf(b));
    const id = ready.shift();
    if (id === undefined) break;
    placed.add(id);
    for (const child of childrenOf(id)) {
      depth.set(child, Math.max(depthOf(child), depthOf(id) + 1));
      const left = (indegree.get(child) ?? 1) - 1;
      indegree.set(child, left);
      if (left === 0) ready.push(child);
    }
  }
  // Nodes in (or downstream of) a cycle never reached indegree 0. Place each
  // one column right of its deepest placed parent, sweeping in definition
  // order until nothing is left; a sweep that places nothing breaks the cycle
  // at the earliest remaining node.
  let remaining = ids.filter((id) => !placed.has(id));
  while (remaining.length > 0) {
    let progressed = false;
    for (const id of remaining) {
      const from = parentsOf(id).filter((p) => placed.has(p));
      if (from.length === 0) continue;
      depth.set(id, Math.max(...from.map((p) => depthOf(p) + 1)));
      placed.add(id);
      progressed = true;
    }
    if (!progressed) {
      depth.set(remaining[0], 0);
      placed.add(remaining[0]);
    }
    remaining = remaining.filter((id) => !placed.has(id));
  }

  // ── layers + barycenter order ────────────────────────────────────────────
  const layerCount = ids.length === 0 ? 0 : Math.max(...ids.map(depthOf)) + 1;
  const layers: string[][] = Array.from({ length: layerCount }, () => []);
  for (const id of ids) layers[depthOf(id)].push(id);
  const row = new Map<string, number>();
  layers.forEach((layer, index) => {
    if (index > 0) {
      const barycenter = (id: string) => {
        const rows = parentsOf(id).flatMap((p) => {
          const r = row.get(p);
          return r === undefined ? [] : [r];
        });
        if (rows.length === 0) return Number.POSITIVE_INFINITY;
        return rows.reduce((sum, r) => sum + r, 0) / rows.length;
      };
      const keys = new Map(layer.map((id) => [id, barycenter(id)]));
      layer.sort((a, b) => {
        const ka = keys.get(a) ?? Number.POSITIVE_INFINITY;
        const kb = keys.get(b) ?? Number.POSITIVE_INFINITY;
        if (ka !== kb) return ka < kb ? -1 : 1;
        return orderOf(a) - orderOf(b);
      });
    }
    layer.forEach((id, i) => row.set(id, i));
  });

  // ── geometry ─────────────────────────────────────────────────────────────
  const sizeOf = (id: string) => (deliverables.has(id) ? DELIVERABLE_TILE : STEP_TILE);
  const tiles: RunBoardTileLayout[] = [];
  const frames: RunBoardFrameLayout[] = [];
  let frameX = 0;
  layers.forEach((layer, layerIndex) => {
    const columns: string[][] = [];
    for (let i = 0; i < layer.length; i += MAX_ROWS) columns.push(layer.slice(i, i + MAX_ROWS));
    let colX = frameX + FRAME_PAD;
    let tallest = 0;
    for (const column of columns) {
      const colW = Math.max(...column.map((id) => sizeOf(id).w));
      let y = FRAME_PAD;
      for (const id of column) {
        const size = sizeOf(id);
        tiles.push({
          nodeId: id,
          rect: { x: colX + (colW - size.w) / 2, y, w: size.w, h: size.h },
          layer: layerIndex,
          deliverable: deliverables.has(id),
        });
        y += size.h + TILE_GAP;
      }
      tallest = Math.max(tallest, y - TILE_GAP - FRAME_PAD);
      colX += colW + TILE_GAP;
    }
    const innerW = colX - TILE_GAP - (frameX + FRAME_PAD);
    const rect = { x: frameX, y: 0, w: innerW + FRAME_PAD * 2, h: tallest + FRAME_PAD * 2 };
    frames.push({ id: `stage-${layerIndex}`, layer: layerIndex, rect, nodeIds: [...layer] });
    frameX += rect.w + STAGE_GAP;
  });

  return { tiles, frames, edges, layers };
}

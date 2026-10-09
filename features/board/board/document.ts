/**
 * The saved form of a board (pure) — what `projects.boards` stores in
 * its `camera` / `nodes` / `edges` columns, and its JSON Canvas export.
 *
 * A node is a rect plus a TYPED SOURCE: the thing the tile shows, by
 * reference, never a copy of live state. A stream is saved as the request it
 * came from; a document, file or record as its id; generated HTML as its
 * URL or its markup. Opening a board re-mounts each source.
 *
 * Export follows JSON Canvas 1.0 (jsoncanvas.org, MIT — Obsidian's open
 * format): text / file / link / group nodes, so a board opens in any canvas
 * tool that reads it. Our richer sources map down to the nearest spec type,
 * carrying the original source in the node under `matrx`, which spec readers
 * ignore.
 */

import type { Camera, Rect } from "../engine/camera";
import type { BoardShape } from "./useBoard";
import { boundsOfPoints, isBoxed, parseShape, SHAPE_COLORS, serializeShape, type ShapeColor } from "../engine/shapes";
import { connectionToArrow, connectionsOf } from "./connections";
import { labelToText } from "../engine/canvas-text";

export type NodeSource =
  /** A live or finished agent run, by request id. */
  | { kind: "stream"; requestId: string; conversationId?: string }
  /** Text or markdown kept on the board itself (a note, a saved stream's text). */
  | { kind: "text"; markdown: string }
  /** RETIRED (2026-10-09): a large on-board label. Read only to migrate it to plain canvas text on load. */
  | { kind: "label"; text: string }
  | { kind: "html"; url?: string; html?: string }
  | { kind: "image"; fileId?: string; url?: string }
  | { kind: "file"; fileId: string }
  | { kind: "record"; tableId: string; recordId: string }
  | { kind: "document"; documentId: string }
  | { kind: "thread"; threadId: string }
  /**
   * Any platform record a registered board item type renders
   * (`features/board/items`): `entity` is the item type key ("note",
   * "chat", "task", "war-room"…), `id` the record's id. `id` is null while
   * the record does not exist yet (a draft note is created by its first
   * words; a new chat by its first launch). `meta` carries small strings the
   * type needs to re-mount — or a `seed` for a record not created yet (pasted
   * text becoming a note), dropped once the record exists.
   */
  | { kind: "entity"; entity: string; id: string | null; meta?: Record<string, string> };

/**
 * The platform record a source shows, as one key — or null when it shows board
 * content (text, a label, a page, an image) or a record not created yet.
 * A board holds each record ONCE: two tiles of one note, document or file are
 * two editors of the same record in one tab, each saving its own copy over the
 * other's (the later save silently wins).
 */
export function recordKeyOf(source: NodeSource): string | null {
  switch (source.kind) {
    case "file":
      return source.fileId ? `file:${source.fileId}` : null;
    case "record":
      return `record:${source.tableId}:${source.recordId}`;
    case "document":
      return `document:${source.documentId}`;
    case "thread":
      return `thread:${source.threadId}`;
    case "entity":
      // A tile that shows one PART of a record (`meta.part`: a meeting's
      // transcript, its decisions) is its own key — the parts are different
      // views, never two editors of one thing.
      if (!source.id) return null;
      return source.meta?.part ? `${source.entity}:${source.id}#${source.meta.part}` : `${source.entity}:${source.id}`;
    default:
      return null;
  }
}

export interface BoardNode {
  id: string;
  rect: Rect;
  title: string;
  source: NodeSource;
  /** On the shelf rather than the board. */
  parked?: boolean;
  /**
   * The item's last-known basics (a few of its own values, small), kept while its tile is awake so an
   * agent knows what it is when the tile is asleep or the board was just opened
   * (`tools/item-surfaces.ts` `StoredBasics`). Never the item's content — that lives in its record.
   */
  basics?: { values: Record<string, unknown>; at: string; stale?: boolean };
}

export interface BoardGroup {
  id: string;
  rect: Rect;
  title: string;
  note?: string;
  /** The frame's colour (a key of the board palette); absent = the neutral frame. */
  color?: ShapeColor;
}

export interface BoardEdge {
  id: string;
  from: string;
  to: string;
}

export interface BoardDocument {
  camera: Camera;
  nodes: BoardNode[];
  groups: BoardGroup[];
  edges: BoardEdge[];
  /** Drawn marks (rect, oval, arrow, line, pen) and words on the canvas (sticky notes, plain text). */
  shapes: BoardShape[];
}


/** Validate a stored document at the read boundary. Anything malformed is
 * REPORTED (with the node that failed), never silently dropped. */
export function parseBoardDocument(raw: {
  camera: unknown;
  nodes: unknown;
  edges: unknown;
}): { doc: BoardDocument; problems: string[] } {
  const problems: string[] = [];
  const camera = isCamera(raw.camera) ? raw.camera : { x: 0, y: 0, z: 0.6 };
  if (!isCamera(raw.camera)) problems.push("camera was not {x,y,z}; reset to the default view");
  const nodes: BoardNode[] = [];
  const groups: BoardGroup[] = [];
  const shapes: BoardShape[] = [];
  for (const [i, n] of (Array.isArray(raw.nodes) ? raw.nodes : []).entries()) {
    if (isObject(n) && n.shape === true) {
      const { shape: _flag, ...stored } = n;
      void _flag;
      const parsed = parseShape(stored, `shape ${i}`);
      if (parsed.shape) shapes.push(parsed.shape);
      problems.push(...parsed.problems);
      continue;
    }
    if (!isObject(n) || typeof n.id !== "string" || !isRect(n.rect) || typeof n.title !== "string") {
      problems.push(`node ${i} is missing id, rect or title`);
      continue;
    }
    if (n.group === true) {
      groups.push({
        id: n.id,
        rect: n.rect,
        title: n.title,
        note: typeof n.note === "string" ? n.note : undefined,
        ...(typeof n.color === "string" && (SHAPE_COLORS as readonly string[]).includes(n.color) ? { color: n.color as ShapeColor } : {}),
      });
      continue;
    }
    if (!isSource(n.source)) {
      problems.push(`node "${n.title}" has an unknown source`);
      continue;
    }
    // The retired label tile (the old Text tool) is plain canvas text now: same id, words and
    // place, migrated here once — the next save writes the text object, never a label node.
    if (n.source.kind === "label") {
      shapes.push(labelToText({ id: n.id, rect: n.rect, text: n.source.text }));
      continue;
    }
    const basics = isBasics(n.basics) ? n.basics : undefined;
    if (n.basics !== undefined && !basics) problems.push(`node "${n.title}" has malformed basics; dropped them`);
    nodes.push({
      id: n.id,
      rect: n.rect,
      title: n.title,
      source: n.source,
      parked: n.parked === true,
      ...(basics ? { basics } : {}),
    });
  }
  if (!Array.isArray(raw.nodes)) problems.push("nodes was not a list");
  const edges: BoardEdge[] = [];
  for (const e of Array.isArray(raw.edges) ? raw.edges : []) {
    if (isObject(e) && typeof e.id === "string" && typeof e.from === "string" && typeof e.to === "string") {
      edges.push({ id: e.id, from: e.from, to: e.to });
    } else problems.push("an edge is missing id, from or to");
  }
  // ONE connector model: a stored edge is a bound arrow (same id, same ends) — migrated here, once;
  // the next save writes the arrow and an empty `edges`. An edge to something that is gone is reported.
  const rectOf = rectLookup(nodes, shapes);
  for (const e of edges) {
    const arrow = shapes.some((x) => x.id === e.id) ? null : connectionToArrow(e, rectOf);
    if (arrow) shapes.push(arrow);
    else if (!shapes.some((x) => x.id === e.id)) problems.push(`edge "${e.id}" joins a tile that is not on the board; dropped it`);
  }
  return { doc: { camera, nodes, groups, edges: [], shapes }, problems };
}

/** Rects of what an edge can name: tiles, and boxed shapes (a label tile that became text keeps its id). */
function rectLookup(nodes: readonly BoardNode[], shapes: readonly BoardShape[]) {
  const byId = new Map<string, Rect>(nodes.map((n) => [n.id, n.rect]));
  for (const sh of shapes) if (isBoxed(sh.kind)) byId.set(sh.id, boundsOfPoints(sh.points));
  return (id: string) => byId.get(id);
}

/** The column values to store. Groups and shapes ride in `nodes`, flagged
 * `group: true` / `shape: true`. */
export function serializeBoardDocument(rawDoc: BoardDocument) {
  // A document built in code (a built-in template) may still carry `edges`: they are stored as bound arrows.
  const doc = withEdgesAsArrows(rawDoc);
  return {
    camera: doc.camera,
    nodes: [
      ...doc.groups.map((g) => ({ id: g.id, rect: g.rect, title: g.title, note: g.note, ...(g.color ? { color: g.color } : {}), group: true })),
      ...doc.shapes.map((sh) => ({ ...serializeShape(sh), shape: true })),
      ...doc.nodes,
    ],
    edges: [] as BoardEdge[],
  };
}

/** `doc` with any `edges` turned into bound arrows (a no-op for a parsed document, whose edges are always empty). */
export function withEdgesAsArrows(doc: BoardDocument): BoardDocument {
  if (doc.edges.length === 0) return doc;
  const rectOf = rectLookup(doc.nodes, doc.shapes);
  const shapes = [...doc.shapes];
  for (const e of doc.edges) {
    const arrow = shapes.some((x) => x.id === e.id) ? null : connectionToArrow(e, rectOf);
    if (arrow) shapes.push(arrow);
  }
  return { ...doc, edges: [], shapes };
}

// ── JSON Canvas 1.0 export ───────────────────────────────────────────────────

type JsonCanvasNode = {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  matrx?: NodeSource;
};

export function toJsonCanvas(doc: BoardDocument, origin: string) {
  const box = (r: Rect) => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(r.h) });
  const nodes: JsonCanvasNode[] = [
    ...doc.groups.map((g) => ({ id: g.id, type: "group" as const, ...box(g.rect), label: g.title })),
    ...doc.nodes.map((n): JsonCanvasNode => {
      const s = n.source;
      switch (s.kind) {
        case "text":
          return { id: n.id, type: "text", ...box(n.rect), text: s.markdown };
        case "label":
          return { id: n.id, type: "text", ...box(n.rect), text: s.text };
        case "html":
          return s.url
            ? { id: n.id, type: "link", ...box(n.rect), url: new URL(s.url, origin).href, matrx: s }
            : { id: n.id, type: "text", ...box(n.rect), text: `# ${n.title}\n\n(generated page)`, matrx: s };
        case "image":
          return s.url
            ? { id: n.id, type: "link", ...box(n.rect), url: new URL(s.url, origin).href, matrx: s }
            : { id: n.id, type: "file", ...box(n.rect), file: `files/${s.fileId}`, matrx: s };
        case "file":
          return { id: n.id, type: "file", ...box(n.rect), file: `files/${s.fileId}`, matrx: s };
        default:
          return { id: n.id, type: "text", ...box(n.rect), text: `# ${n.title}`, matrx: s };
      }
    }),
  ];
  // Sticky notes and plain text are JSON Canvas text nodes.
  for (const sh of doc.shapes) {
    if (sh.kind !== "sticky" && sh.kind !== "text") continue;
    const r = boundsOfPoints(sh.points);
    nodes.push({ id: sh.id, type: "text", ...box(r), text: sh.text ?? "" });
  }
  // Tile-to-tile connectors are JSON Canvas edges (any edges still on the document count too).
  const nodeIds = new Set(nodes.map((n) => n.id));
  const lines = [
    ...doc.edges,
    ...connectionsOf(doc.shapes, (id) => nodeIds.has(id)),
  ];
  const edges = lines.map((e) => ({ id: e.id, fromNode: e.from, toNode: e.to }));
  return { nodes, edges };
}

// ── guards ───────────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isCamera(v: unknown): v is Camera {
  return isObject(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y) && isFiniteNumber(v.z) && v.z > 0;
}
function isRect(v: unknown): v is Rect {
  return isObject(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y) && isFiniteNumber(v.w) && isFiniteNumber(v.h);
}
function isBasics(v: unknown): v is NonNullable<BoardNode["basics"]> {
  return (
    isObject(v) &&
    isObject(v.values) &&
    typeof v.at === "string" &&
    (v.stale === undefined || typeof v.stale === "boolean")
  );
}
function isSource(v: unknown): v is NodeSource {
  if (!isObject(v)) return false;
  switch (v.kind) {
    case "stream":
      return typeof v.requestId === "string";
    case "text":
      return typeof v.markdown === "string";
    case "label":
      return typeof v.text === "string";
    case "html":
      return typeof v.url === "string" || typeof v.html === "string";
    case "image":
      return typeof v.url === "string" || typeof v.fileId === "string";
    case "file":
      return typeof v.fileId === "string";
    case "record":
      return typeof v.tableId === "string" && typeof v.recordId === "string";
    case "document":
      return typeof v.documentId === "string";
    case "thread":
      return typeof v.threadId === "string";
    case "entity":
      return (
        typeof v.entity === "string" &&
        (v.id === null || typeof v.id === "string") &&
        (v.meta === undefined ||
          (isObject(v.meta) && Object.values(v.meta).every((m) => typeof m === "string")))
      );
    default:
      return false;
  }
}

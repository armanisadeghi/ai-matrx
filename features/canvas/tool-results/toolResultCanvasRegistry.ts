/**
 * toolResultCanvasRegistry — THE one place that answers "did this tool result
 * create a record the canvas can show, and what would it show?"
 *
 * THE CLASS THIS CLOSES (production, 2026-09-14). A chat agent called the
 * `document` tool, the tool succeeded, a `workbench.udt_documents` row was
 * created, and the agent replied «Created and opened as a document artifact».
 * Nothing opened. No card appeared. No drop notice fired — because the tool
 * result never made an open-in-canvas request at all. THE DOOR LAW: every
 * record the UI names opens.
 *
 * It was never about that one tool. Every record-creating tool has the same
 * shape — a result that names a row of a canvas-renderable kind — and each one
 * would have needed its own bespoke wire. So the wire is registered ONCE here,
 * keyed by the tool's name and by the result's kind, and a future tool inherits
 * the whole behaviour (thread card action + canvas offer + auto-open rules) by
 * adding one reader.
 *
 * A reader is PURE: result in, offer out, `null` when this particular result
 * created nothing. No React, no Redux, no IO — so the rules are testable
 * without a canvas.
 */

import { KIND_KEY } from "@ai-matrx/content-ir";

import type { CanvasContent } from "@/features/canvas/redux/canvasSlice";
import {
  buildDocumentCanvasContent,
  documentCanvasSourceId,
} from "@/features/data-tables/hooks/useOpenDocumentCanvas";
import {
  buildTopicalMapCanvasContent,
  topicalMapCanvasSourceId,
} from "@/features/marketing/seo/topical-map/canvas/topicalMapCanvasContent";

/** One canvas-renderable record found in a tool result. */
export interface ToolResultCanvasOffer {
  /**
   * Stable identity for the pane. Offering the same record twice (a re-render,
   * a reload, a second call naming the same row) must show ONE pane, never
   * stack them — this is what `offerCanvasItem` dedupes on.
   */
  sourceId: string;
  /** What the record is called, in the user's words, for notices and badges. */
  label: string;
  /** The canvas content to offer. */
  content: CanvasContent;
}

export interface ToolResultCanvasContext {
  /** The chat the tool ran in, when the caller knows it. */
  conversationId?: string | null;
}

/**
 * Read one tool result. Returns `null` when this call created nothing the
 * canvas can host (a read, a failed call, an unrelated action).
 */
export type ToolResultCanvasReader = (
  result: unknown,
  ctx: ToolResultCanvasContext,
) => ToolResultCanvasOffer | null;

const READERS = new Map<string, ToolResultCanvasReader>();

/**
 * Register the reader for a tool name OR a result kind. Registering the same
 * key twice is a programming error, not a silent overwrite: two readers for one
 * key means two different panes could open for the same record.
 */
export function registerToolResultCanvasReader(
  key: string,
  reader: ToolResultCanvasReader,
): void {
  if (READERS.has(key) && READERS.get(key) !== reader) {
    throw new Error(
      `A canvas reader is already registered for "${key}". One key, one reader.`,
    );
  }
  READERS.set(key, reader);
}

/** Exposed for guards: which keys are wired today. */
export function registeredToolResultCanvasKeys(): string[] {
  return [...READERS.keys()].sort();
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The result's declared kind, when it carries one. */
function resultKind(result: unknown): string | null {
  const obj = asObject(result);
  if (!obj) return null;
  for (const key of [KIND_KEY, "kind", "resource_type", "entity_token"]) {
    const value = obj[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/**
 * The offer for a tool result, if any. The KIND wins over the tool name: a tool
 * that can emit several kinds of record (a generic `create_resource`, say) is
 * routed by what it actually made, and a single-purpose tool is routed by its
 * name.
 */
export function readToolResultCanvasOffer(
  toolName: string | null | undefined,
  result: unknown,
  ctx: ToolResultCanvasContext = {},
): ToolResultCanvasOffer | null {
  const kind = resultKind(result);
  const byKind = kind ? READERS.get(kind) : undefined;
  if (byKind) {
    const offer = byKind(result, ctx);
    if (offer) return offer;
  }
  const byName = toolName ? READERS.get(toolName) : undefined;
  if (!byName) return null;
  return byName(result, ctx);
}

// ── Registrations ───────────────────────────────────────────────────────────
//
// Keep each reader beside the shape it reads, and keep the list here so one
// file answers "which tool results reach the canvas today".

const asStr = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

/**
 * `document` (aidream `services/udt_content/tools.py`) — action-dispatched, and
 * the three actions return three different shapes. Reading only one of them is
 * how a real call rendered as nothing at all:
 *
 *   create → { action, document: { id, document_name, … }, created, saved? }
 *   read   → { action, document_id, name, text, … }
 *   edit   → { action, document_id, applied: [...], saved }
 *
 * Only a call that CREATED or CHANGED a document is offered: a plain `read`
 * already showed the user its text in the thread, and opening a pane for it
 * would be the canvas talking over the user.
 */
const readDocumentResult: ToolResultCanvasReader = (result, ctx) => {
  const r = asObject(result);
  if (!r) return null;
  const action = asStr(r.action);
  if (action === "read") return null;

  const nested = asObject(r.document) ?? {};
  const documentId =
    asStr(r.document_id) ?? asStr(r.id) ?? asStr(nested.id) ?? null;
  if (!documentId) return null;

  // An `edit` that applied nothing changed nothing worth revealing.
  if (action === "edit" && Array.isArray(r.applied) && r.applied.length === 0) {
    return null;
  }

  const title =
    asStr(r.name) ??
    asStr(nested.document_name) ??
    asStr(nested.name) ??
    "Document";

  return {
    sourceId: documentCanvasSourceId(documentId),
    label: title,
    content: buildDocumentCanvasContent({
      documentId,
      title,
      conversationId: ctx.conversationId ?? null,
    }),
  };
};

registerToolResultCanvasReader("document", readDocumentResult);
// The same reader by KIND, so any tool that emits a `udt_document` record —
// today or later — inherits the door without a second registration.
registerToolResultCanvasReader("udt_document", readDocumentResult);

/**
 * `topical_map` (aidream `tools/topical_map_tool.py`) — action-dispatched over
 * one brand's map. Only a call that CREATED or CHANGED the map is offered
 * (`create_map`, `upsert`, `replace_section`, `patch`, `move`, `merge`,
 * `split`, `retire`, `reject_topics`, the facet writes): a read already showed
 * the person its answer in the thread, and the card's own Open menu still
 * carries "Open map in canvas" for those. The pane is the live workspace
 * (`topical_map` pointer, NON_PERSISTABLE), keyed by map so a run that edits
 * the same map ten times shows ONE pane.
 */
const TOPICAL_MAP_OFFERED_ACTIONS = new Set([
  "create_map",
  "upsert",
  "replace_section",
  "patch",
  "move",
  "merge",
  "split",
  "retire",
  "reject_topics",
  "set_facet",
  "add_facet_values",
]);

const readTopicalMapToolResult: ToolResultCanvasReader = (result, ctx) => {
  const r = asObject(result);
  if (!r) return null;
  const action = asStr(r.action);
  if (!action || !TOPICAL_MAP_OFFERED_ACTIONS.has(action)) return null;
  const mapId = asStr(r.map_id) ?? asStr(asObject(r.map)?.id);
  if (!mapId) return null;
  const title = asStr(asObject(r.map)?.name) ?? "Topical map";
  return {
    sourceId: topicalMapCanvasSourceId(mapId),
    label: title,
    content: buildTopicalMapCanvasContent({
      mapId,
      screen: "outline",
      title,
      conversationId: ctx.conversationId ?? null,
    }),
  };
};

registerToolResultCanvasReader("topical_map", readTopicalMapToolResult);

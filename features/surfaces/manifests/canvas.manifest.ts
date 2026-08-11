/**
 * Surface manifest — Canvas (`matrx-user/canvas`).
 *
 * The global right-side Canvas pane (`CanvasSideSheetImpl` → `CanvasPane` →
 * `CanvasBody`). The user opens ARTIFACTS into it — a mermaid diagram, a
 * table, a code block, a quiz, an HTML view, a working document — usually
 * from a chat message, and the pane slides in over whatever route they are
 * on. It is a HOST for typed artifact renderers, not an editor of its own.
 *
 * WHAT THIS SURFACE IS NOT (audited against the live pane 2026-08-11):
 * there are no diagram nodes, no node selection, and no text elements at
 * this level. The canvas holds a list of artifact ITEMS; the authored
 * content inside each one belongs to that artifact's own renderer and, where
 * it is agent-writable at all, to that artifact's OWN surface
 * (`matrx-user/mermaid-editor`, `matrx-user/html-page`,
 * `matrx-user/working-document` / `matrx-user/scratchpad`). Values here
 * describe the pane and the open item — never the inside of the artifact.
 *
 * Emitter: `SurfaceRuntimeProvider` in `features/canvas/core/CanvasSideSheetImpl.tsx`,
 * mounted only once an item is open, so it covers every route the pane
 * overlays (chat, artifacts, anywhere the side sheet is available).
 *
 * NO `writeTargets` — deliberately. See the FEATURE.md Change Log entry for
 * 2026-08-11: the pane owns no authored text, and writing "into the canvas"
 * generically would mean reaching through it into whichever artifact
 * renderer happens to be open — a parallel write path around surfaces that
 * already ship their own targets.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "canvas_item",
    label: "Open canvas item",
    sortOrder: 100,
    description: "The artifact currently rendered in the primary pane.",
  },
  {
    key: "canvas_session",
    label: "Canvas session",
    sortOrder: 200,
    description:
      "Every item open in this canvas session, plus split and render state.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Open canvas item (300-329) ────────────────────────────────────────
  {
    name: "current_canvas_id",
    label: "Current canvas ID",
    description:
      "`canvas_items` UUID of the artifact in the primary pane. Empty when the open item is session-only and has never been saved to the canvas library.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "canvas_item",
    sortOrder: 300,
  },
  {
    name: "current_canvas_type",
    label: "Current canvas type",
    description:
      'Artifact type rendered in the primary pane — one of the `CanvasContentType` values (e.g. "mermaid", "table", "code", "quiz", "html", "chart", "flashcards", "working_document"). Always present while the pane is open.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    group: "canvas_item",
    sortOrder: 305,
  },
  {
    name: "current_canvas_title",
    label: "Current canvas title",
    description:
      "Title shown in the pane header for the open artifact. Empty when the item carries no title and the renderer falls back to a type default.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "canvas_item",
    sortOrder: 310,
  },
  {
    name: "current_canvas_is_saved",
    label: "Saved to library",
    description:
      "True when the open item is persisted as a `canvas_items` row (so it has a `current_canvas_id`); false while it is session-only. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "canvas_item",
    sortOrder: 315,
  },
  {
    name: "canvas_json",
    label: "Canvas item payload",
    description:
      "Structured `data` payload of the open artifact; its shape is type-specific. For MATERIALIZED artifacts this is only the pointer `{ artifactId }` — the artifact body lives in `canvas_items` and is NOT inlined here, so never treat this as the full content. Empty object when the item carries no data.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    group: "canvas_item",
    sortOrder: 320,
  },

  // ── Canvas session (400-429) ──────────────────────────────────────────
  {
    name: "open_items",
    label: "Open canvas items",
    description:
      "Every artifact open in this canvas session as `{ session_id, canvas_id, type, title }`. `session_id` is the ephemeral per-session id used to switch panes; `canvas_id` is the durable `canvas_items` UUID and is empty for unsaved items. Always present and never empty while the pane is open.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 400,
    group: "canvas_session",
    sortOrder: 400,
  },
  {
    name: "item_count",
    label: "Item count",
    description:
      "Number of artifacts open in this canvas session (the length of `open_items`). At least 1 while the pane is open.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    group: "canvas_session",
    sortOrder: 405,
  },
  {
    name: "is_split",
    label: "Split view",
    description:
      "True when the pane is showing two artifacts stacked (a secondary item is set and the viewport is not mobile). Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "canvas_session",
    sortOrder: 410,
  },
  {
    name: "secondary_canvas_id",
    label: "Secondary canvas ID",
    description:
      "`canvas_items` UUID of the artifact in the bottom pane while `is_split` is true. Empty when the view is not split or the secondary item is unsaved.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "canvas_session",
    sortOrder: 415,
  },
  {
    name: "render_mode",
    label: "Render mode",
    description:
      'Layout preference for where canvas content renders: "inline" (beside the conversation), "global" (the side sheet), or "auto" (let the layout decide). This is a placement preference, NOT an edit/preview toggle. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    group: "canvas_session",
    sortOrder: 420,
  },
];

export const CANVAS_SURFACE_NAME = "matrx-user/canvas";

export const canvasManifest: SurfaceManifest = {
  surfaceName: CANVAS_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Values re-authored against the live pane (2026-08-11) — the previous set declared diagram-node vocabulary (`selected_node_id`, `selected_nodes`, `current_text_block`) for an editor that does not exist in this codebase, and documented `render_mode` with an edit/preview enum it never had. Emitter now wired in CanvasSideSheetImpl. Remaining: no `data-surface-value` anchors, and no live non-matching-name binding test.",
  label: "Canvas",
  intro: `<surface_intro>
The Canvas is a side pane that HOSTS artifacts — a mermaid diagram, a table, a
code block, a quiz, an HTML view, a working document — opened from a chat
message or another surface. It slides in over whatever route the user is on.

There are no diagram nodes and no node selection here: the canvas holds a LIST
of artifact items, one rendered per pane. current_canvas_type tells you which
kind of artifact is open; canvas_json is that item's data payload, and for a
materialized artifact it is only a { artifactId } pointer — the body is not
inlined, so never claim to have read content you were not given.

The authored content INSIDE an artifact belongs to that artifact's own surface
(mermaid-editor, html-page, working-document, scratchpad). Operate on what the
canvas pane itself owns: which items are open, which is current, and how they
are presented.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

/**
 * One entry of `open_items`.
 *
 * `session_id` is the ephemeral `CanvasItem.id` (pane switching); `canvas_id`
 * is the durable `canvas_items` UUID, absent until the item is saved.
 */
export interface CanvasOpenItemSummary {
  session_id: string;
  canvas_id?: string;
  type: string;
  title: string;
}

/**
 * Scope builder for `matrx-user/canvas`.
 *
 * Required (no `?`) keys mirror every `alwaysAvailable: true` value — the
 * emitter mounts only once an item is open, which is what makes
 * `current_canvas_type` / `open_items` / `item_count` guaranteed.
 */
export function createCanvasScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;

  // Open canvas item
  current_canvas_id?: string;
  current_canvas_type: string;
  current_canvas_title?: string;
  current_canvas_is_saved: boolean;
  canvas_json?: Record<string, unknown>;

  // Canvas session
  open_items: CanvasOpenItemSummary[];
  item_count: number;
  is_split: boolean;
  secondary_canvas_id?: string;
  render_mode: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

/**
 * Surface manifest — Canvas (`matrx-user/canvas`).
 *
 * The global right-side Canvas column (`ShellCanvasColumn` → `@ai-matrx/canvas`
 * panes, one kind per artifact type in `features/canvas/host/artifactKinds.tsx`). The user opens ARTIFACTS into it — a mermaid diagram, a
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
 * Emitter: `features/canvas/host/ShellCanvasColumn.tsx` wraps the canvas
 * column in `SurfaceRuntimeProvider`; the scope is built at run time by
 * `features/canvas/host/canvasSurfaceScope.ts` from the canvas store.
 *
 * EVERY ITEM IS A REFERENCE (owner report 2026-10-03). An item is sent as a
 * labeled `resource_ref` to the record it shows — a published HTML page
 * (`html_page`) or a saved canvas artifact (`canvas_item`) — never as its tab
 * id or title alone. The server resolves the reference, so the agent reads the
 * body with `context`, and edits it through `canvas_item_content`, whose
 * handler (`features/canvas/host/canvasWriteHandlers.ts`) writes through the
 * record's own save path and refreshes the tab. Before this the agent said it
 * had "no read path" for an open HTML page.
 */

import type {
  SurfaceManifest,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@ai-matrx/chat/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";
import { CANVAS_SURFACE_NAME } from "./canvas.surface";

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
    name: "current_canvas_item",
    label: "Open item",
    description:
      'The record the primary pane shows, as a reference the server resolves: `{ __kind: "resource_ref", resource_type: "html_page" | "canvas_item", resource_id, label }`. Read its full body with the context tool on this key — a published HTML page reads as its complete document, a saved canvas artifact as its newest version. Change it with the `canvas_item_content` write target. Empty while the open item is session-only (never saved, so there is no record yet).',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "canvas_item",
    sortOrder: 300,
  },
  {
    name: "current_canvas_type",
    label: "Current canvas type",
    description:
      'Artifact type rendered in the primary pane — one of the `CanvasContentType` values (e.g. "mermaid", "table", "code", "quiz", "html", "chart", "flashcards", "working_document"). Absent while the focused tab is not an item (Agent context, Surface values) — the open items are still listed in `open_items`.',
    valueType: "string",
    alwaysAvailable: false,
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
      "True when the open item is a stored record (a published HTML page or a saved canvas artifact), so `current_canvas_item` references it and it can be read and edited; false while it is session-only. Always present.",
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
      "Structured `data` payload of a SESSION-ONLY open item (one with no record yet); its shape is type-specific. Empty whenever the item is a stored record — read that through `current_canvas_item` instead.",
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
      "Every item open on the canvas, as `{ title, type, is_current, item? }`. `item` is the same kind of reference as `current_canvas_item` (absent for a session-only item); each referenced item is also readable on its own through the context tool, and editable through `canvas_item_content` with `item` set to it. Always present and never empty while an item is open, even when the focused tab is not an item.",
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
    name: "secondary_canvas_item",
    label: "Second open item",
    description:
      "The record shown in the bottom pane while `is_split` is true, as the same kind of reference as `current_canvas_item`. Empty when the view is not split or the second item is session-only.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
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

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "canvas_item_content",
    label: "Open item content",
    description:
      'Changes the body of ANY open canvas item that is a stored record and SAVES it: a published HTML page is republished at its address immediately; a saved canvas artifact gets a new version. Its tab refreshes to show it. Name the item with `item`: its reference from `open_items[].item` or `current_canvas_item` ({"resource_type", "resource_id"}) — required when the item is not the one in focus (another tab, such as Agent context, may have focus). For a small change send ONLY the edit: {"command": "str_replace", "old_str": "<exact text now in the item, unique>", "new_str": "<replacement>"} — read the item first with the context tool. Send a whole new body as a plain string only for a genuine rewrite; for an HTML page that must be a complete document (doctype, head, body), never a fragment. A session-only item (no reference) cannot be changed.',
    valueType: "string",
    updatesValue: "current_canvas_item",
    patchable: true,
    approvalComparison: "text-replacement",
    mode: "entity",
    applyPolicy: "ask",
    group: "canvas_item",
    sortOrder: 100,
  },
];

export const canvasManifest: SurfaceManifest = {
  surfaceName: CANVAS_SURFACE_NAME,
  client: "matrx-user",
  executor: MATRX_WEB_APP_EXECUTOR,
  executionMode: "python-stream",
  description:
    "Visual canvas and diagram editors",
  // A pane beside every page, never the page: the page's own conversation
  // (the main /chat) receives the canvas too (`SurfaceManifest.companion`).
  companion: true,
  readiness: "partial",
  readinessNote:
    // access-errors: ok — internal readiness note about a removed editor's vocabulary, verified against the codebase; never rendered to a user as record state
    "Items are sent as references to their records (html_page / canvas_item) and edited through canvas_item_content (2026-10-03). Values re-authored against the live pane (2026-08-11) — the previous set declared diagram-node vocabulary (`selected_node_id`, `selected_nodes`, `current_text_block`) for an editor that does not exist in this codebase, and documented `render_mode` with an edit/preview enum it never had. Emitter: the canvas column (ShellCanvasColumn). Remaining: no `data-surface-value` anchors, and no live non-matching-name binding test.",
  label: "Canvas",
  intro: `<surface_intro>
The Canvas is a side pane that shows items opened from a chat or another page —
a published HTML page, a diagram, code, a table, a quiz, a document. Each open
item is a stored record or a session-only preview.

current_canvas_item is a REFERENCE to the record in the primary pane (an HTML
page or a saved canvas artifact), labeled with the name the person sees. Read
its full body with the context tool on that key before describing or changing
it — never answer from the title alone. open_items lists every tab; each one
with an item reference is readable the same way.

To change any open item, use apply_surface_write with canvas_item_content and
item set to that item's reference (from open_items or current_canvas_item —
the item need not be in focus): send a str_replace edit (or a whole new body
for a rewrite). The person approves the change, it saves, and its tab
refreshes. A session-only item (no reference) has no record to edit.
</surface_intro>`,
  groups,
  writeTargets,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

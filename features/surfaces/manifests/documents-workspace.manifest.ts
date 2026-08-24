/**
 * Surface manifest — Documents Workspace (`matrx-user/documents-workspace`).
 *
 * The multi-document SHELL (`DocumentsWorkspace`): a recent-docs rail plus a
 * tab strip, each tab an open working document or scratchpad. It is the chrome
 * that decides WHICH document you are looking at — mounted inside the floating
 * `workingDocumentWindow`, the chat context drawer, the run-controls panel and
 * the canvas. The SHELL is the surface, not any one of those hosts; it declares
 * `overlayId: "workingDocumentWindow"` because that floating window is its one
 * standalone host (and the one where inheriting the page underneath was most
 * visibly wrong), and because an overlayId is what tells manifest sync this
 * surface has NO route — without it the sync heuristic fabricates a
 * `/documents-workspace` url_pattern that leads nowhere.
 *
 * THE RECURSION (see `features/surfaces/FEATURE.md`): step INSIDE a tab and
 * you leave this surface — the editor is `matrx-user/working-document` /
 * `matrx-user/scratchpad`, whose context is the document's own parts. From out
 * here a document is a whole item in a list, so this surface's vocabulary is
 * the LIST: which documents are open, which one is active, what it is called.
 * An agent bound here organizes the workspace; an agent bound inside edits the
 * text. That is why this is not a third copy of the conversation-document
 * value set and does not inherit it.
 *
 * WHY IT NEEDED ONE AT ALL: the tab strip's `NonEditableContextMenu`
 * deliberately passed NO `surfaceName` — lying with an existing manifest
 * (whose `alwaysAvailable` values this shell cannot emit) would have tripped
 * the value-mapping guard — so it fell through to `detectActiveSurface()` and
 * answered with the page underneath, most visibly inside the floating window.
 *
 * Emitter: `DocumentsWorkspace` mounts `<SurfaceRuntimeProvider>` around the
 * whole shell and feeds the same values to the tab strip's menu.
 *
 * Curated groups (band 0-899):
 *   workspace_tabs     What is open and how the shell is laid out
 *   active_document    The tab currently on screen
 *   conversation_link  The conversation the workspace was opened for
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const DOCUMENTS_WORKSPACE_SURFACE_NAME = "matrx-user/documents-workspace";

const groups: SurfaceValueGroup[] = [
  {
    key: "workspace_tabs",
    label: "Open documents",
    sortOrder: 100,
    description:
      "Every document the workspace currently has open, and how the shell is laid out.",
  },
  {
    key: "active_document",
    label: "Active document",
    sortOrder: 200,
    description:
      "The tab on screen right now — which document it is and what it holds.",
  },
  {
    key: "conversation_link",
    label: "Conversation link",
    sortOrder: 300,
    description:
      "The conversation this workspace was opened for. A reference, never the conversation's own content.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "open_documents",
    label: "Open documents",
    description:
      'One entry per open tab, in tab order: `{ title, kind ("working" | "scratch"), document_id, closable }`. Always populated; `document_id` is null for a base tab whose durable row has not materialized yet.',
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 400,
    sortOrder: 300,
    group: "workspace_tabs",
  },
  {
    name: "open_document_count",
    label: "Open document count",
    description:
      "How many tabs are open. Always populated — at least one, since the conversation's own working document is a permanent tab.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 310,
    group: "workspace_tabs",
  },
  {
    name: "rail_open",
    label: "Document rail open",
    description:
      "Whether the recent-documents rail is expanded. Always populated. Layout state — useful to an agent that offers to show or hide the rail, not to one reasoning about content.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    autoContext: false,
    sortOrder: 320,
    group: "workspace_tabs",
  },
  {
    name: "active_document_title",
    label: "Active document title",
    description:
      'Display name of the tab on screen — the document\'s title, or its kind label ("Working document" / "Scratchpad") when it is untitled. Always populated.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 400,
    group: "active_document",
  },
  {
    name: "active_document_kind",
    label: "Active document kind",
    description:
      '"working" for a collaborative working document, "scratch" for a scratchpad. Always populated. Tells an agent which of the two document surfaces it would be stepping into.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 410,
    group: "active_document",
  },
  {
    name: "active_document_id",
    label: "Active document id",
    description:
      "UUID of the durable row behind the active tab. Empty when the document has not materialized yet (a base tab that has never been written to).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 420,
    group: "active_document",
  },
  {
    name: "active_document_scope",
    label: "Active document scope",
    description:
      'Slice scope the active tab reads from — the conversation id for a working document, or `sp:<id>` for a scratchpad. Always populated. Identifies the tab even before its durable row exists.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    autoContext: false,
    sortOrder: 430,
    group: "active_document",
  },
  {
    name: "active_document_content",
    label: "Active document body",
    description:
      "Markdown body of the tab on screen, read live at trigger time. Empty when the document is empty. Bindable rather than auto-shipped: from out here the document is an item in a list — an agent that should work ON the text belongs on the working-document or scratchpad surface.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 440,
    group: "active_document",
  },
  {
    name: "conversation_id",
    label: "Conversation ID",
    description:
      "UUID of the conversation this workspace was opened for — the conversation whose working document is the permanent first tab. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 500,
    group: "conversation_link",
  },
  {
    name: "active_scratchpad_id",
    label: "Active scratchpad id",
    description:
      "UUID of the user's one global active scratchpad, which is always offered as a base tab. Empty during the brief moment before it has resolved or been created.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 510,
    group: "conversation_link",
  },
];

export const documentsWorkspaceManifest: SurfaceManifest = {
  surfaceName: DOCUMENTS_WORKSPACE_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + emitter + tab-strip menu wiring shipped 2026-08-24; no agent is bound yet and the non-matching-name binding test has not been run.",
  overlayId: "workingDocumentWindow",
  label: "Documents Workspace",
  intro: `<surface_intro>
You are on the Documents Workspace — the shell that holds the user's open documents as tabs, with a rail of their other documents beside it. From out here a document is a whole item in a list, not text you are editing: open_documents is what is open, active_document_title / active_document_kind is the tab on screen, and active_document_content is its body if you were given it.
Two kinds live here. A working document is the collaborative artifact the user and the chat agent build together; a scratchpad is the user's own running notes, one active at a time.
The work here is about the SET: which document to open, what to call it, which ones belong to this conversation, what is missing, what duplicates what. Editing the text of one document happens inside that document, not here.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

/** Type-safe payload helper — required keys mirror `alwaysAvailable: true`. */
export function createDocumentsWorkspaceScope(values: {
  open_documents: Array<{
    title: string;
    kind: string;
    document_id: string | null;
    closable: boolean;
  }>;
  open_document_count: number;
  rail_open: boolean;
  active_document_title: string;
  active_document_kind: string;
  active_document_scope: string;
  conversation_id: string;
  active_document_id?: string;
  active_document_content?: string;
  active_scratchpad_id?: string;
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

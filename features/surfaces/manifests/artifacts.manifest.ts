/**
 * Surface manifest — Artifacts (`matrx-user/artifacts`).
 *
 * `/artifacts` (the Content Library: everything agents have produced) and
 * `/artifacts/[id]` (one artifact). An artifact is a durable, typed output of a
 * conversation — an HTML page, a diagram, a report, a deck — recorded in
 * `chat.artifact` against the message and conversation that produced it.
 *
 * Emitters (2026-09-25): `CmsArtifactList` (list route) and
 * `CmsArtifactDetail` (detail route) each mount `<SurfaceRuntimeProvider>`
 * around the canonical `NonEditableContextMenu`, building through
 * `features/artifacts/lib/artifacts-scope.ts`. Each route emits only its own
 * groups; the other route's values are absent, never empty.
 *
 * MEDIA DOCTRINE: this surface never emits an expiring signed URL, and
 * `thumbnail_url` is deliberately NOT declared for that reason. An artifact is
 * identified by its id. `artifact_external_url` is the page's own durable
 * public address (an HTML page's live site), not a signed asset link.
 *
 * Documented exclusions: the list's row-action affordances (open / edit /
 * archive / delete) are actions, not values; the side canvas's own content is
 * the canvas pane's, and only its identity (`open_canvas_item_id`) is emitted
 * here.
 *
 * Curated groups (band 0-899):
 *   listing    What the artifact list is showing
 *   artifact   The one artifact open
 *   origin     The conversation, message, organization and task behind it
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ARTIFACTS_SURFACE_NAME = "matrx-user/artifacts";

const groups: SurfaceValueGroup[] = [
  {
    key: "listing",
    label: "Artifact listing",
    sortOrder: 100,
    description: "What the artifact list is currently showing.",
  },
  {
    key: "artifact",
    label: "Open artifact",
    sortOrder: 200,
    description: "The single artifact open on the detail route.",
  },
  {
    key: "origin",
    label: "Origin",
    sortOrder: 300,
    description:
      "The conversation, message, organization and task behind the open artifact.",
  },
];

/** One row of the visible list, as the scope emits it. */
export interface ArtifactListRow {
  id: string;
  title: string | null;
  type: string;
  status: string;
  description: string | null;
  updated_at: string;
  conversation_id: string;
}

/** The open artifact as one object. */
export interface ArtifactSummary {
  id: string;
  title: string | null;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const surfaceSpecific: SurfaceValue[] = [
  // ── Listing (list route only) ──────────────────────────────────────────
  {
    name: "artifact_type_filter",
    label: "Type filter",
    description:
      'Artifact type the list is filtered to (e.g. "html_page", "flashcard_deck", "report"). Absent when the list shows every type, and on the detail route.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    sortOrder: 100,
    group: "listing",
  },
  {
    name: "artifact_status_filter",
    label: "Status filter",
    description:
      '"draft", "published", "archived", or "failed" when the list is narrowed to one status. Absent on the default Active view — which already HIDES archived artifacts — and on the detail route.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 110,
    group: "listing",
  },
  {
    name: "artifact_search_query",
    label: "Search query",
    description:
      "Text in the list's search box; it matches title and description. Absent when the box is empty, and on the detail route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 115,
    group: "listing",
  },
  {
    name: "visible_artifact_count",
    label: "Visible artifact count",
    description:
      "How many artifacts the list shows after its filters. 0 when loaded and nothing matches. Absent until the list has loaded, and on the detail route.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 120,
    group: "listing",
  },
  {
    name: "visible_artifacts",
    label: "Visible artifacts",
    description:
      "The rows the list shows, newest first, as { id, title, type, status, description, updated_at, conversation_id }. [] when loaded and nothing matches; absent until the list has loaded, and on the detail route. Bindable-only because a large library makes it big.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 130,
    group: "listing",
  },
  {
    name: "artifacts_load_status",
    label: "List load status",
    description:
      '{ status, error } for the library fetch — status is "idle", "loading", "succeeded" or "failed". Check it before treating an empty list as "no artifacts". Absent on the detail route.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 140,
    group: "listing",
  },
  {
    name: "open_canvas_item_id",
    label: "Canvas item open beside the list",
    description:
      "canvas_items id of the artifact open in the side canvas on the list route (the ?open= address). Absent when the canvas is closed, the item was never saved, or on the detail route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 150,
    group: "listing",
  },

  // ── Open artifact (detail route only) ─────────────────────────────────
  {
    name: "artifact_id",
    label: "Artifact ID",
    description:
      "UUID of the open artifact. Absent on the list route, and while the detail route is still resolving the id or showing an access gate. On the list route, a right-click on a row supplies it for that row.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 200,
    group: "artifact",
  },
  {
    name: "artifact_load_state",
    label: "Artifact load state",
    description:
      '"loading" while the detail route resolves its id, "ready" when an artifact is shown, "canvas_item" when the id is a readable canvas item that was never registered as an artifact, "gate" when the viewer cannot read it (denied, deleted, or never existed). Absent on the list route.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 205,
    group: "artifact",
  },
  {
    name: "artifact_title",
    label: "Artifact title",
    description:
      "Title of the open artifact. Absent when no artifact is open or it was never titled. On the list route, a right-click on a row supplies it for that row.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 210,
    group: "artifact",
  },
  {
    name: "artifact_description",
    label: "Artifact description",
    description:
      "Description of the open artifact. Absent when no artifact is open or it has none.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 240,
    sortOrder: 220,
    group: "artifact",
  },
  {
    name: "artifact_type",
    label: "Artifact type",
    description:
      'Type of the open artifact — "html_page", "flashcard_deck", "diagram", "report", … Absent when no artifact is open. Decides how it renders and what an agent can sensibly do with it. On the list route, a right-click on a row supplies it for that row.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    sortOrder: 230,
    group: "artifact",
  },
  {
    name: "artifact_status",
    label: "Artifact status",
    description:
      '"draft", "published", "archived", or "failed" for the open artifact. Absent when no artifact is open. A published artifact may be publicly visible — treat edits to it accordingly. On the list route, a right-click on a row supplies it for that row.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 240,
    group: "artifact",
  },
  {
    name: "artifact_summary",
    label: "Artifact summary",
    description:
      "Composite of the open artifact as one object: { id, title, type, status, created_at, updated_at }. Mirrors the individual artifact values. Absent when no artifact is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 260,
    sortOrder: 250,
    group: "artifact",
  },
  {
    name: "artifact_created_at",
    label: "Artifact created",
    description:
      "ISO timestamp the open artifact was created. Absent when no artifact is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    autoContext: false,
    sortOrder: 255,
    group: "artifact",
  },
  {
    name: "artifact_updated_at",
    label: "Artifact last updated",
    description:
      "ISO timestamp the open artifact was last updated. Absent when no artifact is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    autoContext: false,
    sortOrder: 256,
    group: "artifact",
  },
  {
    name: "artifact_external_url",
    label: "Live URL",
    description:
      "The artifact's own public address when it became a live page (an HTML page's site). A durable address, not a signed asset link. Absent when the artifact has none.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 260,
    group: "artifact",
  },
  {
    name: "artifact_external_id",
    label: "External record ID",
    description:
      "Id of the record the artifact became in another system — for an html_page, the html_pages row its editor opens. Absent when the artifact has none.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 262,
    group: "artifact",
  },
  {
    name: "artifact_external_system",
    label: "External system",
    description:
      "Name of the system that external record lives in. Absent when the artifact has no external record.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    autoContext: false,
    sortOrder: 264,
    group: "artifact",
  },
  {
    name: "artifact_canvas_item_id",
    label: "Canvas item ID",
    description:
      "canvas_items id holding the artifact's content, when it was materialized into the canvas. Absent for artifacts that live only in an external system.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 266,
    group: "artifact",
  },
  {
    name: "artifact_canvas_type",
    label: "Content renderer type",
    description:
      'The canvas type the content preview renders with (e.g. "diagram", "flashcards"). Absent until the content preview has loaded, or when the artifact has no canvas content.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    autoContext: false,
    sortOrder: 268,
    group: "artifact",
  },
  {
    name: "artifact_metadata",
    label: "Artifact metadata",
    description:
      "The artifact's free-form metadata object, exactly as the Metadata card shows it. Absent when no artifact is open or its metadata is empty.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    autoContext: false,
    sortOrder: 270,
    group: "artifact",
  },

  // ── Origin (detail route only) ─────────────────────────────────────────
  {
    name: "source_conversation_id",
    label: "Source conversation ID",
    description:
      "UUID of the conversation the open artifact was produced in. Absent when no artifact is open. The door back to how this artifact came to exist. On the list route, a right-click on a row supplies it for that row.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "origin",
  },
  {
    name: "source_message_id",
    label: "Source message ID",
    description:
      "UUID of the message the open artifact was produced by. Absent when no artifact is open. Bindable-only — resolvable from the artifact when needed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 310,
    group: "origin",
  },
  {
    name: "artifact_organization_id",
    label: "Organization ID",
    description:
      "UUID of the organization the open artifact belongs to. Absent when no artifact is open or it has no organization.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 320,
    group: "origin",
  },
  {
    name: "artifact_task_id",
    label: "Task ID",
    description:
      "UUID of the task the open artifact was produced for. Absent when no artifact is open or it was not produced for a task.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 330,
    group: "origin",
  },
];

export const artifactsManifest: SurfaceManifest = {
  surfaceName: ARTIFACTS_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitters wired 2026-09-25 on both routes (CmsArtifactList, CmsArtifactDetail) through features/artifacts/lib/artifacts-scope.ts, each inside the canonical NonEditableContextMenu; completeness pass redone from the components (vocabulary 11 -> 26 own values). Verified live in the Surface Context window: list 3/31 at the default view (4/31 with a search, filters appear when set), detail 14/31 on a data-table artifact including content from the preview, access-gate id reports artifact_load_state only; no undeclared keys; menu shows the Artifacts label. Not verified: no outside-helper binding has been exercised (non-matching-name + Matrx-vs-matrix), and no independent surface-check run.",
  label: "Artifacts",
  urlPattern: "/artifacts",
  intro: `<surface_intro>
You are on Artifacts (the Content Library): the durable, typed outputs agents have produced — HTML pages, flashcard decks, diagrams, reports — each recorded against the conversation and message that made it.
On the list route the Artifact listing group describes what is on screen: the type, status and search filters, the visible rows, and artifacts_load_status. Read the load status before concluding the library is empty. A right-click on a row supplies that row's artifact_id, title, type and status.
On the detail route the Open artifact group identifies one artifact (artifact_load_state says whether it is loaded, an unregistered canvas item, or behind an access gate), content carries what the preview renders, and the Origin group is the door back to the run that produced it.
artifact_status matters: a published artifact may already be visible to others, so an edit to it is not the same as an edit to a draft. Artifacts are referred to by id, never by an expiring URL.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

/** Type-safe payload helper. Every value here is route-conditional. */
export function createArtifactsScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  artifact_type_filter?: string;
  artifact_status_filter?: string;
  artifact_search_query?: string;
  visible_artifact_count?: number;
  visible_artifacts?: ArtifactListRow[];
  artifacts_load_status?: { status: string; error: string | null };
  open_canvas_item_id?: string;
  artifact_id?: string;
  artifact_load_state?: "loading" | "ready" | "canvas_item" | "gate";
  artifact_title?: string;
  artifact_description?: string;
  artifact_type?: string;
  artifact_status?: string;
  artifact_summary?: ArtifactSummary;
  artifact_created_at?: string;
  artifact_updated_at?: string;
  artifact_external_url?: string;
  artifact_external_id?: string;
  artifact_external_system?: string;
  artifact_canvas_item_id?: string;
  artifact_canvas_type?: string;
  artifact_metadata?: Record<string, unknown>;
  source_conversation_id?: string;
  source_message_id?: string;
  artifact_organization_id?: string;
  artifact_task_id?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

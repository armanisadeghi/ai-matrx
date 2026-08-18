/**
 * Surface manifest — Artifacts (`matrx-user/artifacts`).
 *
 * `/artifacts` (the list of everything agents have produced) and
 * `/artifacts/[id]` (one artifact). An artifact is a durable, typed output of a
 * conversation — an HTML page, a diagram, a report, a deck — recorded in
 * `cx_artifact` against the message and conversation that produced it.
 *
 * Declared 2026-08-17: a Tier-1 feature route family with no surface
 * declaration at all.
 *
 * MEDIA DOCTRINE: this surface never emits an expiring signed URL. An artifact
 * is identified by its id, and any thumbnail or asset is re-minted on read.
 *
 * Curated groups (band 0-899):
 *   listing    What the artifact list is showing
 *   artifact   The one artifact open
 *   origin     The conversation that produced it
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
    description: "The conversation and message that produced the open artifact.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "artifact_type_filter",
    label: "Type filter",
    description:
      'Artifact type the list is filtered to (e.g. "html_page", "diagram", "report"). Empty when the list shows every type, and on the detail route.',
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
      '"draft", "published", "archived", or "failed" when the list is filtered to one status. Empty when unfiltered, and on the detail route.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 110,
    group: "listing",
  },
  {
    name: "visible_artifact_count",
    label: "Visible artifact count",
    description:
      "How many artifacts the current page of the list is showing. Absent on the detail route.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 120,
    group: "listing",
  },
  {
    name: "artifact_id",
    label: "Artifact ID",
    description:
      "UUID of the open artifact. Empty on the list route, where no single artifact is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 200,
    group: "artifact",
  },
  {
    name: "artifact_title",
    label: "Artifact title",
    description:
      "Title of the open artifact. Empty when no artifact is open or the artifact was never titled.",
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
      "Description of the open artifact. Empty when no artifact is open or it has none.",
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
      'Type of the open artifact — "html_page", "flashcard_deck", "diagram", "report", … Empty when no artifact is open. Decides how it renders and what an agent can sensibly do with it.',
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
      '"draft", "published", "archived", or "failed" for the open artifact. Empty when no artifact is open. A published artifact may be publicly visible — treat edits to it accordingly.',
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
      "Composite of the open artifact as one object: { id, title, type, status, updated_at }. Mirrors the individual artifact values. Absent when no artifact is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 220,
    sortOrder: 250,
    group: "artifact",
  },
  {
    name: "source_conversation_id",
    label: "Source conversation ID",
    description:
      "UUID of the conversation the open artifact was produced in. Empty when no artifact is open. The door back to how this artifact came to exist.",
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
      "UUID of the message the open artifact was produced by. Empty when no artifact is open. Bindable-only — resolvable from the artifact when needed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 310,
    group: "origin",
  },
];

export const artifactsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/artifacts",
  readiness: "stub",
  readinessNote:
    "Vocabulary declared 2026-08-17 to close an undeclared Tier-1 route family (/artifacts and /artifacts/[id]). Not yet audited against the list and detail components, and no runtime emitter is wired.",
  label: "Artifacts",
  urlPattern: "/artifacts",
  intro: `<surface_intro>
You are on Artifacts: the durable, typed outputs agents have produced — HTML pages, diagrams, reports, decks — each recorded against the conversation and message that made it.
On the list route the Artifact listing group describes what is on screen. On the detail route the Open artifact group identifies one artifact and the Origin group is the door back to the run that produced it.
artifact_type decides what can sensibly be done with an artifact, and artifact_status matters: a published artifact may already be visible to others, so an edit to it is not the same as an edit to a draft.
Artifacts are referred to by id, never by a URL that could have expired.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** Type-safe payload helper. Every value here is route-conditional. */
export function createArtifactsScope(values: {
  selection?: string;
  context?: Record<string, unknown>;
  artifact_type_filter?: string;
  artifact_status_filter?: string;
  visible_artifact_count?: number;
  artifact_id?: string;
  artifact_title?: string;
  artifact_description?: string;
  artifact_type?: string;
  artifact_status?: string;
  artifact_summary?: {
    id: string;
    title: string | null;
    type: string;
    status: string;
    updated_at: string;
  };
  source_conversation_id?: string;
  source_message_id?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

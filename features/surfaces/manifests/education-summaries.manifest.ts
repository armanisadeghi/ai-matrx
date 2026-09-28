/**
 * Surface manifest — Study Summaries (`matrx-user/education-summaries`).
 *
 * The /education/summaries tool: a library of grounded study summaries the
 * Universal Ingest converter produces (an `education.study_media` row with
 * `media_kind = 'summary'` — markdown + key points + a Trust Envelope citing
 * the source material). There is no `/new` route by design — a summary is
 * produced by the ingest converter, never authored here — so this manifest is
 * VIEW-ONLY: no write targets. Before this manifest existed, both routes fell
 * through the `/education` prefix to the education hub surface, which
 * describes none of this page's content (page-pass wave 3, 2026-09-27).
 *
 * TWO views behind one surface, mirroring `education-mind-maps.manifest.ts`
 * (the sibling tool sharing the same `study_media` table):
 *
 *   list    /education/summaries       SummaryHome    — the library
 *   detail  /education/summaries/[id]  SummaryDetail  — one stored summary
 *
 * Curated groups (band 0-899):
 *
 *   summary_identity  Which view the learner is in — read this first
 *   library           The list view: every summary they can see
 *   record            The detail view: the loaded row and its content
 *   trust             The detail view: how grounded the stored summary is
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import type { SurfaceWriteTarget } from "@/features/surfaces/types";

const groups: SurfaceValueGroup[] = [
  {
    key: "summary_identity",
    label: "Summary view",
    sortOrder: 100,
    description:
      "Which of the tool's two views the learner is in (list / detail) — read this first, it decides which other groups are populated.",
  },
  {
    key: "library",
    label: "Summary library",
    sortOrder: 200,
    description:
      "The list view: every study summary the learner owns or has been shared, recent-first.",
  },
  {
    key: "record",
    label: "Open summary",
    sortOrder: 300,
    description:
      "The detail view: the loaded study_media row and its markdown + key points.",
  },
  {
    key: "trust",
    label: "Grounding",
    sortOrder: 400,
    description:
      "The detail view's trust envelope — how grounded the stored summary is in the learner's own material, and which passages it cites. Measured evidence, never writable.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Summary view ────────────────────────────────────────────────────────
  {
    name: "view",
    label: "Current view",
    description:
      'Which view of the tool the learner is in: "list" (the library) or "detail" (one stored summary open). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 100,
    group: "summary_identity",
  },

  // ── Library (list view only) ───────────────────────────────────────────
  {
    name: "summaries_loaded",
    label: "Library loaded",
    description:
      "True once the list view's query has finished; false while it is still loading. Absent outside the list view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 200,
    group: "library",
  },
  {
    name: "summary_count",
    label: "Summary count",
    description:
      "How many study summaries the learner can see. Zero for a learner with none yet. Absent outside the list view and until the query resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 210,
    group: "library",
  },
  {
    name: "summaries",
    label: "Study summaries",
    description:
      "Every summary on screen, recent-first, as { id, title, source_title, source_kind, status }. Empty array for a learner with none. Absent outside the list view. The list has client-side search only, so this is the whole library and not filtered by whatever the learner typed.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1400,
    sortOrder: 220,
    group: "library",
  },

  // ── Open summary (detail view only) ────────────────────────────────────
  {
    name: "summary_loading",
    label: "Summary loading",
    description:
      "True while the detail view is still fetching the row. Absent outside the detail view. When true, every other value in the Open summary and Grounding groups is absent.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "record",
  },
  {
    name: "summary_not_found",
    label: "Summary unavailable",
    description:
      // access-errors: ok — agent-facing value doc that names ALL of the zero-row possibilities without asserting one; not user-facing copy
      "True when the fetch finished and returned nothing — the summary does not exist, was deleted, or the learner has no access. Absent on the happy path and outside the detail view. Present so an agent addresses the real situation instead of describing an empty summary.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 310,
    group: "record",
  },
  {
    name: "summary_id",
    label: "Summary ID",
    description:
      "UUID of the open summary (its study_media row id). Absent outside the detail view and while the row is loading or unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
    group: "record",
  },
  {
    name: "summary_title",
    label: "Summary title",
    description:
      "Title of the open summary. Absent outside the detail view and while loading/unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 330,
    group: "record",
  },
  {
    name: "summary_source_title",
    label: "Source title",
    description:
      "Human title of the material this summary was written from (e.g. the uploaded PDF or note). Absent when the row has none, outside the detail view, and while loading/unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 340,
    group: "record",
  },
  {
    name: "summary_markdown",
    label: "Summary body",
    description:
      "The summary's full markdown body, as rendered. Absent when the row has no body yet, outside the detail view, and while loading/unavailable. Can be long — bindable-only; the learner already sees it rendered on screen.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 350,
    group: "record",
  },
  {
    name: "key_points",
    label: "Key points",
    description:
      "The summary's bulleted key points, in stored order — exactly what the Key points card on screen shows. Empty array when the row has none. Absent outside the detail view and while loading/unavailable.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 360,
    group: "record",
  },

  // ── Grounding (detail view only) ───────────────────────────────────────
  {
    name: "trust_confidence",
    label: "Confidence",
    description:
      'How grounded the open summary is in the learner\'s own material: "grounded" (every claim traces to a cited passage), "inferred" (reasoned but not directly stated), or "not_in_material". Absent when the row carries no trust envelope, outside the detail view, and while loading/unavailable. MEASURED EVIDENCE — read it, never assert a different one.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9,
    sortOrder: 400,
    group: "trust",
  },
  {
    name: "trust_grounded_in",
    label: "Grounded in",
    description:
      "Label of the corpus the open summary was grounded against (usually the source's title). Absent when the envelope does not name one, outside the detail view, and while loading/unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 45,
    sortOrder: 410,
    group: "trust",
  },
  {
    name: "trust_citation_count",
    label: "Citation count",
    description:
      "How many source passages the open summary cites. Absent when the row carries no trust envelope, outside the detail view, and while loading/unavailable.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 420,
    group: "trust",
  },
  {
    name: "trust_citations",
    label: "Source citations",
    description:
      "The passages the open summary is grounded in, as { sourceId, sourceKind, title, excerpt }. Empty when ungrounded. Absent under the same conditions as trust_citation_count. Carries verbatim source text and can be large — bindable-only; bind trust_citation_count / trust_confidence for automatic context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 430,
    group: "trust",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  { name: "create_summaries", label: "Create summaries", description: "Creates and saves 1-25 manually authored study summaries. Value is a JSON ARRAY of objects, each { title: string, summary_markdown: string, key_points: string[] }. Each summary needs a non-empty title and markdown body plus 3 to 8 concise key points. The registered study_summary kind is written automatically. Manual summaries have no generated grounding claim. The person approves before creation.", valueType: "array", updatesValue: "summaries", mode: "entity", applyPolicy: "ask", group: "library", sortOrder: 100 },
  { name: "update_summaries", label: "Update summaries", description: "Changes 1-25 saved summaries. Value is a JSON ARRAY of { id: string, title?: string, summary_markdown?: string, key_points?: string[] }; only supplied fields change. The id must be from summaries. A content edit retains source and citation evidence but is marked inferred so edited prose is never presented as authoritative grounding. The person approves before saving.", valueType: "array", updatesValue: "summaries", mode: "entity", applyPolicy: "ask", group: "library", sortOrder: 110 },
  { name: "delete_summaries", label: "Delete summaries", description: "Deletes 1-25 summaries from the library. Value is a JSON ARRAY of ids or { id } values from summaries. A deleted summary is no longer available through this page. The person approves every deletion.", valueType: "array", updatesValue: "summaries", mode: "entity", applyPolicy: "ask", group: "library", sortOrder: 120 },
];

export const educationSummariesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-summaries",
  client: "matrx-user",
  executionMode: "python-stream",
  description: "Create, edit, and view study summaries (/education/summaries).",
  readiness: "partial",
  readinessNote:
    "Manifest + emitters for list, detail, and editor views. Summary collection CRUD follows the canonical study_media service; edits preserve source lineage and downgrade rendered grounding to inferred. Not yet stamped verified: no `data-surface-value` Locate anchors or representative agent run.",
  label: "Study Summaries",
  urlPattern: "/education/summaries",
  intro: `<surface_intro>
You are on the Study Summaries tool at /education/summaries. It is a library of grounded summaries the Universal Ingest converter produces from a learner's own material — markdown plus key points, each citing the source it was written from.

Read \`view\` first; it decides which groups are populated.

In "list" the learner is browsing their library: summaries is the whole set, recent-first (the visible search box filters client-side only, so this is the full library regardless of what they typed).

In "detail" one stored summary is open: summary_markdown is its body and key_points its bullets. Use create_summaries, update_summaries, and delete_summaries for approved collection changes; do not use generic database tools. Content edits preserve source and citation evidence but are marked inferred, because a manual rewrite cannot retain the generator's authoritative grounding claim.

Everything in the Grounding group — confidence, citations, what the summary was grounded in — is MEASURED EVIDENCE from the generation that produced it. Reason from it and explain it; you cannot write it, and you should not talk as though it can be adjusted.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One entry of `summaries` (the list view's library). */
export interface SummaryListSummary {
  id: string;
  title: string;
  source_title: string | null;
  source_kind: string | null;
  status: string;
}

/** One entry of `trust_citations`. */
export interface SummaryCitationSummary {
  sourceId: string;
  sourceKind: string;
  title: string | null;
  excerpt: string | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`. Each
 * of the two emitters passes only the keys its view actually has.
 */
export function createEducationSummariesScope(values: {
  // alwaysAvailable: true → required
  view: "list" | "detail" | "new";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  // library (list view)
  summaries_loaded?: boolean;
  summary_count?: number;
  summaries?: SummaryListSummary[];
  // record (detail view)
  summary_loading?: boolean;
  summary_not_found?: boolean;
  summary_id?: string;
  summary_title?: string;
  summary_source_title?: string;
  summary_markdown?: string;
  key_points?: string[];
  // trust (detail view)
  trust_confidence?: string;
  trust_grounded_in?: string;
  trust_citation_count?: number;
  trust_citations?: SummaryCitationSummary[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

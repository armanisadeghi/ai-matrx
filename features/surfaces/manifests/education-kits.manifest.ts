/**
 * Surface manifest — Study Kits (`matrx-user/education-kits`).
 *
 * A study kit is one piece of the learner's material plus every study aid made
 * from it (flashcards, summary, quiz, practice test, mind map, memory aids,
 * notes, audio). The kit has no table: its id IS the source material's id and
 * its members are the material's incoming `source` edges
 * (`features/education/kits/FEATURE.md`). Before this manifest existed both
 * routes fell through the `/education` prefix to the generic education hub
 * surface, which describes none of this (fleet wave, 2026-09-27).
 *
 * TWO views behind one surface, mirroring `education-summaries.manifest.ts`:
 *
 *   list    /education/kits             KitsHome — every kit the learner has
 *   detail  /education/kits/[sourceId]  KitHub   — one kit and its study path
 *
 * Creation stays with the existing ingest flow at `/education/start`: a kit has
 * no independent row. This surface owns the association-backed rename and
 * delete writes; Make more remains the canonical generation door.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_KITS_SURFACE_NAME = "matrx-user/education-kits";

const groups: SurfaceValueGroup[] = [
  {
    key: "kit_view",
    label: "Kit view",
    sortOrder: 100,
    description:
      "Which of the two views the learner is in (list / detail) — read first; it decides which other groups are populated.",
  },
  {
    key: "kit_library",
    label: "All kits",
    sortOrder: 200,
    description: "The list view: every study kit the learner has.",
  },
  {
    key: "open_kit",
    label: "Open kit",
    sortOrder: 300,
    description:
      "The detail view: the kit, its study aids in study-path order, and each aid's real practice evidence.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "view",
    label: "Current view",
    description:
      'Which view the learner is in: "list" (every kit) or "detail" (one kit open). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 100,
    group: "kit_view",
  },

  // ── All kits (list view) ───────────────────────────────────────────────
  {
    name: "kits_loaded",
    label: "Kits loaded",
    description:
      "True once the kit list has loaded (or failed); false while it is still loading. Absent outside the list view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 200,
    group: "kit_library",
  },
  {
    name: "kits_error",
    label: "Kit list error",
    description:
      "Why the kit list could not load, as shown on the page. Absent when it loaded and outside the list view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 205,
    group: "kit_library",
  },
  {
    name: "kit_count",
    label: "Kit count",
    description:
      "How many study kits the learner has. Absent outside the list view and until the list loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 210,
    group: "kit_library",
  },
  {
    name: "kits",
    label: "Study kits",
    description:
      'Every kit, newest first, as { source_id, source_type, title, href, artifact_count, formats } — formats lists the kinds of study aid in it ("deck", "summary", "quiz", "practice_test", "mind_map", "memory_aid", "notes", "audio"). This is the whole list, not filtered by the search box. Empty array for a learner with none. Absent outside the list view and until the list loads.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 220,
    group: "kit_library",
  },
  {
    name: "kit_search",
    label: "Kit search",
    description:
      "What the learner typed into the kit search box; empty string when nothing. Present in the list view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 230,
    group: "kit_library",
  },

  // ── Open kit (detail view) ─────────────────────────────────────────────
  {
    name: "kit_status",
    label: "Kit status",
    description:
      '"loading", "ready", "empty" (nothing has been made from this material yet, or it is not the learner\'s), or "error" (the read failed; the page offers Try again). Present in the detail view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    sortOrder: 300,
    group: "open_kit",
  },
  {
    name: "kit_source_id",
    label: "Kit id",
    description:
      "The kit's id — the id of the source material everything was made from (from the page address). Present in the detail view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "open_kit",
  },
  {
    name: "kit_source_type",
    label: "Material type",
    description:
      'The kind of record the material is ("file" for every uploaded kit). Present in the detail view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 320,
    group: "open_kit",
  },
  {
    name: "kit_title",
    label: "Kit title",
    description:
      "The kit's name (the material's title). Absent unless kit_status is \"ready\".",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 330,
    group: "open_kit",
  },
  {
    name: "kit_created_at",
    label: "Kit created",
    description:
      "When the kit was first generated (ISO timestamp). Absent unless kit_status is \"ready\".",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 340,
    group: "open_kit",
  },
  {
    name: "kit_membership_fingerprint",
    label: "Kit membership revision",
    description: "Token for the open kit's current membership edges. Send it as expected_membership_fingerprint for update_kits or delete_kits; stale membership is refused before any write.",
    valueType: "string", alwaysAvailable: false, typicalCharCount: 220, sortOrder: 345, group: "open_kit",
  },
  {
    name: "study_aids",
    label: "Study aids",
    description:
      'Every study aid in the kit, in the page\'s study-path order (Understand it: summary, notes, mind map; Make it stick: deck, memory aid, audio; Prove you know it: quiz, practice test), as { kind, title, artifact_type, artifact_id, href, item_count, studied_count, accuracy_pct, due_count, last_studied_at, duration_seconds }. The practice fields are null/0 while progress loads or when it is unavailable. Absent unless kit_status is "ready".',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 350,
    group: "open_kit",
  },
  {
    name: "kit_totals",
    label: "Kit totals",
    description:
      'The kit\'s headline numbers as { study_aids, practice_items, practiced, due_now } — what the "Your study path" chips show. practice_items / practiced / due_now are absent while progress loads. Absent unless kit_status is "ready".',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 360,
    group: "open_kit",
  },
  {
    name: "progress_status",
    label: "Progress status",
    description:
      '"loading", "ready" or "unavailable" (the practice read failed — the page says progress is unavailable). Absent unless kit_status is "ready".',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 11,
    sortOrder: 370,
    group: "open_kit",
  },
  {
    name: "next_challenge",
    label: "Next challenge",
    description:
      'The study aid the page recommends next as { kind, title, href, reason } — reason is "due" (it has items due), "not_started" (a tracked aid never practiced) or "first" (nothing else to recommend). Absent unless kit_status is "ready".',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 380,
    group: "open_kit",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "update_kits", label: "Rename study kits",
    description: "Renames existing kits. Value is an ARRAY of { source_type: string, source_id: string, expected_membership_fingerprint: string, title: string }. Identity and fingerprint must be current. Stale membership is refused before any edge changes. The person approves before saving.",
    valueType: "array", updatesValue: "kits", mode: "entity", applyPolicy: "ask", group: "kit_library", sortOrder: 100,
  },
  {
    name: "delete_kits", label: "Delete study kits",
    description: "Deletes kit groupings. Value is an ARRAY of { source_type: string, source_id: string, expected_membership_fingerprint: string }. Stale membership is refused before any edge changes. It removes only generated-artifact membership edges. The source material and every study aid remain saved and openable. The person approves every request.",
    valueType: "array", updatesValue: "kits", mode: "entity", applyPolicy: "ask", group: "kit_library", sortOrder: 110,
  },
];

export const educationKitsManifest: SurfaceManifest = {
  surfaceName: EDUCATION_KITS_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Study kits: every kit, and one kit's study aids with their practice progress (/education/kits).",
  readiness: "partial",
  readinessNote:
    "Manifest + emitters for both views (list / detail), with association-backed rename and delete. Not yet stamped verified: no data-surface-value Locate anchors; no canonical v3 context menu.",
  label: "Study Kits",
  urlPattern: "/education/kits",
  intro: `<surface_intro>
You are on Study Kits at /education/kits. A study kit is one piece of the learner's material (usually an uploaded file) plus every study aid made from it — flashcards, a summary, a quiz, a practice test, a mind map, memory aids, notes, audio.

Read \`view\` first. In "list" the learner is choosing a kit: kits is every kit they have. In "detail" one kit is open: study_aids lists its aids along the page's study path (understand, make it stick, prove it), each with its real practice evidence, kit_totals the headline numbers, and next_challenge what the page suggests doing next.

Progress numbers are measured from the learner's actual practice; explain them, never invent them. A kit has no independent record: create one through the existing /education/start material workflow. On an open kit, update_kits renames the grouping and delete_kits removes the grouping only; it never deletes source material or study aids. New aids come from Make more, which runs the generator on the same material.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

export interface KitListEntry {
  source_id: string;
  source_type: string;
  title: string;
  membership_fingerprint: string;
  href: string;
  artifact_count: number;
  formats: string[];
}

export interface KitStudyAidEntry {
  kind: string | null;
  title: string;
  artifact_type: string;
  artifact_id: string;
  href: string;
  item_count: number | null;
  studied_count: number;
  accuracy_pct: number | null;
  due_count: number;
  last_studied_at: string | null;
  duration_seconds: number | null;
}

/**
 * Type-safe payload helper. Required keys mirror `alwaysAvailable: true`;
 * optional keys mirror `alwaysAvailable: false`. Each emitter passes only the
 * keys its view has.
 */
export function createEducationKitsScope(values: {
  view: "list" | "detail";
  selection?: string;
  context?: Record<string, unknown>;
  kits_loaded?: boolean;
  kits_error?: string;
  kit_count?: number;
  kits?: KitListEntry[];
  kit_search?: string;
  kit_status?: "loading" | "ready" | "empty" | "error";
  kit_source_id?: string;
  kit_source_type?: string;
  kit_title?: string;
  kit_membership_fingerprint?: string;
  kit_created_at?: string;
  study_aids?: KitStudyAidEntry[];
  kit_totals?: {
    study_aids: number;
    practice_items?: number;
    practiced?: number;
    due_now?: number;
  };
  progress_status?: "loading" | "ready" | "unavailable";
  next_challenge?: {
    kind: string | null;
    title: string;
    href: string;
    reason: "due" | "not_started" | "first";
  };
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}

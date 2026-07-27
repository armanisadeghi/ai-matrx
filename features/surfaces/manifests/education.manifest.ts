/**
 * Surface manifest — Education Hub (`matrx-user/education`).
 *
 * The `/education` home: the study platform's front door. Two layers live on
 * one page — a server-rendered discovery/marketing layer (the five discovery
 * axes + the data-driven study-tool registry + the free/open entry points) and,
 * for a signed-in learner, the "Study today" snapshot that reads across the
 * whole study spine (today's plan blocks, FSRS-due reviews, weak areas, goal
 * urgency, streak).
 *
 * Curated groups (band 0-899):
 *
 *   learner_snapshot  What the learner should study next, and why (authed only)
 *   discovery         The axes + tool registries the hub routes users through
 *   entry_points      The canonical hub destinations (create kit, library, ...)
 *
 * Emitter: `features/education/components/landing/EducationHubSurface.tsx`
 * (a client island mounted by the server `EducationHub`). The learner snapshot
 * is published to the module store in
 * `features/education/study/dashboard/studyTodaySnapshot.ts` by
 * `StudyTodayCard` — the component that already loads it — so the surface never
 * re-fetches the spine.
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
    key: "learner_snapshot",
    label: "Study today",
    sortOrder: 100,
    description:
      "The signed-in learner's live study signal: plan blocks for today, due reviews, weak areas, goal urgency, and streak. Absent for anonymous or brand-new users.",
  },
  {
    key: "discovery",
    label: "Discovery",
    sortOrder: 200,
    description:
      "The registries the hub routes users through — the five discovery axes and every registered study tool with its live/coming-soon status.",
  },
  {
    key: "entry_points",
    label: "Entry points",
    sortOrder: 300,
    description:
      "Canonical hub destinations an agent can send the learner to (create a study kit, community library, study guides, planner, progress).",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Learner snapshot (authed; loads asynchronously) ───────────────────
  {
    name: "study_snapshot_available",
    label: "Study snapshot loaded",
    description:
      "True once the authenticated study snapshot has finished loading AND the learner has any study signal at all (a plan, a streak, goals, or due items). False for anonymous visitors, brand-new users, and while the snapshot is still in flight — in which case every other value in this group is absent.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "learner_snapshot",
  },
  {
    name: "has_active_plan",
    label: "Has an active study plan",
    description:
      "True when the learner has an active study plan. Absent until `study_snapshot_available` is true.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 310,
    group: "learner_snapshot",
  },
  {
    name: "is_rest_day",
    label: "Today is a rest day",
    description:
      "True when the active plan marks today as a protected recovery day (so the learner should NOT be pushed to study). Absent until the snapshot loads.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 320,
    group: "learner_snapshot",
  },
  {
    name: "study_streak_days",
    label: "Current study streak",
    description:
      "Number of consecutive days the learner has studied in ANY mode (flashcards, fast fire, quizzes…), from the study-spine streak row. Zero when the streak is broken. Absent until the snapshot loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 330,
    group: "learner_snapshot",
  },
  {
    name: "next_actions",
    label: "Next study actions",
    description:
      "The prioritized 'what to study next' list shown on the hub (max 4), each entry { key, label, why, minutes, href }. Empty array when the learner is fully caught up or it is a rest day. Absent until the snapshot loads.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 340,
    group: "learner_snapshot",
  },
  {
    name: "next_actions_total_minutes",
    label: "Estimated minutes today",
    description:
      "Sum of the time estimates across `next_actions`. Zero when no action carries an estimate. Absent until the snapshot loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 350,
    group: "learner_snapshot",
  },
  {
    name: "study_snapshot",
    label: "Study snapshot",
    description:
      "Composite of this group as one object: { has_active_plan, is_rest_day, streak_days, next_actions, total_minutes }. Mirrors the individual values (completeness law). Absent until the snapshot loads. Bindable-only — bind the individual values for automatic context.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 360,
    group: "learner_snapshot",
  },

  // ── Discovery registries (static; always emitted) ─────────────────────
  {
    name: "discovery_axes",
    label: "Discovery axes",
    description:
      "The five ways into the hub, in nav order: one entry per axis { id, label, segment, blurb, href } (subjects, levels, exam-prep, study-aids, features). Always populated — it is a static registry, never empty.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 700,
    sortOrder: 400,
    group: "discovery",
  },
  {
    name: "study_tools",
    label: "Study tools",
    description:
      "Every registered study tool as shown in the hub's 'Study tools' section, live-then-featured-first: { slug, name, tagline, status, access_tier, featured, href }. Always populated from the tool registry. This is the routing table for 'which tool should I send the learner to'.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2600,
    sortOrder: 410,
    group: "discovery",
  },
  {
    name: "live_tool_slugs",
    label: "Live tool slugs",
    description:
      "Slugs of the tools whose registry status is `live` (i.e. actually usable today), in the same order as `study_tools`. Always populated — the cheap subset of `study_tools` for routing decisions.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 420,
    group: "discovery",
  },

  // ── Entry points ──────────────────────────────────────────────────────
  {
    name: "entry_points",
    label: "Hub entry points",
    description:
      "The hub's canonical destinations as one object of paths: { create_kit, library, learn, planner, progress, workspace, hub }. Always populated — derived from the hub's constants, so an agent never hand-builds an education URL.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 260,
    sortOrder: 500,
    group: "entry_points",
  },
];

export const educationManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter shipped and complete for the hub's own data (discovery registries, entry points, and the Study-today snapshot published by StudyTodayCard). Not yet stamped verified: the DB sync + a live non-matching-name binding test and the Matrx-vs-matrix context check have not been run, and no agent roles are declared yet.",
  label: "Education Hub",
  urlPattern: "/education",
  intro: `<surface_intro>
You are on the Education Hub — the front door of the AI study platform at /education. It is two layers on one page. The discovery layer is public and static: five discovery axes (subjects, levels, exam prep, study aids, features) and the registry of study tools (flashcards, FastFire, tutor, quizzes, practice tests, audio study, mind maps, memory, notes, planner, spoken practice, grade work, game). The learner layer appears only for a signed-in learner with study history: the "Study today" snapshot computed across the whole study spine.
Read the values in tiers. Check study_snapshot_available FIRST — when it is false the visitor is anonymous or brand new, so speak in terms of getting started (entry_points.create_kit) and never reference a plan, streak, or due items. When it is true, next_actions is the prioritized answer to "what should I study next and why", each entry already carrying its own justification and deep link; respect is_rest_day, which means the plan deliberately protects today for recovery — do not push the learner to study.
Use study_tools and live_tool_slugs to route: only recommend a tool whose status is live, and send the learner via its href. Use entry_points rather than constructing an /education URL yourself.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** One entry in `next_actions`. */
export interface EducationNextAction {
  key: string;
  label: string;
  why: string;
  minutes: number | null;
  href: string | null;
}

/** One entry in `discovery_axes`. */
export interface EducationAxisSummary {
  id: string;
  label: string;
  segment: string;
  blurb: string;
  href: string;
}

/** One entry in `study_tools`. */
export interface EducationToolSummary {
  slug: string;
  name: string;
  tagline: string;
  status: string;
  access_tier: string;
  featured: boolean;
  href: string;
}

/** The hub's canonical destinations. */
export interface EducationEntryPoints {
  hub: string;
  create_kit: string;
  library: string;
  learn: string;
  planner: string;
  progress: string;
  workspace: string;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationScope(values: {
  // alwaysAvailable: true → required
  study_snapshot_available: boolean;
  discovery_axes: EducationAxisSummary[];
  study_tools: EducationToolSummary[];
  live_tool_slugs: string[];
  entry_points: EducationEntryPoints;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  has_active_plan?: boolean;
  is_rest_day?: boolean;
  study_streak_days?: number;
  next_actions?: EducationNextAction[];
  next_actions_total_minutes?: number;
  study_snapshot?: {
    has_active_plan: boolean;
    is_rest_day: boolean;
    streak_days: number;
    next_actions: EducationNextAction[];
    total_minutes: number;
  };
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

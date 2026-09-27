/**
 * Surface manifest — Study Hub home (`matrx-user/education-overview`).
 *
 * `/education/overview`: the signed-in learner's education workspace (a
 * signed-in visit to `/education` redirects here). It is a DASHBOARD: one
 * snapshot of what the learner owns, read once per visit
 * (`features/education/home/snapshot.ts`), ranked into blocks — Start here
 * (empty account only), Study today, Your study kits, Waiting for you (due /
 * weak per mode), Recently created — under a row of study tools with the
 * learner's count per tool.
 *
 * Before this surface existed the page fell through to the public hub surface
 * (`matrx-user/education`), which declares the discovery registry and the
 * Study-today snapshot but none of the library counts, recent items, kits,
 * due-by-mode counts or goals this page shows.
 *
 * Each value comes from one snapshot LANE (library, kits, plan, mastery,
 * goals, streak). A lane that failed to load omits its values (the page hides
 * those counts too and shows a retry notice), so a failure is never reported
 * as an empty account. `unavailable_sections` names the failed lanes.
 *
 * READ-ONLY, deliberately: the page has no create, edit or choice of its own.
 * Every action on it is a link to another page, and the row menu on a recent
 * item is the Education Library's menu (that page's surface owns those
 * writes). An agent helps here by reading and routing.
 *
 * Emitter: `features/education/home/EducationHome.tsx` via the pure builder
 * `features/education/home/overviewSurfaceScope.ts`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_OVERVIEW_SURFACE_NAME = "matrx-user/education-overview";

const groups: SurfaceValueGroup[] = [
  {
    key: "status",
    label: "Page status",
    sortOrder: 100,
    description: "Whether the dashboard has loaded, which sections failed, and which blocks are on screen.",
  },
  {
    key: "study_today",
    label: "Study today",
    sortOrder: 200,
    description: "The learner's plan, streak, goals, what is due, and the ranked next actions.",
  },
  {
    key: "material",
    label: "Your material",
    sortOrder: 300,
    description: "What the learner owns: library counts per tool, the newest items, and study kits.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Status ──────────────────────────────────────────────────────────────
  {
    name: "dashboard_state",
    label: "Dashboard state",
    description:
      '"loading" until the snapshot arrives (every other value is then absent), "ready" when every section loaded, "partial" when some failed (see unavailable_sections; their values are absent, never zero). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 100,
    group: "status",
  },
  {
    name: "unavailable_sections",
    label: "Sections that failed to load",
    description:
      'Sections that could not load, from "library", "kits", "plan", "mastery", "goals", "streak". The page shows a Retry notice for them. Empty array when all loaded; absent while loading.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 110,
    group: "status",
  },
  {
    name: "visible_blocks",
    label: "Blocks on screen",
    description:
      'The dashboard blocks shown, in the page\'s ranking order, from "start-here" (only for an empty account: the Create a study kit hero plus three doors), "study-today", "kits", "due-by-mode", "recent". Absent while loading.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 120,
    group: "status",
  },

  // ── Study today ─────────────────────────────────────────────────────────
  {
    name: "active_plan",
    label: "Active study plan",
    description:
      "The learner's active study plan as { id, title, start_date, end_date, daily_minutes }, or null when they have none. Absent when the plan section is loading or failed.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 200,
    group: "study_today",
  },
  {
    name: "is_rest_day",
    label: "Today is a rest day",
    description:
      "True when the active plan protects today for recovery — do not push the learner to study. Absent when the plan section is loading or failed.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 210,
    group: "study_today",
  },
  {
    name: "today_plan_block_count",
    label: "Plan blocks pending today",
    description:
      "How many of today's plan blocks are still pending (0 on a rest day or with no plan). Absent when the plan section is loading or failed.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 215,
    group: "study_today",
  },
  {
    name: "study_streak_days",
    label: "Study streak",
    description:
      "Consecutive days the learner has studied in any mode; 0 when broken. Absent when the streak section is loading or failed.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 220,
    group: "study_today",
  },
  {
    name: "total_due",
    label: "Items due",
    description:
      "Items due for review now, across every study mode. Absent when the mastery section is loading or failed.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 230,
    group: "study_today",
  },
  {
    name: "total_weak",
    label: "Weak items",
    description:
      "Studied items that are weak right now, across every study mode. Absent when the mastery section is loading or failed.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 235,
    group: "study_today",
  },
  {
    name: "has_studied",
    label: "Has studied before",
    description:
      "True once the learner has recorded any study attempt. Absent when the mastery section is loading or failed.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 240,
    group: "study_today",
  },
  {
    name: "due_by_mode",
    label: "Waiting for you, by mode",
    description:
      'Due and weak counts per study mode, only modes with something waiting, busiest first, as [{ label, due, weak }] (e.g. { label: "Flashcards", due: 32, weak: 43 }). The "Waiting for you" block shows these once due + weak reaches 5. Empty array when nothing waits; absent when the mastery section is loading or failed.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 250,
    group: "study_today",
  },
  {
    name: "active_goals",
    label: "Active goals",
    description:
      "The learner's active study goals as [{ id, title, target_date }] (target_date YYYY-MM-DD or null). Empty array when none; absent when the goals section is loading or failed.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 260,
    group: "study_today",
  },
  {
    name: "next_actions_brief",
    label: "Next actions",
    description:
      "The Study today list, as shown, max 4, as [{ id, title }] — title is the line the page shows, with its \"(~N min)\" estimate when it has one. The plan's pending blocks first; with none, due then weak reviews per mode; plus a goal within 30 days. Full detail (reason, minutes, link) is next_actions. Empty array when caught up or resting; absent until the plan, mastery and goals sections all loaded.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 250,
    inlineUpTo: 1500,
    sortOrder: 270,
    group: "study_today",
  },
  {
    name: "next_actions",
    label: "Next actions (detail)",
    description:
      "The same list as next_actions_brief with everything the page shows: [{ id, title, why, minutes, href }]. minutes and href may be null. Absent exactly when next_actions_brief is absent.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 275,
    group: "study_today",
  },
  {
    name: "next_actions_total_minutes",
    label: "Estimated minutes today",
    description:
      "Sum of the next actions' minute estimates (the \"~N min\" badge). Absent exactly when next_actions is absent.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 280,
    group: "study_today",
  },

  // ── Material ────────────────────────────────────────────────────────────
  {
    name: "library_total",
    label: "Library items",
    description:
      "How many study items the learner owns in the Education Library (all kinds). Absent when the library section is loading or failed.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 300,
    group: "material",
  },
  {
    name: "owned_counts",
    label: "How much they own",
    description:
      'The counts in the tool row as one object, tool slug → count, only tools that show a count (e.g. { "flashcards": 185, "summaries": 39, "kits": 21 }). A tool whose section failed is left out. Absent while loading.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 170,
    sortOrder: 305,
    group: "material",
  },
  {
    name: "tool_counts",
    label: "Study tools with counts",
    description:
      'The tool row at the top of the page, in its order, as [{ slug, label, count, href, coming_soon }]. count is how many of that thing the learner owns (flashcards, quizzes, practice-tests, audio-study, mind-maps, memory, summaries, notes, kits); it is null for tools without a count and for tools whose section failed. Absent while loading.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1400,
    sortOrder: 310,
    group: "material",
  },
  {
    name: "recent_items",
    label: "Recently created",
    description:
      "The newest items in the Recently created block, max 5, as [{ id, title }]. Full rows are recent_items_detail. Empty array when the learner owns none; absent when the library section is loading or failed.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 350,
    inlineUpTo: 1500,
    sortOrder: 320,
    group: "material",
  },
  {
    name: "recent_items_detail",
    label: "Recently created (detail)",
    description:
      'Every row the Recently created block loaded (up to 8, newest first), as [{ id, title, kind, subtype, item_count, due_count, accuracy_pct, last_studied_at, updated_at, href }]. kind is "fc_set", "assessment", "study_media" or "note". The block\'s own search box can hide rows; this is the full loaded list. Absent exactly when recent_items is absent.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    sortOrder: 325,
    group: "material",
  },
  {
    name: "kit_total",
    label: "Study kits",
    description:
      "How many study kits the learner has (a kit = everything made from one piece of their material). Absent when the kits section is loading or failed.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 330,
    group: "material",
  },
  {
    name: "recent_kits",
    label: "Your study kits",
    description:
      "The newest kits in the Your study kits block, max 5, as [{ id, title }]. Full detail is kits_detail. Empty array when none; absent when the kits section is loading or failed.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    inlineUpTo: 1500,
    sortOrder: 340,
    group: "material",
  },
  {
    name: "kits_detail",
    label: "Your study kits (detail)",
    description:
      'Every kit card the block shows (up to 6, newest first), as [{ id, title, created_at, href, formats, missing_formats, item_count }]. formats are the study aids in the kit (e.g. "deck", "summary", "quiz"); missing_formats are the "Not in this kit yet" chips. Absent exactly when recent_kits is absent.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 345,
    group: "material",
  },
];

export const educationOverviewManifest: SurfaceManifest = {
  surfaceName: EDUCATION_OVERVIEW_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Study Hub home: the learner's dashboard — plan, streak, goals, due work, next actions, library counts, recent items and study kits (/education/overview). Read-only.",
  readiness: "partial",
  readinessNote:
    "Emitter shipped 2026-09-27. Read-only by design (every action is a link; recent-item row menus belong to the Library surface). Not yet proven: no outside-helper binding test; the Recently created table's own search box does not report which rows it hides (MatrxDataTable gap).",
  label: "Study Hub home",
  urlPattern: "/education/overview",
  intro: `<surface_intro>
You are on the learner's Study Hub home at /education/overview, their education dashboard. It is read-only: every button is a link to another page.
Check dashboard_state first: "loading" means nothing has arrived yet; "partial" means the sections in unavailable_sections failed, so their values are absent (unknown), not zero.
next_actions_brief is the page's own answer to "what should I study now" (detail with reasons and links in next_actions). Respect is_rest_day: the learner's plan protects today, so do not push them to study.
recent_items and recent_kits are the newest material; owned_counts and library_total say how much they own; due_by_mode says what is waiting.
To create material send the learner to /education/start; to change a library item, use the Education Library page.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

export interface OverviewPlan {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  daily_minutes: number;
}
export interface OverviewModeCount {
  label: string;
  due: number;
  weak: number;
}
export interface OverviewGoal {
  id: string;
  title: string;
  target_date: string | null;
}
export interface OverviewRef {
  id: string;
  title: string;
}
export interface OverviewNextAction {
  id: string;
  title: string;
  why: string;
  minutes: number | null;
  href: string | null;
}
export interface OverviewToolCount {
  slug: string;
  label: string;
  count: number | null;
  href: string;
  coming_soon: boolean;
}
export interface OverviewRecentItem {
  id: string;
  title: string;
  kind: string;
  subtype: string | null;
  item_count: number | null;
  due_count: number | null;
  accuracy_pct: number | null;
  last_studied_at: string | null;
  updated_at: string;
  href: string;
}
export interface OverviewKit {
  id: string;
  title: string;
  created_at: string;
  href: string;
  formats: string[];
  missing_formats: string[];
  item_count: number;
}

/** Type-safe payload helper. Required keys mirror `alwaysAvailable: true`. */
export function createEducationOverviewScope(values: {
  dashboard_state: "loading" | "ready" | "partial";
  selection?: string;
  context?: Record<string, unknown>;
  unavailable_sections?: string[];
  visible_blocks?: string[];
  active_plan?: OverviewPlan | null;
  is_rest_day?: boolean;
  today_plan_block_count?: number;
  study_streak_days?: number;
  total_due?: number;
  total_weak?: number;
  has_studied?: boolean;
  due_by_mode?: OverviewModeCount[];
  active_goals?: OverviewGoal[];
  next_actions_brief?: OverviewRef[];
  next_actions?: OverviewNextAction[];
  next_actions_total_minutes?: number;
  library_total?: number;
  owned_counts?: Record<string, number>;
  tool_counts?: OverviewToolCount[];
  recent_items?: OverviewRef[];
  recent_items_detail?: OverviewRecentItem[];
  kit_total?: number;
  recent_kits?: OverviewRef[];
  kits_detail?: OverviewKit[];
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}

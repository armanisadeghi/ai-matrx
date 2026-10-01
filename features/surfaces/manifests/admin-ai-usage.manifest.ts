/**
 * Surface manifest — AI Usage (`matrx-admin/ai-usage`).
 *
 * The super-admin usage explorer at `/administration/usage` (lane DRILL-FLIP-FIXES L4, VERIFY-DRILL-FINAL:
 * the Spend Explorer and the CX usage tab fed their explorer state to the page's surface runtime; the
 * screen that replaces them must too). One question of one declared drill definition — `ai_usage`
 * (the hourly ledger), `ai_usage_executions` (per execution) or `ai_calls` (model calls), picked by
 * `def=` — asked through the one read door. Read-only: no agent role, write target or custom action,
 * and no fixed AI job (Explain this hands the answer to an agent the person picks), so nothing is
 * disclosed in the top Agents menu.
 *
 * The values are the explorer's own (`components/official/drill-explorer/drillExplorerScope.ts`
 * builds them from the screen's live state at read time), so any explorer mount can declare a surface
 * with the same contract.
 */

import type { SurfaceManifest, SurfaceScopePayload, SurfaceValue, SurfaceValueGroup } from "@/features/surfaces/types";

export const ADMIN_AI_USAGE_SURFACE_NAME = "matrx-admin/ai-usage";

const groups: SurfaceValueGroup[] = [
  { key: "question", label: "Question asked", sortOrder: 100 },
  { key: "answer", label: "Answer shown", sortOrder: 200 },
];

const values: SurfaceValue[] = [
  {
    name: "definition_key",
    label: "Definition",
    description: "The drill definition the screen asks: ai_usage, ai_usage_executions or ai_calls. Always present once the definition is described.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    group: "question",
    sortOrder: 100,
  },
  {
    name: "definition_label",
    label: "Definition name",
    description: "The definition's own name (\"AI usage\"). Empty until the door describes the definition.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "question",
    sortOrder: 110,
  },
  {
    name: "open_view",
    label: "Open Saved view",
    description: "The built-in or saved view open on the screen, by its label. Absent when the person asked their own question.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "question",
    sortOrder: 120,
  },
  {
    name: "question",
    label: "Question",
    description: "The question as the address holds it: grouping, pivot, Measures, the trail of filters, the window, the sort. Always present.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 400,
    group: "question",
    sortOrder: 130,
  },
  {
    name: "question_words",
    label: "Question in words",
    description: "The question read as a person reads it: Measures, grouping, filters by their names, the window. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 200,
    group: "question",
    sortOrder: 140,
  },
  {
    name: "window_label",
    label: "Window",
    description: "The window the answer covers, in words (\"Last 30 days\", \"All time\"). Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    group: "question",
    sortOrder: 150,
  },
  {
    name: "money_unit",
    label: "Money unit",
    description: "How money is shown: points (everyone) or usd (a system admin who switched). Values in answer_rows are always dollars.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    group: "question",
    sortOrder: 160,
  },
  {
    name: "answer_state",
    label: "Answer state",
    description: "reading, answered or failed. Always present; a reading or failed answer holds no numbers, never zeros.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 9,
    group: "answer",
    sortOrder: 200,
  },
  {
    name: "answer_error",
    label: "Answer error",
    description: "Why the answer could not be counted. Present only when answer_state is failed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "answer",
    sortOrder: 210,
  },
  {
    name: "counted_through",
    label: "Counted through",
    description: "The moment the numbers are counted through (the rollup's as_of). Absent when the definition is counted live.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "answer",
    sortOrder: 220,
  },
  {
    name: "answer_total",
    label: "Answer total",
    description: "The whole answer's numbers by Measure label (money in dollars). Absent until the answer is counted.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "answer",
    sortOrder: 230,
  },
  {
    name: "answer_rows",
    label: "Answer rows",
    description: "The outermost groups shown, each with its name and numbers (money in dollars). Absent until counted; bindable-only due to size.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    group: "answer",
    sortOrder: 240,
  },
  {
    name: "answer_notes",
    label: "Answer notes",
    description: "The door's own sentences about the answer (what folded into Other, what is not counted yet). Absent when there are none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "answer",
    sortOrder: 250,
  },
];

export const adminAiUsageManifest: SurfaceManifest = {
  surfaceName: ADMIN_AI_USAGE_SURFACE_NAME,
  client: "matrx-admin",
  executionMode: "python-stream",
  description: "Super-admin AI usage explorer: one question of the usage ledger, per execution or the model calls, with its answer.",
  readiness: "partial",
  readinessNote: "Manifest, registry and runtime emitter are wired; the focused DB sync, its --check and independent S1-S18 certification remain.",
  label: "AI Usage",
  urlPattern: "/administration/usage",
  intro: `<surface_intro>
This is an ADMIN surface: the AI usage explorer, where a platform admin asks one question at a time of what the platform spent on AI — by person, organization, agent, model, feature, origin or time — and drills from any number into the groups and records behind it.

Read question_words first: it says what is being counted, how it is grouped and filtered, and over which window. answer_total is the whole answer and answer_rows its outermost groups, money in dollars whatever money_unit shows on screen. "Requests" are requests a person or an API caller made; "Calls" (or Executions) count every billed execution, automated runs included. A reading or failed answer_state means the numbers are unavailable, not zero; counted_through says how fresh the rollup is.

This surface is read-only: explain, compare and diagnose the answer shown, but never imply that spend, a setting or a ledger was changed.
</surface_intro>`,
  groups,
  values,
  skipBaselineValues: true,
};

/** Required keys mirror the values the explorer always emits. */
export function createDrillExplorerSurfaceScope(scope: {
  definition_key: string;
  question: Record<string, unknown>;
  question_words: string;
  window_label: string;
  money_unit: "points" | "usd";
  answer_state: "reading" | "answered" | "failed";
  definition_label?: string;
  open_view?: string;
  answer_error?: string;
  counted_through?: string;
  answer_total?: Record<string, number | string | null>;
  answer_rows?: Array<Record<string, unknown>>;
  answer_notes?: string[];
}): SurfaceScopePayload {
  return scope as SurfaceScopePayload;
}

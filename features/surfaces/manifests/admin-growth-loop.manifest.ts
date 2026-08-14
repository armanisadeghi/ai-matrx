/**
 * Surface manifest — Growth Loop map (`matrx-admin/growth-loop`).
 *
 * The admin Growth Loop canvas at `/administration/knowledge/growth-loop`
 * (`features/growth-loop/components/GrowthLoopCanvas.tsx` →
 * `GrowthLoopCanvasImpl.tsx`). Renders the twelve-stage pipeline
 * (Research → Plan → Brief → Realize → Fill → Publish → Serve → Crawl →
 * Measure → Analyze → Suggest → Write-back) as a React Flow diagram, scored
 * on THE THREE PIPES (code / human / AI) per stage and edge.
 *
 * THE DATA IS STATIC, THE STATE IS SELECTION. `STAGES` / `EDGES` / `GAPS`
 * come from the hand-maintained `features/growth-loop/map/loop-map.ts` — no
 * fetch, same for every viewer. The only runtime state
 * `GrowthLoopCanvasInner` holds is which single stage or edge is currently
 * selected (click a node/arrow to inspect it; click the pane to clear). Both
 * the derived overview (score, gap/blocker counts, per-item summaries) and
 * the selection are declared here — the overview because THE COMPLETENESS
 * LAW covers computed page state as much as fetched state, not because it
 * changes per user.
 *
 * NEW surface — no `ui_surface` DB row exists yet (the orchestrator seeds it
 * as part of the surface-canonical-fleet campaign batch).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const ADMIN_GROWTH_LOOP_SURFACE_NAME = "matrx-admin/growth-loop";

const groups: SurfaceValueGroup[] = [
  {
    key: "loop_overview",
    label: "Loop overview",
    sortOrder: 100,
    description:
      "The whole map's health, derived from loop-map.ts: pipe-state score, open gaps, blockers, and a compact summary of every stage and edge.",
  },
  {
    key: "selection",
    label: "Selection",
    sortOrder: 200,
    description:
      "The single stage or edge the user has clicked, and its detail. Empty when nothing is selected.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Loop overview ───────────────────────────────────────────────────────
  {
    name: "loop_score",
    label: "Loop score",
    description:
      "Counts of connections by pipe health across the whole map: { live, partial, missing, total }. Always populated (derived from the static loop map, not user state).",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "loop_overview",
    sortOrder: 100,
  },
  {
    name: "open_gap_count",
    label: "Open gap count",
    description:
      "Number of gaps with status other than 'closed' across the whole map. Always populated; zero when every gap is closed.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "loop_overview",
    sortOrder: 110,
  },
  {
    name: "blocker_count",
    label: "Blocker count",
    description:
      "Number of open gaps with severity 'blocker'. Always populated; zero when none are open.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "loop_overview",
    sortOrder: 120,
  },
  {
    name: "blockers_summary",
    label: "Blockers",
    description:
      "Every open blocker-severity gap: { id, title, lane, at }. Always populated — empty array when there are none. This is exactly the list shown in the canvas sidebar when nothing is selected.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 600,
    group: "loop_overview",
    sortOrder: 130,
  },
  {
    name: "stages_summary",
    label: "Stages",
    description:
      "Every pipeline stage in loop order: { id, label, maturity, open_gap_count }. Always populated (12 entries) — the full node list the canvas renders.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 700,
    group: "loop_overview",
    sortOrder: 140,
  },
  {
    name: "edges_summary",
    label: "Connections",
    description:
      "Every connection between stages: { id, from, to, label, health }, where `health` is the worst pipe state on that edge (live/partial/missing/n-a). Always populated — the full edge list the canvas renders.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 900,
    group: "loop_overview",
    sortOrder: 150,
  },

  // ── Selection ────────────────────────────────────────────────────────────
  {
    name: "selection_kind",
    label: "Selection kind",
    description:
      '"stage" when a stage node is selected, "edge" when a connection arrow is selected, "none" when the user clicked the empty pane and nothing is selected. Always populated — tells you which of the selected_* values below apply.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "selection",
    sortOrder: 200,
  },
  {
    name: "selected_stage_id",
    label: "Selected stage ID",
    description:
      "Machine id of the selected stage (e.g. \"research\", \"analyze\"). Empty unless selection_kind is \"stage\".",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "selection",
    sortOrder: 210,
  },
  {
    name: "selected_stage_detail",
    label: "Selected stage detail",
    description:
      "Full detail of the selected stage: { id, label, blurb, maturity, repos, stores, pipes: { code, human, ai } }, each pipe carrying { state, note, ref }. Empty unless selection_kind is \"stage\" — this is exactly what the sidebar renders.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    group: "selection",
    sortOrder: 220,
  },
  {
    name: "selected_edge_id",
    label: "Selected connection ID",
    description:
      'Id of the selected connection (e.g. "research->plan"). Empty unless selection_kind is "edge".',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "selection",
    sortOrder: 230,
  },
  {
    name: "selected_edge_detail",
    label: "Selected connection detail",
    description:
      "Full detail of the selected connection: { id, from, to, label, pipes: { code, human, ai } }, each pipe carrying { state, note, ref }. Empty unless selection_kind is \"edge\".",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    group: "selection",
    sortOrder: 240,
  },
  {
    name: "selection_gaps",
    label: "Gaps at selection",
    description:
      "Gaps that live on the selected stage or edge: { id, title, severity, status, detail, lane }. Empty when nothing is selected or the selection has no gaps.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 500,
    group: "selection",
    sortOrder: 250,
  },
];

export const adminGrowthLoopManifest: SurfaceManifest = {
  surfaceName: ADMIN_GROWTH_LOOP_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter wired in GrowthLoopCanvasInner and matches the component's real state (the static overview + click selection), but not yet live-checked against the DB (no ui_surface row exists — the orchestrator seeds it) and never bound to a test agent for the Matrx-vs-matrix verification.",
  label: "Growth Loop Map",
  urlPattern: "/administration/knowledge/growth-loop",
  intro: `<surface_intro>
You are on the admin Growth Loop map: the twelve-stage pipeline (Research through Write-back) scored on THE THREE PIPES — code, human, and AI — per stage and per connection between stages. loop_score / open_gap_count / blocker_count / blockers_summary give the whole-map health; stages_summary and edges_summary list every node and arrow the canvas renders. The data itself is static (hand-maintained in loop-map.ts, not fetched) — the only thing that changes per view is which single stage or arrow the user has clicked. selection_kind tells you whether that is a stage, a connection, or nothing; selected_stage_detail / selected_edge_detail carry the full record for whichever one is selected, and selection_gaps lists the gaps sitting on it.
</surface_intro>`,
  groups,
  values: surfaceSpecific,
  // Read-only diagnostic map — no text/content/selection concept in the
  // editor sense; "selection" here means a clicked node, not highlighted text.
  skipBaselineValues: true,
};

/** One entry of `blockers_summary`. */
export interface GrowthLoopBlockerSummaryEntry {
  id: string;
  title: string;
  lane: string;
  at: string;
}

/** One entry of `stages_summary`. */
export interface GrowthLoopStageSummaryEntry {
  id: string;
  label: string;
  maturity: string;
  open_gap_count: number;
}

/** One entry of `edges_summary`. */
export interface GrowthLoopEdgeSummaryEntry {
  id: string;
  from: string;
  to: string;
  label: string;
  health: "live" | "partial" | "missing" | "n/a";
}

/** One pipe status as emitted inside `selected_stage_detail` / `selected_edge_detail`. */
export interface GrowthLoopPipeStatusEntry {
  state: "live" | "partial" | "missing" | "n/a";
  note: string;
  ref?: string;
}

/** `selected_stage_detail` shape. */
export interface GrowthLoopSelectedStageDetail {
  id: string;
  label: string;
  blurb: string;
  maturity: string;
  repos: string[];
  stores: string[];
  pipes: {
    code: GrowthLoopPipeStatusEntry;
    human: GrowthLoopPipeStatusEntry;
    ai: GrowthLoopPipeStatusEntry;
  };
}

/** `selected_edge_detail` shape. */
export interface GrowthLoopSelectedEdgeDetail {
  id: string;
  from: string;
  to: string;
  label: string;
  pipes: {
    code: GrowthLoopPipeStatusEntry;
    human: GrowthLoopPipeStatusEntry;
    ai: GrowthLoopPipeStatusEntry;
  };
}

/** One entry of `selection_gaps`. */
export interface GrowthLoopSelectionGapEntry {
  id: string;
  title: string;
  severity: "blocker" | "major" | "minor";
  status: "open" | "in-progress" | "closed";
  detail: string;
  lane: string;
}

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createAdminGrowthLoopScope(values: {
  loop_score: { live: number; partial: number; missing: number; total: number };
  open_gap_count: number;
  blocker_count: number;
  blockers_summary: GrowthLoopBlockerSummaryEntry[];
  stages_summary: GrowthLoopStageSummaryEntry[];
  edges_summary: GrowthLoopEdgeSummaryEntry[];
  selection_kind: "stage" | "edge" | "none";
  selected_stage_id?: string;
  selected_stage_detail?: GrowthLoopSelectedStageDetail;
  selected_edge_id?: string;
  selected_edge_detail?: GrowthLoopSelectedEdgeDetail;
  selection_gaps?: GrowthLoopSelectionGapEntry[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

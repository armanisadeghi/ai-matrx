/**
 * Surface manifest — Marketing rank tracking (`matrx-user/marketing-ranks`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/ranks` — the site's rank
 * portfolio (`RanksWorkspace`): tracked keywords with latest position,
 * movement, and best position; a live one-shot check per target
 * (`POST /seo/rank-targets/{id}/check`, streamed); and a history drill-in with
 * the position timeseries plus the competitive SERP landscape. All data comes
 * from aidream's `/seo/sites/{site_id}/rank-targets` family (never a raw
 * Supabase read — portfolio writes need server-side identity resolution).
 * Inherits brand + site context from `matrx-user/marketing-site`; the site id
 * is in the path, so the inheritance is honest.
 *
 * Runtime emitter: `RanksWorkspace.tsx` mounts the nested
 * `<SurfaceRuntimeProvider>` and spreads
 * `useMarketingSiteSurfaceBase().getBaseValues()` into
 * `createMarketingRanksScope(...)` at trigger time. The history dialog reports
 * its loaded timeseries / landscape back up through a ref so the one workspace
 * scope carries the drill-in too.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "rank_portfolio",
    label: "Rank portfolio",
    sortOrder: 100,
    description:
      "Every keyword this site tracks, the rollup over them, and the site domain the positions are measured against.",
  },
  {
    key: "target_detail",
    label: "Target drill-in",
    sortOrder: 200,
    description:
      "The one tracked target the user has opened: its row, its position history, and the competitive SERP landscape around it.",
  },
  {
    key: "tracking_setup",
    label: "Tracking setup",
    sortOrder: 300,
    description:
      "How rank tracking can be configured here — the catalog of tracking modes the add form offers.",
  },
  {
    key: "check_runs",
    label: "Live checks",
    sortOrder: 400,
    description:
      "The state of on-demand rank checks the user has fired during this visit.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Rank portfolio ────────────────────────────────────────────────────
  {
    group: "rank_portfolio",
    name: "site_domain",
    label: "Tracked domain",
    description:
      "The bare domain of the managed site whose rankings are tracked here — the domain a SERP result must match to count as this site. Always present; the route guarantees a loaded site row.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    sortOrder: 300,
  },
  {
    group: "rank_portfolio",
    name: "portfolio_summary",
    label: "Portfolio summary",
    description:
      "Rollup over the tracked targets currently loaded: { tracked, active, ranked, never_checked, average_position, improving, declining, best_position }. Always present; all counts are zero before the portfolio loads or when nothing is tracked yet.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 220,
    sortOrder: 310,
  },
  {
    group: "rank_portfolio",
    name: "rank_portfolio",
    label: "Tracked keywords",
    description:
      "Every tracked rank target loaded for this site, one row each: keyword, tracking mode (provider / engine / search_type / location), group and tags, cadence, active flag, and the derived latest position, previous position, movement, best position, and last-checked timestamp. Always an array — empty before the portfolio loads or when nothing is tracked.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 320,
  },
  {
    group: "rank_portfolio",
    name: "portfolio_load_error",
    label: "Portfolio load error",
    description:
      "The error message shown in place of the table when the rank-target fetch failed. Empty whenever the portfolio loaded normally — its presence means every portfolio value below is unreliable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 330,
  },
  // ── Target drill-in ───────────────────────────────────────────────────
  {
    group: "target_detail",
    name: "selected_target_id",
    label: "Open target id",
    description:
      "UUID of the tracked target whose history dialog is open. Empty whenever the user is on the portfolio table with no drill-in open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 400,
  },
  {
    group: "target_detail",
    name: "selected_target",
    label: "Open target",
    description:
      "The full portfolio row for the target whose history dialog is open — the same shape as one entry of rank_portfolio. Empty when no drill-in is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 410,
  },
  {
    group: "target_detail",
    name: "target_history",
    label: "Position history",
    description:
      "The observed position timeseries for the open target, oldest first: per point observed_at, organic_rank (null when not ranked), absolute_rank, matched_url, matched_domain, and result_type. Empty when no drill-in is open, while it loads, or when the target has never been checked.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    autoContext: false,
    sortOrder: 420,
  },
  {
    group: "target_detail",
    name: "serp_landscape",
    label: "Competitive SERP landscape",
    description:
      "The most recent full SERP snapshot behind the open target: { snapshot_id, observed_at, results[] } where each result carries absolute_rank, organic_rank, result_type, url, domain, title, and snippet — i.e. who else ranks for this keyword. Empty when no drill-in is open or no snapshot has been stored.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 430,
  },
  {
    group: "target_detail",
    name: "landscape_view",
    label: "Landscape view state",
    description:
      "What the user actually sees of the landscape table: { total_results, visible_results, showing_all } — the dialog shows the top 30 until expanded. Empty when no drill-in is open or the target has no landscape.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 440,
  },
  {
    group: "target_detail",
    name: "history_load_error",
    label: "History load error",
    description:
      "The error message shown inside the history dialog when the history or landscape fetch failed. Empty when the drill-in loaded normally or is closed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 450,
  },
  // ── Tracking setup ────────────────────────────────────────────────────
  {
    group: "tracking_setup",
    name: "tracking_modes",
    label: "Available tracking modes",
    description:
      "The catalog of tracking modes the add-keyword form offers, each with its id, user-facing label, provider, engine, search_type, whether a location is required, and a hint (Google national / local area / map pack, Brave, and the AI-answer engines). Always present — it is a static capability catalog, not loaded data — and it is the authoritative list of what CAN be tracked here.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1400,
    autoContext: false,
    sortOrder: 500,
  },
  // ── Live checks ───────────────────────────────────────────────────────
  {
    group: "check_runs",
    name: "rank_check_state",
    label: "Live check state",
    description:
      "On-demand rank checks fired during this visit, keyed by target id: { status: idle|running|done|error, stage, error }. Empty unless the user has pressed 'Check now' in this browser tab — it is not persisted run history.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 600,
  },
];

/**
 * Write half of the 360 loop — what an agent may WRITE into the rank
 * portfolio. Both targets are `mode: "entity"` because the portfolio has no
 * draft layer: the Track form and the Active switch persist immediately
 * through aidream, and these targets ride the SAME `usePortfolio` paths
 * (`addTarget` / `updateTarget` — never a parallel write). Both are
 * `applyPolicy: "ask"` — tracked keywords cost real provider checks on a
 * cadence, so every agent-originated change is confirmed in place. Removal is
 * deliberately NOT a target: `removeTarget` deletes the row and its history
 * (delete stays human); pausing via `set_tracking_active` is the
 * non-destructive alternative. Handlers are registered by
 * `RanksWorkspace.tsx` on its SurfaceRuntimeProvider.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "track_keywords",
    label: "Track keywords",
    description:
      "Adds tracked rank targets to this site's portfolio immediately, through the same canonical add path as the Track form (aidream resolves keyword identity server-side). Value is an array of { keyword: string, mode: string, location_name?: string, cadence_days?: number } — mode is a tracking_modes id: google_national | google_location | google_local_pack | brave | ai_chat_gpt | ai_perplexity | ai_gemini | ai_claude. For ai_* modes, keyword is the PROMPT to track. google_location and google_local_pack REQUIRE location_name (e.g. \"Los Angeles, California, United States\"); the ai_* modes take an optional city; google_national and brave ignore location. cadence_days is 1-90 (default 7). Appends to the portfolio — never re-add rows already in rank_portfolio.",
    valueType: "array",
    updatesValue: "rank_portfolio",
    mode: "entity",
    applyPolicy: "ask",
    group: "rank_portfolio",
    sortOrder: 340,
  },
  {
    name: "set_tracking_active",
    label: "Tracking active",
    description:
      "Pauses or resumes tracking for existing portfolio rows — the same canonical path as each row's Active switch. Non-destructive: position history is kept and a paused target can be resumed. Value is { target_ids: string[], is_active: boolean } where every id must be a target_id from rank_portfolio.",
    valueType: "object",
    updatesValue: "rank_portfolio",
    mode: "entity",
    applyPolicy: "ask",
    group: "rank_portfolio",
    sortOrder: 350,
  },
];

export const marketingRanksManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-ranks",
  readiness: "verified",
  label: "Marketing Rank Tracking",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/ranks",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the rank tracking workspace of a managed website: the portfolio of keywords (and AI-answer prompts) this site tracks, and where it currently sits for each of them. The brand_context and site_context values give you the client and website framing; read them first, and read site_domain — a SERP result only counts as "this site" when it matches that domain.
Positions are COLLECTED EVIDENCE, not opinion: each row carries when it was last checked, and a target that has never been checked has a null position (that means "unknown", never "not ranking"). movement is the change since the previous observation and best_position is the all-time best. Never invent a position, a competitor, or a trend the values do not contain.
Every row declares HOW it is tracked — provider, engine, search_type, and location — and those are not interchangeable: a Google national position, a map-pack position, and a citation in a ChatGPT answer are different measurements. tracking_modes is the authoritative catalog of what can be tracked here; use its labels rather than raw provider names when talking to the user.
When a drill-in is open, target_history is the position timeseries for that one keyword and serp_landscape is who else ranks for it — that pair is where real analysis lives (why a position moved, which competitor took the slot). landscape_view tells you how much of the landscape the user can actually see.
The user works here on visibility: choosing what to track, reading movement, and deciding what to fix. Fresh data comes from a live check (rank_check_state shows runs fired in this visit) — when the evidence is stale or missing, say so and name the check to run rather than guessing a number.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "rank_analyst",
      label: "Rank analyst",
      description:
        "Reads the portfolio and per-target history to explain movement, spot losses, and separate real drops from unchecked or newly added targets.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "tracking_strategist",
      label: "Tracking strategist",
      description:
        "Advises what this site should be tracking: which keywords and AI prompts to add, in which mode and location, and at what cadence.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the
 * inherited brand_id / site_id from marketing-brand / marketing-site.
 */
export function createMarketingRanksScope(values: {
  // inherited alwaysAvailable: true → required
  brand_id: string;
  site_id: string;
  // surface-specific guaranteed
  site_domain: string;
  portfolio_summary: Record<string, unknown>;
  rank_portfolio: Array<Record<string, unknown>>;
  tracking_modes: Array<Record<string, unknown>>;
  // surface-specific optionals
  portfolio_load_error?: string;
  selected_target_id?: string;
  selected_target?: Record<string, unknown>;
  target_history?: Array<Record<string, unknown>>;
  serp_landscape?: Record<string, unknown>;
  landscape_view?: Record<string, unknown>;
  history_load_error?: string;
  rank_check_state?: Record<string, unknown>;
  // inherited optionals
  brand_name?: string;
  gsc_synced_at?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  // baseline optionals
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

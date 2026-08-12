/**
 * Surface manifest — Keyword Research workbench (`matrx-user/keyword-research`).
 *
 * Drives `/marketing/keyword-research` — the universal (site-agnostic) workbench
 * over the `seo` keyword plane (`features/marketing/seo/keyword-research`,
 * `KeywordResearchWorkbench` + `useKeywordResearch`). Two halves:
 *
 *   - THE LIBRARY EXPLORER — a live, searchable table of `seo.keyword` rows with
 *     their `seo.keyword_market` cache (volume, trend, competition, CPC,
 *     trajectory) and intent classification. Read direct from Supabase; the rows
 *     are provider evidence, never estimates.
 *   - THE RESEARCH RUN — the paid server pipeline (`POST /seo/keywords/research`):
 *     an LSI relationship agent → content-ir artifact → ingestion → batched
 *     volume fetch → intent classification, streamed as NDJSON stages. After a
 *     run the explorer scopes to that run's CLUSTER of phrases until cleared.
 *
 * This surface has NO site or page identity — it is the universal keyword plane.
 * Site-scoped organic performance lives on `matrx-user/marketing-site-keywords`;
 * the single-keyword dossier lives on the `matrx-user/keyword-intelligence`
 * overlay surface.
 *
 * Runtime scope assembly: `features/marketing/lib/scopes/keyword-research-scope.ts`
 * (emitter in `KeywordResearchWorkbench.tsx`).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { KEYWORD_CLUSTER_WRITE_MODES } from "@/features/marketing/seo/keyword-research/types";
import { MAX_STAGED_KEYWORD_LENGTH } from "@/features/marketing/seo/keyword-research/keyword-research-write";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "keyword_library",
    label: "Keyword library",
    sortOrder: 100,
    description:
      "The explorer over the universal keyword plane and how the user has narrowed it.",
  },
  {
    key: "research_run",
    label: "Research run",
    sortOrder: 200,
    description:
      "The state and product of the server-side keyword research pipeline.",
  },
  {
    key: "market_refresh",
    label: "Market refresh",
    sortOrder: 300,
    description:
      "State of the paid provider volume refresh for the visible keywords.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Keyword library ────────────────────────────────────────────────────
  {
    name: "library_search",
    label: "Library filter",
    description:
      "The phrase the user typed into the explorer filter (matched against `seo.keyword.normalized_phrase`). Empty string when the explorer is unfiltered.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 30,
    group: "keyword_library",
    sortOrder: 300,
  },
  {
    name: "keywords_total",
    label: "Keywords shown",
    description:
      "Count of keyword rows currently listed in the explorer after the filter and any active cluster scope. Zero when nothing matches or the library is empty.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "keyword_library",
    sortOrder: 310,
  },
  {
    name: "visible_keywords",
    label: "Visible keyword rows",
    description:
      "The keyword rows currently listed, volume-sorted: phrase, keyword id, intent_class, and the US market cache (search_volume, cpc, competition, competition_index, demand_trajectory). A bounded sample of the library under the active filter/cluster — never the whole plane. Empty array during load or when nothing matches.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    group: "keyword_library",
    sortOrder: 320,
  },
  {
    name: "cluster_primary_keyword",
    label: "Active cluster keyword",
    description:
      "The primary keyword whose research run produced the cluster the explorer is scoped to. Empty when the explorer shows the whole library.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "keyword_library",
    sortOrder: 330,
  },
  {
    name: "cluster_phrases",
    label: "Cluster phrases",
    description:
      "Normalized phrases of the last research run's cluster — the scope filter currently applied to the explorer. Empty/absent when no cluster is active.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    autoContext: false,
    group: "keyword_library",
    sortOrder: 340,
  },

  // ── Research run ───────────────────────────────────────────────────────
  {
    name: "run_status",
    label: "Run status",
    description:
      "State of the keyword research pipeline in this session: idle | running | done | error. Always present — 'idle' means no run has been launched here yet.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "research_run",
    sortOrder: 400,
  },
  {
    name: "run_primary_keyword",
    label: "Researched keyword",
    description:
      "The primary keyword the current or most recent research run was launched for. Empty when no run has been launched or rejoined in this session.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "research_run",
    sortOrder: 410,
  },
  {
    name: "research_input_keyword",
    label: "Staged research keyword",
    description:
      "The phrase currently typed into the research launcher's input but NOT yet run — what pressing Research would spend a paid pipeline call on. Empty when the box is empty. Distinct from run_primary_keyword, which is the keyword a run actually launched for.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "research_run",
    sortOrder: 405,
  },
  {
    name: "run_stage",
    label: "Run stage",
    description:
      "Human-readable label of the last streamed pipeline stage (e.g. 'Classifying keyword intent'). Empty when idle.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "research_run",
    sortOrder: 420,
  },
  {
    name: "run_id",
    label: "Collection run id",
    description:
      "UUID of the durable `seo.collection_run` row backing the current/last run — the id a rejoin or durable read uses. Empty until the server emits `seo.command_run`.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "research_run",
    sortOrder: 430,
  },
  {
    name: "research_artifact",
    label: "Research artifact",
    description:
      "The completed run's relationship artifact ({ primary_keyword, keyword_lists: [{ label, keywords[] }] }) — the LSI agent's clustered output as persisted. Empty until a run completes.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    group: "research_run",
    sortOrder: 440,
  },
  {
    name: "research_result",
    label: "Research result",
    description:
      "The full `seo.research_completed` payload for the last completed run: artifact plus ingestion, volume, and classification receipts. Empty until a run completes.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    group: "research_run",
    sortOrder: 450,
  },
  {
    name: "run_error",
    label: "Run error",
    description:
      "Failure message from the last research run (stream error, failed durable run, or a stream that ended with no result). Empty when the run succeeded or none has been launched.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "research_run",
    sortOrder: 460,
  },

  // ── Market refresh ─────────────────────────────────────────────────────
  {
    name: "volume_stage",
    label: "Volume refresh stage",
    description:
      "Human-readable stage of an in-flight provider volume refresh for the visible cluster. Empty when no refresh is running.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    autoContext: false,
    group: "market_refresh",
    sortOrder: 500,
  },
];

/**
 * What may be written INTO this workbench, and — just as deliberately — what
 * may not.
 *
 * The split follows the money and the evidence. This surface has exactly one
 * paid, irreversible action (the research pipeline) and one body of fetched
 * provider truth (the market rows). An agent gets the JUDGMENT half of both
 * and none of the execution half:
 *
 *   YES — `research_input_keyword` stages the launcher's input so the human
 *   presses Research (the `research_planner` role's whole output, made one
 *   click away instead of a phrase to retype). `cluster_scope` narrows the
 *   explorer to an agent-composed working set — the `keyword_strategist` /
 *   `cluster_analyst` roles read `visible_keywords` and can now MAKE the table
 *   show the phrases they recommend, which is also what the Refresh volume
 *   button (cluster-only) then acts on. `library_search` is the cheap staged
 *   filter twin.
 *
 *   NO — STARTING a run (`run_status`, `run_stage`, `run_id`): the pipeline
 *   spends a paid DataForSEO request plus agent calls, so the button stays
 *   human. NO to every fetched or derived value (`research_artifact`,
 *   `research_result`, `visible_keywords`, `keywords_total`, `volume_stage`,
 *   `run_error`): those are provider evidence and pipeline receipts, and an
 *   agent that could overwrite them would be fabricating the market data the
 *   rest of the platform plans against. NO to the explorer's row selection:
 *   its only consumer is the bulk Archive button, so staging a selection is
 *   staging a soft-delete — destructive stays entirely human, confirm dialog
 *   and all.
 *
 * Per-mount posture (deepest-wins means several mounts can coexist, and a
 * target is only offered where that mount registered a handler):
 *   - `KeywordResearchWorkbench` (`/marketing/keyword-research`) is the ONE
 *     mount of this surface. It owns the filter and the cluster, and hands
 *     `KeywordResearchLauncher` the surface name so the launcher — which owns
 *     the input state — registers `research_input_keyword` itself.
 *   - `KeywordResearchWindow` hosts the SAME launcher as a floating overlay
 *     and mounts no runtime for this surface. It passes no surface name, so it
 *     registers nothing: an agent running on whatever page sits underneath
 *     must never type into a window that page does not own.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "library_search",
    label: "Library filter",
    description: [
      "Sets the explorer's filter box — exactly what the user typing in it does.",
      "Value is a string, matched as a substring against `seo.keyword.normalized_phrase`; pass an empty string to clear the filter and show the whole library again.",
      "Narrows what the table lists (and therefore what keywords_total counts and visible_keywords reports) — it changes nothing stored and spends nothing.",
      "This stacks WITH an active cluster scope: rows must match both. If you filtered and got nothing, read cluster_primary_keyword before assuming the library is empty.",
    ].join(" "),
    valueType: "string",
    updatesValue: "library_search",
    mode: "ui",
    // Ephemeral and reversible, but it changes the rows under the user's eyes
    // mid-thought — same posture as keyword-intelligence's selection targets.
    applyPolicy: "ask",
    group: "keyword_library",
    sortOrder: 305,
  },
  {
    name: "cluster_scope",
    label: "Cluster scope",
    description: [
      "Scopes the explorer to a named working set of keyword phrases — the same scoping a completed research run applies, and cleared by the same X on the cluster chip.",
      `Value is an object: { mode: ${KEYWORD_CLUSTER_WRITE_MODES.join(" | ")}, primary_keyword: string, phrases: string[] }.`,
      'mode "replace" REPLACES the full set — include every phrase you want kept, reading the current one from `cluster_phrases` — and primary_keyword is required (it names the cluster chip).',
      'mode "append" adds phrases to the cluster already on screen and keeps its existing name, so primary_keyword is optional there; appending with no cluster active requires primary_keyword and behaves like replace.',
      "Phrases are lowercased and trimmed to match `normalized_phrase`; duplicates collapse. A phrase that is not in the library simply matches no row — this never creates, fetches, or invents a keyword.",
      "Use it to turn a recommendation into a working set the user can act on: the Refresh volume button acts on exactly the scoped rows.",
    ].join(" "),
    valueType: "object",
    updatesValue: "cluster_phrases",
    mode: "ui",
    // Replaces what the whole table is showing — the most disruptive write on
    // this surface, and the one most worth confirming.
    applyPolicy: "ask",
    group: "keyword_library",
    sortOrder: 345,
  },
  {
    name: "research_input_keyword",
    label: "Staged research keyword",
    description: [
      `Types a primary keyword into the research launcher's input — the same box the user types in. Value is ONE keyword phrase as plain text, not JSON and not JSON-encoded (send  botox cost  — never  "botox cost"  or  {"phrase":"botox cost"}), non-empty, single-line, at most ${MAX_STAGED_KEYWORD_LENGTH} characters. A list of keywords is rejected rather than truncated to its first line; the pipeline researches one primary keyword per run and discovers the cluster around it.`,
      "STAGED ONLY. This does NOT start research and spends nothing; the user still presses Research, which is what launches the paid pipeline (an LSI agent plus a DataForSEO request).",
      "Rejected while a run is in flight — the input is locked then, exactly as it is for the user.",
      "This is how a research recommendation becomes one click instead of a phrase to retype. Propose the keyword you would actually spend the run on, and say why in your reply.",
    ].join(" "),
    valueType: "string",
    updatesValue: "research_input_keyword",
    mode: "draft",
    applyPolicy: "ask",
    group: "research_run",
    sortOrder: 406,
  },
];

export const keywordResearchManifest: SurfaceManifest = {
  surfaceName: "matrx-user/keyword-research",
  label: "Keyword Research Workbench",
  urlPattern: "/marketing/keyword-research",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter complete for the workbench's own state, and agent-writable since 2026-08-10 (library_search, cluster_scope, research_input_keyword — see the writeTargets docblock for what is deliberately withheld). Registered in registry.ts and route-to-surface.ts; the ui_surface / ui_surface_write_target DB mirror still needs a manifest sync run. The live agent token streams (relationship research + classification) are deliberately NOT emitted — they are transient render buffers; the persisted research_artifact/research_result are the durable truth.",
  intro: `<surface_intro>
You are on the Keyword Research workbench — the universal, site-agnostic plane of keywords. There is no site, page, or brand here: the user researches and explores keyword demand itself.
Two halves. The LIBRARY EXPLORER (library_search, visible_keywords, keywords_total) lists keyword rows with provider market evidence: search volume, CPC, competition, demand trajectory, and intent classification. These numbers come from a paid data provider — read them as evidence and never invent, extrapolate, or "estimate" a missing one; an absent market row means the keyword has simply never been fetched.
The RESEARCH RUN (run_status, run_primary_keyword, run_stage, research_artifact) is a PAID server pipeline: a relationship agent clusters a primary keyword, the artifact is persisted, volumes are fetched, and intent is classified. Never suggest re-running it casually. After a run the explorer scopes to that cluster — cluster_primary_keyword and cluster_phrases tell you the user is looking at one cluster, not the whole library.
Useful work here is judgment over the rows actually provided: which phrases deserve targeting, how the cluster splits by intent and funnel stage, what is missing from the cluster, and which keywords warrant a fresh market fetch.
You can also ACT on that judgment, without ever spending the user's money: scope the explorer to the working set you recommend (cluster_scope), narrow the filter (library_search), and stage the keyword you think is worth researching into the launcher (research_input_keyword) — the user presses Research. You cannot start a run and you cannot touch the fetched market evidence or run results; say what you would run and stage it, then let them decide.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  writeTargets,
  agentRoles: [
    {
      name: "keyword_strategist",
      label: "Keyword strategist",
      description:
        "Reads the visible library/cluster and recommends which keywords to target, in what order, and why — grounded only in the provided market evidence.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "cluster_analyst",
      label: "Cluster analyst",
      description:
        "Explains the structure of the researched cluster — intent split, funnel coverage, sub-topics, and the gaps the relationship artifact did not cover.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
    {
      name: "research_planner",
      label: "Research planner",
      description:
        "Proposes the next primary keywords worth running the (paid) research pipeline on, and which visible keywords need a market refresh.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createKeywordResearchScope(values: {
  library_search: string;
  keywords_total: number;
  run_status: string;
  visible_keywords?: Array<Record<string, unknown>>;
  cluster_primary_keyword?: string;
  cluster_phrases?: string[];
  run_primary_keyword?: string;
  research_input_keyword?: string;
  run_stage?: string;
  run_id?: string;
  research_artifact?: Record<string, unknown>;
  research_result?: Record<string, unknown>;
  run_error?: string;
  volume_stage?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

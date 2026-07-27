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
} from "@/features/surfaces/types";
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

export const keywordResearchManifest: SurfaceManifest = {
  surfaceName: "matrx-user/keyword-research",
  label: "Keyword Research Workbench",
  urlPattern: "/marketing/keyword-research",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter complete for the workbench's own state. Not yet registered in registry.ts / route-to-surface.ts / ui_surface (registration is the owner's call). The live agent token streams (relationship research + classification) are deliberately NOT emitted — they are transient render buffers; the persisted research_artifact/research_result are the durable truth.",
  intro: `<surface_intro>
You are on the Keyword Research workbench — the universal, site-agnostic plane of keywords. There is no site, page, or brand here: the user researches and explores keyword demand itself.
Two halves. The LIBRARY EXPLORER (library_search, visible_keywords, keywords_total) lists keyword rows with provider market evidence: search volume, CPC, competition, demand trajectory, and intent classification. These numbers come from a paid data provider — read them as evidence and never invent, extrapolate, or "estimate" a missing one; an absent market row means the keyword has simply never been fetched.
The RESEARCH RUN (run_status, run_primary_keyword, run_stage, research_artifact) is a PAID server pipeline: a relationship agent clusters a primary keyword, the artifact is persisted, volumes are fetched, and intent is classified. Never suggest re-running it casually. After a run the explorer scopes to that cluster — cluster_primary_keyword and cluster_phrases tell you the user is looking at one cluster, not the whole library.
Useful work here is judgment over the rows actually provided: which phrases deserve targeting, how the cluster splits by intent and funnel stage, what is missing from the cluster, and which keywords warrant a fresh market fetch.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
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

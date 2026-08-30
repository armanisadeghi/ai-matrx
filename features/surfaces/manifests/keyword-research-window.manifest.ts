/**
 * Surface manifest — Keyword Research floating window
 * (`matrx-user/keyword-research-window`).
 *
 * This is the floating member of the named Keyword Research family. The routed
 * workbench keeps its existing `matrx-user/keyword-research` identity; this
 * overlay is distinct because it can out-depth any host page while mounted and
 * carries its own site selection, launcher state, and compact explorer.
 *
 * The paid Research action is deliberately NOT a write target. Agents may
 * stage the keyword and adjust reversible UI state, but only the user's button
 * press launches the paid server pipeline.
 */

import type { MarketingSite } from "@/features/marketing/types";
import type { ResearchRunState } from "@/features/marketing/seo/keyword-research/useKeywordResearch";
import type {
  KeywordMarketRow,
  KeywordWithMarket,
} from "@/features/marketing/seo/keyword-research/types";
import { US_LOCATION_CODE } from "@/features/marketing/seo/keyword-research/types";
import { MAX_STAGED_KEYWORD_LENGTH } from "@/features/marketing/seo/keyword-research/keyword-research-write";
import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import { keywordResearchManifest } from "./keyword-research.manifest";

export const KEYWORD_RESEARCH_WINDOW_SURFACE_NAME =
  "matrx-user/keyword-research-window" as const;

const groups: SurfaceValueGroup[] = [
  {
    key: "window_context",
    label: "Window context",
    sortOrder: 50,
    description:
      "The launch inputs and host-independent state that identify this floating window.",
  },
  {
    key: "site_scope",
    label: "Site scope",
    sortOrder: 100,
    description:
      "The sites available to the user and the one the research run is currently scoped to.",
  },
  {
    key: "keyword_library",
    label: "Keyword library",
    sortOrder: 200,
    description:
      "The loaded keyword plane, the visible bounded explorer, and the UI filters applied to it.",
  },
  {
    key: "research_run",
    label: "Research run",
    sortOrder: 300,
    description:
      "The staged input plus the state and durable output of the paid keyword-research pipeline.",
  },
];

const values: SurfaceValue[] = [
  {
    name: "initial_keyword",
    label: "Initial keyword",
    description:
      "Keyword supplied by the opener when this window was launched. Empty when the user opened the window without a prefilled phrase.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "window_context",
    sortOrder: 100,
  },
  {
    name: "auto_run_requested",
    label: "Auto-run requested",
    description:
      "Whether the opener explicitly requested the one-shot automatic Research action for the initial keyword. False for normal manually opened or restored windows.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    autoContext: false,
    group: "window_context",
    sortOrder: 110,
  },
  {
    name: "site_options_status",
    label: "Site options status",
    description:
      "Current state of the site-options read: loading, ready, or error. Always present while the window is mounted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "site_scope",
    sortOrder: 200,
  },
  {
    name: "site_options_error",
    label: "Site options error",
    description:
      "Failure message from the site-options read. Empty when the options loaded successfully or are still loading.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "site_scope",
    sortOrder: 210,
  },
  {
    name: "site_options",
    label: "Available sites",
    description:
      "All site choices loaded for this picker, projected to id, name, and domain. Empty array when none are available or the read has not completed.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1200,
    autoContext: false,
    group: "site_scope",
    sortOrder: 220,
  },
  {
    name: "selected_site_id",
    label: "Selected site id",
    description:
      "UUID of the site whose keyword library and paid research run this window uses. Empty until the opener or the user selects a site.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "site_scope",
    sortOrder: 230,
  },
  {
    name: "selected_site",
    label: "Selected site",
    description:
      "The selected site's id, name, and domain as loaded by the site-options query. Empty when no site is selected or the selected id is not present in the options read.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "site_scope",
    sortOrder: 240,
  },
  {
    name: "library_search",
    label: "Library filter",
    description:
      "The phrase currently typed into the keyword-library filter. Empty string means the loaded library is unfiltered by text.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 30,
    group: "keyword_library",
    sortOrder: 300,
  },
  {
    name: "library_status",
    label: "Library status",
    description:
      "Current state of the keyword-library read: loading, ready, or error. Always present while the window is mounted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "keyword_library",
    sortOrder: 310,
  },
  {
    name: "library_error",
    label: "Library error",
    description:
      "Failure message from the keyword-library read. Empty when the library loaded successfully or is still loading.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "keyword_library",
    sortOrder: 320,
  },
  {
    name: "loaded_keywords_total",
    label: "Loaded keywords",
    description:
      "Count of keyword rows loaded by the current site and text query before cluster filtering. Zero during an empty or failed read.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "keyword_library",
    sortOrder: 330,
  },
  {
    name: "loaded_keywords",
    label: "Loaded keyword rows",
    description:
      "All keyword rows loaded by the current site and text query before cluster filtering, projected to identity, intent, and provider-market evidence. Empty array during load, failure, or a genuinely empty result.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 20000,
    autoContext: false,
    group: "keyword_library",
    sortOrder: 340,
  },
  {
    name: "keywords_total",
    label: "Keywords shown",
    description:
      "Count of keyword rows currently shown after text and cluster filtering. Zero when no row matches or the explorer is empty.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "keyword_library",
    sortOrder: 350,
  },
  {
    name: "visible_keywords",
    label: "Visible keyword rows",
    description:
      "The at-most-100 keyword rows currently visible in the compact explorer, volume-sorted and projected to identity, intent, and provider-market evidence. Empty array when no row is visible.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    autoContext: false,
    group: "keyword_library",
    sortOrder: 360,
  },
  {
    name: "explorer_open",
    label: "Explorer open",
    description:
      "Whether the compact keyword-library explorer is expanded in this window. Always present; false means the user collapsed it to give the research stream more room.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "keyword_library",
    sortOrder: 370,
  },
  {
    name: "cluster_primary_keyword",
    label: "Active cluster keyword",
    description:
      "Primary keyword naming the research cluster currently filtering the explorer. Empty when the explorer shows the whole loaded library.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "keyword_library",
    sortOrder: 380,
  },
  {
    name: "cluster_phrases",
    label: "Cluster phrases",
    description:
      "Normalized phrases in the active research cluster. Empty when no completed or rejoined run has scoped the explorer.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    autoContext: false,
    group: "keyword_library",
    sortOrder: 390,
  },
  {
    name: "research_input_keyword",
    label: "Staged research keyword",
    description:
      "The phrase currently typed into the launcher but not necessarily run. Empty when the input is blank; staging this value never launches the paid pipeline.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "research_run",
    sortOrder: 400,
  },
  {
    name: "research_run",
    label: "Research run",
    description:
      "Natural composite of the current or most recent run's durable state: status, primary keyword, stage, run id, result, and error. The object is always present with at least status=idle.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 3200,
    autoContext: false,
    group: "research_run",
    sortOrder: 410,
  },
  {
    name: "run_status",
    label: "Run status",
    description:
      "State of the keyword research pipeline in this window: idle, running, done, or error. Always present while mounted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "research_run",
    sortOrder: 420,
  },
  {
    name: "run_primary_keyword",
    label: "Researched keyword",
    description:
      "Primary keyword the current or most recent run actually launched for. Empty before a run is launched or rejoined.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "research_run",
    sortOrder: 430,
  },
  {
    name: "run_stage",
    label: "Run stage",
    description:
      "Human-readable label of the latest streamed pipeline stage. Empty while idle or when a completed snapshot did not carry a stage.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "research_run",
    sortOrder: 440,
  },
  {
    name: "run_id",
    label: "Collection run id",
    description:
      "UUID of the durable seo.collection_run backing the current or last run. Empty until the server emits or restores that durable identity.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "research_run",
    sortOrder: 450,
  },
  {
    name: "research_artifact",
    label: "Research artifact",
    description:
      "The completed run's persisted relationship artifact with its primary keyword and clustered keyword lists. Empty until a run completes or a durable result is restored.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    group: "research_run",
    sortOrder: 460,
  },
  {
    name: "research_result",
    label: "Research result",
    description:
      "Full completed seo.research_completed payload, including artifact and provider/classification receipts. Empty until a run completes or a durable result is restored.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    group: "research_run",
    sortOrder: 470,
  },
  {
    name: "run_error",
    label: "Run error",
    description:
      "Failure message from the most recent research run. Empty when no run failed or the current run is healthy.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "research_run",
    sortOrder: 480,
  },
  {
    name: "volume_stage",
    label: "Volume refresh stage",
    description:
      "Human-readable stage of an in-flight provider volume refresh managed by the shared research hook. Empty when no refresh is running.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    autoContext: false,
    group: "research_run",
    sortOrder: 490,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "selected_site_id",
    label: "Selected site id",
    description:
      "Selects an existing site in this window's picker, changing which site's keyword library and future paid run inputs are shown. UI-only and confirmation-gated; a window opened with a fixed site refuses this target.",
    valueType: "string",
    updatesValue: "selected_site_id",
    mode: "ui",
    applyPolicy: "ask",
    group: "site_scope",
    sortOrder: 235,
  },
  {
    name: "library_search",
    label: "Library filter",
    description:
      "Sets the compact explorer's single-line substring filter through the same state setter as user typing. Pass an empty string to clear it; this changes no stored data and spends nothing.",
    valueType: "string",
    updatesValue: "library_search",
    mode: "ui",
    applyPolicy: "ask",
    group: "keyword_library",
    sortOrder: 305,
  },
  {
    name: "explorer_open",
    label: "Explorer open",
    description:
      "Expands or collapses the compact keyword explorer using a boolean. This is reversible UI state only and changes no stored or provider data.",
    valueType: "boolean",
    updatesValue: "explorer_open",
    mode: "ui",
    applyPolicy: "ask",
    group: "keyword_library",
    sortOrder: 375,
  },
  {
    name: "research_input_keyword",
    label: "Staged research keyword",
    description: `Stages one non-empty, single-line primary keyword of at most ${MAX_STAGED_KEYWORD_LENGTH} characters into the launcher. This never presses Research and never starts or spends a paid pipeline call; the user must do that explicitly.`,
    valueType: "string",
    updatesValue: "research_input_keyword",
    mode: "draft",
    applyPolicy: "ask",
    group: "research_run",
    sortOrder: 405,
  },
];

export const keywordResearchWindowManifest: SurfaceManifest = {
  surfaceName: KEYWORD_RESEARCH_WINDOW_SURFACE_NAME,
  label: "Keyword Research",
  overlayId: "keywordResearchWindow",
  readiness: "partial",
  readinessNote:
    "The complete overlay manifest, live nested provider, trigger-time emitter, canonical v3 menu, Locate anchors, and four safe staged/UI write targets are implemented. Promotion to verified awaits coordinator-owned registry inclusion, focused DB manifest sync, independent certification, and isolated live Browser proof; the paid Research action is deliberately human-only.",
  intro: `<surface_intro>
You are on the floating Keyword Research window, the overlay member of the Keyword Research family. It can open above any host page, so use only this window's selected_site, library, cluster, staged input, and research-run values; do not infer context from the page underneath.
Research belongs to one site. site_options and selected_site describe that scope. loaded_keywords is the complete loaded query result, while visible_keywords is the bounded, volume-sorted set the compact explorer currently shows after its cluster filter.
The research pipeline is paid. research_input_keyword is only the staged phrase; run_primary_keyword is what a run actually launched for. research_artifact and research_result are durable provider/pipeline evidence and must never be invented or overwritten.
You may stage a phrase, choose an available site, filter the library, or expand/collapse the explorer. You cannot start Research: explain why a run is worthwhile and leave the final paid action to the user.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    values,
  ),
  writeTargets,
  // The overlay performs the same analysis jobs as the routed family member,
  // but bindings stay surface-specific because overlay and route identities
  // have different runtime lifetimes.
  agentRoles: keywordResearchManifest.agentRoles,
};

interface ProjectedSite {
  id: string;
  name: string | null;
  domain: string | null;
}

interface ProjectedKeyword {
  keyword_id: string;
  phrase: string;
  normalized_phrase: string;
  intent_class: string | null;
  search_volume: number | null;
  cpc: number | null;
  competition: string | null;
  competition_index: number | null;
  demand_trajectory: string | null;
}

function marketFor(row: KeywordWithMarket): KeywordMarketRow | null {
  return (
    row.keyword_market.find(
      (market) => market.location_code === US_LOCATION_CODE,
    ) ??
    row.keyword_market[0] ??
    null
  );
}

function projectKeyword(row: KeywordWithMarket): ProjectedKeyword {
  const market = marketFor(row);
  return {
    keyword_id: row.id,
    phrase: row.phrase,
    normalized_phrase: row.normalized_phrase,
    intent_class: row.intent_class,
    search_volume: market?.search_volume ?? null,
    cpc: market?.cpc ?? null,
    competition: market?.competition ?? null,
    competition_index: market?.competition_index ?? null,
    demand_trajectory: market?.demand_trajectory ?? null,
  };
}

function projectSite(site: MarketingSite): ProjectedSite {
  return { id: site.id, name: site.name, domain: site.domain };
}

function markdownContent(args: {
  selectedSite: ProjectedSite | undefined;
  stagedKeyword: string;
  visibleKeywords: ProjectedKeyword[];
  run: ResearchRunState;
}): string {
  const { selectedSite, stagedKeyword, visibleKeywords, run } = args;
  const lines = [
    "# Keyword Research",
    "",
    `Site: ${selectedSite?.name ?? selectedSite?.domain ?? "Not selected"}`,
    `Staged keyword: ${stagedKeyword || "None"}`,
    `Run status: ${run.status}`,
  ];
  if (run.stage) lines.push(`Run stage: ${run.stage}`);
  if (run.error) lines.push(`Run error: ${run.error}`);
  lines.push("", "## Visible keywords", "");
  if (visibleKeywords.length === 0) {
    lines.push("No keyword rows are currently visible.");
  } else {
    lines.push(
      "| Keyword | Volume | CPC | Competition | Intent |",
      "| --- | ---: | ---: | --- | --- |",
    );
    for (const row of visibleKeywords) {
      lines.push(
        `| ${row.phrase.replaceAll("|", "\\|")} | ${row.search_volume ?? "—"} | ${row.cpc ?? "—"} | ${row.competition ?? "—"} | ${row.intent_class ?? "—"} |`,
      );
    }
  }
  return lines.join("\n");
}

export interface KeywordResearchWindowScopeInput {
  siteOptions: readonly MarketingSite[];
  siteOptionsLoading: boolean;
  siteOptionsError: string | null;
  selectedSiteId: string | null;
  initialKeyword?: string;
  autoRunRequested: boolean;
  librarySearch: string;
  libraryLoading: boolean;
  libraryError: string | null;
  loadedKeywords: readonly KeywordWithMarket[];
  visibleKeywords: readonly KeywordWithMarket[];
  explorerOpen: boolean;
  clusterPrimaryKeyword: string | null;
  clusterPhrases: string[] | null;
  stagedKeyword: string;
  run: ResearchRunState;
  volumeStage: string | null;
}

/** Type-safe trigger-time scope builder for the floating family member. */
export function buildKeywordResearchWindowScope({
  siteOptions,
  siteOptionsLoading,
  siteOptionsError,
  selectedSiteId,
  initialKeyword,
  autoRunRequested,
  librarySearch,
  libraryLoading,
  libraryError,
  loadedKeywords,
  visibleKeywords,
  explorerOpen,
  clusterPrimaryKeyword,
  clusterPhrases,
  stagedKeyword,
  run,
  volumeStage,
}: KeywordResearchWindowScopeInput): SurfaceScopePayload {
  const projectedSites = siteOptions.map(projectSite);
  const selectedSite = projectedSites.find(
    (site) => site.id === selectedSiteId,
  );
  const projectedLoaded = loadedKeywords.map(projectKeyword);
  const projectedVisible = visibleKeywords.map(projectKeyword);
  const artifact = run.result?.artifact;
  const researchRun: Record<string, unknown> = {
    status: run.status,
    primary_keyword: run.primaryKeyword ?? null,
    stage: run.stage ?? null,
    run_id: run.runId ?? null,
    result: run.result ?? null,
    error: run.error ?? null,
  };

  return createKeywordResearchWindowScope({
    initial_keyword: initialKeyword?.trim() || undefined,
    auto_run_requested: autoRunRequested,
    site_options_status: siteOptionsError
      ? "error"
      : siteOptionsLoading
        ? "loading"
        : "ready",
    site_options_error: siteOptionsError ?? undefined,
    site_options: projectedSites,
    selected_site_id: selectedSiteId ?? undefined,
    selected_site: selectedSite,
    library_search: librarySearch,
    library_status: libraryError
      ? "error"
      : libraryLoading
        ? "loading"
        : "ready",
    library_error: libraryError ?? undefined,
    loaded_keywords_total: projectedLoaded.length,
    loaded_keywords: projectedLoaded,
    keywords_total: projectedVisible.length,
    visible_keywords: projectedVisible,
    explorer_open: explorerOpen,
    cluster_primary_keyword: clusterPhrases?.length
      ? (clusterPrimaryKeyword ?? run.primaryKeyword ?? undefined)
      : undefined,
    cluster_phrases: clusterPhrases?.length ? clusterPhrases : undefined,
    research_input_keyword: stagedKeyword.trim() || undefined,
    research_run: researchRun,
    run_status: run.status,
    run_primary_keyword: run.primaryKeyword ?? undefined,
    run_stage: run.stage ?? undefined,
    run_id: run.runId ?? undefined,
    research_artifact: artifact
      ? (artifact as unknown as Record<string, unknown>)
      : undefined,
    research_result: run.result
      ? (run.result as unknown as Record<string, unknown>)
      : undefined,
    run_error: run.error ?? undefined,
    volume_stage: volumeStage ?? undefined,
    content: markdownContent({
      selectedSite,
      stagedKeyword,
      visibleKeywords: projectedVisible,
      run,
    }),
    context: {
      selected_site_id: selectedSiteId,
      explorer_open: explorerOpen,
      cluster_primary_keyword: clusterPrimaryKeyword,
      cluster_phrases: clusterPhrases,
      library_search: librarySearch,
    },
  });
}

/** Required keys correspond exactly to every alwaysAvailable value above. */
export function createKeywordResearchWindowScope(values: {
  auto_run_requested: boolean;
  site_options_status: string;
  site_options: ProjectedSite[];
  library_search: string;
  library_status: string;
  loaded_keywords_total: number;
  loaded_keywords: ProjectedKeyword[];
  keywords_total: number;
  visible_keywords: ProjectedKeyword[];
  explorer_open: boolean;
  research_run: Record<string, unknown>;
  run_status: string;
  initial_keyword?: string;
  site_options_error?: string;
  selected_site_id?: string;
  selected_site?: ProjectedSite;
  library_error?: string;
  cluster_primary_keyword?: string;
  cluster_phrases?: string[];
  research_input_keyword?: string;
  run_primary_keyword?: string;
  run_stage?: string;
  run_id?: string;
  research_artifact?: Record<string, unknown>;
  research_result?: Record<string, unknown>;
  run_error?: string;
  volume_stage?: string;
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

"use client";

import React from "react";
import { CheckCircle, AlertTriangle } from "lucide-react";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { ToolEventPayload } from "@/types/python-generated/stream-events";

import type {
  ToolOverlayTabSpec,
  ToolPhaseLabels,
  ToolRegistry,
  ToolRenderer,
  ToolRendererProps,
} from "../types";
import { GenericRenderer } from "./GenericRenderer";

import { SearchInline } from "../renderers/search/SearchInline";
import { SearchOverlay } from "../renderers/search/SearchOverlay";
import { NewsInline, NewsOverlay } from "../renderers/news-api";
import {
  SeoMetaTagsInline,
  SeoMetaTagsOverlay,
} from "../renderers/seo-meta-tags";
import { SeoMetaTitlesInline } from "../renderers/seo-meta-titles";
import { SeoMetaDescriptionsInline } from "../renderers/seo-meta-descriptions";
import {
  DeepResearchInline,
  deepResearchOverlayTabs,
} from "../renderers/deep-research";
import { UserListsInline, UserListsOverlay } from "../renderers/get-user-lists";
import { RagSearchInline } from "../renderers/rag-search";
import { RandomWheelInline } from "../renderers/random-wheel";
import { CtxGetInline } from "../renderers/ctx/CtxGetInline";
import { CtxBatchInline } from "../renderers/ctx/CtxBatchInline";
import { CtxPatchInline } from "../renderers/ctx/CtxPatchInline";
import { SqlInline } from "../renderers/sql/SqlInline";
import { DbSchemaInline } from "../renderers/sql/DbSchemaInline";
import { summarizeSql } from "../renderers/sql/summarizeSql";

import {
  resultAsObject,
  resultAsString,
  getArg,
  collectMessages,
  filterStepEvents,
} from "../renderers/_shared";
import { parseSearch } from "../renderers/search/parseSearch";
import { DbToolRenderer } from "../db-renderer/DbToolRenderer";
import {
  getCachedToolRenderer,
  getCachedToolMeta,
  isKnownNoToolRenderer,
} from "../db-renderer/toolRendererCache";

// ─────────────────────────────────────────────────────────────────────────────
// SEO header extras helpers
// ─────────────────────────────────────────────────────────────────────────────

function seoMetaTagsHeaderExtras(entry: ToolLifecycleEntry): React.ReactNode {
  const result = resultAsObject(entry);
  if (!result) return null;
  const batch = result.batch_analysis as
    | Array<{ overall_ok: boolean }>
    | undefined;
  if (!batch) return null;
  const total = (result.count as number | undefined) ?? batch.length;
  const passed = batch.filter((a) => a.overall_ok).length;
  const failed = total - passed;
  return (
    <div className="flex items-center gap-3 text-white/90 text-xs mt-1">
      <span className="flex items-center gap-1">
        <CheckCircle className="w-3.5 h-3.5" />
        {passed} Passed
      </span>
      {failed > 0 && (
        <span className="flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          {failed} Need Attention
        </span>
      )}
      <span className="ml-auto text-white/60">Total: {total}</span>
    </div>
  );
}

function seoTitlesHeaderExtras(entry: ToolLifecycleEntry): React.ReactNode {
  const result = resultAsObject(entry);
  if (!result) return null;
  const analysis = result.title_analysis as
    | Array<{ title_ok: boolean }>
    | undefined;
  if (!analysis) return null;
  const total = (result.count as number | undefined) ?? analysis.length;
  const passed = analysis.filter((a) => a.title_ok).length;
  const failed = total - passed;
  return (
    <div className="flex items-center gap-3 text-white/90 text-xs mt-1">
      <span className="flex items-center gap-1">
        <CheckCircle className="w-3.5 h-3.5" />
        {passed} Passed
      </span>
      {failed > 0 && (
        <span className="flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          {failed} Need Attention
        </span>
      )}
      <span className="ml-auto text-white/60">Total: {total}</span>
    </div>
  );
}

function seoDescriptionsHeaderExtras(
  entry: ToolLifecycleEntry,
): React.ReactNode {
  const result = resultAsObject(entry);
  if (!result) return null;
  const analysis = result.description_analysis as
    | Array<{ description_ok: boolean }>
    | undefined;
  if (!analysis) return null;
  const total = (result.count as number | undefined) ?? analysis.length;
  const passed = analysis.filter((a) => a.description_ok).length;
  const failed = total - passed;
  return (
    <div className="flex items-center gap-3 text-white/90 text-xs mt-1">
      <span className="flex items-center gap-1">
        <CheckCircle className="w-3.5 h-3.5" />
        {passed} Passed
      </span>
      {failed > 0 && (
        <span className="flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          {failed} Need Attention
        </span>
      )}
      <span className="ml-auto text-white/60">Total: {total}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Search header helpers — shared by web_search / core_web_search / web_search_v1
// (the unified SearchInline/SearchOverlay renderer). Subtitle = the query (or
// "N queries"); extras = sources / domains counts once the result lands.
// ─────────────────────────────────────────────────────────────────────────────

function searchHeaderSubtitle(entry: ToolLifecycleEntry): string | null {
  const queries = getArg<unknown[]>(entry, "queries");
  if (Array.isArray(queries) && queries.length > 0) {
    return queries.length === 1
      ? String(queries[0])
      : `${queries.length} queries`;
  }
  const query = getArg<string>(entry, "query");
  return typeof query === "string" && query ? query : null;
}

function searchHeaderExtras(entry: ToolLifecycleEntry): React.ReactNode {
  const parsed = parseSearch(resultAsString(entry));
  if (parsed.sources.length === 0) return null;
  return (
    <div className="flex items-center gap-3 text-white/90 text-xs mt-1">
      <span>
        {parsed.sources.length}{" "}
        {parsed.sources.length === 1 ? "source" : "sources"}
      </span>
      {parsed.domains.length > 0 && (
        <span>
          {parsed.domains.length}{" "}
          {parsed.domains.length === 1 ? "domain" : "domains"}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Static tool registry
// ─────────────────────────────────────────────────────────────────────────────

export const toolRendererRegistry: ToolRegistry = {
  web_search: {
    toolName: "web_search",
    displayName: "Web Search",
    phaseLabels: {
      running: "Searching the web",
      complete: "Searched the web",
      errorPrefix: "Web search failed",
    },
    resultsLabel: "Search Results",
    InlineComponent: SearchInline,
    OverlayComponent: SearchOverlay,
    keepExpandedOnStream: true,
    getHeaderSubtitle: searchHeaderSubtitle,
    getHeaderExtras: searchHeaderExtras,
  },

  news_get_headlines: {
    toolName: "news_get_headlines",
    displayName: "News Headlines",
    phaseLabels: {
      running: "Fetching news headlines",
      complete: "Fetched news headlines",
      errorPrefix: "Failed to fetch news",
    },
    resultsLabel: "News Results",
    InlineComponent: NewsInline,
    OverlayComponent: NewsOverlay,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const query = getArg<string>(entry, "query");
      return typeof query === "string" && query ? query : null;
    },
    getHeaderExtras: (entry) => {
      const result = resultAsObject(entry);
      const totalResults =
        typeof result?.total_results === "number"
          ? (result.total_results as number)
          : undefined;
      if (!totalResults) return null;
      return (
        <div className="flex items-center gap-3 text-white/90 text-xs mt-1">
          <span>
            {totalResults} {totalResults === 1 ? "article" : "articles"} found
          </span>
        </div>
      );
    },
  },

  seo_check_meta_tags_batch: {
    toolName: "seo_check_meta_tags_batch",
    displayName: "SEO Meta Tags",
    phaseLabels: {
      running: "Checking SEO meta tags",
      complete: "Checked SEO meta tags",
      errorPrefix: "SEO meta-tag check failed",
    },
    resultsLabel: "Meta Tags Results",
    InlineComponent: SeoMetaTagsInline,
    OverlayComponent: SeoMetaTagsOverlay,
    keepExpandedOnStream: true,
    getHeaderExtras: seoMetaTagsHeaderExtras,
  },

  seo_check_meta_titles: {
    toolName: "seo_check_meta_titles",
    displayName: "SEO Title Checker",
    phaseLabels: {
      running: "Checking SEO titles",
      complete: "Checked SEO titles",
      errorPrefix: "SEO title check failed",
    },
    resultsLabel: "Title Results",
    InlineComponent: SeoMetaTitlesInline,
    keepExpandedOnStream: true,
    getHeaderExtras: seoTitlesHeaderExtras,
  },

  seo_check_meta_descriptions: {
    toolName: "seo_check_meta_descriptions",
    displayName: "SEO Description Checker",
    phaseLabels: {
      running: "Checking SEO descriptions",
      complete: "Checked SEO descriptions",
      errorPrefix: "SEO description check failed",
    },
    resultsLabel: "Description Results",
    InlineComponent: SeoMetaDescriptionsInline,
    keepExpandedOnStream: true,
    getHeaderExtras: seoDescriptionsHeaderExtras,
  },

  web_search_v1: {
    toolName: "web_search_v1",
    displayName: "Web Research",
    phaseLabels: {
      running: "Researching the web",
      complete: "Researched the web",
      errorPrefix: "Web research failed",
    },
    resultsLabel: "Research Results",
    InlineComponent: SearchInline,
    OverlayComponent: SearchOverlay,
    keepExpandedOnStream: true,
    getHeaderSubtitle: searchHeaderSubtitle,
    getHeaderExtras: searchHeaderExtras,
  },

  core_web_search: {
    toolName: "core_web_search",
    displayName: "Multi-Query Search",
    phaseLabels: {
      running: "Running multi-query search",
      complete: "Ran multi-query search",
      errorPrefix: "Multi-query search failed",
    },
    resultsLabel: "Search Results",
    InlineComponent: SearchInline,
    OverlayComponent: SearchOverlay,
    keepExpandedOnStream: true,
    getHeaderSubtitle: searchHeaderSubtitle,
    getHeaderExtras: searchHeaderExtras,
  },

  research_web: {
    toolName: "research_web",
    displayName: "Deep Research",
    phaseLabels: {
      running: "Researching",
      complete: "Researched",
      errorPrefix: "Research failed",
    },
    resultsLabel: "Research Results",
    InlineComponent: DeepResearchInline,
    OverlayTabs: deepResearchOverlayTabs,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const query = getArg<string>(entry, "query");
      return typeof query === "string" ? query : null;
    },
    getHeaderExtras: (entry) => {
      const raw = resultAsString(entry);
      if (!raw) return null;
      const readCount = (raw.match(/<read_result>/g) || []).length;
      if (readCount === 0) return null;
      return (
        <div className="flex items-center gap-3 text-white/90 text-xs mt-1">
          <span className="flex items-center gap-1">
            {readCount} {readCount === 1 ? "page" : "pages"} read
          </span>
        </div>
      );
    },
  },

  core_web_search_and_read: {
    toolName: "core_web_search_and_read",
    displayName: "Deep Research",
    phaseLabels: {
      running: "Researching",
      complete: "Researched",
      errorPrefix: "Research failed",
    },
    resultsLabel: "Research Results",
    InlineComponent: DeepResearchInline,
    OverlayTabs: deepResearchOverlayTabs,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const query = getArg<string>(entry, "query");
      return typeof query === "string" ? query : null;
    },
    getHeaderExtras: (entry) => {
      const raw = resultAsString(entry);
      if (!raw) return null;
      const readCount = (raw.match(/<read_result>/g) || []).length;
      if (readCount === 0) return null;
      return (
        <div className="flex items-center gap-3 text-white/90 text-xs mt-1">
          <span className="flex items-center gap-1">
            {readCount} {readCount === 1 ? "page" : "pages"} read
          </span>
        </div>
      );
    },
  },

  get_user_lists: {
    toolName: "get_user_lists",
    displayName: "User Lists",
    phaseLabels: {
      running: "Loading user lists",
      complete: "Loaded user lists",
      errorPrefix: "Failed to load user lists",
    },
    resultsLabel: "Lists",
    InlineComponent: UserListsInline,
    OverlayComponent: UserListsOverlay,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const search = getArg<string>(entry, "search_term");
      const page = getArg<number>(entry, "page") ?? 1;
      const parts: string[] = [];
      if (typeof search === "string" && search) parts.push(`"${search}"`);
      if (page > 1) parts.push(`Page ${page}`);
      return parts.length > 0 ? parts.join(" · ") : null;
    },
    getHeaderExtras: (entry) => {
      const result = resultAsObject(entry);
      if (!result) return null;
      const count = result.count as number | undefined;
      const pageSize = result.page_size as number | undefined;
      if (!count) return null;
      return (
        <div className="flex items-center gap-3 text-white/90 text-xs mt-1">
          <span>
            {count} {count === 1 ? "list" : "lists"}
          </span>
          {pageSize && <span>{pageSize} per page</span>}
        </div>
      );
    },
  },

  core_web_read_web_pages: {
    toolName: "core_web_read_web_pages",
    displayName: "Web Page Reader",
    phaseLabels: {
      running: "Reading web pages",
      complete: "Read web pages",
      errorPrefix: "Failed to read web pages",
    },
    resultsLabel: "Pages Read",
    InlineComponent: DeepResearchInline,
    OverlayTabs: deepResearchOverlayTabs,
    keepExpandedOnStream: true,
  },

  rag_search: {
    toolName: "rag_search",
    displayName: "RAG Search",
    phaseLabels: {
      running: "Searching indexed content",
      complete: "Searched indexed content",
      errorPrefix: "RAG search failed",
    },
    resultsLabel: "RAG Hits",
    InlineComponent: RagSearchInline,
    OverlayComponent: RagSearchInline,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const query = getArg<string>(entry, "query");
      return typeof query === "string" && query ? query : null;
    },
    getHeaderExtras: (entry) => {
      const result = resultAsObject(entry);
      if (!result) return null;
      const hits = result.hits as unknown[] | undefined;
      const totalCandidates =
        typeof result.total_candidates === "number"
          ? (result.total_candidates as number)
          : null;
      const latency =
        typeof result.latency_ms === "number"
          ? (result.latency_ms as number)
          : null;
      const reranker =
        typeof result.reranker_model === "string"
          ? (result.reranker_model as string)
          : null;
      const nHits = Array.isArray(hits) ? hits.length : 0;
      return (
        <div className="flex items-center gap-3 text-white/90 text-xs mt-1">
          <span>
            {nHits} {nHits === 1 ? "hit" : "hits"}
          </span>
          {totalCandidates != null && (
            <span>{totalCandidates} candidates</span>
          )}
          {latency != null && <span>{latency} ms</span>}
          {reranker && <span className="ml-auto">{reranker}</span>}
        </div>
      );
    },
  },

  ctx_get: {
    toolName: "ctx_get",
    displayName: "Context",
    phaseLabels: {
      running: "Reviewing context",
      complete: "Reviewed context",
      errorPrefix: "Couldn't read context",
    },
    resultsLabel: "Context",
    InlineComponent: CtxGetInline,
    OverlayComponent: CtxGetInline,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const result = resultAsObject(entry);
      const label =
        typeof result?.label === "string" && result.label
          ? (result.label as string)
          : null;
      if (label) return label;
      const key = getArg<string>(entry, "key");
      return typeof key === "string" && key ? key : null;
    },
  },

  ctx_batch: {
    toolName: "ctx_batch",
    displayName: "Context",
    phaseLabels: {
      running: "Reviewing context",
      complete: "Reviewed context",
      errorPrefix: "Couldn't read context",
    },
    resultsLabel: "Context",
    InlineComponent: CtxBatchInline,
    OverlayComponent: CtxBatchInline,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const result = resultAsObject(entry);
      const count =
        typeof result?.count === "number"
          ? (result.count as number)
          : Array.isArray(result?.results)
            ? (result?.results as unknown[]).length
            : null;
      if (count == null) return null;
      return `${count} ${count === 1 ? "item" : "items"}`;
    },
  },

  ctx_patch: {
    toolName: "ctx_patch",
    displayName: "Context",
    phaseLabels: {
      running: "Updating context",
      complete: "Updated context",
      errorPrefix: "Couldn't update context",
    },
    resultsLabel: "Context",
    InlineComponent: CtxPatchInline,
    OverlayComponent: CtxPatchInline,
    // Keep expanded while the patch runs so the live working-document diff is
    // visible end-to-end. Reloaded patches still collapse — the shell gates
    // auto-expand on live + active.
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const key = getArg<string>(entry, "key");
      if (typeof key === "string" && key) return key;
      const result = resultAsObject(entry);
      return typeof result?.key === "string" && result.key
        ? (result.key as string)
        : null;
    },
  },

  sql: {
    toolName: "sql",
    displayName: "Database",
    phaseLabels: {
      running: "Querying the database",
      complete: "Queried the database",
      errorPrefix: "Query failed",
    },
    resultsLabel: "Query Result",
    InlineComponent: SqlInline,
    OverlayComponent: SqlInline,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) =>
      summarizeSql({
        query: getArg<unknown>(entry, "query"),
        action: getArg<unknown>(entry, "action"),
        table: getArg<unknown>(entry, "table"),
        data: getArg<unknown>(entry, "data"),
      }),
  },

  db_query: {
    toolName: "db_query",
    displayName: "Database",
    phaseLabels: {
      running: "Querying the database",
      complete: "Queried the database",
      errorPrefix: "Query failed",
    },
    resultsLabel: "Query Result",
    InlineComponent: SqlInline,
    OverlayComponent: SqlInline,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) =>
      summarizeSql({
        query: getArg<unknown>(entry, "query"),
        action: getArg<unknown>(entry, "action"),
        table: getArg<unknown>(entry, "table"),
        data: getArg<unknown>(entry, "data"),
      }),
  },

  db_schema: {
    toolName: "db_schema",
    displayName: "Database",
    phaseLabels: {
      running: "Reading schema",
      complete: "Read schema",
      errorPrefix: "Couldn't read schema",
    },
    resultsLabel: "Schema",
    InlineComponent: DbSchemaInline,
    OverlayComponent: DbSchemaInline,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const table = getArg<string>(entry, "table");
      return typeof table === "string" && table ? table : null;
    },
  },

  random_wheel: {
    toolName: "random_wheel",
    displayName: "Random Wheel",
    phaseLabels: {
      running: "Spinning the wheel",
      complete: "The wheel has spoken",
      errorPrefix: "Wheel spin failed",
    },
    resultsLabel: "Result",
    InlineComponent: RandomWheelInline,
    OverlayComponent: RandomWheelInline,
    // CRITICAL — keep the card expanded so the spin animation renders live.
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const result = resultAsObject(entry);
      const title =
        typeof result?.title === "string" && result.title
          ? (result.title as string)
          : null;
      if (title) return title;
      const spin = filterStepEvents(entry.events, "spin")[0];
      const meta = spin?.metadata as { title?: unknown } | undefined;
      return typeof meta?.title === "string" && meta.title ? meta.title : null;
    },
    getHeaderExtras: (entry) => {
      const result = resultAsObject(entry);
      if (!result) return null;
      const chosen = result.chosen as { label?: unknown } | undefined;
      const label =
        typeof chosen?.label === "string" ? (chosen.label as string) : null;
      const poolSize =
        typeof result.pool_size === "number"
          ? (result.pool_size as number)
          : null;
      const candidates = Array.isArray(result.candidates)
        ? (result.candidates as unknown[]).length
        : null;
      if (!label && poolSize == null) return null;
      return (
        <div className="flex items-center gap-3 text-white/90 text-xs mt-1">
          {label && (
            <span className="flex items-center gap-1">
              Landed on <span className="font-semibold">{label}</span>
            </span>
          )}
          {candidates != null && poolSize != null && poolSize > candidates && (
            <span className="ml-auto text-white/60">
              {candidates} of {poolSize}
            </span>
          )}
        </div>
      );
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Resolution API
// ─────────────────────────────────────────────────────────────────────────────

export function hasCustomRenderer(toolName: string | null): boolean {
  if (!toolName) return false;
  if (toolName in toolRendererRegistry) return true;
  if (getCachedToolRenderer(toolName)) return true;
  return false;
}

export function mightHaveDynamicRenderer(toolName: string | null): boolean {
  if (!toolName) return false;
  if (toolName in toolRendererRegistry) return false;
  if (isKnownNoToolRenderer(toolName)) return false;
  return true;
}

export function getInlineRenderer(
  toolName: string | null,
): React.ComponentType<ToolRendererProps> {
  if (!toolName) return GenericRenderer;

  // (1) Static, hand-written renderer wins.
  if (toolRendererRegistry[toolName]) {
    return toolRendererRegistry[toolName].InlineComponent;
  }

  // (2) Unless we already know there's no DB renderer, route through the
  // lazy DB renderer. It self-resolves: positive cache -> compiled component,
  // negative/error -> GenericRenderer (its own boundary fallback). We pass the
  // toolName so the impl can fetch+compile the row on first mount.
  if (!isKnownNoToolRenderer(toolName)) {
    const dbToolName = toolName;
    const DbInline: React.FC<ToolRendererProps> = (props) => (
      <DbToolRenderer toolName={dbToolName} {...props} />
    );
    DbInline.displayName = `DbToolRenderer(${dbToolName})`;
    return DbInline;
  }

  // (3) Confirmed no DB renderer — generic is the boundary.
  return GenericRenderer;
}

/**
 * Returns the custom overlay tabs registered for a tool, or `null` if the
 * tool only registers a single OverlayComponent (or nothing at all).
 *
 * When this returns a non-empty array, the ToolUpdatesOverlay should
 * expand these into top-level tabs and SKIP the default "Results" tab.
 */
export function getOverlayTabs(
  toolName: string | null,
): ToolOverlayTabSpec[] | null {
  if (!toolName) return null;
  const renderer = toolRendererRegistry[toolName];
  if (renderer?.OverlayTabs && renderer.OverlayTabs.length > 0) {
    return renderer.OverlayTabs;
  }
  // Dynamic renderers do not currently support OverlayTabs.
  return null;
}

/** True when the tool contributes its own top-level overlay tabs. */
export function hasOverlayTabs(toolName: string | null): boolean {
  const tabs = getOverlayTabs(toolName);
  return tabs !== null && tabs.length > 0;
}

export function getOverlayRenderer(
  toolName: string | null,
): React.ComponentType<ToolRendererProps> {
  if (!toolName) return GenericRenderer;

  if (toolRendererRegistry[toolName]) {
    const renderer = toolRendererRegistry[toolName];
    return (
      renderer.OverlayComponent ?? renderer.InlineComponent ?? GenericRenderer
    );
  }

  // DB renderers are a single canonical component used for both inline and
  // overlay. Route the overlay through the same lazy DB renderer unless we
  // already know the tool has none.
  if (!isKnownNoToolRenderer(toolName)) {
    const dbToolName = toolName;
    const DbOverlay: React.FC<ToolRendererProps> = (props) => (
      <DbToolRenderer toolName={dbToolName} {...props} />
    );
    DbOverlay.displayName = `DbToolRendererOverlay(${dbToolName})`;
    return DbOverlay;
  }

  return GenericRenderer;
}

export function shouldKeepExpandedOnStream(toolName: string | null): boolean {
  if (!toolName) return true;
  if (toolRendererRegistry[toolName]) {
    return toolRendererRegistry[toolName].keepExpandedOnStream ?? false;
  }
  // DB renderers self-paint; the shell keeps them collapsed-by-default like any
  // tool that didn't opt into streaming expansion. (Returning true preserves
  // the prior default for tools with no static entry.)
  return true;
}

/**
 * Tools whose RESULT is the deliverable the user asked for — news, search,
 * research, RAG, SEO reports, lists, the wheel spin. Their inline view stays
 * expanded when done ("stay-open"): folding away the very thing the user
 * wanted makes no sense. A per-entry `displayMode` (in-code) or the DB row's
 * `keep_expanded_on_stream` flag (DB renderers) overrides this list; this is
 * just the zero-edit default for the existing in-code result-is-purpose tools.
 */
const RESULT_IS_PURPOSE_TOOLS = new Set<string>([
  "news_get_headlines",
  "web_search",
  "core_web_search",
  "web_search_v1",
  "research_web",
  "core_web_search_and_read",
  "core_web_read_web_pages",
  "rag_search",
  "get_user_lists",
  "seo_check_meta_tags_batch",
  "seo_check_meta_titles",
  "seo_check_meta_descriptions",
  "random_wheel",
]);

/**
 * Collapse/display behavior for a tool: "auto" (expand while streaming, then
 * auto-collapse ~3s after done — the default for every tool), "stay-open"
 * (never auto-collapse), or "never-open" (single line until clicked). The shell
 * layers the user preference (verbose/minimal) on top of this.
 *
 * Resolution: in-code registry `displayMode` → DB renderer's declared mode
 * (its `keep_expanded_on_stream` → "stay-open", surfaced via `getCachedToolMeta`)
 * → the result-is-purpose default set → "auto".
 */
export function getToolDisplayMode(
  toolName: string | null,
): "auto" | "stay-open" | "never-open" {
  if (!toolName) return "auto";
  const registered = toolRendererRegistry[toolName]?.displayMode;
  if (registered) return registered;
  const dbMode = getCachedToolMeta(toolName)?.displayMode;
  if (dbMode) return dbMode;
  if (RESULT_IS_PURPOSE_TOOLS.has(toolName)) return "stay-open";
  return "auto";
}

export function getToolDisplayName(toolName: string | null): string {
  if (!toolName) return "Tool";
  // (1) In-code registry wins — it's the canonical renderer for the 10%.
  if (toolRendererRegistry[toolName]?.displayName)
    return toolRendererRegistry[toolName].displayName;
  // (2) DB renderer's author-declared label (e.g. "Weather" for the
  // `travel_get_weather` tool_ui row). Sync cache read — `useDbToolMeta` in the
  // shell drives the fetch + re-render so this resolves on the next frame.
  const dbName = getCachedToolMeta(toolName)?.displayName;
  if (dbName) return dbName;
  // (3) No metadata anywhere — title-case the tool name.
  return toolName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase labels — verb-phrase text shown on the slim collapsed row.
//
// The shell does NOT render a status icon (no green check / red X / blue
// spinner). State is conveyed by tense: "Updating plan" while in flight,
// "Updated plan" once done, "Failed to update plan: <reason>" on error.
// The shimmer treatment on the running form supplies the motion cue.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fallback labels for common widget / built-in tools that aren't in the
 * static registry. Keyed by toolName first, then by displayName as a
 * last-resort match for tools whose toolName we don't recognize but whose
 * displayName we do (e.g. the agent harness's "Tasks" widget).
 */
const FALLBACK_PHASE_LABELS_BY_TOOLNAME: Record<string, ToolPhaseLabels> = {
  update_plan: {
    running: "Updating plan",
    complete: "Updated plan",
    errorPrefix: "Failed to update plan",
  },
  update_plan_tasks: {
    running: "Updating tasks",
    complete: "Updated tasks",
    errorPrefix: "Failed to update tasks",
  },
  set_tasks: {
    running: "Updating tasks",
    complete: "Updated tasks",
    errorPrefix: "Failed to update tasks",
  },
};

const FALLBACK_PHASE_LABELS_BY_DISPLAYNAME: Record<string, ToolPhaseLabels> = {
  "Update Plan": {
    running: "Updating plan",
    complete: "Updated plan",
    errorPrefix: "Failed to update plan",
  },
  Tasks: {
    running: "Updating tasks",
    complete: "Updated tasks",
    errorPrefix: "Failed to update tasks",
  },
};

function formatPhaseLabel(
  labels: ToolPhaseLabels,
  phase: "starting" | "processing" | "complete" | "error",
  errorMessage?: string | null,
): string {
  if (phase === "error") {
    // Calm error: the short prefix only. The reason/stack live behind the
    // click (overlay Raw → Error), never shouted on the transcript line.
    return labels.errorPrefix ?? `${labels.complete} failed`;
  }
  if (phase === "complete") return labels.complete;
  return labels.running;
}

/**
 * Resolve the verb-phrase label for a tool's slim row.
 *
 * Resolution order:
 *   1. Static registry entry's `phaseLabels` — the most specific, hand-written.
 *   2. Fallback map by `toolName` (covers widget tools not in the registry).
 *   3. Fallback map by `displayName` (covers tools whose toolName varies but
 *      whose surface label is known — e.g. the "Tasks" widget).
 *   4. Plain displayName with a `failed: <message>` suffix on error.
 *
 * DB-stored renderers carry no shell-level `phaseLabels`; they self-paint, so
 * they resolve through the displayName / fallback maps like any other tool
 * without a static entry.
 */
export function getToolPhaseLabel(
  toolName: string | null,
  displayName: string,
  phase: "starting" | "processing" | "complete" | "error",
  errorMessage?: string | null,
): string {
  if (toolName) {
    const reg = toolRendererRegistry[toolName];
    if (reg?.phaseLabels) {
      return formatPhaseLabel(reg.phaseLabels, phase, errorMessage);
    }
    if (FALLBACK_PHASE_LABELS_BY_TOOLNAME[toolName]) {
      return formatPhaseLabel(
        FALLBACK_PHASE_LABELS_BY_TOOLNAME[toolName],
        phase,
        errorMessage,
      );
    }
  }
  if (FALLBACK_PHASE_LABELS_BY_DISPLAYNAME[displayName]) {
    return formatPhaseLabel(
      FALLBACK_PHASE_LABELS_BY_DISPLAYNAME[displayName],
      phase,
      errorMessage,
    );
  }
  if (phase === "error") {
    return `${displayName} failed`;
  }
  return displayName;
}

export function getResultsLabel(toolName: string | null): string {
  if (!toolName) return "Results";
  const renderer = toolRendererRegistry[toolName];
  if (renderer?.resultsLabel) return renderer.resultsLabel;
  return `${getToolDisplayName(toolName)} Results`;
}

export function getHeaderSubtitle(
  toolName: string | null,
  entry: ToolLifecycleEntry,
  events?: ToolEventPayload[],
): string | null {
  if (!toolName) return null;
  const fn = toolRendererRegistry[toolName]?.getHeaderSubtitle;
  if (fn) {
    try {
      return fn(entry, events);
    } catch {
      return null;
    }
  }
  // DB renderers self-paint their own header; the shell shows no subtitle.
  return null;
}

export function getHeaderExtras(
  toolName: string | null,
  entry: ToolLifecycleEntry,
  events?: ToolEventPayload[],
): React.ReactNode {
  if (!toolName) return null;
  const fn = toolRendererRegistry[toolName]?.getHeaderExtras;
  if (fn) {
    try {
      return fn(entry, events);
    } catch {
      return null;
    }
  }
  // DB renderers self-paint; no shell-level header extras.
  return null;
}

export function registerToolRenderer(
  toolName: string,
  renderer: ToolRenderer,
): void {
  toolRendererRegistry[toolName] = renderer;
}

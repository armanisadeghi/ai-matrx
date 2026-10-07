"use client";

/**
 * The app-feature tool renderers, REGISTERED into `@ai-matrx/chat` (P20, CPM-009b).
 * These tools draw with app features (SEO / topical map / notes / tasks / pick lists / documents /
 * datasets / knowledge search), so their renderers live here and the package's
 * `registerToolRenderer` is the door. A bare host that registers none draws these tools with the
 * package's GenericRenderer and a "not set up here" badge (PACKAGE-INDEPENDENCE.md section 5.1).
 * Imported for its side effect by `providers/ChatSurfaceRegistrations.tsx`.
 */

import React from "react";
import { CheckCircle, AlertTriangle, ListTree } from "lucide-react";
import {
  registerToolRenderer,
} from "@ai-matrx/chat/tool-call-visualization/registry/registry";
import type { ToolRegistry } from "@ai-matrx/chat/tool-call-visualization/types";
import type { ToolLifecycleEntry } from "@ai-matrx/chat/agents/types/request.types";
import { resultAsObject, getArg } from "@ai-matrx/chat/tool-call-visualization/renderers/_shared";
import { SeoInline } from "./renderers/seo/SeoInline";
import { SeoOverlay } from "./renderers/seo/SeoOverlay";
import { resolveSeoVariant, seoVariantSub } from "./renderers/seo/resolve";
import { PickListInline } from "./renderers/pick-list/PickListInline";
import { PickListOverlay } from "./renderers/pick-list/PickListOverlay";
import { TaskInline } from "./renderers/task/TaskInline";
import { TaskOverlay } from "./renderers/task/TaskOverlay";
import { TaskListInline } from "./renderers/task/TaskListInline";
import { DocumentInline } from "./renderers/document/DocumentInline";
import { DocumentOverlay } from "./renderers/document/DocumentOverlay";
import { DatasetInline } from "./renderers/dataset/DatasetInline";
import { DatasetOverlay } from "./renderers/dataset/DatasetOverlay";
import { KnowledgeSearchInline } from "./renderers/knowledge-search/KnowledgeSearchInline";
import { KnowledgeSearchOverlay } from "./renderers/knowledge-search/KnowledgeSearchOverlay";
import { DocumentSearchInline } from "./renderers/document-search/DocumentSearchInline";
import { KnowledgeBrowseInline } from "./renderers/knowledge-browse/KnowledgeBrowseInline";
import { DocumentContentInline } from "./renderers/document-content/DocumentContentInline";
import { resolveDocumentContentView } from "./renderers/document-content/documentContentView";
import { NoteToolInline } from "./renderers/note/NoteToolInline";
import { NoteToolOverlay } from "./renderers/note/NoteToolOverlay";
import { TopicalMapInline } from "./renderers/topical-map/TopicalMapInline";
import {
  TOPICAL_MAP_ACTION_LABELS,
  humanizeAction,
  topicalMapActionOf,
} from "./renderers/topical-map/topicalMapResult";

function seoHeaderExtras(entry: ToolLifecycleEntry): React.ReactNode {
  const variant = resolveSeoVariant(entry);
  if (!variant) return null;

  if (variant.kind === "meta") {
    return (
      <div className="flex items-center gap-3 text-white/90 type-secondary mt-1">
        <span className="flex items-center gap-1">
          <CheckCircle className="w-3.5 h-3.5" />
          {variant.passed} Passed
        </span>
        {variant.failed > 0 && (
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {variant.failed} Need Attention
          </span>
        )}
        <span className="ml-auto text-white/60">
          Total: {variant.entries.length}
        </span>
      </div>
    );
  }

  const sub = seoVariantSub(variant);
  if (!sub) return null;
  return <div className="text-white/90 type-secondary mt-1">{sub}</div>;
}

const FEATURE_TOOL_RENDERERS: ToolRegistry = {
  // ─── SEO ──────────────────────────────────────────────────────────────────
  // The backend consolidated five SEO tools into ONE `seo` tool that dispatches
  // on an `action` argument. SeoInline/SeoOverlay resolve on RESULT SHAPE, so
  // the same pair also serves the legacy tool names still present in persisted
  // conversation history. One renderer, every SEO payload.

  // The `topical_map` agent tool — 28 actions over one brand's topical map
  // (aidream tools/topical_map_tool.py). ONE in-code renderer (R12): tree /
  // get / outline reads render through the shared TopicTree, which a runtime
  // `tool_ui` row cannot import; every other action renders its typed payload.
  topical_map: {
    toolName: "topical_map",
    chrome: "card",
    displayName: "Topical map",
    icon: ListTree,
    accent: "green",
    resultsLabel: "Map result",
    InlineComponent: TopicalMapInline,
    keepExpandedOnStream: true,
    getPhaseLabels: (entry) => {
      const action = topicalMapActionOf(entry);
      const labels = action ? TOPICAL_MAP_ACTION_LABELS[action] : undefined;
      return {
        running: labels?.running ?? `${humanizeAction(action)} (topical map)`,
        complete: labels?.complete ?? humanizeAction(action),
        errorPrefix: `Topical map ${action ? action.replace(/_/g, " ") : "call"} failed`,
      };
    },
    getHeaderSubtitle: (entry) => topicalMapActionOf(entry),
  },

  seo: {
    toolName: "seo",
    chrome: "card",
    displayName: "SEO",
    phaseLabels: {
      running: "Running SEO analysis",
      complete: "Ran SEO analysis",
      errorPrefix: "SEO analysis failed",
    },
    resultsLabel: "SEO Results",
    InlineComponent: SeoInline,
    OverlayComponent: SeoOverlay,
    keepExpandedOnStream: true,
    getHeaderExtras: seoHeaderExtras,
    getHeaderSubtitle: (entry) => {
      const action = getArg<string>(entry, "action");
      switch (action) {
        case "check_batch":
          return "Meta tag check";
        case "check_titles":
          return "Title check";
        case "check_descriptions":
          return "Description check";
        case "keyword_data":
          return "Keyword research";
        case "collect_rank": {
          const keyword = getArg<string>(entry, "keyword");
          return keyword ? `Rank check — ${keyword}` : "Rank check";
        }
        default:
          return null;
      }
    },
  },

  // Legacy names — same components, resolved by shape (persisted history only;
  // the backend no longer emits these).
  seo_check_meta_tags_batch: {
    toolName: "seo_check_meta_tags_batch",
    chrome: "card",
    displayName: "SEO Meta Tags",
    phaseLabels: {
      running: "Checking SEO meta tags",
      complete: "Checked SEO meta tags",
      errorPrefix: "SEO meta-tag check failed",
    },
    resultsLabel: "Meta Tags Results",
    InlineComponent: SeoInline,
    OverlayComponent: SeoOverlay,
    keepExpandedOnStream: true,
    getHeaderExtras: seoHeaderExtras,
  },

  seo_check_meta_titles: {
    toolName: "seo_check_meta_titles",
    chrome: "card",
    displayName: "SEO Title Checker",
    phaseLabels: {
      running: "Checking SEO titles",
      complete: "Checked SEO titles",
      errorPrefix: "SEO title check failed",
    },
    resultsLabel: "Title Results",
    InlineComponent: SeoInline,
    OverlayComponent: SeoOverlay,
    keepExpandedOnStream: true,
    getHeaderExtras: seoHeaderExtras,
  },

  seo_check_meta_descriptions: {
    toolName: "seo_check_meta_descriptions",
    chrome: "card",
    displayName: "SEO Description Checker",
    phaseLabels: {
      running: "Checking SEO descriptions",
      complete: "Checked SEO descriptions",
      errorPrefix: "SEO description check failed",
    },
    resultsLabel: "Description Results",
    InlineComponent: SeoInline,
    OverlayComponent: SeoOverlay,
    keepExpandedOnStream: true,
    getHeaderExtras: seoHeaderExtras,
  },

  seo_get_keyword_data: {
    toolName: "seo_get_keyword_data",
    chrome: "card",
    displayName: "SEO Keyword Data",
    phaseLabels: {
      running: "Researching keywords",
      complete: "Researched keywords",
      errorPrefix: "Keyword research failed",
    },
    resultsLabel: "Keyword Results",
    InlineComponent: SeoInline,
    OverlayComponent: SeoOverlay,
    keepExpandedOnStream: true,
    getHeaderExtras: seoHeaderExtras,
  },

  pick_list: {
    toolName: "pick_list",
    displayName: "Pick list",
    chrome: "card",
    phaseLabels: {
      running: "Building pick list",
      complete: "Pick list ready",
      errorPrefix: "Pick list action failed",
    },
    resultsLabel: "Pick list",
    InlineComponent: PickListInline,
    OverlayComponent: PickListOverlay,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const result = resultAsObject(entry);
      const name =
        (typeof result?.list_name === "string" && result.list_name) ||
        getArg<string>(entry, "picklist_name");
      return typeof name === "string" && name ? name : null;
    },
    getHeaderExtras: (entry) => {
      const result = resultAsObject(entry);
      const count =
        typeof result?.item_count === "number"
          ? (result.item_count as number)
          : undefined;
      if (count == null) return null;
      return (
        <div className="flex items-center gap-3 text-white/90 type-secondary mt-1">
          <span>
            {count} {count === 1 ? "item" : "items"}
          </span>
        </div>
      );
    },
  },

  task: {
    toolName: "task",
    displayName: "Task",
    chrome: "card",
    phaseLabels: {
      running: "Updating task",
      complete: "Updated task",
      errorPrefix: "Task action failed",
    },
    resultsLabel: "Task",
    InlineComponent: TaskInline,
    OverlayComponent: TaskOverlay,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const result = resultAsObject(entry);
      const title =
        (typeof result?.title === "string" && result.title) ||
        getArg<string>(entry, "title");
      return typeof title === "string" && title ? title : null;
    },
  },

  tasks: {
    toolName: "tasks",
    displayName: "Tasks",
    phaseLabels: {
      running: "Updating tasks",
      complete: "Updated tasks",
      errorPrefix: "Task update failed",
    },
    resultsLabel: "Tasks",
    InlineComponent: TaskListInline,
    keepExpandedOnStream: true,
  },

  user_todos: {
    toolName: "user_todos",
    displayName: "Todos",
    phaseLabels: {
      running: "Updating todos",
      complete: "Updated todos",
      errorPrefix: "Todo update failed",
    },
    resultsLabel: "Todos",
    InlineComponent: TaskListInline,
    keepExpandedOnStream: true,
  },

  document: {
    toolName: "document",
    displayName: "Document",
    chrome: "card",
    phaseLabels: {
      running: "Working on document",
      complete: "Document ready",
      errorPrefix: "Document action failed",
    },
    resultsLabel: "Document",
    InlineComponent: DocumentInline,
    OverlayComponent: DocumentOverlay,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const r = resultAsObject(entry);
      const name =
        (typeof r?.name === "string" && r.name) ||
        (typeof r?.title === "string" && r.title);
      return name ? name : null;
    },
  },

  table: {
    toolName: "table",
    displayName: "Table",
    chrome: "card",
    phaseLabels: {
      running: "Working on table",
      complete: "Table ready",
      errorPrefix: "Table action failed",
    },
    resultsLabel: "Table",
    InlineComponent: DatasetInline,
    OverlayComponent: DatasetOverlay,
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const r = resultAsObject(entry);
      const meta =
        r?.metadata && typeof r.metadata === "object"
          ? (r.metadata as Record<string, unknown>)
          : null;
      const name =
        (meta && typeof meta.dataset_name === "string" && meta.dataset_name) ||
        (typeof r?.table_name === "string" && r.table_name);
      return name ? name : null;
    },
  },

  knowledge_search: {
    toolName: "knowledge_search",
    displayName: "Knowledge Search",
    phaseLabels: {
      running: "Searching indexed content",
      complete: "Searched indexed content",
      errorPrefix: "Knowledge search failed",
    },
    resultsLabel: "Knowledge Hits",
    InlineComponent: KnowledgeSearchInline,
    OverlayComponent: KnowledgeSearchOverlay,
    chrome: "card",
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
        <div className="flex items-center gap-3 text-white/90 type-secondary mt-1">
          <span>
            {nHits} {nHits === 1 ? "hit" : "hits"}
          </span>
          {totalCandidates != null && <span>{totalCandidates} candidates</span>}
          {latency != null && <span>{latency} ms</span>}
          {reranker && <span className="ml-auto">{reranker}</span>}
        </div>
      );
    },
  },

  document_search: {
    toolName: "document_search",
    displayName: "Document Search",
    phaseLabels: {
      running: "Searching documents",
      complete: "Searched documents",
      errorPrefix: "Document search failed",
    },
    resultsLabel: "Passages",
    InlineComponent: DocumentSearchInline,
    chrome: "card",
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const query = getArg<string>(entry, "query");
      return typeof query === "string" && query ? query : null;
    },
  },

  // ONE action-dispatched tool (2026-07-18 knowledge-family consolidation).
  // It absorbed rag_list_sources / rag_list_data_stores / rag_get_data_store /
  // rag_get_chunk / knowledge_navigate. The registry maps ONE renderer per tool
  // name, so the per-action split lives inside `KnowledgeBrowseInline` — each
  // action still draws its original purpose-built card.
  knowledge_browse: {
    toolName: "knowledge_browse",
    displayName: "Browse Knowledge",
    phaseLabels: {
      running: "Browsing indexed knowledge",
      complete: "Browsed indexed knowledge",
      errorPrefix: "Couldn't browse indexed knowledge",
    },
    resultsLabel: "Knowledge",
    InlineComponent: KnowledgeBrowseInline,
    OverlayComponent: KnowledgeBrowseInline,
    chrome: "card",
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const result = resultAsObject(entry);
      const action = getArg<string>(entry, "action");

      if (action === "sources" || Array.isArray(result?.sources)) {
        const sources = Array.isArray(result?.sources)
          ? (result.sources as unknown[])
          : null;
        if (!sources) return null;
        return `${sources.length} ${sources.length === 1 ? "source" : "sources"}`;
      }

      if (action === "stores" || Array.isArray(result?.data_stores)) {
        const stores = Array.isArray(result?.data_stores)
          ? (result.data_stores as unknown[])
          : null;
        if (!stores) return null;
        return `${stores.length} ${stores.length === 1 ? "store" : "stores"}`;
      }

      if (action === "store") {
        const name = typeof result?.name === "string" ? result.name : null;
        const total =
          typeof result?.total_members === "number"
            ? (result.total_members as number)
            : null;
        const parts: string[] = [];
        if (name) parts.push(name);
        if (total != null)
          parts.push(`${total} ${total === 1 ? "member" : "members"}`);
        return parts.length ? parts.join(" · ") : null;
      }

      if (action === "entity") {
        const entity =
          result?.entity && typeof result.entity === "object"
            ? (result.entity as Record<string, unknown>)
            : null;
        const name =
          (typeof entity?.name === "string" && entity.name) ||
          getArg<string>(entry, "entity") ||
          null;
        const mentions =
          typeof result?.total_mentions === "number"
            ? (result.total_mentions as number)
            : null;
        const parts: string[] = [];
        if (name) parts.push(name);
        if (mentions != null)
          parts.push(
            `${mentions.toLocaleString()} ${mentions === 1 ? "mention" : "mentions"}`,
          );
        return parts.length ? parts.join(" · ") : null;
      }

      // chunk (the remaining action) — pages + token count.
      const tokens =
        typeof result?.token_count === "number"
          ? (result.token_count as number)
          : null;
      const pages = Array.isArray(result?.page_numbers)
        ? (result.page_numbers as unknown[]).filter(
            (p) => typeof p === "number",
          )
        : [];
      const parts: string[] = [];
      if (pages.length)
        parts.push(
          pages.length === 1 ? `Page ${pages[0]}` : `${pages.length} pages`,
        );
      if (tokens != null) parts.push(`${tokens.toLocaleString()} tokens`);
      return parts.length ? parts.join(" · ") : null;
    },
  },

  document_content: {
    toolName: "document_content",
    displayName: "Document Content",
    phaseLabels: {
      running: "Reading the document",
      complete: "Read the document",
      errorPrefix: "Couldn't read the document",
    },
    resultsLabel: "Document Content",
    InlineComponent: DocumentContentInline,
    OverlayComponent: DocumentContentInline,
    chrome: "card",
    keepExpandedOnStream: true,
    getHeaderSubtitle: (entry) => {
      const result = resultAsObject(entry);
      const name = typeof result?.name === "string" ? result.name : null;
      const view = resolveDocumentContentView(entry);
      const parts: string[] = [];
      if (name) parts.push(name);
      if (view) parts.push(view.replaceAll("_", " "));
      return parts.length ? parts.join(" · ") : null;
    },
  },

  note: {
    toolName: "note",
    displayName: "Note",
    phaseLabels: {
      running: "Saving note",
      complete: "Saved note",
      errorPrefix: "Note save failed",
    },
    resultsLabel: "Note",
    InlineComponent: NoteToolInline,
    OverlayComponent: NoteToolOverlay,
    // A saved-note card is reference material the user keeps using — don't
    // auto-collapse it a few seconds after the tool finishes.
    displayMode: "stay-open",
    getHeaderSubtitle: (entry) => {
      const result = resultAsObject(entry);
      return typeof result?.label === "string" && result.label
        ? (result.label as string)
        : null;
    },
  },
};

// The table tool was named `dataset` until 2026-10-07. The DB row and older saved conversations
// still carry that name during the rename window; both draw the same card.
FEATURE_TOOL_RENDERERS.dataset = { ...FEATURE_TOOL_RENDERERS.table, toolName: "dataset" };

for (const [toolName, renderer] of Object.entries(FEATURE_TOOL_RENDERERS)) {
  registerToolRenderer(toolName, renderer);
}

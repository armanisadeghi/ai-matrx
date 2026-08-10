"use client";

/**
 * RagSearchExperience — the multi-tab RAG search page mounted at /rag/search.
 *
 * Replaces the single-pane RagSearchPage. Four tabs:
 *
 *   1. Search          — clean user-facing search with rich, full-text results
 *   2. Agent Simulation — power-user view: raw request/response JSON, multi-
 *                          query + HyDE preview, per-hit score breakdown,
 *                          assembled-prompt preview as the AI would see it
 *   3. Agent Chat      — the canonical managed-agent system (same stack as
 *                          /chat) launched on the `matrx-user/rag-search`
 *                          surface with the RAG tool family armed, so the
 *                          agent searches the page's retrieval scope
 *   4. Diagnostics     — caller's content inventory, per-route visibility
 *                          breakdown, per-query trace, admin ACL-bypass
 *
 * Designed for admins demoing the RAG system. The Search tab should also
 * feel polished enough for any normal user.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertCircle,
  Beaker,
  Brain,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Database,
  FileText,
  FlaskConical,
  GitMerge,
  Loader2,
  MessageSquare,
  PanelLeftOpen,
  Play,
  Search as SearchIcon,
  Send,
  Settings2,
  Stethoscope,
  Layers,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { RagHubHeader } from "@/features/rag/components/shell/RagHubHeader";

import {
  ragSearch,
  type RagSearchHit,
  type RagSearchResponse,
} from "@/features/rag/api/search";
import {
  ragAgentToolGetChunk,
  ragAgentToolSearch,
  ragDiagnoseStream,
  ragInventory,
  type AgentToolGetChunkResponse,
  type AgentToolSearchOne,
  type AgentToolSearchResponse,
  type DiagnoseHit,
  type DiagnoseResponse,
  type ExpandResponse,
  type InventoryResponse,
} from "@/features/rag/api/search-lab";
import { useDataStores } from "@/features/rag/hooks/useDataStores";
import { useRagSearchContext } from "@/features/rag/hooks/useRagSearchContext";
import { useFilesLibraryProvenance } from "@/features/rag/hooks/useLibraryProvenance";
import { useOpenCitation } from "@/features/rag/components/source-inspector/useOpenCitation";
import { RagHitCard } from "@/features/rag/components/hit-card/RagHitCard";
import {
  canonicalSourceNameForHit,
  hitViewFromSearchHit,
} from "@/features/rag/components/hit-card/adapters";
import { getHighlightTerms } from "@/features/rag/components/hit-card/query-highlighting";
import { RagPageReferences } from "@/features/rag/components/search/RagPageReferences";
import { RagReviewRepairWorkspace } from "@/features/rag/components/search/RagReviewRepairWorkspace";
import {
  buildRagReviewPages,
  pageCountFromRagHit,
} from "@/features/rag/components/search/ragReviewPages";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import {
  clampMultiQuery,
  clampResultLimit,
  isValidMultiQuery,
  isValidResultLimit,
  MULTI_QUERY_MAX,
  MULTI_QUERY_MIN,
  PIPELINE_FLAG_KEYS,
  PIPELINE_PATCH_KEYS,
  RESULT_LIMIT_DEFAULT,
  RESULT_LIMIT_MAX,
  RESULT_LIMIT_MIN,
  SEARCH_QUERY_MAX_CHARS,
} from "@/features/rag/constants/search-pipeline";
import { AnimatedKpiCard } from "@/features/rag/components/library/AnimatedKpiCard";
import { ActiveContextPanel } from "@/features/scopes/components/active-context/ActiveContextPanel";
import { ActiveScopeChips } from "@/features/scopes/components/active-context/ActiveScopeChips";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_NEW_CHAT_SLOT_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import { useAgentSlot } from "@/features/agents/slots/useAgentSlot";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import { createRagSearchScope } from "@/features/surfaces/manifests/rag-search.manifest";
import {
  buildRagSearchContextData,
  RAG_SEARCH_CONTEXT_MENU_PROPS,
} from "@/features/rag/agent-context/buildRagSearchContextData";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  MULTI_QUERY_DEFAULT,
  MULTI_QUERY_MAX,
  MULTI_QUERY_MIN,
  SOURCE_KIND_FILTERS,
  SOURCE_KIND_FILTER_BY_VALUE,
  SOURCE_KIND_FILTER_ENUM_TEXT,
  isSourceKindFilter,
  isValidMultiQuery,
  type SourceKindFilter,
} from "@/features/rag/search-controls";
import { ProInput } from "@/components/official/ProInput";

// Universal v3 context menu — the SAME menu everywhere. The wrappers are the
// lightweight shell (imported statically); MenuContent lazy-loads on first
// open. The search box uses the editable wrapper (text replace on the query),
// the presentational results use the read-only wrapper (Copy/AI/Export/Convert
// via the DOM-content fallback).
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

// ===========================================================================
// Agent Chat surface — the "Agent Chat" tab embeds the canonical agent system
// (same stack as /chat and the Projects "Use AI" tab), NOT a bespoke chat.
// ===========================================================================

/** Surface registered in `features/surfaces/manifests/rag-search.manifest.ts`. */
const RAG_SEARCH_SURFACE = "matrx-user/rag-search";
const RAG_SEARCH_SOURCE_FEATURE: SourceFeature = "rag-search";
// The chat agent is the `chat.default_new_chat` SLOT (resolved in
// AgentChatTab — the user's own binding wins); the RAG tools below are armed
// onto its run regardless of which agent resolves.

/**
 * Knowledge tool family (registry tool UUIDs from `tool.definition`). Armed
 * additively on the conversation via `addedTools` so the agent can actually
 * search the user's indexed content, list/inspect data stores, fetch chunks,
 * and verify answers — even when the base chat agent doesn't ship these tools
 * by default. The server tool-merge funnel adds `document_content` whenever
 * one of the knowledge search tools is present, so every agent surface receives
 * the physical-page validation companion consistently. The conversation also
 * receives the page's retrieval scope via `runtime.applicationScope` (see
 * `createRagSearchScope`).
 *
 * Twelve tools were consolidated into six on 2026-07-18. Tool ids are STABLE
 * across a rename, so the four survivors below kept their ids — but the four
 * absorbed tools this list used to arm (`rag_search_data_store`,
 * `rag_list_data_stores`, `rag_get_data_store`, `rag_get_chunk`) are now
 * soft-deleted `tool.definition` rows and have been removed. Their capability
 * lives on as `knowledge_search(data_store_id=…)` and the `knowledge_browse`
 * actions (`stores` / `store` / `chunk`), which the ids below already arm.
 */
const RAG_AGENT_TOOL_IDS = [
  "3921fc69-0763-4538-9e36-5a29a088a5bd", // knowledge_search (was rag_search)
  "df009bb5-1b9a-49a4-8db1-90b654f970a2", // knowledge_browse (was rag_list_sources)
  "16964a48-af53-423d-a3c4-0ff3a0a061eb", // knowledge_compare (was rag_search_cross_doc)
  "cb86a0ca-439e-4e63-be45-44c2dcd159f5", // verify (was rag_verify_answer)
];

// ===========================================================================
// Shared
// ===========================================================================

/** Hits requested per Search-tab search. Emitted as the surface's `result_limit`. */
const SEARCH_TAB_RESULT_LIMIT = 25;

/** Max length the `search_query` write target accepts from an agent. */
const SEARCH_QUERY_MAX_CHARS = 1000;

function useScopeControls(initialStoreId: string | null = null) {
  const stores = useDataStores();
  // Seed from the deep-link `?store_id=` synchronously so a shared search URL
  // restores its data-store scope (and the auto-run uses it) without a race.
  const [storeId, setStoreId] = useState<string | null>(initialStoreId);
  const [kindFilter, setKindFilter] = useState<SourceKindFilter>("all");
  const [adminBypass, setAdminBypass] = useState(false);
  const [rerank, setRerank] = useState(true);
  const [multiQuery, setMultiQuery] = useState(MULTI_QUERY_MIN);
  const [useHyde, setUseHyde] = useState(false);
  const [expandClusters, setExpandClusters] = useState(false);
  // Hits requested per Search-tab search — a sidebar control (not a constant)
  // so the surface's `result_limit` has a place the user can see and correct
  // whatever writes it. Emitted as the surface's `result_limit`.
  const [resultLimit, setResultLimit] = useState(RESULT_LIMIT_DEFAULT);

  // Resolved wire value for the current filter — `undefined` for "all" (send
  // no source_kinds at all). The mapping lives in the shared vocabulary so the
  // toggle, this resolution, and the agent contract cannot drift apart.
  const sourceKinds = useMemo<string[] | undefined>(() => {
    const kinds = SOURCE_KIND_FILTER_BY_VALUE[kindFilter].sourceKinds;
    return kinds ? [...kinds] : undefined;
  }, [kindFilter]);

  return {
    stores,
    storeId,
    setStoreId,
    kindFilter,
    setKindFilter,
    sourceKinds,
    adminBypass,
    setAdminBypass,
    rerank,
    setRerank,
    multiQuery,
    setMultiQuery,
    useHyde,
    setUseHyde,
    expandClusters,
    setExpandClusters,
    resultLimit,
    setResultLimit,
  };
}

type Scope = ReturnType<typeof useScopeControls>;

// ---------------------------------------------------------------------------
// Rich hit card — the canonical RagHitCard (expanded), shared between the
// Search tab and the Agent Simulation / Diagnostics tabs.
// ---------------------------------------------------------------------------

function citationHrefFor(
  source_kind: string,
  source_id: string,
  page: number | null,
  chunk_id: string,
): string {
  // Mirrors the module-level citationHrefFor in features/rag/api/search.ts —
  // keep the two in sync. Every kind gets a destination (no dead nulls),
  // library_doc carries the page so a result opens on the hit's page (the
  // /rag/viewer route forwards ?page), and every interpolated id is
  // URL-encoded so ids containing ? & # don't break the link.
  const sid = encodeURIComponent(source_id);
  const cid = encodeURIComponent(chunk_id);
  const pageQs = page ? `&page=${page}` : "";
  switch (source_kind) {
    case "cld_file":
      return `/files/f/${sid}?tab=document&chunk=${cid}${pageQs}`;
    case "note":
      return `/notes/${sid}`;
    case "code_file":
      return `/code/${sid}`;
    case "library_doc":
      return `/rag/viewer/${sid}?chunk=${cid}${pageQs}`;
    case "transcript":
      return `/transcription/studio?session=${sid}`;
    case "scraped":
      return `/scraper?url=${sid}`;
    default:
      return `/rag/viewer/${sid}?chunk=${cid}${pageQs}`;
  }
}

function RichHitCard({
  rank,
  hit,
  topScore,
  highlightQuery,
  defaultExpanded,
  expanded,
  onExpandedChange,
  onReviewRepair,
  sourceName,
  libraryProvenance = null,
}: {
  rank: number;
  hit: RagSearchHit | DiagnoseHit;
  topScore?: number;
  highlightQuery?: string;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onReviewRepair?: () => void;
  sourceName?: string | null;
  /** Shared-library grant provenance label, batch-resolved by the list
   *  (`useFilesLibraryProvenance`) — never fetched per card. */
  libraryProvenance?: string | null;
  /** Retained for call-site compatibility; the expanded canonical card always
   *  shows the full chunk + breakdown. */
  showFullText?: boolean;
  showBreakdown?: boolean;
}) {
  const view = hitViewFromSearchHit(hit, {
    name: sourceName,
    libraryProvenance,
  });
  const href = citationHrefFor(
    hit.source_kind,
    hit.source_id,
    view.pageNumber,
    hit.chunk_id,
  );
  const openCitation = useOpenCitation();
  const openHit = () =>
    openCitation({
      sourceKind: hit.source_kind,
      sourceId: hit.source_id,
      href,
      chunkId: hit.chunk_id,
      pageNumber: view.pageNumber,
      pageNumbers: view.pageNumbers,
      snippet: view.snippet,
      fileName: view.title,
      score: view.score,
      query: highlightQuery ?? null,
    });

  return (
    <RagHitCard
      view={view}
      variant="expanded"
      rank={rank}
      topScore={topScore}
      href={href}
      highlightQuery={highlightQuery}
      defaultExpanded={defaultExpanded}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      onReviewRepair={onReviewRepair}
      expandedContent={(snippet, resources) =>
        hit.source_kind === "cld_file" || hit.source_kind === "library_doc" ? (
          <RagPageReferences
            sourceKind={hit.source_kind}
            sourceId={hit.source_id}
            pageNumber={view.pageNumber}
            pageNumbers={view.pageNumbers}
            onOpenPdf={openHit}
            resourceRequest={resources.request}
            onAvailabilityChange={resources.onAvailabilityChange}
            aiBundle={resources.aiBundle}
          >
            {snippet}
          </RagPageReferences>
        ) : (
          <div className="px-3 py-2.5">{snippet}</div>
        )
      }
      onOpen={openHit}
    />
  );
}

// ---------------------------------------------------------------------------
// Hit card skeleton — shown while a search/diagnose is in-flight so the
// page doesn't go visually empty between submit and first result render.
// Sized to match RichHitCard so the layout doesn't jump when real hits land.
// ---------------------------------------------------------------------------

function HitCardSkeleton() {
  return (
    <div className="rounded-md border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-16 ml-auto" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-11/12" />
      <Skeleton className="h-3 w-9/12" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Motion presets — keep entrance animations consistent across tabs so the
// RAG surfaces share the same UX language as the library motion stack.
// ---------------------------------------------------------------------------

const FADE_IN_UP = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.18, ease: "easeOut" as const },
};

// ---------------------------------------------------------------------------
// JSON inspector — pretty-printed, copyable
// ---------------------------------------------------------------------------

function JsonInspector({
  label,
  value,
  collapsed = false,
}: {
  label: string;
  value: unknown;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  const pretty = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <div className="rounded-md border bg-muted/20">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-mono uppercase tracking-wide text-muted-foreground hover:text-foreground flex-1 text-left"
        >
          {open ? "▾" : "▸"} {label}
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(pretty);
            toast.success("Copied to clipboard");
          }}
          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
      {open && (
        <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-all max-h-96 overflow-auto text-foreground/90">
          {pretty}
        </pre>
      )}
    </div>
  );
}

// ===========================================================================
// Tab: Scope sidebar (shared across tabs)
// ===========================================================================

function ScopeSidebar({
  scope,
  variant = "desktop",
}: {
  scope: Scope;
  /**
   * `desktop` — fixed 16rem column, `border-r`.
   * `drawer`  — fills the parent Drawer, no border-r, full width.
   * Same internal layout in both modes so the mobile drawer is a true
   * port of the desktop sidebar (not a redesigned cousin).
   */
  variant?: "desktop" | "drawer";
}) {
  return (
    <aside
      className={cn(
        "flex flex-col overflow-hidden",
        variant === "desktop" && "w-64 border-r shrink-0",
        variant === "drawer" && "w-full h-full",
      )}
    >
      <div
        className={cn(
          "px-3 py-2 border-b flex items-center gap-2",
          variant === "desktop" && "pt-[var(--shell-header-h)]",
        )}
      >
        <Database className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold flex-1">Search scope</h2>
      </div>

      <div className="border-b px-2 py-2">
        <div className="mb-2 flex items-center gap-2 px-1 text-xs">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold">Working context</span>
        </div>
        <ActiveContextPanel
          checkboxVariant="standard"
          sectionHeight={variant === "drawer" ? 280 : 220}
          fill={variant === "drawer"}
          className="rounded-md border bg-card"
        />
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-1">
          <ScopeRow
            label="All accessible content"
            sublabel="Your docs + org + global library"
            selected={scope.storeId === null}
            onClick={() => scope.setStoreId(null)}
          />
          {scope.stores.loading && (
            <div className="px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading stores…
            </div>
          )}
          {scope.stores.stores.map((s) => (
            <ScopeRow
              key={s.id}
              label={s.name}
              sublabel={`${s.memberCount} members${s.kind ? ` · ${s.kind}` : ""}`}
              selected={s.id === scope.storeId}
              onClick={() => scope.setStoreId(s.id)}
            />
          ))}
        </div>
      </ScrollArea>

      <Separator />

      <div className="px-3 py-2 space-y-2 border-t">
        <div className="flex items-center gap-2 text-xs">
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold">Pipeline</span>
        </div>
        <KindToggle value={scope.kindFilter} onChange={scope.setKindFilter} />
        <label
          className="flex items-center gap-2 text-xs cursor-pointer"
          title="Re-orders the fused candidates with Cohere's rerank-v4.0-pro cross-encoder (reads each candidate against your query text). Retrieval itself runs on Voyage voyage-4-large embeddings; when the whole window scores low-confidence the fusion order is kept instead."
        >
          <Checkbox
            checked={scope.rerank}
            onCheckedChange={(v) => scope.setRerank(v === true)}
          />
          <span>Rerank results</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={scope.useHyde}
            onCheckedChange={(v) => scope.setUseHyde(v === true)}
          />
          <span>HyDE expansion</span>
        </label>
        <label
          className="flex items-center gap-2 text-xs cursor-pointer"
          title="Also surface chunks about entities that share a knowledge-graph cluster with your query's matched entities (canonical concept expansion). Broadens recall — the reranker filters. Cross-spelling matches (e.g. 'HTN' → 'hypertension') work regardless of this toggle."
        >
          <Checkbox
            checked={scope.expandClusters}
            onCheckedChange={(v) => scope.setExpandClusters(v === true)}
          />
          <span>Expand entity clusters</span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Multi-query</span>
          <input
            type="number"
            min={MULTI_QUERY_MIN}
            max={MULTI_QUERY_MAX}
            value={scope.multiQuery}
            onChange={(e) =>
              scope.setMultiQuery(
                Math.max(
                  MULTI_QUERY_MIN,
                  Math.min(
                    MULTI_QUERY_MAX,
                    Number(e.target.value) || MULTI_QUERY_DEFAULT,
                  ),
                ),
              )
            }
            className="w-14 px-1.5 py-1 text-base rounded border bg-background"
          />
        </label>
        <label
          className="flex items-center gap-2 text-xs"
          title={`How many hits one search asks for (${RESULT_LIMIT_MIN}-${RESULT_LIMIT_MAX}). Applies to the Search tab; the Agent Simulation tab reproduces the registered tool's own limit.`}
        >
          <span className="text-muted-foreground">Limit</span>
          <input
            type="number"
            min={RESULT_LIMIT_MIN}
            max={RESULT_LIMIT_MAX}
            value={scope.resultLimit}
            onChange={(e) =>
              scope.setResultLimit(clampResultLimit(Number(e.target.value)))
            }
            className="w-14 px-1.5 py-1 text-base rounded border bg-background"
            data-surface-value="result_limit"
          />
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer text-amber-700 dark:text-amber-400">
          <Checkbox
            checked={scope.adminBypass}
            onCheckedChange={(v) => scope.setAdminBypass(v === true)}
          />
          <span>Admin: bypass ACL</span>
        </label>
      </div>
    </aside>
  );
}

function ScopeRow({
  label,
  sublabel,
  selected,
  onClick,
}: {
  label: string;
  sublabel: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded border-b border-border/50 hover:bg-muted/40",
        selected && "bg-muted/60",
      )}
    >
      <div className="text-xs font-medium truncate">{label}</div>
      <div className="text-[10px] text-muted-foreground truncate">
        {sublabel}
      </div>
    </button>
  );
}

function KindToggle({
  value,
  onChange,
}: {
  value: SourceKindFilter;
  onChange: (v: SourceKindFilter) => void;
}) {
  return (
    <div className="flex items-center rounded-md border p-0.5 text-[11px]">
      {SOURCE_KIND_FILTERS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-1.5 py-0.5 rounded transition-colors flex-1",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted/40 text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ===========================================================================
// Tab 1 — Search
// ===========================================================================

// ---------------------------------------------------------------------------
// Scope summary — the legible "what am I actually searching?" line. Sits under
// the search box so the user can SEE the resolved retrieval scope (store, org,
// scope tags, source kinds) before trusting any result. Kills the #1 confusion:
// an empty org filter means "ALL my orgs", not "nothing".
// ---------------------------------------------------------------------------

function SearchScopeSummary({
  scope,
  storeName,
  scopeIds,
  organizationId,
}: {
  scope: Scope;
  storeName: string | undefined;
  scopeIds: string[] | null | undefined;
  organizationId: string | null | undefined;
}) {
  const scopeCount = scopeIds?.length ?? 0;
  const kindLabel =
    scope.kindFilter === "all"
      ? "all kinds"
      : scope.kindFilter === "cld_file"
        ? "files"
        : scope.kindFilter === "note"
          ? "notes"
          : "code";

  return (
    <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
      <span className="uppercase tracking-wide text-[10px] font-medium">
        Searching
      </span>
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
        {storeName
          ? `store · ${storeName}`
          : scope.storeId
            ? "store · …" // selected (e.g. from a deep link) but list still loading
            : "all accessible content"}
      </Badge>
      <span aria-hidden>·</span>
      <Badge
        variant={organizationId ? "secondary" : "outline"}
        className="text-[10px] px-1.5 py-0 font-normal"
        title={
          organizationId
            ? "Restricted to one organization."
            : "No org filter — searching across EVERY organization you belong to plus your personal content and the global library."
        }
      >
        {organizationId ? "1 org" : "all your orgs"}
      </Badge>
      {scopeCount > 0 && (
        <>
          <span aria-hidden>·</span>
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 font-normal"
            title="Structural filter: only sources tagged to these scopes are eligible (combined with the semantic query)."
          >
            {scopeCount} scope{scopeCount === 1 ? "" : "s"}
          </Badge>
        </>
      )}
      <span aria-hidden>·</span>
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
        {kindLabel}
      </Badge>
      {scope.adminBypass && (
        <>
          <span aria-hidden>·</span>
          <Badge
            variant="warning"
            className="text-[10px] px-1.5 py-0 font-normal"
            title="Admin ACL bypass is ON — results include content you would not normally be permitted to see."
          >
            ACL bypass
          </Badge>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Query-term coverage — "did each word I typed actually land in any result?"
// Computed from the returned hits (NOT a corpus count), honestly labeled, so
// the user can see at a glance that e.g. "indemnification" appeared in zero
// results even though 5 hits came back. Answers the user's "am I getting what
// I put in?" directly.
// ---------------------------------------------------------------------------

function QueryTermCoverage({
  query,
  hits,
}: {
  query: string;
  hits: { snippet: string | null }[];
}) {
  const terms = getHighlightTerms(query);
  if (terms.length < 2 || hits.length === 0) return null;

  const haystacks = hits.map((h) => (h.snippet ?? "").toLowerCase());
  const coverage = terms.map((t) => ({
    term: t,
    count: haystacks.filter((s) => s.includes(t)).length,
  }));
  const missing = coverage.filter((c) => c.count === 0);

  return (
    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
      <span className="text-muted-foreground uppercase tracking-wide text-[10px]">
        Terms in results
      </span>
      {coverage.map((c) => (
        <Badge
          key={c.term}
          variant={c.count === 0 ? "warning" : "secondary"}
          className="text-[10px] px-1.5 py-0 font-normal"
          title={
            c.count === 0
              ? `"${c.term}" did not appear in any returned result — these hits matched on the other terms or on meaning, not this word.`
              : `"${c.term}" appears in ${c.count} of ${hits.length} results.`
          }
        >
          {c.term} {c.count === 0 ? "✕ 0" : c.count}
        </Badge>
      ))}
      {missing.length > 0 && (
        <span className="text-muted-foreground/80">
          · {missing.length} term{missing.length === 1 ? "" : "s"} matched
          nothing here
        </span>
      )}
    </div>
  );
}

function SearchTab({
  scope,
  onReviewModeChange,
}: {
  scope: Scope;
  onReviewModeChange?: (active: boolean) => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const initialQuery = params?.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<RagSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedHits, setExpandedHits] = useState<Record<string, boolean>>({});
  const [reviewHit, setReviewHit] = useState<RagSearchHit | null>(null);
  const openCitation = useOpenCitation();
  // Guards against a slow earlier search resolving after a newer one and
  // overwriting it (the `disabled={running}` button guard isn't synchronous).
  const seqRef = useRef(0);

  const sourceKindFilters = useMemo(
    () =>
      scope.sourceKinds
        ? {
            source_kinds: scope.sourceKinds as (
              "cld_file" | "note" | "code_file"
            )[],
          }
        : undefined,
    [scope.sourceKinds],
  );
  const searchContext = useRagSearchContext(sourceKindFilters);

  // Shared-library provenance — ONE batch per result set, threaded into the
  // expanded cards ("Shared library · via <industry>").
  const provenanceFileIds = useMemo(
    () =>
      (response?.hits ?? [])
        .filter((h) => h.source_kind === "cld_file")
        .map((h) => h.source_ref?.file_id ?? h.source_id),
    [response?.hits],
  );
  const { labelByFile: provenanceByFile } =
    useFilesLibraryProvenance(provenanceFileIds);

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const seq = ++seqRef.current;
    setRunning(true);
    setError(null);
    setResponse(null);
    setReviewHit(null);
    onReviewModeChange?.(false);
    try {
      const r = await ragSearch({
        query: trimmed,
        limit: scope.resultLimit,
        rerank: scope.rerank,
        // Honor the sidebar Pipeline controls in the plain Search tab too —
        // previously HyDE / multi-query / MMR were wired only into the Agent
        // tabs, so toggling them here silently did nothing.
        use_hyde: scope.useHyde,
        multi_query: scope.multiQuery,
        use_mmr: true,
        expand_entity_clusters: scope.expandClusters || undefined,
        only_children: true,
        data_store_id: scope.storeId ?? undefined,
        admin_bypass_acl: scope.adminBypass || undefined,
        ...searchContext,
      });
      if (seq !== seqRef.current) return; // superseded by a newer search
      setResponse(r);
      setExpandedHits(
        Object.fromEntries(
          r.hits.map((hit, index) => [hit.chunk_id, index === 0]),
        ),
      );

      const next = new URLSearchParams();
      if (trimmed) next.set("q", trimmed);
      if (scope.storeId) next.set("store_id", scope.storeId);
      router.replace(`/rag/search${next.toString() ? `?${next}` : ""}`);
    } catch (e) {
      if (seq !== seqRef.current) return;
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      if (seq === seqRef.current) setRunning(false);
    }
  }, [query, scope, router, searchContext, onReviewModeChange]);

  // Arriving with a `?q=` deep link (e.g. from the document viewer's "AI
  // search — everything" hand-off) auto-runs the search once, so the user
  // lands on results rather than a pre-filled box they must re-submit.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!initialQuery.trim()) return;
    autoRanRef.current = true;
    const timer = window.setTimeout(() => runSearch(), 0);
    return () => window.clearTimeout(timer);
  }, [initialQuery, runSearch]);

  // Live input ref — `getApplicationScope` reads the selection off it at
  // click-time so surface scope is never stale React state.
  const queryInputRef = useRef<HTMLInputElement | null>(null);

  const storeName = useMemo(
    () =>
      scope.storeId
        ? scope.stores.stores.find((s) => s.id === scope.storeId)?.name
        : undefined,
    [scope.storeId, scope.stores.stores],
  );

  // The store list the sidebar offers, in the surface's declared shape.
  const dataStoreEntries = useMemo(
    () =>
      scope.stores.stores.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        member_count: s.memberCount,
      })),
    [scope.stores.stores],
  );

  // Canonical `contextData` for `matrx-user/rag-search` — pure mapping of live
  // search state (query, retrieval scope, pipeline flags) + the latest results.
  const contextData = buildRagSearchContextData({
    query,
    dataStoreId: scope.storeId,
    dataStoreName: storeName,
    sourceKinds: scope.sourceKinds,
    adminBypass: scope.adminBypass,
    rerank: scope.rerank,
    multiQuery: scope.multiQuery,
    useHyde: scope.useHyde,
    expandClusters: scope.expandClusters,
    resultLimit: scope.resultLimit,
    activeOrganizationId: searchContext.filters?.organization_id,
    activeScopeIds:
      searchContext.scope_ids ?? searchContext.filters?.scope_ids ?? null,
    availableDataStores: dataStoreEntries,
    response,
  });

  // Plain function (NOT useCallback) — React Compiler memoizes it, and it must
  // read the live DOM selection at call time. Used by both the editable search
  // box (live input value/selection wins) and the presentational results.
  const getApplicationScope = () => {
    const el = queryInputRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    const selectedText =
      el && start !== end
        ? el.value.slice(Math.min(start, end), Math.max(start, end))
        : "";
    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange: el ? { type: "editable", element: el, start, end } : null,
      contextData,
    });
  };

  // Presentational results read from the live browser selection (the rendered
  // passages are not an editable element), so no input ref is threaded.
  const getResultsApplicationScope = () =>
    buildApplicationScopeFromMenuContext({
      selectedText: window.getSelection()?.toString() ?? "",
      selectionRange: null,
      contextData,
    });
  // ── Write half of the RAG Search surface (manifest `writeTargets`) ───────
  // An agent may STAGE the next search — the query text and how hard the
  // pipeline looks for it. It may never touch the retrieval SCOPE (data store,
  // source kinds, working-context org/scopes, ACL bypass): that is what the
  // search is ALLOWED to see, and nothing here declares a target for it, so
  // the seam refuses those by name. Running the search stays the user's press.
  //
  // Both handlers validate against the SAME `search-pipeline` constants the
  // manifest's contract prose is interpolated from, and THROW on a bad shape
  // (the writeback seam turns a throw into a safe error envelope the agent
  // reads). Every setter below is a stable useState setter and nothing is read
  // off this closure, so a turn that stages both targets cannot half-apply one
  // against a stale snapshot — and the five interdependent pipeline dials are
  // ONE object target, resolved in a single call.
  const getSurfaceWriteHandlers = () => ({
    search_query: (value: unknown) => {
      if (typeof value !== "string")
        throw new Error(
          `search_query expects a plain text string, got ${Array.isArray(value) ? "an array" : typeof value}. Send the query words themselves as text — not JSON, and not an object.`,
        );
      const next = value.trim();
      if (!next) throw new Error("search_query expects a non-empty string.");
      if (next.length > SEARCH_QUERY_MAX_CHARS)
        throw new Error(
          `search_query is limited to ${SEARCH_QUERY_MAX_CHARS} characters (got ${next.length}). Send the query, not the document.`,
        );
      setQuery(next);
    },
    retrieval_pipeline: (value: unknown) => {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(
          `retrieval_pipeline expects an object with any of: ${PIPELINE_PATCH_KEYS.join(", ")}. Send it as structured data, not as a JSON string.`,
        );
      const patch = value as Record<string, unknown>;
      const unsupported = Object.keys(patch).filter(
        (key) => !PIPELINE_PATCH_KEYS.includes(key),
      );
      if (unsupported.length > 0)
        throw new Error(
          `retrieval_pipeline got unsupported key(s): ${unsupported.join(", ")}. Accepted keys: ${PIPELINE_PATCH_KEYS.join(" | ")}. The retrieval scope (data store, source kinds, organization, scopes, ACL bypass) is not writable on this surface — it decides what the search is permitted to see.`,
        );
      if (!PIPELINE_PATCH_KEYS.some((key) => key in patch))
        throw new Error(
          `retrieval_pipeline needs at least one of: ${PIPELINE_PATCH_KEYS.join(" | ")}.`,
        );

      // Validate EVERY key before any state moves — a rejected key must never
      // leave half a settings change staged in the sidebar.
      for (const key of PIPELINE_FLAG_KEYS) {
        if (key in patch && typeof patch[key] !== "boolean")
          throw new Error(
            `retrieval_pipeline.${key} expects a boolean (true or false).`,
          );
      }
      if ("multi_query" in patch && !isValidMultiQuery(patch.multi_query))
        throw new Error(
          `retrieval_pipeline.multi_query expects a whole number from ${MULTI_QUERY_MIN} to ${MULTI_QUERY_MAX} (${MULTI_QUERY_MIN} = no expansion).`,
        );
      if ("result_limit" in patch && !isValidResultLimit(patch.result_limit))
        throw new Error(
          `retrieval_pipeline.result_limit expects a whole number from ${RESULT_LIMIT_MIN} to ${RESULT_LIMIT_MAX} (default ${RESULT_LIMIT_DEFAULT}).`,
        );

      if ("rerank" in patch) scope.setRerank(patch.rerank as boolean);
      if ("use_hyde" in patch) scope.setUseHyde(patch.use_hyde as boolean);
      if ("expand_entity_clusters" in patch)
        scope.setExpandClusters(patch.expand_entity_clusters as boolean);
      if ("multi_query" in patch)
        scope.setMultiQuery(patch.multi_query as number);
      if ("result_limit" in patch)
        scope.setResultLimit(patch.result_limit as number);
    },
  });

  const setAllResultsExpanded = (expanded: boolean) => {
    if (!response) return;
    setExpandedHits(
      Object.fromEntries(response.hits.map((hit) => [hit.chunk_id, expanded])),
    );
  };
  const resultExpansionStates =
    response?.hits.map(
      (hit, index) => expandedHits[hit.chunk_id] ?? index === 0,
    ) ?? [];
  const allResultsExpanded =
    resultExpansionStates.length > 0 && resultExpansionStates.every(Boolean);
  const allResultsCollapsed =
    resultExpansionStates.length > 0 &&
    resultExpansionStates.every((expanded) => !expanded);

  // Write handlers for the surface's declared `writeTargets` — the agent
  // stages the next search request, the user still presses Search.
  //
  // Every handler dispatches the SAME setter the user's own typing/clicking
  // dispatches (`setQuery`, `scope.setRerank`, …), so a staged value is
  // visible and editable the instant it lands and there is no parallel write
  // path to drift. Nothing here is persisted: this surface's editable state is
  // all local `useState`, which is exactly what `mode: "draft"` means for it.
  //
  // Validation THROWS. `applySurfaceWrite` converts a throw into a safe error
  // envelope the agent reads and can correct from, so a wrong value must be
  // refused loudly rather than coerced — a silently clamped multi-query or a
  // truthy-coerced "false" would leave the user with a search they did not ask
  // for and the agent believing it succeeded.
  const buildWriteHandlers = (): SurfaceWriteHandlers => {
    // A search in flight has its inputs locked and its request already sent;
    // staging into them would edit the next run while the user is reading the
    // current one. Every target shares the guard.
    const assertIdle = (label: string) => {
      if (running) {
        throw new Error(
          `Cannot change ${label} while a search is running. Wait for the current search to finish, then try again.`,
        );
      }
    };

    const assertBoolean = (value: unknown, label: string): boolean => {
      if (typeof value !== "boolean") {
        throw new Error(
          `${label} must be a boolean (true or false), not ${typeof value === "string" ? `the string "${value}"` : typeof value}.`,
        );
      }
      return value;
    };

    return {
      search_query: (value) => {
        assertIdle("the search query");
        if (typeof value !== "string") {
          throw new Error(
            `search_query must be a plain string, not ${Array.isArray(value) ? "an array" : typeof value}. Send the query text itself, not a JSON object wrapping it.`,
          );
        }
        const trimmed = value.trim();
        if (!trimmed) {
          throw new Error(
            "search_query must not be empty. Send the text to search for.",
          );
        }
        if (trimmed.length > SEARCH_QUERY_MAX_CHARS) {
          throw new Error(
            `search_query must be at most ${SEARCH_QUERY_MAX_CHARS} characters (got ${trimmed.length}).`,
          );
        }
        setQuery(trimmed);
      },

      source_kind_filter: (value) => {
        assertIdle("the source-kind filter");
        if (!isSourceKindFilter(value)) {
          throw new Error(
            `source_kind_filter must be exactly one of: ${SOURCE_KIND_FILTER_ENUM_TEXT}. Got ${JSON.stringify(value)}. It is a single choice, not an array — use "all" to clear the filter.`,
          );
        }
        scope.setKindFilter(value);
      },

      rerank: (value) => {
        assertIdle("the rerank setting");
        scope.setRerank(assertBoolean(value, "rerank"));
      },

      multi_query: (value) => {
        assertIdle("the multi-query count");
        if (!isValidMultiQuery(value)) {
          throw new Error(
            `multi_query must be a whole number from ${MULTI_QUERY_MIN} to ${MULTI_QUERY_MAX}. Got ${JSON.stringify(value)}.`,
          );
        }
        scope.setMultiQuery(value);
      },

      use_hyde: (value) => {
        assertIdle("the HyDE setting");
        scope.setUseHyde(assertBoolean(value, "use_hyde"));
      },

      expand_entity_clusters: (value) => {
        assertIdle("the entity-cluster setting");
        scope.setExpandClusters(assertBoolean(value, "expand_entity_clusters"));
      },
    };
  };

  if (reviewHit) {
    const reviewView = hitViewFromSearchHit(reviewHit, {
      name: response
        ? canonicalSourceNameForHit(reviewHit, response.hits)
        : undefined,
    });
    const sourceName =
      (response ? canonicalSourceNameForHit(reviewHit, response.hits) : null) ??
      reviewView.title ??
      "Document";
    const reviewPages = buildRagReviewPages(
      reviewView.pageNumbers,
      reviewView.pageNumber,
      pageCountFromRagHit(reviewHit),
    );
    const href = citationHrefFor(
      reviewHit.source_kind,
      reviewHit.source_id,
      reviewView.pageNumber,
      reviewHit.chunk_id,
    );
    return (
      <RagReviewRepairWorkspace
        hit={reviewHit}
        sourceName={sourceName}
        reviewPages={reviewPages}
        onClose={() => {
          setReviewHit(null);
          onReviewModeChange?.(false);
        }}
        onOpenSource={() =>
          openCitation({
            sourceKind: reviewHit.source_kind,
            sourceId: reviewHit.source_id,
            href,
            chunkId: reviewHit.chunk_id,
            pageNumber: reviewView.pageNumber,
            pageNumbers: reviewView.pageNumbers,
            snippet: reviewView.snippet,
            fileName: sourceName,
            score: reviewView.score,
            query: response?.query ?? null,
          })
        }
      />
    );
  }

  return (
    // Registers the live retrieval scope + last results for the header Agents
    // chrome. Mounted INSIDE the Search tab (deepest provider wins) so the
    // scope it publishes always carries the query and results on screen.
    <SurfaceRuntimeProvider
      surfaceName={RAG_SEARCH_SURFACE}
      getScope={getResultsApplicationScope}
      isEditable={false}
      getWriteHandlers={buildWriteHandlers}
    >
    <div className="flex flex-col h-full overflow-hidden">
      <header className="border-b p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
          className="flex items-center gap-2"
        >
          <EditableContextMenu
            {...RAG_SEARCH_CONTEXT_MENU_PROPS}
            getApplicationScope={getApplicationScope}
            onTextReplace={setQuery}
            contextData={contextData}
          >
            <ProInput
              ref={queryInputRef}
              wrapperClassName="flex-1"
              startIcon={<SearchIcon className="h-4 w-4" />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search indexed content (PDFs, notes, code)…"
              className="h-10"
              enableVoice={false}
              showCopyButton={false}
              clearable
              onClear={() => {
                setQuery("");
                setResponse(null);
                setExpandedHits({});
                setReviewHit(null);
                onReviewModeChange?.(false);
              }}
              autoFocus
            />
          </EditableContextMenu>
          <Button
            type="submit"
            disabled={!query.trim() || running}
            className="shrink-0"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </form>
        <div className="flex items-start justify-between gap-3">
          <SearchScopeSummary
            scope={scope}
            storeName={storeName}
            scopeIds={
              searchContext.scope_ids ?? searchContext.filters?.scope_ids
            }
            organizationId={searchContext.filters?.organization_id}
          />
          {response?.hits.length ? (
            <div className="mt-2 flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-[11px]"
                disabled={allResultsExpanded}
                onClick={() => setAllResultsExpanded(true)}
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />
                Expand all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-[11px]"
                disabled={allResultsCollapsed}
                onClick={() => setAllResultsExpanded(false)}
              >
                <ChevronsDownUp className="h-3.5 w-3.5" />
                Collapse all
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <ScrollArea className="flex-1">
        {error && (
          <div className="m-4 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {!response && !running && !error && (
          <div className="m-6 max-w-2xl rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">
              Search your indexed content
            </p>
            <p className="mb-2">
              Hybrid retrieval over your PDFs, notes, and code. Results are
              ranked by vector similarity (OpenAI embeddings) + lexical match,
              fused with RRF, optionally reranked, and de-duplicated with MMR.
            </p>
            <p>
              Each card shows the full hit snippet with the source, page, and a
              deep link into the original document.
            </p>
          </div>
        )}

        {running && !response && (
          <div className="p-4 space-y-3" aria-busy="true" aria-live="polite">
            <Skeleton className="h-3 w-64" />
            {Array.from({ length: 5 }).map((_, i) => (
              <HitCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Results panel — also the surface's PRESENTATIONAL region: right-
            click the displayed passages to run an agent over what the user is
            reading (read-only, no text-replace callbacks; live browser
            selection + joined results feed scope via
            `getResultsApplicationScope`).

            Rendered as a plain conditional (NOT an AnimatePresence `mode="wait"`
            swap) — `FADE_IN_UP` carries an `exit`, and with React Compiler
            enabled the exiting child often never completes, which under
            `mode="wait"` blocks the NEXT query's results from ever mounting.
            `key={response.query}` still remounts (enter fade) on each new
            search; removal is immediate. */}
        {response && (
          <NonEditableContextMenu
            {...RAG_SEARCH_CONTEXT_MENU_PROPS}
            getApplicationScope={getResultsApplicationScope}
            contextData={contextData}
          >
            <motion.div
              key={response.query}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="p-4 space-y-3"
            >
              <div className="text-xs text-muted-foreground tabular-nums">
                {response.hits.length} hits · {response.total_candidates}{" "}
                candidates · {response.latency_ms} ms
                {response.reranker_model &&
                  ` · reranked by ${response.reranker_model}`}
                {response.rerank_status === "low_confidence" && (
                  <span
                    className="text-amber-600 dark:text-amber-500"
                    title="Cohere reranked the candidates but every one scored below the confidence floor — no strong match for this query, so the fusion (RRF) order was kept."
                  >
                    {" "}
                    · rerank skipped: low confidence
                  </span>
                )}
                {response.rerank_status === "failed" && (
                  <span
                    className="text-amber-600 dark:text-amber-500"
                    title="The rerank call errored; results use the fusion (RRF) order."
                  >
                    {" "}
                    · rerank failed — fusion order
                  </span>
                )}
              </div>
              <QueryTermCoverage query={response.query} hits={response.hits} />
              {response.hits.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No hits for{" "}
                  <strong className="text-foreground">
                    "{response.query}"
                  </strong>
                  . Try the Diagnostics tab to check whether your content was
                  indexed and is visible to you.
                </div>
              ) : (
                response.hits.map((h, i) => (
                  <motion.div
                    key={h.chunk_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.2,
                      ease: "easeOut",
                      delay: Math.min(i * 0.03, 0.3),
                    }}
                  >
                    <RichHitCard
                      rank={i + 1}
                      hit={h}
                      sourceName={canonicalSourceNameForHit(h, response.hits)}
                      libraryProvenance={
                        h.source_kind === "cld_file"
                          ? (provenanceByFile.get(
                              h.source_ref?.file_id ?? h.source_id,
                            ) ?? null)
                          : null
                      }
                      topScore={response.hits[0]?.score}
                      highlightQuery={response.query}
                      defaultExpanded={i === 0}
                      expanded={expandedHits[h.chunk_id] ?? i === 0}
                      onExpandedChange={(expanded) =>
                        setExpandedHits((current) => ({
                          ...current,
                          [h.chunk_id]: expanded,
                        }))
                      }
                      onReviewRepair={
                        h.source_kind === "cld_file" &&
                        buildRagReviewPages(
                          hitViewFromSearchHit(h).pageNumbers,
                          hitViewFromSearchHit(h).pageNumber,
                          pageCountFromRagHit(h),
                        ).length
                          ? () => {
                              setReviewHit(h);
                              onReviewModeChange?.(true);
                            }
                          : undefined
                      }
                    />
                  </motion.div>
                ))
              )}
            </motion.div>
          </NonEditableContextMenu>
        )}
      </ScrollArea>
    </div>
    </SurfaceRuntimeProvider>
  );
}

// ===========================================================================
// Agent tool view — the agent's ACTUAL knowledge_search, with play-out
// ===========================================================================
//
// Calls /rag/search-lab/tool/search, which reproduces byte-for-byte what the
// registered knowledge_search tool hands the model (same search() call, same output
// mappers). Supports N queries (a real agent fires several) and the full arg
// surface, threads the working-context org/scope (the missing piece that made
// the simulation return 0), and lets you "play out" knowledge_browse(action="chunk") on any hit.

interface ChunkPlayout {
  loading: boolean;
  data: AgentToolGetChunkResponse | null;
  error: string | null;
}

function AgentToolResultBlock({
  result,
  orgOverride,
}: {
  result: AgentToolSearchOne;
  orgOverride: string | null;
}) {
  const [rawOpen, setRawOpen] = useState(false);
  const [chunkOut, setChunkOut] = useState<Record<string, ChunkPlayout>>({});

  const playOut = useCallback(
    async (chunkId: string) => {
      setChunkOut((m) => ({
        ...m,
        [chunkId]: { loading: true, data: null, error: null },
      }));
      try {
        const r = await ragAgentToolGetChunk({
          chunk_id: chunkId,
          include_parent: true,
          organization_id: orgOverride,
        });
        setChunkOut((m) => ({
          ...m,
          [chunkId]: { loading: false, data: r, error: null },
        }));
      } catch (e) {
        setChunkOut((m) => ({
          ...m,
          [chunkId]: {
            loading: false,
            data: null,
            error: e instanceof Error ? e.message : "get-chunk failed",
          },
        }));
      }
    },
    [orgOverride],
  );

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 text-xs flex-wrap">
        <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono font-medium">{result.query}</span>
        <Badge variant="secondary" className="text-[10px] ml-auto">
          {result.hits.length} hits
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {result.total_candidates} candidates
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {result.latency_ms} ms
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {result.reranker_model ?? "rerank off"}
        </Badge>
      </div>

      {result.error && (
        <div className="px-3 py-2 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" /> {result.error}
        </div>
      )}

      {(result.matched_entities.length > 0 || result.entity_map.length > 0) && (
        <div className="px-3 py-2 border-b flex flex-wrap items-center gap-1">
          <Layers className="h-3 w-3 text-muted-foreground mr-1" />
          {result.matched_entities.map((e) => (
            <Badge key={`m-${e}`} className="text-[10px]" variant="default">
              {e}
            </Badge>
          ))}
          {result.entity_map.slice(0, 12).map((e) => (
            <Badge
              key={`em-${e.entity_id ?? e.name}`}
              className="text-[10px]"
              variant="outline"
              title={
                e.importance != null
                  ? `importance ${e.importance.toFixed(2)}`
                  : undefined
              }
            >
              {e.name}
              {e.kind ? (
                <span className="text-muted-foreground ml-1">{e.kind}</span>
              ) : null}
            </Badge>
          ))}
        </div>
      )}

      <div className="divide-y">
        {result.hits.length === 0 && !result.error && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No hits — the agent would receive an empty result set for this
            query.
          </div>
        )}
        {result.hits.map((h, i) => {
          const out = h.chunk_id ? chunkOut[h.chunk_id] : undefined;
          const chunk = (out?.data?.chunk ?? null) as {
            content_text?: string;
            parent?: { content_text?: string };
          } | null;
          return (
            <div key={h.chunk_id ?? i} className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                <span className="font-mono w-6 text-right">#{i + 1}</span>
                {h.file_name && (
                  <span className="font-medium text-foreground truncate max-w-[260px]">
                    {h.file_name}
                  </span>
                )}
                {h.page_number != null && <span>p.{h.page_number}</span>}
                <Badge variant="outline" className="text-[10px]">
                  {h.source_kind}
                </Badge>
                {typeof h.score === "number" && (
                  <span className="tabular-nums">
                    score {h.score.toFixed(3)}
                  </span>
                )}
                <code className="font-mono text-[10px] truncate">
                  {h.chunk_id}
                </code>
                {h.chunk_id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px] ml-auto"
                    onClick={() => playOut(h.chunk_id as string)}
                    disabled={out?.loading}
                  >
                    {out?.loading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Play className="h-3 w-3 mr-1" />
                        Read full chunk
                      </>
                    )}
                  </Button>
                )}
              </div>
              <p className="text-xs whitespace-pre-wrap text-foreground/90">
                {h.snippet || (
                  <span className="text-destructive">
                    (empty snippet — the agent would get no readable text here)
                  </span>
                )}
              </p>

              {out && (
                <div className="mt-1 rounded border bg-muted/30 p-2 text-xs">
                  {out.loading && (
                    <span className="text-muted-foreground">
                      Loading full chunk…
                    </span>
                  )}
                  {out.error && (
                    <span className="text-destructive">{out.error}</span>
                  )}
                  {out.data && out.data.status !== "ok" && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {out.data.note ?? `knowledge_browse(chunk) → ${out.data.status}`}
                    </span>
                  )}
                  {out.data && out.data.status === "ok" && chunk && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        knowledge_browse(chunk) → full chunk content
                      </div>
                      <p className="whitespace-pre-wrap">
                        {chunk.content_text}
                      </p>
                      {chunk.parent?.content_text && (
                        <>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            parent context
                          </div>
                          <p className="whitespace-pre-wrap text-foreground/80">
                            {chunk.parent.content_text}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3 py-2 border-t">
        <button
          type="button"
          onClick={() => setRawOpen((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <FileText className="h-3 w-3" />
          {rawOpen ? "Hide" : "Show"} raw tool_result (exactly what the agent
          receives)
        </button>
        {rawOpen && (
          <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted/40 p-2 text-[10px] font-mono whitespace-pre-wrap break-all">
            {result.tool_result_text}
          </pre>
        )}
      </div>
    </div>
  );
}

function AgentToolPanel({ scope }: { scope: Scope }) {
  const searchContext = useRagSearchContext();
  const orgOverride = searchContext.filters?.organization_id ?? null;
  const scopeIds =
    searchContext.scope_ids ?? searchContext.filters?.scope_ids ?? null;

  const [queries, setQueries] = useState<string[]>([""]);
  const [running, setRunning] = useState(false);
  const [resp, setResp] = useState<AgentToolSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Drop a stale response if a newer run started while this one was in flight.
  const seqRef = useRef(0);

  const run = useCallback(async () => {
    const qs = queries.map((q) => q.trim()).filter(Boolean);
    if (qs.length === 0) return;
    const seq = ++seqRef.current;
    setRunning(true);
    setError(null);
    setResp(null);
    try {
      const r = await ragAgentToolSearch({
        queries: qs,
        limit: 10,
        source_kinds: scope.sourceKinds ?? null,
        data_store_id: scope.storeId ?? null,
        multi_query: scope.multiQuery,
        use_hyde: scope.useHyde,
        rerank: scope.rerank,
        use_mmr: true,
        // No expand_entity_clusters here: this endpoint simulates the agent's
        // registered knowledge_search tool byte-for-byte, and that tool has no
        // cluster-expansion option. The sidebar toggle applies to /rag/search
        // (Search + Pipeline tabs) only.
        scope_ids: scopeIds,
        organization_id: orgOverride,
      });
      if (seq !== seqRef.current) return;
      setResp(r);
    } catch (e) {
      if (seq !== seqRef.current) return;
      setError(e instanceof Error ? e.message : "Agent tool search failed");
    } finally {
      if (seq === seqRef.current) setRunning(false);
    }
  }, [queries, scope, orgOverride, scopeIds]);

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 text-xs">
        <Brain className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold">
          Agent&apos;s actual tool · knowledge_search
        </span>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {orgOverride ? "org override" : "your org"}
        </Badge>
      </div>
      <div className="px-3 py-3 space-y-2">
        <p className="text-[11px] text-muted-foreground">
          Runs the exact tool the agent calls and shows exactly what it gets
          back. Add several queries — a real agent fires more than one.
        </p>
        {queries.map((q, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={q}
              onChange={(e) =>
                setQueries((qs) =>
                  qs.map((x, idx) => (idx === i ? e.target.value : x)),
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  run();
                }
              }}
              placeholder={`Query ${i + 1}`}
              className="h-9"
            />
            {queries.length > 1 && (
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0"
                onClick={() =>
                  setQueries((qs) => qs.filter((_, idx) => idx !== i))
                }
                aria-label="Remove query"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setQueries((qs) => (qs.length >= 8 ? qs : [...qs, ""]))
            }
            disabled={queries.length >= 8}
          >
            + Add query
          </Button>
          <Button
            size="sm"
            onClick={run}
            disabled={running || queries.every((q) => !q.trim())}
            className="ml-auto"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                Run as agent
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}
        {resp?.notes.map((n, i) => (
          <div
            key={i}
            className="text-[11px] text-amber-600 dark:text-amber-400"
          >
            {n}
          </div>
        ))}
      </div>

      {resp && resp.results.length > 0 && (
        <div className="px-3 pb-3 space-y-3">
          {resp.results.map((r, i) => (
            <AgentToolResultBlock
              key={i}
              result={r}
              orgOverride={orgOverride}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Tab 2 — Agent Simulation
// ===========================================================================

function AgentSimulationTab({ scope }: { scope: Scope }) {
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [diag, setDiag] = useState<DiagnoseResponse | null>(null);
  const [expand, setExpand] = useState<ExpandResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A diagnose run streams events into a shared `partial` accumulator; without
  // this guard a second run started mid-stream would interleave its events into
  // the first run's accumulator and corrupt the displayed pipeline trace.
  const seqRef = useRef(0);

  // Working-context org/scope — the SAME payload the Search tab sends. Without
  // it the pipeline trace ran in the caller's personal org and reported 0
  // visible chunks even when the Search tab (which honors it) found plenty.
  const searchContext = useRagSearchContext();
  const requestPayload = useMemo(
    () => ({
      query: query.trim(),
      limit: 10,
      multi_query: scope.multiQuery,
      use_hyde: scope.useHyde,
      rerank: scope.rerank,
      use_mmr: true,
      expand_entity_clusters: scope.expandClusters || undefined,
      only_children: true,
      source_kinds: scope.sourceKinds,
      data_store_id: scope.storeId ?? null,
      admin_bypass_acl: scope.adminBypass,
      organization_id: searchContext.filters?.organization_id ?? null,
      scope_ids:
        searchContext.scope_ids ?? searchContext.filters?.scope_ids ?? null,
    }),
    [query, scope, searchContext],
  );

  const runAll = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const seq = ++seqRef.current;
    setRunning(true);
    setError(null);
    setDiag(null);
    setExpand(null);
    const stageStart = performance.now();
    // Accumulate stream events into a single DiagnoseResponse-shaped
    // object that gets re-set after every event — the AnimatedKpiCard
    // count-ups + per-panel motion fade-ins make the progressive fill
    // feel like a live demo of the retrieval pipeline rather than a
    // batch wait. The shape stays compatible with the batch
    // DiagnoseResponse so existing render code keeps working.
    const partial: DiagnoseResponse = {
      query: trimmed,
      scope: {
        user_id: "",
        organization_id: null,
        is_admin: false,
        admin_bypass_acl: false,
      },
      elapsed_ms: 0,
      query_variants: [],
      hyde_passage: null,
      embedding_model: "",
      query_vector_preview: [],
      visible_chunks_total: 0,
      candidates_vector: 0,
      candidates_lexical: 0,
      candidates_entity: 0,
      candidates_after_fusion: 0,
      candidates_after_mmr: 0,
      hits: [],
      reranker_model: null,
      effective_filters: {},
      notes: [],
    };
    try {
      for await (const evt of ragDiagnoseStream(requestPayload)) {
        // Superseded by a newer run — stop consuming and updating state.
        // Returning closes the async iterator (aborts the stale stream).
        if (seq !== seqRef.current) return;
        switch (evt.kind) {
          case "rag.diagnose.started":
            partial.query = evt.query;
            partial.scope = evt.scope;
            break;
          case "rag.diagnose.note":
            partial.notes = [...partial.notes, evt.message];
            break;
          case "rag.diagnose.query_expansion":
            partial.query_variants = evt.query_variants;
            partial.hyde_passage = evt.hyde_passage;
            partial.embedding_model = evt.embedding_model;
            partial.query_vector_preview = evt.query_vector_preview;
            setExpand({
              query: trimmed,
              variants: evt.query_variants,
              hyde_passage: evt.hyde_passage,
              embedding_model: evt.embedding_model,
              query_vector_preview: evt.query_vector_preview,
              elapsed_ms: Math.round(performance.now() - stageStart),
            });
            break;
          case "rag.diagnose.visibility":
            partial.visible_chunks_total = evt.visible_chunks_total;
            break;
          case "rag.diagnose.fusion":
            partial.candidates_after_fusion = evt.candidates_after_fusion;
            partial.candidates_vector = evt.candidates_vector;
            partial.candidates_lexical = evt.candidates_lexical;
            partial.candidates_entity = evt.candidates_entity ?? 0;
            break;
          case "rag.diagnose.hits":
            partial.hits = evt.hits;
            partial.reranker_model = evt.reranker_model;
            partial.candidates_after_mmr = evt.candidates_after_mmr;
            break;
          case "rag.diagnose.complete":
            partial.elapsed_ms = evt.elapsed_ms;
            partial.effective_filters = evt.effective_filters;
            partial.notes = evt.notes;
            break;
        }
        setDiag({ ...partial });
      }
    } catch (e) {
      if (seq !== seqRef.current) return;
      setError(e instanceof Error ? e.message : "Diagnose failed");
    } finally {
      if (seq === seqRef.current) setRunning(false);
    }
  }, [query, requestPayload]);

  const assembledPrompt = useMemo(() => {
    if (!diag || diag.hits.length === 0) return "";
    const lines: string[] = [
      "SYSTEM: You answer ONLY from the retrieved snippets below.",
      "Inline-cite each fact with the chunk_id it came from.",
      "",
      "RETRIEVED CONTEXT:",
      "",
    ];
    diag.hits.forEach((h, i) => {
      lines.push(
        `--- HIT #${i + 1}  [chunk_id=${h.chunk_id}] (${h.source_kind})${
          h.file_name ? ` ${h.file_name}` : ""
        }${h.page_number ? ` p.${h.page_number}` : ""}  score=${h.score.toFixed(3)} ---`,
      );
      lines.push((h.snippet ?? "").slice(0, 1500));
      lines.push("");
    });
    lines.push("USER QUESTION:");
    lines.push(diag.query);
    return lines.join("\n");
  }, [diag]);

  const tokenEstimate = useMemo(
    () => Math.ceil(assembledPrompt.length / 4),
    [assembledPrompt],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="border-b p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runAll();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Brain className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter a query and see EVERYTHING an AI agent sees…"
              className="pl-9 h-10 text-base"
            />
          </div>
          <Button
            type="submit"
            disabled={!query.trim() || running}
            className="shrink-0"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Diagnose"
            )}
          </Button>
        </form>
        <p className="mt-2 text-[11px] text-muted-foreground">
          The panel below runs the agent&apos;s ACTUAL knowledge_search tool (with
          play-out into knowledge_browse). Underneath, the full retrieval pipeline
          is exposed layer by layer: query rewrites, HyDE passage, embedding
          vector preview, per-stage counts, and the exact prompt block.
        </p>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <AgentToolPanel scope={scope} />

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}

          {!diag && !running && !error && (
            <div className="rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">
                Run a diagnostic query
              </p>
              <p>
                Enter any query above. The panel below will show what the
                retrieval system rewrote, retrieved, scored, and would feed to
                an LLM.
              </p>
            </div>
          )}

          {running && !diag && !expand && (
            <div className="space-y-4" aria-busy="true" aria-live="polite">
              <div className="rounded-md border bg-card overflow-hidden">
                <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2">
                  <GitMerge className="h-3.5 w-3.5 text-muted-foreground" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-16 ml-auto" />
                </div>
                <div className="px-3 py-3 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-24 mt-3" />
                  <Skeleton className="h-3 w-11/12" />
                  <Skeleton className="h-3 w-10/12" />
                </div>
              </div>
              <div className="rounded-md border bg-card overflow-hidden">
                <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2">
                  <Beaker className="h-3.5 w-3.5 text-muted-foreground" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <div className="px-3 py-2 grid grid-cols-2 md:grid-cols-5 gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="rounded-xl border bg-card p-3">
                      <Skeleton className="h-2.5 w-20" />
                      <Skeleton className="h-6 w-14 mt-1.5" />
                    </div>
                  ))}
                </div>
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <HitCardSkeleton key={i} />
              ))}
            </div>
          )}

          {expand && (
            <motion.div
              {...FADE_IN_UP}
              className="rounded-md border bg-card overflow-hidden"
            >
              <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 text-xs">
                <GitMerge className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold">Query expansion</span>
                <Badge variant="outline" className="text-[10px]">
                  {expand.embedding_model}
                </Badge>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {expand.elapsed_ms} ms
                </Badge>
              </div>
              <div className="px-3 py-2 space-y-2">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
                    Original
                  </div>
                  <div className="text-sm font-medium">{expand.query}</div>
                </div>
                {expand.variants.length > 1 && (
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
                      Variants ({expand.variants.length})
                    </div>
                    <ul className="space-y-0.5">
                      {expand.variants.map((v, i) => (
                        <li
                          key={i}
                          className="text-sm pl-3 border-l-2 border-primary/30"
                        >
                          {v}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {expand.hyde_passage && (
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
                      HyDE passage (hypothetical answer)
                    </div>
                    <div className="text-xs bg-muted/40 p-2 rounded whitespace-pre-wrap">
                      {expand.hyde_passage}
                    </div>
                  </div>
                )}
                {/* Contract-optional — the server may omit the preview; skip
                    the section rather than dereference it (D44). */}
                {expand.query_vector_preview &&
                  expand.query_vector_preview.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
                        Query embedding (first 8 of 1536 dims)
                      </div>
                      <code className="text-[10px] font-mono text-muted-foreground break-all">
                        [
                        {expand.query_vector_preview
                          .map((v) => v.toFixed(4))
                          .join(", ")}
                        , …]
                      </code>
                    </div>
                  )}
              </div>
            </motion.div>
          )}

          {diag && (
            <motion.div {...FADE_IN_UP} className="space-y-4">
              <div className="rounded-md border bg-card overflow-hidden">
                <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 text-xs flex-wrap">
                  <Beaker className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-semibold">Pipeline counts</span>
                  {diag.elapsed_ms > 0 ? (
                    <Badge variant="outline" className="text-[10px]">
                      {diag.elapsed_ms} ms total
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] flex items-center gap-1"
                    >
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      streaming…
                    </Badge>
                  )}
                </div>
                <div className="px-3 py-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <AnimatedKpiCard
                    icon={<Database className="h-3.5 w-3.5" />}
                    label={`Visible ${RAG_VOCAB.segmentsShort.toLowerCase()}`}
                    value={diag.visible_chunks_total}
                    tone="info"
                  />
                  <AnimatedKpiCard
                    icon={<SearchIcon className="h-3.5 w-3.5" />}
                    label="Vector recall"
                    value={diag.candidates_vector}
                    tone="info"
                  />
                  <AnimatedKpiCard
                    icon={<FileText className="h-3.5 w-3.5" />}
                    label="Lexical recall"
                    value={diag.candidates_lexical}
                    tone="info"
                  />
                  <AnimatedKpiCard
                    icon={<Layers className="h-3.5 w-3.5" />}
                    label="Entity recall"
                    value={diag.candidates_entity ?? 0}
                    tone="info"
                  />
                  <AnimatedKpiCard
                    icon={<GitMerge className="h-3.5 w-3.5" />}
                    label="After fusion"
                    value={diag.candidates_after_fusion}
                    tone="primary"
                  />
                  <AnimatedKpiCard
                    icon={<FlaskConical className="h-3.5 w-3.5" />}
                    label="After MMR/rerank"
                    value={diag.candidates_after_mmr}
                    tone="warning"
                  />
                  <AnimatedKpiCard
                    icon={<Send className="h-3.5 w-3.5" />}
                    label="Returned"
                    value={diag.hits.length}
                    tone="success"
                  />
                  <AnimatedKpiCard
                    icon={<Brain className="h-3.5 w-3.5" />}
                    label="Reranker"
                    value={diag.reranker_model ?? "off"}
                    tone="neutral"
                  />
                </div>
                {diag.notes.length > 0 && (
                  <div className="px-3 py-2 border-t bg-amber-500/10 space-y-1">
                    {diag.notes.map((n, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-1.5 text-xs text-amber-900 dark:text-amber-200"
                      >
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {diag.hits.length > 0 && (
                <div>
                  <div className="text-xs font-semibold mb-2">
                    Hits with full score breakdown ({diag.hits.length})
                  </div>
                  <div className="space-y-3">
                    {diag.hits.map((h, i) => (
                      <motion.div
                        key={h.chunk_id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.18,
                          ease: "easeOut",
                          delay: Math.min(i * 0.02, 0.2),
                        }}
                      >
                        <RichHitCard
                          rank={i + 1}
                          hit={h}
                          sourceName={canonicalSourceNameForHit(h, diag.hits)}
                          topScore={diag.hits[0]?.score}
                          highlightQuery={query}
                          defaultExpanded={i === 0}
                        />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {assembledPrompt && (
                <div className="rounded-md border bg-card overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 text-xs">
                    <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold">
                      Assembled prompt (what the LLM receives)
                    </span>
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      ~{tokenEstimate.toLocaleString()} tokens
                    </Badge>
                    <button
                      type="button"
                      className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        navigator.clipboard.writeText(assembledPrompt);
                        toast.success("Prompt copied");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-words max-h-96 overflow-auto text-foreground/90">
                    {assembledPrompt}
                  </pre>
                </div>
              )}

              {diag.elapsed_ms > 0 && (
                <>
                  <JsonInspector
                    label="Diagnose request body"
                    value={requestPayload}
                    collapsed
                  />
                  <JsonInspector
                    label="Diagnose raw response"
                    value={diag}
                    collapsed
                  />
                </>
              )}
            </motion.div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-mono tabular-nums">{value}</div>
    </div>
  );
}

// ===========================================================================
// Tab 3 — Agent Chat
// ===========================================================================

/**
 * Agent Chat tab — embeds the canonical managed-agent system.
 *
 * This is intentionally NOT a bespoke chat. It launches a managed conversation
 * (same stack as `/chat` and the Projects "Use AI" tab) via `useAgentLauncher`
 * and renders `AgentConversationColumn`. That column already streams text,
 * renders tool calls (including a dedicated `knowledge_search` renderer), exposes the
 * Smart Input with the full tool/variable affordances, and participates in the
 * overlay / creator-panel / pending-asks machinery — so users get every
 * platform capability here for free.
 *
 * Two things make it RAG-aware:
 *   1. `runtime.surfaceName` + `applicationScope` hand the agent the page's
 *      retrieval scope (selected data store, source-kind filter, pipeline
 *      flags) via the registered `matrx-user/rag-search` surface, so an agent
 *      engineer can bind those values into the agent's context / tool args.
 *   2. The RAG tool family is armed on the conversation via `addedTools`, so
 *      the agent can search / inspect the user's indexed content regardless of
 *      whether the base agent ships those tools.
 */
function AgentChatTab({ scope }: { scope: Scope }) {
  const { slot, loading, error } = useAgentSlot(DEFAULT_NEW_CHAT_SLOT_KEY);
  if (loading) {
    return (
      <div
        className="flex h-full items-center justify-center"
        aria-busy="true"
        aria-live="polite"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !slot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-foreground">
          Agent chat is unavailable right now.
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          The default chat agent could not be resolved
          {error ? ` — ${error}` : ""}. Check your override on the Agent Slots
          page, or try again shortly.
        </p>
      </div>
    );
  }
  return <AgentChatTabBody scope={scope} agentId={slot.agentId} />;
}

function AgentChatTabBody({ scope, agentId }: { scope: Scope; agentId: string }) {
  const dispatch = useAppDispatch();
  const surfaceKey = `${RAG_SEARCH_SOURCE_FEATURE}:${agentId}`;
  const searchContext = useRagSearchContext();
  const activeOrganizationId = searchContext.filters?.organization_id ?? null;
  const activeScopeIds =
    searchContext.scope_ids ?? searchContext.filters?.scope_ids ?? null;

  const storeName = useMemo(
    () =>
      scope.storeId
        ? scope.stores.stores.find((s) => s.id === scope.storeId)?.name
        : undefined,
    [scope.storeId, scope.stores.stores],
  );

  // Captured at launch (the launcher reads `runtime` once when it creates the
  // conversation). Picking a different store after the conversation exists
  // doesn't retroactively re-scope an in-flight chat — start a fresh chat to
  // re-scope, same as every other agent surface.
  const applicationScope = useMemo(
    () =>
      createRagSearchScope({
        data_store_id: scope.storeId ?? undefined,
        data_store_name: storeName,
        available_data_stores: scope.stores.stores.map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
          member_count: s.memberCount,
        })),
        source_kinds: scope.sourceKinds,
        active_organization_id: activeOrganizationId ?? undefined,
        active_scope_ids:
          activeScopeIds && activeScopeIds.length > 0
            ? activeScopeIds
            : undefined,
        admin_bypass_acl: scope.adminBypass,
        rerank: scope.rerank,
        multi_query: scope.multiQuery,
        use_hyde: scope.useHyde,
        expand_entity_clusters: scope.expandClusters,
      }),
    [
      scope.storeId,
      storeName,
      scope.stores.stores,
      scope.sourceKinds,
      scope.adminBypass,
      scope.rerank,
      scope.multiQuery,
      scope.useHyde,
      scope.expandClusters,
      activeOrganizationId,
      activeScopeIds,
    ],
  );

  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: RAG_SEARCH_SOURCE_FEATURE,
    apiEndpointMode: "agent",
    config: { responseDensity: "compact" },
    runtime: {
      surfaceName: RAG_SEARCH_SURFACE,
      applicationScope,
    },
  });

  // Arm the RAG tool family additively on this conversation as soon as it
  // exists. The instance UI-state entry is created synchronously inside the
  // launch thunk, so by the time `conversationId` is set the dispatch lands.
  useEffect(() => {
    if (!conversationId) return;
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: { addedTools: RAG_AGENT_TOOL_IDS },
      }),
    );
  }, [conversationId, dispatch]);

  if (!conversationId) {
    return (
      <div
        className="flex h-full items-center justify-center"
        aria-busy="true"
        aria-live="polite"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AgentConversationColumn
        conversationId={conversationId}
        surfaceKey={surfaceKey}
        constrainWidth
        edgeToEdgeScroll
      />
    </div>
  );
}

// ===========================================================================
// Tab 4 — Diagnostics
// ===========================================================================

function DiagnosticsTab({ scope }: { scope: Scope }) {
  const [inv, setInv] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contract-optional — the server may omit the route breakdown; render the
  // existing "No breakdown available" empty state instead of throwing (D44).
  const visibilityRoutes = Object.entries(inv?.by_visibility_route ?? {});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await ragInventory({ adminBypassAcl: scope.adminBypass });
      setInv(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Inventory failed");
    } finally {
      setLoading(false);
    }
  }, [scope.adminBypass]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="border-b p-3 flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-primary" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Diagnostics</div>
          <div className="text-[11px] text-muted-foreground">
            See what {RAG_VOCAB.segmentsShort.toLowerCase()} are visible to you,
            and via which ACL route. Toggle "Admin: bypass ACL" in the sidebar
            to compare against the full database.
          </div>
        </div>
        <Button onClick={refresh} disabled={loading} size="sm">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Play className="h-3.5 w-3.5 mr-1" /> Load
            </>
          )}
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}

          {!inv && !loading && !error && (
            <div className="rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">
                Inventory not loaded yet
              </p>
              <p>
                Click <strong>Load</strong> to fetch every{" "}
                {RAG_VOCAB.segmentShort.toLowerCase()} visible to you, grouped
                by source kind and visibility route.
              </p>
              <p className="mt-2 text-xs">
                If you're not finding your PDFs in search, this is the fastest
                way to confirm whether they were ingested and whether ACL is
                filtering them out.
              </p>
            </div>
          )}

          {inv && (
            <>
              <div className="rounded-md border bg-card overflow-hidden">
                <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 text-xs">
                  <Database className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-semibold">Scope</span>
                  {inv.scope.admin_bypass_acl && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-amber-500/20 text-amber-900 dark:text-amber-200 border-amber-500/40"
                    >
                      ADMIN BYPASS ACL
                    </Badge>
                  )}
                </div>
                <div className="px-3 py-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <Stat
                    label={`Total ${RAG_VOCAB.segmentsShort.toLowerCase()}`}
                    value={inv.total_visible_chunks.toLocaleString()}
                  />
                  <Stat
                    label="Distinct sources"
                    value={inv.total_visible_sources.toLocaleString()}
                  />
                  <Stat
                    label="Is admin"
                    value={inv.scope.is_admin ? "yes" : "no"}
                  />
                  <Stat
                    label="Organization"
                    value={inv.scope.organization_id ?? "—"}
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-md border bg-card overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30 text-xs font-semibold">
                    By source kind
                  </div>
                  <div className="divide-y">
                    {inv.by_source_kind.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        No {RAG_VOCAB.segmentsShort.toLowerCase()} visible.
                      </div>
                    ) : (
                      inv.by_source_kind.map((b) => (
                        <div
                          key={b.source_kind}
                          className="px-3 py-1.5 flex items-center gap-2 text-xs"
                        >
                          <code className="font-mono uppercase tracking-wide w-24">
                            {b.source_kind}
                          </code>
                          <span className="tabular-nums">
                            {b.visible_chunks.toLocaleString()}{" "}
                            {RAG_VOCAB.segmentsShort.toLowerCase()}
                          </span>
                          <span className="ml-auto tabular-nums text-muted-foreground">
                            {b.distinct_sources.toLocaleString()} sources
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-md border bg-card overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30 text-xs font-semibold">
                    By visibility route (why is each{" "}
                    {RAG_VOCAB.segmentShort.toLowerCase()} visible?)
                  </div>
                  <div className="divide-y">
                    {visibilityRoutes.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        No breakdown available.
                      </div>
                    ) : (
                      visibilityRoutes.map(([k, v]) => (
                        <div
                          key={k}
                          className="px-3 py-1.5 flex items-center gap-2 text-xs"
                        >
                          <code className="font-mono">{k}</code>
                          <span className="ml-auto tabular-nums">
                            {v.toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-md border bg-card overflow-hidden">
                <div className="px-3 py-2 border-b bg-muted/30 text-xs font-semibold">
                  Top sources by {RAG_VOCAB.segmentShort.toLowerCase()} count
                </div>
                <div className="divide-y">
                  {inv.top_sources.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No sources.
                    </div>
                  ) : (
                    inv.top_sources.map((t) => (
                      <div
                        key={`${t.source_kind}:${t.source_id}`}
                        className="px-3 py-1.5 flex items-center gap-2 text-xs"
                      >
                        <code className="font-mono uppercase tracking-wide text-muted-foreground">
                          {t.source_kind}
                        </code>
                        <span className="font-medium truncate flex-1">
                          {t.file_name ?? t.source_id}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {t.chunk_count}{" "}
                          {RAG_VOCAB.segmentsShort.toLowerCase()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <JsonInspector
                label="Raw inventory payload"
                value={inv}
                collapsed
              />
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ===========================================================================
// Top-level experience
// ===========================================================================

/**
 * Top-level RAG Search Lab.
 *
 * Mobile/desktop responsive shell:
 *
 *   Desktop (md+):
 *     [ ScopeSidebar 16rem │ Tabs(Search | Agent Sim | Agent Chat | Diag) ]
 *
 *   Mobile (<md):
 *     [ Header row: [scope drawer trigger] [horizontal scroll-snap tabs] ]
 *     [ Active tab body (single scroll area)                              ]
 *     The Scope sidebar is rendered inside a bottom <Drawer> launched by
 *     the PanelLeftOpen icon — same component, no shrunk-down sibling.
 *
 * Tab-strip design choice (mobile): a horizontal scroll-snap row of the
 * existing TabsList. Picked over a drawer-based tab picker because there
 * are exactly four tabs (fits across the viewport with a tiny overflow),
 * they have icons, and a one-tap switch beats two-tap drawer + select.
 * If we add a fifth tab, revisit and consider the drawer picker.
 */
const RAG_SEARCH_TABS = [
  "search",
  "agent-sim",
  "agent-chat",
  "diagnostics",
] as const;

export function RagSearchExperience() {
  const params = useSearchParams();
  const scope = useScopeControls(params?.get("store_id") ?? null);
  // Validate the deep-linked tab — an unknown ?tab= value would otherwise leave
  // every TabsContent inactive and render a blank panel.
  const rawTab = params?.get("tab") ?? "";
  const initialTab = (RAG_SEARCH_TABS as readonly string[]).includes(rawTab)
    ? rawTab
    : "search";
  const isMobile = useIsMobile();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);

  return (
    <>
      <RagHubHeader />
      <div className="flex h-full flex-col overflow-hidden bg-background md:flex-row">
        {/* Desktop persistent sidebar — collapses out on mobile in favour of the Drawer */}
        {!isMobile && !reviewMode && <ScopeSidebar scope={scope} />}

        <Tabs
          defaultValue={initialTab}
          className="flex-1 flex flex-col overflow-hidden min-h-0"
        >
          <div className="border-b px-2 pt-[calc(var(--shell-header-h)+0.5rem)] pb-1 flex items-center gap-2 md:px-4 md:gap-3">
            {/* Mobile-only: scope drawer trigger sits where the sidebar would be */}
            {isMobile && !reviewMode && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="Open scope picker"
                onClick={() => setScopeOpen(true)}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden scrollbar-hide">
              <TabsList className="h-9 inline-flex">
                <TabsTrigger value="search" className="gap-1.5 shrink-0">
                  <SearchIcon className="h-3.5 w-3.5" /> Search
                </TabsTrigger>
                <TabsTrigger value="agent-sim" className="gap-1.5 shrink-0">
                  <Brain className="h-3.5 w-3.5" /> Agent Simulation
                </TabsTrigger>
                <TabsTrigger value="agent-chat" className="gap-1.5 shrink-0">
                  <MessageSquare className="h-3.5 w-3.5" /> Agent Chat
                </TabsTrigger>
                <TabsTrigger value="diagnostics" className="gap-1.5 shrink-0">
                  <Stethoscope className="h-3.5 w-3.5" /> Diagnostics
                </TabsTrigger>
              </TabsList>
            </div>
            <div className="hidden lg:flex min-w-0 max-w-[min(42rem,40vw)] items-center overflow-hidden">
              <ActiveScopeChips className="min-w-0" />
            </div>
            <div className="hidden md:block ml-auto text-[11px] text-muted-foreground shrink-0">
              RAG Search Lab · hybrid retrieval + Claude agent
            </div>
          </div>

          <div className="flex-1 overflow-hidden min-h-0">
            <TabsContent value="search" className="h-full mt-0">
              <SearchTab scope={scope} onReviewModeChange={setReviewMode} />
            </TabsContent>
            <TabsContent value="agent-sim" className="h-full mt-0">
              <AgentSimulationTab scope={scope} />
            </TabsContent>
            <TabsContent value="agent-chat" className="h-full mt-0">
              <AgentChatTab scope={scope} />
            </TabsContent>
            <TabsContent value="diagnostics" className="h-full mt-0">
              <DiagnosticsTab scope={scope} />
            </TabsContent>
          </div>
        </Tabs>

        {/* Mobile-only Drawer holds the SAME ScopeSidebar component — same
          interactions and same Redux/local state — never a redesigned
          shrunk-down variant. */}
        {isMobile && (
          <Drawer open={scopeOpen} onOpenChange={setScopeOpen}>
            <DrawerContent className="max-h-[85dvh]">
              <DrawerTitle className="sr-only">Scope</DrawerTitle>
              <div className="flex-1 overflow-y-auto overscroll-contain pb-safe">
                <ScopeSidebar scope={scope} variant="drawer" />
              </div>
            </DrawerContent>
          </Drawer>
        )}
      </div>
    </>
  );
}

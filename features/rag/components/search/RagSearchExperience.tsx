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
  Copy,
  Database,
  FileText,
  FlaskConical,
  Loader2,
  MessageSquare,
  PanelLeftOpen,
  Play,
  Search as SearchIcon,
  Send,
  Settings2,
  Sparkles,
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
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

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
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { AnimatedKpiCard } from "@/features/rag/components/library/AnimatedKpiCard";
import { ActiveContextPanel } from "@/features/scopes/components/active-context/ActiveContextPanel";
import { ActiveScopeChips } from "@/features/scopes/components/active-context/ActiveScopeChips";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_NEW_CHAT_AGENT_ID } from "@/features/agents/components/chat/chat-quick-actions.config";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import { createRagSearchScope } from "@/features/surfaces/manifests/rag-search.manifest";
import {
  buildRagSearchContextData,
  RAG_SEARCH_CONTEXT_MENU_PROPS,
} from "@/features/rag/agent-context/buildRagSearchContextData";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v2/utils/build-application-scope";
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
/** General-purpose chat agent; the RAG tools below are armed onto its run. */
const RAG_AGENT_ID = DEFAULT_NEW_CHAT_AGENT_ID;

/**
 * RAG tool family (registry tool UUIDs from `public.tool_def`). Armed
 * additively on the conversation via `addedTools` so the agent can actually
 * search the user's indexed content, list/inspect data stores, fetch chunks,
 * and verify answers — even when the base chat agent doesn't ship these tools
 * by default. The conversation also receives the page's retrieval scope via
 * `runtime.applicationScope` (see `createRagSearchScope`).
 */
const RAG_AGENT_TOOL_IDS = [
  "3921fc69-0763-4538-9e36-5a29a088a5bd", // rag_search
  "49ebe1b2-62ba-4028-9038-838c12e144ef", // rag_search_data_store
  "16964a48-af53-423d-a3c4-0ff3a0a061eb", // rag_search_cross_doc
  "dc3300ad-fbfe-4d32-8970-4666715402f4", // rag_list_data_stores
  "487322dc-db17-4b13-9186-223c29f29baf", // rag_get_data_store
  "df009bb5-1b9a-49a4-8db1-90b654f970a2", // rag_list_sources
  "52f31aa4-2570-477f-ad29-91b00bdcec87", // rag_get_chunk
  "cb86a0ca-439e-4e63-be45-44c2dcd159f5", // rag_verify_answer
];

// ===========================================================================
// Shared
// ===========================================================================

type SourceKindFilter = "all" | "cld_file" | "note" | "code_file";

function useScopeControls() {
  const stores = useDataStores();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<SourceKindFilter>("all");
  const [adminBypass, setAdminBypass] = useState(false);
  const [rerank, setRerank] = useState(true);
  const [multiQuery, setMultiQuery] = useState(1);
  const [useHyde, setUseHyde] = useState(false);

  const sourceKinds = useMemo<string[] | undefined>(() => {
    if (kindFilter === "all") return undefined;
    return [kindFilter];
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
  };
}

type Scope = ReturnType<typeof useScopeControls>;

// ---------------------------------------------------------------------------
// Score bar — small visual indicator
// ---------------------------------------------------------------------------

function ScoreBar({
  label,
  value,
  max,
  tone = "default",
}: {
  label: string;
  value: number | null | undefined;
  max: number;
  tone?: "default" | "primary" | "amber";
}) {
  const pct =
    value === null || value === undefined || max <= 0
      ? 0
      : Math.min(100, Math.max(0, (value / max) * 100));
  const fillCls =
    tone === "primary"
      ? "bg-primary"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-muted-foreground";
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-20 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all", fillCls)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums w-16 text-right text-muted-foreground">
        {value === null || value === undefined ? "—" : value.toFixed(3)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rich hit card — shared between Search tab and Agent Simulation tab
// ---------------------------------------------------------------------------

function fileNameOf(meta: Record<string, unknown>): string | null {
  const src = (meta?.source ?? {}) as Record<string, unknown>;
  return (
    (src.file_name as string | undefined) ??
    (src.title as string | undefined) ??
    (src.path as string | undefined) ??
    null
  );
}

function pageNumberOf(meta: Record<string, unknown>): number | null {
  const pn = (meta?.page_number ?? meta?.first_page) as
    | number
    | string
    | undefined;
  if (typeof pn === "number") return pn;
  if (typeof pn === "string") {
    const n = Number.parseInt(pn, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function citationHrefFor(
  source_kind: string,
  source_id: string,
  page: number | null,
  chunk_id: string,
): string | null {
  switch (source_kind) {
    case "cld_file":
      return `/files/f/${source_id}?tab=document&chunk=${chunk_id}${
        page ? `&page=${page}` : ""
      }`;
    case "note":
      return `/notes/${source_id}`;
    case "code_file":
      return `/code/${source_id}`;
    case "library_doc":
      return `/rag/viewer/${source_id}?chunk=${chunk_id}`;
    default:
      return null;
  }
}

function RichHitCard({
  rank,
  hit,
  showFullText = false,
  showBreakdown = false,
}: {
  rank: number;
  hit: RagSearchHit | DiagnoseHit;
  showFullText?: boolean;
  showBreakdown?: boolean;
}) {
  const meta = (hit.metadata ?? {}) as Record<string, unknown>;
  const src = (meta?.source ?? {}) as Record<string, unknown>;
  const libraryShortCode = src.library_short_code as string | undefined;
  const fileName =
    "file_name" in hit && hit.file_name ? hit.file_name : fileNameOf(meta);
  const pageNumber =
    "page_number" in hit && hit.page_number != null
      ? hit.page_number
      : pageNumberOf(meta);
  const snippet = "snippet" in hit ? hit.snippet : (hit as DiagnoseHit).snippet;
  const href = citationHrefFor(
    hit.source_kind,
    hit.source_id,
    pageNumber,
    hit.chunk_id,
  );

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      {/* Header — wraps on phones so chips never overflow horizontally */}
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 text-xs flex-wrap">
        <span className="tabular-nums font-mono w-7 text-right text-muted-foreground">
          #{rank}
        </span>
        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-mono uppercase tracking-wide text-muted-foreground">
          {hit.source_kind}
        </span>
        {libraryShortCode && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            library · {libraryShortCode}
          </Badge>
        )}
        <span className="truncate font-medium text-foreground min-w-0 flex-1">
          {fileName ?? `(${hit.source_kind})`}
        </span>
        {pageNumber !== null && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 ml-auto"
          >
            page {pageNumber}
          </Badge>
        )}
        <Badge
          variant="outline"
          className={cn(
            "tabular-nums text-[10px]",
            pageNumber === null && "ml-auto",
          )}
        >
          score {hit.score.toFixed(3)}
        </Badge>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline text-[11px] whitespace-nowrap"
          >
            open ↗
          </a>
        )}
      </div>

      {/* Snippet */}
      <div className="px-3 py-2">
        <div
          className={cn(
            "text-sm whitespace-pre-wrap text-foreground",
            !showFullText && "line-clamp-6",
          )}
        >
          {snippet}
        </div>
      </div>

      {/* Optional score breakdown */}
      {showBreakdown && (
        <div className="px-3 py-2 border-t bg-muted/20 space-y-1">
          <ScoreBar
            label="Vector rank"
            value={
              "vector_rank" in hit && hit.vector_rank != null
                ? hit.vector_rank
                : null
            }
            max={100}
            tone="primary"
          />
          <ScoreBar
            label="Lexical rank"
            value={
              "lexical_rank" in hit && hit.lexical_rank != null
                ? hit.lexical_rank
                : null
            }
            max={100}
            tone="default"
          />
          <ScoreBar
            label="Rerank score"
            value={
              "rerank_score" in hit && hit.rerank_score != null
                ? hit.rerank_score
                : null
            }
            max={1}
            tone="amber"
          />
          <div className="flex items-center gap-2 pt-1 text-[10px] text-muted-foreground">
            <code className="font-mono">chunk_id</code>
            <code className="font-mono truncate flex-1">{hit.chunk_id}</code>
            <button
              type="button"
              className="hover:text-foreground p-0.5"
              onClick={() => {
                navigator.clipboard.writeText(hit.chunk_id);
                toast.success("chunk_id copied");
              }}
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
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
      <div className="px-3 py-2 border-b flex items-center gap-2">
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
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={scope.rerank}
            onCheckedChange={(v) => scope.setRerank(v === true)}
          />
          <span>Rerank with Cohere</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={scope.useHyde}
            onCheckedChange={(v) => scope.setUseHyde(v === true)}
          />
          <span>HyDE expansion</span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Multi-query</span>
          <input
            type="number"
            min={1}
            max={5}
            value={scope.multiQuery}
            onChange={(e) =>
              scope.setMultiQuery(
                Math.max(1, Math.min(5, Number(e.target.value) || 1)),
              )
            }
            className="w-14 px-1.5 py-1 text-base rounded border bg-background"
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
  const options: { v: SourceKindFilter; label: string }[] = [
    { v: "all", label: "All" },
    { v: "cld_file", label: "Files" },
    { v: "note", label: "Notes" },
    { v: "code_file", label: "Code" },
  ];
  return (
    <div className="flex items-center rounded-md border p-0.5 text-[11px]">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "px-1.5 py-0.5 rounded transition-colors flex-1",
            value === o.v
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

function SearchTab({ scope }: { scope: Scope }) {
  const router = useRouter();
  const params = useSearchParams();
  const initialQuery = params?.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<RagSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sourceKindFilters = useMemo(
    () =>
      scope.sourceKinds
        ? {
            source_kinds: scope.sourceKinds as (
              | "cld_file"
              | "note"
              | "code_file"
            )[],
          }
        : undefined,
    [scope.sourceKinds],
  );
  const searchContext = useRagSearchContext(sourceKindFilters);

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRunning(true);
    setError(null);
    setResponse(null);
    try {
      const r = await ragSearch({
        query: trimmed,
        limit: 25,
        rerank: scope.rerank,
        only_children: true,
        data_store_id: scope.storeId ?? undefined,
        admin_bypass_acl: scope.adminBypass || undefined,
        ...searchContext,
      });
      setResponse(r);

      const next = new URLSearchParams();
      if (trimmed) next.set("q", trimmed);
      if (scope.storeId) next.set("store_id", scope.storeId);
      router.replace(`/rag/search${next.toString() ? `?${next}` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setRunning(false);
    }
  }, [query, scope, router, searchContext]);

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

  return (
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
              ranked by vector similarity + lexical match, fused with RRF,
              optionally reranked by Cohere, and de-duplicated with MMR.
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
              </div>
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
                      showFullText
                      showBreakdown
                    />
                  </motion.div>
                ))
              )}
            </motion.div>
          </NonEditableContextMenu>
        )}
      </ScrollArea>
    </div>
  );
}

// ===========================================================================
// Agent tool view — the agent's ACTUAL rag_search, with play-out
// ===========================================================================
//
// Calls /rag/search-lab/tool/search, which reproduces byte-for-byte what the
// registered rag_search tool hands the model (same search() call, same output
// mappers). Supports N queries (a real agent fires several) and the full arg
// surface, threads the working-context org/scope (the missing piece that made
// the simulation return 0), and lets you "play out" rag_get_chunk on any hit.

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
                      {out.data.note ?? `rag_get_chunk → ${out.data.status}`}
                    </span>
                  )}
                  {out.data && out.data.status === "ok" && chunk && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        rag_get_chunk → full chunk content
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

  const run = useCallback(async () => {
    const qs = queries.map((q) => q.trim()).filter(Boolean);
    if (qs.length === 0) return;
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
        scope_ids: scopeIds,
        organization_id: orgOverride,
      });
      setResp(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent tool search failed");
    } finally {
      setRunning(false);
    }
  }, [queries, scope, orgOverride, scopeIds]);

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 text-xs">
        <Brain className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold">
          Agent&apos;s actual tool · rag_search
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
      candidates_after_fusion: 0,
      candidates_after_mmr: 0,
      hits: [],
      reranker_model: null,
      effective_filters: {},
      notes: [],
    };
    try {
      for await (const evt of ragDiagnoseStream(requestPayload)) {
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
      setError(e instanceof Error ? e.message : "Diagnose failed");
    } finally {
      setRunning(false);
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
      lines.push(h.snippet.slice(0, 1500));
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
          The panel below runs the agent&apos;s ACTUAL rag_search tool (with
          play-out into rag_get_chunk). Underneath, the full retrieval pipeline
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
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
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
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
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
                {expand.query_vector_preview.length > 0 && (
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
                    icon={<Sparkles className="h-3.5 w-3.5" />}
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
                          showFullText
                          showBreakdown
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
 * renders tool calls (including a dedicated `rag_search` renderer), exposes the
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
  const dispatch = useAppDispatch();
  const surfaceKey = `${RAG_SEARCH_SOURCE_FEATURE}:${RAG_AGENT_ID}`;

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
        source_kinds: scope.sourceKinds,
        admin_bypass_acl: scope.adminBypass,
        rerank: scope.rerank,
        multi_query: scope.multiQuery,
        use_hyde: scope.useHyde,
      }),
    [
      scope.storeId,
      storeName,
      scope.sourceKinds,
      scope.adminBypass,
      scope.rerank,
      scope.multiQuery,
      scope.useHyde,
    ],
  );

  const { conversationId } = useAgentLauncher(RAG_AGENT_ID, {
    surfaceKey,
    sourceFeature: RAG_SEARCH_SOURCE_FEATURE,
    apiEndpointMode: "agent",
    config: {
      displayMode: "direct",
      autoRun: false,
      allowChat: true,
    },
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
                    {Object.entries(inv.by_visibility_route).length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        No breakdown available.
                      </div>
                    ) : (
                      Object.entries(inv.by_visibility_route).map(([k, v]) => (
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
export function RagSearchExperience() {
  const scope = useScopeControls();
  const params = useSearchParams();
  const initialTab = (params?.get("tab") as string | null) ?? "search";
  const isMobile = useIsMobile();
  const [scopeOpen, setScopeOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background md:h-page md:flex-row">
      {/* Desktop persistent sidebar — collapses out on mobile in favour of the Drawer */}
      {!isMobile && <ScopeSidebar scope={scope} />}

      <Tabs
        defaultValue={initialTab}
        className="flex-1 flex flex-col overflow-hidden min-h-0"
      >
        <div className="border-b px-2 pt-2 pb-1 flex items-center gap-2 md:px-4 md:gap-3">
          {/* Mobile-only: scope drawer trigger sits where the sidebar would be */}
          {isMobile && (
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
            <SearchTab scope={scope} />
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
  );
}

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
 *   3. Agent Chat      — chat with Claude that uses rag_search as a tool,
 *                          streaming every tool call and result for full
 *                          transparency
 *   4. Diagnostics     — caller's content inventory, per-route visibility
 *                          breakdown, per-query trace, admin ACL-bypass
 *
 * Designed for admins demoing the RAG system. The Search tab should also
 * feel polished enough for any normal user.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  Beaker,
  Bot,
  Brain,
  Copy,
  Database,
  FileText,
  FlaskConical,
  Loader2,
  MessageSquare,
  Play,
  Search as SearchIcon,
  Send,
  Settings2,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import {
  ragSearch,
  type RagSearchHit,
  type RagSearchResponse,
} from "@/features/rag/api/search";
import {
  ragAgentChatStream,
  ragDiagnose,
  ragExpand,
  ragInventory,
  type AgentEvent,
  type AgentToolHit,
  type DiagnoseHit,
  type DiagnoseResponse,
  type ExpandResponse,
  type InventoryResponse,
} from "@/features/rag/api/search-lab";
import { useDataStores } from "@/features/rag/hooks/useDataStores";
import { AnimatedKpiCard } from "@/features/rag/components/library/AnimatedKpiCard";

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
  const pn = (meta?.page_number ?? meta?.first_page) as number | string | undefined;
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
    "file_name" in hit && hit.file_name
      ? hit.file_name
      : fileNameOf(meta);
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
      {/* Header */}
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 text-xs">
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
        <span className="truncate font-medium text-foreground">
          {fileName ?? `(${hit.source_kind})`}
        </span>
        {pageNumber !== null && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
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

function ScopeSidebar({ scope }: { scope: Scope }) {
  return (
    <aside className="w-64 border-r flex flex-col overflow-hidden shrink-0">
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <Database className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold flex-1">Scope</h2>
      </div>
      <ScrollArea className="flex-1">
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
        <KindToggle
          value={scope.kindFilter}
          onChange={scope.setKindFilter}
        />
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={scope.rerank}
            onChange={(e) => scope.setRerank(e.target.checked)}
            className="rounded"
          />
          <span>Rerank with Cohere</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={scope.useHyde}
            onChange={(e) => scope.setUseHyde(e.target.checked)}
            className="rounded"
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
            className="w-12 px-1.5 py-0.5 text-xs rounded border bg-background"
          />
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer text-amber-700 dark:text-amber-400">
          <input
            type="checkbox"
            checked={scope.adminBypass}
            onChange={(e) => scope.setAdminBypass(e.target.checked)}
            className="rounded"
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
        filters: scope.sourceKinds
          ? {
              source_kinds: scope.sourceKinds as (
                | "cld_file"
                | "note"
                | "code_file"
              )[],
            }
          : undefined,
        admin_bypass_acl: scope.adminBypass || undefined,
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
  }, [query, scope, router]);

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
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search indexed content (PDFs, notes, code)…"
              className="pl-9 h-10"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResponse(null);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button type="submit" disabled={!query.trim() || running}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Search"
            )}
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
              Each card shows the full hit snippet with the source, page,
              and a deep link into the original document.
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

        <AnimatePresence mode="wait">
          {response && (
            <motion.div
              key={response.query}
              {...FADE_IN_UP}
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
                  . Try the Diagnostics tab to check whether your content
                  was indexed and is visible to you.
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
          )}
        </AnimatePresence>
      </ScrollArea>
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
    }),
    [query, scope],
  );

  const runAll = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRunning(true);
    setError(null);
    setDiag(null);
    setExpand(null);
    try {
      const [exp, dg] = await Promise.all([
        ragExpand({
          query: trimmed,
          multi_query: scope.multiQuery,
          use_hyde: scope.useHyde,
        }),
        ragDiagnose(requestPayload),
      ]);
      setExpand(exp);
      setDiag(dg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Diagnose failed");
    } finally {
      setRunning(false);
    }
  }, [query, requestPayload, scope]);

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
              className="pl-9 h-10"
            />
          </div>
          <Button type="submit" disabled={!query.trim() || running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : "Diagnose"}
          </Button>
        </form>
        <p className="mt-2 text-[11px] text-muted-foreground">
          This tab runs the full retrieval pipeline and exposes every layer:
          query rewrites, HyDE passage, embedding vector preview, per-stage
          counts, raw request/response, per-hit score breakdown, and the
          exact prompt block an agent would receive.
        </p>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
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
                  <Badge variant="outline" className="text-[10px]">
                    {diag.elapsed_ms} ms total
                  </Badge>
                </div>
                <div className="px-3 py-2 grid grid-cols-2 md:grid-cols-5 gap-2">
                  <AnimatedKpiCard
                    icon={<Database className="h-3.5 w-3.5" />}
                    label="Visible chunks"
                    value={diag.visible_chunks_total}
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

              <div>
                <div className="text-xs font-semibold mb-2">
                  Hits with full score breakdown ({diag.hits.length})
                </div>
                <div className="space-y-3">
                  {diag.hits.map((h, i) => (
                    <RichHitCard
                      key={h.chunk_id}
                      rank={i + 1}
                      hit={h}
                      showFullText
                      showBreakdown
                    />
                  ))}
                </div>
              </div>

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

interface AgentTurn {
  turn: number;
  text: string;
  toolCalls: {
    tool_use_id: string;
    args: Record<string, unknown>;
    result: {
      n_hits: number;
      total_candidates: number;
      latency_ms: number;
      hits: AgentToolHit[];
    } | null;
    error: string | null;
  }[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  turns?: AgentTurn[];
  raw_events?: AgentEvent[];
}

function AgentChatTab({ scope }: { scope: Scope }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: "",
      turns: [],
      raw_events: [],
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);
    setError(null);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const stream = ragAgentChatStream(
        {
          query: trimmed,
          history,
          data_store_id: scope.storeId ?? null,
          source_kinds: scope.sourceKinds,
          admin_bypass_acl: scope.adminBypass,
          rerank: scope.rerank,
          multi_query: scope.multiQuery,
          use_hyde: scope.useHyde,
          max_tool_calls: 6,
        },
        { signal: ac.signal },
      );

      const currentTurns: Map<number, AgentTurn> = new Map();

      for await (const ev of stream) {
        // Apply event to assistant message
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (!last || last.role !== "assistant") return prev;
          const turns = last.turns ?? [];
          const rawEvents = last.raw_events ?? [];
          rawEvents.push(ev);

          if (ev.kind === "rag.agent.turn.started") {
            const t: AgentTurn = { turn: ev.turn, text: "", toolCalls: [] };
            currentTurns.set(ev.turn, t);
            turns.push(t);
          } else if (ev.kind === "rag.agent.text") {
            const t = currentTurns.get(ev.turn) ?? turns[turns.length - 1];
            if (t) t.text = (t.text || "") + ev.text;
            // Accumulate the most recent assistant text as the message content
            const textAcrossTurns = turns
              .map((tt) => tt.text)
              .filter(Boolean)
              .join("\n\n");
            last.content = textAcrossTurns;
          } else if (ev.kind === "rag.agent.tool_call") {
            const t = currentTurns.get(ev.turn);
            if (t)
              t.toolCalls.push({
                tool_use_id: ev.tool_use_id,
                args: ev.args,
                result: null,
                error: null,
              });
          } else if (ev.kind === "rag.agent.tool_result") {
            for (const t of turns) {
              const c = t.toolCalls.find(
                (x) => x.tool_use_id === ev.tool_use_id,
              );
              if (c) {
                c.result = {
                  n_hits: ev.n_hits,
                  total_candidates: ev.total_candidates,
                  latency_ms: ev.latency_ms,
                  hits: ev.hits,
                };
                break;
              }
            }
          } else if (ev.kind === "rag.agent.tool_error") {
            for (const t of turns) {
              const c = t.toolCalls.find(
                (x) => x.tool_use_id === ev.tool_use_id,
              );
              if (c) c.error = ev.message;
            }
          } else if (ev.kind === "rag.agent.error") {
            setError(ev.message);
          }

          next[next.length - 1] = {
            ...last,
            turns: [...turns],
            raw_events: [...rawEvents],
          };
          return next;
        });
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        setError(e.message);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, scope, streaming]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const reset = useCallback(() => {
    if (streaming) cancel();
    setMessages([]);
    setError(null);
  }, [cancel, streaming]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="border-b p-3 flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Agent Chat</div>
          <div className="text-[11px] text-muted-foreground">
            Claude with rag_search as a tool. Every search the model runs is
            shown live in the transcript.
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={messages.length === 0 && !streaming}
        >
          Reset
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {messages.length === 0 && (
            <div className="rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-2">
                Ask the agent anything
              </p>
              <p>
                The agent will call <code className="font-mono">rag_search</code>{" "}
                one or more times, then answer using only what it retrieved.
                You'll see every tool call, every retrieved chunk, and the
                final answer.
              </p>
            </div>
          )}

          {messages.map((m, idx) => (
            <ChatMessageView key={idx} message={m} />
          ))}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask the agent a question…   (⌘/Ctrl+Enter to send)"
            className="min-h-[60px] resize-y"
            disabled={streaming}
          />
          {streaming ? (
            <Button type="button" variant="destructive" onClick={cancel}>
              Cancel
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

function ChatMessageView({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="rounded-md border bg-primary/5 px-3 py-2">
        <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground mb-0.5">
          You
        </div>
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
      </div>
    );
  }
  const turns = message.turns ?? [];
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 text-xs">
        <Bot className="h-3.5 w-3.5 text-primary" />
        <span className="font-semibold">Agent</span>
        <Badge variant="outline" className="text-[10px]">
          {turns.length} turn{turns.length === 1 ? "" : "s"}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {turns.reduce((acc, t) => acc + t.toolCalls.length, 0)} tool calls
        </Badge>
      </div>
      <div className="px-3 py-2 space-y-3">
        {turns.map((t) => (
          <div key={t.turn} className="space-y-2">
            {t.text && (
              <div className="text-sm whitespace-pre-wrap">{t.text}</div>
            )}
            {t.toolCalls.map((c) => (
              <div
                key={c.tool_use_id}
                className="rounded-md border border-primary/30 bg-primary/5 overflow-hidden"
              >
                <div className="px-2 py-1 bg-primary/10 flex items-center gap-2 text-[11px]">
                  <SearchIcon className="h-3 w-3 text-primary" />
                  <code className="font-mono font-semibold">rag_search</code>
                  <span className="text-muted-foreground">
                    query:{" "}
                    <code className="text-foreground">
                      "{String(c.args.query ?? "")}"
                    </code>
                  </span>
                  {c.result && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] ml-auto"
                    >
                      {c.result.n_hits} hits · {c.result.latency_ms}ms
                    </Badge>
                  )}
                </div>
                {c.error && (
                  <div className="px-2 py-1 text-xs text-destructive">
                    {c.error}
                  </div>
                )}
                {c.result && c.result.hits.length > 0 && (
                  <div className="px-2 py-1 space-y-1">
                    {c.result.hits.slice(0, 4).map((h) => (
                      <div
                        key={h.chunk_id}
                        className="rounded border bg-card px-2 py-1.5 text-[11px]"
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="tabular-nums w-6 text-right text-muted-foreground">
                            #{h.rank}
                          </span>
                          <span className="font-mono uppercase tracking-wide text-muted-foreground">
                            {h.source_kind}
                          </span>
                          <span className="font-medium truncate">
                            {h.file_name ?? h.source_id}
                          </span>
                          {h.page_number != null && (
                            <span className="text-muted-foreground">
                              p.{h.page_number}
                            </span>
                          )}
                          <span className="ml-auto tabular-nums text-muted-foreground">
                            {h.score.toFixed(3)}
                          </span>
                        </div>
                        <div className="text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                          {h.snippet.slice(0, 300)}
                        </div>
                      </div>
                    ))}
                    {c.result.hits.length > 4 && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        + {c.result.hits.length - 4} more…
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
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
            See what chunks are visible to you, and via which ACL route.
            Toggle "Admin: bypass ACL" in the sidebar to compare against the
            full database.
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
                Click <strong>Load</strong> to fetch every chunk visible to
                you, grouped by source kind and visibility route.
              </p>
              <p className="mt-2 text-xs">
                If you're not finding your PDFs in search, this is the
                fastest way to confirm whether they were ingested and whether
                ACL is filtering them out.
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
                    label="Total chunks"
                    value={inv.total_visible_chunks.toLocaleString()}
                  />
                  <Stat
                    label="Distinct sources"
                    value={inv.total_visible_sources.toLocaleString()}
                  />
                  <Stat label="Is admin" value={inv.scope.is_admin ? "yes" : "no"} />
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
                        No chunks visible.
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
                            {b.visible_chunks.toLocaleString()} chunks
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
                    By visibility route (why is each chunk visible?)
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
                  Top sources by chunk count
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
                          {t.chunk_count} chunks
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

export function RagSearchExperience() {
  const scope = useScopeControls();
  const params = useSearchParams();
  const initialTab = (params?.get("tab") as string | null) ?? "search";

  return (
    <div className="flex h-[calc(100vh-3rem)] bg-background">
      <ScopeSidebar scope={scope} />

      <Tabs
        defaultValue={initialTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="border-b px-4 pt-2 pb-1 flex items-center gap-3">
          <TabsList className="h-9">
            <TabsTrigger value="search" className="gap-1.5">
              <SearchIcon className="h-3.5 w-3.5" /> Search
            </TabsTrigger>
            <TabsTrigger value="agent-sim" className="gap-1.5">
              <Brain className="h-3.5 w-3.5" /> Agent Simulation
            </TabsTrigger>
            <TabsTrigger value="agent-chat" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Agent Chat
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="gap-1.5">
              <Stethoscope className="h-3.5 w-3.5" /> Diagnostics
            </TabsTrigger>
          </TabsList>
          <div className="ml-auto text-[11px] text-muted-foreground">
            RAG Search Lab · hybrid retrieval + Claude agent
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
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
    </div>
  );
}

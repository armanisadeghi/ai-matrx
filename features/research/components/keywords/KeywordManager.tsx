"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Loader2,
  Search,
  RefreshCw,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTopicContext } from "../../context/ResearchContext";
import {
  useResearchKeywords,
  useCurationData,
} from "../../hooks/useResearchState";
import { useResearchApi } from "../../hooks/useResearchApi";
import { deleteKeyword as deleteKeywordService } from "../../service";
import { ResearchFilterBar, type FilterDef } from "../shared/ResearchFilterBar";
import type { FilterOption } from "@/components/hierarchy-filter/HierarchyFilterPill";
import type { ResearchKeyword, ResearchSource } from "../../types";
import { Favicon } from "../overview/live-pipeline/ui/Favicon";
import { idMatchesQuery } from "@/utils/search-scoring";

/** Compact number: 6234393 → "6.2M", 1234 → "1.2k". */
const fmtNum = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : String(n);

interface KeywordStat {
  sources: number;
  goodScrapes: number;
  chars: number;
  reports: number;
  top: { source: ResearchSource; rank: number | null }[];
}

export default function KeywordManager() {
  const { topicId } = useTopicContext();
  const { data: keywords, isLoading, refresh } = useResearchKeywords(topicId);
  const api = useResearchApi();

  const [newKeyword, setNewKeyword] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [staleFilter, setStaleFilter] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);

  const items = keywords ?? [];

  const { data: curation } = useCurationData(topicId);
  const [expandedKw, setExpandedKw] = useState<string | null>(null);

  // Per-keyword aggregates (results → reads → chars → reports) + top-10 by this
  // keyword's rank, derived from the shared curation data.
  const kwStats = useMemo(() => {
    const map = new Map<string, KeywordStat>();
    for (const row of curation?.rows ?? []) {
      for (const k of row.importance?.perKeyword ?? []) {
        let s = map.get(k.keyword_id);
        if (!s) {
          s = { sources: 0, goodScrapes: 0, chars: 0, reports: 0, top: [] };
          map.set(k.keyword_id, s);
        }
        s.sources += 1;
        const ss = row.source.scrape_status;
        if (ss === "success" || ss === "complete") s.goodScrapes += 1;
        s.chars += row.charCount ?? 0;
        if (row.analysis === "content") s.reports += 1;
        s.top.push({ source: row.source, rank: k.rank });
      }
    }
    for (const s of map.values()) {
      s.top.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
      s.top = s.top.slice(0, 10);
    }
    return map;
  }, [curation]);

  const providers = useMemo(
    () => [...new Set(items.map((k) => k.search_provider))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    let list = items;
    if (staleFilter === "stale") list = list.filter((k) => k.is_stale);
    else if (staleFilter === "fresh") list = list.filter((k) => !k.is_stale);
    if (providerFilter)
      list = list.filter((k) => k.search_provider === providerFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (k) =>
          k.keyword.toLowerCase().includes(q) ||
          k.search_provider.toLowerCase().includes(q) ||
          (k.last_searched_at ?? "").toLowerCase().includes(q) ||
          idMatchesQuery(k, q),
      );
    }
    return list;
  }, [items, staleFilter, providerFilter, search]);

  const handleAdd = async () => {
    const kw = newKeyword.trim();
    if (!kw) return;
    setAdding(true);
    try {
      await api.addKeywords(topicId, { keywords: [kw] });
      setNewKeyword("");
      refresh();
    } catch {
      // silent
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (keyword: ResearchKeyword) => {
    setDeletingId(keyword.id);
    try {
      await deleteKeywordService(keyword.id);
      refresh();
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  };

  const freshnessOptions: FilterOption[] = [
    { id: "fresh", label: "Fresh" },
    { id: "stale", label: "Stale" },
  ];
  const providerOptions: FilterOption[] = useMemo(
    () => providers.map((p) => ({ id: p, label: p })),
    [providers],
  );

  const filterDefs: FilterDef[] = useMemo(() => {
    const defs: FilterDef[] = [
      {
        key: "freshness",
        label: "Freshness",
        allLabel: "All",
        options: freshnessOptions,
        selectedId: staleFilter,
        onSelect: setStaleFilter,
      },
    ];
    if (providers.length > 1) {
      defs.push({
        key: "provider",
        label: "Provider",
        allLabel: "All Providers",
        options: providerOptions,
        selectedId: providerFilter,
        onSelect: setProviderFilter,
      });
    }
    return defs;
  }, [
    freshnessOptions,
    providerOptions,
    staleFilter,
    providerFilter,
    providers.length,
  ]);

  return (
    <div className="p-3 sm:p-4 space-y-3">
      {/* Add keyword — matrx-glass-thin-border toolbar (renders instantly) */}
      <div className="flex items-center gap-1.5 p-1 rounded-full matrx-glass-thin-border">
        <div className="flex-1 flex items-center gap-1.5 min-w-0 h-6 px-2 rounded-full matrx-glass-card">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="Add a keyword..."
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground placeholder:text-[11px]"
            style={{ fontSize: "16px" }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            disabled={adding}
          />
          {newKeyword && (
            <button
              onClick={() => setNewKeyword("")}
              className="shrink-0 p-0.5 rounded-full hover:bg-muted/50 transition-colors"
            >
              <X className="h-2.5 w-2.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <button
          onClick={handleAdd}
          disabled={adding || !newKeyword.trim()}
          className={cn(
            "inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-medium transition-all shrink-0",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          {adding ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          <span className="hidden sm:inline">Add</span>
        </button>
        <button
          onClick={refresh}
          className="inline-flex items-center justify-center h-5 w-5 rounded-full matrx-glass-card text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <RefreshCw className="h-2.5 w-2.5" />
        </button>
      </div>

      <ResearchFilterBar
        title="Keywords"
        count={`${filtered.length}/${items.length}`}
        filters={filterDefs}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Filter keywords..."
      />

      {/* Keyword list — only this section shows loading */}
      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 text-center px-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center">
            <Search className="h-6 w-6 text-primary/40" />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground/70">
              {items.length === 0 ? "No keywords yet" : "No matches"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 max-w-[240px]">
              {items.length === 0
                ? "Add keywords to define what topics to research. Each keyword drives source discovery."
                : "Try adjusting your search or filters to find what you're looking for."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((kw) => {
            const stat = kwStats.get(kw.id);
            const expanded = expandedKw === kw.id;
            const canExpand = !!stat && stat.top.length > 0;
            return (
              <div
                key={kw.id}
                className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm transition-all hover:border-primary/25"
              >
                <div className="group flex items-center gap-2 p-2.5 min-h-[44px]">
                  <Link
                    href={`/research/topics/${topicId}/keywords/${kw.id}`}
                    className="min-w-0 flex-1"
                  >
                    <div className="font-medium text-sm leading-tight truncate">
                      {kw.keyword}
                    </div>
                    {stat ? (
                      <div className="mt-1 flex items-center gap-1 flex-wrap text-[10px] tabular-nums text-muted-foreground">
                        <span>
                          <b className="text-foreground">{stat.sources}</b>{" "}
                          results
                        </span>
                        <ChevronRight className="h-2.5 w-2.5 opacity-40" />
                        <span>
                          <b className="text-foreground">{stat.goodScrapes}</b>{" "}
                          reads
                        </span>
                        <ChevronRight className="h-2.5 w-2.5 opacity-40" />
                        <span>
                          <b className="text-foreground">{fmtNum(stat.chars)}</b>{" "}
                          chars
                        </span>
                        <ChevronRight className="h-2.5 w-2.5 opacity-40" />
                        <span>
                          <b className="text-foreground">{stat.reports}</b>{" "}
                          reports
                        </span>
                        {kw.is_stale && (
                          <span className="ml-1 font-medium text-yellow-600 dark:text-yellow-400">
                            Stale
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                        <span>{kw.search_provider}</span>
                        {kw.result_count !== null && (
                          <span>{kw.result_count} results</span>
                        )}
                        {kw.is_stale && (
                          <span className="font-medium text-yellow-600 dark:text-yellow-400">
                            Stale
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                  {canExpand && (
                    <button
                      onClick={() => setExpandedKw(expanded ? null : kw.id)}
                      aria-label={expanded ? "Hide top results" : "Show top results"}
                      className="h-7 px-2 inline-flex items-center gap-1 rounded-lg text-[10px] text-muted-foreground hover:bg-muted/50 transition-colors shrink-0"
                    >
                      Top {stat.top.length}
                      {expanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  )}
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all shrink-0"
                    disabled={deletingId === kw.id}
                    onClick={() => handleDelete(kw)}
                  >
                    {deletingId === kw.id ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : (
                      <Trash2 className="h-3 w-3 text-destructive/70" />
                    )}
                  </button>
                </div>
                {expanded && stat && (
                  <div className="grid grid-cols-1 gap-1 border-t border-border/40 p-2 sm:grid-cols-2">
                    {stat.top.map(({ source, rank }) => (
                      <Link
                        key={source.id}
                        href={`/research/topics/${topicId}/sources/${source.id}`}
                        className="flex min-w-0 items-start gap-1.5 rounded-lg p-1.5 transition-colors hover:bg-muted/40"
                      >
                        <span className="w-5 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                          #{rank ?? "—"}
                        </span>
                        <Favicon
                          hostname={source.hostname}
                          size={14}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium">
                            {source.title || source.hostname || source.url}
                          </div>
                          {source.description && (
                            <div className="line-clamp-2 text-[10px] text-muted-foreground">
                              {source.description}
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

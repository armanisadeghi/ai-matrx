"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Play,
  Plus,
  Trash2,
  Loader2,
  Search,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  Globe,
  BookOpen,
  Type,
  FileText,
  Target,
  Pencil,
  Check,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useTopicContext } from "../../context/ResearchContext";
import {
  useResearchKeywords,
  useCurationData,
} from "../../hooks/useResearchState";
import {
  addKeywords,
  deleteKeyword as deleteKeywordService,
  updateKeywordGoal,
} from "../../service";
import { evaluateKeywordQuota, type QuotaVerdict } from "../../keywordQuota";
import { useRunPipeline } from "../../hooks/useRunPipeline";
import { KeywordQuotaDialog } from "./KeywordQuotaDialog";
import { fmtCount } from "../../format";
import { ResearchFilterBar, type FilterDef } from "../shared/ResearchFilterBar";
import type { FilterOption } from "@/components/hierarchy-filter/HierarchyFilterPill";
import type { ResearchKeyword, ResearchSource } from "../../types";
import { Favicon } from "../overview/live-pipeline/ui/Favicon";
import { idMatchesQuery } from "@/utils/search-scoring";
import KeywordOverlapMatrix from "./KeywordOverlapMatrix";

/**
 * The keyword's FOCUSED LENS, viewable and editable in place. A goal changes
 * what every agent is told when researching this keyword (and gives it its own
 * per-lens analyses server-side), so it lives right on the row — never buried
 * in a settings pane. Clearing the text returns the keyword to the shared
 * topic-level lens.
 */
function KeywordGoalRow({
  keyword,
  onSaved,
}: {
  keyword: ResearchKeyword;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(keyword.goal ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next = draft.trim() || null;
    if (next === (keyword.goal ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateKeywordGoal(keyword.id, next);
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message ?? "Could not save the goal");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div
        className="mt-1 flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Target className="h-3 w-3 shrink-0 text-primary/70" />
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What is this search for?"
          className="flex-1 min-w-0 rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-xs outline-none focus:border-primary/50"
          style={{ fontSize: "16px" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") {
              setDraft(keyword.goal ?? "");
              setEditing(false);
            }
          }}
          disabled={saving}
        />
        <button
          className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted/60 shrink-0"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <Check className="h-3 w-3 text-primary" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className="group/goal mt-1 flex items-start gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <Target
        className={cn(
          "h-3 w-3 shrink-0 mt-0.5",
          keyword.goal ? "text-primary/70" : "text-muted-foreground/40",
        )}
      />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setDraft(keyword.goal ?? "");
          setEditing(true);
        }}
        className={cn(
          "min-w-0 text-left text-[11px] leading-snug hover:underline decoration-dotted underline-offset-2",
          keyword.goal
            ? "text-muted-foreground"
            : "text-muted-foreground/50 italic",
        )}
        title="Edit this keyword's goal"
      >
        {keyword.goal ?? "No goal — researched through the topic lens"}
        <Pencil className="ml-1 inline h-2.5 w-2.5 opacity-0 group-hover/goal:opacity-60 transition-opacity" />
      </button>
    </div>
  );
}

interface KeywordStat {
  sources: number;
  goodScrapes: number;
  chars: number;
  reports: number;
  top: { source: ResearchSource; rank: number | null }[];
}

// How many top results show inline by default (no interaction), and the hard cap
// on how many are ever materialized per keyword.
const INLINE_RESULTS = 4;
const MAX_RESULTS = 10;

export default function KeywordManager() {
  const { topicId, topic, refreshProgress } = useTopicContext();
  const { data: keywords, isLoading, refresh } = useResearchKeywords(topicId);

  const [newKeyword, setNewKeyword] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [staleFilter, setStaleFilter] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [quotaPrompt, setQuotaPrompt] = useState<{
    keyword: string;
    verdict: QuotaVerdict;
  } | null>(null);

  const items = keywords ?? [];
  const runPipeline = useRunPipeline();
  // `last_searched_at IS NULL` is the exact gate `/run` uses to decide whether
  // a keyword is searched (aidream research/service.py:1687) — the same truth
  // the readiness ledger reports, read here straight off the rows we already
  // have rather than through a second round trip.
  const unresearched = useMemo(
    () => items.filter((k) => !k.last_searched_at),
    [items],
  );

  const { data: curation } = useCurationData(topicId);
  // Expanded result sets, keyed by keyword id. Collapsed = top INLINE_RESULTS
  // shown inline with a fade hint; expanded = the full set.
  const [expandedKws, setExpandedKws] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((id: string) => {
    setExpandedKws((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Per-keyword aggregates (results → reads → chars → reports) + top sources by
  // this keyword's rank, derived from the shared curation data.
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
      s.top = s.top.slice(0, MAX_RESULTS);
    }
    return map;
  }, [curation]);

  const providers = useMemo(
    () => [...new Set(items.map((k) => k.search_provider))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    let list = items;
    // `rs_keyword.is_stale` is DEAD: nothing in the backend has ever written
    // it, so the old Fresh/Stale filter silently matched everything. The real
    // signal is `last_searched_at` — the exact gate `/run` uses to decide
    // whether a keyword gets searched (aidream research/service.py:1687).
    if (staleFilter === "unresearched")
      list = list.filter((k) => !k.last_searched_at);
    else if (staleFilter === "researched")
      list = list.filter((k) => !!k.last_searched_at);
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

  /**
   * Commit the add. Split out so both paths — straight through, and "the user
   * has seen the quota dialog" — share one implementation.
   */
  const commitAdd = useCallback(
    async (kw: string) => {
      setAdding(true);
      try {
        const goal = newGoal.trim();
        await addKeywords(
          topicId,
          { keywords: [kw] },
          goal ? { [kw]: goal } : undefined,
        );
        setNewKeyword("");
        setNewGoal("");
        refresh();
        refreshProgress();
      } catch (err) {
        toast.error((err as Error).message ?? "Could not add the keyword");
      } finally {
        setAdding(false);
      }
    },
    [topicId, newGoal, refresh, refreshProgress],
  );

  const handleAdd = async () => {
    const kw = newKeyword.trim();
    if (!kw) return;
    // Check the caps BEFORE writing. Adding past `max_keywords` writes a row
    // the pipeline will never touch, and past `max_keyword_syntheses` a keyword
    // that gets researched but never written up — both silently, until now.
    if (topic) {
      const verdict = evaluateKeywordQuota(topic, items.length + 1);
      if (verdict.shortfalls.length > 0) {
        setQuotaPrompt({ keyword: kw, verdict });
        return;
      }
    }
    await commitAdd(kw);
  };

  const handleDelete = async (keyword: ResearchKeyword) => {
    setDeletingId(keyword.id);
    try {
      await deleteKeywordService(keyword.id);
      refresh();
      refreshProgress();
    } catch (err) {
      toast.error((err as Error).message ?? "Could not delete the keyword");
    } finally {
      setDeletingId(null);
    }
  };

  const freshnessOptions: FilterOption[] = [
    { id: "researched", label: "Researched" },
    { id: "unresearched", label: "Not researched" },
  ];
  const providerOptions: FilterOption[] = useMemo(
    () => providers.map((p) => ({ id: p, label: p })),
    [providers],
  );

  const filterDefs: FilterDef[] = useMemo(() => {
    const defs: FilterDef[] = [
      {
        key: "freshness",
        label: "Research state",
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
      {/* Unresearched keywords — the state that was previously invisible.
          Adding a keyword after a completed run left it sitting here forever
          with nothing anywhere in the product saying so, and no way to act. */}
      {unresearched.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/[0.05] p-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">
              {unresearched.length === 1
                ? `“${unresearched[0].keyword}” has not been researched`
                : `${unresearched.length} keywords have not been researched`}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Running picks these up and reuses everything already captured —
              pages already read are not fetched again, and existing analyses
              are not re-run.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runPipeline.run()}
            disabled={runPipeline.isRunning}
            className="inline-flex shrink-0 items-center gap-1.5 h-7 px-3 rounded-full bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none transition-all"
          >
            {runPipeline.isRunning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {runPipeline.isRunning ? "Researching…" : "Research now"}
          </button>
          {runPipeline.isRunning && runPipeline.message && (
            <p className="w-full text-[10px] text-muted-foreground truncate">
              {runPipeline.message}
            </p>
          )}
        </div>
      )}

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

      {/* Focused lens — optional goal for the keyword being added. Appears only
          while a keyword is typed so the toolbar stays one quiet row at rest. */}
      {newKeyword.trim() && (
        <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-full matrx-glass-card">
          <Target className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            placeholder="What is this search for? e.g. “information about the partner, not the firm” (optional)"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground placeholder:text-[11px]"
            style={{ fontSize: "16px" }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            disabled={adding}
          />
        </div>
      )}

      {/* Overlap read — how well the chosen keywords converge on one goal.
          Mounts once there are ≥2 keywords; it self-handles the no-search-yet
          and single-active-keyword states. */}
      {items.length >= 2 && curation && (
        <KeywordOverlapMatrix
          rows={curation.rows}
          keywords={curation.keywords}
        />
      )}

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
            const expanded = expandedKws.has(kw.id);
            const results = stat?.top ?? [];
            const hasResults = results.length > 0;
            const visibleResults =
              expanded || results.length <= INLINE_RESULTS
                ? results
                : results.slice(0, INLINE_RESULTS);
            const hiddenCount = results.length - visibleResults.length;
            const canExpand = stat ? stat.sources > INLINE_RESULTS : false;
            return (
              <div
                key={kw.id}
                className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm transition-all hover:border-primary/25"
              >
                <div className="group flex items-start gap-2 p-2.5">
                  <Link
                    href={`/research/topics/${topicId}/keywords/${kw.id}`}
                    className="min-w-0 flex-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm leading-tight truncate">
                        {kw.keyword}
                      </span>
                      {/* The signal that used to be invisible. A keyword with
                          no `last_searched_at` has never been researched and
                          never will be until a run picks it up — say so. */}
                      {!kw.last_searched_at && (
                        <span className="shrink-0 rounded-full bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          Not researched
                        </span>
                      )}
                    </div>
                    {stat ? (
                      <KeywordStatTiles stat={stat} />
                    ) : (
                      <div className="mt-1 flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                        <span>{kw.search_provider}</span>
                        {kw.result_count !== null && (
                          <span>{kw.result_count} results</span>
                        )}
                      </div>
                    )}
                  </Link>
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

                {/* Focused lens — per-keyword goal, editable in place. */}
                <div className="px-2.5 pb-2 -mt-1">
                  <KeywordGoalRow keyword={kw} onSaved={refresh} />
                </div>

                {/* Top results — shown inline by default; the rest live behind
                    the bottom expander, with a fade hinting there's more. */}
                {hasResults && (
                  <div className="border-t border-border/40">
                    <div className="relative">
                      <div className="grid grid-cols-1 gap-0.5 p-2 sm:grid-cols-2">
                        {visibleResults.map(({ source, rank }) => (
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
                      {/* Fade hint over the last rows while collapsed. */}
                      {!expanded && hiddenCount > 0 && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-background rounded-b-xl" />
                      )}
                    </div>
                    {canExpand && (
                      <div className="flex justify-center pb-1.5">
                        <button
                          onClick={() => toggleExpanded(kw.id)}
                          aria-expanded={expanded}
                          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                        >
                          {expanded ? (
                            <>
                              Show less
                              <ChevronUp className="h-3 w-3" />
                            </>
                          ) : (
                            <>
                              Show all {stat?.sources} results
                              <ChevronDown className="h-3 w-3" />
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quota gate. Mounted at the component root (not inside the toolbar) so
          it survives the add-input resetting, and so a "raise" applies the caps
          BEFORE the keyword row is written — never leaving behind a row the
          pipeline silently ignores. */}
      {quotaPrompt && topic && (
        <KeywordQuotaDialog
          open
          onOpenChange={(open) => {
            if (!open) setQuotaPrompt(null);
          }}
          topicId={topicId}
          keywords={[quotaPrompt.keyword]}
          verdict={quotaPrompt.verdict}
          onResolved={async (raised) => {
            const kw = quotaPrompt.keyword;
            setQuotaPrompt(null);
            await commitAdd(kw);
            if (raised) {
              refresh();
              refreshProgress();
            } else {
              // Added under the cap deliberately — say what that means once,
              // rather than letting it be discovered as a missing result.
              toast.warning(
                "Added, but it is past your pipeline limit and will not be researched until you raise it.",
              );
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * The expensive work behind a keyword, made to register at a glance: results
 * found → pages read → characters processed → reports generated. Big numbers,
 * quiet labels, subtle iconography — the same stat-tile language used across
 * the research surfaces.
 */
function KeywordStatTiles({ stat }: { stat: KeywordStat }) {
  const tiles: {
    icon: typeof Globe;
    value: string;
    label: string;
    tint: string;
  }[] = [
    {
      icon: Globe,
      value: fmtCount(stat.sources),
      label: "Results",
      tint: "text-primary",
    },
    {
      icon: BookOpen,
      value: fmtCount(stat.goodScrapes),
      label: "Pages read",
      tint: "text-green-600 dark:text-green-400",
    },
    {
      icon: Type,
      value: fmtCount(stat.chars),
      label: "Characters",
      tint: "text-blue-600 dark:text-blue-400",
    },
    {
      icon: FileText,
      value: fmtCount(stat.reports),
      label: "Reports",
      tint: "text-amber-600 dark:text-amber-400",
    },
  ];
  return (
    <div className="mt-1.5 grid grid-cols-4 gap-1.5">
      {tiles.map(({ icon: Icon, value, label, tint }) => (
        <div
          key={label}
          className="rounded-lg border border-border/40 bg-card/40 px-2 py-1.5"
        >
          <div className="flex items-center gap-1">
            <Icon className={cn("h-3 w-3 shrink-0", tint)} />
            <span className="text-lg font-bold leading-none tabular-nums">
              {value}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-none text-muted-foreground truncate">
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState, useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ExternalLink,
  MoreVertical,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Download,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTopicContext, useStreamDebug } from "../../context/ResearchContext";
import {
  useResearchSources,
  useResearchKeywords,
  useSourceImportance,
} from "../../hooks/useResearchState";
import { useResearchApi } from "../../hooks/useResearchApi";
import { useResearchStream } from "../../hooks/useResearchStream";
import { bulkUpdateSources, updateSource } from "../../service";
import { useSourceFilters } from "../../hooks/useSourceFilters";
import { SourceFilters } from "./SourceFilters";
import { BulkActionBar } from "./BulkActionBar";
import { StatusBadge } from "../shared/StatusBadge";
import { SourceTypeIcon } from "../shared/SourceTypeIcon";
import { OriginBadge } from "../shared/OriginBadge";
import type { ResearchSource, BulkAction, SourceSortBy } from "../../types";
import type { SourceImportance } from "../../ranking";
import {
  sourceOriginFromDb,
  sourceTypeFromDb,
  stringArrayFromJson,
} from "../../types";
import { filterAndSortBySearch } from "@/utils/search-scoring";

function formatPageAge(pageAge: string | null): {
  display: string;
  daysOld: number | null;
} {
  if (!pageAge) return { display: "—", daysOld: null };
  const date = new Date(pageAge);
  if (isNaN(date.getTime())) return { display: pageAge, daysOld: null };
  const days = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days === 0) return { display: "Today", daysOld: 0 };
  if (days === 1) return { display: "1d ago", daysOld: 1 };
  if (days < 30) return { display: `${days}d ago`, daysOld: days };
  if (days < 365)
    return { display: `${Math.floor(days / 30)}mo ago`, daysOld: days };
  return { display: `${Math.floor(days / 365)}y ago`, daysOld: days };
}

function SortHeader({
  label,
  field,
  currentSort,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  field: SourceSortBy;
  currentSort?: SourceSortBy;
  currentDir?: string;
  onSort: (field: SourceSortBy) => void;
  className?: string;
}) {
  const isActive = currentSort === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors",
        isActive && "text-foreground",
        className,
      )}
    >
      {label}
      {isActive ? (
        currentDir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

interface SourceRowProps {
  source: ResearchSource;
  importance: SourceImportance | undefined;
  topicId: string;
  selected: boolean;
  scraping: boolean;
  navigating: boolean;
  anyNavigating: boolean;
  onSelect: (id: string) => void;
  onToggleInclude: (source: ResearchSource) => void;
  onScrape: (source: ResearchSource, e: React.MouseEvent) => void;
  onNavigate: (id: string, e?: React.MouseEvent) => void;
}

function SourceRow({
  source,
  importance,
  topicId,
  selected,
  scraping,
  navigating,
  anyNavigating,
  onSelect,
  onToggleInclude,
  onScrape,
  onNavigate,
}: SourceRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { display: pageAgeDisplay } = formatPageAge(source.page_age);
  const snippets = stringArrayFromJson(source.extra_snippets);
  const hasSnippets = snippets.length > 0;
  const needsScrape =
    source.scrape_status === "pending" ||
    source.scrape_status === "failed" ||
    source.scrape_status === "thin";

  return (
    <>
      <tr
        className={cn(
          "border-b border-border transition-colors group",
          !source.is_included && "opacity-50",
          navigating && "bg-muted/60",
          !anyNavigating && "hover:bg-muted/30 cursor-pointer",
          anyNavigating && !navigating && "cursor-not-allowed opacity-70",
        )}
        onClick={(e) => !anyNavigating && onNavigate(source.id, e)}
      >
        {/* Checkbox + Include + Rank stacked vertically */}
        <td
          className="px-2 py-2.5 w-12 align-top"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-1.5">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onSelect(source.id)}
              disabled={anyNavigating}
            />
            <Switch
              checked={source.is_included}
              onCheckedChange={() => onToggleInclude(source)}
              className="scale-[0.6]"
              disabled={anyNavigating}
            />
            {importance?.bestRank != null ? (
              <span
                className="text-[10px] font-mono font-semibold text-primary/70 tabular-nums"
                title={`importance ${importance.score} · ${importance.keywordCount} keyword${importance.keywordCount === 1 ? "" : "s"}`}
              >
                #{importance.bestRank}
              </span>
            ) : null}
          </div>
        </td>

        {/* Thumbnail — larger */}
        <td className="py-2.5 pr-3 w-16 align-top">
          <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
            {source.thumbnail_url ? (
              <Image
                src={source.thumbnail_url}
                alt=""
                width={56}
                height={56}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              <Globe className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </td>

        {/* Content: Title + URL + Description + Metadata */}
        <td className="px-2 py-2.5 w-full max-w-0">
          <div className="min-w-0 overflow-hidden">
            <div className="font-medium text-sm leading-snug line-clamp-2 break-words group-hover:text-primary transition-colors">
              {source.title || source.url}
            </div>
            <div className="text-xs text-muted-foreground break-all line-clamp-1 mt-0.5">
              {source.url}
            </div>
            {source.description && (
              <div className="text-xs text-muted-foreground/80 mt-0.5 line-clamp-2 leading-relaxed break-words">
                {source.description}
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground truncate max-w-48">
                {source.hostname}
              </span>
              <span className="text-muted-foreground/30">·</span>
              <SourceTypeIcon
                type={sourceTypeFromDb(source.source_type)}
                size={13}
                className="text-muted-foreground"
              />
              <OriginBadge origin={sourceOriginFromDb(source.origin)} />
              {source.page_age && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {pageAgeDisplay}
                  </span>
                </>
              )}
              <span className="text-muted-foreground/30">·</span>
              <StatusBadge status={source.scrape_status} />
              {needsScrape && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 px-1.5 gap-1 text-[10px] ml-1"
                  disabled={scraping || anyNavigating}
                  onClick={(e) => onScrape(source, e)}
                >
                  {scraping ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  {source.scrape_status === "pending" ? "Scrape" : "Re-scrape"}
                </Button>
              )}
            </div>
            {expanded && hasSnippets && (
              <div className="mt-2 space-y-1.5">
                {snippets.map((snippet, i) => (
                  <p
                    key={i}
                    className="text-xs text-foreground/70 leading-relaxed"
                  >
                    {snippet}
                  </p>
                ))}
              </div>
            )}
          </div>
        </td>

        {/* Actions */}
        <td
          className="px-2 py-2.5 w-10 align-top"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-1">
            {navigating ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full"
                    disabled={anyNavigating}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) {
                        window.open(
                          `/research/topics/${topicId}/sources/${source.id}`,
                          "_blank",
                        );
                        return;
                      }
                      onNavigate(source.id);
                    }}
                  >
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => window.open(source.url, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open URL
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onToggleInclude(source)}>
                    {source.is_included ? "Exclude" : "Include"}
                  </DropdownMenuItem>
                  {needsScrape && (
                    <DropdownMenuItem
                      onClick={(e) =>
                        onScrape(source, e as unknown as React.MouseEvent)
                      }
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {source.scrape_status === "pending"
                        ? "Scrape"
                        : "Re-scrape"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() =>
                      updateSource(source.id, { scrape_status: "complete" })
                    }
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark Complete
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => updateSource(source.id, { is_stale: true })}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Mark Stale
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {hasSnippets && (
              <button
                className="p-0.5 rounded hover:bg-muted transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
                title={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? (
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}

export default function SourceList() {
  const { topicId, refresh } = useTopicContext();
  const api = useResearchApi();
  const isMobile = useIsMobile();
  const debug = useStreamDebug();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  const { filters, setFilters, resetFilters, hasActiveFilters } =
    useSourceFilters();
  const { data: sources, refresh: refetchSources } = useResearchSources(
    topicId,
    filters,
  );
  const stream = useResearchStream(() => {
    refetchSources();
    refresh();
  });
  const { data: keywords } = useResearchKeywords(topicId);
  const { data: importanceMap } = useSourceImportance(topicId);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scrapingIds, setScrapingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const allSources = (sources as ResearchSource[]) ?? [];
  const sourceList = useMemo(() => {
    if (!search) return allSources;
    return filterAndSortBySearch(allSources, search, [
      { get: (s) => s.title, weight: "title" },
      { get: (s) => s.hostname, weight: "subtitle" },
      { get: (s) => s.url, weight: "subtitle" },
      { get: (s) => s.description, weight: "body" },
      { get: (s) => s.origin, weight: "meta" },
      { get: (s) => s.source_type, weight: "meta" },
    ]);
  }, [allSources, search]);
  const hostnames = useMemo(
    () =>
      [
        ...new Set(
          sourceList.map((s) => s.hostname).filter(Boolean) as string[],
        ),
      ].sort(),
    [sourceList],
  );

  const handleNavigate = useCallback(
    (id: string, e?: React.MouseEvent) => {
      if (e && (e.metaKey || e.ctrlKey)) return;
      e?.preventDefault();
      if (navigatingId) return;
      setNavigatingId(id);
      startTransition(() => {
        router.push(`/research/topics/${topicId}/sources/${id}`);
      });
    },
    [navigatingId, router, topicId],
  );

  const handleSort = useCallback(
    (field: SourceSortBy) => {
      if (filters.sort_by === field) {
        if (filters.sort_dir === "asc") {
          setFilters({ sort_by: field, sort_dir: "desc" });
        } else {
          setFilters({ sort_by: undefined, sort_dir: undefined });
        }
      } else {
        setFilters({ sort_by: field, sort_dir: "asc" });
      }
    },
    [filters.sort_by, filters.sort_dir, setFilters],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === sourceList.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sourceList.map((s) => s.id)));
    }
  }, [selected.size, sourceList]);

  const handleBulk = useCallback(
    async (action: BulkAction) => {
      await bulkUpdateSources(topicId, { source_ids: [...selected], action });
      setSelected(new Set());
      refetchSources();
      refresh();
    },
    [topicId, selected, refetchSources, refresh],
  );

  const handleToggleInclude = useCallback(
    async (source: ResearchSource) => {
      await updateSource(source.id, { is_included: !source.is_included });
      refetchSources();
    },
    [refetchSources],
  );

  const handleScrapeSource = useCallback(
    async (source: ResearchSource, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (stream.isStreaming) return;
      setScrapingIds((prev) => new Set(prev).add(source.id));
      try {
        const response = await api.scrapeSource(topicId, source.id);
        stream.startStream(response, {
          onEnd: () => {
            refetchSources();
            setScrapingIds((prev) => {
              const next = new Set(prev);
              next.delete(source.id);
              return next;
            });
          },
        });
        debug.pushEvents(stream.rawEvents, `scrape-${source.id}`);
      } catch {
        setScrapingIds((prev) => {
          const next = new Set(prev);
          next.delete(source.id);
          return next;
        });
      }
    },
    [api, topicId, stream, refetchSources, debug],
  );

  const anyNavigating = isPending || navigatingId !== null;

  return (
    <div className="p-3 sm:p-4 space-y-3 overflow-x-hidden">
      <SourceFilters
        filters={filters}
        onFilterChange={setFilters}
        onReset={resetFilters}
        hasActiveFilters={hasActiveFilters}
        keywords={(keywords as import("../../types").ResearchKeyword[]) ?? []}
        hostnames={hostnames}
        count={sourceList.length}
        search={search}
        onSearchChange={setSearch}
      />

      {/* Desktop Table */}
      {!isMobile ? (
        <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border/50">
                <th className="w-12 px-2 py-2">
                  <Checkbox
                    checked={
                      selected.size === sourceList.length &&
                      sourceList.length > 0
                    }
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="w-16 py-2 pr-3" />
                <th className="px-2 py-2 text-left w-full">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-muted-foreground">
                      Title / Description
                    </span>
                    <div className="flex items-center gap-3">
                      <SortHeader
                        label="#"
                        field="rank"
                        currentSort={filters.sort_by}
                        currentDir={filters.sort_dir}
                        onSort={handleSort}
                      />
                      <SortHeader
                        label="Age"
                        field="page_age"
                        currentSort={filters.sort_by}
                        currentDir={filters.sort_dir}
                        onSort={handleSort}
                      />
                      <SortHeader
                        label="Status"
                        field="scrape_status"
                        currentSort={filters.sort_by}
                        currentDir={filters.sort_dir}
                        onSort={handleSort}
                      />
                    </div>
                  </div>
                </th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sourceList.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  importance={importanceMap?.get(source.id)}
                  topicId={topicId}
                  selected={selected.has(source.id)}
                  scraping={scrapingIds.has(source.id)}
                  navigating={navigatingId === source.id}
                  anyNavigating={anyNavigating}
                  onSelect={toggleSelect}
                  onToggleInclude={handleToggleInclude}
                  onScrape={handleScrapeSource}
                  onNavigate={handleNavigate}
                />
              ))}
            </tbody>
          </table>
          {sourceList.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              No sources found. Run a search to discover sources.
            </div>
          )}
        </div>
      ) : (
        /* Mobile Card List */
        <div className="space-y-2">
          {sourceList.map((source) => {
            const { display: pageAgeDisplay } = formatPageAge(source.page_age);
            const isNavigating = navigatingId === source.id;
            const needsScrape =
              source.scrape_status === "pending" ||
              source.scrape_status === "failed" ||
              source.scrape_status === "thin";
            const imp = importanceMap?.get(source.id);
            return (
              <Link
                key={source.id}
                href={`/research/topics/${topicId}/sources/${source.id}`}
                onClick={(e) => !anyNavigating && handleNavigate(source.id, e)}
                className={cn(
                  "rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden transition-colors relative block",
                  !source.is_included && "opacity-50",
                  isNavigating && "bg-muted/60",
                  !anyNavigating && "active:bg-muted/50 cursor-pointer",
                  anyNavigating &&
                    !isNavigating &&
                    "cursor-not-allowed opacity-70",
                )}
              >
                {isNavigating && (
                  <div className="absolute inset-0 rounded-xl bg-background/50 z-10 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}

                {/* Thumbnail banner */}
                <div className="w-full h-28 bg-muted/50 flex items-center justify-center relative">
                  {source.thumbnail_url ? (
                    <Image
                      src={source.thumbnail_url}
                      alt=""
                      width={400}
                      height={112}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <Globe className="h-8 w-8 text-muted-foreground/30" />
                  )}
                  {/* Rank badge overlay — real best rank across keywords */}
                  {imp?.bestRank != null && (
                    <span
                      className="absolute top-1.5 left-1.5 text-[10px] font-mono font-bold bg-black/60 text-white px-1.5 py-0.5 rounded-md tabular-nums"
                      title={`importance ${imp.score} · ${imp.keywordCount} keyword(s)`}
                    >
                      #{imp.bestRank}
                    </span>
                  )}
                  {/* Checkbox overlay */}
                  <div
                    className="absolute top-1.5 right-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selected.has(source.id)}
                      onCheckedChange={() => toggleSelect(source.id)}
                      disabled={anyNavigating}
                      className="h-5 w-5 bg-black/40 border-white/60 data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>

                {/* Content below thumbnail */}
                <div className="p-2.5 space-y-1.5">
                  {/* Title + toggle row */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm leading-snug line-clamp-2 break-words">
                        {source.title || source.url}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {source.hostname}
                      </div>
                    </div>
                    <Switch
                      checked={source.is_included}
                      onCheckedChange={() => handleToggleInclude(source)}
                      onClick={(e) => e.stopPropagation()}
                      className="scale-75 shrink-0 mt-0.5"
                      disabled={anyNavigating}
                    />
                  </div>

                  {source.description && (
                    <div className="text-xs text-muted-foreground/70 line-clamp-2 leading-relaxed">
                      {source.description}
                    </div>
                  )}

                  {/* Badges row */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <SourceTypeIcon
                      type={sourceTypeFromDb(source.source_type)}
                      size={12}
                      className="text-muted-foreground"
                    />
                    <StatusBadge status={source.scrape_status} />
                    <OriginBadge origin={sourceOriginFromDb(source.origin)} />
                    {source.page_age && (
                      <span className="text-[10px] text-muted-foreground">
                        {pageAgeDisplay}
                      </span>
                    )}
                    {needsScrape && (
                      <button
                        className="inline-flex items-center gap-1 h-5 px-1.5 rounded-full matrx-glass-card text-[10px] text-primary ml-auto"
                        disabled={scrapingIds.has(source.id) || anyNavigating}
                        onClick={(e) => handleScrapeSource(source, e)}
                      >
                        <Download className="h-2.5 w-2.5" />
                        {source.scrape_status === "pending"
                          ? "Scrape"
                          : "Re-scrape"}
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
          {sourceList.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              No sources found.
            </div>
          )}
        </div>
      )}

      {sourceList.length >= filters.limit && (
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <button
            disabled={filters.offset === 0}
            onClick={() =>
              setFilters({
                offset: Math.max(0, filters.offset - filters.limit),
              })
            }
            className="h-6 px-2.5 rounded-full matrx-glass-card text-[10px] font-medium text-muted-foreground disabled:opacity-30 hover:text-foreground transition-colors"
          >
            Prev
          </button>
          <span className="text-[10px] text-muted-foreground tabular-nums px-1">
            {filters.offset + 1}–{filters.offset + sourceList.length}
          </span>
          <button
            onClick={() =>
              setFilters({ offset: filters.offset + filters.limit })
            }
            className="h-6 px-2.5 rounded-full matrx-glass-card text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selected.size}
        onInclude={() => handleBulk("include")}
        onExclude={() => handleBulk("exclude")}
        onMarkStale={() => handleBulk("mark_stale")}
        onMarkComplete={() => handleBulk("mark_complete")}
        onClear={() => setSelected(new Set())}
      />
    </div>
  );
}

"use client";

/**
 * Keyword Value Workbench — variant D (ui-dense seat, 2026-08-21 bake-off).
 *
 * One screen, terminal posture: the band decomposition ledger across the top
 * (site total + per-band deltas — the "site up 25%, Platinum down 3%" read),
 * the keyword ledger as the primary focus, and the meaning rail (bands /
 * rules / geo / topics) docked right so the arithmetic behind every number is
 * always one glance away. Every tier renders with its why; the Unvalued band
 * is the standing work queue.
 *
 * Data: ../../data.ts only. SoR:
 * common-docs/systems/marketing/seo/seo-keywords/value-system.md
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  BookOpenText,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Gavel,
  Inbox,
  PanelRightClose,
  PanelRightOpen,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { TableLoadingComponent } from "@/components/matrx/LoadingComponents";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import type { ValueReviewRow, ValueSource } from "../../types";
import { BandLedger } from "./BandLedger";
import { KeywordTable } from "./KeywordTable";
import { MeaningRail } from "./MeaningRail";
import { TierMenu } from "./TierMenu";
import {
  bandMeta,
  buildBandIndex,
  fmtInt,
  last28DayWindow,
  windowLabel,
} from "./lib";
import {
  useGeoAreas,
  useSetKeywordValue,
  useSiteTopicValues,
  useValueReview,
  useValueRules,
  useValueSummary,
  useValueVocabulary,
} from "./useWorkbenchData";

const PAGE_SIZE = 100;

type SortKey = "clicks" | "impressions" | "score" | "keyword";

const SOURCE_OPTIONS: Array<{ value: ValueSource | null; label: string }> = [
  { value: null, label: "All" },
  { value: "override", label: "Ruled" },
  { value: "computed", label: "Computed" },
  { value: "unvalued", label: "Unvalued" },
];

export function ValueWorkbenchD() {
  const params = useParams<{ siteId: string }>();
  const siteId = params.siteId;
  const isMobile = useIsMobile();

  const window28 = useMemo(() => last28DayWindow(), []);

  // ── Filters / paging / selection ──────────────────────────────────────────
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [band, setBand] = useState<string | null>(null);
  const [source, setSource] = useState<ValueSource | null>(null);
  const [sort, setSort] = useState<SortKey>("clicks");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Map<string, ValueReviewRow>>(new Map());
  const [railOpen, setRailOpen] = useState(true);

  // The rail follows the breakpoint: docked open on desktop, an overlay the
  // user summons on a phone — never auto-opened over the ledger. The user's
  // toggle still wins until the breakpoint changes again.
  useEffect(() => {
    setRailOpen(!isMobile);
  }, [isMobile]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const vocab = useValueVocabulary(siteId, "value_band");
  const geoVocab = useValueVocabulary(siteId, "geo_band");
  const summary = useValueSummary(siteId, window28);
  const review = useValueReview(siteId, window28, {
    band,
    source,
    search: search || null,
    sort,
    sortDir,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const rules = useValueRules(siteId);
  const geo = useGeoAreas(siteId);
  const topics = useSiteTopicValues(siteId);

  const bandIndex = useMemo(() => buildBandIndex(vocab.data ?? []), [vocab.data]);
  const geoBandIndex = useMemo(() => buildBandIndex(geoVocab.data ?? []), [geoVocab.data]);
  const bandsTemplate = vocab.data?.[0]?.is_template === true;
  // Settable tiers = the site vocabulary. `unvalued` is resolver-emitted,
  // never a ruling a human can hand out.
  const settableBands = useMemo(
    () =>
      [...bandIndex.values()]
        .filter((b) => b.slug !== "unvalued")
        .sort((a, b) => a.sort - b.sort),
    [bandIndex],
  );

  const setValue = useSetKeywordValue(siteId, (slug) => bandMeta(bandIndex, slug).label);

  const rows = review.data?.rows ?? [];
  const total = review.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const unvaluedQueries = useMemo(
    () =>
      (summary.data ?? [])
        .filter((r) => r.value_band === "unvalued")
        .reduce((acc, r) => acc + r.queries, 0),
    [summary.data],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sort === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSort(key);
      setSortDir(key === "keyword" ? "asc" : "desc");
    }
    setPage(0);
  };

  const handleBandFilter = (next: string | null) => {
    setBand(next);
    setPage(0);
  };

  const toggleRow = (row: ValueReviewRow) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.keyword_id)) next.delete(row.keyword_id);
      else next.set(row.keyword_id, row);
      return next;
    });
  };

  const togglePage = (pageRows: ValueReviewRow[], select: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      pageRows.forEach((row) => {
        if (select) next.set(row.keyword_id, row);
        else next.delete(row.keyword_id);
      });
      return next;
    });
  };

  const applyRuling = (keywordIds: string[], tier: string | null, notes?: string) => {
    setValue.mutate(
      { keywordIds, tier, notes },
      {
        onSuccess: () => {
          setSelected((prev) => {
            if (prev.size === 0) return prev;
            const next = new Map(prev);
            keywordIds.forEach((id) => next.delete(id));
            return next;
          });
        },
      },
    );
  };

  const selectedRows = [...selected.values()];
  const selectionHasOverride = selectedRows.some((r) => r.value_source === "override");
  const showRail = railOpen;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Keyword value
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
            <CalendarRange className="h-3 w-3" />
            Last 28 days · {windowLabel(window28)} · vs prior 28
          </span>
        </div>

        <div className="relative min-w-40 flex-1 md:max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search keywords…"
            className="h-7 pl-7 pr-7 text-xs"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        {/* Source segmented filter */}
        <div className="flex items-center overflow-hidden rounded-md border border-border">
          {SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                setSource(opt.value);
                setPage(0);
              }}
              className={cn(
                "px-2 py-1 text-[11px] font-medium transition-colors",
                source === opt.value
                  ? "bg-accent text-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Work-queue jump — the unvalued bucket is the standing to-do */}
        <button
          type="button"
          onClick={() => {
            handleBandFilter(band === "unvalued" ? null : "unvalued");
            setSource(null);
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
            band === "unvalued"
              ? "border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "border-amber-500/40 bg-amber-500/5 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400",
          )}
        >
          <Inbox className="h-3 w-3" />
          Work queue
          {summary.data ? (
            <span className="tabular-nums">{fmtInt(unvaluedQueries)}</span>
          ) : null}
        </button>

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => setRailOpen((v) => !v)}
            title={showRail ? "Hide the meaning rail" : "Show bands, rules, geo, and topic worth"}
          >
            {showRail ? (
              <PanelRightClose className="h-3.5 w-3.5" />
            ) : (
              <PanelRightOpen className="h-3.5 w-3.5" />
            )}
            <BookOpenText className="h-3.5 w-3.5 md:hidden" />
            <span className="hidden md:inline">Meaning</span>
          </Button>
        </div>
      </div>

      {/* Decomposition ledger */}
      {summary.isLoading ? (
        <div className="flex shrink-0 gap-px border-b border-border bg-border/40">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[70px] min-w-[124px] flex-1 animate-pulse bg-card" />
          ))}
        </div>
      ) : summary.isError ? (
        <div className="shrink-0 border-b border-border p-2">
          <InlineQueryError
            what="the value decomposition"
            error={summary.error}
            onRetry={() => void summary.refetch()}
          />
        </div>
      ) : (summary.data ?? []).length === 0 ? (
        <div className="shrink-0 border-b border-border px-3 py-2 text-xs text-muted-foreground">
          No Search Console traffic in this window yet — the decomposition appears once GSC facts
          arrive.
        </div>
      ) : (
        <BandLedger
          summary={summary.data ?? []}
          bandIndex={bandIndex}
          activeBand={band}
          onBandClick={handleBandFilter}
        />
      )}

      {/* Main: keyword ledger + meaning rail */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Active-filter breadcrumb line */}
          {(band || source || search) && (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-1 text-[11px] text-muted-foreground">
              <span>Filtered:</span>
              {band ? (
                <FilterChip
                  label={`band · ${bandMeta(bandIndex, band).label}`}
                  onClear={() => handleBandFilter(null)}
                />
              ) : null}
              {source ? (
                <FilterChip
                  label={`source · ${source}`}
                  onClear={() => {
                    setSource(null);
                    setPage(0);
                  }}
                />
              ) : null}
              {search ? (
                <FilterChip label={`"${search}"`} onClear={() => setSearchInput("")} />
              ) : null}
              <span className="tabular-nums">
                {review.isFetching ? "…" : `${fmtInt(total)} keywords match`}
              </span>
            </div>
          )}

          <div className="relative min-h-0 flex-1">
            {review.isLoading ? (
              <div className="p-3">
                <TableLoadingComponent />
              </div>
            ) : review.isError ? (
              <div className="p-3">
                <InlineQueryError
                  what="the keyword ledger"
                  error={review.error}
                  onRetry={() => void review.refetch()}
                />
              </div>
            ) : rows.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    {search || band || source
                      ? "No keywords match these filters"
                      : "No GSC-active keywords in this window"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {search || band || source
                      ? "Loosen the search or clear a filter chip above."
                      : "Once Search Console facts are pulled for this site, every active keyword lands here with its value band and its why."}
                  </p>
                </div>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <KeywordTable
                  rows={rows}
                  bandIndex={bandIndex}
                  settableBands={settableBands}
                  sort={sort}
                  sortDir={sortDir}
                  onSort={handleSort}
                  selected={selected}
                  onToggleRow={toggleRow}
                  onTogglePage={togglePage}
                  pending={setValue.isPending}
                  onRule={applyRuling}
                />
              </ScrollArea>
            )}
            {review.isFetching && !review.isLoading ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-pulse bg-primary/60" />
            ) : null}
          </div>

          {/* Footer: selection bar OR pagination */}
          <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border px-3">
            {selected.size > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium tabular-nums text-foreground">
                    {selected.size} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelected(new Map())}
                    className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    clear selection
                  </button>
                </div>
                <TierMenu
                  bands={settableBands}
                  hasOverride={selectionHasOverride}
                  count={selected.size}
                  pending={setValue.isPending}
                  onApply={(tier, notes) =>
                    applyRuling(
                      selectedRows.map((r) => r.keyword_id),
                      tier,
                      notes,
                    )
                  }
                  trigger={
                    <Button size="sm" className="h-6 gap-1 px-2 text-xs">
                      <Gavel className="h-3 w-3" />
                      Rule {selected.size === 1 ? "keyword" : `${selected.size} keywords`}
                    </Button>
                  }
                />
              </>
            ) : (
              <>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {total > 0
                    ? `${fmtInt(page * PAGE_SIZE + 1)}–${fmtInt(Math.min((page + 1) * PAGE_SIZE, total))} of ${fmtInt(total)} keywords`
                    : "0 keywords"}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={page === 0 || review.isFetching}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {page + 1} / {pageCount}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={page + 1 >= pageCount || review.isFetching}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Meaning rail — docked on desktop, overlay on mobile */}
        {showRail ? (
          isMobile ? (
            <div className="fixed inset-0 z-40 flex justify-end bg-foreground/20" onClick={() => setRailOpen(false)}>
              <div
                className="h-full w-[85vw] max-w-sm border-l border-border bg-background shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <MeaningRail
                  bands={[...bandIndex.values()].sort((a, b) => a.sort - b.sort)}
                  bandsTemplate={bandsTemplate}
                  rules={rules}
                  geo={geo}
                  topics={topics}
                  bandFor={(slug) => bandMeta(geoBandIndex, slug)}
                />
              </div>
            </div>
          ) : (
            <div className="hidden w-[300px] shrink-0 border-l border-border md:block">
              {vocab.isError ? (
                <div className="p-2">
                  <InlineQueryError
                    what="the value vocabulary"
                    error={vocab.error}
                    onRetry={() => void vocab.refetch()}
                  />
                </div>
              ) : (
                <MeaningRail
                  bands={[...bandIndex.values()].sort((a, b) => a.sort - b.sort)}
                  bandsTemplate={bandsTemplate}
                  rules={rules}
                  geo={geo}
                  topics={topics}
                  bandFor={(slug) => bandMeta(geoBandIndex, slug)}
                />
              )}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-1.5 py-px text-[11px] text-foreground">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="rounded-full p-px text-muted-foreground hover:text-foreground"
        aria-label={`Clear filter ${label}`}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

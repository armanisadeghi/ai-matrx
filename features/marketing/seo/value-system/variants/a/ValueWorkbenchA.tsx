"use client";

/**
 * Keyword Value Workbench — variant A (ui-sharp seat, ui-bakeoff 2026-08-21).
 *
 * Modeled after Stripe's revenue dashboard (composition band with deltas on
 * top) + Linear's triage list (the keyword queue below). One job: understand
 * what this site's search traffic is WORTH and rule what keywords are worth —
 * with every number explaining itself. A tier never renders without its why.
 *
 * Data layer: ../../data.ts (call, never modify). SoR:
 * common-docs/systems/marketing/seo/seo-keywords/value-system.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Gavel,
  HelpCircle,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import {
  InlineQueryError,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  getValueReview,
  getValueSummary,
  getValueVocabulary,
  setKeywordValue,
} from "../../data";
import type {
  ValueBandDef,
  ValueReviewQuery,
  ValueReviewRow,
  ValueSource,
  ValueSummaryRow,
} from "../../types";
import { CompositionBand } from "./CompositionBand";
import { MeaningSheet } from "./MeaningSheet";
import { TierPicker } from "./TierPicker";
import {
  RESERVED_UNVALUED,
  asReasons,
  bandInfo,
  buildBandIndex,
  defaultWindow,
  fmtNum,
  fmtScore,
  reasonText,
} from "./lib";

const PAGE_SIZE = 50;

type SortKey = NonNullable<ValueReviewQuery["sort"]>;

const SOURCE_FILTERS: Array<{ value: ValueSource | null; label: string }> = [
  { value: null, label: "All" },
  { value: "unvalued", label: "Unvalued" },
  { value: "computed", label: "Computed" },
  { value: "override", label: "My rulings" },
];

export function ValueWorkbenchA() {
  const { site } = useMarketingSite();
  const siteId = site.id;
  const window_ = useMemo(() => defaultWindow(), []);

  // ── Vocabulary (bands + tones) ────────────────────────────────────────────
  const [vocab, setVocab] = useState<ValueBandDef[] | null>(null);
  const [vocabError, setVocabError] = useState<unknown>(null);
  const [vocabKey, setVocabKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setVocabError(null);
    getValueVocabulary(siteId, "value_band", controller.signal)
      .then((rows) => setVocab(rows))
      .catch((e) => {
        if (!controller.signal.aborted) setVocabError(e);
      });
    return () => controller.abort();
  }, [siteId, vocabKey]);
  const bandIndex = useMemo(() => buildBandIndex(vocab ?? []), [vocab]);

  // ── Summary (the headline decomposition) ──────────────────────────────────
  const [summary, setSummary] = useState<ValueSummaryRow[] | null>(null);
  const [summaryError, setSummaryError] = useState<unknown>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setSummaryError(null);
    getValueSummary(
      siteId,
      window_.start,
      window_.end,
      window_.cmpStart,
      window_.cmpEnd,
      controller.signal,
    )
      .then((rows) => setSummary(rows))
      .catch((e) => {
        if (!controller.signal.aborted) setSummaryError(e);
      });
    return () => controller.abort();
  }, [siteId, window_, refreshKey]);

  // ── Review queue (server-paged) ───────────────────────────────────────────
  const [band, setBand] = useState<string | null>(null);
  const [source, setSource] = useState<ValueSource | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("clicks");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<ValueReviewRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [rowsError, setRowsError] = useState<unknown>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [meaningOpen, setMeaningOpen] = useState(false);
  const listTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setRowsLoading(true);
    setRowsError(null);
    getValueReview(
      siteId,
      window_.start,
      window_.end,
      {
        band,
        source,
        search: debouncedSearch || null,
        sort,
        sortDir,
        limit: PAGE_SIZE,
        offset,
      },
      controller.signal,
    )
      .then(({ rows: r, total: t }) => {
        setRows(r);
        setTotal(t);
        setRowsLoading(false);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setRowsError(e);
        setRowsLoading(false);
      });
    return () => controller.abort();
  }, [siteId, window_, band, source, debouncedSearch, sort, sortDir, offset, refreshKey]);

  const resetPaging = () => {
    setOffset(0);
    setSelected(new Set());
  };

  const pickBand = (next: string | null) => {
    setBand(next);
    resetPaging();
  };
  const pickSource = (next: ValueSource | null) => {
    setSource(next);
    resetPaging();
  };
  const openQueue = () => {
    setBand(null);
    setSource("unvalued");
    resetPaging();
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleSort = (key: SortKey) => {
    if (sort === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSort(key);
      setSortDir(key === "keyword" ? "asc" : "desc");
    }
    resetPaging();
  };

  // ── The one write path ────────────────────────────────────────────────────
  const applyTier = useCallback(
    async (keywordIds: string[], tier: string | null, note: string) => {
      setApplying(true);
      try {
        await setKeywordValue(siteId, keywordIds, tier, note || undefined);
        toast.success(
          tier === null
            ? `Cleared your ruling on ${keywordIds.length} keyword${keywordIds.length === 1 ? "" : "s"}`
            : `Ruled ${keywordIds.length} keyword${keywordIds.length === 1 ? "" : "s"} as ${bandIndex.get(tier)?.label ?? tier}`,
        );
        setSelected(new Set());
        setRefreshKey((k) => k + 1);
        return true;
      } catch (e) {
        toast.error(
          `Could not save your ruling: ${e instanceof Error ? e.message : String(e)}`,
        );
        return false;
      } finally {
        setApplying(false);
      }
    },
    [siteId, bandIndex],
  );

  const pageIds = useMemo(() => (rows ?? []).map((r) => r.keyword_id), [rows]);
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAll = () => {
    setSelected((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        for (const id of pageIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...pageIds]);
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasAnyFilter = band !== null || source !== null || debouncedSearch !== "";
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Hard failure: no vocabulary means no tiers can render honestly ────────
  if (vocabError != null) {
    return (
      <div className="h-full overflow-y-auto bg-textured p-4">
        <QueryError error={vocabError} onRetry={() => setVocabKey((k) => k + 1)} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto max-w-7xl space-y-4 p-3 pb-24 sm:p-4">
        {/* Title row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <CircleDollarSign className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-base font-semibold text-foreground">
            What your search traffic is worth
          </h1>
          <span className="text-xs text-muted-foreground">{window_.label}</span>
          <div className="ml-auto flex items-center gap-2">
            {vocab?.some((b) => b.is_template) && (
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                Using default bands
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setMeaningOpen(true)}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              How value is computed
            </Button>
          </div>
        </div>

        {/* The headline decomposition */}
        {summaryError != null ? (
          <InlineQueryError
            what="the value composition"
            error={summaryError}
            onRetry={() => setRefreshKey((k) => k + 1)}
          />
        ) : summary === null ? (
          <div className="space-y-3">
            <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
            <div className="h-2.5 w-full animate-pulse rounded-full bg-muted" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        ) : summary.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
            <p className="text-sm font-medium text-foreground">
              No Search Console data in this window yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Once search performance data lands for {site.domain}, its value
              composition appears here.
            </p>
          </div>
        ) : (
          <CompositionBand
            rows={summary}
            index={bandIndex}
            activeBand={band}
            onPickBand={pickBand}
            onOpenQueue={openQueue}
          />
        )}

        {/* Queue toolbar */}
        <div ref={listTopRef} className="flex flex-wrap items-center gap-2 pt-1">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              placeholder="Search keywords…"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-1">
            {SOURCE_FILTERS.map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => pickSource(f.value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  source === f.value
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {band !== null && (
            <button
              type="button"
              onClick={() => pickBand(null)}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", bandInfo(bandIndex, band).tone.dot)} />
              {bandInfo(bandIndex, band).label}
              <X className="h-3 w-3" />
            </button>
          )}
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {rowsLoading && rows === null ? "…" : `${fmtNum(total)} keywords`}
          </span>
        </div>

        {/* The queue */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {/* Header row */}
          <div className="hidden items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 md:grid md:grid-cols-[24px_minmax(0,1.05fr)_minmax(0,1.35fr)_108px_64px_80px_92px_32px]">
            <Checkbox
              checked={allOnPageSelected}
              onCheckedChange={toggleAll}
              aria-label="Select all on this page"
            />
            <SortHeader label="Keyword" k="keyword" sort={sort} dir={sortDir} onSort={toggleSort} />
            <span className="text-xs font-medium text-muted-foreground">Why it&apos;s worth that</span>
            <span className="text-xs font-medium text-muted-foreground">Value</span>
            <SortHeader label="Score" k="score" sort={sort} dir={sortDir} onSort={toggleSort} right />
            <SortHeader label="Clicks" k="clicks" sort={sort} dir={sortDir} onSort={toggleSort} right />
            <SortHeader label="Impressions" k="impressions" sort={sort} dir={sortDir} onSort={toggleSort} right />
            <span />
          </div>

          {rowsError != null ? (
            <QueryError error={rowsError} onRetry={() => setRefreshKey((k) => k + 1)} />
          ) : rows === null ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {hasAnyFilter
                  ? "No keywords match this view"
                  : "No GSC-active keywords in this window"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasAnyFilter
                  ? "Loosen the search or filters to see more of the queue."
                  : "Keywords appear here once Search Console reports activity for them."}
              </p>
              {hasAnyFilter && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-7 text-xs"
                  onClick={() => {
                    setSearch("");
                    setBand(null);
                    setSource(null);
                    resetPaging();
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div
              className={cn(
                "divide-y divide-border",
                rowsLoading && "pointer-events-none opacity-60",
              )}
            >
              {rows.map((row) => (
                <KeywordRow
                  key={row.keyword_id}
                  row={row}
                  vocab={vocab ?? []}
                  index={bandIndex}
                  selected={selected.has(row.keyword_id)}
                  onToggle={() => toggleOne(row.keyword_id)}
                  applying={applying}
                  onApply={(tier, note) => applyTier([row.keyword_id], tier, note)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {rows !== null && total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={offset === 0 || rowsLoading}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={offset + PAGE_SIZE >= total || rowsLoading}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk ruling bar */}
      {selected.size > 0 && vocab && (
        <div className="pb-safe pointer-events-none sticky bottom-0 z-10 flex justify-center px-4 pb-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-glass-edge bg-glass px-4 py-2 shadow-glass backdrop-blur-glass backdrop-saturate-glass">
            <span className="text-sm font-medium tabular-nums text-foreground">
              {selected.size} selected
            </span>
            <TierPicker
              vocab={vocab}
              index={bandIndex}
              currentBand={null}
              canClear
              applying={applying}
              align="center"
              onApply={(tier, note) => applyTier([...selected], tier, note)}
            >
              <Button size="sm" className="h-7 gap-1.5 rounded-full text-xs">
                {applying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Gavel className="h-3.5 w-3.5" />
                )}
                Rule their value
              </Button>
            </TierPicker>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSelected(new Set())}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {vocab && (
        <MeaningSheet
          open={meaningOpen}
          onOpenChange={setMeaningOpen}
          siteId={siteId}
          valueBands={vocab}
          index={bandIndex}
        />
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function SortHeader({
  label,
  k,
  sort,
  dir,
  onSort,
  right,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sort === k;
  const Icon = dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium transition-colors",
        right && "justify-end",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active && <Icon className="h-3 w-3" />}
    </button>
  );
}

function KeywordRow({
  row,
  vocab,
  index,
  selected,
  onToggle,
  applying,
  onApply,
}: {
  row: ValueReviewRow;
  vocab: ValueBandDef[];
  index: ReturnType<typeof buildBandIndex>;
  selected: boolean;
  onToggle: () => void;
  applying: boolean;
  onApply: (tier: string | null, note: string) => Promise<boolean>;
}) {
  const info = bandInfo(index, row.value_band);
  const reasons = asReasons(row.reasons);
  const isUnvalued = row.value_source === "unvalued";
  const isOverride = row.value_source === "override";

  const bandChip = (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        info.tone.chip,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", info.tone.dot)} />
      <span className="truncate">{info.label}</span>
      {isOverride && <BadgeCheck className="h-3 w-3 shrink-0" />}
    </span>
  );

  return (
    <div
      className={cn(
        "gap-3 px-3 py-2 transition-colors hover:bg-accent/40 md:grid md:grid-cols-[24px_minmax(0,1.05fr)_minmax(0,1.35fr)_108px_64px_80px_92px_32px] md:items-center",
        selected && "bg-primary/5",
      )}
    >
      {/* Mobile layout stacks; desktop uses the grid above. */}
      <div className="flex items-center md:contents">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${row.keyword}`}
          className="mr-2 md:mr-0"
        />
        <div className="min-w-0 flex-1 md:flex-none">
          <p className="truncate text-sm text-foreground" title={row.keyword}>
            {row.keyword}
          </p>
          <p className="text-[11px] capitalize text-muted-foreground">
            {row.traffic_class.replace(/_/g, " ")}
          </p>
        </div>
        <div className="md:hidden">{bandChip}</div>
      </div>

      {/* Why — a tier without its why never renders */}
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 md:mt-0">
        {isUnvalued || reasons.length === 0 ? (
          <span className="text-xs italic text-muted-foreground">
            {isUnvalued
              ? "No meaning expressed yet — needs your ruling"
              : "No explanation recorded"}
          </span>
        ) : (
          reasons.map((r, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex max-w-full items-center truncate rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground",
                r.kind === "override" && "border-primary/40 bg-primary/10 text-foreground",
              )}
              title={reasonText(r)}
            >
              {reasonText(r)}
            </span>
          ))
        )}
      </div>

      <div className="mt-1.5 hidden min-w-0 md:mt-0 md:block">{bandChip}</div>

      <span className="hidden text-right text-xs tabular-nums text-muted-foreground md:block">
        {fmtScore(row.value_score)}
      </span>
      <span className="hidden text-right text-sm tabular-nums text-foreground md:block">
        {fmtNum(row.clicks)}
      </span>
      <span className="hidden text-right text-xs tabular-nums text-muted-foreground md:block">
        {fmtNum(row.impressions)}
      </span>
      <div className="mt-1.5 flex items-center justify-between md:mt-0 md:block">
        <span className="text-xs tabular-nums text-muted-foreground md:hidden">
          {fmtNum(row.clicks)} clicks · {fmtNum(row.impressions)} impr
        </span>
        <TierPicker
          vocab={vocab}
          index={index}
          currentBand={isOverride ? row.value_band : null}
          canClear={isOverride}
          applying={applying}
          onApply={onApply}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            aria-label={`Rule value for ${row.keyword}`}
          >
            <Gavel className="h-3.5 w-3.5" />
          </Button>
        </TierPicker>
      </div>
    </div>
  );
}

/**
 * THE KEYWORD VALUE WORKBENCH — the one workbench for this feature.
 *
 * It was variant C of a four-way bake-off (ui-refine seat, 2026-08-21) and it
 * won because it is built on the platform's canonical primitives: MatrxDataTable
 * with URL-backed state, the scoreboard tiles that filter the table, the chip
 * IS the control, ONE write path, and the keyword-intel door. On 2026-08-22 the
 * four variants converged here and A/B/D were deleted — they had frozen at the
 * bake-off while five more surfaces were wired into C only, so they were telling
 * a story about this feature that had stopped being true.
 *
 * Two ideas were GRAFTED from variant B before it went, and they are marked as
 * such where they render:
 *   • the VERDICT SENTENCE (`buildVerdict` in ../lib) — the page opens with
 *     composed English naming the band that diverges most from the site's own
 *     direction, because a flat total can hide a band that moved 160%.
 *   • the RULING SESSION (./RulingSession) — the unvalued queue as a focused
 *     one-at-a-time card flow, biggest traffic first.
 *
 * Reference product: Google Search Console's Performance report — a
 * decomposition band over a query table — because that is the report this user
 * reads every week.
 *
 * The three laws this page renders (value-system.md):
 *  1. The expert always wins — the band chip is a dropdown; a ruling lands
 *     through ONE RPC (`setKeywordValue`) and beats everything.
 *  2. Meaning is data — the "How value is computed" panel shows the exact
 *     bands, rules, geo areas, and topic worth the arithmetic uses.
 *  3. Every number explains itself — the Why column renders each row's
 *     reasons chain on EVERY row, never behind a click; a tier without its
 *     why never renders.
 *
 * Unvalued is the loudest tile and the default working filter target: it is
 * the work queue, never a silently-guessed middle tier. And "Your setup, as it
 * actually stands" (./MeaningHealth) says what is unfinished about THIS site's
 * meaning — measured live, never a score.
 */

import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  BookOpenText,
  ChevronDown,
  CircleDollarSign,
  Gavel,
  PanelRightOpen,
  StickyNote,
  Undo2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/styles/themes/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  ColumnFilterValue,
  MatrxColumnDef,
} from "@/components/official/matrx-data-table/types";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import {
  getSiteMeaningHealth,
  getValueReview,
  getValueSummary,
  getValueVocabulary,
  setKeywordValue,
} from "../data";
import type { ValueReviewRow, ValueSource } from "../types";
import {
  bandMetaFor,
  buildBandMeta,
  buildVerdict,
  formatScore,
  humanizeSlug,
  reviewWindow,
  type BandMeta,
} from "../lib";
import { ValueDoors } from "../ValueDoors";
import { BandScoreboard } from "./BandScoreboard";
import { ReasonChainDetail, ReasonChainInline } from "./ReasonChain";
import { MeaningPanel } from "./MeaningPanel";
import { MeaningHealth } from "./MeaningHealth";
import { RulingDialog, type RulingDraft } from "./RulingDialog";
import { RulingSession } from "./RulingSession";

const REVIEW_SORTS = new Set(["clicks", "impressions", "score", "keyword"]);

const SOURCE_META: Record<
  ValueSource,
  { label: string; description: string; tone: string }
> = {
  override: {
    label: "Your ruling",
    description: "An explicit expert ruling — beats every computed signal.",
    tone: "border-primary/40 bg-primary/10 text-primary",
  },
  computed: {
    label: "Computed",
    description:
      "Deterministic arithmetic over meaning you ratified — topic worth × rules × geo.",
    tone: "border-border bg-muted/40 text-foreground",
  },
  unvalued: {
    label: "Unvalued",
    description:
      "No meaning reaches this keyword yet — the honest bucket and the work queue.",
    tone: "border-warning/50 bg-warning/10 text-warning",
  },
};

function singleSelectValue(filter: ColumnFilterValue | undefined): string | null {
  if (filter?.kind !== "select") return null;
  return filter.values?.[0] ?? filter.value ?? null;
}

/** The band chip IS the control — same idiom as the classification ClassCell. */
function BandCell({
  row,
  metas,
  onRule,
  onClear,
  onRuleWithNote,
  busy,
}: {
  row: ValueReviewRow;
  metas: BandMeta[];
  onRule: (tier: string) => void;
  onClear: () => void;
  onRuleWithNote: () => void;
  busy: boolean;
}) {
  const meta = bandMetaFor(metas, row.value_band);
  const rulable = metas.filter((m) => m.reserved !== "unvalued");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:brightness-110",
            meta.chip,
          )}
          title={`${meta.description ?? meta.label}\nClick to rule this keyword's tier yourself.`}
        >
          {meta.label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Rule “{row.keyword}” — your ruling beats the arithmetic.
        </DropdownMenuLabel>
        {rulable.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="gap-2 text-xs"
            onSelect={() => onRule(option.value)}
          >
            <span
              className={cn(
                "rounded border px-1.5 py-px text-[10px] font-medium",
                option.chip,
              )}
            >
              {option.label}
            </span>
            {option.value === row.value_band &&
            row.value_source === "override" ? (
              <span className="text-[10px] text-muted-foreground">current</span>
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 text-xs" onSelect={onRuleWithNote}>
          <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
          Rule with a note…
        </DropdownMenuItem>
        {row.value_source === "override" ? (
          <DropdownMenuItem className="gap-2 text-xs" onSelect={onClear}>
            <Undo2 className="h-3.5 w-3.5 text-muted-foreground" />
            Clear your ruling (back to computed)
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SourceChip({ source }: { source: ValueSource }) {
  const meta = SOURCE_META[source] ?? {
    label: humanizeSlug(source),
    description: "",
    tone: "border-border bg-muted/40 text-foreground",
  };
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[11px] whitespace-nowrap",
        meta.tone,
      )}
      title={meta.description}
    >
      {meta.label}
    </span>
  );
}

export function ValueWorkbench() {
  const { site, brandId } = useMarketingSite();
  const siteId = site.id;
  const queryClient = useQueryClient();
  const openKeywordWindow = useOpenKeywordWindow();
  const [window] = useState(reviewWindow);
  const table = useMarketingTableState({
    defaultSort: { id: "clicks", direction: "desc" },
    defaultPageSize: 50,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [meaningOpen, setMeaningOpen] = useState(false);
  const [draft, setDraft] = useState<RulingDraft | null>(null);
  // The ruling session is a MODE, not an overlay: it replaces the table so the
  // one keyword in front of you is the only thing to answer.
  const [sessionOpen, setSessionOpen] = useState(false);

  const vocab = useQuery({
    queryKey: ["marketing", "value", "vocab", siteId, "value_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "value_band", signal),
    staleTime: 5 * 60_000,
  });
  const metas = buildBandMeta(vocab.data ?? []);
  const bandsAreTemplate = Boolean(vocab.data?.[0]?.is_template);

  const summary = useQuery({
    queryKey: ["marketing", "value", "summary", siteId, window],
    queryFn: ({ signal }) =>
      getValueSummary(
        siteId,
        window.start,
        window.end,
        window.compareStart,
        window.compareEnd,
        signal,
      ),
    staleTime: 60_000,
  });

  // What is unfinished about THIS site's meaning. Metadata counts only — the
  // DB writes the sentences, this page never paraphrases them.
  const health = useQuery({
    queryKey: ["marketing", "value", "meaning-health", siteId],
    queryFn: ({ signal }) => getSiteMeaningHealth(siteId, signal),
    staleTime: 60_000,
  });

  const summaryRows = summary.data ?? [];
  const verdict = buildVerdict(summaryRows, metas);
  const unvaluedQueries = summaryRows
    .filter((row) => row.value_band === "unvalued")
    .reduce((total, row) => total + row.queries, 0);
  const unvaluedClicks = summaryRows
    .filter((row) => row.value_band === "unvalued")
    .reduce((total, row) => total + row.clicks, 0);

  const state = table.queryState;
  const bandFilter = singleSelectValue(state.columnFilters.value_band);
  const sourceFilter = singleSelectValue(state.columnFilters.value_source);
  const sortId =
    state.sort && REVIEW_SORTS.has(state.sort.id) ? state.sort.id : "clicks";

  const review = useQuery({
    queryKey: [
      "marketing",
      "value",
      "review",
      siteId,
      window.start,
      window.end,
      state,
    ],
    queryFn: ({ signal }) =>
      getValueReview(
        siteId,
        window.start,
        window.end,
        {
          band: bandFilter,
          source: (sourceFilter as ValueSource | null) ?? null,
          search: state.search || null,
          sort: sortId as "clicks" | "impressions" | "score" | "keyword",
          sortDir: state.sort?.direction === "asc" ? "asc" : "desc",
          limit: state.pageSize,
          offset: (state.page - 1) * state.pageSize,
        },
        signal,
      ),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const rows = review.data?.rows ?? [];
  const total = review.data?.total ?? 0;

  const ruling = useMutation({
    mutationFn: (input: {
      keywordIds: string[];
      tier: string | null;
      notes?: string;
      label: string;
    }) => setKeywordValue(siteId, input.keywordIds, input.tier, input.notes),
    onSuccess: (resolved, input) => {
      const count = resolved.length;
      if (input.tier === null) {
        const bands = [
          ...new Set(resolved.map((r) => humanizeSlug(r.value_band))),
        ];
        toast.success(
          `Cleared ${count === 1 ? "your ruling" : `${count} rulings`}`,
          {
            description: `The arithmetic decides again (now: ${bands.join(", ")}).`,
          },
        );
      } else {
        const tierLabel = bandMetaFor(metas, input.tier).label;
        toast.success(
          count === 1
            ? `Ruled “${input.label}” as ${tierLabel}`
            : `Ruled ${count} keywords as ${tierLabel}`,
          {
            description:
              "Provenance is now “Your ruling” — it beats every computed signal until you clear it.",
          },
        );
      }
      setSelectedIds([]);
      setDraft(null);
      void queryClient.invalidateQueries({
        queryKey: ["marketing", "value"],
      });
    },
    onError: (error) => {
      toast.error("Could not save the ruling", {
        description: extractErrorMessage(error),
      });
    },
  });

  const columns: MatrxColumnDef<ValueReviewRow>[] = [
    {
      id: "keyword",
      accessorKey: "keyword",
      header: "Keyword",
      filter: false,
      className: "max-w-[320px]",
      cell: (row) => (
        <span
          className="block truncate text-xs font-medium text-foreground"
          title={row.keyword}
        >
          {row.keyword}
        </span>
      ),
    },
    {
      id: "value_band",
      accessorKey: "value_band",
      header: "Tier",
      sortable: false,
      filter: "select",
      filterSingle: true,
      filterOptions: metas.map((meta) => ({
        value: meta.value,
        label: meta.label,
      })),
      cell: (row) => (
        <BandCell
          row={row}
          metas={metas}
          busy={ruling.isPending}
          onRule={(tier) =>
            ruling.mutate({
              keywordIds: [row.keyword_id],
              tier,
              label: row.keyword,
            })
          }
          onClear={() =>
            ruling.mutate({
              keywordIds: [row.keyword_id],
              tier: null,
              label: row.keyword,
            })
          }
          onRuleWithNote={() =>
            setDraft({
              keywordIds: [row.keyword_id],
              label: row.keyword,
              mode: "set",
              tier:
                row.value_source === "override" &&
                row.value_band !== "unvalued"
                  ? row.value_band
                  : null,
            })
          }
        />
      ),
    },
    {
      id: "score",
      header: "Score",
      accessorFn: (row) => row.value_score,
      filter: false,
      align: "right",
      width: 70,
      mobileHidden: true,
      cell: (row) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatScore(row.value_score)}
        </span>
      ),
    },
    {
      id: "why",
      header: "Why this tier",
      sortable: false,
      filter: false,
      className: "min-w-[260px] max-w-[420px]",
      cell: (row) => (
        <ReasonChainInline reasons={row.reasons} source={row.value_source} />
      ),
    },
    {
      id: "value_source",
      accessorKey: "value_source",
      header: "Decided by",
      sortable: false,
      filter: "select",
      filterSingle: true,
      filterOptions: (
        Object.keys(SOURCE_META) as ValueSource[]
      ).map((key) => ({ value: key, label: SOURCE_META[key].label })),
      mobileHidden: true,
      cell: (row) => <SourceChip source={row.value_source} />,
    },
    {
      id: "traffic_class",
      accessorKey: "traffic_class",
      header: "Traffic class",
      sortable: false,
      filter: false,
      mobileHidden: true,
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground">
          {row.traffic_class ? humanizeSlug(row.traffic_class) : "—"}
        </span>
      ),
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      filter: false,
      align: "right",
      width: 80,
      cell: (row) => (
        <span className="text-xs tabular-nums">{formatCount(row.clicks)}</span>
      ),
    },
    {
      id: "impressions",
      accessorKey: "impressions",
      header: "Impressions",
      filter: false,
      align: "right",
      width: 100,
      mobileHidden: true,
      cell: (row) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatCount(row.impressions)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-hidden p-3 sm:p-4">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pr-14">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <CircleDollarSign className="h-4 w-4 text-primary" />
            Keyword value
          </h1>
          <p className="text-xs text-muted-foreground">
            What {site.domain}&rsquo;s search traffic is actually worth —{" "}
            {window.start} → {window.end}, compared to the 28 days before.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ValueDoors brandId={brandId} siteId={siteId} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setMeaningOpen((open) => !open)}
          >
            <BookOpenText className="h-3.5 w-3.5" />
            How value is computed
          </Button>
        </div>
      </div>

      {/* THE VERDICT — grafted from variant B. Composed English that names the
          divergence the totals hide. Renders only when there is a verdict to
          give; the contrast band is clickable because the sentence is a claim
          the user must be able to inspect. */}
      {verdict ? (
        <p className="shrink-0 text-xs leading-5 text-foreground">
          <span className="font-medium">{verdict.headline}</span>
          {verdict.detail ? (
            verdict.contrastBand ? (
              <button
                type="button"
                className="ml-1 text-left text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                title={`Filter the table to ${bandMetaFor(metas, verdict.contrastBand).label}`}
                onClick={() =>
                  table.onStateChange({
                    ...table.state,
                    page: 1,
                    columnFilters: {
                      ...table.state.columnFilters,
                      value_band: {
                        kind: "select",
                        value: verdict.contrastBand,
                      } as ColumnFilterValue,
                    },
                  })
                }
              >
                {verdict.detail}
              </button>
            ) : (
              <span className="ml-1 text-muted-foreground">
                {verdict.detail}
              </span>
            )
          ) : null}
        </p>
      ) : null}

      <MeaningHealth
        rows={health.data}
        isLoading={health.isPending}
        error={health.isError ? health.error : null}
        onRetry={() => void health.refetch()}
        brandId={brandId}
        siteId={siteId}
      />

      {/* THE WORK QUEUE — grafted from variant B. 4,524 of this site's keywords
          carry no meaning at all, and a table is the wrong shape for a pile
          that size: the useful motion is one question, one answer, next. */}
      {!sessionOpen && unvaluedQueries > 0 ? (
        <button
          type="button"
          onClick={() => setSessionOpen(true)}
          className="flex w-full shrink-0 flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-left transition-colors hover:border-warning/70"
        >
          <Gavel className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1 text-xs text-foreground">
            <span className="font-semibold">
              {formatCount(unvaluedQueries)} keywords
            </span>{" "}
            — carrying {formatCount(unvaluedClicks)} clicks — have no value
            yet. Until you rule on them, the totals above understate what you
            know.
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-warning">
            Start a ruling session →
          </span>
        </button>
      ) : null}

      {sessionOpen ? (
        <RulingSession
          siteId={siteId}
          window={window}
          metas={metas}
          totalUnvalued={unvaluedQueries}
          rulingPending={ruling.isPending}
          onRule={(input) =>
            ruling.mutate({
              keywordIds: input.keywordIds,
              tier: input.tier,
              notes: input.notes,
              label: input.label,
            })
          }
          onExit={() => setSessionOpen(false)}
        />
      ) : (
        <>
      {/* Decomposition scoreboard */}
      {vocab.isError ? (
        <InlineQueryError
          what="the value-band vocabulary"
          error={vocab.error}
          onRetry={() => void vocab.refetch()}
        />
      ) : null}
      {summary.isError ? (
        <InlineQueryError
          what="the value decomposition"
          error={summary.error}
          onRetry={() => void summary.refetch()}
        />
      ) : (
        <BandScoreboard
          metas={metas}
          summary={summary.data}
          // isPending, not isLoading: a paused fetch (offline) must show the
          // skeleton — zero-filled tiles for data that never arrived are a lie.
          isLoading={summary.isPending || vocab.isPending}
          activeBand={bandFilter}
          onSelectBand={(band) =>
            table.onStateChange({
              ...table.state,
              page: 1,
              columnFilters: {
                ...table.state.columnFilters,
                value_band: band
                  ? ({ kind: "select", value: band } as ColumnFilterValue)
                  : undefined,
              },
            })
          }
        />
      )}

      {/* Review table */}
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card p-2">
        <p className="mb-1.5 flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Gavel className="h-3.5 w-3.5 text-primary" />
          {formatCount(total)} GSC-active keywords in this window · every tier
          shows its why · your ruling always wins
        </p>
        {review.isError ? (
          <InlineQueryError
            what="the keyword value review"
            error={review.error}
            onRetry={() => void review.refetch()}
          />
        ) : null}
        <MatrxDataTable<ValueReviewRow>
          data={rows}
          columns={columns}
          getRowId={(row) => row.keyword_id}
          isLoading={review.isPending}
          isFetching={review.isFetching}
          query={{
            mode: "controlled",
            state: table.state,
            totalItems: total,
            onStateChange: table.onStateChange,
          }}
          toolbar={{
            searchPlaceholder: "Search keywords…",
          }}
          selection={{
            selectedIds,
            onSelectedIdsChange: setSelectedIds,
            noun: "keyword",
            actions: (_selected, ids) => (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={ruling.isPending}
                  onClick={() =>
                    setDraft({
                      keywordIds: ids,
                      label: `${ids.length} keywords`,
                      mode: "set",
                      tier: null,
                    })
                  }
                >
                  <Gavel className="h-3 w-3" /> Set value…
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  disabled={ruling.isPending}
                  onClick={() =>
                    setDraft({
                      keywordIds: ids,
                      label: `${ids.length} keywords`,
                      mode: "clear",
                      tier: null,
                    })
                  }
                >
                  <Undo2 className="h-3 w-3" /> Clear rulings
                </Button>
              </>
            ),
          }}
          detail={{
            title: (row) => row.keyword,
            defaultWidth: 440,
            headerActions: (row) => (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2 text-xs"
                title="Everything the platform knows about this keyword"
                onClick={() =>
                  openKeywordWindow({
                    phrase: row.keyword,
                    siteId,
                    brandId,
                    organizationId: site.organization_id,
                  })
                }
              >
                <PanelRightOpen className="h-3.5 w-3.5" /> Keyword intel
              </Button>
            ),
            render: (row) => {
              const meta = bandMetaFor(metas, row.value_band);
              return (
                <div className="space-y-4 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded border px-2 py-0.5 text-xs font-medium",
                        meta.chip,
                      )}
                    >
                      {meta.label}
                    </span>
                    <SourceChip source={row.value_source} />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      score {formatScore(row.value_score)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Clicks", formatCount(row.clicks)],
                      ["Impressions", formatCount(row.impressions)],
                      [
                        "Traffic class",
                        row.traffic_class
                          ? humanizeSlug(row.traffic_class)
                          : "—",
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md border border-border bg-muted/30 px-2 py-1.5"
                      >
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {label}
                        </p>
                        <p className="text-sm font-semibold tabular-nums">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-foreground">
                      Why this tier
                    </p>
                    <ReasonChainDetail
                      reasons={row.reasons}
                      source={row.value_source}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={ruling.isPending}
                      onClick={() =>
                        setDraft({
                          keywordIds: [row.keyword_id],
                          label: row.keyword,
                          mode: "set",
                          tier:
                            row.value_source === "override" &&
                            row.value_band !== "unvalued"
                              ? row.value_band
                              : null,
                        })
                      }
                    >
                      <Gavel className="h-3 w-3" />
                      {row.value_source === "override"
                        ? "Change your ruling…"
                        : "Rule the tier…"}
                    </Button>
                    {row.value_source === "override" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                        disabled={ruling.isPending}
                        onClick={() =>
                          ruling.mutate({
                            keywordIds: [row.keyword_id],
                            tier: null,
                            label: row.keyword,
                          })
                        }
                      >
                        <Undo2 className="h-3 w-3" /> Clear ruling
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            },
          }}
          window={{ enabled: false }}
          pageSize={50}
          emptyState={{
            icon: <CircleDollarSign className="h-8 w-8 text-muted-foreground" />,
            title:
              bandFilter || sourceFilter || state.search
                ? "No keywords match this view"
                : "No GSC-active keywords in this window",
            description:
              bandFilter || sourceFilter || state.search
                ? "Clear the tier tile, the filters, or the search to widen the view."
                : "Connect Search Console and run a sync — keyword value starts from real search traffic.",
          }}
          className="min-h-0 flex-1"
        />
      </div>

        </>
      )}

      {meaningOpen ? (
        <MeaningPanel
          siteId={siteId}
          siteDomain={site.domain}
          brandId={brandId}
          window={window}
          bandMetas={metas}
          bandsAreTemplate={bandsAreTemplate}
          onClose={() => setMeaningOpen(false)}
        />
      ) : null}

      {draft ? (
        <RulingDialog
          draft={draft}
          metas={metas}
          busy={ruling.isPending}
          onCancel={() => setDraft(null)}
          onApply={(tier, notes) =>
            ruling.mutate({
              keywordIds: draft.keywordIds,
              tier: draft.mode === "clear" ? null : tier,
              notes: notes || undefined,
              label: draft.label,
            })
          }
        />
      ) : null}
    </div>
  );
}

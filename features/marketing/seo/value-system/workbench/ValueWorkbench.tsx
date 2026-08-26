"use client";

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
 *  3. Every number explains itself — the table stays compact, while row
 *     context and the detail surface keep the complete reasons chain one
 *     gesture away.
 *
 * Unvalued is the loudest tile and the default working filter target: it is
 * the work queue, never a silently-guessed middle tier. And "Your setup, as it
 * actually stands" (./MeaningHealth) says what is unfinished about THIS site's
 * meaning — measured live, never a score.
 *
 * 🚨 2026-08-23 — THE RE-LAYOUT (C17). Arman: "some of the things that used to
 * be extremely valuable and used to show KPIs to gamify the system for the
 * user got hijacked by the new system, and they've been hidden or have become
 * massively over complicated… half of the page now is just taken up by a bunch
 * of garbage at the top that is completely meaningless. I don't like pages
 * where there are novels written." He was measurably right: 630px of a 856px
 * first screen — 74% — was spent before the first keyword row.
 *
 * The ORDER is now the ruling, and every future addition to this page has to
 * earn its place in it:
 *
 *   1. ONE header line          — title, domain, window. A window is a fact,
 *                                 so it is a chip, not a sentence.
 *   2. THE KPI BAND             — ./ValueKpiBand. Four numbers, biggest type
 *                                 on the page, every one of them a door.
 *   3. THE VERDICT             — one sentence, under the numbers it explains.
 *   4. SETUP STATES             — ./MeaningHealth, a row of pills, not five
 *                                 cards. The novel lives in their hover and
 *                                 in "Details".
 *   5. BY LEVEL (provisional)   — ./BandScoreboard, kept on his instruction,
 *                                 subordinate and collapsible.
 *   6. AI SUGGESTIONS           — one chip row, BELOW the numbers. A proposal
 *                                 never outranks the site's own facts.
 *   7. THE TABLE.
 *
 * DUPLICATIONS DELETED in the same pass, because one page said the same thing
 * three times: the scoreboard's own "site clicks vs prior 28 days" headline
 * (the verdict already says it), the full-width unvalued work-queue banner
 * (now the unvalued KPI tile, session button and all), the unvalued strip
 * inside the scoreboard (now an ordinary level tile), and the table's
 * "N GSC-active keywords · every tier shows its why · your ruling always
 * wins" narration (the KPI band carries the count; the doctrine is not news
 * to the reader on their second visit).
 *
 * NOTHING WAS CULLED. Rulings, the ruling session, receipts, the level editor,
 * packs, the guidelines door and the facet registry are all still exactly one
 * click away, under the same names.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  Plus,
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
import { GSC_COMPACT_COLUMN_LABELS } from "@/features/marketing/search-console/lib/columns";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import {
  getSiteMeaningHealth,
  getValueReview,
  getValueSummary,
  getValueVocabulary,
  getRulingCounts,
  setKeywordValue,
  getSuggestedDimensionColumns,
} from "../data";
import type { ValueReviewRow, ValueSource } from "../types";
import {
  bandMetaFor,
  buildBandMeta,
  buildKpis,
  buildVerdict,
  formatScore,
  formatWindowLabel,
  humanizeSlug,
  reviewWindow,
  type BandMeta,
} from "../lib";
import { getFacetDimensionCatalog } from "@/features/marketing/seo/value-system/dimensions/data";
import {
  ClassCell,
  StampCell,
} from "@/features/marketing/seo/keyword-workbench/components/cells";
import { ColumnChooser } from "@/features/marketing/seo/keyword-table/ColumnChooser";
import type { PickedValue } from "@/features/marketing/seo/keyword-workbench/components/DimensionValuePicker";
import {
  getKeywordStamps,
  setKeywordStamps,
} from "@/features/marketing/seo/keyword-workbench/data";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { KEYWORD_VALUE_WORKBENCH_SURFACE_NAME } from "@/features/surfaces/manifests/keyword-value-workbench.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { buildKeywordValueScope } from "@/features/marketing/lib/scopes/keyword-value-scope";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import {
  keywordEntityRef,
  useKeywordAssignSurfaces,
  useKeywordMenuSection,
} from "@/features/marketing/seo/keyword/keyword-actions";
import { KeywordMeaningSuggestions } from "@/features/marketing/seo/value-system/suggestions/KeywordMeaningSuggestions";
import { ValueDoors } from "../ValueDoors";
import { BandScoreboard } from "./BandScoreboard";
import { ValueKpiBand } from "./ValueKpiBand";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { ReasonChainDetail } from "./ReasonChain";
import { MeaningPanel } from "./MeaningPanel";
import { MeaningHealth } from "./MeaningHealth";
import { DimensionCoverage } from "@/features/marketing/seo/value-system/coverage/DimensionCoverage";
import { ReadyDefaultsBanner } from "../packs/ReadyDefaultsBanner";
import { RulingDialog, type RulingDraft } from "./RulingDialog";
import { AddLevelDialog } from "../pickers/AddLevelDialog";
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
      "Deterministic arithmetic over meaning you ratified — offering worth × rules × geo.",
    tone: "border-border bg-muted/40 text-foreground",
  },
  unvalued: {
    label: "Unvalued",
    description:
      "No meaning reaches this keyword yet — the honest bucket and the work queue.",
    tone: "border-warning/50 bg-warning/10 text-warning",
  },
};

function singleSelectValue(
  filter: ColumnFilterValue | undefined,
): string | null {
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
  onAddLevel,
  busy,
}: {
  row: ValueReviewRow;
  metas: BandMeta[];
  onRule: (tier: string) => void;
  onClear: () => void;
  onRuleWithNote: () => void;
  /** P23 — none of the tiers fit, so make a new one right here. */
  onAddLevel: () => void;
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
          title={`${meta.description ?? meta.label}\nThis level is worked out from the answers below. You can overrule it, but that replaces the score rather than teaching the system anything.`}
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
          Overrule “{row.keyword}”
        </DropdownMenuLabel>
        <DropdownMenuLabel className="whitespace-normal pt-0 text-[10px] font-normal leading-4 text-warning">
          This pins a level and drops the score — the keyword stops being worked
          out and stays put when anything else changes. Answering its dimensions
          instead teaches every keyword like it.
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
        {/* P23 — a picker that only offers what already exists is a dead end. */}
        <DropdownMenuItem className="gap-2 text-xs" onSelect={onAddLevel}>
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          None of these fit — add a level…
        </DropdownMenuItem>
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
  // The inherited brand+site half of this surface's scope — built once for the
  // whole marketing family, never hand-assembled here.
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const openKeywordWindow = useOpenKeywordWindow();
  const [window] = useState(reviewWindow);
  const table = useMarketingTableState({
    defaultSort: { id: "clicks", direction: "desc" },
    defaultPageSize: 50,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [meaningOpen, setMeaningOpen] = useState(false);
  const [draft, setDraft] = useState<RulingDraft | null>(null);
  /** P23 — "+ Add a level" from the tier chip; the string is what was typed. */
  const [addingLevel, setAddingLevel] = useState<string | null>(null);
  // The ruling session is a MODE, not an overlay: it replaces the table so the
  // one keyword in front of you is the only thing to answer.
  const [sessionOpen, setSessionOpen] = useState(false);
  // Counted from rulings that LANDED, never from taps — see RulingSession.
  const [sessionRuled, setSessionRuled] = useState(0);
  // The by-level tiles: kept, subordinate, and collapsible (see BandScoreboard).
  const [levelsOpen, setLevelsOpen] = useState(true);
  const levelsRef = useRef<HTMLElement | null>(null);
  /**
   * The doors other screens open onto this one (reason-links.ts):
   *   ?kw=<text>    a receipt's "change or clear your ruling"
   *   ?band=<slug>  a level row in the Traffic quality decomposition
     * Applied once, then the reader owns the view — re-applying on every render
   * would fight every filter they change afterwards.
   */
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  /**
   * KI-026 — THE SITE'S OWN DIMENSIONS, as columns, on the worth screen.
   *
   * Class · Score · Level have always been here; the answers the site itself
   * authored ("Buyer stage: ready to buy") were only readable one route away
   * on the Keyword Workbench, so the page where a person forms an opinion
   * about worth could not show what the keyword actually IS.
   *
   * Same dialect as the keyword table: the chosen slugs live in the URL under
   * `cols`, so a link carries the columns. Same chooser component, same stamp
   * read (`seo.gsc_keyword_stamps_for`), same assign path — nothing about
   * dimensions is implemented twice.
   */
  const urlDimensionColumns = (searchParams.get("cols") ?? "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);

  /**
   * THE SCREEN OPENS ON THE QUESTIONS, NOT THE ANSWER.
   *
   * Arman, 2026-08-25: the page "immediately tries to force you to select the
   * level… the exact opposite of what we just worked our asses off doing."
   * Dimension columns existed here but were opt-in through `?cols=`, so with a
   * bare URL the only editable thing on the row was the LEVEL — the output.
   *
   * With no `cols` in the URL the server picks the questions worth asking
   * (`seo.gsc_suggested_dimension_columns`: worth-carrying dimensions first,
   * emptiest first within that). The moment a person chooses their own columns
   * the URL wins and this default stops applying — a suggestion, never a lock.
   */
  const suggestedColumns = useQuery({
    queryKey: ["seo", "suggested-dimension-columns", siteId],
    queryFn: ({ signal }) =>
      getSuggestedDimensionColumns(siteId as string, 3, signal),
    enabled: !!siteId && urlDimensionColumns.length === 0,
    staleTime: 5 * 60 * 1000,
  });
  const dimensionColumns =
    urlDimensionColumns.length > 0
      ? urlDimensionColumns
      : (suggestedColumns.data ?? []).map((entry) => entry.slug);
  const setDimensionColumns = (next: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    next.length > 0
      ? params.set("cols", next.join(","))
      : params.delete("cols");
    // P27 — adding or removing a column is a discrete change, so Back undoes
    // exactly it.
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const focusKeyword = searchParams.get("kw");
  const focusBand = searchParams.get("band");
  const appliedFocusRef = useRef(false);

  /**
   * 🚨 THE TWO-TABLES TRAP, closed 2026-08-24. Arman, on this page: *"the
   * traffic class is all the way on the right, but I'm not able to set it in
   * the table."* He was right, and the reason was worse than a missing
   * feature: the Keyword Workbench's table shows Class as a dropdown that
   * ASSIGNS, while this table showed the same word, in the same kind of table,
   * as dead grey text. Two near-identical tables behaving differently teaches
   * a person that the platform is unpredictable.
   *
   * The fix is NOT a second write path. This cell now renders the SAME
   * `ClassCell` and writes through the SAME `gsc_set_keyword_stamps`, with the
   * SAME `AssignPanel` behind "Assign with a reason…" (P24 — the WHY is
   * captured at the moment of assignment). Nothing about class assignment is
   * implemented twice; only the mounting differs (a dialog here, an inline
   * panel there, because this page's top is a ruled layout).
   */
  const surfaces = useKeywordAssignSurfaces({ siteId });
  const catalog = useQuery({
    queryKey: ["marketing", "seo", "dimension-catalog", siteId],
    queryFn: ({ signal }) => getFacetDimensionCatalog(siteId, signal),
    staleTime: 5 * 60_000,
  });
  const dimensions = catalog.data ?? [];
  const classDimension = dimensions.find((d) => d.slug === "traffic_class");
  const classOptions = (classDimension?.values ?? []).filter((v) => !v.abstain);

  /**
   * 🚨 THE MISSING MENU, closed 2026-08-24. Arman: *"I talked at length about
   * how the context menu was essentially everything, but I'm just not seeing
   * some of these things set up."* Right-clicking a keyword on this page — the
   * flagship worth screen — used to select a word and open nothing at all.
   *
   * ONE menu for the whole pane (never one per row): `resolveContextOnOpen`
   * reads `data-row-id` off the right-clicked element and stashes the row, and
   * every item delegates to the shared keyword actions, so this page offers
   * exactly what the Keyword Workbench offers, through the same RPCs.
   */
  const clickedRow = useRef<ValueReviewRow | null>(null);
  const keywordSection = useKeywordMenuSection({
    siteId,
    siteName: site.domain,
    brandId,
    organizationId: site.organization_id,
    surfaces,
    getRow: () => {
      const row = clickedRow.current;
      return row
        ? {
            phrase: row.keyword,
            keywordId: row.keyword_id,
            currentLevel: row.value_band,
            levelIsRuling: row.value_source === "override",
          }
        : null;
    },
  });

  /**
   * A class stamp changes what the resolver computes, so the score, the level
   * and the receipt on every row are stale the moment one lands — invalidate
   * the value reads too, not only the stamp reads.
   */
  const refreshAfterStamp = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["marketing", "seo", "keyword-stamps", siteId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["marketing", "gsc", "keyword-value-for", siteId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["marketing", "value", "review", siteId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["marketing", "value", "summary", siteId],
      }),
    ]);
  };

  const quickAssignStamp = async (keywordId: string, picked: PickedValue) => {
    try {
      const result = await setKeywordStamps({
        siteId,
        keywordIds: [keywordId],
        valueId: picked.valueId,
      });
      await refreshAfterStamp();
      toast.success(
        `${picked.dimensionLabel}: ${picked.valueLabel} — ${result.written.toLocaleString()} keyword${result.written === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  };

  const quickClearStamp = async (
    keywordId: string,
    valueId: string,
    dimensionLabel: string,
  ) => {
    try {
      const result = await setKeywordStamps({
        siteId,
        keywordIds: [keywordId],
        valueId,
        clear: true,
      });
      await refreshAfterStamp();
      toast.success(
        `${dimensionLabel} cleared on ${result.cleared.toLocaleString()} keyword${result.cleared === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  };

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

  /**
   * The expert's own contribution, counted. Separate from the summary because
   * it is a property of the SITE, not of this 28-day window: a ruling made
   * last month still counts, and a person who ruled 40 keywords should see 40
   * — not however many of them happened to earn a click this month.
   */
  const rulings = useQuery({
    queryKey: ["marketing", "value", "ruling-counts", siteId],
    queryFn: ({ signal }) => getRulingCounts(siteId, signal),
    staleTime: 60_000,
  });

  const summaryRows = summary.data ?? [];
  const verdict = buildVerdict(summaryRows, metas);
  const kpis = summary.data ? buildKpis(summaryRows) : null;
  const unvaluedQueries = kpis?.unvaluedQueries ?? 0;

  const state = table.queryState;

  /**
   * ONE way for anything on this page to point the table somewhere — the KPI
   * tiles, the level tiles and the verdict sentence all go through here.
   * Four hand-rolled copies of this object spread was how the same filter
   * ended up behaving three different ways.
   */
  function filterBy(
    column: "value_band" | "value_source",
    value: string | null,
  ) {
    table.onStateChange({
      ...table.state,
      page: 1,
      columnFilters: {
        ...table.state.columnFilters,
        [column]: value
          ? ({ kind: "select", value } as ColumnFilterValue)
          : undefined,
      },
    });
  }

  useEffect(() => {
    if (appliedFocusRef.current) return;
    if (!focusKeyword && !focusBand) return;
    appliedFocusRef.current = true;
    if (focusKeyword || focusBand) {
      table.onStateChange({
        ...table.state,
        page: 1,
        ...(focusKeyword ? { search: focusKeyword } : {}),
        columnFilters: {
          ...table.state.columnFilters,
          ...(focusBand
            ? {
                value_band: {
                  kind: "select",
                  value: focusBand,
                } as ColumnFilterValue,
              }
            : {}),
        },
      });
    }
    // Deliberately keyed on the URL params alone: the ref guard makes this a
    // once-only seed, and adding the table controller would re-run it every
    // time the reader changes a filter — undoing their own edit.
  }, [focusKeyword, focusBand]);

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

  /**
   * The dimension stamps for EXACTLY the rows on screen (THE SCOPE RULE —
   * never the whole site from the browser), through the same RPC the keyword
   * table reads. The query key matches the one `refreshAfterStamp`
   * invalidates, so a stamp landed from this page repaints its own column.
   */
  const visibleKeywordIds = rows.map((row) => row.keyword_id);
  const stamps = useQuery({
    queryKey: [
      "marketing",
      "seo",
      "keyword-stamps",
      siteId,
      dimensionColumns,
      visibleKeywordIds,
    ],
    queryFn: ({ signal }) =>
      getKeywordStamps(siteId, visibleKeywordIds, dimensionColumns, signal),
    enabled: visibleKeywordIds.length > 0 && dimensionColumns.length > 0,
    staleTime: 60_000,
  });

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
      if (sessionOpen) setSessionRuled((count) => count + resolved.length);
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
      // Keyword stays the frozen identity column; Class is the first editable
      // meaning column, followed by the site's own dimensions.
      id: "traffic_class",
      accessorKey: "traffic_class",
      header: "Class",
      sortable: false,
      filter: false,
      mobileHidden: true,
      width: 150,
      cell: (row) => (
        <ClassCell
          current={row.traffic_class || null}
          source={null}
          options={classOptions}
          disabled={!row.keyword_id || !classDimension}
          onPick={(value) => {
            if (!row.keyword_id || !classDimension) return;
            void quickAssignStamp(row.keyword_id, {
              dimensionId: classDimension.dimension_id,
              dimensionSlug: classDimension.slug,
              dimensionLabel: classDimension.label,
              valueId: value.value_id,
              valueLabel: value.label,
            });
          }}
          onAssignWithReason={() =>
            surfaces.openDimension(
              { phrase: row.keyword, keywordId: row.keyword_id },
              "traffic_class",
            )
          }
          onMakeYourOwn={() =>
            surfaces.openDimension({
              phrase: row.keyword,
              keywordId: row.keyword_id,
            })
          }
        />
      ),
    },
    // THE QUESTIONS COME FIRST (Arman, 2026-08-25). These sat after Clicks
    // and Impressions, which put them off the right edge of the screen — so
    // the page still read as "set the level" even once the columns defaulted
    // on. The answers a person is meant to give now sit beside Class and the
    // compact performance/score columns finish the row.
    //
    // KI-026 — the site's own dimensions, in the order they were picked. The
    // SAME `StampCell` the Keyword Workbench renders, and the SAME stamp write,
    // so a value set here is a value set there. Filtering is deliberately off:
    // this table's server query is the
    // value-review RPC, which does not speak the stamp filter, and a filter
    // that silently only knew this page would be the quiet lie P28 exists to
    // stop.
    ...dimensionColumns.map((slug): MatrxColumnDef<ValueReviewRow> => {
      const dimension = dimensions.find((d) => d.slug === slug);
      // A site dimension's slug carries a `site_<8 hex>_` prefix that is
      // plumbing — it never reaches a header.
      const label =
        dimension?.label ??
        humanizeSlug(slug.replace(/^site_[0-9a-f]{8}_/, ""));
      return {
        id: `dim:${slug}`,
        header: label,
        sortable: false,
        filter: false,
        width: 150,
        mobileHidden: true,
        accessorFn: (row) =>
          stamps.data?.get(row.keyword_id)?.get(slug)?.valueLabel ?? "",
        cell: (row) => {
          const stamp = stamps.data?.get(row.keyword_id)?.get(slug);
          if (!dimension) {
            return (
              <span
                className="block h-5 w-20 animate-pulse rounded bg-muted"
                aria-label={`Loading ${label} choices`}
              />
            );
          }
          return (
            <StampCell
              siteId={siteId}
              dimension={dimension}
              dimensions={dimensions}
              current={
                stamp
                  ? {
                      dimensionId: dimension.dimension_id,
                      dimensionSlug: dimension.slug,
                      dimensionLabel: dimension.label,
                      valueId: stamp.valueId,
                      valueLabel: stamp.valueLabel,
                    }
                  : null
              }
              source={stamp?.source ?? null}
              notes={stamp?.notes ?? null}
              loading={catalog.isLoading}
              onPick={(picked) => void quickAssignStamp(row.keyword_id, picked)}
              onAssignWithReason={() =>
                surfaces.openDimension(
                  { phrase: row.keyword, keywordId: row.keyword_id },
                  slug,
                )
              }
              onClear={
                stamp
                  ? () =>
                      void quickClearStamp(
                        row.keyword_id,
                        stamp.valueId,
                        dimension.label,
                      )
                  : undefined
              }
            />
          );
        },
      };
    }),
    {
      id: "value_source",
      accessorKey: "value_source",
      header: "Decided by",
      sortable: false,
      filter: "select",
      filterSingle: true,
      filterOptions: (Object.keys(SOURCE_META) as ValueSource[]).map((key) => ({
        value: key,
        label: SOURCE_META[key].label,
      })),
      mobileHidden: true,
      cell: (row) => <SourceChip source={row.value_source} />,
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: GSC_COMPACT_COLUMN_LABELS.clicks,
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
      header: GSC_COMPACT_COLUMN_LABELS.impressions,
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
    {
      id: "score",
      header: GSC_COMPACT_COLUMN_LABELS.score,
      accessorFn: (row) => row.value_score,
      filter: false,
      align: "right",
      width: 70,
      mobileHidden: true,
      cell: (row) => {
        const override = row.reasons?.find((r) => r.kind === "override");
        const computed =
          override && override.kind === "override"
            ? override.computed_score
            : null;
        if (row.value_score == null && computed != null) {
          return (
            <span
              className="text-xs tabular-nums text-muted-foreground/70"
              title="What this works out to. Your ruling decides the level; this is the number it overruled."
            >
              ({formatScore(computed)})
            </span>
          );
        }
        return (
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatScore(row.value_score)}
          </span>
        );
      },
    },
    {
      id: "value_band",
      accessorKey: "value_band",
      header: GSC_COMPACT_COLUMN_LABELS.level,
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
          onAddLevel={() => setAddingLevel("")}
          onRuleWithNote={() =>
            setDraft({
              keywordIds: [row.keyword_id],
              label: row.keyword,
              mode: "set",
              tier:
                row.value_source === "override" && row.value_band !== "unvalued"
                  ? row.value_band
                  : null,
            })
          }
        />
      ),
    },
  ];

  /**
   * THE SURFACE EMITTER. This page has its own registered surface
   * (`matrx-user/keyword-value-workbench`) as of 2026-08-24 — before that its
   * context menu had to omit `surfaceName`, so an agent launched from a
   * keyword row got no bound agents and no value mappings at all.
   *
   * Built at TRIGGER time from live state (never stale React state), nested
   * inside the site provider so this surface wins while the page is mounted.
   */
  const getScope = () =>
    buildKeywordValueScope({
      base: getBaseValues(),
      tableState: table.state,
      rows,
      total,
      loading: review.isLoading,
      selectedIds,
      levels: metas,
      levelsAreTemplate: bandsAreTemplate,
      window,
      kpis,
      verdict,
      meaningHealth: health.data,
      rulingCount: rulings.data?.total,
      activeLevelFilter: bandFilter,
      activeSourceFilter: sourceFilter,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={KEYWORD_VALUE_WORKBENCH_SURFACE_NAME}
      getScope={getScope}
    >
      {/*
      The page scrolls; the TABLE does not scroll inside it.

      This was a fixed-viewport pane (`overflow-hidden`, the table bounded by
      `flex-1 min-h-0`) when it was one variant among four and carried only a
      scoreboard above the table. Converged, it also carries the verdict, the
      setup rows and the work-queue callout — and `flex-1` shrinks, so the
      table's scroll box collapsed to 8px and rendered 50 rows into nothing.
      One scroll surface, at natural height, is what the rest of this family
      does (topics, rules, packs) and what a 50-row page wants.
    */}
      <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto overscroll-contain bg-textured p-3 sm:p-4">
        {/* HEADER — one line. The window used to be spelled out in a
          sentence under the title; it is a fact, so it is a chip. */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pr-14">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CircleDollarSign className="h-4 w-4 text-primary" />
              Keyword value
            </h1>
            <span
              className="truncate text-xs text-muted-foreground"
              title={`What ${site.domain}'s search traffic is actually worth. Every number on this page covers ${window.start} to ${window.end}, compared with the 28 days before it.`}
            >
              {site.domain} · {formatWindowLabel(window)} vs prior 28 days
            </span>
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

        {/* THE KPI BAND — first, always. The numbers a person came for, and the
          only block on this page allowed to be the biggest thing on it. */}
        {summary.isError ? (
          <InlineQueryError
            what="the value decomposition"
            error={summary.error}
            onRetry={() => void summary.refetch()}
          />
        ) : (
          <ValueKpiBand
            kpis={kpis}
            rulings={rulings.data ?? null}
            // isPending, not isLoading: a paused fetch (offline) must show the
            // skeleton — zero-filled tiles for data that never arrived are a lie.
            isLoading={summary.isPending}
            activeBand={bandFilter}
            activeSource={sourceFilter}
            onFilterBand={(band) => filterBy("value_band", band)}
            onFilterSource={(source) => filterBy("value_source", source)}
            onClearFilters={() =>
              table.onStateChange({
                ...table.state,
                page: 1,
                columnFilters: {},
              })
            }
            onShowLevels={() => {
              setLevelsOpen(true);
              levelsRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }}
            onStartSession={() => setSessionOpen(true)}
            onQuickAnswers={() =>
              dispatch(
                openOverlay({
                  overlayId: "keywordQuickAnswersWindow",
                  data: {
                    siteId,
                    siteLabel: site.name ?? site.domain,
                    dimensionSlug: dimensionColumns[0] ?? null,
                  },
                }),
              )
            }
            sessionOpen={sessionOpen}
          />
        )}

        {/* THE VERDICT — grafted from variant B. Composed English that names the
          divergence the totals hide. One sentence, under the numbers it is
          about; the contrast band is clickable because the sentence is a claim
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
                  onClick={() => filterBy("value_band", verdict.contrastBand)}
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

        {/* What is unfinished about this site's setup — states and doors, never
          the page's headline (see ./MeaningHealth for why it is a row now). */}
        <MeaningHealth
          rows={health.data}
          isLoading={health.isPending}
          error={health.isError ? health.error : null}
          onRetry={() => void health.refetch()}
          brandId={brandId}
          siteId={siteId}
        />

        {/* KI-022 — the honesty gauge, in its compact form. It renders NOTHING
          while every question describes enough of the traffic to filter on;
          the moment one does not, it says so here, beside the numbers a person
          is about to draw a conclusion from, with a door into the keywords
          that question has no answer for. Same server read as the Dimensions
          screen's full panel — never a second, differently-computed summary. */}
        <DimensionCoverage siteId={siteId} brandId={brandId} variant="compact" />

        <ReadyDefaultsBanner />

        {/* WHAT THE AGENTS PROPOSED and you have not answered yet — rendered in
          BOTH postures. The ruling session's trial proposes rule changes into
          exactly this queue, so a session that hid it would tell a person to
          "approve it below" and then show them nothing. */}
        {sessionOpen ? (
          <KeywordMeaningSuggestions siteId={siteId} className="shrink-0" />
        ) : null}

        {sessionOpen ? (
          <RulingSession
            siteId={siteId}
            siteLabel={`${site.name ?? site.domain} (${site.domain})`}
            organizationId={site.organization_id}
            window={window}
            metas={metas}
            dimensions={dimensions}
            dimensionsLoading={catalog.isLoading}
            totalUnvalued={unvaluedQueries}
            ruledCount={sessionRuled}
            rulingPending={ruling.isPending}
            onRule={(input) =>
              ruling.mutate({
                keywordIds: input.keywordIds,
                tier: input.tier,
                notes: input.notes,
                label: input.label,
              })
            }
            onExit={() => {
              setSessionOpen(false);
              setSessionRuled(0);
            }}
          />
        ) : (
          <>
            {/* THE LEVEL BREAKDOWN — kept on Arman's explicit instruction ("don't
          get rid of them yet") and marked for exactly what he said about it:
          he is not sure the tiles are meaningful. So they render UNDER the
          KPIs, at tile size, behind a header that says so. Every tile is
          still a live filter into the table. */}
            <section ref={levelsRef} className="shrink-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLevelsOpen((open) => !open)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground transition-colors hover:text-primary"
                >
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      !levelsOpen && "-rotate-90",
                    )}
                  />
                  By level
                </button>
                <span
                  className="rounded border border-border bg-muted/40 px-1.5 py-px text-[10px] uppercase tracking-wide text-muted-foreground"
                  title="Provisional. These tiles predate the level system and Arman has not yet ruled on whether the split is the right one — they are kept, and deliberately subordinate to the KPIs above, until he does."
                >
                  provisional
                </span>
                {bandFilter ? (
                  <button
                    type="button"
                    onClick={() => filterBy("value_band", null)}
                    className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                  >
                    Showing {bandMetaFor(metas, bandFilter).label} only — clear
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    click a level to filter the table
                  </span>
                )}
              </div>

              {vocab.isError ? (
                <InlineQueryError
                  what="the value-band vocabulary"
                  error={vocab.error}
                  onRetry={() => void vocab.refetch()}
                />
              ) : levelsOpen && !summary.isError ? (
                <BandScoreboard
                  metas={metas}
                  summary={summary.data}
                  isLoading={summary.isPending || vocab.isPending}
                  activeBand={bandFilter}
                  onSelectBand={(band) => filterBy("value_band", band)}
                />
              ) : null}
            </section>

            {/* WHAT THE AGENTS PROPOSED and you have not answered yet. Nothing here
          has touched a matcher, a worth row, a stamp or the guidelines — that
          is P12. It used to sit above every number, which put a suggestion
          ahead of the site's own facts; it is one chip row, below them, and
          it renders nothing at all when the queue is empty. */}
            <KeywordMeaningSuggestions siteId={siteId} className="shrink-0" />

            {/* ONE assignment surface, borrowed whole from the shared keyword
          actions — never a second implementation of "assign with a reason".
          MOUNTED INLINE, not in a Dialog: the value picker inside it opens its
          own portalled popover, and a Radix Dialog reads that click as an
          outside interaction and closes itself mid-assignment. Caught in the
          live pass on 2026-08-24 — if you move this into an overlay, that bug
          comes straight back. */}
            {surfaces.isOpen ? (
              <div className="shrink-0">{surfaces.node}</div>
            ) : null}

            {/* Review table — ONE v3 menu around the whole pane. */}
            <NonEditableContextMenu
              sourceFeature="marketing"
              surfaceName={KEYWORD_VALUE_WORKBENCH_SURFACE_NAME}
              contentSource={{ type: "raw" }}
              // The surface's declared values ride along — the SAME emitter the page
              // provider uses. A `surfaceName` without them makes the v3
              // value-mapping guard scream, and it would be right to.
              contextData={{ ...getScope(), content: "" }}
              resolveContextOnOpen={(target) => {
                const id = target
                  ?.closest("[data-row-id]")
                  ?.getAttribute("data-row-id");
                const row =
                  (id && rows.find((r) => r.keyword_id === id)) || null;
                clickedRow.current = row;
                if (!row) return null;
                return {
                  // ONE menu serves every row, so the ROW's entity — not the pane's —
                  // owns Attach To. v3 rebuilds the entity actions from this key
                  // (`CONTEXT_MENU_ENTITY_KEY`); Share stays hidden because a keyword
                  // is not a shareable resource, which is honest rather than fake.
                  [CONTEXT_MENU_ENTITY_KEY]: keywordEntityRef({
                    phrase: row.keyword,
                    keywordId: row.keyword_id,
                  }),
                  content: [
                    `Keyword: ${row.keyword}`,
                    `Level: ${bandMetaFor(metas, row.value_band).label}`,
                    `Score: ${formatScore(row.value_score)}`,
                    `Class: ${row.traffic_class ? humanizeSlug(row.traffic_class) : "not set"}`,
                    `Decided by: ${SOURCE_META[row.value_source]?.label ?? row.value_source}`,
                    `Clicks: ${formatCount(row.clicks)} · Impressions: ${formatCount(row.impressions)}`,
                  ].join("\n"),
                  keyword: row.keyword,
                  keyword_id: row.keyword_id,
                };
              }}
              extraSections={[keywordSection]}
            >
              <div className="flex flex-col rounded-lg border border-border bg-card p-2">
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
                    // KI-026 — the site's own dimensions, offered as columns. Same
                    // chooser the Keyword Workbench uses; its core-column half is
                    // omitted because this page's other columns are its own ruled
                    // layout, not the shared core set.
                    actions: (
                      <ColumnChooser
                        dimensions={dimensions}
                        loading={catalog.isLoading}
                        selected={dimensionColumns}
                        onSelectedChange={setDimensionColumns}
                        newDimensionHref={`/marketing/brands/${brandId}/sites/${siteId}/value/dimensions`}
                      />
                    ),
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
                            {/* Class is SETTABLE, so it is never a stat tile here
                        either — same rule as the column. */}
                            <button
                              type="button"
                              disabled={!row.keyword_id}
                              onClick={() =>
                                surfaces.openDimension(
                                  {
                                    phrase: row.keyword,
                                    keywordId: row.keyword_id,
                                  },
                                  "traffic_class",
                                )
                              }
                              className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-center transition-colors hover:border-primary/40 hover:bg-accent"
                              title="Set this keyword's class — the same write as the Keyword Workbench, with room for your reason."
                            >
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Class
                              </p>
                              <p className="text-sm font-semibold">
                                {row.traffic_class
                                  ? humanizeSlug(row.traffic_class)
                                  : "Set it"}
                              </p>
                            </button>
                          </div>
                          <div>
                            <p className="mb-1.5 text-xs font-semibold text-foreground">
                              Why this level
                            </p>
                            {/* P26 — THE FULL LOOP. Without `linkContext` this
                              receipt explained the number and then left the
                              reader holding it: no step opened the rule, the
                              dimension value, the offering or the thresholds
                              that produced it (found by the 2026-08-25 surface
                              test). The doors are the ONE mapping in
                              reason-links.ts — this passes the context, it does
                              not fork a second receipt. */}
                            <ReasonChainDetail
                              reasons={row.reasons}
                              source={row.value_source}
                              linkContext={{
                                brandId,
                                siteId,
                                keyword: row.keyword,
                              }}
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
                    icon: (
                      <CircleDollarSign className="h-8 w-8 text-muted-foreground" />
                    ),
                    title:
                      bandFilter || sourceFilter || state.search
                        ? "No keywords match this view"
                        : "No GSC-active keywords in this window",
                    description:
                      bandFilter || sourceFilter || state.search
                        ? "Clear the tier tile, the filters, or the search to widen the view."
                        : "Connect Search Console and run a sync — keyword value starts from real search traffic.",
                  }}
                />
              </div>
            </NonEditableContextMenu>
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

        {addingLevel !== null ? (
          <AddLevelDialog
            siteId={siteId}
            kind="value_band"
            initialLabel={addingLevel}
            onCancel={() => setAddingLevel(null)}
            onCreated={() => setAddingLevel(null)}
          />
        ) : null}

        {draft ? (
          <RulingDialog
            siteId={siteId}
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
    </SurfaceRuntimeProvider>
  );
}

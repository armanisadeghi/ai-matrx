"use client";

import {
  useState,
  useCallback,
  useMemo,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { recordToast, toast } from "@/lib/toast";
import {
  ExternalLink,
  MoreVertical,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Download,
  Loader2,
  Globe,
  Play,
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
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  ColumnFilterValue,
  ColumnFiltersState,
  MatrxColumnDef,
  MatrxDataTableMobileCardControls,
  MatrxDataTableQueryState,
  MatrxDataTableRead,
} from "@ai-matrx/design-system/data-table/types";
import { useTopicContext, useStreamDebug } from "../../context/ResearchContext";
import {
  useResearchSources,
  useResearchKeywords,
  useSourceImportance,
  useResearchTags,
  useTopicSourceTags,
  useYouTubeVideoIndex,
} from "../../hooks/useResearchState";
import { VideoSourceMeta } from "../shared/VideoSourceMeta";
import { SocialSourceSignal } from "../shared/SocialSourceSignal";
import { sourceRowMode } from "../../utils/socialSource";
import { SocialOpenPost } from "../shared/SocialOpenPost";
import type { YouTubeVideoIdentity } from "../../service";
import { useResearchApi } from "../../hooks/useResearchApi";
import { useResearchStream } from "../../hooks/useResearchStream";
import {
  bulkUpdateSources,
  updateSource,
  addTagToSources,
  createTag,
} from "../../service";
import { useSourceFilters } from "../../hooks/useSourceFilters";
import { SourceFilters } from "./SourceFilters";
import { BulkActionBar } from "./BulkActionBar";
import { SourceTagsInline } from "./SourceTagsInline";
import { AuthorityRankButton } from "./AuthorityRankButton";
import { AuthorityExportButton } from "./AuthorityExportButton";
import { CondensedAuthorityExportButton } from "./CondensedAuthorityExportButton";
import { AuthorityTierBadge } from "./AuthorityTierBadge";
import { RedundancyGroupBadge } from "./RedundancyGroupBadge";
import { ScrapeWorthinessFlag } from "./ScrapeWorthinessFlag";
import {
  ScoreCell,
  PriorityCell,
  sourceScoreValues,
  compareSourcesByPriority,
  QUALITY_SCORE_LABEL,
  PRIORITY_SCORE_LABEL,
  POST_READ_SCORE_LABEL,
  AUTH_SCORE_LABEL,
  collectPriorityDisplayScores,
  formatSourceScoreCoverage,
  preReadDisplayScore,
  priorityScoreTone,
} from "./sourceScoreDisplay";
import { TextInputDialog } from "@ai-matrx/design-system";
import type { ResearchTag } from "../../types";
import { StatusBadge } from "../shared/StatusBadge";
import { SourceTypeIcon } from "../shared/SourceTypeIcon";
import { OriginBadge } from "../shared/OriginBadge";
import type {
  ResearchSource,
  SourceFilters as SourceFilterValues,
  BulkAction,
  SourceSortBy,
  SortDir,
} from "../../types";
import type { SourceImportance } from "../../ranking";
import {
  sourceOriginFromDb,
  sourceTypeFromDb,
  stringArrayFromJson,
} from "../../types";
import {
  SCRAPE_STATUS_CONFIG,
  SOURCE_TYPE_CONFIG,
  ORIGIN_CONFIG,
  NEEDS_SCRAPE_STATUSES,
  authorityTier,
} from "../../constants";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";
import { setSourceNavOrder } from "../../utils/sourceNavOrder";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { researchTopicHubHref } from "@/features/knowledge/hub/legacyRoutes";

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

/**
 * Client-only sort axes for columns the server `SourceSortBy` type can't
 * express (they're derived or not indexed server-side). These sort the fetched
 * page locally — see `localSortComparator`. Prefixed so they never collide with
 * a real `SourceSortBy` value when both flow through the one sort state.
 *
 * `local:rank` deliberately REPLACES the server `rank` sort: the server field is
 * a per-keyword rank, so a site that ranks #1 for one keyword and #4 for another
 * sorts inconsistently (the column mixed 1,2,3 then 1,4,4). We sort instead by a
 * source's BEST (lowest) rank across ALL keywords — the same number the `#N`
 * badge already displays (`SourceImportance.bestRank`) — so the shown value and
 * the sort key are one consistent number.
 */
type LocalSortKey =
  | "local:rank"
  | "local:source_type"
  | "local:origin"
  | "local:authority_tier"
  | "local:tags";

/** Anything a column header can sort by — a server field or a local-only axis. */
type SortKey = SourceSortBy | LocalSortKey;

const LOCAL_SORT_KEYS = new Set<string>([
  "local:rank",
  "local:source_type",
  "local:origin",
  "local:authority_tier",
  "local:tags",
]);

function isLocalSortKey(key: string | undefined): key is LocalSortKey {
  return key != null && LOCAL_SORT_KEYS.has(key);
}

/** Tier rank for sorting (high → low when descending). */
const TIER_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

function tierFromSource(source: ResearchSource): string | null {
  return authorityTier(source.authority_tier, source.authority_score);
}

/**
 * The "Scrape" column shows the SCRAPE outcome (`scrape_status`). The raw values
 * (esp. "success" → "success at what?") are ambiguous, so we relabel each one to
 * say specifically what happened to the page. Kept local to this table (the
 * shared `StatusBadge` / `SCRAPE_STATUS_CONFIG` are consumed elsewhere and stay
 * untouched). `tone` drives a single restrained dot colour — no bright pills,
 * and a failure is amber/rose, never a loud kindergarten red.
 */
type ScrapeTone = "ok" | "warn" | "bad" | "muted";
const SCRAPE_OUTCOME: Record<string, { label: string; tone: ScrapeTone }> = {
  success: { label: "Read", tone: "ok" },
  complete: { label: "Read", tone: "ok" },
  manual: { label: "Added by hand", tone: "ok" },
  thin: { label: "Thin content", tone: "warn" },
  gated: { label: "Gated", tone: "warn" },
  pending: { label: "Pending", tone: "muted" },
  skipped: { label: "Skipped", tone: "muted" },
  ignored: { label: "Ignored", tone: "muted" },
  failed: { label: "Failed", tone: "bad" },
  dead_link: { label: "Dead link", tone: "bad" },
  content_mismatch: { label: "Wrong content", tone: "bad" },
};

const SCRAPE_TONE_DOT: Record<ScrapeTone, string> = {
  ok: "bg-emerald-500/80",
  warn: "bg-amber-500/80",
  bad: "bg-rose-500/80",
  muted: "bg-muted-foreground/50",
};

function scrapeOutcomeFor(status: string | null | undefined): {
  label: string;
  tone: ScrapeTone;
} {
  if (!status) return { label: "—", tone: "muted" };
  return SCRAPE_OUTCOME[status] ?? { label: status, tone: "muted" };
}

/** Restrained scrape-outcome cell: a muted semantic dot + a plain label that
 *  states exactly what happened to the page. Matches the data-console look. */
function ScrapeOutcomeCell({ status }: { status: string | null | undefined }) {
  const { label, tone } = scrapeOutcomeFor(status);
  return (
    <span className="inline-flex items-center gap-1.5 type-meta font-medium whitespace-nowrap text-muted-foreground">
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          SCRAPE_TONE_DOT[tone],
        )}
      />
      {label}
    </span>
  );
}

/**
 * The "Analysis" column shows the ANALYZE outcome — the per-page read. The state
 * is derived from the row itself (`page_analysis` + `analysis_status`), so it's
 * always truthful without a second fetch:
 *  - "Analyzed"     → a page_analysis exists, or analysis_status is a real
 *                     (non-error) classification. Quiet check, restrained blue.
 *  - "Failed"       → analysis_status is `error` / `invalid`. MUTED AMBER, never
 *                     red — a failed read is a soft warning, not an alarm.
 *  - "Not analyzed" → never analyzed (no page_analysis, null status). Muted dot.
 * Mirrors the Scrape column's restrained dot + plain-label look so the two read
 * as a matched pair.
 */
const ANALYSIS_FAILED_STATUSES = new Set(["error", "invalid"]);

type AnalysisState = "analyzed" | "failed" | "none";

function analysisStateFor(source: ResearchSource): AnalysisState {
  const status = source.analysis_status;
  if (status && ANALYSIS_FAILED_STATUSES.has(status)) return "failed";
  if (source.page_analysis != null) return "analyzed";
  if (status) return "analyzed";
  return "none";
}

function AnalysisOutcomeCell({ source }: { source: ResearchSource }) {
  const state = analysisStateFor(source);
  if (state === "analyzed") {
    return (
      <span className="inline-flex items-center gap-1.5 type-meta font-medium whitespace-nowrap text-muted-foreground">
        <CheckCircle2 className="h-3 w-3 shrink-0 text-blue-500/80" />
        Analyzed
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 type-meta font-medium whitespace-nowrap text-amber-600/90 dark:text-amber-400/90">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/80" />
        Failed
        <ErrorAlchemyMenu />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 type-meta font-medium whitespace-nowrap text-muted-foreground">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
      Not analyzed
    </span>
  );
}

/**
 * The always-visible inline action button shared by the Scrape + Analysis
 * columns — the two PRIMARY actions on this page. Restrained outline button,
 * matched sizing for both columns, with an in-flight spinner that also disables.
 * `[status] [▶ button]` is the matched pair; this is the button half.
 */
function ActionTrigger({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <Button
      icon={busy ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Play />
      )}
      variant="outline"
      disabled={busy || disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

/**
 * Comparator for the client-only sort axes. Returns a stable ordering with
 * un-set values pushed to the end regardless of direction (matches the
 * server's `nullsFirst: false` convention). `dir` is +1 asc / -1 desc.
 *
 * For `local:rank` the value is the source's BEST rank across all keywords, so
 * ascending puts #1 first and nulls (no rank) always sort last.
 */
function localSortComparator(
  key: LocalSortKey,
  dir: number,
  tagCountFor: (id: string) => number,
  bestRankFor: (id: string) => number | null,
): (a: ResearchSource, b: ResearchSource) => number {
  return (a, b) => {
    let av: string | number | null;
    let bv: string | number | null;
    switch (key) {
      case "local:rank":
        av = bestRankFor(a.id);
        bv = bestRankFor(b.id);
        break;
      case "local:source_type":
        av = a.source_type ?? null;
        bv = b.source_type ?? null;
        break;
      case "local:origin":
        av = a.origin ?? null;
        bv = b.origin ?? null;
        break;
      case "local:authority_tier":
        av = TIER_ORDER[tierFromSource(a) ?? ""] ?? null;
        bv = TIER_ORDER[tierFromSource(b) ?? ""] ?? null;
        break;
      case "local:tags":
        av = tagCountFor(a.id);
        bv = tagCountFor(b.id);
        break;
    }
    if (av === bv) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return av < bv ? -1 * dir : 1 * dir;
  };
}

/** Default table order when the user has not picked another sort axis. */
const DEFAULT_SORT: { key: SourceSortBy; dir: SortDir } = {
  key: "pre_read_score",
  dir: "desc",
};

/**
 * Research topics are bounded (tens to a few hundred sources), so we fetch the
 * WHOLE topic source set in one query and do all sorting, filtering, and
 * pagination CLIENT-SIDE. This eliminates the previous server-page-vs-client-
 * logic split, where client-only sort axes (`local:*`) and the authority tier
 * filter only saw the first server page (≤50 rows by `rank`) — silently lying
 * about the true top-authority sources beyond row 50. The server `sort_by` /
 * `filter` params still apply as the INITIAL fetch order, but because the full
 * set is now in hand, every sort axis and every filter is correct at any size.
 *
 * On the rare topic that exceeds this cap, the table shows an honest note so it
 * never silently truncates. Bump if real topics start to approach it.
 */
const FETCH_ALL_LIMIT = 1000;

/** The sort axis each sortable table column sorts by (and back). */
const SORT_KEY_BY_COLUMN: Record<string, SortKey> = {
  priority: "pre_read_score",
  source: "hostname",
  read: "scrape_status",
  best: "local:rank",
  quality: "final_source_score",
  auth: "authority_score",
  post: "post_read_score",
  age: "page_age",
  type: "local:source_type",
  origin: "local:origin",
};
const COLUMN_BY_SORT_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(SORT_KEY_BY_COLUMN).map(([column, key]) => [key, column]),
);

const PAGE_SIZE_CHOICES = [25, 50, 100, 200];

/** A single-choice select filter value, as the table's query state carries it. */
function selectFilter(value: string | null | undefined): ColumnFilterValue | undefined {
  return value ? { kind: "select", value, values: [value] } : undefined;
}

function selectedChoice(value: ColumnFilterValue | undefined): string | null {
  if (!value || value.kind !== "select") return null;
  return value.values?.[0] ?? (value.value || null);
}

/** The expanded detail under a row: authority reasoning + search snippets. */
function SourceExpandedDetail({ source }: { source: ResearchSource }) {
  const snippets = stringArrayFromJson(source.extra_snippets);
  const hasSnippets = snippets.length > 0;
  const hasReasoning = !!source.authority_reasoning;
  return (
    <div className="space-y-2.5 px-4 py-3">
      {hasReasoning && (
        <div>
          <div className="flex items-center gap-2">
            <span className="type-meta font-semibold uppercase tracking-wide text-muted-foreground">
              Authority reasoning
            </span>
            {tierFromSource(source) && (
              <AuthorityTierBadge
                score={source.authority_score}
                tier={source.authority_tier}
                reasoning={null}
              />
            )}
          </div>
          <p className="mt-1 type-secondary text-foreground/80 leading-relaxed">
            {source.authority_reasoning}
          </p>
        </div>
      )}
      {hasSnippets && (
        <div>
          <span className="type-meta font-semibold uppercase tracking-wide text-muted-foreground">
            Snippets
          </span>
          <div className="mt-1 space-y-1.5">
            {snippets.map((snippet, i) => (
              <p
                key={i}
                className="type-secondary text-foreground/70 leading-relaxed"
              >
                {snippet}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function canExpandSource(source: ResearchSource): boolean {
  return (
    stringArrayFromJson(source.extra_snippets).length > 0 ||
    !!source.authority_reasoning
  );
}

export default function SourceList() {
  const { topicId, topic, refresh } = useTopicContext();
  const api = useResearchApi();
  const debug = useStreamDebug();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  const { filters, setFilters, resetFilters, hasActiveFilters } =
    useSourceFilters();
  // Fetch the WHOLE topic source set in one query (offset 0, high cap) and do
  // all sort/filter/pagination client-side below. The user's server-side
  // `sort_by` / `filter` / `keyword_id` params still flow through as the
  // INITIAL fetch order — but every client axis now sees the complete set, so
  // it can't lie about rows past the old 50-row server page. `filters.limit`
  // is repurposed as the CLIENT page size (not the fetch size); `filters.offset`
  // as the CLIENT page position (see `pagedSources` / the table's pager below).
  const fetchFilters = useMemo(
    () => ({ ...filters, limit: FETCH_ALL_LIMIT, offset: 0 }),
    [filters],
  );
  const {
    data: sources,
    refresh: refetchSources,
    error: sourcesError,
    isLoading: sourcesLoading,
  } = useResearchSources(topicId, fetchFilters);
  // One batched read of the global video library for every YouTube row.
  const { identityFor: videoIdentityFor } = useYouTubeVideoIndex(sources ?? []);
  const stream = useResearchStream(() => {
    refetchSources();
    refresh();
  });
  // A SEPARATE stream for inline analyze runs, so analyzing one row never blocks
  // (or gets blocked by) a scrape on another — each column's action is its own
  // in-flight lane.
  const analyzeStream = useResearchStream(() => {
    refetchSources();
    refresh();
  });
  const { data: keywords } = useResearchKeywords(topicId);
  const { data: importanceMap } = useSourceImportance(topicId);
  const { data: tags, refresh: refetchTags } = useResearchTags(topicId);
  const { data: sourceTagMap, refresh: refetchSourceTags } =
    useTopicSourceTags(topicId);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [scrapingIds, setScrapingIds] = useState<Set<string>>(new Set());
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  // Shared "create tag" dialog target: a source id assigns the new tag to that
  // source; "__bulk__" assigns it to the whole current selection.
  const [createTagTarget, setCreateTagTarget] = useState<string | null>(null);
  const [creatingTag, setCreatingTag] = useState(false);

  // Client-only sort axis (source_type / origin / authority_tier / tags) — the
  // server `SourceSortBy` type can't carry these, so they sort the fetched set
  // locally. Mutually exclusive with the server sort: activating one clears the
  // other, so exactly one sort arrow is ever lit.
  const [localSort, setLocalSort] = useState<{
    key: LocalSortKey;
    dir: SortDir;
  } | null>(null);
  // Client-only Authority TIER header filter — there is no server column for
  // tier (it's derived from the score), so this narrows the fetched set.
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  // Filters the person set on columns the page itself does not own; the table
  // applies them to the loaded rows.
  const [otherFilters, setOtherFilters] = useState<ColumnFiltersState>({});

  const tagList = tags ?? [];
  const tagsBySource = sourceTagMap ?? {};
  const tagCountFor = useCallback(
    (id: string) => tagsBySource[id]?.length ?? 0,
    [tagsBySource],
  );
  // A source's BEST rank across all keywords — the same number the `#N` badge
  // shows. Used as the `#` column's sort key so the displayed value and the
  // sort are one consistent number (not the inconsistent per-keyword server rank).
  const bestRankFor = useCallback(
    (id: string) => importanceMap?.get(id)?.bestRank ?? null,
    [importanceMap],
  );

  // The COMPLETE topic source set (capped at FETCH_ALL_LIMIT), already carrying
  // any server-side filter + sort the user picked.
  const allSources = sources ?? [];
  // True only when the topic genuinely exceeds the fetch cap — used to show an
  // honest "showing first N" note so the table never silently truncates.
  const fetchCapped = allSources.length >= FETCH_ALL_LIMIT;

  // `sourceList` = the fully-processed FULL set: search + tier filter + local
  // sort applied over EVERY fetched row (not a server page). This is what all
  // totals, the count, the hostname facet, and the pager are derived from — so
  // "sort by tier" / "filter Tier=high" are correct across the whole topic.
  const sourceList = useMemo(() => {
    // 1. Search relevance filtering/ordering (when a query is present).
    let list = search
      ? filterAndSortBySearch(allSources, search, [
          { get: (s) => s.title, weight: "title" },
          { get: (s) => s.hostname, weight: "subtitle" },
          { get: (s) => s.url, weight: "subtitle" },
          { get: (s) => s.description, weight: "body" },
          { get: (s) => s.origin, weight: "meta" },
          { get: (s) => s.source_type, weight: "meta" },
        ])
      : allSources;

    // 2. Client-only Authority TIER header filter (no server column for tier) —
    //    now over the FULL set, so it surfaces every high/medium/low source.
    if (tierFilter) {
      list = list.filter((s) => tierFromSource(s) === tierFilter);
    }

    // 3. Default: Priority descending (then synthesis tiebreakers).
    if (!localSort && !filters.sort_by) {
      list = [...list].sort(compareSourcesByPriority);
    } else if (localSort) {
      const dir = localSort.dir === "desc" ? -1 : 1;
      list = [...list].sort(
        localSortComparator(localSort.key, dir, tagCountFor, bestRankFor),
      );
    }
    return list;
  }, [allSources, search, tierFilter, localSort, tagCountFor, bestRankFor]);

  const topicPriorityScores = useMemo(
    () => collectPriorityDisplayScores(sourceList),
    [sourceList],
  );

  // Client-side pagination: `filters.limit` is the page size and
  // `filters.offset` the page position (both from the URL). We clamp the offset
  // so a filter that shrinks the list can never strand the user on an empty
  // page past the new end.
  const pageSize = filters.limit;
  const totalCount = sourceList.length;
  const maxOffset =
    totalCount === 0 ? 0 : Math.floor((totalCount - 1) / pageSize) * pageSize;
  const pageOffset = Math.min(filters.offset, maxOffset);
  const pageNumber = Math.floor(pageOffset / pageSize) + 1;
  const pageSizeOptions = useMemo(
    () => [...new Set([...PAGE_SIZE_CHOICES, pageSize])].sort((a, b) => a - b),
    [pageSize],
  );

  // Hostname facet reflects the WHOLE processed set, not just the visible page.
  const hostnames = useMemo(
    () =>
      [
        ...new Set(
          sourceList.map((s) => s.hostname).filter(Boolean) as string[],
        ),
      ].sort(),
    [sourceList],
  );

  // Publish the user's EXACT displayed order (full sorted + filtered set, pre-
  // pagination) so the source DETAIL view's prev/next walks the same order the
  // user is looking at — not the raw fetch order. The table reports its whole
  // processed view (including filters it applied itself) on every change.
  const publishViewOrder = useCallback(
    (rows: ResearchSource[]) => {
      setSourceNavOrder(
        topicId,
        rows.map((s) => s.id),
      );
    },
    [topicId],
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

  // Unified "what is currently sorted" — either the server filter sort, a local
  // sort, or the default Priority descending.
  const activeSort: SortKey | undefined =
    localSort?.key ?? filters.sort_by ?? DEFAULT_SORT.key;
  const activeDir: SortDir | undefined = localSort
    ? localSort.dir
    : (filters.sort_dir ?? DEFAULT_SORT.dir);

  // The table's whole query state, owned here: the page position and size and
  // the server filters live in the address, the rest in this component.
  const tableColumnFilters: ColumnFiltersState = {
    ...otherFilters,
    read: selectFilter(filters.scrape_status),
    type: selectFilter(filters.source_type),
    origin: selectFilter(filters.origin),
    auth: selectFilter(tierFilter),
  };
  const tableState: MatrxDataTableQueryState = {
    page: pageNumber,
    pageSize,
    search,
    anyOf: "",
    columnFilters: tableColumnFilters,
    sort:
      activeSort && COLUMN_BY_SORT_KEY[activeSort]
        ? { id: COLUMN_BY_SORT_KEY[activeSort], direction: activeDir ?? "asc" }
        : null,
  };

  const handleTableState = (next: MatrxDataTableQueryState) => {
    const updates: Partial<SourceFilterValues> = {};
    let queryChanged = false;

    if (next.search !== search) {
      setSearch(next.search);
      queryChanged = true;
    }

    // Header filters the page owns: scrape status / type / origin ride the
    // address (and refetch), the authority tier is held here.
    const scrape = selectedChoice(next.columnFilters.read);
    if (scrape !== (filters.scrape_status ?? null)) {
      updates.scrape_status = (scrape ?? undefined) as SourceFilterValues["scrape_status"];
    }
    const type = selectedChoice(next.columnFilters.type);
    if (type !== (filters.source_type ?? null)) {
      updates.source_type = (type ?? undefined) as SourceFilterValues["source_type"];
    }
    const origin = selectedChoice(next.columnFilters.origin);
    if (origin !== (filters.origin ?? null)) {
      updates.origin = (origin ?? undefined) as SourceFilterValues["origin"];
    }
    const tier = selectedChoice(next.columnFilters.auth);
    if (tier !== tierFilter) {
      setTierFilter(tier);
      queryChanged = true;
    }
    const rest: ColumnFiltersState = {};
    for (const [id, value] of Object.entries(next.columnFilters)) {
      if (value && !["read", "type", "origin", "auth"].includes(id)) {
        rest[id] = value;
      }
    }
    if (JSON.stringify(rest) !== JSON.stringify(otherFilters)) {
      setOtherFilters(rest);
      queryChanged = true;
    }

    // Sort: a server axis rides the address, a client-only axis is held here;
    // only one of the two is ever active.
    const nextKey = next.sort ? SORT_KEY_BY_COLUMN[next.sort.id] : undefined;
    const nextDir: SortDir = next.sort?.direction === "desc" ? "desc" : "asc";
    const sortChanged =
      nextKey !== activeSort ||
      (nextKey !== undefined && nextDir !== (activeDir ?? "asc"));
    if (sortChanged) {
      if (!nextKey) {
        setLocalSort(null);
        if (filters.sort_by) {
          updates.sort_by = undefined;
          updates.sort_dir = undefined;
        }
      } else if (isLocalSortKey(nextKey)) {
        setLocalSort({ key: nextKey, dir: nextDir });
        if (filters.sort_by) {
          updates.sort_by = undefined;
          updates.sort_dir = undefined;
        }
      } else {
        if (localSort) setLocalSort(null);
        updates.sort_by = nextKey;
        updates.sort_dir = nextDir;
      }
      queryChanged = true;
    }

    // Paging: a changed query lands on page 1; otherwise follow the pager.
    if (next.pageSize !== pageSize) {
      updates.limit = next.pageSize;
      updates.offset = 0;
    } else if (queryChanged) {
      if (filters.offset !== 0) updates.offset = 0;
    } else if (next.page !== pageNumber) {
      updates.offset = (next.page - 1) * pageSize;
    }

    if (Object.keys(updates).length > 0) setFilters(updates);
  };

  const handleBulk = useCallback(
    async (action: BulkAction) => {
      await bulkUpdateSources(topicId, { source_ids: [...selected], action });
      setSelected(new Set());
      refetchSources();
      refresh();
    },
    [topicId, selected, refetchSources, refresh],
  );

  const refreshTagState = useCallback(() => {
    refetchSourceTags();
    refetchTags();
  }, [refetchSourceTags, refetchTags]);

  const handleBatchAddTag = useCallback(
    async (tagId: string) => {
      if (selected.size === 0) return;
      setTagBusy(true);
      try {
        await addTagToSources(tagId, [...selected]);
        const name = tagList.find((t) => t.id === tagId)?.name ?? "tag";
        recordToast.success(
          { type: "research_tag", id: tagId, title: name },
          `Tagged ${selected.size} source(s) with "${name}"`,
        );
        refreshTagState();
      } catch (err) {
        toast.error(
          `Tagging failed: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      } finally {
        setTagBusy(false);
      }
    },
    [selected, tagList, refreshTagState],
  );

  const handleCreateTag = useCallback(
    async (name: string) => {
      const target = createTagTarget;
      if (!target) return;
      setCreatingTag(true);
      try {
        const tag = await createTag(topicId, { name });
        const sourceIds = target === "__bulk__" ? [...selected] : [target];
        await addTagToSources(tag.id, sourceIds);
        recordToast.success(
          { type: "research_tag", id: tag.id, title: tag.name },
          `Created "${tag.name}" · tagged ${sourceIds.length} source(s)`,
        );
        setCreateTagTarget(null);
        refreshTagState();
      } catch (err) {
        toast.error(
          `Couldn't create tag: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      } finally {
        setCreatingTag(false);
      }
    },
    [createTagTarget, topicId, selected, refreshTagState],
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
        toast.error("Couldn't start reading. Please try again.");
        setScrapingIds((prev) => {
          const next = new Set(prev);
          next.delete(source.id);
          return next;
        });
      }
    },
    [api, topicId, stream, refetchSources, debug],
  );

  // Inline ANALYZE — the matched twin of handleScrapeSource. Mark the row busy,
  // POST the streaming analyze endpoint, drain/ignore the stream body, then
  // refetch the source so its new analysis_status / page_analysis lands in the
  // Analysis column. Toast + clear-busy on failure so the spinner never sticks.
  const handleAnalyzeSource = useCallback(
    async (source: ResearchSource, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (analyzeStream.isStreaming) return;
      setAnalyzingIds((prev) => new Set(prev).add(source.id));
      try {
        const response = await api.analyzeSource(topicId, source.id);
        analyzeStream.startStream(response, {
          onEnd: () => {
            refetchSources();
            setAnalyzingIds((prev) => {
              const next = new Set(prev);
              next.delete(source.id);
              return next;
            });
          },
        });
        debug.pushEvents(analyzeStream.rawEvents, `analyze-${source.id}`);
      } catch {
        toast.error("Couldn't start the analysis. Please try again.");
        setAnalyzingIds((prev) => {
          const next = new Set(prev);
          next.delete(source.id);
          return next;
        });
      }
    },
    [api, topicId, analyzeStream, refetchSources, debug],
  );

  const anyNavigating = isPending || navigatingId !== null;

  // Per-column header filter options (mirror the top SourceFilters bar configs).
  // The Scrape filter uses the SAME clear "what happened" labels as the cells
  // (`scrapeOutcomeFor`) so the dropdown and the column read identically — e.g.
  // the option is "Read", not the ambiguous raw "Success".
  const statusFilterOptions = useMemo(
    () =>
      Object.keys(SCRAPE_STATUS_CONFIG).map((id) => ({
        value: id,
        label: scrapeOutcomeFor(id).label,
      })),
    [],
  );
  const typeFilterOptions = useMemo(
    () =>
      Object.entries(SOURCE_TYPE_CONFIG).map(([id, cfg]) => ({
        value: id,
        label: cfg.label,
      })),
    [],
  );
  const originFilterOptions = useMemo(
    () =>
      Object.entries(ORIGIN_CONFIG).map(([id, cfg]) => ({
        value: id,
        label: cfg.label,
      })),
    [],
  );
  const tierFilterOptions = [
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];

  // The top bar's "reset" must also clear the local tier filter + local sort.
  const anyFilterActive = hasActiveFilters || tierFilter != null;
  const resetAllFilters = useCallback(() => {
    setTierFilter(null);
    setLocalSort(null);
    setOtherFilters({});
    resetFilters();
  }, [resetFilters]);

  const sourceHref = (id: string) => `/research/topics/${topicId}/sources/${id}`;

  const columns: MatrxColumnDef<ResearchSource>[] = [
    {
      id: "include",
      header: "Include",
      label: "Include",
      width: 84,
      align: "center",
      sortable: false,
      accessorFn: (s) => Boolean(s.is_included),
      filter: "boolean",
      cell: (s) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={s.is_included ?? false}
            onCheckedChange={() => handleToggleInclude(s)}
            disabled={anyNavigating}
          />
        </div>
      ),
    },
    {
      id: "priority",
      header: PRIORITY_SCORE_LABEL,
      label: PRIORITY_SCORE_LABEL,
      width: 84,
      align: "center",
      accessorFn: (s) =>
        sourceRowMode(s) === "captured" ? null : preReadDisplayScore(s),
      cell: (s) =>
        sourceRowMode(s) === "captured" ? null : (
          <PriorityCell source={s} topicScores={topicPriorityScores} />
        ),
    },
    {
      id: "thumbnail",
      header: "",
      label: "Thumbnail",
      width: 76,
      sortable: false,
      filter: false,
      accessorFn: (s) => s.thumbnail_url ?? null,
      copyValue: (s) => s.thumbnail_url ?? null,
      cell: (s) => {
        const thumb = s.thumbnail_url ?? videoIdentityFor(s)?.thumbnail_url;
        return (
          <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
            {thumb ? (
              <Image
                src={thumb}
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
        );
      },
    },
    {
      id: "source",
      header: "Source",
      label: "Source",
      width: 420,
      minWidth: 240,
      accessorFn: (s) => s.title || s.url,
      filterValue: (s) =>
        [s.title, s.url, s.hostname, s.description].filter(Boolean).join(" "),
      cell: (s) => {
        const assigned = tagsBySource[s.id] ?? [];
        const video = videoIdentityFor(s);
        return (
          <div className="min-w-0 overflow-hidden py-1">
            {/* The title is a real anchor, so this row is cmd/middle-clickable
                into a new tab and keyboard-reachable. */}
            <Link
              href={sourceHref(s.id)}
              onClick={(e) => {
                e.stopPropagation();
                if (!anyNavigating) handleNavigate(s.id, e);
              }}
              className="block type-title leading-snug line-clamp-2 break-words hover:text-primary transition-colors"
            >
              {s.title || s.url}
            </Link>
            {/* The page this row is ABOUT — the outbound door. */}
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`Open ${s.url} in a new tab`}
              className="mt-0.5 block type-secondary text-muted-foreground break-all line-clamp-1 hover:text-foreground "
            >
              {s.url}
            </a>
            {s.description && (
              <div className="type-secondary text-muted-foreground/80 mt-0.5 line-clamp-2 leading-relaxed break-words">
                {s.description}
              </div>
            )}
            {(s.hostname || s.redundancy_group) && (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                {s.hostname && (
                  <span className="type-meta text-muted-foreground truncate max-w-48 inline-block">
                    {s.hostname}
                  </span>
                )}
                <RedundancyGroupBadge group={s.redundancy_group} />
              </div>
            )}
            {video && <VideoSourceMeta identity={video} className="mt-1" />}
            <SocialSourceSignal source={s} className="mt-1.5" />
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              <SourceTagsInline
                sourceId={s.id}
                assigned={assigned}
                tags={tagList}
                onChanged={refreshTagState}
                onCreateTag={(id) => setCreateTagTarget(id)}
              />
            </div>
          </div>
        );
      },
    },
    {
      id: "read",
      header: "Read",
      label: "Read",
      width: 150,
      accessorFn: (s) => s.scrape_status,
      copyValue: (s) => scrapeOutcomeFor(s.scrape_status).label,
      filter: "select",
      filterSingle: true,
      filterOptions: statusFilterOptions,
      cell: (s) => {
        const needsScrape = NEEDS_SCRAPE_STATUSES.has(s.scrape_status);
        return (
          <div onClick={(e) => e.stopPropagation()}>
            {sourceRowMode(s) === "captured" ? (
              <SocialOpenPost url={s.url} />
            ) : (
              <div className="flex flex-col items-start gap-1.5">
                <ScrapeOutcomeCell status={s.scrape_status} />
                <ScrapeWorthinessFlag scrapeWorthiness={s.scrape_worthiness} />
                <ActionTrigger
                  label={needsScrape ? "Read" : "Re-read"}
                  busy={scrapingIds.has(s.id)}
                  disabled={anyNavigating}
                  onClick={(e) => handleScrapeSource(s, e)}
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: "analysis",
      header: "Analysis",
      label: "Analysis",
      width: 150,
      sortable: false,
      accessorFn: (s) => analysisStateFor(s),
      copyValue: (s) =>
        ({ analyzed: "Analyzed", failed: "Failed", none: "Not analyzed" })[
          analysisStateFor(s)
        ],
      filter: "select",
      filterOptions: [
        { value: "analyzed", label: "Analyzed" },
        { value: "failed", label: "Failed" },
        { value: "none", label: "Not analyzed" },
      ],
      cell: (s) => (
        <div
          className="flex flex-col items-start gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {analyzingIds.has(s.id) ? (
            <span className="inline-flex items-center gap-1.5 type-meta font-medium whitespace-nowrap text-muted-foreground">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500/80" />
              Analyzing…
            </span>
          ) : (
            <AnalysisOutcomeCell source={s} />
          )}
          <ActionTrigger
            label={analysisStateFor(s) === "none" ? "Analyze" : "Re-analyze"}
            busy={analyzingIds.has(s.id)}
            disabled={anyNavigating}
            onClick={(e) => handleAnalyzeSource(s, e)}
          />
        </div>
      ),
    },
    {
      id: "best",
      header: "Best",
      label: "Best",
      width: 72,
      align: "right",
      accessorFn: (s) => bestRankFor(s.id),
      copyValue: (s) => bestRankFor(s.id),
      cell: (s) => {
        const importance = importanceMap?.get(s.id);
        return (
          <span
            title={
              importance
                ? `importance ${importance.score} · ${importance.keywordCount} keyword${importance.keywordCount === 1 ? "" : "s"}`
                : undefined
            }
          >
            <ScoreCell
              value={sourceScoreValues(s, importance?.bestRank ?? null).best}
            />
          </span>
        );
      },
    },
    {
      id: "quality",
      header: QUALITY_SCORE_LABEL,
      label: QUALITY_SCORE_LABEL,
      width: 84,
      align: "right",
      accessorFn: (s) => s.final_source_score,
      cell: (s) => (
        <ScoreCell
          value={sourceScoreValues(s).quality}
          title="Final quality after page read (85% post-read + 15% priority)"
        />
      ),
    },
    {
      id: "auth",
      header: AUTH_SCORE_LABEL,
      label: AUTH_SCORE_LABEL,
      width: 84,
      align: "right",
      accessorFn: (s) => s.authority_score,
      filterValue: (s) => tierFromSource(s),
      filter: "select",
      filterSingle: true,
      filterOptions: tierFilterOptions,
      cell: (s) => (
        <ScoreCell
          value={sourceScoreValues(s).auth}
          title="Authority from search metadata (before page read)"
        />
      ),
    },
    {
      id: "post",
      header: POST_READ_SCORE_LABEL,
      label: POST_READ_SCORE_LABEL,
      width: 72,
      align: "right",
      accessorFn: (s) => s.post_read_score,
      cell: (s) => (
        <ScoreCell
          value={sourceScoreValues(s).post}
          title="Post-read page value (after analyze, before final blend)"
        />
      ),
    },
    {
      id: "age",
      header: "Age",
      label: "Age",
      width: 88,
      accessorFn: (s) => s.page_age,
      copyValue: (s) => formatPageAge(s.page_age).display,
      filter: "text",
      cell: (s) => (
        <span className="type-meta text-muted-foreground whitespace-nowrap">
          {formatPageAge(s.page_age).display}
        </span>
      ),
    },
    {
      id: "type",
      header: "Type",
      label: "Type",
      width: 84,
      align: "center",
      accessorFn: (s) => s.source_type,
      copyValue: (s) => SOURCE_TYPE_CONFIG[sourceTypeFromDb(s.source_type)].label,
      filter: "select",
      filterSingle: true,
      filterOptions: typeFilterOptions,
      cell: (s) => (
        <div
          className="flex items-center justify-center opacity-70"
          title={SOURCE_TYPE_CONFIG[sourceTypeFromDb(s.source_type)].label}
        >
          <SourceTypeIcon
            type={sourceTypeFromDb(s.source_type)}
            size={14}
            className="text-muted-foreground"
          />
        </div>
      ),
    },
    {
      id: "origin",
      header: "Origin",
      label: "Origin",
      width: 104,
      accessorFn: (s) => s.origin,
      copyValue: (s) => ORIGIN_CONFIG[sourceOriginFromDb(s.origin)].label,
      filter: "select",
      filterSingle: true,
      filterOptions: originFilterOptions,
      cell: (s) => (
        <div className="opacity-70">
          <OriginBadge origin={sourceOriginFromDb(s.origin)} />
        </div>
      ),
    },
    {
      id: "url",
      header: "URL",
      label: "URL",
      hidden: true,
      sortable: false,
      accessorKey: "url",
    },
    {
      id: "hostname",
      header: "Host",
      label: "Host",
      hidden: true,
      sortable: false,
      accessorKey: "hostname",
    },
    {
      id: "description",
      header: "Description",
      label: "Description",
      hidden: true,
      sortable: false,
      accessorKey: "description",
    },
    {
      id: "rowmenu",
      header: "",
      label: "Row menu",
      width: 64,
      align: "center",
      sortable: false,
      filter: false,
      copyValue: () => undefined,
      cell: (s) => {
        const needsScrape = NEEDS_SCRAPE_STATUSES.has(s.scrape_status);
        return (
          <div
            className="flex flex-col items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {navigatingId === s.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    icon={<MoreVertical />}
                    aria-label="More actions"
                    variant="quiet"
                    disabled={anyNavigating}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) {
                        window.open(sourceHref(s.id), "_blank");
                        return;
                      }
                      handleNavigate(s.id);
                    }}
                  >
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => window.open(s.url, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open URL
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleToggleInclude(s)}>
                    {s.is_included ? "Exclude" : "Include"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => handleScrapeSource(s, e)}>
                    <Download className="h-4 w-4 mr-2" />
                    {needsScrape ? "Read" : "Re-read"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => handleAnalyzeSource(s, e)}>
                    <Play className="h-4 w-4 mr-2" />
                    {analysisStateFor(s) === "none" ? "Analyze" : "Re-analyze"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      updateSource(s.id, { scrape_status: "complete" })
                    }
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark Complete
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => updateSource(s.id, { is_stale: true })}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Mark Stale
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      },
    },
  ];

  // The phone card: the same record, the same actions, one column. The table
  // owns selection and the copy controls; the card places them.
  const renderMobileCard = (
    source: ResearchSource,
    controls: MatrxDataTableMobileCardControls,
  ) => {
    const isNavigating = navigatingId === source.id;
    const needsScrape = NEEDS_SCRAPE_STATUSES.has(source.scrape_status);
    const imp = importanceMap?.get(source.id);
    const scores = sourceScoreValues(source, imp?.bestRank ?? null);
    const video = videoIdentityFor(source);
    return (
      <Link
        href={sourceHref(source.id)}
        onClick={(e) => !anyNavigating && handleNavigate(source.id, e)}
        className={cn(
          "rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden transition-colors relative block",
          !source.is_included && "opacity-50",
          isNavigating && "bg-muted/60",
          anyNavigating && !isNavigating && "opacity-70",
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
              className="absolute top-1.5 left-1.5 type-meta font-mono font-bold bg-black/60 text-white px-1.5 py-0.5 rounded-md tabular-nums"
              title={`importance ${imp.score} · ${imp.keywordCount} keyword(s)`}
            >
              #{imp.bestRank}
            </span>
          )}
          {/* Checkbox overlay */}
          <div
            className="absolute top-1.5 right-1.5"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <Checkbox
              checked={controls.selected}
              onCheckedChange={(v) => controls.onSelectedChange(v === true)}
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
              <div className="type-title leading-snug line-clamp-2 break-words">
                {source.title || source.url}
              </div>
              <div className="type-meta text-muted-foreground truncate mt-0.5">
                {source.hostname}
              </div>
              {video && <VideoSourceMeta identity={video} className="mt-0.5" />}
              <SocialSourceSignal source={source} className="mt-1" />
            </div>
            <Switch
              checked={source.is_included ?? false}
              onCheckedChange={() => handleToggleInclude(source)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 mt-0.5"
              disabled={anyNavigating}
            />
          </div>

          {source.description && (
            <div className="type-secondary text-muted-foreground/70 line-clamp-2 leading-relaxed">
              {source.description}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap type-meta tabular-nums text-muted-foreground">
            {sourceRowMode(source) === "pipeline" && (
              <span className="type-body font-bold tabular-nums">
                {PRIORITY_SCORE_LABEL}{" "}
                <span
                  className={
                    priorityScoreTone(
                      preReadDisplayScore(source),
                      topicPriorityScores,
                    ).text
                  }
                >
                  {scores.priority}
                </span>
              </span>
            )}
            <span>Best {scores.best}</span>
            <span>
              {QUALITY_SCORE_LABEL} {scores.quality}
            </span>
            <span>
              {AUTH_SCORE_LABEL} {scores.auth}
            </span>
            <span>
              {POST_READ_SCORE_LABEL} {scores.post}
            </span>
          </div>

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
              <span className="type-meta text-muted-foreground">
                {formatPageAge(source.page_age).display}
              </span>
            )}
          </div>

          {/* Primary actions — always-visible Scrape + Analyze, the same
              matched pair as the desktop columns, so the core workflow is
              reachable on mobile too (not buried). */}
          <div
            className="flex items-center gap-1.5"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {sourceRowMode(source) === "captured" ? (
              <SocialOpenPost url={source.url} />
            ) : (
              <ActionTrigger
                label={needsScrape ? "Read" : "Re-read"}
                busy={scrapingIds.has(source.id)}
                disabled={anyNavigating}
                onClick={(e) => handleScrapeSource(source, e)}
              />
            )}
            <ActionTrigger
              label={
                analysisStateFor(source) === "none" ? "Analyze" : "Re-analyze"
              }
              busy={analyzingIds.has(source.id)}
              disabled={anyNavigating}
              onClick={(e) => handleAnalyzeSource(source, e)}
            />
            {controls.actions}
          </div>

          {/* Tags */}
          <div
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <SourceTagsInline
              sourceId={source.id}
              assigned={tagsBySource[source.id] ?? []}
              tags={tagList}
              onChanged={refreshTagState}
              onCreateTag={(id) => setCreateTagTarget(id)}
            />
          </div>
        </div>
      </Link>
    );
  };

  const tableRead: MatrxDataTableRead = sourcesError
    ? {
        status: "error",
        error: sourcesError,
        onRetry: refetchSources,
        what: "this topic's sources",
      }
    : { status: sourcesLoading && !sources ? "loading" : "ready" };

  return (
    <div className="p-3 sm:p-4 space-y-3 overflow-x-hidden">
      <SourceFilters
        filters={filters}
        onFilterChange={setFilters}
        onReset={resetAllFilters}
        hasActiveFilters={anyFilterActive}
        keywords={(keywords as import("../../types").ResearchKeyword[]) ?? []}
        hostnames={hostnames}
        count={formatSourceScoreCoverage(sourceList)}
        trailing={
          <div className="flex items-center gap-2">
            {/* Finding this topic's captured pages across everything else you know is the
                Knowledge hub's job (KNOWLEDGE-HUB §6, H6b); triage, ranking and export stay here. */}
            <Link
              href={researchTopicHubHref(topicId)}
              className="hidden whitespace-nowrap type-secondary text-muted-foreground underline-offset-2 hover:text-foreground hover:underline sm:inline"
              title="This topic's captured pages in the Knowledge hub, beside everything else you know"
            >
              Find in Knowledge
            </Link>
            <AuthorityRankButton topicId={topicId} onRanked={refetchSources} />
            <AuthorityExportButton
              topicId={topicId}
              topicName={topic?.name ?? null}
            />
            <CondensedAuthorityExportButton
              topicId={topicId}
              topicName={topic?.name ?? null}
            />
          </div>
        }
      />

      <MatrxDataTable<ResearchSource>
        tableId={`research/topic-sources/${topicId}`}
        data={sourceList}
        columns={columns}
        getRowId={(s) => s.id}
        viewTabs={false}
        detail={{ enabled: false }}
        isLoading={sourcesLoading && !sources}
        isFetching={sourcesLoading && !!sources}
        read={tableRead}
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        fitToWidth="grow"
        rowHeight={124}
        query={{
          mode: "controlled-local",
          state: tableState,
          onStateChange: handleTableState,
          sourceProcessing: {
            search: "source",
            sort: "source",
            columnFilters: { source: ["read", "type", "origin", "auth"] },
          },
        }}
        toolbar={{ searchPlaceholder: "Search sources" }}
        onViewChange={publishViewOrder}
        onRowOpen={(s) => {
          if (!anyNavigating) handleNavigate(s.id);
        }}
        getRowHref={(s) => sourceHref(s.id)}
        rowClassName={(s) =>
          cn(
            !s.is_included && "opacity-50",
            navigatingId === s.id && "bg-muted/60",
            anyNavigating && navigatingId !== s.id && "opacity-70",
          )
        }
        rowVersion={(s) => [
          scrapingIds.has(s.id),
          analyzingIds.has(s.id),
          navigatingId === s.id,
          anyNavigating,
          tagsBySource[s.id],
          tagList,
          importanceMap?.get(s.id),
          videoIdentityFor(s),
          topicPriorityScores,
          expandedIds.has(s.id),
        ]}
        expandedDetail={{
          expandedIds,
          onExpandedIdsChange: setExpandedIds,
          canExpand: canExpandSource,
          render: (s) => <SourceExpandedDetail source={s} />,
        }}
        selection={{
          selectedIds: [...selected],
          onSelectedIdsChange: (ids) => setSelected(new Set(ids)),
          noun: "source",
          actions: () => (
            <BulkActionBar
              tags={tagList}
              onInclude={() => handleBulk("include")}
              onExclude={() => handleBulk("exclude")}
              onMarkStale={() => handleBulk("mark_stale")}
              onMarkComplete={() => handleBulk("mark_complete")}
              onAddTag={handleBatchAddTag}
              onCreateTag={() => setCreateTagTarget("__bulk__")}
              busy={tagBusy}
            />
          ),
        }}
        mobileCards={(s, _index, controls) => renderMobileCard(s, controls)}
        mobileCardsBreakpoint="sm"
        emptyState={{
          title: "No sources found. Run a search to discover sources.",
        }}
      />

      {/* Honest truncation note — only when the topic genuinely exceeds the
          fetch cap, so the table never silently lies about its real size. */}
      {fetchCapped && (
        <div className="flex items-center justify-center pt-1">
          <span className="type-meta text-muted-foreground">
            Showing first {FETCH_ALL_LIMIT.toLocaleString()} sources of this
            topic.
          </span>
        </div>
      )}

      <TextInputDialog
        open={createTagTarget !== null}
        onOpenChange={(o) => !creatingTag && !o && setCreateTagTarget(null)}
        title="New tag dimension"
        // read-gate-exempt: how many sources the person has selected (selection state), not a count from a read
        description={
          createTagTarget === "__bulk__"
            ? `Create a tag and assign the ${selected.size} selected source(s) to it.`
            : "Create a tag and assign this source to it."
        }
        placeholder="e.g. Economic Impact"
        confirmLabel="Create & tag"
        busy={creatingTag}
        onConfirm={handleCreateTag}
      />
    </div>
  );
}

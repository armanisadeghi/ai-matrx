"use client";

import {
  useState,
  useCallback,
  useMemo,
  useTransition,
  useEffect,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { useTopicContext, useStreamDebug } from "../../context/ResearchContext";
import {
  useResearchSources,
  useResearchKeywords,
  useSourceImportance,
  useResearchTags,
  useTopicSourceTags,
} from "../../hooks/useResearchState";
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
import { AuthorityTierBadge } from "./AuthorityTierBadge";
import { SourceVerdictBadge } from "./SourceVerdictBadge";
import { ColumnFilterMenu, type ColumnFilterOption } from "./ColumnFilterMenu";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import type { ResearchTag } from "../../types";
import { StatusBadge } from "../shared/StatusBadge";
import { SourceTypeIcon } from "../shared/SourceTypeIcon";
import { OriginBadge } from "../shared/OriginBadge";
import type {
  ResearchSource,
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
} from "../../constants";
import { filterAndSortBySearch } from "@/utils/search-scoring";
import { setSourceNavOrder } from "../../utils/sourceNavOrder";

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
  const t = (source.authority_tier ?? "").toLowerCase();
  if (t === "high" || t === "medium" || t === "low") return t;
  if (source.authority_score == null) return null;
  if (source.authority_score >= 75) return "high";
  if (source.authority_score >= 45) return "medium";
  return "low";
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
  success: { label: "Scraped", tone: "ok" },
  complete: { label: "Scraped", tone: "ok" },
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
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", SCRAPE_TONE_DOT[tone])}
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
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
        <CheckCircle2 className="h-3 w-3 shrink-0 text-blue-500/80" />
        Analyzed
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap text-amber-600/90 dark:text-amber-400/90">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/80" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
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
      variant="outline"
      size="sm"
      className="h-6 px-1.5 gap-1 text-[10px] font-medium"
      disabled={busy || disabled}
      onClick={onClick}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Play className="h-2.5 w-2.5" />
      )}
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

function SortHeader({
  label,
  field,
  currentSort,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  field: SortKey;
  currentSort?: SortKey;
  currentDir?: string;
  onSort: (field: SortKey) => void;
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
  analyzing: boolean;
  navigating: boolean;
  anyNavigating: boolean;
  tags: ResearchTag[];
  assignedTags: { id: string; name: string }[];
  onTagsChanged: () => void;
  onCreateTag: (sourceId: string) => void;
  onSelect: (id: string) => void;
  onToggleInclude: (source: ResearchSource) => void;
  onScrape: (source: ResearchSource, e: React.MouseEvent) => void;
  onAnalyze: (source: ResearchSource, e: React.MouseEvent) => void;
  onNavigate: (id: string, e?: React.MouseEvent) => void;
}

/** Column count of the desktop data table — keep in sync with the header +
 *  the body row so the expandable detail row spans the full width.
 *  11 = select, thumbnail, source, authority, verdict, age, scrape, analysis,
 *  type, origin, actions. */
const DESKTOP_COLUMN_COUNT = 11;

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

function SourceRow({
  source,
  importance,
  topicId,
  selected,
  scraping,
  analyzing,
  navigating,
  anyNavigating,
  tags,
  assignedTags,
  onTagsChanged,
  onCreateTag,
  onSelect,
  onToggleInclude,
  onScrape,
  onAnalyze,
  onNavigate,
}: SourceRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { display: pageAgeDisplay } = formatPageAge(source.page_age);
  const snippets = stringArrayFromJson(source.extra_snippets);
  const hasSnippets = snippets.length > 0;
  const hasReasoning = !!source.authority_reasoning;
  const isRanked = source.authority_score != null;
  const tier = tierFromSource(source);
  const canExpand = hasSnippets || hasReasoning;
  const needsScrape =
    source.scrape_status === "pending" ||
    source.scrape_status === "failed" ||
    source.scrape_status === "thin";

  // Every data cell gets a right + bottom hairline → real gridlines. The final
  // (actions) column drops the right border so the table edge stays clean.
  const cellBase =
    "border-b border-border/60 border-r [&:last-child]:border-r-0";

  return (
    <>
      <tr
        className={cn(
          "transition-colors group even:bg-muted/20 dark:even:bg-muted/10",
          !source.is_included && "opacity-50",
          navigating && "bg-muted/60",
          !anyNavigating && "hover:bg-muted/40 cursor-pointer",
          anyNavigating && !navigating && "cursor-not-allowed opacity-70",
        )}
        onClick={(e) => !anyNavigating && onNavigate(source.id, e)}
      >
        {/* Checkbox + Include + Rank stacked vertically */}
        <td
          className={cn("px-2 py-2.5 w-12 align-top", cellBase)}
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
        <td className={cn("py-2.5 px-3 w-16 align-top", cellBase)}>
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

        {/* Source: Title + URL + Description + hostname + tags + scrape */}
        <td className={cn("px-2 py-2.5 w-full max-w-0 align-top", cellBase)}>
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
            {source.hostname && (
              <div className="mt-1.5">
                <span className="text-[11px] text-muted-foreground truncate max-w-48 inline-block">
                  {source.hostname}
                </span>
              </div>
            )}
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              <SourceTagsInline
                sourceId={source.id}
                assigned={assignedTags}
                tags={tags}
                onChanged={onTagsChanged}
                onCreateTag={onCreateTag}
              />
            </div>
          </div>
        </td>

        {/* Authority — first-class: tier badge + prominent score + reasoning */}
        <td className={cn("px-2 py-2.5 w-28 align-top", cellBase)}>
          {isRanked ? (
            <div className="flex flex-col items-start gap-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "text-base font-bold tabular-nums leading-none",
                    tier === "high" && "text-green-600 dark:text-green-400",
                    tier === "medium" && "text-amber-600 dark:text-amber-400",
                    tier === "low" && "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {source.authority_score}
                </span>
                {hasReasoning && (
                  <button
                    type="button"
                    className="p-0.5 rounded hover:bg-muted transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded((v) => !v);
                    }}
                    title={expanded ? "Hide reasoning" : "Show reasoning"}
                    aria-label={expanded ? "Hide reasoning" : "Show reasoning"}
                  >
                    {expanded ? (
                      <ChevronUp className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                )}
              </div>
              <AuthorityTierBadge
                score={source.authority_score}
                tier={source.authority_tier}
                reasoning={null}
                scoreHidden
              />
            </div>
          ) : (
            <AuthorityTierBadge score={null} tier={null} showUnranked />
          )}
        </td>

        {/* Verdict — the post-read bottom-line judgement (final score + use). */}
        <td className={cn("px-2 py-2.5 w-24 align-top", cellBase)}>
          <SourceVerdictBadge
            finalScore={source.final_source_score}
            recommendedUse={source.recommended_use}
            analysisStatus={source.analysis_status}
            showUnanalyzed
          />
        </td>

        {/* Age */}
        <td className={cn("px-2 py-2.5 w-16 align-top", cellBase)}>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {pageAgeDisplay}
          </span>
        </td>

        {/* Scrape — status + an ALWAYS-VISIBLE trigger ([status] [▶ button]).
            One of the two PRIMARY actions on the page: never buried in the row
            dropdown. "Scrape" when pending/never-scraped, "Re-scrape" otherwise. */}
        <td
          className={cn("px-2 py-2.5 w-32 align-top", cellBase)}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-start gap-1.5">
            <ScrapeOutcomeCell status={source.scrape_status} />
            <ActionTrigger
              label={needsScrape ? "Scrape" : "Re-scrape"}
              busy={scraping}
              disabled={anyNavigating}
              onClick={(e) => onScrape(source, e)}
            />
          </div>
        </td>

        {/* Analysis — status + an ALWAYS-VISIBLE trigger, the matched pair to
            Scrape and the page's other PRIMARY action. "Analyze" when not yet
            analyzed, "Re-analyze" once analyzed/failed. */}
        <td
          className={cn("px-2 py-2.5 w-32 align-top", cellBase)}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-start gap-1.5">
            {analyzing ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500/80" />
                Analyzing…
              </span>
            ) : (
              <AnalysisOutcomeCell source={source} />
            )}
            <ActionTrigger
              label={
                analysisStateFor(source) === "none" ? "Analyze" : "Re-analyze"
              }
              busy={analyzing}
              disabled={anyNavigating}
              onClick={(e) => onAnalyze(source, e)}
            />
          </div>
        </td>

        {/* Type — de-emphasized, pushed to the right (almost always "web") */}
        <td className={cn("px-2 py-2.5 w-14 align-top text-center", cellBase)}>
          <div
            className="flex items-center justify-center opacity-70"
            title={SOURCE_TYPE_CONFIG[sourceTypeFromDb(source.source_type)].label}
          >
            <SourceTypeIcon
              type={sourceTypeFromDb(source.source_type)}
              size={14}
              className="text-muted-foreground"
            />
          </div>
        </td>

        {/* Origin — de-emphasized, pushed to the right (almost always "search") */}
        <td className={cn("px-2 py-2.5 w-20 align-top opacity-70", cellBase)}>
          <OriginBadge origin={sourceOriginFromDb(source.origin)} />
        </td>

        {/* Actions */}
        <td
          className={cn("px-2 py-2.5 w-10 align-top", cellBase)}
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
                  <DropdownMenuItem
                    onClick={(e) =>
                      onScrape(source, e as unknown as React.MouseEvent)
                    }
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {needsScrape ? "Scrape" : "Re-scrape"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) =>
                      onAnalyze(source, e as unknown as React.MouseEvent)
                    }
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {analysisStateFor(source) === "none"
                      ? "Analyze"
                      : "Re-analyze"}
                  </DropdownMenuItem>
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
            {canExpand && (
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

      {/* Expanded detail row — authority reasoning + search snippets, as
          first-class READABLE text (never concatenated into the badge). */}
      {expanded && (hasReasoning || hasSnippets) && (
        <tr className="even:bg-muted/20 dark:even:bg-muted/10">
          <td
            colSpan={DESKTOP_COLUMN_COUNT}
            className="border-b border-border/60 px-4 py-3 bg-muted/20 dark:bg-muted/10"
          >
            <div className="space-y-2.5">
              {hasReasoning && (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Authority reasoning
                    </span>
                    {tier && (
                      <AuthorityTierBadge
                        score={source.authority_score}
                        tier={source.authority_tier}
                        reasoning={null}
                      />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-foreground/80 leading-relaxed max-w-3xl">
                    {source.authority_reasoning}
                  </p>
                </div>
              )}
              {hasSnippets && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Snippets
                  </span>
                  <div className="mt-1 space-y-1.5">
                    {snippets.map((snippet, i) => (
                      <p
                        key={i}
                        className="text-xs text-foreground/70 leading-relaxed max-w-3xl"
                      >
                        {snippet}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SourceList() {
  const { topicId, topic, refresh } = useTopicContext();
  const api = useResearchApi();
  const isMobile = useIsMobile();
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
  // as the CLIENT page position (see `pagedSources` / the pager below).
  const fetchFilters = useMemo(
    () => ({ ...filters, limit: FETCH_ALL_LIMIT, offset: 0 }),
    [filters],
  );
  const { data: sources, refresh: refetchSources } = useResearchSources(
    topicId,
    fetchFilters,
  );
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
  const [scrapingIds, setScrapingIds] = useState<Set<string>>(new Set());
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  // Shared "create tag" dialog target: a source id assigns the new tag to that
  // source; "__bulk__" assigns it to the whole current selection.
  const [createTagTarget, setCreateTagTarget] = useState<string | null>(null);
  const [creatingTag, setCreatingTag] = useState(false);

  // Client-only sort axis (source_type / origin / authority_tier / tags) — the
  // server `SourceSortBy` type can't carry these, so they sort the fetched page
  // locally. Mutually exclusive with the server sort: activating one clears the
  // other, so exactly one sort arrow is ever lit.
  const [localSort, setLocalSort] = useState<{
    key: LocalSortKey;
    dir: SortDir;
  } | null>(null);
  // Client-only Authority TIER header filter — there is no server column for
  // tier (it's derived from the score), so this narrows the fetched page.
  const [tierFilter, setTierFilter] = useState<string | null>(null);

  const tagList = (tags as ResearchTag[]) ?? [];
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
  const allSources = (sources as ResearchSource[]) ?? [];
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

    // 3. Client-only sort axis — overrides search relevance order when set, and
    //    sorts the FULL set so the true top rows can't hide past a server page.
    //    Server sorts are already applied by getSources, so they pass through.
    if (localSort) {
      const dir = localSort.dir === "desc" ? -1 : 1;
      list = [...list].sort(
        localSortComparator(localSort.key, dir, tagCountFor, bestRankFor),
      );
    }
    return list;
  }, [allSources, search, tierFilter, localSort, tagCountFor, bestRankFor]);

  // Client-side pagination over the fully-processed list. `filters.limit` is the
  // page size and `filters.offset` the page position (both from the URL). We
  // clamp the offset so a filter that shrinks the list can never strand the user
  // on an empty page past the new end.
  const pageSize = filters.limit;
  const totalCount = sourceList.length;
  const maxOffset =
    totalCount === 0 ? 0 : Math.floor((totalCount - 1) / pageSize) * pageSize;
  const pageOffset = Math.min(filters.offset, maxOffset);
  const pagedSources = useMemo(
    () => sourceList.slice(pageOffset, pageOffset + pageSize),
    [sourceList, pageOffset, pageSize],
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
  // user is looking at — not the raw fetch order. Keyed on the processed list,
  // so every sort / filter / search change re-publishes.
  useEffect(() => {
    setSourceNavOrder(
      topicId,
      sourceList.map((s) => s.id),
    );
  }, [topicId, sourceList]);

  // The client-side controls (search, tier filter, local sort) don't flow
  // through `setFilters`, so changing them won't auto-reset the page the way a
  // server-filter change does. Snap back to page 1 when any of them changes so
  // the user lands on the first results of the new view (the `pageOffset` clamp
  // already guarantees safety; this is the expected, non-surprising behavior).
  const clientViewKey = `${search}|${tierFilter ?? ""}|${localSort?.key ?? ""}:${localSort?.dir ?? ""}`;
  const prevClientViewKey = useRef(clientViewKey);
  useEffect(() => {
    if (prevClientViewKey.current !== clientViewKey) {
      prevClientViewKey.current = clientViewKey;
      if (filters.offset !== 0) setFilters({ offset: 0 });
    }
  }, [clientViewKey, filters.offset, setFilters]);

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

  // Unified "what is currently sorted" — either the server filter sort or the
  // local sort. Exactly one is non-null at a time (the toggle enforces it).
  const activeSort: SortKey | undefined = localSort?.key ?? filters.sort_by;
  const activeDir: SortDir | undefined = localSort
    ? localSort.dir
    : filters.sort_dir;

  // One tri-state toggle (asc → desc → none) shared by EVERY column header,
  // whether it sorts server-side or client-side.
  const handleSort = useCallback(
    (field: SortKey) => {
      if (isLocalSortKey(field)) {
        // Switching to a local sort: drop any server sort so only one is active.
        if (filters.sort_by) setFilters({ sort_by: undefined, sort_dir: undefined });
        setLocalSort((prev) => {
          if (prev?.key !== field) return { key: field, dir: "asc" };
          if (prev.dir === "asc") return { key: field, dir: "desc" };
          return null;
        });
        return;
      }
      // Server sort: clear any local sort first.
      if (localSort) setLocalSort(null);
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
    [filters.sort_by, filters.sort_dir, setFilters, localSort],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // "Select all" toggles the VISIBLE page (selections persist across pages in
  // the `selected` Set). All-selected = every row on this page is selected.
  const pageAllSelected =
    pagedSources.length > 0 && pagedSources.every((s) => selected.has(s.id));
  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = pagedSources.every((s) => next.has(s.id));
      if (allOn) {
        for (const s of pagedSources) next.delete(s.id);
      } else {
        for (const s of pagedSources) next.add(s.id);
      }
      return next;
    });
  }, [pagedSources]);

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
        toast.success(`Tagged ${selected.size} source(s) with "${name}"`);
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
        toast.success(
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
        toast.error("Couldn't start the scrape. Please try again.");
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
  // the option is "Scraped", not the ambiguous raw "Success".
  const statusFilterOptions: ColumnFilterOption[] = useMemo(
    () =>
      Object.keys(SCRAPE_STATUS_CONFIG).map((id) => ({
        id,
        label: scrapeOutcomeFor(id).label,
      })),
    [],
  );
  const typeFilterOptions: ColumnFilterOption[] = useMemo(
    () =>
      Object.entries(SOURCE_TYPE_CONFIG).map(([id, cfg]) => ({
        id,
        label: cfg.label,
      })),
    [],
  );
  const originFilterOptions: ColumnFilterOption[] = useMemo(
    () =>
      Object.entries(ORIGIN_CONFIG).map(([id, cfg]) => ({
        id,
        label: cfg.label,
      })),
    [],
  );
  const tierFilterOptions: ColumnFilterOption[] = useMemo(
    () => [
      { id: "high", label: "High" },
      { id: "medium", label: "Medium" },
      { id: "low", label: "Low" },
    ],
    [],
  );

  // The top bar's "reset" must also clear the local tier filter + local sort.
  const anyFilterActive = hasActiveFilters || tierFilter != null;
  const resetAllFilters = useCallback(() => {
    setTierFilter(null);
    setLocalSort(null);
    resetFilters();
  }, [resetFilters]);

  return (
    <div className="p-3 sm:p-4 space-y-3 overflow-x-hidden">
      <SourceFilters
        filters={filters}
        onFilterChange={setFilters}
        onReset={resetAllFilters}
        hasActiveFilters={anyFilterActive}
        keywords={(keywords as import("../../types").ResearchKeyword[]) ?? []}
        hostnames={hostnames}
        count={sourceList.length}
        search={search}
        onSearchChange={setSearch}
        trailing={
          <div className="flex items-center gap-2">
            <AuthorityRankButton topicId={topicId} onRanked={refetchSources} />
            <AuthorityExportButton
              topicId={topicId}
              topicName={topic?.name ?? null}
            />
          </div>
        }
      />

      {/* Desktop Table */}
      {!isMobile ? (
        <div className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/40 [&>th]:border-b [&>th]:border-r [&>th]:border-border/60 [&>th:last-child]:border-r-0">
                {/* Select + Rank sort */}
                <th className="w-12 px-2 py-2 align-middle">
                  <div className="flex flex-col items-center gap-1.5">
                    <Checkbox
                      checked={pageAllSelected}
                      onCheckedChange={toggleAll}
                    />
                    <SortHeader
                      label="#"
                      field="local:rank"
                      currentSort={activeSort}
                      currentDir={activeDir}
                      onSort={handleSort}
                    />
                  </div>
                </th>
                {/* Thumbnail — no sort */}
                <th className="w-16 px-3 py-2" />
                {/* Source — sort by hostname */}
                <th className="px-2 py-2 text-left w-full">
                  <SortHeader
                    label="Source"
                    field="hostname"
                    currentSort={activeSort}
                    currentDir={activeDir}
                    onSort={handleSort}
                  />
                </th>
                {/* Authority — server score sort + local tier filter */}
                <th className="w-28 px-2 py-2 text-left">
                  <div className="flex items-center gap-1">
                    <SortHeader
                      label="Authority"
                      field="authority_score"
                      currentSort={activeSort}
                      currentDir={activeDir}
                      onSort={handleSort}
                    />
                    <ColumnFilterMenu
                      label="Tier"
                      options={tierFilterOptions}
                      selectedId={tierFilter}
                      onSelect={setTierFilter}
                    />
                  </div>
                </th>
                {/* Verdict — post-read judgement, server-sortable by final score */}
                <th className="w-24 px-2 py-2 text-left">
                  <SortHeader
                    label="Verdict"
                    field="final_source_score"
                    currentSort={activeSort}
                    currentDir={activeDir}
                    onSort={handleSort}
                  />
                </th>
                {/* Age — server sort */}
                <th className="w-16 px-2 py-2 text-left">
                  <SortHeader
                    label="Age"
                    field="page_age"
                    currentSort={activeSort}
                    currentDir={activeDir}
                    onSort={handleSort}
                  />
                </th>
                {/* Scrape — the scrape OUTCOME (server sort + server filter) */}
                <th className="w-32 px-2 py-2 text-left">
                  <div className="flex items-center gap-1">
                    <SortHeader
                      label="Scrape"
                      field="scrape_status"
                      currentSort={activeSort}
                      currentDir={activeDir}
                      onSort={handleSort}
                    />
                    <ColumnFilterMenu
                      label="Scrape"
                      options={statusFilterOptions}
                      selectedId={filters.scrape_status ?? null}
                      onSelect={(id) =>
                        setFilters({
                          scrape_status: (id ??
                            undefined) as typeof filters.scrape_status,
                        })
                      }
                    />
                  </div>
                </th>
                {/* Analysis — the ANALYZE outcome + always-visible trigger. The
                    matched pair to Scrape; the page's other primary action. The
                    sortable analysis signal is the score, surfaced under Verdict
                    (final_source_score), so this header is a plain label. */}
                <th className="w-32 px-2 py-2 text-left">
                  <span className="text-xs font-medium text-muted-foreground">
                    Analysis
                  </span>
                </th>
                {/* Type — de-emphasized, far right (almost always "web") */}
                <th className="w-14 px-2 py-2 text-left">
                  <div className="flex items-center gap-1 opacity-70">
                    <SortHeader
                      label="Type"
                      field="local:source_type"
                      currentSort={activeSort}
                      currentDir={activeDir}
                      onSort={handleSort}
                    />
                    <ColumnFilterMenu
                      label="Type"
                      options={typeFilterOptions}
                      selectedId={filters.source_type ?? null}
                      onSelect={(id) =>
                        setFilters({
                          source_type: (id ??
                            undefined) as typeof filters.source_type,
                        })
                      }
                    />
                  </div>
                </th>
                {/* Origin — de-emphasized, far right (almost always "search") */}
                <th className="w-20 px-2 py-2 text-left">
                  <div className="flex items-center gap-1 opacity-70">
                    <SortHeader
                      label="Origin"
                      field="local:origin"
                      currentSort={activeSort}
                      currentDir={activeDir}
                      onSort={handleSort}
                    />
                    <ColumnFilterMenu
                      label="Origin"
                      options={originFilterOptions}
                      selectedId={filters.origin ?? null}
                      onSelect={(id) =>
                        setFilters({
                          origin: (id ?? undefined) as typeof filters.origin,
                        })
                      }
                    />
                  </div>
                </th>
                {/* Actions — no sort */}
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {pagedSources.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  importance={importanceMap?.get(source.id)}
                  topicId={topicId}
                  selected={selected.has(source.id)}
                  scraping={scrapingIds.has(source.id)}
                  analyzing={analyzingIds.has(source.id)}
                  navigating={navigatingId === source.id}
                  anyNavigating={anyNavigating}
                  tags={tagList}
                  assignedTags={tagsBySource[source.id] ?? []}
                  onTagsChanged={refreshTagState}
                  onCreateTag={(id) => setCreateTagTarget(id)}
                  onSelect={toggleSelect}
                  onToggleInclude={handleToggleInclude}
                  onScrape={handleScrapeSource}
                  onAnalyze={handleAnalyzeSource}
                  onNavigate={handleNavigate}
                />
              ))}
            </tbody>
          </table>
          {totalCount === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              No sources found. Run a search to discover sources.
            </div>
          )}
        </div>
      ) : (
        /* Mobile Card List */
        <div className="space-y-2">
          {pagedSources.map((source) => {
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
                    {source.authority_score != null && (
                      <AuthorityTierBadge
                        score={source.authority_score}
                        tier={source.authority_tier}
                        reasoning={source.authority_reasoning}
                      />
                    )}
                    <SourceVerdictBadge
                      finalScore={source.final_source_score}
                      recommendedUse={source.recommended_use}
                      analysisStatus={source.analysis_status}
                    />
                    {source.page_age && (
                      <span className="text-[10px] text-muted-foreground">
                        {pageAgeDisplay}
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
                    <ActionTrigger
                      label={needsScrape ? "Scrape" : "Re-scrape"}
                      busy={scrapingIds.has(source.id)}
                      disabled={anyNavigating}
                      onClick={(e) => handleScrapeSource(source, e)}
                    />
                    <ActionTrigger
                      label={
                        analysisStateFor(source) === "none"
                          ? "Analyze"
                          : "Re-analyze"
                      }
                      busy={analyzingIds.has(source.id)}
                      disabled={anyNavigating}
                      onClick={(e) => handleAnalyzeSource(source, e)}
                    />
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
          })}
          {totalCount === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              No sources found.
            </div>
          )}
        </div>
      )}

      {/* Honest truncation note — only when the topic genuinely exceeds the
          fetch cap, so the table never silently lies about its real size. */}
      {fetchCapped && (
        <div className="flex items-center justify-center pt-1">
          <span className="text-[10px] text-muted-foreground">
            Showing first {FETCH_ALL_LIMIT.toLocaleString()} sources of this
            topic.
          </span>
        </div>
      )}

      {/* Client-side pager over the fully-processed (sorted + filtered) list.
          Gated on the REAL processed total, so a tier filter that shrinks a
          page can never make the pager (and "Prev") vanish — fixes bug A3. */}
      {totalCount > pageSize && (
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <button
            disabled={pageOffset === 0}
            onClick={() =>
              setFilters({ offset: Math.max(0, pageOffset - pageSize) })
            }
            className="h-6 px-2.5 rounded-full matrx-glass-card text-[10px] font-medium text-muted-foreground disabled:opacity-30 hover:text-foreground transition-colors"
          >
            Prev
          </button>
          <span className="text-[10px] text-muted-foreground tabular-nums px-1">
            {pageOffset + 1}–{pageOffset + pagedSources.length} of {totalCount}
          </span>
          <button
            disabled={pageOffset + pageSize >= totalCount}
            onClick={() => setFilters({ offset: pageOffset + pageSize })}
            className="h-6 px-2.5 rounded-full matrx-glass-card text-[10px] font-medium text-muted-foreground disabled:opacity-30 hover:text-foreground transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selected.size}
        tags={tagList}
        onInclude={() => handleBulk("include")}
        onExclude={() => handleBulk("exclude")}
        onMarkStale={() => handleBulk("mark_stale")}
        onMarkComplete={() => handleBulk("mark_complete")}
        onAddTag={handleBatchAddTag}
        onCreateTag={() => setCreateTagTarget("__bulk__")}
        onClear={() => setSelected(new Set())}
        busy={tagBusy}
      />

      <TextInputDialog
        open={createTagTarget !== null}
        onOpenChange={(o) => !creatingTag && !o && setCreateTagTarget(null)}
        title="New tag dimension"
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

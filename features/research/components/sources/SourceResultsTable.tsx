"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "../shared/StatusBadge";
import { SourceTypeIcon } from "../shared/SourceTypeIcon";
import { AuthorityTierBadge } from "./AuthorityTierBadge";
import { SourceVerdictBadge } from "./SourceVerdictBadge";
import { ColumnFilterMenu, type ColumnFilterOption } from "./ColumnFilterMenu";
import { sourceTypeFromDb, type ResearchSource } from "../../types";
import type { CurationAnalysisState } from "../../service";
import { SCRAPE_STATUS_CONFIG, SOURCE_TYPE_CONFIG } from "../../constants";

/**
 * Shared tabular view of sources for the casual browsing surfaces (keyword
 * home, content page). Core columns the user needs to make sense of a row:
 * rank, the source, that **Search** found it (always — that's why it's here),
 * and the actual **Scrape** outcome. Each row opens the source.
 *
 * Two surfaces, one table:
 *  • Keyword home renders it READ-ONLY (`interactive` omitted) — a short, pre-
 *    ranked list under a fade overlay, where sort/filter chrome would clash.
 *  • Content page renders it INTERACTIVE (`interactive`) — every meaningful
 *    column gains an asc/desc sort and, where it makes sense, a header filter,
 *    and the component sorts + filters its own rows. The heavy batch-action
 *    "work" table (SourceList / CurationTable) stays a separate surface.
 *
 * Cell rule: a cell is a number XOR a label, never both. The Characters column
 * shows an integer count (comma-grouped, no `k`/`M`, no decimals) so it sorts
 * numerically; the unit lives in the header. The same goes for the # rank.
 */

/** Every column that can be sorted, plus a `null` "no sort" state. */
type SortKey =
  | "rank"
  | "source"
  | "scrape"
  | "authority"
  | "verdict"
  | "type"
  | "characters"
  | "analysis"
  | null;
type SortDir = "asc" | "desc";

/** Tier rank so Authority sorts high → medium → low (and unranked last). */
const TIER_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };
function tierFromSource(s: ResearchSource): string | null {
  const t = (s.authority_tier ?? "").toLowerCase();
  if (t === "high" || t === "medium" || t === "low") return t;
  if (s.authority_score == null) return null;
  if (s.authority_score >= 75) return "high";
  if (s.authority_score >= 45) return "medium";
  return "low";
}

/**
 * Analysis outcome ordering + neutral presentation. We call these "analysis
 * reports" and never colour a missing/failed one red — a source with no report
 * yet is a normal, expected state, not an error. `content` (a real report) is
 * the most complete, so it sorts highest.
 */
const ANALYSIS_ORDER: Record<CurationAnalysisState, number> = {
  content: 3,
  empty: 2,
  failed: 1,
  none: 0,
};
const ANALYSIS_LABEL: Record<CurationAnalysisState, string> = {
  content: "Report",
  empty: "Empty",
  failed: "No report",
  none: "None",
};
const ANALYSIS_CLASS: Record<CurationAnalysisState, string> = {
  content:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  empty: "bg-muted text-muted-foreground",
  failed: "bg-muted text-muted-foreground",
  none: "bg-transparent text-muted-foreground/50",
};
const ANALYSIS_FILTER_OPTIONS: ColumnFilterOption[] = [
  { id: "content", label: "Report" },
  { id: "empty", label: "Empty" },
  { id: "failed", label: "No report" },
  { id: "none", label: "None" },
];

function SortHeader({
  label,
  field,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  field: Exclude<SortKey, null>;
  active: boolean;
  dir: SortDir;
  onSort: (field: Exclude<SortKey, null>) => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium text-muted-foreground hover:text-foreground transition-colors",
        active && "text-foreground",
        align === "right" && "flex-row-reverse",
      )}
    >
      {label}
      {active ? (
        dir === "asc" ? (
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

export function SourceResultsTable({
  sources,
  topicId,
  rankFor,
  dataSizeFor,
  analysisFor,
  interactive = false,
}: {
  sources: ResearchSource[];
  topicId: string;
  /** Per-row rank to show in the # column (per-keyword rank, importance, …). */
  rankFor: (source: ResearchSource) => number | null;
  /**
   * Optional per-row scraped content size (chars). When provided, a
   * right-aligned "Characters" column appears (hidden on narrow screens). The
   * cell renders the raw integer count — sortable as a number — never a `k`/`M`
   * shorthand, so the column never mixes a number with a unit.
   */
  dataSizeFor?: (source: ResearchSource) => number | null;
  /**
   * Optional per-row analysis-report outcome. When provided, an "Analysis"
   * column appears (sortable + filterable). Never rendered red — a source with
   * no report is a normal state.
   */
  analysisFor?: (source: ResearchSource) => CurationAnalysisState | null;
  /**
   * When true, every meaningful column gets an asc/desc sort and (where it
   * applies) a header filter, and the table sorts + filters its own rows.
   * Defaults to false so the read-only keyword surface is untouched.
   */
  interactive?: boolean;
}) {
  const router = useRouter();
  const showData = !!dataSizeFor;
  const showAnalysis = !!analysisFor;

  // Sort + per-column filter state. Inert (and never read) when !interactive.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: null,
    dir: "asc",
  });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [analysisFilter, setAnalysisFilter] = useState<string | null>(null);

  const statusFilterOptions: ColumnFilterOption[] = useMemo(
    () =>
      Object.entries(SCRAPE_STATUS_CONFIG).map(([id, cfg]) => ({
        id,
        label: cfg.label,
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
  const tierFilterOptions: ColumnFilterOption[] = useMemo(
    () => [
      { id: "high", label: "High" },
      { id: "medium", label: "Medium" },
      { id: "low", label: "Low" },
    ],
    [],
  );

  // Apply header filters then the active sort over the FULL passed-in set, so an
  // interactive surface reflects every row (the keyword surface already hands us
  // exactly the rows it wants and uses neither path).
  const rows = useMemo(() => {
    if (!interactive) return sources;

    let list = sources;
    if (statusFilter) {
      list = list.filter((s) => s.scrape_status === statusFilter);
    }
    if (typeFilter) {
      list = list.filter((s) => s.source_type === typeFilter);
    }
    if (tierFilter) {
      list = list.filter((s) => tierFromSource(s) === tierFilter);
    }
    if (analysisFilter && analysisFor) {
      list = list.filter(
        (s) => (analysisFor(s) ?? "none") === analysisFilter,
      );
    }

    if (sort.key) {
      const d = sort.dir === "desc" ? -1 : 1;
      const num = (v: number | null): number =>
        v == null ? Number.POSITIVE_INFINITY : v;
      const str = (v: string | null): string => (v ?? "").toLowerCase();
      list = [...list].sort((a, b) => {
        switch (sort.key) {
          case "rank": {
            // Numeric, but "best rank" is a low number — keep nulls last in
            // BOTH directions by sorting the raw value then pushing ∞ down.
            const av = num(rankFor(a));
            const bv = num(rankFor(b));
            if (av === bv) return 0;
            return av < bv ? -1 * d : 1 * d;
          }
          case "characters": {
            const av = dataSizeFor ? num(dataSizeFor(a)) : Number.POSITIVE_INFINITY;
            const bv = dataSizeFor ? num(dataSizeFor(b)) : Number.POSITIVE_INFINITY;
            if (av === bv) return 0;
            return av < bv ? -1 * d : 1 * d;
          }
          case "authority": {
            const av = num(a.authority_score);
            const bv = num(b.authority_score);
            if (av === bv) return 0;
            return av < bv ? -1 * d : 1 * d;
          }
          case "verdict": {
            const av = num(a.final_source_score);
            const bv = num(b.final_source_score);
            if (av === bv) return 0;
            return av < bv ? -1 * d : 1 * d;
          }
          case "analysis": {
            const av = analysisFor
              ? ANALYSIS_ORDER[analysisFor(a) ?? "none"]
              : 0;
            const bv = analysisFor
              ? ANALYSIS_ORDER[analysisFor(b) ?? "none"]
              : 0;
            if (av === bv) return 0;
            return av < bv ? -1 * d : 1 * d;
          }
          case "type": {
            const av = str(a.source_type);
            const bv = str(b.source_type);
            return av < bv ? -1 * d : av > bv ? 1 * d : 0;
          }
          case "scrape": {
            const av = str(a.scrape_status);
            const bv = str(b.scrape_status);
            return av < bv ? -1 * d : av > bv ? 1 * d : 0;
          }
          case "source": {
            const av = str(a.title || a.hostname || a.url);
            const bv = str(b.title || b.hostname || b.url);
            return av < bv ? -1 * d : av > bv ? 1 * d : 0;
          }
          default:
            return 0;
        }
      });
    }
    return list;
  }, [
    interactive,
    sources,
    sort,
    statusFilter,
    typeFilter,
    tierFilter,
    analysisFilter,
    analysisFor,
    rankFor,
    dataSizeFor,
  ]);

  // Tri-state header toggle (asc → desc → none) shared by every column.
  const onSort = (field: Exclude<SortKey, null>) =>
    setSort((prev) => {
      if (prev.key !== field) return { key: field, dir: "asc" };
      if (prev.dir === "asc") return { key: field, dir: "desc" };
      return { key: null, dir: "asc" };
    });

  return (
    <div className="overflow-x-auto rounded-lg border border-border/50">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="py-1.5 pl-2 pr-1 w-10 font-medium">
              {interactive ? (
                <SortHeader
                  label="#"
                  field="rank"
                  active={sort.key === "rank"}
                  dir={sort.dir}
                  onSort={onSort}
                />
              ) : (
                "#"
              )}
            </th>
            <th className="py-1.5 px-1 font-medium">
              {interactive ? (
                <SortHeader
                  label="Source"
                  field="source"
                  active={sort.key === "source"}
                  dir={sort.dir}
                  onSort={onSort}
                />
              ) : (
                "Source"
              )}
            </th>
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">Search</th>
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">
              {interactive ? (
                <div className="flex items-center gap-1">
                  <SortHeader
                    label="Scrape"
                    field="scrape"
                    active={sort.key === "scrape"}
                    dir={sort.dir}
                    onSort={onSort}
                  />
                  <ColumnFilterMenu
                    label="Scrape"
                    options={statusFilterOptions}
                    selectedId={statusFilter}
                    onSelect={setStatusFilter}
                  />
                </div>
              ) : (
                "Scrape"
              )}
            </th>
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">
              {interactive ? (
                <div className="flex items-center gap-1">
                  <SortHeader
                    label="Authority"
                    field="authority"
                    active={sort.key === "authority"}
                    dir={sort.dir}
                    onSort={onSort}
                  />
                  <ColumnFilterMenu
                    label="Tier"
                    options={tierFilterOptions}
                    selectedId={tierFilter}
                    onSelect={setTierFilter}
                  />
                </div>
              ) : (
                "Authority"
              )}
            </th>
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">
              {interactive ? (
                <SortHeader
                  label="Verdict"
                  field="verdict"
                  active={sort.key === "verdict"}
                  dir={sort.dir}
                  onSort={onSort}
                />
              ) : (
                "Verdict"
              )}
            </th>
            {interactive && (
              <th className="py-1.5 px-2 font-medium whitespace-nowrap hidden md:table-cell">
                <div className="flex items-center gap-1">
                  <SortHeader
                    label="Type"
                    field="type"
                    active={sort.key === "type"}
                    dir={sort.dir}
                    onSort={onSort}
                  />
                  <ColumnFilterMenu
                    label="Type"
                    options={typeFilterOptions}
                    selectedId={typeFilter}
                    onSelect={setTypeFilter}
                  />
                </div>
              </th>
            )}
            {showAnalysis && (
              <th className="py-1.5 px-2 font-medium whitespace-nowrap hidden md:table-cell">
                {interactive ? (
                  <div className="flex items-center gap-1">
                    <SortHeader
                      label="Analysis"
                      field="analysis"
                      active={sort.key === "analysis"}
                      dir={sort.dir}
                      onSort={onSort}
                    />
                    <ColumnFilterMenu
                      label="Analysis"
                      options={ANALYSIS_FILTER_OPTIONS}
                      selectedId={analysisFilter}
                      onSelect={setAnalysisFilter}
                    />
                  </div>
                ) : (
                  "Analysis"
                )}
              </th>
            )}
            {showData && (
              <th className="py-1.5 px-2 font-medium text-right whitespace-nowrap hidden sm:table-cell">
                {interactive ? (
                  <SortHeader
                    label="Characters"
                    field="characters"
                    active={sort.key === "characters"}
                    dir={sort.dir}
                    onSort={onSort}
                    align="right"
                  />
                ) : (
                  "Characters"
                )}
              </th>
            )}
            <th className="w-7" />
          </tr>
        </thead>
        <tbody>
          {rows.map((src) => {
            const rank = rankFor(src);
            const dataSize = dataSizeFor ? dataSizeFor(src) : null;
            const analysis = analysisFor ? (analysisFor(src) ?? "none") : null;
            const go = () =>
              router.push(`/research/topics/${topicId}/sources/${src.id}`);
            return (
              <tr
                key={src.id}
                role="button"
                tabIndex={0}
                onClick={go}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    go();
                  }
                }}
                className="group border-b border-border/20 last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
              >
                <td className="py-2 pl-2 pr-1 align-top font-mono text-[11px] tabular-nums text-muted-foreground">
                  {rank != null ? `#${rank}` : "—"}
                </td>
                <td className="py-2 px-1 align-top">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <SourceTypeIcon type={sourceTypeFromDb(src.source_type)} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate max-w-[20rem]">
                        {src.title || src.hostname || src.url}
                      </div>
                      {src.hostname && (
                        <div className="text-[10px] text-muted-foreground truncate max-w-[20rem]">
                          {src.hostname}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-2 px-2 align-top">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-px text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap">
                    <span className="h-1 w-1 rounded-full bg-green-500" />
                    Found
                  </span>
                </td>
                <td className="py-2 px-2 align-top">
                  <StatusBadge status={src.scrape_status} />
                </td>
                <td className="py-2 px-2 align-top">
                  {src.authority_score != null ? (
                    <AuthorityTierBadge
                      score={src.authority_score}
                      tier={src.authority_tier}
                      reasoning={src.authority_reasoning}
                    />
                  ) : (
                    <span className="text-[11px] text-muted-foreground/40">
                      —
                    </span>
                  )}
                </td>
                <td className="py-2 px-2 align-top">
                  <SourceVerdictBadge
                    finalScore={src.final_source_score}
                    recommendedUse={src.recommended_use}
                    analysisStatus={src.analysis_status}
                    showUnanalyzed={false}
                  />
                </td>
                {interactive && (
                  <td className="py-2 px-2 align-top hidden md:table-cell">
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap"
                      title={
                        SOURCE_TYPE_CONFIG[sourceTypeFromDb(src.source_type)]
                          .label
                      }
                    >
                      {
                        SOURCE_TYPE_CONFIG[sourceTypeFromDb(src.source_type)]
                          .label
                      }
                    </span>
                  </td>
                )}
                {showAnalysis && (
                  <td className="py-2 px-2 align-top hidden md:table-cell">
                    {analysis ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium whitespace-nowrap",
                          ANALYSIS_CLASS[analysis],
                        )}
                      >
                        {ANALYSIS_LABEL[analysis]}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/40">
                        —
                      </span>
                    )}
                  </td>
                )}
                {showData && (
                  <td
                    className={cn(
                      "py-2 px-2 align-top text-right font-mono text-[11px] tabular-nums whitespace-nowrap hidden sm:table-cell",
                      dataSize != null && dataSize >= 1000
                        ? "text-muted-foreground"
                        : "text-muted-foreground/50",
                    )}
                    title={
                      dataSize != null
                        ? `${dataSize.toLocaleString()} characters scraped`
                        : "No scraped content recorded"
                    }
                  >
                    {dataSize != null ? Math.round(dataSize).toLocaleString() : "—"}
                  </td>
                )}
                <td className="py-2 pr-2 align-top">
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-foreground" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

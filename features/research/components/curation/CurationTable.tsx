"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  ExternalLink,
  ListChecks,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useTopicContext } from "../../context/ResearchContext";
import { useCurationData } from "../../hooks/useResearchState";
import {
  bulkUpdateSources,
  updateSource,
  addTagToSources,
  createTag,
} from "../../service";
import type { CurationRow, CurationAnalysisState } from "../../service";
import { sourceTypeFromDb } from "../../types";
import { StatusBadge } from "../shared/StatusBadge";
import { SourceTypeIcon } from "../shared/SourceTypeIcon";
import { AuthorityTierBadge } from "../sources/AuthorityTierBadge";
import { ColumnFilterMenu, type ColumnFilterOption } from "../sources/ColumnFilterMenu";
import { CurationBatchBar } from "./CurationBatchBar";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { ResearchFilterBar, type FilterDef } from "../shared/ResearchFilterBar";
import type { FilterOption } from "@/components/hierarchy-filter/HierarchyFilterPill";

type GroupBy = "none" | "keyword" | "tag";

/**
 * Every column sorts through ONE client-side axis (this table already holds the
 * whole topic in memory). Tri-state per header: asc → desc → none. Exactly one
 * arrow is ever lit — mirrors the SourceList data table so the two read the same.
 *
 * `rank` sorts by the source's BEST rank across all keywords (`importance.bestRank`)
 * — the SAME number the `#N` cell shows — never a mixed per-keyword rank.
 */
type SortKey =
  | "rank"
  | "source"
  | "scrape"
  | "authority"
  | "chars"
  | "analysis"
  | "tags"
  | "included";
type SortDir = "asc" | "desc";

/** Analysis outcome → a SORT weight (more complete = higher). */
const ANALYSIS_SORT: Record<CurationAnalysisState, number> = {
  content: 3,
  empty: 2,
  failed: 1,
  none: 0,
};

/**
 * Restrained analysis-state treatment — a small muted semantic dot + a plain
 * monochrome label, matching the data-console look (never a bright pill). These
 * are ANALYSIS REPORTS, so a failure is amber, never a loud red, and a successful
 * analysis gets a quiet blue accent rather than kindergarten green.
 */
type AnalysisTone = "report" | "warn" | "bad" | "muted";
const ANALYSIS_OUTCOME: Record<
  CurationAnalysisState,
  { label: string; tone: AnalysisTone }
> = {
  content: { label: "Report ready", tone: "report" },
  empty: { label: "No content", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
  none: { label: "—", tone: "muted" },
};

const ANALYSIS_TONE_DOT: Record<AnalysisTone, string> = {
  report: "bg-blue-500/70",
  warn: "bg-amber-500/70",
  bad: "bg-amber-600/70",
  muted: "bg-muted-foreground/40",
};

function AnalysisCell({ state }: { state: CurationAnalysisState }) {
  const { label, tone } = ANALYSIS_OUTCOME[state];
  if (state === "none")
    return <span className="text-[11px] text-muted-foreground/40">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ANALYSIS_TONE_DOT[tone])}
      />
      {label}
    </span>
  );
}

/** Restrained include/exclude marker — neutral muted dot, never a green chip. */
function IncludedCell({
  included,
  onToggle,
}: {
  included: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={included ? "Exclude" : "Include"}
      title={
        included ? "Included — click to exclude" : "Excluded — click to include"
      }
      className={cn(
        "inline-flex items-center justify-center h-6 w-6 rounded-md transition-colors hover:bg-muted",
        included ? "text-foreground/70" : "text-muted-foreground/40",
      )}
    >
      {included ? (
        <Eye className="h-3.5 w-3.5" />
      ) : (
        <EyeOff className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/** Plain integer, comma-grouped — NO decimals, NO k/M. A size is a number; its
 *  unit ("chars") lives in the column header, never in the cell. */
function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString();
}

/** Tier order for sorting (high → low when descending). */
const TIER_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };
function tierFromRow(r: CurationRow): string | null {
  const t = (r.source.authority_tier ?? "").toLowerCase();
  if (t === "high" || t === "medium" || t === "low") return t;
  const score = r.source.authority_score;
  if (score == null) return null;
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function rankInKeyword(row: CurationRow, keywordId: string): number | null {
  return (
    row.importance?.perKeyword.find((p) => p.keyword_id === keywordId)?.rank ??
    null
  );
}

/** One tri-state column header (asc → desc → none) shared by every column. */
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
  currentSort: SortKey | null;
  currentDir: SortDir;
  onSort: (field: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSort === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium text-muted-foreground hover:text-foreground transition-colors",
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

export default function CurationTable() {
  const { topicId } = useTopicContext();
  const { data, isLoading, refresh } = useCurationData(topicId);

  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  // ONE unified, client-side sort axis. null = default order (importance score,
  // or — when grouped by keyword — each keyword's own search-rank order).
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [keywordFilter, setKeywordFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [scrapeFilter, setScrapeFilter] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [analysisFilter, setAnalysisFilter] = useState<string | null>(null);
  const [includedFilter, setIncludedFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);

  const rows = data?.rows ?? [];
  const keywords = data?.keywords ?? [];
  const tags = data?.tags ?? [];

  const filtered = useMemo(() => {
    let items = rows;
    if (keywordFilter)
      items = items.filter((r) =>
        r.importance?.perKeyword?.some((p) => p.keyword_id === keywordFilter),
      );
    if (tagFilter)
      items = items.filter((r) => r.tags.some((t) => t.id === tagFilter));
    if (scrapeFilter)
      items = items.filter((r) => r.source.scrape_status === scrapeFilter);
    if (tierFilter) items = items.filter((r) => tierFromRow(r) === tierFilter);
    if (analysisFilter)
      items = items.filter((r) => r.analysis === analysisFilter);
    if (includedFilter === "included")
      items = items.filter((r) => r.source.is_included);
    else if (includedFilter === "excluded")
      items = items.filter((r) => !r.source.is_included);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (r) =>
          (r.source.title ?? "").toLowerCase().includes(q) ||
          (r.source.hostname ?? "").toLowerCase().includes(q) ||
          (r.source.url ?? "").toLowerCase().includes(q),
      );
    }
    return items;
  }, [
    rows,
    keywordFilter,
    tagFilter,
    scrapeFilter,
    tierFilter,
    analysisFilter,
    includedFilter,
    search,
  ]);

  // Comparator for the active sort axis. Un-set values always sort last,
  // regardless of direction (matches the SourceList convention).
  const sortRows = useMemo(() => {
    return (items: CurationRow[]): CurationRow[] => {
      if (!sort) {
        // Default order: importance score, highest first.
        return [...items].sort(
          (a, b) => (b.importance?.score ?? 0) - (a.importance?.score ?? 0),
        );
      }
      const dir = sort.dir === "desc" ? -1 : 1;
      const valueOf = (r: CurationRow): string | number | null => {
        switch (sort.key) {
          case "rank":
            return r.importance?.bestRank ?? null;
          case "source":
            return (
              r.source.hostname ??
              r.source.title ??
              r.source.url ??
              ""
            ).toLowerCase();
          case "scrape":
            return r.source.scrape_status ?? null;
          case "authority":
            return r.source.authority_score ?? null;
          case "chars":
            return r.charCount ?? null;
          case "analysis":
            return ANALYSIS_SORT[r.analysis];
          case "tags":
            return r.tags.length;
          case "included":
            return r.source.is_included ? 1 : 0;
        }
      };
      return [...items].sort((a, b) => {
        const av = valueOf(a);
        const bv = valueOf(b);
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return av < bv ? -1 * dir : 1 * dir;
      });
    };
  }, [sort]);

  const groups = useMemo(() => {
    if (groupBy === "keyword") {
      const g = keywords.map((k) => {
        const kwRows = filtered.filter((r) =>
          r.importance?.perKeyword?.some((p) => p.keyword_id === k.id),
        );
        return {
          key: k.id,
          label: k.keyword,
          // Default view = this keyword's search-rank order; any explicit
          // column sort is honored within the group instead.
          rows:
            sort === null
              ? [...kwRows].sort(
                  (a, b) =>
                    (rankInKeyword(a, k.id) ?? Infinity) -
                    (rankInKeyword(b, k.id) ?? Infinity),
                )
              : sortRows(kwRows),
        };
      });
      const none = filtered.filter(
        (r) => !r.importance || r.importance.perKeyword.length === 0,
      );
      if (none.length)
        g.push({ key: "__none", label: "No keyword", rows: sortRows(none) });
      return g.filter((x) => x.rows.length > 0);
    }
    if (groupBy === "tag") {
      const g = tags.map((t) => ({
        key: t.id,
        label: t.name,
        rows: sortRows(
          filtered.filter((r) => r.tags.some((x) => x.id === t.id)),
        ),
      }));
      const untagged = filtered.filter((r) => r.tags.length === 0);
      if (untagged.length)
        g.push({
          key: "__untagged",
          label: "Untagged",
          rows: sortRows(untagged),
        });
      return g.filter((x) => x.rows.length > 0);
    }
    return [{ key: "__all", label: "", rows: sortRows(filtered) }];
  }, [filtered, groupBy, keywords, tags, sort, sortRows]);

  // Unique visible source ids (a source can appear in multiple keyword/tag groups)
  const visibleIds = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) for (const r of g.rows) set.add(r.source.id);
    return set;
  }, [groups]);

  // "Are all CURRENTLY-VISIBLE rows selected" — not size-equality (the
  // selection can hold off-screen ids from other searches).
  const allVisibleSelected =
    visibleIds.size > 0 && [...visibleIds].every((id) => selected.has(id));

  // Toggle ONLY the visible rows in/out of the existing selection — never
  // discard off-screen selections. This is what makes the "select all → search
  // junk → deselect visible → … → tag the remainder" workflow work.
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // One tri-state toggle (asc → desc → none) shared by EVERY column header.
  const handleSort = (field: SortKey) =>
    setSort((prev) => {
      if (prev?.key !== field) return { key: field, dir: "asc" };
      if (prev.dir === "asc") return { key: field, dir: "desc" };
      return null;
    });

  const runBulk = async (
    action: "include" | "exclude" | "mark_stale" | "mark_complete",
    label: string,
  ) => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await bulkUpdateSources(topicId, {
        action,
        source_ids: [...selected],
      });
      toast.success(`${label} ${selected.size} source(s)`);
      refresh();
      // Keep the selection so the user can chain actions (tag, then exclude…).
    } catch (err) {
      toast.error(
        `Bulk action failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleAddTag = async (tagId: string) => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await addTagToSources(tagId, [...selected]);
      const name = tags.find((t) => t.id === tagId)?.name ?? "tag";
      toast.success(`Tagged ${selected.size} source(s) with "${name}"`);
      refresh();
    } catch (err) {
      toast.error(
        `Tagging failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTag = async (name: string) => {
    setCreatingTag(true);
    try {
      const tag = await createTag(topicId, { name });
      await addTagToSources(tag.id, [...selected]);
      toast.success(
        `Created "${tag.name}" · tagged ${selected.size} source(s)`,
      );
      setCreateTagOpen(false);
      refresh();
    } catch (err) {
      toast.error(
        `Couldn't create tag: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setCreatingTag(false);
    }
  };

  const toggleIncluded = async (id: string, current: boolean) => {
    try {
      await updateSource(id, { is_included: !current });
      refresh();
    } catch (err) {
      toast.error(
        `Couldn't update: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  };

  // Top bar keeps GROUPING + the broad facet filters. Per-column sort + the
  // per-column header filters (Scrape / Authority tier / Analysis / Tag) compose
  // (AND) with these — exactly the SourceList model.
  const filterDefs: FilterDef[] = useMemo(() => {
    const opt = (
      key: string,
      label: string,
      allLabel: string,
      options: FilterOption[],
      selectedId: string | null,
      onSelect: (id: string | null) => void,
    ): FilterDef => ({ key, label, allLabel, options, selectedId, onSelect });

    const defs: FilterDef[] = [
      opt(
        "group",
        "Group",
        "No grouping",
        [
          { id: "keyword", label: "By keyword" },
          { id: "tag", label: "By tag" },
        ],
        groupBy === "none" ? null : groupBy,
        (id) => setGroupBy((id as GroupBy) ?? "none"),
      ),
      opt(
        "included",
        "Show",
        "All",
        [
          { id: "included", label: "Included" },
          { id: "excluded", label: "Excluded" },
        ],
        includedFilter,
        setIncludedFilter,
      ),
    ];
    if (keywords.length > 0)
      defs.push(
        opt(
          "keyword",
          "Keyword",
          "All keywords",
          keywords.map((k) => ({ id: k.id, label: k.keyword })),
          keywordFilter,
          setKeywordFilter,
        ),
      );
    if (tags.length > 0)
      defs.push(
        opt(
          "tag",
          "Tag",
          "All tags",
          tags.map((t) => ({ id: t.id, label: t.name })),
          tagFilter,
          setTagFilter,
        ),
      );
    return defs;
  }, [groupBy, includedFilter, keywordFilter, tagFilter, keywords, tags]);

  // Per-column header filter options.
  const scrapeFilterOptions: ColumnFilterOption[] = useMemo(
    () => [
      { id: "success", label: "Success" },
      { id: "complete", label: "Complete" },
      { id: "thin", label: "Thin" },
      { id: "failed", label: "Failed" },
      { id: "pending", label: "Pending" },
    ],
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
  const analysisFilterOptions: ColumnFilterOption[] = useMemo(
    () => [
      { id: "content", label: "Report ready" },
      { id: "empty", label: "No content" },
      { id: "failed", label: "Failed" },
      { id: "none", label: "Not analyzed" },
    ],
    [],
  );
  const tagFilterOptions: ColumnFilterOption[] = useMemo(
    () => tags.map((t) => ({ id: t.id, label: t.name })),
    [tags],
  );

  const sortKey = sort?.key ?? null;
  const sortDir = sort?.dir ?? "asc";
  const colCount = 9;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-3 sm:px-4 pt-3 pb-2">
        <ResearchFilterBar
          title="Curate"
          count={isLoading ? "—" : `${visibleIds.size}/${rows.length}`}
          filters={filterDefs}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search title, host, url…"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Clean up the set — exclude the junk, keep the best — then run the
          final synthesis on what remains.
        </p>
      </div>

      <div className="flex-1 overflow-auto px-3 sm:px-4 pb-24">
        {isLoading ? (
          <div className="space-y-1.5 pt-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-9 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 text-center">
            <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center">
              <ListChecks className="h-6 w-6 text-primary/40" />
            </div>
            <p className="text-xs font-medium text-foreground/70">
              No sources yet — run search to populate the workbench.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="[&>th]:border-b [&>th]:border-border/60 [&>th]:py-1.5">
                <th className="pl-1 pr-1 w-8 align-middle">
                  <Checkbox
                    aria-label="Select all visible"
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="px-1 w-16 align-middle">
                  <SortHeader
                    label="Rank"
                    field="rank"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-1 align-middle">
                  <SortHeader
                    label="Source"
                    field="source"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-2 align-middle whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <SortHeader
                      label="Scrape"
                      field="scrape"
                      currentSort={sortKey}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                    <ColumnFilterMenu
                      label="Scrape"
                      options={scrapeFilterOptions}
                      selectedId={scrapeFilter}
                      onSelect={setScrapeFilter}
                    />
                  </div>
                </th>
                <th className="px-2 align-middle whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <SortHeader
                      label="Authority"
                      field="authority"
                      currentSort={sortKey}
                      currentDir={sortDir}
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
                <th className="px-2 align-middle whitespace-nowrap text-right">
                  <SortHeader
                    label="Chars"
                    field="chars"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="justify-end"
                  />
                </th>
                <th className="px-2 align-middle whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <SortHeader
                      label="Analysis"
                      field="analysis"
                      currentSort={sortKey}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                    <ColumnFilterMenu
                      label="Analysis"
                      options={analysisFilterOptions}
                      selectedId={analysisFilter}
                      onSelect={setAnalysisFilter}
                    />
                  </div>
                </th>
                <th className="px-2 align-middle whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <SortHeader
                      label="Tags"
                      field="tags"
                      currentSort={sortKey}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                    {tagFilterOptions.length > 0 && (
                      <ColumnFilterMenu
                        label="Tag"
                        options={tagFilterOptions}
                        selectedId={tagFilter}
                        onSelect={setTagFilter}
                      />
                    )}
                  </div>
                </th>
                <th className="px-2 w-12 align-middle text-center">
                  <SortHeader
                    label="In"
                    field="included"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    className="justify-center w-full"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <GroupRows
                  key={group.key}
                  group={group}
                  groupBy={groupBy}
                  colCount={colCount}
                  topicId={topicId}
                  selected={selected}
                  onToggleOne={toggleOne}
                  onToggleIncluded={toggleIncluded}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CurationBatchBar
        selectedCount={selected.size}
        tags={tags}
        onInclude={() => runBulk("include", "Included")}
        onExclude={() => runBulk("exclude", "Excluded")}
        onAddTag={handleAddTag}
        onCreateTag={() => setCreateTagOpen(true)}
        onClear={() => setSelected(new Set())}
        busy={busy}
      />

      <TextInputDialog
        open={createTagOpen}
        onOpenChange={(o) => !creatingTag && setCreateTagOpen(o)}
        title="New tag dimension"
        description={`Create a tag and assign the ${selected.size} selected source(s) to it.`}
        placeholder="e.g. Economic Impact"
        confirmLabel="Create & tag"
        busy={creatingTag}
        onConfirm={handleCreateTag}
      />
    </div>
  );
}

function GroupRows({
  group,
  groupBy,
  colCount,
  topicId,
  selected,
  onToggleOne,
  onToggleIncluded,
}: {
  group: { key: string; label: string; rows: CurationRow[] };
  groupBy: GroupBy;
  colCount: number;
  topicId: string;
  selected: Set<string>;
  onToggleOne: (id: string) => void;
  onToggleIncluded: (id: string, current: boolean) => void;
}) {
  return (
    <>
      {groupBy !== "none" && (
        <tr>
          <td
            colSpan={colCount}
            className="bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-y border-border/40"
          >
            {group.label}{" "}
            <span className="text-muted-foreground/60">
              ({group.rows.length})
            </span>
          </td>
        </tr>
      )}
      {group.rows.map((r) => {
        const s = r.source;
        const isSel = selected.has(s.id);
        return (
          <tr
            key={`${group.key}:${s.id}`}
            className={cn(
              "border-b border-border/20 hover:bg-muted/30 transition-colors",
              !s.is_included && "opacity-50",
              isSel && "bg-primary/[0.04]",
            )}
          >
            <td className="py-1.5 pl-1 pr-1 align-middle">
              <Checkbox
                aria-label="Select source"
                checked={isSel}
                onCheckedChange={() => onToggleOne(s.id)}
              />
            </td>
            <td
              className="py-1.5 px-1 align-middle"
              title={
                r.importance
                  ? `Importance ${r.importance.score} — composite of search ranks across ${r.importance.keywordCount} keyword${r.importance.keywordCount === 1 ? "" : "s"} (rewards ranking well for many keywords)`
                  : "Not ranked for any keyword"
              }
            >
              {r.importance?.bestRank != null ? (
                <>
                  <div className="text-sm font-semibold tabular-nums leading-none">
                    #{r.importance.bestRank}
                  </div>
                  {r.importance.keywordCount > 1 && (
                    <div className="mt-0.5 text-[9px] text-muted-foreground tabular-nums">
                      in {r.importance.keywordCount} kw
                    </div>
                  )}
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">—</span>
              )}
            </td>
            <td className="py-1.5 px-1 align-middle">
              <div className="flex items-start gap-1.5 min-w-0">
                <SourceTypeIcon type={sourceTypeFromDb(s.source_type)} />
                <div className="min-w-0">
                  <Link
                    href={`/research/topics/${topicId}/sources/${s.id}`}
                    className="text-xs font-medium truncate max-w-[22rem] block hover:text-primary hover:underline"
                  >
                    {s.title || s.hostname || s.url}
                  </Link>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="truncate max-w-[16rem]">{s.hostname}</span>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-foreground"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>
              </div>
            </td>
            <td className="py-1.5 px-2 align-middle">
              <StatusBadge status={s.scrape_status} />
            </td>
            <td className="py-1.5 px-2 align-middle">
              {s.authority_score != null ? (
                <AuthorityTierBadge
                  score={s.authority_score}
                  tier={s.authority_tier}
                  reasoning={s.authority_reasoning}
                />
              ) : (
                <span className="text-[11px] text-muted-foreground/40">—</span>
              )}
            </td>
            <td className="py-1.5 px-2 align-middle text-right text-[11px] tabular-nums whitespace-nowrap text-muted-foreground">
              {fmtInt(r.charCount)}
            </td>
            <td className="py-1.5 px-2 align-middle">
              <AnalysisCell state={r.analysis} />
            </td>
            <td className="py-1.5 px-2 align-middle">
              <div className="flex flex-wrap gap-1 max-w-[14rem]">
                {r.tags.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex rounded border border-border/60 bg-muted/30 px-1.5 py-px text-[10px] text-muted-foreground truncate max-w-[8rem]"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            </td>
            <td className="py-1.5 px-2 align-middle text-center">
              <IncludedCell
                included={!!s.is_included}
                onToggle={() => onToggleIncluded(s.id, !!s.is_included)}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}

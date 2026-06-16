"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, ExternalLink, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import { CurationBatchBar } from "./CurationBatchBar";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { ResearchFilterBar, type FilterDef } from "../shared/ResearchFilterBar";
import type { FilterOption } from "@/components/hierarchy-filter/HierarchyFilterPill";

type GroupBy = "none" | "keyword" | "tag";
type SortBy = "importance" | "size" | "analysis";

const ANALYSIS_BADGE: Record<
  CurationAnalysisState,
  { label: string; cls: string }
> = {
  content: {
    label: "Analyzed",
    cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  empty: {
    label: "No content",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  failed: {
    label: "Failed",
    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  none: { label: "—", cls: "text-muted-foreground" },
};

const ANALYSIS_SORT: Record<CurationAnalysisState, number> = {
  content: 3,
  empty: 2,
  failed: 1,
  none: 0,
};

function fmtSize(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function rankInKeyword(row: CurationRow, keywordId: string): number | null {
  return (
    row.importance?.perKeyword.find((p) => p.keyword_id === keywordId)?.rank ??
    null
  );
}

export default function CurationTable() {
  const { topicId } = useTopicContext();
  const { data, isLoading, refresh } = useCurationData(topicId);

  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [sortBy, setSortBy] = useState<SortBy>("importance");
  const [keywordFilter, setKeywordFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [scrapeFilter, setScrapeFilter] = useState<string | null>(null);
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
  }, [rows, keywordFilter, tagFilter, scrapeFilter, includedFilter, search]);

  const sortRows = (items: CurationRow[]): CurationRow[] =>
    [...items].sort((a, b) => {
      if (sortBy === "size") return (b.charCount ?? 0) - (a.charCount ?? 0);
      if (sortBy === "analysis")
        return ANALYSIS_SORT[b.analysis] - ANALYSIS_SORT[a.analysis];
      return (b.importance?.score ?? 0) - (a.importance?.score ?? 0);
    });

  const groups = useMemo(() => {
    if (groupBy === "keyword") {
      const g = keywords.map((k) => {
        const kwRows = filtered.filter((r) =>
          r.importance?.perKeyword?.some((p) => p.keyword_id === k.id),
        );
        return {
          key: k.id,
          label: k.keyword,
          // Default view = this keyword's search-rank order; an explicit
          // size/analysis sort is honored instead.
          rows:
            sortBy === "importance"
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
        rows: sortRows(filtered.filter((r) => r.tags.some((x) => x.id === t.id))),
      }));
      const untagged = filtered.filter((r) => r.tags.length === 0);
      if (untagged.length)
        g.push({ key: "__untagged", label: "Untagged", rows: sortRows(untagged) });
      return g.filter((x) => x.rows.length > 0);
    }
    return [{ key: "__all", label: "", rows: sortRows(filtered) }];
  }, [filtered, groupBy, keywords, tags, sortBy]);

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
      toast.success(`Created "${tag.name}" · tagged ${selected.size} source(s)`);
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
        "sort",
        "Sort",
        "Importance",
        [
          { id: "size", label: "Content size" },
          { id: "analysis", label: "Analysis" },
        ],
        sortBy === "importance" ? null : sortBy,
        (id) => setSortBy((id as SortBy) ?? "importance"),
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
      opt(
        "scrape",
        "Scrape",
        "All",
        [
          { id: "success", label: "Success" },
          { id: "thin", label: "Thin" },
          { id: "failed", label: "Failed" },
          { id: "pending", label: "Pending" },
        ],
        scrapeFilter,
        setScrapeFilter,
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
  }, [
    groupBy,
    sortBy,
    includedFilter,
    scrapeFilter,
    keywordFilter,
    tagFilter,
    keywords,
    tags,
  ]);

  const colCount = 8;

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
          Clean up the set — exclude the junk, keep the best — then run the final
          synthesis on what remains.
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
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pl-1 pr-1 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all visible"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 cursor-pointer accent-primary align-middle"
                  />
                </th>
                <th className="py-1.5 px-1 w-16 font-medium">Rank</th>
                <th className="py-1.5 px-1 font-medium">Source</th>
                <th className="py-1.5 px-2 font-medium whitespace-nowrap">
                  Scrape
                </th>
                <th className="py-1.5 px-2 font-medium whitespace-nowrap">
                  Size
                </th>
                <th className="py-1.5 px-2 font-medium whitespace-nowrap">
                  Analysis
                </th>
                <th className="py-1.5 px-2 font-medium">Tags</th>
                <th className="py-1.5 px-2 w-12 font-medium text-center">In</th>
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
            <span className="text-muted-foreground/60">({group.rows.length})</span>
          </td>
        </tr>
      )}
      {group.rows.map((r) => {
        const s = r.source;
        const isSel = selected.has(s.id);
        const ana = ANALYSIS_BADGE[r.analysis];
        const huge = (r.charCount ?? 0) >= 20000;
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
              <input
                type="checkbox"
                aria-label="Select source"
                checked={isSel}
                onChange={() => onToggleOne(s.id)}
                className="h-3.5 w-3.5 cursor-pointer accent-primary align-middle"
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
            <td
              className={cn(
                "py-1.5 px-2 align-middle text-[11px] tabular-nums whitespace-nowrap",
                huge ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground",
              )}
              title={huge ? "Large page — likely has junk worth trimming" : undefined}
            >
              {fmtSize(r.charCount)}
            </td>
            <td className="py-1.5 px-2 align-middle">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium whitespace-nowrap",
                  ana.cls,
                )}
              >
                {ana.label}
              </span>
            </td>
            <td className="py-1.5 px-2 align-middle">
              <div className="flex flex-wrap gap-1 max-w-[14rem]">
                {r.tags.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex rounded-full border border-border/60 bg-muted/30 px-1.5 py-px text-[10px] text-muted-foreground truncate max-w-[8rem]"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            </td>
            <td className="py-1.5 px-2 align-middle text-center">
              <button
                onClick={() => onToggleIncluded(s.id, !!s.is_included)}
                aria-label={s.is_included ? "Exclude" : "Include"}
                title={s.is_included ? "Included — click to exclude" : "Excluded — click to include"}
                className={cn(
                  "inline-flex items-center justify-center h-6 w-6 rounded-md transition-colors",
                  s.is_included
                    ? "text-green-600 dark:text-green-400 hover:bg-green-500/10"
                    : "text-muted-foreground/50 hover:bg-muted",
                )}
              >
                {s.is_included ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
              </button>
            </td>
          </tr>
        );
      })}
    </>
  );
}

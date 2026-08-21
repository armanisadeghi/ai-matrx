"use client";

/**
 * The keyword ledger — every GSC-active keyword with its band, score, source,
 * and the full why chain inline. Server-paged and server-sorted through
 * getValueReview; this component renders exactly what the resolver returned.
 */

import { ArrowDown, ArrowUp, Gavel } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ValueReviewQuery, ValueReviewRow } from "../../types";
import { ReasonChain } from "./ReasonChain";
import { TierMenu } from "./TierMenu";
import { bandMeta, fmtInt, fmtScore, type BandMeta } from "./lib";

type SortKey = NonNullable<ValueReviewQuery["sort"]>;

function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = currentSort === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {label}
      {active ? (
        currentDir === "desc" ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUp className="h-3 w-3" />
        )
      ) : null}
    </button>
  );
}

export function KeywordTable({
  rows,
  bandIndex,
  settableBands,
  sort,
  sortDir,
  onSort,
  selected,
  onToggleRow,
  onTogglePage,
  pending,
  onRule,
}: {
  rows: ValueReviewRow[];
  bandIndex: Map<string, BandMeta>;
  settableBands: BandMeta[];
  sort: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  selected: Map<string, ValueReviewRow>;
  onToggleRow: (row: ValueReviewRow) => void;
  onTogglePage: (rows: ValueReviewRow[], select: boolean) => void;
  pending: boolean;
  onRule: (keywordIds: string[], tier: string | null, notes?: string) => void;
}) {
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.keyword_id));

  return (
    <table className="w-full min-w-[880px] table-fixed border-collapse">
      <thead className="sticky top-0 z-10 bg-background">
        <tr className="border-b border-border">
          <th className="w-8 px-2 py-1.5">
            <Checkbox
              checked={allOnPageSelected}
              onCheckedChange={(v) => onTogglePage(rows, v === true)}
              aria-label="Select all keywords on this page"
              className="h-3.5 w-3.5"
            />
          </th>
          <th className="w-[24%] px-2 py-1.5 text-left">
            <SortHeader
              label="Keyword"
              sortKey="keyword"
              currentSort={sort}
              currentDir={sortDir}
              onSort={onSort}
            />
          </th>
          <th className="w-24 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Band
          </th>
          <th className="w-16 px-2 py-1.5 text-right">
            <SortHeader
              label="Score"
              sortKey="score"
              currentSort={sort}
              currentDir={sortDir}
              onSort={onSort}
              className="ml-auto"
            />
          </th>
          <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Why
          </th>
          <th className="w-24 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Class
          </th>
          <th className="w-[72px] px-2 py-1.5 text-right">
            <SortHeader
              label="Clicks"
              sortKey="clicks"
              currentSort={sort}
              currentDir={sortDir}
              onSort={onSort}
              className="ml-auto"
            />
          </th>
          <th className="w-20 px-2 py-1.5 text-right">
            <SortHeader
              label="Impr"
              sortKey="impressions"
              currentSort={sort}
              currentDir={sortDir}
              onSort={onSort}
              className="ml-auto"
            />
          </th>
          <th className="w-9 px-1 py-1.5" aria-label="Rule this keyword" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const meta = bandMeta(bandIndex, row.value_band);
          const isSelected = selected.has(row.keyword_id);
          return (
            <tr
              key={row.keyword_id}
              className={cn(
                "group border-b border-border/60 transition-colors",
                isSelected ? "bg-accent/60" : "odd:bg-muted/20 hover:bg-accent/40",
              )}
            >
              <td className="px-2 py-1">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleRow(row)}
                  aria-label={`Select "${row.keyword}"`}
                  className="h-3.5 w-3.5"
                />
              </td>
              <td className="px-2 py-1">
                <span className="block truncate text-sm text-foreground" title={row.keyword}>
                  {row.keyword}
                </span>
              </td>
              <td className="px-2 py-1">
                <span
                  className={cn(
                    "inline-flex max-w-full items-center gap-1 truncate rounded-full border px-1.5 py-px text-[11px] font-medium leading-tight",
                    meta.tone.chip,
                  )}
                  title={meta.description ?? undefined}
                >
                  {row.value_source === "override" ? (
                    <Gavel className="h-2.5 w-2.5 shrink-0" />
                  ) : null}
                  <span className="truncate">{meta.label}</span>
                </span>
              </td>
              <td className="px-2 py-1 text-right text-sm tabular-nums text-foreground">
                {fmtScore(row.value_score)}
              </td>
              <td className="max-w-0 px-2 py-1">
                <ReasonChain
                  reasons={row.reasons}
                  source={row.value_source}
                  score={row.value_score}
                  bandLabel={meta.label}
                  keyword={row.keyword}
                />
              </td>
              <td className="px-2 py-1">
                <span className="block truncate text-xs text-muted-foreground">
                  {row.traffic_class || "—"}
                </span>
              </td>
              <td className="px-2 py-1 text-right text-sm tabular-nums text-foreground">
                {fmtInt(row.clicks)}
              </td>
              <td className="px-2 py-1 text-right text-sm tabular-nums text-muted-foreground">
                {fmtInt(row.impressions)}
              </td>
              <td className="px-1 py-1 text-right">
                <TierMenu
                  bands={settableBands}
                  hasOverride={row.value_source === "override"}
                  count={1}
                  pending={pending}
                  onApply={(tier, notes) => onRule([row.keyword_id], tier, notes)}
                  trigger={
                    <button
                      type="button"
                      title={`Rule the worth of "${row.keyword}"`}
                      className={cn(
                        "rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                        row.value_source === "override"
                          ? "opacity-100"
                          : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                      )}
                    >
                      <Gavel className="h-3.5 w-3.5" />
                    </button>
                  }
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

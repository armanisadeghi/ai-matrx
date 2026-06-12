// features/kg-suggestions/components/manager/SuggestionsTable.tsx
//
// The dense, desktop manager table. Sortable columns drive SERVER-SIDE sort via
// `patchQuery`. Each row expands to the canonical `KgSuggestionRowItem` decision
// card (the single shared UX), so the table is a fast triage surface and the
// expanded card is the full decision surface. Star, quick accept/defer/reject
// (pending rows) and restore (decided rows) are inline. Unseen rows get a dot.
//
// Mobile renders a stacked card list instead (see SuggestionsManager) — tables
// are banned on phones.

"use client";

import {
  ChevronDown,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  RotateCcw,
  Star,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectKgRowMutation } from "@/lib/redux/slices/kgSuggestionsSlice";
import { ScopeGlyph } from "@/features/scope-system/components/ScopeGlyph";
import { KgSuggestionRowItem } from "@/features/kg-suggestions/components/KgSuggestionRowItem";
import {
  isHeavyHitter,
  type KgAcceptResult,
  type KgEnrichedSuggestionRow,
  type KgSuggestionSortField,
  type KgSuggestionStatus,
  type KgSuggestionsQuery,
} from "@/features/kg-suggestions/types";

const STATUS_STYLE: Record<KgSuggestionStatus, string> = {
  pending: "border-primary/40 text-primary",
  accepted: "border-success/40 text-success",
  rejected: "border-destructive/40 text-destructive",
  deferred: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  expired: "border-border text-muted-foreground",
};

export interface SuggestionsTableProps {
  rows: KgEnrichedSuggestionRow[];
  query: KgSuggestionsQuery;
  patchQuery: (patch: Partial<KgSuggestionsQuery>) => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  accept: (id: string) => Promise<KgAcceptResult>;
  reject: (id: string, note?: string | null) => Promise<unknown>;
  defer: (id: string, note?: string | null) => Promise<unknown>;
  star: (id: string, starred: boolean) => Promise<void>;
  restore: (id: string) => Promise<void>;
}

const COL_COUNT = 11;

export function SuggestionsTable({
  rows,
  query,
  patchQuery,
  expandedId,
  onToggleExpand,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  accept,
  reject,
  defer,
  star,
  restore,
}: SuggestionsTableProps) {
  const sortBy = query.sortBy ?? "created_at";
  const sortDir = query.sortDir ?? "desc";
  const setSort = (field: KgSuggestionSortField) => {
    if (sortBy === field) {
      patchQuery({ sortDir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      patchQuery({ sortBy: field, sortDir: "desc" });
    }
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="min-w-[60rem]">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="w-8 px-2 py-1.5">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleSelectAll}
                aria-label="Select all"
              />
            </th>
            <th className="w-7 px-1 py-1.5" />
            <th className="px-2 py-1.5 font-medium">Type</th>
            <SortHead
              label="Scope"
              field="scope_name"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setSort}
            />
            <SortHead
              label="Field"
              field="item_label"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setSort}
            />
            <th className="px-2 py-1.5 font-medium">Proposed value</th>
            <SortHead
              label="Org"
              field="org_name"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setSort}
            />
            <SortHead
              label="Conf."
              field="confidence"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setSort}
            />
            <SortHead
              label="Status"
              field="status"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setSort}
            />
            <SortHead
              label="Detected"
              field="created_at"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setSort}
            />
            <th className="px-2 py-1.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SuggestionTableRow
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              onToggleExpand={() => onToggleExpand(row.id)}
              selected={selected.has(row.id)}
              onToggleSelect={() => onToggleSelect(row.id)}
              accept={accept}
              reject={reject}
              defer={defer}
              star={star}
              restore={restore}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortHead({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  field: KgSuggestionSortField;
  sortBy: KgSuggestionSortField;
  sortDir: "asc" | "desc";
  onSort: (field: KgSuggestionSortField) => void;
}) {
  const active = sortBy === field;
  return (
    <th className="px-2 py-1.5 font-medium">
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "inline-flex items-center gap-0.5 hover:text-foreground transition-colors",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </th>
  );
}

function SuggestionTableRow({
  row,
  expanded,
  onToggleExpand,
  selected,
  onToggleSelect,
  accept,
  reject,
  defer,
  star,
  restore,
}: {
  row: KgEnrichedSuggestionRow;
  expanded: boolean;
  onToggleExpand: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  accept: (id: string) => Promise<KgAcceptResult>;
  reject: (id: string, note?: string | null) => Promise<unknown>;
  defer: (id: string, note?: string | null) => Promise<unknown>;
  star: (id: string, starred: boolean) => Promise<void>;
  restore: (id: string) => Promise<void>;
}) {
  const mutation = useAppSelector((s) => selectKgRowMutation(s, row.id));
  const busy = mutation !== "idle";
  const unseen = !row.viewed_at;
  const isPending = row.status === "pending";
  const canQuickAccept = isPending && !isHeavyHitter(row);

  const fieldLabel =
    row.itemLabel ??
    row.target.slot_name ??
    (row.stage === "association" ? "Scope link" : "—");

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/50 align-top hover:bg-accent/40 transition-colors",
          expanded && "bg-accent/30",
        )}
      >
        <td className="px-2 py-1.5">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            aria-label="Select row"
          />
        </td>
        <td className="px-1 py-1.5">
          <button
            type="button"
            onClick={() => star(row.id, !row.is_starred)}
            aria-label={row.is_starred ? "Unstar" : "Star"}
            className="text-muted-foreground hover:text-amber-500 transition-colors"
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                row.is_starred && "fill-amber-400 text-amber-500",
              )}
            />
          </button>
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1 text-muted-foreground">
            {row.scopeTypeIcon ? (
              <ScopeGlyph
                icon={row.scopeTypeIcon}
                className="h-3 w-3 shrink-0"
              />
            ) : null}
            <span className="truncate max-w-[8rem]">
              {row.scopeTypeLabel ?? "—"}
            </span>
          </div>
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            {unseen ? (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                aria-label="New"
              />
            ) : null}
            <span className="font-medium text-foreground truncate max-w-[10rem]">
              {row.scopeName ?? "—"}
            </span>
          </div>
        </td>
        <td className="px-2 py-1.5 text-foreground/90 truncate max-w-[9rem]">
          {fieldLabel}
        </td>
        <td className="px-2 py-1.5 max-w-[14rem]">
          <div className="truncate font-mono text-foreground/90">
            {row.suggested_value ?? "—"}
          </div>
          {row.current_value_snapshot ? (
            <div className="truncate font-mono text-[10px] text-muted-foreground line-through">
              {row.current_value_snapshot}
            </div>
          ) : null}
        </td>
        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[8rem]">
          {row.orgName ?? "—"}
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-10 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.round(Math.max(0, Math.min(1, row.confidence)) * 100)}%`,
                }}
              />
            </div>
            <span className="tabular-nums text-muted-foreground">
              {Math.round(Math.max(0, Math.min(1, row.confidence)) * 100)}%
            </span>
          </div>
        </td>
        <td className="px-2 py-1.5">
          <Badge
            variant="outline"
            className={cn(
              "h-4 px-1.5 text-[10px] capitalize",
              STATUS_STYLE[row.status],
            )}
          >
            {row.status}
          </Badge>
        </td>
        <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
          {formatRelative(row.created_at)}
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center justify-end gap-0.5">
            {canQuickAccept ? (
              <>
                <IconAction
                  title="Accept"
                  busy={busy}
                  onClick={() => void accept(row.id)}
                  className="text-success hover:bg-success/10"
                >
                  <Check className="h-3.5 w-3.5" />
                </IconAction>
                <IconAction
                  title="Defer 7 days"
                  busy={busy}
                  onClick={() => void defer(row.id)}
                  className="text-muted-foreground hover:bg-accent"
                >
                  <Clock className="h-3.5 w-3.5" />
                </IconAction>
                <IconAction
                  title="Reject"
                  busy={busy}
                  onClick={() => void reject(row.id)}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <X className="h-3.5 w-3.5" />
                </IconAction>
              </>
            ) : !isPending ? (
              <IconAction
                title="Restore to pending"
                busy={busy}
                onClick={() => void restore(row.id)}
                className="text-muted-foreground hover:bg-accent"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </IconAction>
            ) : null}
            <IconAction
              title={expanded ? "Collapse" : "Expand"}
              busy={false}
              onClick={onToggleExpand}
              className="text-muted-foreground hover:bg-accent"
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </IconAction>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={COL_COUNT} className="px-3 py-2">
            <div className="max-w-3xl">
              <KgSuggestionRowItem
                row={row}
                accept={accept}
                reject={reject}
                defer={defer}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function IconAction({
  title,
  busy,
  onClick,
  className,
  children,
}: {
  title: string;
  busy: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={busy}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded transition-colors disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.round(mo / 12)}y`;
}

export default SuggestionsTable;

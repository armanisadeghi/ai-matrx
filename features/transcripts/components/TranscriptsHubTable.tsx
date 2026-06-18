"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Eye,
  ListFilter,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  compareTimestamps,
  formatAbsoluteDate,
  formatRelativeTime,
  toEpochMs,
} from "@/utils/datetime";
import type {
  HubTreeNode,
  TranscriptHubItem,
} from "@/features/transcripts/types/hub";
import { hubItemKey } from "@/features/transcripts/types/hub";
import {
  formatHubDuration,
  hubItemDetails,
  hubItemDurationSeconds,
  hubItemWordCount,
  KIND_META,
  primaryHubHref,
} from "@/features/transcripts/utils/hubDisplay";

export type TranscriptsHubTableRow = TranscriptHubItem;

type SortKey = "type" | "title" | "duration" | "words" | "updated";

type UpdatedFilter =
  | "any"
  | "hour"
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year";

type TypeFilter = "any" | TranscriptHubItem["kind"];

type ColumnFilters = {
  type: TypeFilter;
  title: string;
  updated: UpdatedFilter;
};

const EMPTY_COLUMN_FILTERS: ColumnFilters = {
  type: "any",
  title: "",
  updated: "any",
};

const UPDATED_FILTER_OPTIONS: ReadonlyArray<{
  value: UpdatedFilter;
  label: string;
}> = [
  { value: "any", label: "Any time" },
  { value: "hour", label: "Last hour" },
  { value: "today", label: "Last 24 hours" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
  { value: "quarter", label: "Last 90 days" },
  { value: "year", label: "Last year" },
];

const TYPE_FILTER_OPTIONS: ReadonlyArray<{
  value: TypeFilter;
  label: string;
}> = [
  { value: "any", label: "All types" },
  { value: "processor", label: "Transcript" },
  { value: "session", label: "Session" },
  { value: "cleanup", label: "Cleanup" },
  { value: "unsorted", label: "Unsorted" },
  { value: "recording", label: "Recording" },
];

function hasActiveColumnFilters(filters: ColumnFilters): boolean {
  return (
    filters.type !== "any" ||
    filters.title.trim().length > 0 ||
    filters.updated !== "any"
  );
}

function passesUpdatedFilter(
  updatedAt: string,
  filter: UpdatedFilter,
): boolean {
  if (filter === "any") return true;
  const updated = toEpochMs(updatedAt);
  if (Number.isNaN(updated)) return false;
  const age = Date.now() - updated;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  switch (filter) {
    case "hour":
      return age <= hour;
    case "today":
      return age <= day;
    case "week":
      return age <= 7 * day;
    case "month":
      return age <= 30 * day;
    case "quarter":
      return age <= 90 * day;
    case "year":
      return age <= 365 * day;
    default:
      return true;
  }
}

function ColumnFilterButton({
  active,
  label,
  children,
  align = "start",
}: {
  active: boolean;
  label: string;
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Filter ${label}`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "rounded p-0.5 transition-colors",
            active
              ? "text-primary hover:text-primary/80"
              : "text-muted-foreground/40 hover:text-muted-foreground",
          )}
        >
          <ListFilter className={cn("h-3 w-3", active && "fill-primary/20")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side="bottom"
        className="w-auto p-3"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function TextColumnFilter({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-[200px]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Filter: {label}
        </p>
        {value.trim().length > 0 && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange("")}
          >
            clear
          </button>
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
    </div>
  );
}

function OptionColumnFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-[180px]">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Filter: {label}
      </p>
      <div className="flex flex-col gap-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded px-2 py-1 text-left text-xs hover:bg-accent",
              value === opt.value && "bg-accent font-medium",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type VisibleTreeRow = {
  item: TranscriptHubItem;
  depth: number;
  hasChildren: boolean;
  isChild: boolean;
  itemKey: string;
};

function collectParentKeys(nodes: HubTreeNode[]): Set<string> {
  const keys = new Set<string>();
  const walk = (list: HubTreeNode[]) => {
    for (const node of list) {
      if (node.children.length > 0) {
        keys.add(hubItemKey(node.item));
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return keys;
}

function flattenVisibleTree(
  nodes: HubTreeNode[],
  collapsed: Set<string>,
): VisibleTreeRow[] {
  const out: VisibleTreeRow[] = [];
  const walk = (list: HubTreeNode[], depth: number) => {
    for (const node of list) {
      const key = hubItemKey(node.item);
      const hasChildren = node.children.length > 0;
      out.push({
        item: node.item,
        depth,
        hasChildren,
        isChild: depth > 0,
        itemKey: key,
      });
      if (hasChildren && !collapsed.has(key)) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(nodes, 0);
  return out;
}

function sortParentNodes(
  nodes: HubTreeNode[],
  sortKey: SortKey,
  sortDir: "asc" | "desc",
): HubTreeNode[] {
  const arr = [...nodes];
  const dir = sortDir === "asc" ? 1 : -1;
  arr.sort((a, b) => {
    const left = a.item;
    const right = b.item;
    switch (sortKey) {
      case "type":
        return (
          KIND_META[left.kind].label.localeCompare(
            KIND_META[right.kind].label,
          ) * dir || left.title.localeCompare(right.title)
        );
      case "title":
        return left.title.localeCompare(right.title) * dir;
      case "duration":
        return (
          (hubItemDurationSeconds(left) - hubItemDurationSeconds(right)) *
            dir || left.title.localeCompare(right.title)
        );
      case "words":
        return (
          (hubItemWordCount(left) - hubItemWordCount(right)) * dir ||
          left.title.localeCompare(right.title)
        );
      case "updated":
        return (
          compareTimestamps(left.updatedAt, right.updatedAt) * dir ||
          left.title.localeCompare(right.title)
        );
      default:
        return 0;
    }
  });
  return arr;
}

export function TranscriptsHubTable({
  items,
  tree = null,
}: {
  items: TranscriptsHubTableRow[];
  tree?: HubTreeNode[] | null;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = React.useState<SortKey>("updated");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFilters>(EMPTY_COLUMN_FILTERS);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  const treeSignature = React.useMemo(() => {
    if (!tree) return "";
    return tree.map((n) => hubItemKey(n.item)).join("|");
  }, [tree]);

  React.useEffect(() => {
    if (!tree) {
      setCollapsed(new Set());
      return;
    }
    setCollapsed(collectParentKeys(tree));
  }, [treeSignature, tree]);

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const patchFilters = (patch: Partial<ColumnFilters>) => {
    setColumnFilters((prev) => ({ ...prev, ...patch }));
  };

  const passesParentFilters = React.useCallback(
    (item: TranscriptHubItem) => {
      const titleQ = columnFilters.title.trim().toLowerCase();
      if (columnFilters.type !== "any" && item.kind !== columnFilters.type) {
        return false;
      }
      if (titleQ && !item.title.toLowerCase().includes(titleQ)) return false;
      if (!passesUpdatedFilter(item.updatedAt, columnFilters.updated)) {
        return false;
      }
      return true;
    },
    [columnFilters],
  );

  const filtered = React.useMemo(() => {
    return items.filter(passesParentFilters);
  }, [items, passesParentFilters]);

  const sorted = React.useMemo(() => {
    if (tree) return filtered;
    const arr = [...filtered];
    return sortParentNodes(
      arr.map((item) => ({ item, children: [] })),
      sortKey,
      sortDir,
    ).map((n) => n.item);
  }, [filtered, sortKey, sortDir, tree]);

  const filteredTree = React.useMemo(() => {
    if (!tree) return null;
    return tree.filter((node) => passesParentFilters(node.item));
  }, [tree, passesParentFilters]);

  const sortedTree = React.useMemo(() => {
    if (!filteredTree) return null;
    return sortParentNodes(filteredTree, sortKey, sortDir);
  }, [filteredTree, sortKey, sortDir]);

  const treeRows = React.useMemo(() => {
    if (!sortedTree) return null;
    return flattenVisibleTree(sortedTree, collapsed);
  }, [sortedTree, collapsed]);

  const displayRows =
    treeRows ??
    sorted.map((item) => ({
      item,
      depth: 0,
      hasChildren: false,
      isChild: false,
      itemKey: hubItemKey(item),
    }));

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(
        key === "updated" || key === "duration" || key === "words"
          ? "desc"
          : "asc",
      );
    }
  };

  const filtersActive = hasActiveColumnFilters(columnFilters);

  const ColumnHead = ({
    k,
    children,
    className,
    align = "left",
    filter,
  }: {
    k: SortKey;
    children: React.ReactNode;
    className?: string;
    align?: "left" | "right";
    filter: React.ReactNode | null;
  }) => (
    <TableHead className={className}>
      <div
        className={cn(
          "inline-flex items-center gap-0.5",
          align === "right" && "justify-end w-full",
        )}
      >
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground transition-colors text-xs",
            align === "right" && "justify-end",
          )}
        >
          {children}
          {sortKey === k ? (
            sortDir === "asc" ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )
          ) : (
            <ChevronsUpDown className="h-3 w-3 opacity-40" />
          )}
        </button>
        {filter}
      </div>
    </TableHead>
  );

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {filtersActive && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">
            Column filters active (parents only)
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setColumnFilters(EMPTY_COLUMN_FILTERS)}
          >
            Clear all
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <ColumnHead
              k="type"
              className="w-28"
              filter={
                <ColumnFilterButton
                  active={columnFilters.type !== "any"}
                  label="type"
                >
                  <OptionColumnFilter
                    label="Type"
                    value={columnFilters.type}
                    options={TYPE_FILTER_OPTIONS}
                    onChange={(type) => patchFilters({ type })}
                  />
                </ColumnFilterButton>
              }
            >
              Type
            </ColumnHead>
            <ColumnHead
              k="title"
              filter={
                <ColumnFilterButton
                  active={columnFilters.title.trim().length > 0}
                  label="title"
                >
                  <TextColumnFilter
                    label="Title"
                    value={columnFilters.title}
                    placeholder="Contains…"
                    onChange={(title) => patchFilters({ title })}
                  />
                </ColumnFilterButton>
              }
            >
              Title
            </ColumnHead>
            <TableHead className="min-w-[160px] text-xs">Details</TableHead>
            <ColumnHead
              k="duration"
              className="w-24 text-right"
              align="right"
              filter={null}
            >
              Duration
            </ColumnHead>
            <ColumnHead
              k="words"
              className="w-20 text-right"
              align="right"
              filter={null}
            >
              Words
            </ColumnHead>
            <ColumnHead
              k="updated"
              className="w-32"
              filter={
                <ColumnFilterButton
                  active={columnFilters.updated !== "any"}
                  label="updated"
                >
                  <OptionColumnFilter
                    label="Updated"
                    value={columnFilters.updated}
                    options={UPDATED_FILTER_OPTIONS}
                    onChange={(updated) => patchFilters({ updated })}
                  />
                </ColumnFilterButton>
              }
            >
              Updated
            </ColumnHead>
            <TableHead className="w-20 text-right text-xs">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayRows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={7}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                No items match these filters.
              </TableCell>
            </TableRow>
          ) : (
            displayRows.map((row) => {
              const { item, depth, hasChildren, isChild, itemKey } = row;
              const href = primaryHubHref(item);
              const meta = KIND_META[item.kind];
              const details = hubItemDetails(item);
              const isCollapsed = collapsed.has(itemKey);

              return (
                <TableRow
                  key={itemKey}
                  className={cn(
                    "cursor-pointer",
                    isChild
                      ? "bg-muted/45 hover:bg-muted/60 border-l-2 border-l-primary/15"
                      : "hover:bg-muted/30",
                    hasChildren && !isChild && "bg-card",
                  )}
                  onClick={() => {
                    if (hasChildren) {
                      toggleCollapse(itemKey);
                      return;
                    }
                    router.push(href);
                  }}
                >
                  <TableCell className="py-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-medium uppercase tracking-wide",
                        meta.accent,
                        isChild && "opacity-80",
                      )}
                    >
                      {meta.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 max-w-[280px]">
                    <div
                      className={cn(
                        "min-w-0 flex items-start gap-1",
                        depth === 1 && "pl-4",
                        depth === 2 && "pl-8",
                        depth >= 3 && "pl-12",
                      )}
                    >
                      {hasChildren ? (
                        <span className="mt-0.5 shrink-0 text-muted-foreground">
                          {isCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </span>
                      ) : isChild ? (
                        <span className="w-5 shrink-0" />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-sm truncate",
                            hasChildren && !isChild
                              ? "font-medium"
                              : "font-medium",
                            isChild && "font-normal text-muted-foreground",
                          )}
                        >
                          {item.title}
                        </span>
                        {item.kind === "processor" && item.description ? (
                          <span className="block text-xs text-muted-foreground truncate mt-0.5">
                            {item.description}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    <span className="line-clamp-2">{details || "—"}</span>
                  </TableCell>
                  <TableCell className="py-2 text-right text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                    {formatHubDuration(hubItemDurationSeconds(item))}
                  </TableCell>
                  <TableCell className="py-2 text-right text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                    {item.kind === "processor" && item.wordCount != null
                      ? item.wordCount.toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                    <span title={formatAbsoluteDate(item.updatedAt)}>
                      {formatRelativeTime(item.updatedAt, { style: "long" })}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <div
                      className="flex justify-end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button asChild size="sm" variant="ghost">
                        <Link href={href}>
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Open
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

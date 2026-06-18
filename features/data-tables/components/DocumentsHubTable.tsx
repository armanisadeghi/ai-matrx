"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Eye,
  ListFilter,
  Trash,
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
import type { DocumentRow, DocumentSource } from "@/features/data-tables/types";
import { documentSourceLabel } from "@/features/data-tables/utils/documentsHubDisplay";

type SortKey = "name" | "description" | "source" | "created" | "updated";

type UpdatedFilter =
  | "any"
  | "hour"
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year";

type SourceFilter = "any" | DocumentSource;

type ColumnFilters = {
  name: string;
  description: string;
  source: SourceFilter;
  created: UpdatedFilter;
  updated: UpdatedFilter;
};

const EMPTY_COLUMN_FILTERS: ColumnFilters = {
  name: "",
  description: "",
  source: "any",
  created: "any",
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

const SOURCE_FILTER_OPTIONS: ReadonlyArray<{
  value: SourceFilter;
  label: string;
}> = [
  { value: "any", label: "All sources" },
  { value: "created", label: "Created" },
  { value: "imported_docx", label: "Imported DOCX" },
  { value: "imported_md", label: "Imported Markdown" },
  { value: "imported_txt", label: "Imported Text" },
];

function hasActiveColumnFilters(filters: ColumnFilters): boolean {
  return (
    filters.name.trim().length > 0 ||
    filters.description.trim().length > 0 ||
    filters.source !== "any" ||
    filters.created !== "any" ||
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

export function DocumentsHubTable({
  documents,
  onDelete,
}: {
  documents: DocumentRow[];
  onDelete: (doc: DocumentRow) => void;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = React.useState<SortKey>("updated");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFilters>(EMPTY_COLUMN_FILTERS);

  const patchFilters = (patch: Partial<ColumnFilters>) => {
    setColumnFilters((prev) => ({ ...prev, ...patch }));
  };

  const passesFilters = React.useCallback(
    (doc: DocumentRow) => {
      const nameQ = columnFilters.name.trim().toLowerCase();
      const descQ = columnFilters.description.trim().toLowerCase();
      if (nameQ && !doc.document_name.toLowerCase().includes(nameQ)) {
        return false;
      }
      if (descQ && !(doc.description?.toLowerCase().includes(descQ) ?? false)) {
        return false;
      }
      if (
        columnFilters.source !== "any" &&
        doc.source !== columnFilters.source
      ) {
        return false;
      }
      if (!passesUpdatedFilter(doc.created_at, columnFilters.created)) {
        return false;
      }
      if (!passesUpdatedFilter(doc.updated_at, columnFilters.updated)) {
        return false;
      }
      return true;
    },
    [columnFilters],
  );

  const filtered = React.useMemo(
    () => documents.filter(passesFilters),
    [documents, passesFilters],
  );

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return (
            a.document_name.localeCompare(b.document_name) * dir ||
            compareTimestamps(a.updated_at, b.updated_at)
          );
        case "description":
          return (
            (a.description ?? "").localeCompare(b.description ?? "") * dir ||
            a.document_name.localeCompare(b.document_name)
          );
        case "source":
          return (
            documentSourceLabel(a.source).localeCompare(
              documentSourceLabel(b.source),
            ) * dir || a.document_name.localeCompare(b.document_name)
          );
        case "created":
          return (
            compareTimestamps(a.created_at, b.created_at) * dir ||
            a.document_name.localeCompare(b.document_name)
          );
        case "updated":
          return (
            compareTimestamps(a.updated_at, b.updated_at) * dir ||
            a.document_name.localeCompare(b.document_name)
          );
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "updated" || key === "created" ? "desc" : "asc");
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
            Column filters active
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
              k="name"
              filter={
                <ColumnFilterButton
                  active={columnFilters.name.trim().length > 0}
                  label="name"
                >
                  <TextColumnFilter
                    label="Name"
                    value={columnFilters.name}
                    placeholder="Contains…"
                    onChange={(name) => patchFilters({ name })}
                  />
                </ColumnFilterButton>
              }
            >
              Name
            </ColumnHead>
            <ColumnHead
              k="description"
              className="min-w-[160px]"
              filter={
                <ColumnFilterButton
                  active={columnFilters.description.trim().length > 0}
                  label="description"
                >
                  <TextColumnFilter
                    label="Description"
                    value={columnFilters.description}
                    placeholder="Contains…"
                    onChange={(description) => patchFilters({ description })}
                  />
                </ColumnFilterButton>
              }
            >
              Description
            </ColumnHead>
            <ColumnHead
              k="source"
              className="w-36"
              filter={
                <ColumnFilterButton
                  active={columnFilters.source !== "any"}
                  label="source"
                >
                  <OptionColumnFilter
                    label="Source"
                    value={columnFilters.source}
                    options={SOURCE_FILTER_OPTIONS}
                    onChange={(source) => patchFilters({ source })}
                  />
                </ColumnFilterButton>
              }
            >
              Source
            </ColumnHead>
            <ColumnHead
              k="created"
              className="w-32"
              filter={
                <ColumnFilterButton
                  active={columnFilters.created !== "any"}
                  label="created"
                >
                  <OptionColumnFilter
                    label="Created"
                    value={columnFilters.created}
                    options={UPDATED_FILTER_OPTIONS}
                    onChange={(created) => patchFilters({ created })}
                  />
                </ColumnFilterButton>
              }
            >
              Created
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
            <TableHead className="w-24 text-right text-xs">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={6}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                No documents match these filters.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((doc) => {
              const href = `/documents/${doc.id}`;
              return (
                <TableRow
                  key={doc.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => router.push(href)}
                >
                  <TableCell className="py-2 max-w-[280px]">
                    <div className="min-w-0">
                      <span className="block text-sm font-medium truncate">
                        {doc.document_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground max-w-[240px]">
                    <span className="line-clamp-2 break-words">
                      {doc.description || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-medium uppercase tracking-wide"
                    >
                      {documentSourceLabel(doc.source)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                    <span title={formatAbsoluteDate(doc.created_at)}>
                      {formatRelativeTime(doc.created_at, { style: "long" })}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                    <span title={formatAbsoluteDate(doc.updated_at)}>
                      {formatRelativeTime(doc.updated_at, { style: "long" })}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <div
                      className="flex justify-end gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button asChild size="sm" variant="ghost">
                        <Link href={href}>
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Open
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Delete document"
                        onClick={() => onDelete(doc)}
                      >
                        <Trash className="h-3.5 w-3.5 text-destructive" />
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

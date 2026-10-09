"use client";

/**
 * Collection items viewer (W2-C) — paged, schema-driven inbox for one
 * collection: field_schema keys become columns (JSON preview for undeclared
 * keys), unread rows badge on seen_at, All/Unread/Spam/Archived tabs, search,
 * row + bulk triage (seen / spam / archive / delete), client-side CSV export
 * from items_export. Opening a row marks it seen.
 *
 * IT USES THE PLATFORM'S ONE GRID VOCABULARY, not a private one (2026-08-25).
 * This was a hand-rolled HTML table with no sorting and no filtering while every
 * other grid on the platform already shared a model. It now reuses:
 *
 *   - `ColumnHeaderMenu` — per-column sort + the filter that offers the
 *     column's ACTUAL VALUES with counts, the same control the user data
 *     tables have. Its facets come from `items_facets`.
 *   - `useTableViewUrlState` — search / sort / column filters / page live in
 *     the URL, so a narrowed view is a link you can send someone.
 *   - `FormattedFieldValue` + the field-format registry — a URL cell renders
 *     as a link, a datetime as a date, a boolean as a chip, instead of every
 *     column being raw truncated text.
 *
 * EVERY ONE OF THOSE IS RESOLVED IN THE DATABASE (`cms_collection_items_page`).
 * Filtering the 50 rows on screen and then paginating THAT would be a grid that
 * lies about its own data; parity between the SQL and browser implementations
 * of the filter model is pinned by `column-filter-parity.fixture.json`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { tableToCsv } from "@/components/mardown-display/tables/table-csv";
import { CmsCollectionService } from "@/features/cms/services/cmsService";
import type {
  CollectionExportRow,
  CollectionItemFilter,
  SiteCollection,
  SiteCollectionItem,
} from "@/features/cms/types";
import { CollectionItemEditorDialog } from "@/features/cms/components/collections/CollectionItemEditorDialog";
import { useTableViewUrlState } from "@/features/data-tables/hooks/useTableViewUrlState";
import { activeFiltersOnly } from "@/features/data-tables/table-view-url";
import { FormattedFieldValue } from "@/lib/field-formats/FormattedFieldValue";
import { defaultFormatForBase } from "@ai-matrx/design-system/field-formats";
import { readFieldFormatConfig } from "@ai-matrx/design-system/field-formats";
import type {
  ColumnFilter,
  ColumnFilterMap,
} from "@/features/data-tables/column-filters";
import type { ColumnFacets } from "@/features/data-tables/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MatrxDataTable,
  dateFilterBounds,
  type ColumnFiltersState,
  type MatrxColumnDef,
  type MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table";
import {
  AlertCircle,
  Archive,
  ChevronLeft,
  Download,
  Pencil,
  Plus,
  Inbox,
  Loader2,
  MailCheck,
  MailX,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { downloadFile } from "@ai-matrx/kit/download";
import { toast } from "@/lib/toast";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { ReadFailure } from "@ai-matrx/design-system";

const FILTERS: { value: CollectionItemFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "spam", label: "Spam" },
  { value: "archived", label: "Archived" },
];

/** Max schema-driven columns before the rest collapses into the JSON preview. */
const MAX_DATA_COLUMNS = 4;

/**
 * Own-property read for visitor-submitted `data`. A schema key that shadows a
 * prototype member (`constructor`, `toString`, …) must never surface the
 * prototype's value as if a visitor had submitted it.
 */
function extraJson(item: SiteCollectionItem, columnKeys: string[]): string {
  const extra = Object.fromEntries(
    Object.entries(item.data ?? {}).filter(([k]) => !columnKeys.includes(k)),
  );
  return Object.keys(extra).length > 0 ? JSON.stringify(extra) : "";
}

function readField(
  data: Record<string, unknown> | null | undefined,
  key: string,
): unknown {
  if (!data) return undefined;
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  // JSON.stringify returns undefined for functions/symbols — the `: string`
  // annotation was a lie without this guard.
  if (typeof value === "function" || typeof value === "symbol") return "";
  return JSON.stringify(value) ?? "";
}

function buildCsv(
  items: CollectionExportRow[],
  schemaKeys: string[],
): string {
  const extraKeys = new Set<string>();
  for (const item of items) {
    for (const key of Object.keys(item.data ?? {})) {
      if (!schemaKeys.includes(key)) extraKeys.add(key);
    }
  }
  const dataKeys = [...schemaKeys, ...extraKeys];
  const metaKeys = [
    "id",
    "created_at",
    "status",
    "is_spam",
    "seen_at",
    "source_url",
  ] as const;
  // Visitor-submitted data: Alchemy's writer prefixes `'` on text a spreadsheet would run as a formula.
  return tableToCsv(
    [...dataKeys, ...metaKeys],
    items.map((item) => [
      ...dataKeys.map((k) => cellText(readField(item.data, k))),
      ...metaKeys.map((k) => cellText(item[k])),
    ]),
  );
}

/**
 * The database speaks the data-tables filter vocabulary (`values` / `text` /
 * `range`); the shared table speaks its own. The URL keeps the first one — a
 * narrowed view is a link — and these two translate at the table's edge.
 */
function filtersToTable(
  filters: ColumnFilterMap,
  dataTypes: Map<string, string>,
): ColumnFiltersState {
  const out: ColumnFiltersState = {};
  for (const [field, f] of Object.entries(filters)) {
    const type = field === "created_at" ? "datetime" : (dataTypes.get(field) ?? "text");
    if (f.mode === "text") out[field] = { kind: "text", value: f.text };
    else if (f.mode === "values")
      out[field] = {
        kind: "select",
        value: f.values[0] ?? "",
        values: f.values,
        negated: f.negate,
      };
    else if (type === "number") {
      const min = f.min.trim() === "" ? undefined : Number(f.min);
      const max = f.max.trim() === "" ? undefined : Number(f.max);
      out[field] = { kind: "number", min, max };
    } else {
      out[field] = {
        kind: "date",
        ...(f.min.trim() ? { since: f.min } : {}),
        ...(f.max.trim() ? { until: f.max } : {}),
      };
    }
  }
  return out;
}

function filtersFromTable(state: ColumnFiltersState): ColumnFilterMap {
  const out: ColumnFilterMap = {};
  for (const [field, f] of Object.entries(state)) {
    if (!f) continue;
    if (f.kind === "text") {
      if (f.value.trim() !== "") out[field] = { mode: "text", text: f.value };
    } else if (f.kind === "select") {
      const values = f.values ?? (f.value ? [f.value] : []);
      if (values.length > 0)
        out[field] = {
          mode: "values",
          values,
          includeBlank: false,
          negate: f.negated === true,
        };
    } else if (f.kind === "boolean") {
      out[field] = {
        mode: "values",
        values: [String(f.value)],
        includeBlank: false,
        negate: f.negated === true,
      };
    } else if (f.kind === "number") {
      const op = f.op ?? "between";
      const min = op === "lt" ? undefined : f.min;
      const max = op === "gt" ? undefined : f.max;
      if (min !== undefined || max !== undefined)
        out[field] = {
          mode: "range",
          min: min === undefined ? "" : String(min),
          max: max === undefined ? "" : String(max),
        };
    } else if (f.kind === "date") {
      const b = dateFilterBounds(f);
      if (b.since || b.until)
        out[field] = { mode: "range", min: b.since ?? "", max: b.until ?? "" };
    }
  }
  return out;
}

export default function CollectionItemsPage() {
  const { siteId, collectionId } = useParams() as {
    siteId: string;
    collectionId: string;
  };

  const [collection, setCollection] = useState<SiteCollection | null>(null);
  const [items, setItems] = useState<SiteCollectionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<CollectionItemFilter>("all");

  // Search, sort, column filters and the page all live in the URL — a narrowed
  // view is a link. `resetKey` clears them when the collection changes, so a
  // filter naming a column this collection lacks can never silently hide
  // every row.
  const view = useTableViewUrlState({
    defaultPageSize: 50,
    resetKey: collectionId,
  });
  const {
    searchTerm: search,
    sortField,
    sortDirection,
    columnFilters,
    setColumnFilters,
    currentPage: page,
    setCurrentPage: setPage,
  } = view;
  const [searchInput, setSearchInput] = useState(search);
  const perPage = view.limit;

  /** `field[:asc|desc]` for the API, or undefined to use the collection's own. */
  const orderParam = sortField
    ? `${sortField}:${sortDirection === "asc" ? "asc" : "desc"}`
    : undefined;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openItem, setOpenItem] = useState<SiteCollectionItem | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [itemEditorOpen, setItemEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SiteCollectionItem | null>(null);

  const schemaKeys = useMemo(
    () => (collection?.field_schema ?? []).map((f) => f.key),
    [collection],
  );
  const columnKeys = schemaKeys.slice(0, MAX_DATA_COLUMNS);
  const columnLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of collection?.field_schema ?? []) map.set(f.key, f.label);
    return map;
  }, [collection]);

  /**
   * A collection's declared field type IS the column's storage type and its
   * display format — the two things the shared grid vocabulary asks for. A
   * `datetime` column therefore gets a range filter and renders as a date, and
   * a `url` renders as a link, with no per-grid special-casing.
   *
   * `select` and `richtext` map to the storage type they really are (string):
   * a select is a short string with few distinct values, which the shared
   * `defaultFilterMode` already turns into a value checklist on its own.
   */
  const columnDataTypes = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of collection?.field_schema ?? []) {
      map.set(
        f.key,
        f.type === "number"
          ? "number"
          : f.type === "boolean"
            ? "boolean"
            : f.type === "datetime"
              ? "datetime"
              : f.type === "json"
                ? "json"
                : "text",
      );
    }
    return map;
  }, [collection]);

  const columnFormats = useMemo(() => {
    const map = new Map<string, ReturnType<typeof readFieldFormatConfig>>();
    for (const f of collection?.field_schema ?? []) {
      const id =
        f.type === "email"
          ? "email"
          : f.type === "url"
            ? "url"
            : f.type === "richtext"
              ? "markdown"
              : defaultFormatForBase(columnDataTypes.get(f.key) ?? "text");
      map.set(f.key, { id } as NonNullable<
        ReturnType<typeof readFieldFormatConfig>
      >);
    }
    return map;
  }, [collection, columnDataTypes]);

  useEffect(() => {
    CmsCollectionService.getCollection(collectionId)
      .then((c) => setCollection(c))
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Failed to load collection",
        ),
      )
      .finally(() => setIsLoading(false));
  }, [collectionId]);

  const activeFilters = useMemo(
    () => activeFiltersOnly(columnFilters),
    [columnFilters],
  );
  // The map is serialized for the dependency list: a fresh object identity on
  // every render would re-fetch the page forever.
  const activeFiltersKey = JSON.stringify(activeFilters);

  const refreshItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const res = await CmsCollectionService.listItems(collectionId, {
        filter,
        q: search || undefined,
        page,
        perPage,
        order: orderParam,
        columnFilters: activeFilters,
      });
      setItems(res.items);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
    } finally {
      setItemsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, filter, search, page, perPage, orderParam, activeFiltersKey]);

  useEffect(() => {
    void refreshItems();
  }, [refreshItems]);

  useEffect(() => {
    setSelected(new Set());
  }, [filter, search, page, orderParam, activeFiltersKey]);

  // A narrowing change must land the user on page 1 — page 7 of a result set
  // that now has one page shows an empty grid over a non-empty collection.
  const narrowingKey = `${filter}|${search}|${activeFiltersKey}`;
  const lastNarrowing = useRef(narrowingKey);
  useEffect(() => {
    if (lastNarrowing.current === narrowingKey) return;
    lastNarrowing.current = narrowingKey;
    if (page !== 1) setPage(1);
  }, [narrowingKey, page, setPage]);

  const applySort = useCallback(
    (field: string, direction: "asc" | "desc") => {
      view.setSortField(field);
      view.setSortDirection(direction);
    },
    [view],
  );

  const clearSort = useCallback(() => {
    // Clearing returns the grid to the collection's own declared order
    // (`settings.default_order`), not to an arbitrary default — the same order
    // the published page and the agent's `list` use.
    view.setSortField(null);
  }, [view]);

  const applyColumnFilter = useCallback(
    (field: string, next: ColumnFilter | undefined) => {
      const updated = { ...columnFilters };
      if (next) updated[field] = next;
      else delete updated[field];
      setColumnFilters(updated);
    },
    [columnFilters, setColumnFilters],
  );

  /**
   * The value list for a column, counted in the database over every row the
   * tab and search select. The browser only ever holds one page here, so the
   * local-facets path the shared menu prefers can never apply — and a checklist
   * built from one page is exactly the confident wrong answer the facet RPC
   * exists to prevent.
   */
  const fetchColumnFacets = useCallback(
    async (args: { fieldName: string; searchTerm?: string; limit: number }): Promise<ColumnFacets | null> =>
      CmsCollectionService.itemColumnFacets(collectionId, args.fieldName, {
        filter,
        q: args.searchTerm,
        limit: args.limit,
      }),
    [collectionId, filter],
  );

  const markSeenLocally = (ids: string[], seen: boolean) =>
    setItems((prev) =>
      prev.map((it) =>
        ids.includes(it.id)
          ? { ...it, seen_at: seen ? new Date().toISOString() : null }
          : it,
      ),
    );

  const handleOpenItem = (item: SiteCollectionItem) => {
    setOpenItem(item);
    if (!item.seen_at) {
      markSeenLocally([item.id], true);
      CmsCollectionService.setItemFlags([item.id], { seen: true }).catch(
        (err: unknown) => {
          markSeenLocally([item.id], false);
          toast.error(
            err instanceof Error ? err.message : "Failed to mark as seen",
          );
        },
      );
    }
  };

  const bulkFlags = async (
    flags: { seen?: boolean; isSpam?: boolean; status?: "active" | "archived" },
    label: string,
  ) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await CmsCollectionService.setItemFlags(ids, flags);
      toast.success(`${label} (${ids.length})`);
      setSelected(new Set());
      await refreshItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    setBulkBusy(true);
    try {
      await CmsCollectionService.deleteItems(ids);
      toast.success(`Deleted ${ids.length} item(s)`);
      setSelected(new Set());
      setDeleteOpen(false);
      await refreshItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleExport = async () => {
    if (!collection) return;
    setIsExporting(true);
    try {
      const { items: rows, truncated, reason } =
        await CmsCollectionService.exportItems(collectionId, filter);
      if (rows.length === 0) {
        toast.info("Nothing to export for this filter");
        return;
      }
      const csv = buildCsv(rows, schemaKeys);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      downloadFile(`${collection.slug}-${filter}-${new Date().toISOString().slice(0, 10)}.csv`, blob, blob.type);
      if (truncated && reason === "size") {
        toast.warning(
          `Exported the first ${rows.length.toLocaleString()} rows — the response hit its size limit. Narrow the export (pick a filter tab, or archive older items) and run it again to get the rest.`,
          { duration: 10_000 },
        );
      } else if (truncated) {
        toast.warning(
          `Exported the first ${rows.length.toLocaleString()} rows (server row cap). Narrow the filter to export the rest.`,
          { duration: 10_000 },
        );
      } else {
        toast.success(`Exported ${rows.length.toLocaleString()} row(s)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const columns: MatrxColumnDef<SiteCollectionItem>[] = [
    ...columnKeys.map(
      (key): MatrxColumnDef<SiteCollectionItem> => ({
        id: key,
        header: columnLabels.get(key) ?? key,
        accessorFn: (item) => cellText(readField(item.data, key)),
        cell: (item) => (
          <span className={item.seen_at ? undefined : "font-semibold"}>
            {/* The declared field TYPE decides how a cell reads: a url is a
                link, a datetime a date, a boolean a chip. */}
            <FormattedFieldValue
              value={readField(item.data, key)}
              format={columnFormats.get(key) ?? null}
              dataType={columnDataTypes.get(key) ?? "text"}
              plain
            />
          </span>
        ),
        copyValue: (item) => cellText(readField(item.data, key)),
        filter:
          columnDataTypes.get(key) === "number"
            ? "number"
            : columnDataTypes.get(key) === "boolean"
              ? "boolean"
              : columnDataTypes.get(key) === "datetime"
                ? "date"
                : "text",
      }),
    ),
    {
      id: "data",
      header: "Data",
      accessorFn: (item) => extraJson(item, columnKeys),
      cell: (item) => (
        <span className="font-mono text-muted-foreground">
          {extraJson(item, columnKeys)}
        </span>
      ),
      sortable: false,
      filter: false,
    },
    {
      id: "created_at",
      header: "Received",
      accessorFn: (item) => item.created_at,
      cell: (item) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </span>
      ),
      copyValue: (item) => item.created_at,
      filter: "date",
      width: 150,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (item) =>
        [
          item.seen_at ? "" : "New",
          item.is_spam ? "Spam" : "",
          item.status === "archived" ? "Archived" : "",
        ]
          .filter(Boolean)
          .join(", "),
      cell: (item) => (
        <div className="flex items-center gap-1">
          {!item.seen_at && <Badge className="text-[10px] px-1.5">New</Badge>}
          {item.is_spam && (
            <Badge variant="destructive" className="text-[10px] px-1.5">
              Spam
            </Badge>
          )}
          {item.status === "archived" && (
            <Badge variant="outline" className="text-[10px] px-1.5">
              Archived
            </Badge>
          )}
        </div>
      ),
      sortable: false,
      filter: false,
      width: 120,
    },
  ];

  const tableState: MatrxDataTableQueryState = {
    page,
    pageSize: perPage,
    search,
    anyOf: "",
    columnFilters: filtersToTable(columnFilters, columnDataTypes),
    sort: sortField
      ? { id: sortField, direction: sortDirection === "asc" ? "asc" : "desc" }
      : null,
  };

  const handleTableState = (next: MatrxDataTableQueryState) => {
    if (next.search !== search) view.setSearchTerm(next.search.trim());
    if ((next.sort?.id ?? null) !== sortField || (next.sort?.direction ?? null) !== (sortField ? sortDirection : null)) {
      if (next.sort) applySort(next.sort.id, next.sort.direction);
      else clearSort();
    }
    const nextFilters = filtersFromTable(next.columnFilters);
    if (JSON.stringify(activeFiltersOnly(nextFilters)) !== activeFiltersKey)
      setColumnFilters(nextFilters);
    if (next.page !== page) setPage(next.page);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading collection…</p>
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm font-medium">Failed to load collection</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <ErrorAlchemyMenu />
        </div>
      </div>
    );
  }

  return (
    <div className="matrx-touch-targets h-full overflow-auto">
      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="quiet" asChild>
            <Link href={`/cms/${siteId}/collections`}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Collections
            </Link>
          </Button>
          <p className="text-sm font-medium">{collection.name}</p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "outline" : "quiet"}
              onClick={() => {
                setFilter(f.value);
                setPage(1);
              }}
            >
              {f.label}
            </Button>
          ))}
          <span className="ml-2 text-xs text-muted-foreground">
            {total.toLocaleString()} item{total === 1 ? "" : "s"}
          </span>
        </div>

        {/* With rows on screen a failed refresh is said above them; with none, the table slot says it. */}
        {error && items.length > 0 && (
          <div className="text-sm text-destructive-ink flex items-center gap-2 p-3 rounded-md bg-destructive/10">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
            <ErrorAlchemyMenu error={error} />
          </div>
        )}

        {/* Table */}
        {error && items.length === 0 && !itemsLoading ? (
          <ReadFailure
            error={new Error(error)}
            what="this collection's items"
            onRetry={() => void refreshItems()}
          />
        ) : (
          <div className="h-[70dvh] min-h-[360px]">
            <MatrxDataTable<SiteCollectionItem>
              tableId={`cms/collection-items/${collectionId}`}
              data={items}
              columns={columns}
              getRowId={(item) => item.id}
              viewTabs={false}
              detail={{ enabled: false }}
              isLoading={itemsLoading && items.length === 0}
              isFetching={itemsLoading}
              pageSize={perPage}
              query={{
                mode: "controlled",
                state: tableState,
                onStateChange: handleTableState,
                totalItems: total,
                sourceProcessing: {
                  search: "source",
                  sort: "source",
                  columnFilters: "source",
                },
              }}
              onRowOpen={handleOpenItem}
              selection={{
                selectedIds: [...selected],
                onSelectedIdsChange: (ids) => setSelected(new Set(ids)),
                actions: () => (
                  <>
                    <Button
                      icon={<MailCheck />}
                      variant="quiet"
                      disabled={bulkBusy}
                      onClick={() => bulkFlags({ seen: true }, "Marked seen")}
                    >
                      Mark seen
                    </Button>
                    <Button
                      icon={<MailX />}
                      variant="quiet"
                      disabled={bulkBusy}
                      onClick={() => bulkFlags({ seen: false }, "Marked unseen")}
                    >
                      Mark unseen
                    </Button>
                    {filter === "spam" ? (
                      <Button
                        icon={<ShieldCheck />}
                        variant="quiet"
                        disabled={bulkBusy}
                        onClick={() =>
                          bulkFlags({ isSpam: false }, "Marked not spam")
                        }
                      >
                        Not spam
                      </Button>
                    ) : (
                      <Button
                        icon={<ShieldAlert />}
                        variant="quiet"
                        disabled={bulkBusy}
                        onClick={() => bulkFlags({ isSpam: true }, "Marked spam")}
                      >
                        Spam
                      </Button>
                    )}
                    {filter === "archived" ? (
                      <Button
                        icon={<Inbox />}
                        variant="quiet"
                        disabled={bulkBusy}
                        onClick={() => bulkFlags({ status: "active" }, "Restored")}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        icon={<Archive />}
                        variant="quiet"
                        disabled={bulkBusy}
                        onClick={() =>
                          bulkFlags({ status: "archived" }, "Archived")
                        }
                      >
                        Archive
                      </Button>
                    )}
                    <Button
                      icon={<Trash2 />}
                      variant="quiet"
                      disabled={bulkBusy}
                      onClick={() => setDeleteOpen(true)}
                    >
                      Delete
                    </Button>
                    {bulkBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  </>
                ),
              }}
              rowActions={(item) => [
                {
                  id: "edit",
                  icon: Pencil,
                  label: "Edit item",
                  onClick: () => {
                    setEditingItem(item);
                    setItemEditorOpen(true);
                  },
                },
              ]}
              facets={{
                source: async ({ columnId, search: q, limit }) => {
                  const f = await CmsCollectionService.itemColumnFacets(
                    collectionId,
                    columnId,
                    { filter, q: q || undefined, limit },
                  );
                  return f
                    ? {
                        columnId,
                        totalRows: f.total_rows,
                        filled: f.filled,
                        blank: f.blank,
                        distinctCount: f.distinct_count,
                        maxLength: f.max_length,
                        unlistable: f.unlistable,
                        limit: f.limit,
                        truncated: f.truncated,
                        values: f.values,
                        answeredBy: "source" as const,
                        complete: !f.truncated,
                      }
                    : null;
                },
                totalRows: total,
              }}
              toolbar={{
                searchPlaceholder: "Search items…",
                add: {
                  onAdd: () => {
                    setEditingItem(null);
                    setItemEditorOpen(true);
                  },
                },
                actions: (
                  <Button
                    icon={isExporting ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Download />
                    )}
                    variant="outline"
                    onClick={handleExport}
                    disabled={isExporting}
                  >
                    Export CSV
                  </Button>
                ),
              }}
              emptyState={{
                title: search
                  ? "No items match this search"
                  : filter === "all"
                    ? "No items yet"
                    : `No ${filter} items`,
              }}
            />
          </div>
        )}
      </div>

      {/* Item detail */}
      <Dialog
        open={!!openItem}
        onOpenChange={(open) => !open && setOpenItem(null)}
      >
        <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Item detail</DialogTitle>
            <DialogDescription>
              {openItem &&
                `Received ${formatDistanceToNow(new Date(openItem.created_at), { addSuffix: true })}`}
            </DialogDescription>
          </DialogHeader>
          {openItem && (
            <div className="space-y-3">
              <div className="space-y-2">
                {(collection.field_schema.length > 0
                  ? collection.field_schema
                  : Object.keys(openItem.data ?? {}).map((key) => ({
                      key,
                      label: key,
                    }))
                ).map((f) => (
                  <div key={f.key}>
                    <p className="text-xs font-medium text-muted-foreground">
                      {f.label}
                    </p>
                    <p className="text-sm break-words whitespace-pre-wrap">
                      {cellText(readField(openItem.data, f.key)) || "—"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="rounded-md bg-muted/30 p-2.5">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Raw data
                </p>
                <pre data-kind-source="explicit" className="text-xs font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(openItem.data ?? {}, null, 2)}
                </pre>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Source: {openItem.source_url ?? "—"}</span>
                <span>IP: {openItem.ip_address ?? "—"}</span>
                <span className="col-span-2 break-all">
                  Agent: {openItem.user_agent ?? "—"}
                </span>
                <span className="col-span-2 font-mono">ID: {openItem.id}</span>
              </div>
              <div className="flex justify-end">
                <Button
                  icon={<Pencil />}
                  variant="outline"
                  onClick={() => {
                    setEditingItem(openItem);
                    setItemEditorOpen(true);
                  }}
                >
                  Edit item
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CollectionItemEditorDialog
        open={itemEditorOpen}
        onOpenChange={setItemEditorOpen}
        collection={collection}
        item={editingItem}
        onSaved={async () => {
          setOpenItem(null);
          await refreshItems();
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => !bulkBusy && setDeleteOpen(open)}
        // read-gate-exempt: how many items the person has ticked (selection state), not a count from a read
        title={`Delete ${selected.size} item(s)?`}
        description="Items are soft-deleted and disappear from every view, including public reads."
        confirmLabel="Delete"
        variant="destructive"
        busy={bulkBusy}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}

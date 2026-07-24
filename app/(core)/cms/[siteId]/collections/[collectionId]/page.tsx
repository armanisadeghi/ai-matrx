"use client";

/**
 * Collection items viewer (W2-C) — paged, schema-driven inbox for one
 * collection: field_schema keys become columns (JSON preview for undeclared
 * keys), unread rows badge on seen_at, All/Unread/Spam/Archived filters,
 * search, row + bulk triage (seen / spam / archive / delete), client-side CSV
 * export from items_export. Opening a row marks it seen.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { CmsCollectionService } from "@/features/cms/services/cmsService";
import type {
  CollectionItemFilter,
  SiteCollection,
  SiteCollectionItem,
} from "@/features/cms/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  Inbox,
  Loader2,
  MailCheck,
  MailX,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";

const FILTERS: { value: CollectionItemFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "spam", label: "Spam" },
  { value: "archived", label: "Archived" },
];

/** Max schema-driven columns before the rest collapses into the JSON preview. */
const MAX_DATA_COLUMNS = 4;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsv(
  items: SiteCollectionItem[],
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
  const header = [...dataKeys, ...metaKeys].map(csvEscape).join(",");
  const rows = items.map((item) =>
    [
      ...dataKeys.map((k) => csvEscape(cellText(item.data?.[k]))),
      ...metaKeys.map((k) => csvEscape(cellText(item[k]))),
    ].join(","),
  );
  return [header, ...rows].join("\n");
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
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 50;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openItem, setOpenItem] = useState<SiteCollectionItem | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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

  const refreshItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const res = await CmsCollectionService.listItems(collectionId, {
        filter,
        q: search || undefined,
        page,
        perPage,
      });
      setItems(res.items);
      setTotal(res.total);
      if (res.searchTruncated) {
        toast.info(
          "Search scanned the most recent 2,000 items only — enable Searchable on this collection for full-text search.",
        );
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
    } finally {
      setItemsLoading(false);
    }
  }, [collectionId, filter, search, page]);

  useEffect(() => {
    void refreshItems();
  }, [refreshItems]);

  useEffect(() => {
    setSelected(new Set());
  }, [filter, search, page]);

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
      const { items: rows, truncated } =
        await CmsCollectionService.exportItems(collectionId, filter);
      if (rows.length === 0) {
        toast.info("Nothing to export for this filter");
        return;
      }
      const csv = buildCsv(rows, schemaKeys);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${collection.slug}-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        truncated
          ? `Exported the first ${rows.length.toLocaleString()} rows (server cap)`
          : `Exported ${rows.length.toLocaleString()} row(s)`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const allOnPageSelected =
    items.length > 0 && items.every((it) => selected.has(it.id));

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
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1 text-xs" asChild>
            <Link href={`/cms/${siteId}/collections`}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Collections
            </Link>
          </Button>
          <p className="text-sm font-medium">{collection.name}</p>
          <Badge variant="outline" className="text-[10px] font-mono">
            {collection.slug}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(1);
                    setSearch(searchInput.trim());
                  }
                }}
                placeholder="Search items…"
                className="text-sm h-8 pl-8 w-44 sm:w-56"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "secondary" : "ghost"}
              size="sm"
              className="text-xs h-7"
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

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <span className="text-xs font-medium">{selected.size} selected</span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={bulkBusy}
              onClick={() => bulkFlags({ seen: true }, "Marked seen")}
            >
              <MailCheck className="h-3.5 w-3.5" />
              Mark seen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={bulkBusy}
              onClick={() => bulkFlags({ seen: false }, "Marked unseen")}
            >
              <MailX className="h-3.5 w-3.5" />
              Mark unseen
            </Button>
            {filter === "spam" ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={bulkBusy}
                onClick={() => bulkFlags({ isSpam: false }, "Marked not spam")}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Not spam
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={bulkBusy}
                onClick={() => bulkFlags({ isSpam: true }, "Marked spam")}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Spam
              </Button>
            )}
            {filter === "archived" ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={bulkBusy}
                onClick={() => bulkFlags({ status: "active" }, "Restored")}
              >
                <Inbox className="h-3.5 w-3.5" />
                Restore
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={bulkBusy}
                onClick={() => bulkFlags({ status: "archived" }, "Archived")}
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-destructive hover:text-destructive"
              disabled={bulkBusy}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            {bulkBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive flex items-center gap-2 p-3 rounded-md bg-destructive/10">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Table */}
        {itemsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground py-16">
            <Inbox className="h-10 w-10 opacity-30" />
            <p className="text-sm">
              {search
                ? "No items match this search"
                : filter === "all"
                  ? "No items yet"
                  : `No ${filter} items`}
            </p>
            {filter === "all" && !search && (
              <p className="text-xs max-w-md text-center">
                Items appear here when visitors submit through published pages
                or agents write to this collection.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={(v) =>
                        setSelected(
                          v === true
                            ? new Set(items.map((it) => it.id))
                            : new Set(),
                        )
                      }
                      aria-label="Select all on page"
                    />
                  </TableHead>
                  {columnKeys.map((key) => (
                    <TableHead key={key} className="text-xs">
                      {columnLabels.get(key) ?? key}
                    </TableHead>
                  ))}
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Received</TableHead>
                  <TableHead className="text-xs w-20">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const unread = !item.seen_at;
                  const extra = Object.fromEntries(
                    Object.entries(item.data ?? {}).filter(
                      ([k]) => !columnKeys.includes(k),
                    ),
                  );
                  return (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => handleOpenItem(item)}
                    >
                      <TableCell
                        className="w-8"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={(v) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (v === true) next.add(item.id);
                              else next.delete(item.id);
                              return next;
                            })
                          }
                          aria-label="Select item"
                        />
                      </TableCell>
                      {columnKeys.map((key) => (
                        <TableCell
                          key={key}
                          className={`text-xs max-w-48 truncate ${unread ? "font-semibold" : ""}`}
                        >
                          {cellText(item.data?.[key]) || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="text-xs max-w-56 truncate font-mono text-muted-foreground">
                        {Object.keys(extra).length > 0
                          ? JSON.stringify(extra)
                          : ""}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(item.created_at), {
                          addSuffix: true,
                        })}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1">
                          {unread && (
                            <Badge className="text-[10px] px-1.5">New</Badge>
                          )}
                          {item.is_spam && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] px-1.5"
                            >
                              Spam
                            </Badge>
                          )}
                          {item.status === "archived" && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5"
                            >
                              Archived
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page <= 1 || itemsLoading}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages || itemsLoading}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
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
                      {cellText(openItem.data?.[f.key]) || "—"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="rounded-md bg-muted/30 p-2.5">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Raw data
                </p>
                <pre className="text-xs font-mono whitespace-pre-wrap break-all">
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => !bulkBusy && setDeleteOpen(open)}
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

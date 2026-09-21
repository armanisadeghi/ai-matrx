"use client";

import React, { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { idMatchesQuery } from "@ai-matrx/kit/search-scoring";
import type { HtmlPageSummary } from "@/features/html-pages/types";
import HtmlPageGridView, {
  formatRelativeDate,
} from "@/features/html-pages/components/HtmlPageGridView";
import { HtmlPagesContextMenu } from "@/features/html-pages/components/HtmlPagesContextMenu";
import { PromoteToSiteDialog } from "@/features/html-pages/components/PromoteToSiteDialog";
import { setHtmlPagesNavOrder } from "@/features/html-pages/utils/nav-order";
import {
  HTML_PAGES_GRID_INITIAL,
  htmlPagesListStateToSearchParams,
  parseHtmlPagesListState,
  saveHtmlPagesListReturn,
  saveHtmlPagesListScroll,
  type HtmlPagesListState,
  type HtmlPagesSortField,
  type HtmlPagesViewMode,
} from "@/features/html-pages/utils/list-url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
  MatrxDataTableToolbar,
} from "@ai-matrx/design-system/data-table/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  X,
  Loader2,
  AlertCircle,
  FileCode,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
  RefreshCw,
  Globe,
  Copy,
  Check,
  LayoutGrid,
  List,
  Rocket,
} from "lucide-react";
import { toast } from "@/lib/toast";

interface HtmlPageListViewProps {
  pages: HtmlPageSummary[];
  isLoading: boolean;
  error: string | null;
  onOpenPage: (
    pageId: string,
    opts?: { e?: React.MouseEvent; tab?: "preview" | "meta" | "html" },
  ) => void;
  onCreatePage: () => void;
  onDeletePage: (pageId: string) => void;
  onRefresh: () => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  restoreScrollTop?: number | null;
}

export default function HtmlPageListView({
  pages,
  isLoading,
  error,
  onOpenPage,
  onCreatePage,
  onDeletePage,
  onRefresh,
  scrollContainerRef,
  restoreScrollTop,
}: HtmlPageListViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listState = useMemo(
    () => parseHtmlPagesListState(searchParams),
    [searchParams],
  );
  const {
    view: viewMode,
    q: search,
    indexableOnly,
    sort: sortField,
    dir: sortDir,
    n: visibleCount,
  } = listState;

  const [deleteTarget, setDeleteTarget] =
    React.useState<HtmlPageSummary | null>(null);
  const [promoteTarget, setPromoteTarget] =
    React.useState<HtmlPageSummary | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [busyDelete, setBusyDelete] = React.useState(false);
  const [tableQuery, setTableQuery] = React.useState<MatrxDataTableQueryState>({
    page: 1,
    pageSize: 25,
    search,
    anyOf: "",
    columnFilters: {},
    sort: { id: sortField, direction: sortDir },
  });
  const listStateRef = useRef(listState);
  listStateRef.current = listState;
  const restoredScroll = useRef(false);

  const replaceListState = (patch: Partial<HtmlPagesListState>) => {
    // Keep sequential toolbar events together before Next has committed its URL replace.
    const current = listStateRef.current;
    const next: HtmlPagesListState = { ...current, ...patch };
    if (patch.view === "table") {
      next.n = HTML_PAGES_GRID_INITIAL;
    } else if (patch.view === "grid" && next.n < HTML_PAGES_GRID_INITIAL) {
      next.n = HTML_PAGES_GRID_INITIAL;
    }
    if (
      patch.q !== undefined ||
      patch.indexableOnly !== undefined ||
      patch.sort !== undefined ||
      patch.dir !== undefined
    ) {
      next.n = HTML_PAGES_GRID_INITIAL;
    }
    listStateRef.current = next;
    const qs = htmlPagesListStateToSearchParams(next).toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    router.replace(href, { scroll: false });
    saveHtmlPagesListReturn(qs);
  };

  // Persist current query for editor back-nav even before first replace.
  useEffect(() => {
    saveHtmlPagesListReturn(searchParams.toString());
  }, [searchParams]);

  // Restore scroll after list paints (returning from editor).
  useEffect(() => {
    if (restoredScroll.current) return;
    if (restoreScrollTop == null) return;
    if (isLoading && pages.length === 0) return;
    const el = scrollContainerRef?.current;
    if (!el) return;

    let attempts = 0;
    const tryRestore = () => {
      attempts += 1;
      // Wait until content is tall enough to hold the saved offset (grid may still be mounting).
      if (
        el.scrollHeight >= restoreScrollTop + el.clientHeight * 0.5 ||
        attempts >= 20
      ) {
        el.scrollTop = restoreScrollTop;
        restoredScroll.current = true;
        return;
      }
      requestAnimationFrame(tryRestore);
    };
    requestAnimationFrame(tryRestore);
  }, [
    restoreScrollTop,
    isLoading,
    pages.length,
    scrollContainerRef,
    viewMode,
    visibleCount,
  ]);

  const filtered = useMemo(() => {
    let result = [...pages];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.meta_title.toLowerCase().includes(q) ||
          (p.meta_description ?? "").toLowerCase().includes(q) ||
          (p.meta_keywords ?? "").toLowerCase().includes(q) ||
          idMatchesQuery(p, q),
      );
    }

    if (indexableOnly) {
      result = result.filter((p) => p.is_indexable);
    }

    result.sort((a, b) => {
      let aVal: string | number | boolean = "";
      let bVal: string | number | boolean = "";

      switch (sortField) {
        case "meta_title":
          aVal = a.meta_title.toLowerCase();
          bVal = b.meta_title.toLowerCase();
          break;
        case "meta_description":
          aVal = (a.meta_description ?? "").toLowerCase();
          bVal = (b.meta_description ?? "").toLowerCase();
          break;
        case "meta_keywords":
          aVal = (a.meta_keywords ?? "").toLowerCase();
          bVal = (b.meta_keywords ?? "").toLowerCase();
          break;
        case "id":
          aVal = a.id;
          bVal = b.id;
          break;
        case "url":
          aVal = a.url;
          bVal = b.url;
          break;
        case "updated_at":
          aVal = a.updated_at ?? a.created_at;
          bVal = b.updated_at ?? b.created_at;
          break;
        case "created_at":
          aVal = a.created_at;
          bVal = b.created_at;
          break;
        case "is_indexable":
          aVal = a.is_indexable ? 1 : 0;
          bVal = b.is_indexable ? 1 : 0;
          break;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [pages, search, indexableOnly, sortField, sortDir]);

  useEffect(() => {
    setHtmlPagesNavOrder(filtered.map((p) => p.id));
  }, [filtered]);

  const listReturnQuery = useMemo(
    () => htmlPagesListStateToSearchParams(listState).toString(),
    [listState],
  );

  const setViewPersist = (mode: HtmlPagesViewMode) => {
    replaceListState({ view: mode });
  };

  const captureScrollAndOpen = (
    pageId: string,
    opts?: { e?: React.MouseEvent; tab?: "preview" | "meta" | "html" },
  ) => {
    const el = scrollContainerRef?.current;
    if (el) saveHtmlPagesListScroll(el.scrollTop);
    saveHtmlPagesListReturn(listReturnQuery);
    onOpenPage(pageId, opts);
  };

  const copyUrl = async (page: HtmlPageSummary) => {
    try {
      await navigator.clipboard.writeText(page.url);
      setCopiedId(page.id);
      toast.success("URL copied");
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("Failed to copy URL");
    }
  };

  if (isLoading && pages.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading published pages…</p>
        </div>
      </div>
    );
  }

  if (error && pages.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm font-medium">Failed to load pages</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1400px] mx-auto">
      {viewMode === "grid" && (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search pages…"
              value={search}
              onChange={(event) => replaceListState({ q: event.target.value })}
              className="h-8 pl-8 text-sm"
              style={{ fontSize: "16px" }}
            />
            {search && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => replaceListState({ q: "" })}
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            variant={indexableOnly ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => replaceListState({ indexableOnly: !indexableOnly })}
          >
            <Globe className="h-3.5 w-3.5" />
            Indexable only
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onRefresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <div className="sm:ml-auto flex items-center rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setViewPersist("table")}
              className="h-8 w-8 inline-flex items-center justify-center text-muted-foreground hover:bg-muted/50"
              aria-label="Table view"
              title="Table view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewPersist("grid")}
              className={`h-8 w-8 inline-flex items-center justify-center ${
                viewMode === "grid"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
              aria-label="Grid view"
              title="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {viewMode === "grid" && pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <FileCode className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            No published pages yet
          </h2>
          <p className="text-sm text-center max-w-md">
            Publish an HTML page from chat, the code editor, or a presentation
            and it will show up here.
          </p>
        </div>
      ) : viewMode === "grid" && filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          No pages match your filters.
        </div>
      ) : viewMode === "grid" ? (
        <HtmlPageGridView
          pages={filtered}
          visibleCount={visibleCount}
          onVisibleCountChange={(count) => replaceListState({ n: count })}
          onOpenPage={(pageId, e) =>
            captureScrollAndOpen(pageId, { e, tab: "preview" })
          }
          onCreatePage={onCreatePage}
          listReturnQuery={listReturnQuery}
          openTab="preview"
        />
      ) : (
        <MatrxDataTable<HtmlPageSummary>
          tableId="cms-html-pages"
          data={filtered}
          columns={htmlPageColumns(listReturnQuery)}
          getRowId={(page) => page.id}
          getRowHref={(page) =>
            `/cms/html-pages/${page.id}?ret=${encodeURIComponent(listReturnQuery)}`
          }
          onRowOpen={(page) => captureScrollAndOpen(page.id, {})}
          detail={{ enabled: false }}
          copy={false}
          isLoading={isLoading && pages.length === 0}
          isFetching={isLoading && pages.length > 0}
          coverage={{ noun: "published page", answeredBy: "client" }}
          query={{
            mode: "controlled-local",
            state:
              tableQuery.search === search &&
              (!tableQuery.sort ||
                !isHtmlPagesSortField(tableQuery.sort.id) ||
                (tableQuery.sort.id === sortField &&
                  tableQuery.sort.direction === sortDir))
                ? tableQuery
                : {
                    ...tableQuery,
                    page: 1,
                    search,
                    sort: { id: sortField, direction: sortDir },
                  },
            onStateChange: (next) => {
              setTableQuery(next);
              const nextSort = next.sort;
              replaceListState({
                q: next.search,
                ...(nextSort && isHtmlPagesSortField(nextSort.id)
                  ? {
                      sort: nextSort.id,
                      dir: nextSort.direction === "asc" ? "asc" : "desc",
                    }
                  : {}),
              });
            },
            sourceProcessing: { search: "source" },
          }}
          toolbar={{
            title: "Published pages",
            searchPlaceholder: "Search pages…",
            facets: [
              {
                type: "button-group",
                id: "indexable",
                value: indexableOnly ? "indexable" : "all",
                defaultValue: "all",
                options: [
                  { value: "all", label: "All pages" },
                  { value: "indexable", label: "Indexable only" },
                ],
                onChange: (value) =>
                  replaceListState({ indexableOnly: value === "indexable" }),
              },
            ] satisfies MatrxDataTableToolbar["facets"],
            refresh: { onRefresh, label: "Refresh pages" },
            add: { onAdd: onCreatePage },
            actions: (
              <div className="flex items-center rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewPersist("table")}
                  className={`h-8 w-8 inline-flex items-center justify-center ${
                    viewMode === "table"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                  aria-label="Table view"
                  title="Table view"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewPersist("grid")}
                  className="h-8 w-8 inline-flex items-center justify-center text-muted-foreground hover:bg-muted/50"
                  aria-label="Grid view"
                  title="Grid view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          }}
          rowWrapper={(page, row) => (
            <HtmlPagesContextMenu
              pages={filtered}
              page={page}
              enableFloatingIcon={false}
              onNewPage={onCreatePage}
              onOpenPage={(pageId) => captureScrollAndOpen(pageId, {})}
            >
              {row}
            </HtmlPagesContextMenu>
          )}
          rowActions={(page) => (
            <HtmlPageActions
              page={page}
              listReturnQuery={listReturnQuery}
              copied={copiedId === page.id}
              onCopy={() => void copyUrl(page)}
              onPromote={() => setPromoteTarget(page)}
              onDelete={() => setDeleteTarget(page)}
            />
          )}
          emptyState={{
            title:
              pages.length === 0
                ? "No published pages yet"
                : "No pages match this view",
            description:
              pages.length === 0
                ? "Publish an HTML page from chat, the code editor, or a presentation and it will appear here."
                : "Clear a filter or change the search to see published pages.",
          }}
          tableClassName="text-left"
        />
      )}

      {filtered.length > 0 && viewMode === "grid" && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} of {pages.length} pages
        </p>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !busyDelete) setDeleteTarget(null);
        }}
        title="Delete published page"
        description={
          <>
            Permanently delete <b>{deleteTarget?.meta_title}</b>? The live URL
            will stop working. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={busyDelete}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setBusyDelete(true);
          try {
            await onDeletePage(deleteTarget.id);
            setDeleteTarget(null);
            toast.success("Page deleted");
          } catch {
            toast.error("Failed to delete page");
          } finally {
            setBusyDelete(false);
          }
        }}
      />
      <PromoteToSiteDialog
        htmlPage={promoteTarget}
        onOpenChange={(open) => {
          if (!open) setPromoteTarget(null);
        }}
      />
    </div>
  );
}

function isHtmlPagesSortField(value: string): value is HtmlPagesSortField {
  return [
    "id",
    "meta_title",
    "meta_description",
    "meta_keywords",
    "url",
    "updated_at",
    "created_at",
    "is_indexable",
  ].includes(value);
}

function htmlPageColumns(
  listReturnQuery: string,
): MatrxColumnDef<HtmlPageSummary>[] {
  return [
    {
      id: "id",
      header: "ID",
      accessorKey: "id",
      filter: "text",
      width: 112,
      frozen: true,
      cell: (page) => (
        <MatrxUuidCell
          value={page.id}
          href={`/cms/html-pages/${page.id}?ret=${encodeURIComponent(listReturnQuery)}`}
        />
      ),
    },
    {
      id: "meta_title",
      header: "Title",
      accessorKey: "meta_title",
      filter: "text",
      width: 300,
      frozen: true,
      href: (page) =>
        `/cms/html-pages/${page.id}?ret=${encodeURIComponent(listReturnQuery)}`,
      cell: (page) => (
        <div className="min-w-0">
          <div
            className="max-w-[280px] truncate font-medium text-foreground"
            title={page.meta_title || "Untitled"}
          >
            {page.meta_title || "Untitled"}
          </div>
        </div>
      ),
    },
    {
      id: "meta_description",
      header: "Description",
      accessorFn: (page) => page.meta_description ?? "",
      filter: "text",
      mobileHidden: true,
      width: 360,
      cell: (page) => (
        <span
          className="block max-w-[360px] truncate text-muted-foreground"
          title={page.meta_description ?? ""}
        >
          {page.meta_description || "—"}
        </span>
      ),
    },
    {
      id: "is_indexable",
      header: "SEO",
      accessorKey: "is_indexable",
      filter: "boolean",
      width: 116,
      cell: (page) => (
        <Badge
          variant={page.is_indexable ? "default" : "secondary"}
          className="text-[10px]"
        >
          {page.is_indexable ? "Indexable" : "Noindex"}
        </Badge>
      ),
    },
    {
      id: "updated_at",
      header: "Updated",
      accessorKey: "updated_at",
      filter: "date",
      mobileHidden: true,
      width: 132,
      cell: (page) => {
        const value = page.updated_at ?? page.created_at;
        return (
          <time
            className="whitespace-nowrap text-muted-foreground"
            dateTime={value}
            title={new Date(value).toLocaleString()}
          >
            {formatRelativeDate(value)}
          </time>
        );
      },
    },
    {
      id: "created_at",
      header: "Created",
      accessorKey: "created_at",
      filter: "date",
      hidden: true,
    },
    {
      id: "meta_keywords",
      header: "Keywords",
      accessorFn: (page) => page.meta_keywords ?? "",
      filter: "text",
      hidden: true,
    },
    {
      id: "url",
      header: "Live URL",
      accessorKey: "url",
      filter: "text",
      hidden: true,
    },
  ];
}

function HtmlPageActions({
  page,
  listReturnQuery,
  copied,
  onCopy,
  onPromote,
  onDelete,
}: {
  page: HtmlPageSummary;
  listReturnQuery: string;
  copied: boolean;
  onCopy: () => void;
  onPromote: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          aria-label={`Actions for ${page.meta_title || "Untitled"}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link
            href={`/cms/html-pages/${page.id}?ret=${encodeURIComponent(listReturnQuery)}`}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open(page.url, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          View live
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopy}>
          {copied ? (
            <Check className="mr-2 h-3.5 w-3.5" />
          ) : (
            <Copy className="mr-2 h-3.5 w-3.5" />
          )}
          Copy URL
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPromote}>
          <Rocket className="mr-2 h-3.5 w-3.5" />
          Promote to site…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

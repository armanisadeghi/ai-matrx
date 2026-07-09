"use client";

import React, { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { idMatchesQuery } from "@/utils/search-scoring";
import type { HtmlPageSummary } from "@/features/html-pages/types";
import HtmlPageGridView, {
  formatRelativeDate,
} from "@/features/html-pages/components/HtmlPageGridView";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  ArrowUpDown,
  RefreshCw,
  Globe,
  Copy,
  Check,
  LayoutGrid,
  List,
} from "lucide-react";
import { toast } from "sonner";

interface HtmlPageListViewProps {
  pages: HtmlPageSummary[];
  isLoading: boolean;
  error: string | null;
  onOpenPage: (
    pageId: string,
    opts?: { e?: React.MouseEvent; tab?: "preview" | "meta" | "html" },
  ) => void;
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
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [busyDelete, setBusyDelete] = React.useState(false);
  const [searchDraft, setSearchDraft] = React.useState(search);
  const urlSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredScroll = useRef(false);

  // Keep local search input in sync when URL changes (back/forward).
  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  const replaceListState = (patch: Partial<HtmlPagesListState>) => {
    // Read latest URL so rapid patches (search debounce + infinite scroll) don't clobber each other.
    const current =
      typeof window !== "undefined"
        ? parseHtmlPagesListState(new URLSearchParams(window.location.search))
        : listState;
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
    const qs = htmlPagesListStateToSearchParams(next).toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    router.replace(href, { scroll: false });
    saveHtmlPagesListReturn(qs);
  };

  // Persist current query for editor back-nav even before first replace.
  useEffect(() => {
    saveHtmlPagesListReturn(searchParams.toString());
  }, [searchParams]);

  // Debounce search → URL.
  useEffect(() => {
    if (searchDraft === search) return;
    if (urlSyncTimer.current) clearTimeout(urlSyncTimer.current);
    urlSyncTimer.current = setTimeout(() => {
      replaceListState({ q: searchDraft });
    }, 250);
    return () => {
      if (urlSyncTimer.current) clearTimeout(urlSyncTimer.current);
    };
  }, [searchDraft, search, pathname]);

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

  const toggleSort = (field: HtmlPagesSortField) => {
    if (sortField === field) {
      replaceListState({ dir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      replaceListState({
        sort: field,
        dir: field === "meta_title" ? "asc" : "desc",
      });
    }
  };

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search pages…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            className="pl-8 h-8 text-sm"
            style={{ fontSize: "16px" }}
          />
          {searchDraft && (
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => {
                setSearchDraft("");
                replaceListState({ q: "" });
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button
          variant={indexableOnly ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => replaceListState({ indexableOnly: !indexableOnly })}
        >
          <Globe className="h-3.5 w-3.5" />
          Indexable only
        </Button>

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

        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onRefresh}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {pages.length === 0 ? (
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
      ) : filtered.length === 0 ? (
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
          listReturnQuery={listReturnQuery}
          openTab="preview"
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort("meta_title")}
                    >
                      Title
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium hidden md:table-cell">
                    Description
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort("is_indexable")}
                    >
                      SEO
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium hidden sm:table-cell">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort("updated_at")}
                    >
                      Updated
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((page) => (
                  <tr
                    key={page.id}
                    className="border-b border-border/60 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={(e) => captureScrollAndOpen(page.id, { e })}
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/cms/html-pages/${page.id}?ret=${encodeURIComponent(listReturnQuery)}`}
                        className="block"
                        onClick={(e) => {
                          e.stopPropagation();
                          captureScrollAndOpen(page.id, { e });
                        }}
                      >
                        <div className="font-medium text-foreground truncate max-w-[280px]">
                          {page.meta_title || "Untitled"}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[280px]">
                          {page.id}
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <span className="text-muted-foreground line-clamp-2 max-w-[360px]">
                        {page.meta_description || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant={page.is_indexable ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {page.is_indexable ? "Indexable" : "Noindex"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-muted-foreground whitespace-nowrap">
                      <time
                        dateTime={page.updated_at ?? page.created_at}
                        title={new Date(
                          page.updated_at ?? page.created_at,
                        ).toLocaleString()}
                      >
                        {formatRelativeDate(page.updated_at ?? page.created_at)}
                      </time>
                    </td>
                    <td
                      className="px-3 py-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/cms/html-pages/${page.id}?ret=${encodeURIComponent(listReturnQuery)}`}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              window.open(
                                page.url,
                                "_blank",
                                "noopener,noreferrer",
                              )
                            }
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-2" />
                            View live
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void copyUrl(page)}>
                            {copiedId === page.id ? (
                              <Check className="h-3.5 w-3.5 mr-2" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 mr-2" />
                            )}
                            Copy URL
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTarget(page)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length > 0 && viewMode === "table" && (
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
    </div>
  );
}

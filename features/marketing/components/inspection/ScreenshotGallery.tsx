"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Images, Loader2 } from "lucide-react";
import { safeQueryPage } from "@/components/official/matrx-data-table/query-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineMediaRef, fileIdToMediaRef } from "@/features/files";
import {
  formatCompactDate,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useSiteScreenshots } from "@/features/marketing/data/inspection-hooks";
import type { InspectionScreenshotRow } from "@/features/marketing/data/inspection-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";

const SCREENSHOT_KINDS = ["homepage", "full", "viewport"] as const;
const SORT_OPTIONS = [
  { value: "captured_at:desc", label: "Newest first" },
  { value: "captured_at:asc", label: "Oldest first" },
  { value: "kind:asc", label: "Kind A–Z" },
  { value: "width:desc", label: "Widest first" },
] as const;

function ScreenshotCard({
  screenshot,
  sitePath,
}: {
  screenshot: InspectionScreenshotRow;
  sitePath: string;
}) {
  const imageRef = screenshot.file_id
    ? fileIdToMediaRef(screenshot.file_id, "image/png")
    : null;
  const fileHref = screenshot.file_id
    ? `/files/f/${screenshot.file_id}`
    : undefined;
  const pageHref = screenshot.page_id
    ? `${sitePath}/pages/${screenshot.page_id}`
    : null;
  const snapshotHref =
    screenshot.page_id && screenshot.snapshot_id
      ? `${pageHref}/snapshots/${screenshot.snapshot_id}`
      : null;
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <a
        href={fileHref}
        target="_blank"
        rel="noreferrer"
        className="relative flex aspect-[16/10] min-h-32 items-center justify-center overflow-hidden border-b border-border bg-muted/40"
        aria-label={`Open ${screenshot.kind} screenshot`}
      >
        <InlineMediaRef
          ref={imageRef}
          size="fill"
          fit="contain"
          rounded="none"
          fallback="icon"
          errorFallback="icon"
          alt={`${screenshot.kind} screenshot captured ${formatCompactDate(screenshot.captured_at)}`}
          className="transition-transform duration-200 group-hover:scale-[1.01]"
        />
      </a>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge value={screenshot.kind} />
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {screenshot.width ?? "—"} × {screenshot.height ?? "—"}
          </span>
        </div>
        {pageHref ? (
          <Link
            href={pageHref}
            className="truncate font-mono text-[11px] text-primary"
            title={screenshot.page?.url ?? screenshot.page_id ?? undefined}
          >
            {screenshot.page?.url ?? screenshot.page_id}
          </Link>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Site-level capture
          </span>
        )}
        <p
          className="truncate font-mono text-[10px] text-muted-foreground"
          title={screenshot.file_id ?? undefined}
        >
          {screenshot.file_id ?? "Missing canonical file"}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
          <span>{formatCompactDate(screenshot.captured_at)}</span>
          {snapshotHref ? (
            <Link
              href={snapshotHref}
              className="font-medium hover:text-primary"
            >
              Snapshot
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ScreenshotGallery() {
  const { site, sitePath } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "captured_at", direction: "desc" },
    defaultPageSize: 25,
  });
  const screenshots = useSiteScreenshots(site.id, table.queryState);
  const total = screenshots.data?.total ?? 0;
  const currentPage = safeQueryPage(
    table.state.page,
    total,
    table.state.pageSize,
  );
  const pageCount = Math.max(1, Math.ceil(total / table.state.pageSize));
  const kindFilter = table.state.columnFilters.kind;
  const kind =
    kindFilter?.kind === "select" && kindFilter.value
      ? kindFilter.value
      : "all";
  const sortValue = `${table.state.sort?.id ?? "captured_at"}:${table.state.sort?.direction ?? "desc"}`;
  const first = total === 0 ? 0 : (currentPage - 1) * table.state.pageSize + 1;
  const last = Math.min(currentPage * table.state.pageSize, total);

  const setPage = (page: number) => {
    table.onStateChange({ ...table.state, page });
  };
  const setSearch = (search: string) => {
    table.onStateChange({ ...table.state, page: 1, search });
  };
  const setKind = (value: string) => {
    const columnFilters = { ...table.state.columnFilters };
    if (value === "all") delete columnFilters.kind;
    else columnFilters.kind = { kind: "select", value };
    table.onStateChange({ ...table.state, page: 1, columnFilters });
  };
  const setSort = (value: string) => {
    const [id, direction] = value.split(":", 2);
    if (direction !== "asc" && direction !== "desc") return;
    table.onStateChange({
      ...table.state,
      page: 1,
      sort: { id, direction },
    });
  };
  const setPageSize = (value: string) => {
    const pageSize = Number(value);
    if (!Number.isInteger(pageSize) || pageSize < 1) return;
    table.onStateChange({ ...table.state, page: 1, pageSize });
  };

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-textured">
      <section className="flex shrink-0 flex-col gap-2 border-b border-border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-foreground">
            Screenshot gallery
          </h1>
          <p className="truncate text-[11px] text-muted-foreground">
            Homepage and page captures stored by the standalone crawler.
          </p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {total.toLocaleString()} captures
        </span>
      </section>
      <section className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card/90 px-3 py-2">
        <Input
          value={table.state.search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search capture kind…"
          aria-label="Search screenshots"
          className="h-8 min-w-64 flex-1 text-base sm:max-w-md sm:text-xs"
        />
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger
            className="h-8 w-36 text-xs"
            aria-label="Screenshot kind"
          >
            <SelectValue placeholder="All kinds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {SCREENSHOT_KINDS.map((value) => (
              <SelectItem key={value} value={value} className="capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortValue} onValueChange={setSort}>
          <SelectTrigger
            className="h-8 w-40 text-xs"
            aria-label="Sort screenshots"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(table.state.pageSize)}
          onValueChange={setPageSize}
        >
          <SelectTrigger
            className="h-8 w-24 text-xs"
            aria-label="Screenshots per page"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        {screenshots.isError ? (
          <QueryError
            error={screenshots.error}
            onRetry={() => void screenshots.refetch()}
          />
        ) : screenshots.isLoading ? (
          <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span className="text-sm">Loading screenshots…</span>
          </div>
        ) : screenshots.data?.rows.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
            {screenshots.data.rows.map((screenshot) => (
              <ScreenshotCard
                key={screenshot.id}
                screenshot={screenshot}
                sitePath={sitePath}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/70 px-6 text-center">
            <Images className="h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">
              No screenshots found
            </p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Captures appear here after site bootstrap or a screenshot-enabled
              crawl persists them to the canonical private file system.
            </p>
          </div>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {first.toLocaleString()}–{last.toLocaleString()} of{" "}
          {total.toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            Page {currentPage} of {pageCount}
          </span>
          <Button
            size="icon"
            variant="outline"
            disabled={currentPage <= 1 || screenshots.isFetching}
            onClick={() => setPage(currentPage - 1)}
            aria-label="Previous screenshot page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            disabled={currentPage >= pageCount || screenshots.isFetching}
            onClick={() => setPage(currentPage + 1)}
            aria-label="Next screenshot page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </footer>
    </main>
  );
}

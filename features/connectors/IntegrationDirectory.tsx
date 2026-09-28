"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
  AlertCircle,
  Info,
} from "lucide-react";
import { Input, Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MCP_CATEGORY_META } from "@/features/agents/types/mcp.types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { ConnectorMark } from "./ConnectorMark";
import {
  DEFAULT_DIRECTORY_FILTERS,
  filterDirectory,
  type DirectoryFilters,
  type IntegrationDirectoryItem,
} from "./integration-directory";

interface IntegrationDirectoryProps {
  items: IntegrationDirectoryItem[];
  filters: DirectoryFilters;
  onFiltersChange: (filters: DirectoryFilters) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderDetail: (item: IntegrationDirectoryItem) => ReactNode;
  loading: boolean;
  errors: ReactNode;
  incomplete: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenWindow?: () => void;
  exportControl?: ReactNode;
}

/** Host-independent directory: identical cards, rows, filtering and details in a page or window. */
export function IntegrationDirectory({
  items,
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
  renderDetail,
  loading,
  errors,
  incomplete: readFailed,
  refreshing,
  onRefresh,
  onOpenWindow,
  exportControl,
}: IntegrationDirectoryProps) {
  const root = useRef<HTMLDivElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const previousSelection = useRef<string | null>(null);
  const visible = filterDirectory(items, filters);
  const selected = items.find(
    (item) =>
      item.id === selectedId ||
      (item.server && `provider:${item.server.slug}` === selectedId),
  );
  const categories = Object.entries(MCP_CATEGORY_META)
    .filter(([key]) => items.some((item) => item.category === key))
    .sort(([, a], [, b]) => a.order - b.order);
  const categoryLabel = categories.find(
    ([key]) => key === filters.category,
  )?.[1].label;
  const grouped =
    filters.view === "discover" &&
    filters.browse === "categories" &&
    filters.category === "all" &&
    !filters.query.trim() &&
    filters.status === "all";
  const featured = visible.filter((item) => item.featured);
  const change = (patch: Partial<DirectoryFilters>) =>
    onFiltersChange({ ...filters, ...patch });
  const clearFilters = () =>
    onFiltersChange({
      ...DEFAULT_DIRECTORY_FILTERS,
      view: filters.view,
      browse: "all",
    });

  useEffect(() => {
    if (selectedId) {
      previousSelection.current = selectedId;
      detailHeading.current?.focus();
      detailHeading.current?.scrollIntoView({ block: "nearest" });
    } else if (previousSelection.current) {
      const button = Array.from(
        root.current?.querySelectorAll<HTMLButtonElement>(
          "button[data-integration-id]",
        ) ?? [],
      ).find(
        (element) =>
          element.dataset.integrationId === previousSelection.current,
      );
      button?.focus();
      button?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId]);

  const grid = (entries: IntegrationDirectoryItem[]) => (
    <div className="grid grid-cols-1 gap-2.5 @[38rem]/integrations:grid-cols-2">
      {entries.map((item) => (
        <IntegrationCard
          key={item.id}
          item={item}
          onOpen={() => onSelect(item.id)}
        />
      ))}
    </div>
  );
  const section = (
    title: string,
    entries: IntegrationDirectoryItem[],
    onShowAll: () => void,
  ) =>
    entries.length > 0 && (
      <section key={title} aria-label={title} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            {title}
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
              {entries.length}
            </span>
          </h2>
          <button
            type="button"
            onClick={onShowAll}
            aria-label={`Show all ${title.toLowerCase()}`}
            className="inline-flex items-center gap-1.5 rounded px-1 py-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Show all
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {grid(entries.slice(0, title === "Featured" ? 8 : 4))}
      </section>
    );

  return (
    <div
      ref={root}
      className="@container/integrations matrx-touch-targets mx-auto w-full max-w-6xl px-3 pb-8 @[38rem]:px-5"
    >
      <div className="sticky top-0 z-10 space-y-3 border-b border-border bg-background pb-3 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-1 text-xl font-semibold tracking-tight">
            Integrations
          </h1>
          <div
            role="group"
            aria-label="Integrations view"
            className="inline-flex items-center rounded-lg bg-muted/70 p-0.5"
          >
            {(["discover", "yours"] as const).map((view) => (
              <button
                key={view}
                type="button"
                aria-pressed={filters.view === view}
                onClick={() => {
                  onSelect(null);
                  change({ view });
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filters.view === view
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {view === "discover" ? "Discover" : "Yours"}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {exportControl}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Refresh integrations"
              title="Refresh integrations"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
            </Button>
            {onOpenWindow && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Open integrations in window"
                title="Open in window"
                onClick={onOpenWindow}
              >
                <AppWindow className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {!selectedId && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-44 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={filters.query}
                onChange={(event) => change({ query: event.target.value })}
                placeholder="Search integrations"
                aria-label="Search integrations"
                className="h-9 pl-9 text-base @[38rem]/integrations:text-sm"
              />
            </div>
            <SlidersHorizontal
              className="hidden h-4 w-4 text-muted-foreground @[38rem]/integrations:block"
              aria-hidden
            />
            <select
              aria-label="Integration category"
              value={filters.category}
              onChange={(event) =>
                change({ category: event.target.value, browse: "all" })
              }
              className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All categories</option>
              {categories.map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Integration status"
              value={filters.status}
              onChange={(event) =>
                change({
                  status: event.target.value as DirectoryFilters["status"],
                })
              }
              className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">Any status</option>
              <option value="connected">Connected</option>
              <option value="available">Available</option>
              <option value="coming_soon">Coming soon</option>
            </select>
          </div>
        )}
      </div>
      <div className="space-y-6 pt-4">
        {errors}
        {selectedId ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="inline-flex items-center gap-2 rounded py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to{" "}
              {filters.view === "yours" ? "your integrations" : "discover"}
            </button>
            <h2
              ref={detailHeading}
              tabIndex={-1}
              className="text-lg font-semibold outline-none"
            >
              {selected?.name ?? "Integration details"}
            </h2>
            {selected ? (
              renderDetail(selected)
            ) : loading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : (
              <p className="text-sm text-muted-foreground">
                {readFailed
                  ? "This integration could not be loaded. Refresh to try again."
                  : "This integration is no longer in the catalog. Go back to browse available integrations."}
                {readFailed && (
                  <ErrorAlchemyMenu error="Integration information could not be loaded" />
                )}
              </p>
            )}
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground" role="status">
                {loading
                  ? "Checking integrations…"
                  : filters.view === "yours"
                    ? `${visible.length} saved integration${visible.length === 1 ? "" : "s"}${readFailed ? " loaded" : ""}`
                    : filters.query.trim()
                      ? `${visible.length} result${visible.length === 1 ? "" : "s"}${readFailed ? " loaded" : ""}`
                      : (categoryLabel ??
                        (filters.browse === "featured"
                          ? "Featured integrations"
                          : filters.browse === "all"
                            ? "All integrations"
                            : "Connect the tools you work with."))}
              </p>
              {filters.view === "discover" && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={
                      filters.browse === "categories" &&
                      filters.category === "all"
                    }
                    onClick={() =>
                      change({
                        browse: "categories",
                        category: "all",
                        status: "all",
                        query: "",
                      })
                    }
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-xs",
                      filters.browse === "categories" &&
                        filters.category === "all"
                        ? "bg-muted font-medium"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    Browse
                  </button>
                  <button
                    type="button"
                    aria-pressed={
                      filters.browse === "all" && filters.category === "all"
                    }
                    onClick={clearFilters}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-xs",
                      filters.browse === "all" && filters.category === "all"
                        ? "bg-muted font-medium"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    View all
                  </button>
                </div>
              )}
            </div>
            {(filters.query ||
              filters.category !== "all" ||
              filters.status !== "all" ||
              filters.browse === "featured") && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
              >
                <X className="h-3 w-3" aria-hidden />
                Clear filters
              </button>
            )}
            {loading && visible.length === 0 ? (
              <div className="grid grid-cols-1 gap-3 @[38rem]/integrations:grid-cols-2">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-28 rounded-xl" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="space-y-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
                <Search
                  className="mx-auto h-6 w-6 text-muted-foreground"
                  aria-hidden
                />
                <p className="text-sm font-medium">
                  {readFailed
                    ? "Some integrations could not be loaded"
                    : filters.query ||
                        filters.category !== "all" ||
                        filters.status !== "all"
                      ? "No integrations match these filters"
                      : filters.view === "yours"
                        ? "No saved integrations yet"
                        : "No integrations to show"}
                  {readFailed && (
                    <ErrorAlchemyMenu error="Integration information could not be loaded" />
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {readFailed
                    ? "Try refreshing to see your complete list."
                    : filters.view === "yours" && !filters.query
                      ? "Discover a service to connect your first integration."
                      : "Try another name, category, or status."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    readFailed
                      ? onRefresh()
                      : onFiltersChange({ ...DEFAULT_DIRECTORY_FILTERS })
                  }
                >
                  {readFailed ? "Try again" : "Browse integrations"}
                </Button>
              </div>
            ) : filters.view === "yours" ? (
              <div
                role="list"
                aria-label="Your integrations"
                className="divide-y divide-border rounded-lg border border-border"
              >
                {visible.map((item) => (
                  <div role="listitem" key={item.id}>
                    <button
                      type="button"
                      data-integration-id={item.id}
                      onClick={() => onSelect(item.id)}
                      className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <ConnectorMark
                        connector={item.artwork}
                        className="h-7 w-7 rounded object-contain"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {item.name}
                        </span>
                        {item.accountSummary && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.accountSummary}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1.5 text-xs",
                          item.attention
                            ? "text-warning"
                            : "text-muted-foreground",
                        )}
                      >
                        {item.attention ? (
                          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                        ) : item.connected && item.status === "Connected" ? (
                          <Check
                            className="h-3.5 w-3.5 text-success"
                            aria-hidden
                          />
                        ) : null}
                        {item.status}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    </button>
                  </div>
                ))}
              </div>
            ) : grouped ? (
              <div className="space-y-7">
                {section("Featured", featured, () =>
                  change({ browse: "featured" }),
                )}
                {categories.map(([key, meta]) =>
                  section(
                    meta.label,
                    visible.filter((item) => item.category === key),
                    () => change({ category: key, browse: "all" }),
                  ),
                )}
              </div>
            ) : (
              grid(visible)
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function IntegrationCard({
  item,
  onOpen,
}: {
  item: IntegrationDirectoryItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-integration-id={item.id}
      onClick={onOpen}
      className="group flex w-full items-start gap-3 rounded-xl border border-border bg-card/60 p-3.5 text-left transition-colors hover:border-foreground/20 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background">
        <ConnectorMark
          connector={item.artwork}
          className="h-8 w-8 rounded object-contain"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {item.name}
        </span>
        <span className="mt-0.5 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
          {item.description}
        </span>
        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
          {item.vendor}
          {item.saved ||
          item.comingSoon ||
          !item.available ||
          item.status === "Status unavailable"
            ? ` · ${item.status}`
            : ""}
        </span>
      </span>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
          item.connected && item.status === "Connected"
            ? "border-success/20 bg-success/10 text-success"
            : "border-border text-muted-foreground group-hover:text-foreground",
        )}
        title={item.status}
      >
        {!item.available ? (
          <Info className="h-4 w-4" aria-hidden />
        ) : item.attention ? (
          <AlertCircle className="h-4 w-4" aria-hidden />
        ) : item.connected ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <Plus className="h-4 w-4" aria-hidden />
        )}
      </span>
    </button>
  );
}

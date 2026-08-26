"use client";

/**
 * AgentAppsGrid
 *
 * Redux-driven list page for /agent-apps. Mirrors the agents list pattern:
 * one consumer namespace per mounted UI, memoized selectors, search + sort
 * + tabs + filter panel + cards. Skip the cards/list split for v1 since
 * app counts are still small; reintroduce later when needed.
 *
 * Filter dimensions: tab (mine/shared/all), sort, search, categories,
 * tags, agents (by id; name shown in UI), archive, visibility.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Search,
  SlidersHorizontal,
  RotateCcw,
  Check,
  AppWindow,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast-service";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { AgentAppCard } from "./AgentAppCard";
import { useAgentAppConsumer } from "@/features/agent-apps/hooks/useAgentAppConsumer";
import { useAgentAppConsumerUrlSync } from "@/features/agent-apps/hooks/useAgentAppConsumerUrlSync";
import {
  makeSelectFilteredApps,
  selectAllAppCategories,
  selectAllAppTags,
  selectAllAppAgents,
} from "@/features/agent-apps/redux/agent-app-consumers/selectors";
import type { AgentAppCardModel } from "@/features/agent-apps/redux/agent-app-consumers/selectors";
import {
  fetchAppsInitial,
  deleteApp,
} from "@/features/agents/redux/agent-apps/thunks";
import { selectAppsStatus } from "@/features/agents/redux/agent-apps/selectors";
import { fetchAgentsList } from "@/features/agents/redux/agent-definition/thunks";
import type {
  AgentAppSortOption,
  AgentAppTab,
  AgentAppArchFilter,
  AgentAppVisibilityFilter,
} from "@/features/agent-apps/redux/agent-app-consumers/slice";
import { ReferencesBulkCopyButton } from "@/features/matrx-envelope/components/ReferencesBulkCopyButton";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, csvExportItem } from "@/components/agent-copy/export";
import { selectAllAppCardModels } from "@/features/agent-apps/redux/agent-app-consumers/selectors";
import { appBrief, humanAgentApp } from "@/features/agent-apps/format";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  AGENT_APPS_SURFACE_NAME,
  createAgentAppsScope,
} from "@/features/surfaces/manifests/agent-apps.manifest";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { RefreshCwTapButton, XTapButton } from "@/components/icons/tap-buttons";
import { AgentAppsGridSkeleton } from "./AgentAppsGridSkeleton";

const SORT_OPTIONS: { value: AgentAppSortOption; label: string }[] = [
  { value: "updated-desc", label: "Recently Updated" },
  { value: "created-desc", label: "Recently Created" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "category-asc", label: "Category (A-Z)" },
  { value: "agent-asc", label: "Agent (A-Z)" },
  { value: "executions-desc", label: "Most Executions" },
  { value: "last-run-desc", label: "Recently Run" },
];

const TAB_OPTIONS: { value: AgentAppTab; label: string }[] = [
  { value: "mine", label: "Mine" },
  { value: "shared", label: "Shared" },
  { value: "all", label: "All" },
];

const ARCH_OPTIONS: { value: AgentAppArchFilter; label: string }[] = [
  { value: "active", label: "Active only" },
  { value: "archived", label: "Archived only" },
  { value: "both", label: "Both" },
];

const VISIBILITY_OPTIONS: {
  value: AgentAppVisibilityFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "public", label: "Public only" },
  { value: "personal", label: "Personal only" },
];

interface AgentAppsGridProps {
  /** Stable per-mount consumer ID; defaults to "apps-main". */
  consumerId?: string;
  /** Optional href for "New app" CTA; defaults to /agent-apps/new. */
  newAppHref?: string;
}

export function AgentAppsGrid({
  consumerId = "apps-main",
  newAppHref = "/agent-apps/new",
}: AgentAppsGridProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Hydrate apps + agents the first time this grid mounts. Both thunks are
  // idempotent — if another surface already loaded them, no extra fetch.
  useEffect(() => {
    dispatch(fetchAppsInitial());
    dispatch(fetchAgentsList());
  }, [dispatch]);

  const sliceStatus = useAppSelector(selectAppsStatus);
  const isLoading = sliceStatus === "idle" || sliceStatus === "loading";
  const isError = sliceStatus === "failed";

  const consumer = useAgentAppConsumer(consumerId);
  // Two-way sync of filter/sort/search state with the URL — survives back/
  // forward, refresh, and shareable links.
  useAgentAppConsumerUrlSync(consumerId, consumer);
  const {
    tab,
    sortBy,
    searchTerm,
    includedCats,
    includedTags,
    includedAgents,
    archFilter,
    visibilityFilter,
    hasActiveFilters,
    setTab,
    setSortBy,
    setSearchTerm,
    setArchFilter,
    setVisibilityFilter,
    toggleCategory,
    toggleTag,
    toggleAgent,
    resetFilters,
  } = consumer;

  const selectFiltered = useMemo(
    () => makeSelectFilteredApps(consumerId),
    [consumerId],
  );
  const filteredApps = useAppSelector(selectFiltered);
  const allAppCardModels = useAppSelector(selectAllAppCardModels);
  const allCategories = useAppSelector(selectAllAppCategories);
  const allTags = useAppSelector(selectAllAppTags);
  const allAgents = useAppSelector(selectAllAppAgents);

  // Counts for tab pills — recomputed off the (already filtered for status,
  // visibility, search, etc) result is misleading; instead we apply only
  // the non-tab filters here. Cheap to compute; same array length as
  // filteredApps in the common path.
  const tabCounts = useMemo(() => {
    // filteredApps is already tab-filtered. To show counts for *each* tab
    // we'd need three separate selectors — fine to defer. For now show the
    // total count once.
    return {
      mine: filteredApps.length,
      shared: filteredApps.length,
      all: filteredApps.length,
    };
  }, [filteredApps]);

  // ── Action state ─────────────────────────────────────────────────────────
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [duplicatingIds, setDuplicatingIds] = useState<Set<string>>(new Set());

  const handleEditNavigate = useCallback(
    (app: AgentAppCardModel) => {
      if (navigatingId) return;
      setNavigatingId(app.id);
      startTransition(() => router.push(`/agent-apps/${app.id}`));
    },
    [navigatingId, router],
  );

  const handleCopyUrl = useCallback(async (app: AgentAppCardModel) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/p/${app.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Public URL copied to clipboard.");
    } catch {
      toast.error(
        "Could not copy to clipboard. URL: " + url.slice(0, 80) + "…",
      );
    }
  }, []);

  const handleDuplicate = useCallback(
    async (app: AgentAppCardModel) => {
      setDuplicatingIds((prev) => new Set(prev).add(app.id));
      try {
        const res = await fetch(`/api/agent-apps/${app.id}/duplicate`, {
          method: "POST",
        });
        // Pull the server's actual error message so silent backend
        // failures (RLS, FK violations, slug races, etc.) surface in the
        // UI instead of a meaningless "HTTP 500".
        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const payload = (await res.json()) as {
              error?: string;
              details?: { message?: string };
            };
            const detail = payload?.details?.message;
            message = detail
              ? `${payload.error ?? "Failed"}: ${detail}`
              : (payload?.error ?? message);
          } catch {
            // Body wasn't JSON — fall back to the status code.
          }
          throw new Error(message);
        }
        toast.success("App duplicated.");
        dispatch(fetchAppsInitial());
      } catch (err) {
        toast.error(
          err instanceof Error
            ? `Failed to duplicate: ${err.message}`
            : "Failed to duplicate app.",
        );
      } finally {
        setDuplicatingIds((prev) => {
          const n = new Set(prev);
          n.delete(app.id);
          return n;
        });
      }
    },
    [dispatch],
  );

  const handleDelete = useCallback(
    async (app: AgentAppCardModel) => {
      const ok = await confirm({
        title: "Delete agent app",
        description: `Permanently delete "${app.name}"? This cannot be undone.`,
        confirmLabel: "Delete",
        variant: "destructive",
      });
      if (!ok) return;
      setDeletingIds((prev) => new Set(prev).add(app.id));
      try {
        await dispatch(deleteApp(app.id)).unwrap();
        toast.success("App deleted.");
      } catch (err) {
        toast.error(
          err instanceof Error
            ? `Failed to delete: ${err.message}`
            : "Failed to delete app.",
        );
      } finally {
        setDeletingIds((prev) => {
          const n = new Set(prev);
          n.delete(app.id);
          return n;
        });
      }
    },
    [dispatch],
  );

  // ── Active filter count for the popover badge ────────────────────────────
  const activeFilterCount =
    (sortBy !== "updated-desc" ? 1 : 0) +
    (tab !== "mine" ? 1 : 0) +
    (includedCats.length > 0 ? 1 : 0) +
    (includedTags.length > 0 ? 1 : 0) +
    (includedAgents.length > 0 ? 1 : 0) +
    (archFilter !== "active" ? 1 : 0) +
    (visibilityFilter !== "all" ? 1 : 0);

  const getSurfaceScope = () =>
    createAgentAppsScope(
      isLoading || isError
        ? {}
        : {
            listed_app_count: filteredApps.length,
            listed_apps_summary: filteredApps.map((app) => ({
              id: app.id,
              slug: app.slug,
              name: app.name,
              status: app.status,
            })),
          },
    );

  return (
    <SurfaceRuntimeProvider
      surfaceName={AGENT_APPS_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
      <NonEditableContextMenu
        sourceFeature="agent-app"
        surfaceName={AGENT_APPS_SURFACE_NAME}
        menuVersion={1}
        getApplicationScope={getSurfaceScope}
        contentSource={{ type: "raw" }}
      >
        <div className="matrx-touch-targets">
          {/* Controls row */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {/* Filter popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  title="Filters"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="ml-0.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="max-h-[80dvh] w-[min(420px,calc(100vw-2rem))] overflow-y-auto p-0"
              >
                <div className="p-4 space-y-4">
                  <FilterSection
                    label="Archived"
                    value={archFilter}
                    options={ARCH_OPTIONS}
                    onChange={setArchFilter}
                  />
                  <FilterSection
                    label="Visibility"
                    value={visibilityFilter}
                    options={VISIBILITY_OPTIONS}
                    onChange={setVisibilityFilter}
                  />
                  <CheckboxSection
                    label="Agent"
                    items={allAgents.map((a) => ({ key: a.id, label: a.name }))}
                    selected={includedAgents}
                    onToggle={toggleAgent}
                  />
                  <CheckboxSection
                    label="Category"
                    items={allCategories.map((c) => ({ key: c, label: c }))}
                    selected={includedCats}
                    onToggle={toggleCategory}
                  />
                  <CheckboxSection
                    label="Tags"
                    items={allTags.map((t) => ({ key: t, label: t }))}
                    selected={includedTags}
                    onToggle={toggleTag}
                  />
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetFilters}
                      className="w-full gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset filters
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Search */}
            <div className="flex-1 min-w-[200px] relative">
              <div className="flex h-8 items-center gap-2 rounded-full border border-border bg-muted/50 px-3">
                <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search apps, agents, descriptions…"
                  className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
                />
                {searchTerm && (
                  <XTapButton
                    onClick={() => setSearchTerm("")}
                    variant="transparent"
                    ariaLabel="Clear app search"
                    tooltip="Clear search"
                    className="-mr-2 text-muted-foreground"
                  />
                )}
              </div>
            </div>

            {/* Sort */}
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as AgentAppSortOption)}
            >
              <SelectTrigger className="h-8 w-[180px]" size="sm">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Tabs */}
            <div className="flex items-center gap-1 shrink-0">
              {TAB_OPTIONS.map((t) => (
                <Button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  size="sm"
                  variant={tab === t.value ? "default" : "outline"}
                  className={cn(
                    "h-8 gap-1.5 px-3 text-xs",
                    tab !== t.value && "text-muted-foreground",
                  )}
                >
                  {t.label}
                </Button>
              ))}
            </div>

            {filteredApps.length > 0 && (
              <ReferencesBulkCopyButton
                referenceType="agent_app"
                records={filteredApps.map((app) => ({
                  id: app.id,
                  label: app.name,
                }))}
                toastLabel={`${filteredApps.length} app${filteredApps.length === 1 ? "" : "s"}`}
              />
            )}

            {filteredApps.length > 0 && (
              <>
                <CopyButtons
                  size="icon"
                  label={`Agent apps (${filteredApps.length})`}
                  human={() => filteredApps.map(humanAgentApp).join("\n\n")}
                  json={() => filteredApps}
                  agent={() => ({
                    kind: "agent-apps",
                    location: "AI Matrx — Agent Apps",
                    description:
                      "The apps currently shown by the /agent-apps grid (filtered).",
                    data: filteredApps,
                    attributes: { count: filteredApps.length, tab, sortBy },
                    context: { searchTerm, archFilter, visibilityFilter },
                  })}
                  aiVariants={[
                    {
                      id: "view-briefs",
                      label: "This view briefs",
                      hint: "One line per app currently shown",
                      build: () => ({
                        kind: "agent-apps-briefs",
                        location: "AI Matrx — Agent Apps",
                        description:
                          "One-line briefs for the apps currently shown.",
                        data: filteredApps.map(appBrief),
                        attributes: { count: filteredApps.length },
                      }),
                    },
                    {
                      id: "all-briefs",
                      label: "All apps briefs",
                      hint: "One line per app, ignoring filters",
                      build: () => ({
                        kind: "agent-apps-briefs",
                        location: "AI Matrx — Agent Apps",
                        description:
                          "One-line briefs for every app, regardless of the active filters.",
                        data: allAppCardModels.map(appBrief),
                        attributes: { count: allAppCardModels.length },
                      }),
                    },
                  ]}
                />
                <ExportMenu
                  label="agent-apps"
                  items={[
                    jsonExportItem(() => filteredApps, "JSON (this view)"),
                    csvExportItem(
                      () =>
                        filteredApps as unknown as Array<
                          Record<string, unknown>
                        >,
                      "CSV (this view)",
                    ),
                  ]}
                  sheetRows={() =>
                    filteredApps as unknown as Array<Record<string, unknown>>
                  }
                />
              </>
            )}

            {/* New app */}
            <Button asChild size="sm" className="h-8 gap-1.5">
              <Link href={newAppHref} aria-label="Create a new agent app">
                <Plus className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {/* Result count */}
          {!isLoading && !isError && (
            <div
              data-surface-value="listed_app_count"
              className="mb-2 text-xs text-muted-foreground"
            >
              {filteredApps.length} result
              {filteredApps.length !== 1 ? "s" : ""}
              {searchTerm ? " in this search" : ""}
            </div>
          )}

          {/* Content */}
          <div data-surface-value="listed_apps_summary">
            {isLoading ? (
              <AgentAppsGridSkeleton />
            ) : isError ? (
              <div
                role="alert"
                className="flex min-h-28 items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
              >
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Agent apps couldn’t load
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    The app catalog is temporarily unavailable. Check your
                    connection and try again.
                  </p>
                </div>
                <RefreshCwTapButton
                  variant="transparent"
                  ariaLabel="Retry loading agent apps"
                  label="Retry"
                  onClick={() => void dispatch(fetchAppsInitial())}
                />
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="border border-primary/20 rounded-xl p-8 bg-gradient-to-br from-primary/5 to-secondary/5">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <AppWindow className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      {hasActiveFilters
                        ? "No apps match your filters"
                        : "Create your first app"}
                    </h3>
                    <p className="text-muted-foreground">
                      {hasActiveFilters
                        ? "Try adjusting your search or filters."
                        : "Build a custom UI on top of any agent."}
                    </p>
                  </div>
                  {!hasActiveFilters ? (
                    <Button asChild>
                      <Link href={newAppHref}>
                        <Plus className="h-4 w-4 mr-2" />
                        New app
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={resetFilters}>
                      Clear filters
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                {filteredApps.map((app) => (
                  <AgentAppCard
                    key={app.id}
                    app={app}
                    onEdit={handleEditNavigate}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    onCopyUrl={handleCopyUrl}
                    isDuplicating={duplicatingIds.has(app.id)}
                    isDeleting={deletingIds.has(app.id)}
                    isNavigating={navigatingId === app.id}
                    isAnyNavigating={navigatingId !== null}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface FilterSectionProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

function FilterSection<T extends string>({
  label,
  value,
  options,
  onChange,
}: FilterSectionProps<T>) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className="flex gap-1 flex-wrap">
        {options.map((opt) => (
          <Button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            size="sm"
            variant={value === opt.value ? "default" : "outline"}
            className={cn(
              "h-7 px-2.5 text-xs",
              value !== opt.value && "text-muted-foreground",
            )}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

interface CheckboxSectionProps {
  label: string;
  items: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
}

function CheckboxSection({
  label,
  items,
  selected,
  onToggle,
}: CheckboxSectionProps) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1.5">
        {label}{" "}
        {selected.length > 0 && (
          <span className="text-primary">({selected.length})</span>
        )}
      </div>
      <div className="max-h-40 overflow-y-auto space-y-0.5 -mx-1 px-1">
        {items.map((item) => {
          const isOn = selected.includes(item.key);
          return (
            <Button
              key={item.key}
              onClick={() => onToggle(item.key)}
              size="sm"
              variant={isOn ? "secondary" : "ghost"}
              className={cn(
                "h-7 w-full justify-start gap-2 px-2 text-left text-xs",
                isOn ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0",
                  isOn
                    ? "bg-primary border-primary"
                    : "border-muted-foreground/40",
                )}
              >
                {isOn && (
                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                )}
              </span>
              <span className="truncate">{item.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

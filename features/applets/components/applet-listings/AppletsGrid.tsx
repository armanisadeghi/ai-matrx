"use client";

/**
 * AppletsGrid
 *
 * Redux-driven list page for /applets. Mirrors the agents list pattern:
 * one consumer namespace per mounted UI, memoized selectors, search + sort
 * + tabs + filter panel + cards. Skip the cards/list split for v1 since
 * app counts are still small; reintroduce later when needed.
 *
 * Filter dimensions: tab (mine/shared/all), sort, search, categories,
 * tags, archive, published to the web.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { PUBLISHED_TO_WEB_LABEL } from "@/lib/row-access";
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
} from "@ai-matrx/design-system";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { toast } from "@/lib/toast-service";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { AppletListCard } from "./AppletListCard";
import { useAppletConsumer } from "@/features/applets/hooks/useAppletConsumer";
import { useAppletConsumerUrlSync } from "@/features/applets/hooks/useAppletConsumerUrlSync";
import {
  makeSelectFilteredApps,
  selectAllAppCategories,
  selectAllAppTags,
} from "@/features/applets/redux/applet-consumers/selectors";
import type { AppletCardModel } from "@/features/applets/redux/applet-consumers/selectors";
import {
  fetchAppsInitial,
  deleteApp,
} from "@/features/agents/redux/applets/thunks";
import { selectAppsStatus } from "@/features/agents/redux/applets/selectors";
import type {
  AppletSortOption,
  AppletTab,
  AppletArchFilter,
  AppletVisibilityFilter,
} from "@/features/applets/redux/applet-consumers/slice";
import { ReferencesBulkCopyButton } from "@/features/matrx-envelope/components/ReferencesBulkCopyButton";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, csvExportItem } from "@/components/agent-copy/export";
import { selectAllAppCardModels } from "@/features/applets/redux/applet-consumers/selectors";
import { appBrief, humanApplet } from "@/features/applets/format";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import {
  APPLETS_SURFACE_NAME,
  createAppletsScope,
} from "@/features/surfaces/manifests/applets.manifest";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { RefreshCwTapButton, XTapButton } from "@ai-matrx/tap-target/buttons";
import { AppletsGridSkeleton } from "./AppletsGridSkeleton";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const SORT_OPTIONS: { value: AppletSortOption; label: string }[] = [
  { value: "updated-desc", label: "Recently Updated" },
  { value: "created-desc", label: "Recently Created" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "category-asc", label: "Category (A-Z)" },
  { value: "executions-desc", label: "Most Executions" },
  { value: "last-run-desc", label: "Recently Run" },
];

const TAB_OPTIONS: { value: AppletTab; label: string }[] = [
  { value: "mine", label: "Mine" },
  { value: "shared", label: "Shared" },
  { value: "all", label: "All" },
];

const ARCH_OPTIONS: { value: AppletArchFilter; label: string }[] = [
  { value: "active", label: "Active only" },
  { value: "archived", label: "Archived only" },
  { value: "both", label: "Both" },
];

const VISIBILITY_OPTIONS: {
  value: AppletVisibilityFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "public", label: "Published to the web" },
  { value: "personal", label: "Not published" },
];

interface AppletsGridProps {
  /** Stable per-mount consumer ID; defaults to "apps-main". */
  consumerId?: string;
  /** Optional href for "New app" CTA; defaults to /applets/build. */
  newAppHref?: string;
}

export function AppletsGrid({
  consumerId = "apps-main",
  newAppHref = "/applets/build",
}: AppletsGridProps) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Hydrate apps the first time this grid mounts (idempotent).
  useEffect(() => {
    dispatch(fetchAppsInitial());
  }, [dispatch]);

  const sliceStatus = useAppSelector(selectAppsStatus);
  // The organization the copy is filed in — carried to the route as
  // `X-Organization-Id`, never resolved server-side into a personal one.
  const selectedOrganizationId = useAppSelector(selectOrganizationId);
  const isLoading = sliceStatus === "idle" || sliceStatus === "loading";
  const isError = sliceStatus === "failed";

  const consumer = useAppletConsumer(consumerId);
  // Two-way sync of filter/sort/search state with the URL — survives back/
  // forward, refresh, and shareable links.
  useAppletConsumerUrlSync(consumerId, consumer);
  const {
    tab,
    sortBy,
    searchTerm,
    includedCats,
    includedTags,
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

  // Counts for tab pills — recomputed off the (already filtered for status,
  // web state, search, etc) result is misleading; instead we apply only
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
    (app: AppletCardModel) => {
      if (navigatingId) return;
      setNavigatingId(app.id);
      startTransition(() => router.push(`/applets/manage/${app.id}`));
    },
    [navigatingId, router],
  );

  const handleCopyUrl = useCallback(async (app: AppletCardModel) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/p/${app.slug}`;
    await copyText(url, "Public URL copied to clipboard.", "Could not copy to clipboard. URL: " + url.slice(0, 80) + "…");
  }, []);

  const handleDuplicate = useCallback(
    async (app: AppletCardModel) => {
      if (!selectedOrganizationId) {
        // The route files the copy in the admitted organization and refuses
        // without one — say so rather than send a request that 400s.
        toast.error(
          "Select an organization from the avatar menu, then try again.",
        );
        return;
      }
      setDuplicatingIds((prev) => new Set(prev).add(app.id));
      try {
        const res = await fetch(`/api/applets/${app.id}/duplicate`, {
          method: "POST",
          headers: applyOrganizationContextHeader({}, selectedOrganizationId),
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
    [dispatch, selectedOrganizationId],
  );

  const handleDelete = useCallback(
    async (app: AppletCardModel) => {
      const ok = await confirm({
        title: "Delete Applet",
        description: `This archives "${app.name}". It stops running and disappears from your apps; an admin can restore it.`,
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
    (archFilter !== "active" ? 1 : 0) +
    (visibilityFilter !== "all" ? 1 : 0);

  const getSurfaceScope = () =>
    createAppletsScope(
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
      surfaceName={APPLETS_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
      <NonEditableContextMenu
        sourceFeature="applet"
        surfaceName={APPLETS_SURFACE_NAME}
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
                  icon={<SlidersHorizontal />}
                  variant="outline"
                  title="Filters"
                >
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="ml-0.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                      {/* read-gate-exempt: number of filters the person has switched on, not a fetched count */}
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                sizing="content"
                align="start"
                className="max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0"
              >
                <div className="p-4 space-y-4">
                  <FilterSection
                    label="Archived"
                    value={archFilter}
                    options={ARCH_OPTIONS}
                    onChange={setArchFilter}
                  />
                  <FilterSection
                    label={PUBLISHED_TO_WEB_LABEL}
                    value={visibilityFilter}
                    options={VISIBILITY_OPTIONS}
                    onChange={setVisibilityFilter}
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
                      icon={<RotateCcw />}
                      variant="outline"
                      onClick={resetFilters}
                      className="w-full"
                    >
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
                  placeholder="Search apps, jobs, descriptions…"
                  className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
                />
                {searchTerm && (
                  <XTapButton
                    onClick={() => setSearchTerm("")}
                    variant="transparent"
                    ariaLabel="Clear app search"
                    tooltip="Clear search"
                    className="text-muted-foreground"
                  />
                )}
              </div>
            </div>

            {/* Sort */}
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as AppletSortOption)}
            >
              <SelectTrigger className="w-[180px]">
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
                  variant={tab === t.value ? "primary" : "outline"}
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
                  label={`Applets (${isError ? "—" : filteredApps.length})`}
                  human={() => filteredApps.map(humanApplet).join("\n\n")}
                  json={() => filteredApps}
                  agent={() => ({
                    kind: "applets",
                    location: "AI Matrx — Applets",
                    description:
                      "The apps currently shown by the /applets grid (filtered).",
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
                        kind: "applets-briefs",
                        location: "AI Matrx — Applets",
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
                        kind: "applets-briefs",
                        location: "AI Matrx — Applets",
                        description:
                          "One-line briefs for every app, regardless of the active filters.",
                        data: allAppCardModels.map(appBrief),
                        attributes: { count: allAppCardModels.length },
                      }),
                    },
                  ]}
                />
                <ExportMenu
                  label="applets"
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
            <Button variant="primary" asChild>
              <Link href={newAppHref} aria-label="Create a new Applet">
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
              <AppletsGridSkeleton />
            ) : isError ? (
              <div
                role="alert"
                className="flex min-h-28 items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
              >
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Applets couldn’t load
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    The app catalog is temporarily unavailable. Check your
                    connection and try again.
                  </p>
                </div>
                <RefreshCwTapButton
                  variant="transparent"
                  ariaLabel="Retry loading Applets"
                  label="Retry"
                  onClick={() => void dispatch(fetchAppsInitial())}
                />
                <ErrorAlchemyMenu className="ml-auto" />
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
                    <Button variant="primary" asChild>
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
                  <AppletListCard
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
            variant={value === opt.value ? "primary" : "outline"}
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
              variant={isOn ? "outline" : "quiet"}
              className="w-full justify-start text-left"
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

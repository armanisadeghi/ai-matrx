"use client";

import { useMemo, useState } from "react";
import {
  AtSign,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileQuestion,
  Globe2,
  Image as ImageIcon,
  Link2,
  MapPin,
  MapPinned,
  Phone,
  Share2,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, rowsToCsv } from "@/components/agent-copy/export";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import {
  buildGroomerPresetPayload,
  groomerPresetVariants,
  type AgentCopyGroomerConfig,
  type AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import {
  Facebook,
  Instagram,
  Linkedin,
  Pinterest,
  Tiktok,
  Twitter,
  Youtube,
} from "@/components/icons/brand-icons";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingDiscoveryScope } from "@/features/surfaces/manifests/marketing-discovery.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  useBulkConfirmDiscoveredItems,
  useBulkDeleteDiscoveredItems,
  useBulkDismissDiscoveredItems,
  useBulkUndismissDiscoveredItems,
  useConfirmDiscoveredAsset,
  useConfirmDiscoveredFact,
  useConfirmDiscoveredProperty,
  useDeleteDiscoveredItem,
  useDiscoveredItems,
  useDismissDiscoveredItem,
  usePendingDiscoveredCount,
  useUndismissDiscoveredItem,
} from "@/features/marketing/data/hooks";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  BRAND_ASSET_KINDS,
  BRAND_ASSET_KIND_LABELS,
  BUSINESS_FACT_KINDS,
  BUSINESS_FACT_KIND_LABELS,
  PROPERTY_KINDS,
  PROPERTY_KIND_LABELS,
  isPropertyKind,
  isJsonRecord,
  type DiscoveredItem,
  type DiscoveredItemStatus,
  type PropertyKind,
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";
import {
  describeDiscoveredSocialProfile,
  inferDiscoveredPropertyType,
} from "@/features/marketing/lib/discovery-promotion";

const STATUS_TABS: Array<{ value: DiscoveredItemStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "dismissed", label: "Dismissed" },
];

const PAGE_SIZE_OPTIONS = [50, 100, 250] as const;
const DEFAULT_PAGE_SIZE = 100;

const CATEGORY_META: Record<
  string,
  { label: string; icon: typeof ImageIcon }
> = {
  media: { label: "Media & imagery", icon: ImageIcon },
  identity: { label: "Identity", icon: Type },
  social: { label: "Social profiles", icon: Share2 },
  fact: { label: "Business facts", icon: Phone },
  link: { label: "Notable links", icon: Link2 },
  other: { label: "Other", icon: FileQuestion },
};

const ASSET_KINDS = BRAND_ASSET_KINDS.map((value) => ({
  value,
  label: BRAND_ASSET_KIND_LABELS[value],
}));

const FACT_KINDS = BUSINESS_FACT_KINDS.map((value) => ({
  value,
  label: BUSINESS_FACT_KIND_LABELS[value],
}));

const PROPERTY_TYPE_OPTIONS = PROPERTY_KINDS.filter(
  (value) => value !== "website",
).map((value) => ({ value, label: PROPERTY_KIND_LABELS[value] }));

const SOCIAL_ICONS: Partial<Record<PropertyKind, LucideIcon>> = {
  instagram: Instagram,
  facebook: Facebook,
  x: Twitter,
  tiktok: Tiktok,
  youtube: Youtube,
  linkedin: Linkedin,
  pinterest: Pinterest,
  google_business_profile: MapPinned,
  other: Globe2,
};

function isMediaCategory(category: string): boolean {
  return category === "media";
}

function isSocialCategory(category: string): boolean {
  return category === "social";
}

/** Which type pool a category's rows choose from (drives bulk type-assign). */
type KindPool = "asset" | "property" | "fact";

function kindPoolOf(category: string): KindPool {
  if (isMediaCategory(category)) return "asset";
  if (isSocialCategory(category)) return "property";
  return "fact";
}

function kindOptionsFor(pool: KindPool) {
  return pool === "asset"
    ? ASSET_KINDS
    : pool === "property"
      ? PROPERTY_TYPE_OPTIONS
      : FACT_KINDS;
}

function defaultKind(item: DiscoveredItem): string {
  if (isSocialCategory(item.category)) return inferDiscoveredPropertyType(item);
  const guess = item.guessed_kind ?? "";
  const pool = kindOptionsFor(kindPoolOf(item.category));
  if (pool.some((option) => option.value === guess)) return guess;
  return pool[pool.length - 1].value;
}

function itemDisplayValue(item: DiscoveredItem): string {
  if (item.url) return item.url;
  if (isJsonRecord(item.value)) {
    const text = item.value.text ?? item.value.value;
    if (typeof text === "string" && text.trim()) return text;
    return JSON.stringify(item.value);
  }
  return String(item.value ?? "");
}

function itemContextSnippet(item: DiscoveredItem): string | null {
  if (!isJsonRecord(item.context)) return null;
  for (const key of ["found_in", "alt", "surrounding_text", "schema_path"]) {
    const value = item.context[key];
    if (typeof value === "string" && value.trim()) {
      return `${key.replace(/_/g, " ")}: ${value.trim()}`;
    }
  }
  return null;
}

export function DiscoveryInbox() {
  const { site } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const [status, setStatusState] = useState<DiscoveredItemStatus>("pending");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [kindOverrides, setKindOverrides] = useState<Record<string, string>>(
    {},
  );
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const pendingCount = usePendingDiscoveredCount(site.brand_id);
  const bulkConfirm = useBulkConfirmDiscoveredItems();
  const bulkDismiss = useBulkDismissDiscoveredItems();
  const bulkUndismiss = useBulkUndismissDiscoveredItems();
  const bulkDelete = useBulkDeleteDiscoveredItems();

  // A review action on the last page can shrink the list under the stored
  // page number — clamp at render so the query never strands the user on an
  // empty over-shot page. `knownTotal` is last-seen data, so the clamp is a
  // derived value, never an effect.
  const [knownTotal, setKnownTotal] = useState(0);
  const knownPageCount = Math.max(1, Math.ceil(knownTotal / pageSize));
  const currentPage = Math.min(page, knownPageCount);
  const items = useDiscoveredItems(site.brand_id, status, currentPage, pageSize);

  const rows = useMemo(() => items.data?.rows ?? [], [items.data]);
  const total = items.data?.total ?? 0;
  if (items.data !== undefined && total !== knownTotal) setKnownTotal(total);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const setStatus = (next: DiscoveredItemStatus) => {
    setStatusState(next);
    setPage(1);
    setKnownTotal(0);
    setSelected(new Set());
  };
  const goToPage = (next: number) => {
    setPage(next);
    setSelected(new Set());
  };

  const grouped = useMemo(() => {
    const groups = new Map<string, DiscoveredItem[]>();
    for (const item of rows) {
      const bucket = groups.get(item.category) ?? [];
      bucket.push(item);
      groups.set(item.category, bucket);
    }
    return [...groups.entries()];
  }, [rows]);

  const effectiveKind = (item: DiscoveredItem) =>
    kindOverrides[item.id] ?? defaultKind(item);

  // Selection is only meaningful against the rows actually on screen —
  // refetches can move ids out from under a stale selection.
  const selectedItems = useMemo(
    () => rows.filter((item) => selected.has(item.id)),
    [rows, selected],
  );
  const selectable = status !== "confirmed";
  const selectedPools = useMemo(
    () => new Set(selectedItems.map((item) => kindPoolOf(item.category))),
    [selectedItems],
  );
  const bulkTypePool =
    selectedPools.size === 1 ? [...selectedPools][0] : null;

  const toggleSelected = (itemId: string, next: boolean) => {
    setSelected((current) => {
      const draft = new Set(current);
      if (next) draft.add(itemId);
      else draft.delete(itemId);
      return draft;
    });
  };
  const setManySelected = (itemIds: string[], next: boolean) => {
    setSelected((current) => {
      const draft = new Set(current);
      for (const id of itemIds) {
        if (next) draft.add(id);
        else draft.delete(id);
      }
      return draft;
    });
  };

  const bulkBusy =
    bulkConfirm.isPending ||
    bulkDismiss.isPending ||
    bulkUndismiss.isPending ||
    bulkDelete.isPending;

  const assignBulkKind = (kind: string) => {
    setKindOverrides((current) => {
      const draft = { ...current };
      for (const item of selectedItems) draft[item.id] = kind;
      return draft;
    });
  };

  const runBulkConfirm = async () => {
    const ready = selectedItems.filter(
      (item) => effectiveKind(item) !== "other",
    );
    const needLabel = selectedItems.length - ready.length;
    if (ready.length === 0) {
      toast.error(
        "Every selected item is typed Other — Other needs a per-item label, so confirm those individually.",
      );
      return;
    }
    try {
      const result = await bulkConfirm.mutateAsync(
        ready.map((item) => ({
          item,
          kind: effectiveKind(item),
          label: null,
        })),
      );
      setSelected(new Set());
      if (result.failed.length > 0) {
        toast.error(
          `Confirmed ${result.confirmed}, ${result.failed.length} failed`,
          {
            description: result.failed
              .slice(0, 3)
              .map((f) => `${itemDisplayValue(f.item)}: ${f.message}`)
              .join(" · "),
          },
        );
      } else {
        toast.success(`Confirmed ${result.confirmed} items`);
      }
      if (needLabel > 0) {
        toast.info(
          `${needLabel} item${needLabel === 1 ? "" : "s"} typed Other skipped — Other needs a per-item label.`,
        );
      }
    } catch (error) {
      toast.error("Could not confirm items", {
        description: extractErrorMessage(error),
      });
    }
  };

  const runBulkDismiss = async () => {
    try {
      const changed = await bulkDismiss.mutateAsync(
        selectedItems.map((item) => item.id),
      );
      setSelected(new Set());
      toast.success(`Dismissed ${changed} items`);
    } catch (error) {
      toast.error("Could not dismiss items", {
        description: extractErrorMessage(error),
      });
    }
  };

  const runBulkRestore = async () => {
    try {
      const changed = await bulkUndismiss.mutateAsync(
        selectedItems.map((item) => item.id),
      );
      setSelected(new Set());
      toast.success(`Returned ${changed} items to pending`);
    } catch (error) {
      toast.error("Could not restore items", {
        description: extractErrorMessage(error),
      });
    }
  };

  const runBulkDelete = async () => {
    try {
      const changed = await bulkDelete.mutateAsync(
        selectedItems.map((item) => item.id),
      );
      setSelected(new Set());
      setConfirmingBulkDelete(false);
      toast.success(`Deleted ${changed} discoveries`);
    } catch (error) {
      toast.error("Could not delete items", {
        description: extractErrorMessage(error),
      });
    }
  };

  if (!site.brand_id) {
    return (
      <QueryError
        error={
          new Error(
            "This site has no brand link — a data integrity bug. Report it.",
          )
        }
      />
    );
  }
  if (items.isLoading) return <LoadingSurface label="Loading discoveries…" />;
  if (items.isError) {
    return (
      <QueryError error={items.error} onRetry={() => void items.refetch()} />
    );
  }

  const inboxCopy = webCopy({
    kind: "web-discovery-inbox",
    label: `Discovery inbox (${status})`,
    description:
      "Machine-discovered brand candidates awaiting human review; confirming promotes an item to confirmed brand assets/facts/properties.",
    surface: `Discovery inbox — ${site.name} (${status})`,
    data: rows,
    lines: [
      ["Site", site.domain],
      ["Status filter", status],
      ["Total items", total],
      ["Loaded on this page", rows.length],
      ["Page", `${currentPage} of ${pageCount}`],
      ...grouped.map(
        ([category, categoryItems]): [string, string] => [
          (CATEGORY_META[category] ?? CATEGORY_META.other).label,
          `${categoryItems.length} item${categoryItems.length === 1 ? "" : "s"}`,
        ],
      ),
    ],
    attributes: {
      site_id: site.id,
      brand_id: site.brand_id,
      status,
      count: rows.length,
      total,
      page: currentPage,
    },
  });

  const pageLocation = `AI Matrx — Marketing — Discovery inbox — ${site.name}`;
  const groomerSections = (): AgentCopyGroomerSection[] => [
    {
      id: "pending_count",
      title: "Pending count",
      description: "The brand-wide pending discovery count (all sites).",
      build: () => ({ pending_count: pendingCount.data ?? null }),
    },
    {
      id: "items",
      title: `Discovered items (${status})`,
      description: `${rows.length} of ${total} items loaded for the "${status}" tab (page ${currentPage} of ${pageCount}).`,
      cuttable: true,
      levelLabels: {
        full: `All ${rows.length} loaded (raw)`,
        compact: "Top 25",
        brief: "Counts by category",
      },
      build: (level) =>
        level === "full"
          ? rows
          : level === "compact"
            ? rows.slice(0, 25)
            : grouped.map(([category, items]) => ({
                category,
                count: items.length,
              })),
    },
  ];
  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Discovery inbox — ${site.name}`,
    kind: "marketing-discovery-page",
    location: pageLocation,
    description: `Machine-discovered brand candidates for ${site.name} (${status} tab).`,
    attributes: { site_id: site.id, brand_id: site.brand_id, status },
    summary: inboxCopy.human(),
    sections: groomerSections(),
  });

  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = (currentPage - 1) * pageSize + rows.length;

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-discovery"
      getScope={() => {
        // pending_count comes from the dedicated brand-scoped count query —
        // never the loaded rows' length, which caps at the list query's
        // page size and would lie above it. pending_items stays honest only
        // when the Pending tab's data is the data actually loaded — other
        // tabs load different rows.
        const pendingLoaded = status === "pending" && items.data !== undefined;
        const loadedItems =
          items.data === undefined
            ? undefined
            : rows.slice(0, 30).map((item) => ({
                id: item.id,
                category: item.category,
                guessed_kind: item.guessed_kind,
                confidence: item.confidence,
                url: item.url,
                label: itemDisplayValue(item),
                context: itemContextSnippet(item),
                status: item.status,
              }));
        return createMarketingDiscoveryScope({
          ...getBaseValues(),
          active_status: status,
          loaded_count: rows.length,
          category_counts: grouped.map(([category, categoryItems]) => ({
            category,
            count: categoryItems.length,
          })),
          pending_count: pendingCount.data,
          pending_items: pendingLoaded
            ? rows.slice(0, 30).map((item) => ({
                category: item.category,
                guessed_kind: item.guessed_kind,
                confidence: item.confidence,
                url: item.url,
                label: itemDisplayValue(item),
              }))
            : undefined,
          discovered_items: loadedItems,
        });
      }}
    >
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
              Discovery inbox
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                {total}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Everything found on this site that needs a human to say what it
              is. Confirming promotes an item to the brand's confirmed assets
              and facts.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
          {rows.length > 0 ? (
            <CopyButtons
              size="icon"
              {...inboxCopy}
              // Everything must be a superset of the graded variants — build
              // it from the same groomer sections, not from inboxCopy's
              // rows-only payload.
              agent={() =>
                buildGroomerPresetPayload(groomerConfig(), "everything")
              }
              json={() => rows}
              aiVariants={groomerPresetVariants(groomerConfig)}
            />
          ) : null}
          {rows.length > 0 ? (
            <ExportMenu
              label={`discovery-inbox-${site.domain}-${status}`}
              items={[
                jsonExportItem(() => rows, "JSON (loaded items, raw)"),
                {
                  id: "csv",
                  label: "CSV (loaded items)",
                  build: () => ({
                    content: rowsToCsv(
                      rows as unknown as Array<Record<string, unknown>>,
                    ),
                    extension: "csv",
                    mime: "text/csv",
                  }),
                },
              ]}
            />
          ) : null}
          <AgentCopyGroomerLauncher config={groomerConfig} />
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatus(tab.value)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  status === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          </div>
        </header>

        {selectable && rows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={
                  selectedItems.length === 0
                    ? false
                    : selectedItems.length === rows.length
                      ? true
                      : "indeterminate"
                }
                onCheckedChange={(next) =>
                  setManySelected(
                    rows.map((item) => item.id),
                    next === true,
                  )
                }
                aria-label="Select all items on this page"
              />
              {selectedItems.length > 0 ? (
                <span className="font-medium text-foreground tabular-nums">
                  {selectedItems.length} selected
                </span>
              ) : (
                <span>Select all on page</span>
              )}
            </label>
            {selectedItems.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {status === "pending" ? (
                  <>
                    <Select
                      // Reset per selection so a fresh pick always fires.
                      key={selectedItems.map((i) => i.id).join(",")}
                      onValueChange={assignBulkKind}
                      disabled={!bulkTypePool || bulkBusy}
                    >
                      <SelectTrigger className="h-7 w-40 text-xs">
                        <SelectValue
                          placeholder={
                            bulkTypePool
                              ? "Set type for selected"
                              : "Mixed categories"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(bulkTypePool
                          ? kindOptionsFor(bulkTypePool)
                          : []
                        ).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-7 gap-1"
                      disabled={bulkBusy}
                      onClick={() => void runBulkConfirm()}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Confirm {selectedItems.length}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-muted-foreground"
                      disabled={bulkBusy}
                      onClick={() => void runBulkDismiss()}
                    >
                      <X className="h-3.5 w-3.5" />
                      Dismiss
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-muted-foreground"
                    disabled={bulkBusy}
                    onClick={() => void runBulkRestore()}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Restore
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-muted-foreground hover:text-destructive"
                  disabled={bulkBusy}
                  onClick={() => setConfirmingBulkDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-muted-foreground"
                  disabled={bulkBusy}
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {grouped.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
            <FileQuestion className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {status === "pending"
                ? "No discoveries waiting"
                : `No ${status} items`}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {status === "pending"
                ? "Initialize or re-initialize the site to sweep the homepage for logos, imagery, social profiles, and contact details."
                : "Items you review will appear here."}
            </p>
          </div>
        ) : (
          grouped.map(([category, categoryItems]) => {
            const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
            const Icon = meta.icon;
            const categorySelected = categoryItems.filter((item) =>
              selected.has(item.id),
            ).length;
            return (
              <section
                key={category}
                className="overflow-hidden rounded-lg border border-border bg-card"
              >
                <header className="flex items-center gap-2 border-b border-border px-3 py-2">
                  {selectable ? (
                    <Checkbox
                      checked={
                        categorySelected === 0
                          ? false
                          : categorySelected === categoryItems.length
                            ? true
                            : "indeterminate"
                      }
                      onCheckedChange={(next) =>
                        setManySelected(
                          categoryItems.map((item) => item.id),
                          next === true,
                        )
                      }
                      aria-label={`Select all ${meta.label} items`}
                    />
                  ) : null}
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {meta.label}
                  </h2>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {categoryItems.length}
                  </span>
                </header>
                <ul className="divide-y divide-border">
                  {categoryItems.map((item) => (
                    <DiscoveryRow
                      key={item.id}
                      item={item}
                      readOnly={status !== "pending"}
                      kind={effectiveKind(item)}
                      onKindChange={(kind) =>
                        setKindOverrides((current) => ({
                          ...current,
                          [item.id]: kind,
                        }))
                      }
                      selectable={selectable}
                      selected={selected.has(item.id)}
                      onSelectedChange={(next) =>
                        toggleSelected(item.id, next)
                      }
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}

        {total > 0 ? (
          <footer className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              Showing {rangeStart}–{rangeEnd} of {total}
            </span>
            <div className="flex items-center gap-1.5">
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  goToPage(1);
                }}
              >
                <SelectTrigger className="h-7 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1"
                disabled={currentPage <= 1 || items.isFetching}
                onClick={() => goToPage(currentPage - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {currentPage} / {pageCount}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1"
                disabled={currentPage >= pageCount || items.isFetching}
                onClick={() => goToPage(currentPage + 1)}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </footer>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmingBulkDelete}
        onOpenChange={setConfirmingBulkDelete}
        title={`Delete ${selectedItems.length} discoveries?`}
        description="The candidates move to trash. If the crawler finds the same values again they will not reappear."
        variant="destructive"
        confirmLabel="Delete"
        busy={bulkDelete.isPending}
        onConfirm={() => void runBulkDelete()}
      />
    </main>
    </SurfaceRuntimeProvider>
  );
}

function DiscoveryRow({
  item,
  readOnly,
  kind,
  onKindChange,
  selectable,
  selected,
  onSelectedChange,
}: {
  item: DiscoveredItem;
  readOnly: boolean;
  kind: string;
  onKindChange: (kind: string) => void;
  selectable: boolean;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
  const confirmAsset = useConfirmDiscoveredAsset();
  const confirmFact = useConfirmDiscoveredFact();
  const confirmProperty = useConfirmDiscoveredProperty();
  const dismiss = useDismissDiscoveredItem();
  const undismiss = useUndismissDiscoveredItem();
  const deleteMutation = useDeleteDiscoveredItem();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const media = isMediaCategory(item.category);
  const social = isSocialCategory(item.category);
  const socialPreview = social ? describeDiscoveredSocialProfile(item) : null;
  const SocialIcon = socialPreview
    ? (SOCIAL_ICONS[socialPreview.kind] ?? AtSign)
    : AtSign;
  const kindOptions = kindOptionsFor(kindPoolOf(item.category));
  const customLabelRequired = kind === "other";
  const busy =
    confirmAsset.isPending ||
    confirmFact.isPending ||
    confirmProperty.isPending ||
    dismiss.isPending ||
    undismiss.isPending ||
    deleteMutation.isPending;
  const display = itemDisplayValue(item);
  const context = itemContextSnippet(item);
  const itemCopy = webCopy({
    kind: "web-discovered-item",
    label: "Discovered item",
    description:
      "One machine-discovered brand candidate from the site discovery inbox.",
    surface: `Discovery inbox — ${display}`,
    data: item,
    lines: [
      ["Category", item.category],
      ["Guessed kind", item.guessed_kind],
      [
        "Confidence",
        typeof item.confidence === "number"
          ? `${Math.round(item.confidence * 100)}%`
          : null,
      ],
      ["Value", display],
      ["Context", context],
      ["Status", item.status],
    ],
    attributes: { item_id: item.id, category: item.category, status: item.status },
  });
  const previewUrl =
    media && item.url && /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(item.url)
      ? item.url
      : null;

  const confirm = async () => {
    const trimmedLabel = customLabel.trim();
    if (customLabelRequired && !trimmedLabel) {
      toast.error("Add a custom label for an Other item.");
      return;
    }
    try {
      if (media) {
        await confirmAsset.mutateAsync({
          item,
          assetKind: kind,
          title: trimmedLabel || null,
        });
      } else if (social) {
        if (!isPropertyKind(kind)) {
          throw new Error("Select a valid property type.");
        }
        await confirmProperty.mutateAsync({
          item,
          propertyKind: kind,
          displayName: trimmedLabel || null,
        });
      } else {
        await confirmFact.mutateAsync({
          item,
          factKind: kind,
          label: trimmedLabel || null,
        });
      }
      toast.success("Confirmed");
    } catch (error) {
      toast.error("Could not confirm item", {
        description: extractErrorMessage(error),
      });
    }
  };

  const reject = async () => {
    try {
      await dismiss.mutateAsync(item.id);
    } catch (error) {
      toast.error("Could not dismiss item", {
        description: extractErrorMessage(error),
      });
    }
  };

  const restore = async () => {
    try {
      await undismiss.mutateAsync(item.id);
      toast.success("Returned to pending");
    } catch (error) {
      toast.error("Could not restore item", {
        description: extractErrorMessage(error),
      });
    }
  };

  const remove = async () => {
    try {
      await deleteMutation.mutateAsync(item.id);
      toast.success("Discovery deleted");
      setConfirmingDelete(false);
    } catch (error) {
      toast.error("Could not delete item", {
        description: extractErrorMessage(error),
      });
    }
  };

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 px-3 py-2",
        selected && "bg-accent/40",
      )}
    >
      {selectable ? (
        <Checkbox
          checked={selected}
          onCheckedChange={(next) => onSelectedChange(next === true)}
          aria-label={`Select ${display}`}
        />
      ) : null}
      {socialPreview ? (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/40 text-foreground shadow-sm">
          <SocialIcon className="h-5 w-5" aria-hidden />
        </span>
      ) : previewUrl ? (
        <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border/60 bg-muted/30">
          {/* Discovered candidates are external public URLs, not our media. */}
          <img
            src={previewUrl}
            alt=""
            className="h-full w-full object-contain"
            loading="lazy"
          />
        </span>
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40 text-muted-foreground">
          {item.category === "social" ? (
            <AtSign className="h-4 w-4" />
          ) : item.category === "fact" ? (
            <MapPin className="h-4 w-4" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
        </span>
      )}

      <div className="min-w-0 flex-1 basis-56">
        <div className="flex items-center gap-1.5">
          {item.guessed_kind ? (
            <Badge variant="outline" className="text-[10px]">
              {socialPreview
                ? socialPreview.providerLabel
                : item.guessed_kind.replace(/_/g, " ")}
            </Badge>
          ) : null}
          {typeof item.confidence === "number" ? (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {Math.round(item.confidence * 100)}%
            </span>
          ) : null}
        </div>
        {socialPreview ? (
          <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {socialPreview.identity}
            </p>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {socialPreview.profileType}
            </span>
          </div>
        ) : null}
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "block truncate font-mono text-xs text-muted-foreground transition-colors hover:text-primary",
              !socialPreview && "mt-0.5 text-foreground",
            )}
          >
            {display}
          </a>
        ) : (
          <p className="mt-0.5 truncate font-mono text-xs text-foreground">
            {display}
          </p>
        )}
        {context ? (
          <p className="truncate text-[11px] text-muted-foreground">
            {context}
          </p>
        ) : null}
      </div>

      <span className="shrink-0">
        <CopyButtons size="icon" {...itemCopy} />
      </span>
      {item.url ? (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
        >
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${socialPreview?.providerLabel ?? "discovered link"} in a new tab`}
            title="Open in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      ) : null}

      {readOnly ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge
            variant={item.status === "confirmed" ? "success" : "outline"}
            className="capitalize"
          >
            {item.status}
          </Badge>
          {item.status === "dismissed" ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-muted-foreground"
                disabled={busy}
                onClick={() => void restore()}
              >
                <Undo2 className="h-3.5 w-3.5" />
                Restore
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </>
          ) : null}
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <Select value={kind} onValueChange={onKindChange}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kindOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
            className="h-8 w-40 text-xs"
            placeholder={customLabelRequired ? "Custom label (required)" : "Label (optional)"}
            aria-label={
              media ? "Asset label" : social ? "Property label" : "Fact label"
            }
          />
          <Button
            size="sm"
            className="h-8 gap-1"
            disabled={busy || (customLabelRequired && !customLabel.trim())}
            onClick={() => void confirm()}
          >
            <Check className="h-3.5 w-3.5" />
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-muted-foreground"
            disabled={busy}
            onClick={() => void reject()}
          >
            <X className="h-3.5 w-3.5" />
            Dismiss
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            title="Delete discovery"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this discovery?"
        description="The candidate moves to trash. If the crawler finds the same value again it will not reappear."
        variant="destructive"
        confirmLabel="Delete"
        busy={deleteMutation.isPending}
        onConfirm={() => void remove()}
      />
    </li>
  );
}

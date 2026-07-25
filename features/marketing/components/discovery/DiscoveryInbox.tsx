"use client";

import { useMemo, useState } from "react";
import {
  AtSign,
  Check,
  FileQuestion,
  Image as ImageIcon,
  Link2,
  MapPin,
  Phone,
  Share2,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";
import { inferDiscoveredPropertyType } from "@/features/marketing/lib/discovery-promotion";

const STATUS_TABS: Array<{ value: DiscoveredItemStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "dismissed", label: "Dismissed" },
];

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

function isMediaCategory(category: string): boolean {
  return category === "media";
}

function isSocialCategory(category: string): boolean {
  return category === "social";
}

function defaultKind(item: DiscoveredItem): string {
  if (isSocialCategory(item.category)) return inferDiscoveredPropertyType(item);
  const guess = item.guessed_kind ?? "";
  const pool = isMediaCategory(item.category) ? ASSET_KINDS : FACT_KINDS;
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
  const [status, setStatus] = useState<DiscoveredItemStatus>("pending");
  const items = useDiscoveredItems(site.brand_id, status);
  const pendingCount = usePendingDiscoveredCount(site.brand_id);

  const grouped = useMemo(() => {
    const groups = new Map<string, DiscoveredItem[]>();
    for (const item of items.data ?? []) {
      const bucket = groups.get(item.category) ?? [];
      bucket.push(item);
      groups.set(item.category, bucket);
    }
    return [...groups.entries()];
  }, [items.data]);

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

  const rows = items.data ?? [];
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
      ["Items", rows.length],
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
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-discovery"
      getScope={() => {
        // pending_count comes from the dedicated brand-scoped count query —
        // never the loaded rows' length, which caps at the list query's
        // limit and would lie above it. pending_items stays honest only when
        // the Pending tab's data is the data actually loaded — other tabs
        // load different rows.
        const pendingLoaded = status === "pending" && items.data !== undefined;
        return createMarketingDiscoveryScope({
          ...getBaseValues(),
          pending_count: pendingCount.data,
          pending_items: pendingLoaded
            ? rows.slice(0, 30).map((item) => ({
                guessed_kind: item.guessed_kind,
                url: item.url,
                label: itemDisplayValue(item),
              }))
            : undefined,
        });
      }}
    >
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-foreground">
              Discovery inbox
            </h1>
            <p className="text-xs text-muted-foreground">
              Everything found on this site that needs a human to say what it
              is. Confirming promotes an item to the brand's confirmed assets
              and facts.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
          {rows.length > 0 ? <CopyButtons size="icon" {...inboxCopy} /> : null}
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
            return (
              <section
                key={category}
                className="overflow-hidden rounded-lg border border-border bg-card"
              >
                <header className="flex items-center gap-2 border-b border-border px-3 py-2">
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
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </main>
    </SurfaceRuntimeProvider>
  );
}

function DiscoveryRow({
  item,
  readOnly,
}: {
  item: DiscoveredItem;
  readOnly: boolean;
}) {
  const confirmAsset = useConfirmDiscoveredAsset();
  const confirmFact = useConfirmDiscoveredFact();
  const confirmProperty = useConfirmDiscoveredProperty();
  const dismiss = useDismissDiscoveredItem();
  const undismiss = useUndismissDiscoveredItem();
  const deleteMutation = useDeleteDiscoveredItem();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [kind, setKind] = useState(() => defaultKind(item));
  const [customLabel, setCustomLabel] = useState("");
  const media = isMediaCategory(item.category);
  const social = isSocialCategory(item.category);
  const kindOptions = media
    ? ASSET_KINDS
    : social
      ? PROPERTY_TYPE_OPTIONS
      : FACT_KINDS;
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
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      {previewUrl ? (
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
              {item.guessed_kind.replace(/_/g, " ")}
            </Badge>
          ) : null}
          {typeof item.confidence === "number" ? (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {Math.round(item.confidence * 100)}%
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate font-mono text-xs text-foreground">
          {display}
        </p>
        {context ? (
          <p className="truncate text-[11px] text-muted-foreground">
            {context}
          </p>
        ) : null}
      </div>

      <span className="shrink-0">
        <CopyButtons size="icon" {...itemCopy} />
      </span>

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
          <Select value={kind} onValueChange={setKind}>
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
            placeholder={
              customLabelRequired ? "Custom label (required)" : "Label (optional)"
            }
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

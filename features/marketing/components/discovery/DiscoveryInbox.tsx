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
  Type,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  useConfirmDiscoveredAsset,
  useConfirmDiscoveredFact,
  useDiscoveredItems,
  useDismissDiscoveredItem,
} from "@/features/marketing/data/hooks";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { isJsonRecord } from "@/features/marketing/types";
import type {
  DiscoveredItem,
  DiscoveredItemStatus,
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

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

const ASSET_KINDS = [
  { value: "logo", label: "Logo" },
  { value: "logo_dark", label: "Logo (dark)" },
  { value: "favicon", label: "Favicon" },
  { value: "wordmark", label: "Wordmark" },
  { value: "hero_image", label: "Hero image" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "document", label: "Document" },
  { value: "other", label: "Other asset" },
];

const FACT_KINDS = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "address", label: "Address" },
  { value: "hours", label: "Hours" },
  { value: "tagline", label: "Tagline" },
  { value: "legal_name", label: "Legal name" },
  { value: "social_profile", label: "Social profile" },
  { value: "service_area", label: "Service area" },
  { value: "other", label: "Other fact" },
];

function isMediaCategory(category: string): boolean {
  return category === "media";
}

function defaultKind(item: DiscoveredItem): string {
  const guess = item.guessed_kind ?? "";
  const pool = isMediaCategory(item.category) ? ASSET_KINDS : FACT_KINDS;
  if (pool.some((option) => option.value === guess)) return guess;
  if (item.category === "social") return "social_profile";
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
  const [status, setStatus] = useState<DiscoveredItemStatus>("pending");
  const items = useDiscoveredItems(site.brand_id, status);

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

  return (
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
  const dismiss = useDismissDiscoveredItem();
  const [kind, setKind] = useState(() => defaultKind(item));
  const media = isMediaCategory(item.category);
  const kindOptions = media ? ASSET_KINDS : FACT_KINDS;
  const busy =
    confirmAsset.isPending || confirmFact.isPending || dismiss.isPending;
  const display = itemDisplayValue(item);
  const context = itemContextSnippet(item);
  const previewUrl =
    media && item.url && /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(item.url)
      ? item.url
      : null;

  const confirm = async () => {
    try {
      if (media) {
        await confirmAsset.mutateAsync({ item, assetKind: kind, title: null });
      } else {
        await confirmFact.mutateAsync({ item, factKind: kind, label: null });
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

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      {previewUrl ? (
        <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border/60 bg-muted/30">
          {/* Discovered candidates are external public URLs, not our media. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
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

      {readOnly ? (
        <Badge
          variant={item.status === "confirmed" ? "success" : "outline"}
          className="capitalize"
        >
          {item.status}
        </Badge>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
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
          <Button
            size="sm"
            className="h-8 gap-1"
            disabled={busy}
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
        </div>
      )}
    </li>
  );
}

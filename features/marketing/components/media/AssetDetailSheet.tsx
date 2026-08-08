"use client";

/**
 * AssetDetailSheet — drill-down for one crawled media asset: full metadata,
 * every page it appears on (linked), standards check, and actions (open
 * original, copy, add to the brand library, order a replacement).
 *
 * Third-party crawl asset — rendered via plain `<img>` (documented exception:
 * no file_id to re-mint; see SnapshotMediaGallery header).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  ExternalLink,
  FolderPlus,
  Loader2,
  Sparkles,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCreateBrandAsset } from "@/features/marketing/data/hooks";
import type { SnapshotMediaAsset } from "@/features/marketing/lib/snapshot-media";
import type {
  MediaStandardSlot,
  SiteMediaStandards,
} from "@/features/marketing/data/media-library";
import {
  BRAND_ASSET_KIND_LABELS,
  BRAND_ASSET_KINDS,
  type BrandAssetKind,
} from "@/features/marketing/types";

function MetaRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1 last:border-b-0">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 break-all text-right text-[11px] text-foreground">
        {value}
      </span>
    </div>
  );
}

/** Nearest standard slot by aspect, when the asset has known dimensions. */
function nearestStandardSlot(
  asset: SnapshotMediaAsset,
  standards: SiteMediaStandards | null,
): { slot: MediaStandardSlot; matches: boolean } | null {
  if (!standards || standards.slots.length === 0) return null;
  const media = asset.media;
  const width = media.width;
  const height = media.height;
  if (!width || !height) return null;
  const aspect = width / height;
  let best: { slot: MediaStandardSlot; diff: number } | null = null;
  for (const slot of standards.slots) {
    if (!slot.width || !slot.height) continue;
    const diff = Math.abs(slot.width / slot.height - aspect);
    if (!best || diff < best.diff) best = { slot, diff };
  }
  if (!best) return null;
  const slotW = best.slot.width ?? 0;
  const slotH = best.slot.height ?? 0;
  const matches =
    best.diff < 0.05 && width >= slotW * 0.9 && height >= slotH * 0.9;
  return { slot: best.slot, matches };
}

export function AssetDetailSheet({
  asset,
  onOpenChange,
  sitePath,
  brandId,
  organizationId,
  standards,
  onOrderReplacement,
}: {
  asset: SnapshotMediaAsset | null;
  onOpenChange: (open: boolean) => void;
  sitePath: string;
  brandId: string;
  organizationId: string;
  standards: SiteMediaStandards | null;
  /** Jump to the Generate view prefilled from this asset. */
  onOrderReplacement?: (asset: SnapshotMediaAsset) => void;
}) {
  const createAsset = useCreateBrandAsset();
  const [libraryKind, setLibraryKind] = useState<BrandAssetKind>("image");
  const [copied, setCopied] = useState(false);

  const standardCheck = useMemo(
    () => (asset ? nearestStandardSlot(asset, standards) : null),
    [asset, standards],
  );

  if (!asset) return null;

  const copySrc = async () => {
    await navigator.clipboard.writeText(asset.src);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const addToLibrary = async () => {
    try {
      await createAsset.mutateAsync({
        organizationId,
        brandId,
        kind: libraryKind,
        sourceUrl: asset.src,
        title: asset.alt || null,
        notes: `Promoted from the crawled media inventory (${asset.pages.length} page${asset.pages.length === 1 ? "" : "s"}).`,
        isPrimary: false,
        source: "discovered",
      });
      toast.success("Added to the brand library");
    } catch (error) {
      toast.error("Could not add to the library", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <Sheet open={Boolean(asset)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="space-y-1">
          <SheetTitle className="text-sm">Media asset</SheetTitle>
          <SheetDescription className="break-all font-mono text-[10px]">
            {asset.src}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-4">
          <div className="flex items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
            {/* Third-party crawl asset — see the exception note at top. */}
            <img
              src={asset.src}
              alt={asset.alt ?? ""}
              className="max-h-64 w-auto max-w-full object-contain"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="h-5 text-[10px] capitalize">
              {asset.tier}
            </Badge>
            <Badge variant="outline" className="h-5 text-[10px] capitalize">
              {asset.aspect}
            </Badge>
            {asset.featured ? (
              <Badge variant="outline" className="h-5 text-[10px]">
                Featured
              </Badge>
            ) : null}
            {asset.missingAlt ? (
              <Badge
                variant="outline"
                className="h-5 border-amber-500/50 text-[10px] text-amber-600 dark:text-amber-400"
              >
                Missing alt
              </Badge>
            ) : null}
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/10 px-2.5 py-1">
            <MetaRow label="Dimensions" value={asset.sizeLabel} />
            <MetaRow label="Alt text" value={asset.alt} />
            <MetaRow label="Loading" value={asset.loading} />
            <MetaRow
              label="Occurrences"
              value={asset.occurrences.toLocaleString()}
            />
          </div>

          {standardCheck ? (
            <div
              className={
                standardCheck.matches
                  ? "rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-2 text-[11px] text-emerald-700 dark:text-emerald-400"
                  : "rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-400"
              }
            >
              {standardCheck.matches ? (
                <>
                  Meets the “{standardCheck.slot.name}” standard (
                  {standardCheck.slot.width}×{standardCheck.slot.height}).
                </>
              ) : (
                <>
                  Closest standard: “{standardCheck.slot.name}” (
                  {standardCheck.slot.width}×{standardCheck.slot.height}) — this
                  asset {asset.sizeLabel ? `is ${asset.sizeLabel}` : "has unknown dimensions"}.
                </>
              )}
            </div>
          ) : null}

          <section className="space-y-1.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
              Used on {asset.pages.length} page
              {asset.pages.length === 1 ? "" : "s"}
            </h4>
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {asset.pages.map((page) => (
                <Link
                  key={page.pageId}
                  href={`${sitePath}/pages/${page.pageId}`}
                  className="block truncate rounded-md border border-border/60 bg-card px-2 py-1 font-mono text-[10px] text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  title={page.url}
                >
                  {page.path ?? page.url}
                </Link>
              ))}
              {asset.pages.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Page attribution was not captured for this asset.
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-2 border-t border-border/60 pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => void copySrc()}
              >
                {copied ? (
                  <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                Copy URL
              </Button>
              <Button size="sm" variant="outline" className="h-7" asChild>
                <a href={asset.src} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open original
                </a>
              </Button>
              {onOrderReplacement ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => onOrderReplacement(asset)}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Order replacement
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              <Select
                value={libraryKind}
                onValueChange={(value) =>
                  setLibraryKind(value as BrandAssetKind)
                }
              >
                <SelectTrigger className="h-7 w-36 px-2 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="text-[11px]">
                  {/* Promoting an IMAGE — video/color/font kinds don't apply. */}
                  {BRAND_ASSET_KINDS.filter(
                    (kind) =>
                      kind !== "color" && kind !== "font" && kind !== "video",
                  ).map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {BRAND_ASSET_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={createAsset.isPending}
                onClick={() => void addToLibrary()}
              >
                {createAsset.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                )}
                Add to library
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

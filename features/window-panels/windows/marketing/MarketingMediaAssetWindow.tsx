"use client";

/**
 * Resizable detail window for one third-party image observed by a site crawl.
 * The route passes only siteId + src; this window reuses the canonical site and
 * media queries, rebuilds the deduped asset, and keeps the image canvas large
 * while WindowPanel's secondary panel owns metadata and actions.
 */

import { useState } from "react";
import {
  Check,
  Copy,
  Crop,
  ExternalLink,
  FolderPlus,
  ImagePlus,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ImageViewer } from "@/features/window-panels/windows/image/ImageViewerWindow";
import { fileHandler } from "@/features/files/handler/handler";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  useCreateBrandAsset,
  useSite,
  useSiteMedia,
} from "@/features/marketing/data/hooks";
import {
  parseSiteMediaStandards,
  type MediaStandardSlot,
  type SiteMediaStandards,
} from "@/features/marketing/data/media-library";
import {
  buildSnapshotMediaAssets,
  type SnapshotMediaAsset,
} from "@/features/marketing/lib/snapshot-media";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  BRAND_ASSET_KIND_LABELS,
  BRAND_ASSET_KINDS,
  type BrandAssetKind,
} from "@/features/marketing/types";
import { emitMarketingMediaAssetWindowEvent } from "@/features/overlays/callbacks/marketingMediaAssetWindow";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  IMAGE_VIEWER_SURFACE_NAME,
  createImageViewerScope,
} from "@/features/surfaces/manifests/image-viewer.manifest";

export interface MarketingMediaAssetWindowProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  callbackGroupId?: string | null;
  siteId?: string | null;
  assetSrc?: string | null;
}

function srcTail(src: string): string {
  const withoutQuery = src.split(/[?#]/)[0] ?? src;
  const segments = withoutQuery.split("/").filter(Boolean);
  return segments.at(-1) ?? "Media asset";
}

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
  standards: SiteMediaStandards,
): { slot: MediaStandardSlot; matches: boolean } | null {
  if (standards.slots.length === 0) return null;
  const width = asset.media.width;
  const height = asset.media.height;
  if (!width || !height) return null;
  const aspect = width / height;
  let best: { slot: MediaStandardSlot; diff: number } | null = null;
  for (const slot of standards.slots) {
    if (!slot.width || !slot.height) continue;
    const diff = Math.abs(slot.width / slot.height - aspect);
    if (!best || diff < best.diff) best = { slot, diff };
  }
  if (!best) return null;
  const slotWidth = best.slot.width ?? 0;
  const slotHeight = best.slot.height ?? 0;
  return {
    slot: best.slot,
    matches:
      best.diff < 0.05 &&
      width >= slotWidth * 0.9 &&
      height >= slotHeight * 0.9,
  };
}

export default function MarketingMediaAssetWindow({
  isOpen,
  onClose,
  instanceId,
  callbackGroupId,
  siteId,
  assetSrc,
}: MarketingMediaAssetWindowProps) {
  if (!isOpen || !siteId || !assetSrc) return null;
  return (
    <MarketingMediaAssetWindowContent
      instanceId={instanceId}
      callbackGroupId={callbackGroupId}
      siteId={siteId}
      assetSrc={assetSrc}
      onClose={onClose}
    />
  );
}

function MarketingMediaAssetWindowContent({
  instanceId,
  callbackGroupId,
  siteId,
  assetSrc,
  onClose,
}: {
  instanceId: string;
  callbackGroupId?: string | null;
  siteId: string;
  assetSrc: string;
  onClose: () => void;
}) {
  const site = useSite(siteId);
  const media = useSiteMedia(siteId);
  const isMobile = useIsMobile();

  const asset = (() => {
    if (!media.data) return null;
    return (
      buildSnapshotMediaAssets(
        media.data.flatMap((row) =>
          row.images.items.map((image) => ({
            image,
            page: { pageId: row.pageId, url: row.url, path: row.path },
          })),
        ),
      ).assets.find((candidate) => candidate.src === assetSrc) ?? null
    );
  })();

  const handleClose = () => {
    emitMarketingMediaAssetWindowEvent(callbackGroupId, {
      type: "window-close",
      windowInstanceId: instanceId,
    });
    onClose();
  };

  const title = srcTail(assetSrc);
  const loading = site.isLoading || media.isLoading;
  const error = site.error ?? media.error;
  const siteRow = site.data ?? null;
  const standards = siteRow ? parseSiteMediaStandards(siteRow.settings) : null;
  const sitePath = siteRow
    ? marketingRoutes.site(siteRow.brand_id, siteRow.id)
    : null;

  const inspector =
    asset && siteRow && standards && sitePath ? (
      <AssetInspector
        asset={asset}
        sitePath={sitePath}
        brandId={siteRow.brand_id}
        organizationId={siteRow.organization_id}
        standards={standards}
        instanceId={instanceId}
        callbackGroupId={callbackGroupId}
        onClose={handleClose}
      />
    ) : null;

  return (
    <WindowPanel
      id={`marketing-media-asset-${instanceId}`}
      overlayId="marketingMediaAssetWindow"
      title={title}
      width={1100}
      height={720}
      minWidth={640}
      minHeight={420}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      secondaryPanel={!isMobile ? inspector : undefined}
      secondaryPanelDefaultSize={390}
      secondaryPanelMinSize={320}
      onClose={handleClose}
      onCollectData={() => ({
        callbackGroupId: callbackGroupId ?? null,
        siteId,
        assetSrc,
      })}
    >
      {loading ? (
        <LoadingSurface label="Loading media asset…" />
      ) : error ? (
        <QueryError
          error={error}
          onRetry={() => {
            void site.refetch();
            void media.refetch();
          }}
        />
      ) : !siteRow || !sitePath ? (
        <MissingAssetState
          message="This site's details are no longer available."
          onRetry={() => void site.refetch()}
        />
      ) : !asset ? (
        <MissingAssetState
          message="This image is no longer present in the latest crawled inventory."
          onRetry={() => void media.refetch()}
        />
      ) : (
        <SurfaceRuntimeProvider
          surfaceName={IMAGE_VIEWER_SURFACE_NAME}
          getScope={() =>
            createImageViewerScope({
              images: [asset.src],
              image_count: 1,
              active_index: 0,
              active_image_url: asset.src,
              active_image_alt: asset.alt ?? undefined,
            })
          }
          isEditable={false}
        >
          {isMobile ? (
            <div className="h-full overflow-y-auto">
              <div className="h-[55dvh] min-h-72 border-b border-border">
                <ImageViewer images={[asset.src]} alts={[asset.alt ?? title]} />
              </div>
              {inspector}
            </div>
          ) : (
            <ImageViewer images={[asset.src]} alts={[asset.alt ?? title]} />
          )}
        </SurfaceRuntimeProvider>
      )}
    </WindowPanel>
  );
}

function MissingAssetState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Refresh
      </Button>
    </div>
  );
}

function AssetInspector({
  asset,
  sitePath,
  brandId,
  organizationId,
  standards,
  instanceId,
  callbackGroupId,
  onClose,
}: {
  asset: SnapshotMediaAsset;
  sitePath: string;
  brandId: string | null;
  organizationId: string;
  standards: SiteMediaStandards;
  instanceId: string;
  callbackGroupId?: string | null;
  onClose: () => void;
}) {
  const createAsset = useCreateBrandAsset();
  const [libraryKind, setLibraryKind] = useState<BrandAssetKind>("image");
  const [copied, setCopied] = useState(false);
  const [importing, setImporting] = useState(false);
  const standardCheck = nearestStandardSlot(asset, standards);

  const copySrc = async () => {
    await navigator.clipboard.writeText(asset.src);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const importAndEdit = async () => {
    if (!brandId) {
      toast.error("This site is not connected to a brand.");
      return;
    }
    setImporting(true);
    try {
      const uploaded = await fileHandler.upload(
        { kind: "external_url", url: asset.src },
        { folderPath: "Images/Brand Library" },
      );
      if (!uploaded.fileId) {
        throw new Error("Import finished without a file id.");
      }
      const created = await createAsset.mutateAsync({
        organizationId,
        brandId,
        kind: "image",
        sourceUrl: asset.src,
        fileId: uploaded.fileId,
        title: asset.alt || null,
        notes: "Imported from the crawled media inventory for editing.",
        isPrimary: false,
        source: "discovered",
      });
      toast.success("Imported to the brand library");
      emitMarketingMediaAssetWindowEvent(callbackGroupId, {
        type: "imported-for-edit",
        windowInstanceId: instanceId,
        asset: created,
      });
      onClose();
    } catch (error) {
      toast.error("Could not import this image", {
        description:
          error instanceof Error
            ? `${error.message} — the host may block cross-origin downloads.`
            : undefined,
      });
    } finally {
      setImporting(false);
    }
  };

  const addToLibrary = async () => {
    if (!brandId) {
      toast.error("This site is not connected to a brand.");
      return;
    }
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

  const orderReplacement = () => {
    emitMarketingMediaAssetWindowEvent(callbackGroupId, {
      type: "order-replacement",
      windowInstanceId: instanceId,
      asset,
    });
    onClose();
  };

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Media asset</h2>
          <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
            {asset.src}
          </p>
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
              className="h-5 border-warning/50 text-[10px] text-warning"
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
            className={cn(
              "rounded-lg border px-2.5 py-2 text-[11px]",
              standardCheck.matches
                ? "border-success/30 bg-success/5 text-success"
                : "border-warning/30 bg-warning/5 text-warning",
            )}
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
                asset{" "}
                {asset.sizeLabel
                  ? `is ${asset.sizeLabel}`
                  : "has unknown dimensions"}
                .
              </>
            )}
          </div>
        ) : null}

        <section className="space-y-1.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
            Used on {asset.pages.length} page
            {asset.pages.length === 1 ? "" : "s"}
          </h3>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {asset.pages.map((page) => (
              <EntityRef
                key={page.pageId}
                token="web_page"
                id={page.pageId}
                name={page.path ?? page.url}
                href={`${sitePath}/pages/${page.pageId}`}
                openInNewTab
                fill
                alwaysShowActions
                className="flex w-full rounded-md border border-border/60 bg-card px-2 py-1 font-mono text-[10px] text-foreground transition-colors hover:border-primary/40"
              />
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
                <Check className="mr-1.5 h-3.5 w-3.5 text-success" />
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
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={orderReplacement}
            >
              <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
              Order replacement
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={importing || createAsset.isPending}
              onClick={() => void importAndEdit()}
            >
              {importing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Crop className="mr-1.5 h-3.5 w-3.5" />
              )}
              Import &amp; edit
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <Select
              value={libraryKind}
              onValueChange={(value) =>
                setLibraryKind(
                  BRAND_ASSET_KINDS.find((kind) => kind === value) ?? "image",
                )
              }
            >
              <SelectTrigger className="h-7 w-36 px-2 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="text-[11px]">
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
    </div>
  );
}

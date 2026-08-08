"use client";

/**
 * BrandLibraryView — the OWNED media library for this brand inside the site
 * Media workspace: every `web.brand_asset` (uploaded, discovered, generated,
 * research-promoted), grouped by kind, with upload, edit, primary toggle, and
 * delete. Reuses the brand cockpit's asset CRUD + editor dialog — this view
 * never forks a second asset system.
 */

import { useMemo, useRef, useState } from "react";
import {
  CircleOff,
  FileVideo,
  ImageIcon,
  Loader2,
  Pencil,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { CaptureThumb } from "@/features/marketing/components/shared/CaptureThumb";
import { MediaEmptyState } from "@/features/marketing/components/media/SnapshotMediaGallery";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { BrandAssetEditorDialog } from "@/features/marketing/components/brands/BrandAssetEditorDialog";
import {
  useBrandAssets,
  useCreateBrandAsset,
  useDeleteBrandAsset,
  useUpdateBrandAsset,
} from "@/features/marketing/data/hooks";
import { secureImageUrl } from "@/features/marketing/lib/website-url";
import { youTubeThumbnail, youtubeId } from "@/lib/media/youtube";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import {
  BRAND_ASSET_KIND_LABELS,
  isJsonRecord,
  type BrandAsset,
  type BrandAssetKind,
} from "@/features/marketing/types";

function assetPreviewUrl(asset: BrandAsset): string | null {
  return asset.source_url &&
    /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(asset.source_url)
    ? secureImageUrl(asset.source_url)
    : null;
}

function assetColorValue(asset: BrandAsset): string | null {
  if (asset.kind !== "color") return null;
  if (isJsonRecord(asset.data)) {
    const candidate = asset.data.hex ?? asset.data.value ?? asset.data.color;
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return asset.title && /^#([0-9a-f]{3,8})$/i.test(asset.title)
    ? asset.title
    : null;
}

const SOURCE_LABELS: Record<string, string> = {
  discovered: "Discovered",
  uploaded: "Uploaded",
  manual: "Manual",
  generated: "AI generated",
  research: "From research",
};

function AssetTile({
  asset,
  onEdit,
  onDelete,
  onTogglePrimary,
  busy,
}: {
  asset: BrandAsset;
  onEdit: (asset: BrandAsset) => void;
  onDelete: (asset: BrandAsset) => void;
  onTogglePrimary: (asset: BrandAsset) => void;
  busy: boolean;
}) {
  const preview = assetPreviewUrl(asset);
  const color = assetColorValue(asset);
  const videoPoster =
    asset.kind === "video" && asset.source_url
      ? (() => {
          const yt = youtubeId(asset.source_url);
          return yt ? youTubeThumbnail(yt) : null;
        })()
      : null;
  // Local (not `asset.file_id` inline) — the React Compiler lint taints the
  // whole base object when a member expression is passed to a `ref` prop.
  const videoFileId = asset.kind === "video" ? asset.file_id : null;
  const videoTitle = asset.title ?? "Brand video";
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      {videoFileId ? (
        <div className="aspect-[4/3] bg-muted/40">
          <InlineMediaRef
            ref={videoFileId}
            as="video"
            size="fill"
            fit="contain"
            alt={videoTitle}
            preload="metadata"
          />
        </div>
      ) : asset.kind === "video" ? (
        videoPoster ? (
          <div className="aspect-[4/3] bg-muted/40">
            {/* Third-party provider poster — external asset, no file_id. */}
            <img
              src={videoPoster}
              alt={asset.title ?? "Video poster"}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-muted/40 text-muted-foreground">
            <FileVideo className="h-5 w-5" />
          </div>
        )
      ) : asset.file_id ? (
        <CaptureThumb
          fileId={asset.file_id}
          alt={asset.title ?? asset.kind}
          aspectClassName="aspect-[4/3]"
          className="rounded-none border-0"
        />
      ) : color ? (
        <div
          className="flex aspect-[4/3] items-center justify-center"
          style={{ backgroundColor: color }}
        >
          <span className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground backdrop-blur-sm">
            {color}
          </span>
        </div>
      ) : preview ? (
        <div className="flex aspect-[4/3] items-center justify-center bg-muted/40 p-2">
          <img
            src={preview}
            alt={asset.title ?? asset.kind}
            className="max-h-full max-w-full object-contain"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center bg-muted/40 text-muted-foreground">
          <CircleOff className="h-5 w-5" />
        </div>
      )}
      <div className="flex items-center gap-1 p-1.5">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[11px] font-medium text-foreground"
            title={asset.title ?? undefined}
          >
            {asset.title || BRAND_ASSET_KIND_LABELS[asset.kind as BrandAssetKind] || asset.kind}
          </p>
          <p className="truncate text-[9px] text-muted-foreground">
            {SOURCE_LABELS[asset.source] ?? asset.source}
            {asset.is_primary ? " · primary" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onTogglePrimary(asset)}
          disabled={busy}
          title={asset.is_primary ? "Unset primary" : "Set as primary"}
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Star
            className={
              asset.is_primary
                ? "h-3.5 w-3.5 fill-amber-400 text-amber-400"
                : "h-3.5 w-3.5"
            }
          />
        </button>
        <button
          type="button"
          onClick={() => onEdit(asset)}
          title="Edit"
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(asset)}
          disabled={busy}
          title="Delete"
          className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function BrandLibraryView({
  brandId,
  organizationId,
}: {
  brandId: string;
  organizationId: string;
}) {
  const assetsQuery = useBrandAssets(brandId);
  const createAsset = useCreateBrandAsset();
  const updateAsset = useUpdateBrandAsset();
  const deleteAsset = useDeleteBrandAsset();
  const { upload, uploading } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState<BrandAsset | null>(null);
  const [creating, setCreating] = useState(false);

  const assets = useMemo(() => assetsQuery.data ?? [], [assetsQuery.data]);

  const groups = useMemo(() => {
    const byKind = new Map<string, BrandAsset[]>();
    for (const asset of assets) {
      const list = byKind.get(asset.kind) ?? [];
      list.push(asset);
      byKind.set(asset.kind, list);
    }
    return [...byKind.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [assets]);

  const onUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        const uploaded = await upload(
          { kind: "file", file },
          { folderPath: "Images/Brand Library" },
        );
        await createAsset.mutateAsync({
          organizationId,
          brandId,
          kind: file.type.startsWith("video/") ? "video" : "image",
          sourceUrl: null,
          fileId: uploaded.fileId,
          title: file.name.replace(/\.[a-z0-9]+$/i, ""),
          notes: null,
          isPrimary: false,
          source: "uploaded",
        });
        toast.success(`Uploaded ${file.name}`);
      } catch (error) {
        toast.error(`Upload failed for ${file.name}`, {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onTogglePrimary = async (asset: BrandAsset) => {
    try {
      await updateAsset.mutateAsync({
        assetId: asset.id,
        expectedVersion: asset.version,
        patch: { is_primary: !asset.is_primary },
      });
    } catch (error) {
      toast.error("Could not update the asset", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const onDelete = async (asset: BrandAsset) => {
    const confirmed = await confirm({
      title: "Delete this asset?",
      description: asset.title ?? asset.source_url ?? asset.kind,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await deleteAsset.mutateAsync(asset.id);
      toast.success("Asset deleted");
    } catch (error) {
      toast.error("Could not delete the asset", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  if (assetsQuery.isLoading) {
    return <LoadingSurface label="Loading the brand library…" />;
  }
  if (assetsQuery.isError) {
    return (
      <QueryError
        error={assetsQuery.error}
        onRetry={() => void assetsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-muted-foreground">
          {`${assets.length.toLocaleString()} confirmed asset${assets.length === 1 ? "" : "s"} in this brand's library — shared across every site of the brand.`}
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(event) => void onUploadFiles(event.target.files)}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" />
            )}
            Upload
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => setCreating(true)}
          >
            <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
            Add by URL
          </Button>
        </div>
      </div>

      {assets.length === 0 ? (
        <MediaEmptyState
          title="The brand library is empty"
          detail="Upload files, add assets by URL, promote crawled images, or generate new ones — everything confirmed lands here."
        />
      ) : (
        groups.map(([kind, kindAssets]) => (
          <section key={kind} className="space-y-2">
            <div className="flex items-baseline gap-2 px-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                {BRAND_ASSET_KIND_LABELS[kind as BrandAssetKind] ?? kind}
              </h3>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {kindAssets.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {kindAssets.map((asset) => (
                <AssetTile
                  key={asset.id}
                  asset={asset}
                  onEdit={setEditing}
                  onDelete={(item) => void onDelete(item)}
                  onTogglePrimary={(item) => void onTogglePrimary(item)}
                  busy={updateAsset.isPending || deleteAsset.isPending}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <BrandAssetEditorDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        brandId={brandId}
        organizationId={organizationId}
        asset={editing}
      />
    </div>
  );
}

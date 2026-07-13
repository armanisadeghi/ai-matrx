"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  Crop,
  Download,
  ExternalLink,
  Globe,
  Loader2,
  Maximize2,
  Scaling,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImageFit, ImagePosition, ProcessedVariant } from "../types";
import { getPresetById } from "../presets";
import { formatBytes, formatDimensions } from "../utils/format-bytes";
import { downloadSingleVariant } from "../utils/download-bundle";
import { InlineMediaRef, useFileActions } from "@/features/files";

function fitIcon(fit: ImageFit): React.ReactNode {
  switch (fit) {
    case "cover":
      return <Crop className="h-2.5 w-2.5" />;
    case "contain":
      return <Maximize2 className="h-2.5 w-2.5" />;
    case "inside":
      return <Scaling className="h-2.5 w-2.5" />;
  }
}

function positionLabel(p: ImagePosition): string {
  if (typeof p === "object") {
    return `${(p.x * 100).toFixed(0)},${(p.y * 100).toFixed(0)}%`;
  }
  switch (p) {
    case "top-left":
      return "↖";
    case "top":
      return "↑";
    case "top-right":
      return "↗";
    case "left":
      return "←";
    case "center":
      return "●";
    case "right":
      return "→";
    case "bottom-left":
      return "↙";
    case "bottom":
      return "↓";
    case "bottom-right":
      return "↘";
    case "attention":
      return "Sm·A";
    case "entropy":
      return "Sm·E";
  }
}

interface StudioVariantTileProps {
  variant: ProcessedVariant;
  /** Whether this tile is selected for bundled actions. */
  selected: boolean;
  onToggleSelect: () => void;
}

export function StudioVariantTile({
  variant,
  selected,
  onToggleSelect,
}: StudioVariantTileProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const preset = getPresetById(variant.presetId);
  const usage = preset?.usage ?? "";
  const presetName = preset?.name ?? variant.presetId;

  // Canonical file-action bundle — only meaningful once the variant is
  // SAVED (has a cloud-files `fileId`). Calling the hook with "" is inert;
  // every invocation below is gated on `variant.fileId`.
  const fileActions = useFileActions(variant.fileId ?? "");

  const isSaved = Boolean(variant.fileId);
  const isPublic = Boolean(variant.publicUrl);

  const handleDownload = async () => {
    // Same-origin blob download. `variant.dataUrl` is a data: or blob: URL
    // (never a raw S3 URL — useImageStudio.generate materializes signed
    // URLs at the boundary), so `a.download` is honoured and nothing
    // navigates the tab.
    try {
      await downloadSingleVariant(variant.dataUrl, variant.filename);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  };

  // Make-public + copy-link, routed entirely through the canonical
  // `useFileActions`. We NEVER hand-copy a signed URL — that's the exact
  // durability anti-pattern these actions exist to replace. Private saved
  // variants are flipped to public first so the link is a permanent CDN URL.
  const handleShare = async () => {
    setCopyError(null);
    if (!variant.fileId) {
      toast.warning("Save to the library first", {
        description:
          "Use Save to library in the Export panel — public saves give every variant a permanent CDN link.",
      });
      return;
    }
    setSharing(true);
    try {
      if (!isPublic) {
        await fileActions.setVisibility("public");
      }
      const url = await fileActions.copyShareUrl();
      if (!url) throw new Error("Couldn't resolve a shareable link");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : "Share failed");
      setTimeout(() => setCopyError(null), 2600);
    } finally {
      setSharing(false);
    }
  };

  // "Open" always routes to our canonical file viewer (SingleFileShell at
  // /files/f/{id}) in a NEW TAB — never the raw CDN/S3 URL, and never a
  // same-tab navigation that would wipe the studio's in-memory state.
  const viewerHref = variant.fileId ? `/files/f/${variant.fileId}` : null;

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card transition-all overflow-hidden",
        selected
          ? "border-primary ring-2 ring-primary/30 shadow-sm"
          : "border-border hover:border-primary/40",
      )}
    >
      {/* Selection checkbox */}
      <button
        type="button"
        onClick={onToggleSelect}
        className={cn(
          "absolute top-2 left-2 z-10 h-5 w-5 rounded-md border transition-all flex items-center justify-center",
          selected
            ? "bg-primary border-primary text-primary-foreground"
            : "bg-background/80 backdrop-blur border-border opacity-0 group-hover:opacity-100",
        )}
        aria-label={selected ? "Deselect variant" : "Select variant"}
      >
        {selected && <Check className="h-3 w-3" />}
      </button>

      {/* Saved indicator */}
      {variant.savedAt && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-success/10 border border-success/30 px-2 py-0.5 text-[10px] font-medium text-success">
          <CheckCircle2 className="h-3 w-3" />
          Saved
        </div>
      )}

      {/* Preview — canonical InlineMediaRef once saved (re-mints, CDN-aware,
          self-heals expiring URLs); the same-origin in-memory bytes before
          save. Never a raw S3 URL either way. */}
      <div
        className="relative bg-muted/40 flex items-center justify-center border-b border-border overflow-hidden"
        style={{ aspectRatio: `${variant.width} / ${variant.height}` }}
      >
        {variant.fileId ? (
          <InlineMediaRef
            ref={{ file_id: variant.fileId }}
            size="fill"
            fit="contain"
            alt={presetName}
            className="max-h-full max-w-full"
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={variant.dataUrl}
            alt={presetName}
            className="max-h-full max-w-full object-contain"
            loading="lazy"
          />
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-1 p-2.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm truncate" title={presetName}>
            {presetName}
          </p>
          <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
            {formatDimensions(variant.width, variant.height)}
          </span>
        </div>
        <p
          className="text-[11px] text-muted-foreground line-clamp-2 leading-snug"
          title={usage}
        >
          {usage}
        </p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
              {variant.format}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {formatBytes(variant.size)}
            </span>
            <span
              className="flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize"
              title={
                variant.fit === "cover"
                  ? `Cover — anchored to ${variant.position ?? "center"}`
                  : variant.fit === "contain"
                    ? "Contain — padded with background colour"
                    : "Inside — shrunk to fit without crop or padding"
              }
            >
              {fitIcon(variant.fit)}
              {variant.fit}
              {variant.fit === "cover" && variant.position && (
                <span className="font-mono ml-0.5 text-muted-foreground">
                  {positionLabel(variant.position)}
                </span>
              )}
            </span>
          </div>
          {variant.compressionRatio != null && variant.compressionRatio > 0 && (
            <span
              className="flex items-center gap-0.5 text-[10px] text-success font-medium"
              title={`${variant.compressionRatio}% smaller than the original source`}
            >
              <Zap className="h-2.5 w-2.5" />−{variant.compressionRatio}%
            </span>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex border-t border-border bg-muted/20">
        <button
          type="button"
          onClick={handleDownload}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Download this variant"
        >
          <Download className="h-3 w-3" />
          Download
        </button>
        <div className="w-px bg-border" />
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs transition-colors disabled:opacity-60",
            isSaved
              ? "text-muted-foreground hover:bg-accent hover:text-foreground"
              : "text-amber-700 dark:text-amber-400 hover:bg-amber-500/10",
          )}
          title={
            isSaved
              ? "Make public (if needed) and copy a permanent link"
              : "Save to the library first to get a shareable link"
          }
        >
          {copyError ? (
            <span className="text-destructive truncate max-w-[120px]">
              {copyError}
            </span>
          ) : sharing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Working…</span>
            </>
          ) : copied ? (
            <>
              <Check className="h-3 w-3 text-success" />
              <span className="text-success">Link copied</span>
            </>
          ) : isSaved ? (
            <>
              {isPublic ? (
                <Copy className="h-3 w-3" />
              ) : (
                <Globe className="h-3 w-3" />
              )}
              Copy link
            </>
          ) : (
            <>
              <CloudUpload className="h-3 w-3" />
              Save to share
            </>
          )}
        </button>
        {viewerHref && (
          <>
            <div className="w-px bg-border" />
            <a
              href={viewerHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Open in the file viewer (new tab)"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export function StudioVariantTilePending({ presetId }: { presetId: string }) {
  const preset = getPresetById(presetId);
  return (
    <div className="relative flex flex-col rounded-xl border border-dashed border-border bg-muted/20 overflow-hidden">
      <div
        className="relative flex items-center justify-center bg-muted/40"
        style={{
          aspectRatio: `${preset?.width ?? 1} / ${preset?.height ?? 1}`,
        }}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
      <div className="p-2.5 text-xs">
        <p className="font-medium text-sm truncate">
          {preset?.name ?? presetId}
        </p>
        <p className="text-[11px] text-muted-foreground">Processing…</p>
      </div>
    </div>
  );
}

export function StudioVariantTileError({
  presetId,
  error,
  onRetry,
}: {
  presetId: string;
  error: string;
  onRetry?: () => void;
}) {
  const preset = getPresetById(presetId);
  return (
    <div className="relative flex flex-col rounded-xl border border-destructive/40 bg-destructive/5 overflow-hidden">
      <div className="p-3 text-xs">
        <p className="font-medium text-sm truncate">
          {preset?.name ?? presetId}
        </p>
        <p className="text-[11px] text-destructive mt-1">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-[10px] underline text-destructive hover:text-destructive/80"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

/** Helper that many variant tiles can be shown with a small "bare" preview. */
interface VariantTileProps {
  children: React.ReactNode;
}
export function VariantTileGrid({ children }: VariantTileProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
      {children}
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Clipboard,
  Download,
  ExternalLink,
  Expand,
  ImageIcon,
  Link2,
  Loader2,
  Maximize2,
  MoreHorizontal,
  RefreshCw,
  Share2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu/context-menu";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { toast } from "sonner";
import { useFileAs } from "@/features/files/handler/hooks/useFileAs";
import type { FileSource } from "@/features/files/handler/types";
import * as Files from "@/features/files/api/files";
import { useIsMobile } from "@/hooks/use-mobile";

// Extract the cloud_files UUID from an S3 path: /{userId}/{folder}/{uuid}.{ext}
// AI-generated images are registered in cloud_files at upload time, so we
// route through the universal handler (which auto-refreshes signed URLs via
// the expiry-wheel and returns the right URL flavour). When the URL doesn't
// carry a recognisable UUID we render it directly.
function extractCloudFileId(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const uuid = last.replace(/\.[^.]+$/, "");
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRe.test(uuid) ? uuid : null;
  } catch {
    return null;
  }
}

export interface ImageOutputBlockProps {
  url: string;
  mimeType?: string;
}

// ─── Shimmer skeleton ─────────────────────────────────────────────────────────

function ImageSkeleton() {
  return (
    <div className="relative w-full h-full bg-muted/40 overflow-hidden rounded-lg">
      <div className="shimmer-sweep absolute inset-0 bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center">
        <ImageIcon className="w-10 h-10 text-muted-foreground/20" />
      </div>
      <style>{`
        .shimmer-sweep {
          animation: shimmerSweep 1.8s ease-in-out infinite;
        }
        @keyframes shimmerSweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}

// ─── Long-press hook (mobile) ─────────────────────────────────────────────────

function useLongPress(onLongPress: () => void, ms = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(
    (e: React.PointerEvent) => {
      // Only fire on primary touch/pointer; ignore mouse on desktop
      if (e.pointerType === "mouse") return;
      timerRef.current = setTimeout(onLongPress, ms);
    },
    [onLongPress, ms],
  );

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

const ImageOutputBlock: React.FC<ImageOutputBlockProps> = ({
  url: initialUrl,
  mimeType,
}) => {
  const fileId = extractCloudFileId(initialUrl);
  const source: FileSource | null = fileId
    ? { kind: "file_id", fileId }
    : null;
  const { result, status, error: resolveError } = useFileAs(source, {
    kind: "html_src",
  });
  const url = result ?? initialUrl;
  const loading = status === "resolving";
  const error = resolveError?.message ?? null;
  // No imperative refresh — the handler's expiry-wheel auto-mints new URLs.
  const refresh = () => {};
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setImageLoaded(false);
  }, [url]);

  const ext =
    mimeType?.split("/")[1] ?? url.split(".").pop()?.split("?")[0] ?? "png";

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `image-output.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error("Download failed");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleShare = async () => {
    const fileId = extractCloudFileId(url);
    if (!fileId) {
      await handleCopyLink();
      return;
    }
    try {
      await Files.patchFile(fileId, { visibility: "public" });
      const { data } = await Files.getSignedUrl(fileId, {
        expiresIn: 604_800,
      });
      await navigator.clipboard.writeText(data.url);
      toast.success("Public link copied");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied (valid 7 days)");
      } catch {
        toast.error("Could not copy link");
      }
    }
  };

  const handleCopyImage = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      toast.success("Image copied to clipboard");
    } catch {
      toast.error("Could not copy image — try downloading instead");
    }
  };

  const handleOpenNewTab = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleExpand = () => setIsExpanded(true);

  // Long-press opens the drawer on mobile
  const longPressHandlers = useLongPress(() => setDrawerOpen(true));

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/30 px-4 py-6 my-2">
        <AlertCircle className="w-5 h-5 text-muted-foreground" />
        <p className="text-muted-foreground text-xs">Image unavailable</p>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

  // ── Shared menu items ──────────────────────────────────────────────────────
  // Rendered in the right-click ContextMenu, the ··· DropdownMenu, and the
  // mobile long-press Drawer — one definition, three surfaces.

  const menuItems = (
    <>
      <MenuRow
        icon={<Expand />}
        label="View full size"
        onClick={handleExpand}
      />
      <MenuRow
        icon={<ExternalLink />}
        label="Open in new tab"
        onClick={handleOpenNewTab}
      />
      <MenuSep />
      <MenuRow
        icon={<Download />}
        label={isDownloading ? "Downloading…" : "Download"}
        onClick={handleDownload}
        disabled={isDownloading}
      />
      <MenuRow
        icon={<Clipboard />}
        label="Copy image"
        onClick={handleCopyImage}
      />
      <MenuRow icon={<Link2 />} label="Copy link" onClick={handleCopyLink} />
      <MenuRow
        icon={<Share2 />}
        label="Share public link"
        onClick={handleShare}
      />
    </>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/*
       * ContextMenu wraps the entire image block.
       * On desktop: right-click shows the radix context menu.
       * On mobile:  ContextMenu is effectively a no-op (touch doesn't fire
       *             contextmenu natively in most browsers) — long-press via
       *             the pointer handlers opens the Drawer instead.
       */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="relative group my-2 w-fit max-w-full"
            {...(isMobile ? longPressHandlers : {})}
          >
            {/* Skeleton */}
            {!imageLoaded && !error && (
              <div
                className="absolute inset-0 z-10 rounded-lg overflow-hidden"
                aria-hidden="true"
              >
                <ImageSkeleton />
              </div>
            )}

            {/* URL-refresh overlay */}
            {loading && imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/40 z-10 rounded-lg">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="AI generated image"
              className={[
                "block max-w-full h-auto max-h-[28rem] object-contain rounded-lg",
                "min-h-[200px] min-w-[280px]",
                "transition-opacity duration-500 ease-in-out",
                imageLoaded ? "opacity-100" : "opacity-0",
              ].join(" ")}
              onLoad={() => setImageLoaded(true)}
              onError={undefined}
            />

            {/* Hover toolbar (desktop) */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-0.5 px-1.5 py-1.5 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-gradient-to-t from-black/60 via-black/20 to-transparent">
              <ToolbarButton onClick={handleExpand} title="Expand">
                <Maximize2 className="w-3.5 h-3.5" />
              </ToolbarButton>
              <ToolbarButton
                onClick={handleDownload}
                disabled={isDownloading}
                title="Download"
              >
                {isDownloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
              </ToolbarButton>
              <ToolbarButton onClick={handleCopyLink} title="Copy link">
                <Link2 className="w-3.5 h-3.5" />
              </ToolbarButton>
              <ToolbarButton onClick={handleShare} title="Share public link">
                <Share2 className="w-3.5 h-3.5" />
              </ToolbarButton>

              {/* ··· dropdown (keyboard / mouse fallback) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    title="More options"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleExpand}>
                    <Expand className="w-4 h-4 mr-2" />
                    View full size
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpenNewTab}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open in new tab
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDownload}
                    disabled={isDownloading}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyImage}>
                    <Clipboard className="w-4 h-4 mr-2" />
                    Copy image
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyLink}>
                    <Link2 className="w-4 h-4 mr-2" />
                    Copy link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShare}>
                    <Share2 className="w-4 h-4 mr-2" />
                    Share public link
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </ContextMenuTrigger>

        {/* Right-click context menu (desktop) */}
        <ContextMenuContent className="w-52">
          <ContextMenuItem onClick={handleExpand}>
            <Expand className="w-4 h-4 mr-2" />
            View full size
          </ContextMenuItem>
          <ContextMenuItem onClick={handleOpenNewTab}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Open in new tab
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleDownload} disabled={isDownloading}>
            <Download className="w-4 h-4 mr-2" />
            {isDownloading ? "Downloading…" : "Download"}
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopyImage}>
            <Clipboard className="w-4 h-4 mr-2" />
            Copy image
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopyLink}>
            <Link2 className="w-4 h-4 mr-2" />
            Copy link
          </ContextMenuItem>
          <ContextMenuItem onClick={handleShare}>
            <Share2 className="w-4 h-4 mr-2" />
            Share public link
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Mobile long-press drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2 text-sm">
              <ImageIcon className="w-4 h-4 text-primary" />
              Image options
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 flex flex-col gap-0.5">{menuItems}</div>
        </DrawerContent>
      </Drawer>

      {/* Lightbox */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="AI generated image"
              className="max-w-full max-h-[85dvh] object-contain rounded-lg"
              onError={undefined}
            />
            <button
              onClick={() => setIsExpanded(false)}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// ── Shared menu row primitives ────────────────────────────────────────────────
// Used in the mobile Drawer. The Drawer doesn't use Radix MenuItem so we
// render plain buttons styled to match the rest of the menu system.

function MenuRow({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) onClick();
      }}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span className="w-4 h-4 text-muted-foreground flex-shrink-0">
        {icon}
      </span>
      {label}
    </button>
  );
}

function MenuSep() {
  return <div className="my-1 h-px bg-border" />;
}

// ── Toolbar button primitive ──────────────────────────────────────────────────

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

export default ImageOutputBlock;

/**
 * features/files/blocks/image/UnifiedImageBlockRenderer.tsx
 *
 * THE renderer for every image in the app. Reads ONLY `UnifiedImageBlock`.
 * Handles signed-URL refresh via `useUnifiedImageUrl`. Surfaces the same
 * action set across the inline hover toolbar, right-click context menu,
 * dropdown menu, and mobile drawer.
 *
 * Architecture:
 *   - `useUnifiedImageUrl` resolves the current renderable `src`.
 *   - `useImageActions` exposes every action callback (download, share,
 *     download-as <format>, resize, print, etc.) so the component stays
 *     pure view code.
 *   - `ImageSharePopover` wraps the Share button — the share UI is a
 *     popover, not a one-shot callback. Backed by real share-link
 *     creation, never the old "set visibility=public + copy signed URL"
 *     lie.
 *
 * Variants:
 *   - "inline"  (default) — chat message position. Full hover toolbar,
 *                          context menu, drawer-on-mobile, lightbox.
 *   - "compact"           — toast / peek position. Click-only, no toolbar.
 */

"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  Clipboard,
  Download,
  ExternalLink,
  Expand,
  FileImage,
  Image as ImageIcon,
  Link2,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Printer,
  Share2,
  Maximize,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu/context-menu";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { ImageSharePopover } from "./ImageSharePopover";
import { useImageActions } from "./useImageActions";
import { useUnifiedImageUrl } from "./useUnifiedImageUrl";
import type { ImageVariantFormat } from "./utils/render-image-variant";
import type { UnifiedImageBlock } from "./types";

export interface UnifiedImageBlockRendererProps {
  block: UnifiedImageBlock;
  variant?: "inline" | "compact";
  /**
   * Compact-mode click handler. Called with the resolved src (the URL the
   * user actually sees). When omitted, compact-mode falls back to the
   * inline lightbox.
   */
  onCompactClick?: (src: string) => void;
}

// ─── Format / size option tables ──────────────────────────────────────────────
//
// Kept top-level so the dropdown and the context menu render the same set
// without re-declaring the constants in two places.

const FORMAT_OPTIONS: ReadonlyArray<{
  format: ImageVariantFormat;
  label: string;
  description: string;
}> = [
  {
    format: "jpeg",
    label: "JPEG",
    description: "Smallest size · universal compatibility",
  },
  {
    format: "png",
    label: "PNG",
    description: "Lossless · transparency · larger files",
  },
  {
    format: "webp",
    label: "WebP",
    description: "Smaller than JPEG · modern browsers",
  },
  {
    format: "avif",
    label: "AVIF",
    description: "Best compression · newest format",
  },
];

const SIZE_OPTIONS: ReadonlyArray<{
  width: number;
  label: string;
  description: string;
}> = [
  {
    width: 2048,
    label: "Large · 2048 px",
    description: "High-quality re-export",
  },
  { width: 1024, label: "Medium · 1024 px", description: "Good for documents" },
  { width: 512, label: "Small · 512 px", description: "Email-friendly" },
  {
    width: 256,
    label: "Thumbnail · 256 px",
    description: "Avatar / icon size",
  },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export const UnifiedImageBlockRenderer: React.FC<
  UnifiedImageBlockRendererProps
> = ({ block, variant = "inline", onCompactClick }) => {
  const { src, status, isPlaceholder, fileId } = useUnifiedImageUrl(block);
  const isMobile = useIsMobile();
  const isMatrx = block.origin === "matrx";

  const actions = useImageActions({ block, currentSrc: src, fileId });

  // Per-URL load tracking. We deliberately do NOT use a single
  // `imageLoaded: boolean` reset via `useEffect([src])` — that pattern races
  // with cached-image `onLoad` events that fire *synchronously* during the
  // same commit cycle, leaving `setImageLoaded(false)` (from the effect) as
  // the winning batched update and the image stuck behind the shimmer
  // forever. Tracking the loaded URL directly is race-free: a new src
  // automatically reads as "not yet loaded" without any state reset, and
  // the next `onLoad` writes the new URL atomically.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [errorSrc, setErrorSrc] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const imageLoaded = src !== null && loadedSrc === src;
  const imgError = src !== null && errorSrc === src;
  const showError =
    (status === "error" && !src) || imgError || block.status === "error";

  const handleExpand = useCallback(() => setIsExpanded(true), []);
  const longPressHandlers = useLongPress(() => setDrawerOpen(true));

  // ── Compact variant ─────────────────────────────────────────────────

  if (variant === "compact") {
    return (
      <CompactImage
        src={src}
        loading={status === "loading"}
        onClick={() => {
          if (!src) return;
          if (onCompactClick) onCompactClick(src);
          else setIsExpanded(true);
        }}
        isPlaceholder={isPlaceholder}
      />
    );
  }

  // ── Error state ────────────────────────────────────────────────────

  if (showError) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/30 px-4 py-6 my-2">
        <AlertCircle className="w-5 h-5 text-muted-foreground" />
        <p className="text-muted-foreground text-xs">Image unavailable</p>
      </div>
    );
  }

  // ── Drawer body (mobile long-press) ───────────────────────────────
  //
  // The drawer mirrors the dropdown's action set in a touch-friendly
  // form. We don't try to share the menu primitives — Drawer items are
  // big tappable buttons, Dropdown items are dense menu rows; trying
  // to merge them makes both worse.
  const drawerBody = (
    <div className="px-4 pb-6 flex flex-col gap-0.5">
      <DrawerRow
        icon={<Expand />}
        label="View full size"
        onClick={handleExpand}
      />
      <DrawerRow
        icon={<ExternalLink />}
        label="Open in new tab"
        onClick={actions.openNewTab}
      />
      <DrawerSep />
      <DrawerRow
        icon={<Download />}
        // Label matches the iOS native share sheet — `actions.download`
        // calls `navigator.share({ files })` on mobile, which surfaces
        // "Save Image" → Photos as the first option. On unsupported
        // browsers it falls back to a regular file download, which still
        // reads correctly as "Save image".
        label={actions.isDownloading ? "Saving…" : "Save image"}
        sublabel="Save to Photos, AirDrop, or share"
        onClick={actions.download}
        disabled={actions.isDownloading}
      />
      {isMatrx ? (
        <>
          <DrawerSubheader>Download as…</DrawerSubheader>
          {FORMAT_OPTIONS.map((option) => (
            <DrawerRow
              key={option.format}
              icon={<FileImage />}
              label={option.label}
              sublabel={option.description}
              onClick={() => actions.downloadAs(option.format)}
              disabled={actions.isVariantBusy}
            />
          ))}
          <DrawerSubheader>Resize and download…</DrawerSubheader>
          {SIZE_OPTIONS.map((option) => (
            <DrawerRow
              key={option.width}
              icon={<Maximize />}
              label={option.label}
              sublabel={option.description}
              onClick={() => actions.resizeAndDownload(option.width)}
              disabled={actions.isVariantBusy}
            />
          ))}
        </>
      ) : null}
      <DrawerSep />
      <DrawerRow
        icon={<Clipboard />}
        label="Copy image"
        onClick={actions.copyImage}
      />
      <DrawerRow
        icon={<Link2 />}
        label="Copy link"
        onClick={actions.copyLink}
      />
      <DrawerRow icon={<Printer />} label="Print" onClick={actions.print} />
      {actions.parentFileId ? (
        <DrawerRow
          icon={<ExternalLink />}
          label="View original"
          onClick={actions.viewOriginal}
        />
      ) : null}
    </div>
  );

  // ── Render (inline) ─────────────────────────────────────────────────

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="relative group my-2 w-fit max-w-full"
            {...(isMobile ? longPressHandlers : {})}
          >
            {/* Skeleton */}
            {!imageLoaded && !showError && (
              <div
                className="absolute inset-0 z-10 rounded-lg overflow-hidden"
                aria-hidden="true"
              >
                <ImageSkeleton />
              </div>
            )}

            {/* Refresh overlay (subtle spinner when re-minting a URL) */}
            {status === "refreshing" && imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/40 z-10 rounded-lg">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Variant render overlay — light hint that a server-side
                conversion is in flight. Non-blocking; the image stays
                visible. */}
            {actions.isVariantBusy && imageLoaded && (
              <div className="absolute top-2 left-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
                <Loader2 className="w-3 h-3 animate-spin" />
                Rendering variant…
              </div>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            {src && (
              <img
                src={src}
                alt={block.fileName ?? "Image"}
                className={[
                  "block max-w-full h-auto max-h-[28rem] object-contain rounded-lg",
                  "min-h-[200px] min-w-[280px]",
                  "transition-opacity duration-500 ease-in-out",
                  imageLoaded ? "opacity-100" : "opacity-0",
                ].join(" ")}
                onLoad={() => setLoadedSrc(src)}
                onError={() => setErrorSrc(src)}
              />
            )}

            {/* Hover toolbar (desktop) */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-0.5 px-1.5 py-1.5 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-gradient-to-t from-black/60 via-black/20 to-transparent">
              <ToolbarButton onClick={handleExpand} title="Expand">
                <Maximize2 className="w-3.5 h-3.5" />
              </ToolbarButton>
              <ToolbarButton
                onClick={actions.download}
                disabled={actions.isDownloading}
                title="Download"
              >
                {actions.isDownloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
              </ToolbarButton>
              <ToolbarButton onClick={actions.copyLink} title="Copy link">
                <Link2 className="w-3.5 h-3.5" />
              </ToolbarButton>

              <ImageSharePopover block={block} currentSrc={src}>
                <ToolbarButton title="Share" asSpan>
                  <Share2 className="w-3.5 h-3.5" />
                </ToolbarButton>
              </ImageSharePopover>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    title="More options"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={handleExpand}>
                    <Expand className="w-4 h-4 mr-2" />
                    View full size
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={actions.openNewTab}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open in new tab
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={actions.download}
                    disabled={actions.isDownloading}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                  {isMatrx ? (
                    <>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <FileImage className="w-4 h-4 mr-2" />
                          Download as
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-60">
                          {FORMAT_OPTIONS.map((option) => (
                            <DropdownMenuItem
                              key={option.format}
                              onClick={() => actions.downloadAs(option.format)}
                              disabled={actions.isVariantBusy}
                            >
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {option.label}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {option.description}
                                </span>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Maximize className="w-4 h-4 mr-2" />
                          Resize and download
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-60">
                          {SIZE_OPTIONS.map((option) => (
                            <DropdownMenuItem
                              key={option.width}
                              onClick={() =>
                                actions.resizeAndDownload(option.width)
                              }
                              disabled={actions.isVariantBusy}
                            >
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {option.label}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {option.description}
                                </span>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={actions.copyImage}>
                    <Clipboard className="w-4 h-4 mr-2" />
                    Copy image
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={actions.copyLink}>
                    <Link2 className="w-4 h-4 mr-2" />
                    Copy link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={actions.print}>
                    <Printer className="w-4 h-4 mr-2" />
                    Print
                  </DropdownMenuItem>
                  {actions.parentFileId ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={actions.viewOriginal}>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View original
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={handleExpand}>
            <Expand className="w-4 h-4 mr-2" />
            View full size
          </ContextMenuItem>
          <ContextMenuItem onClick={actions.openNewTab}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Open in new tab
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={actions.download}
            disabled={actions.isDownloading}
          >
            <Download className="w-4 h-4 mr-2" />
            {actions.isDownloading ? "Downloading…" : "Download"}
          </ContextMenuItem>
          {isMatrx ? (
            <>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <FileImage className="w-4 h-4 mr-2" />
                  Download as
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-60">
                  {FORMAT_OPTIONS.map((option) => (
                    <ContextMenuItem
                      key={option.format}
                      onClick={() => actions.downloadAs(option.format)}
                      disabled={actions.isVariantBusy}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {option.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Maximize className="w-4 h-4 mr-2" />
                  Resize and download
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-60">
                  {SIZE_OPTIONS.map((option) => (
                    <ContextMenuItem
                      key={option.width}
                      onClick={() => actions.resizeAndDownload(option.width)}
                      disabled={actions.isVariantBusy}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {option.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={actions.copyImage}>
            <Clipboard className="w-4 h-4 mr-2" />
            Copy image
          </ContextMenuItem>
          <ContextMenuItem onClick={actions.copyLink}>
            <Link2 className="w-4 h-4 mr-2" />
            Copy link
          </ContextMenuItem>
          <ContextMenuItem onClick={actions.print}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </ContextMenuItem>
          {actions.parentFileId ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={actions.viewOriginal}>
                <ExternalLink className="w-4 h-4 mr-2" />
                View original
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>

      {/* Mobile drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2 text-sm">
              <ImageIcon className="w-4 h-4 text-primary" />
              Image options
            </DrawerTitle>
          </DrawerHeader>
          {drawerBody}
        </DrawerContent>
      </Drawer>

      {/* Lightbox */}
      {isExpanded && src && (
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
              src={src}
              alt={block.fileName ?? "Image"}
              className="max-w-full max-h-[85dvh] object-contain rounded-lg"
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

// ─── Compact variant ──────────────────────────────────────────────────────────

function CompactImage({
  src,
  loading,
  onClick,
  isPlaceholder,
}: {
  src: string | null;
  loading: boolean;
  onClick: () => void;
  isPlaceholder: boolean;
}) {
  if (loading || !src) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div
      className="relative w-full h-full cursor-pointer group"
      onClick={onClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Image" className="w-full h-full object-cover" />
      {isPlaceholder && (
        <div className="absolute inset-0 flex items-end p-1 pointer-events-none">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white">
            Loading…
          </span>
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
        <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

// ─── Shared menu primitives ───────────────────────────────────────────────────

function DrawerRow({
  icon,
  label,
  sublabel,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
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
      className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
    >
      <span className="w-4 h-4 text-muted-foreground flex-shrink-0">
        {icon}
      </span>
      <span className="flex flex-1 flex-col min-w-0">
        <span className="leading-tight">{label}</span>
        {sublabel ? (
          <span className="text-[11px] text-muted-foreground leading-tight truncate">
            {sublabel}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function DrawerSep() {
  return <div className="my-1 h-px bg-border" />;
}

function DrawerSubheader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
      {children}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
  asSpan,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  /**
   * When true, renders as a span instead of a button — used when this
   * element is inside another interactive (e.g. a popover trigger
   * wraps this), avoiding nested-button accessibility warnings.
   */
  asSpan?: boolean;
}) {
  const className =
    "p-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
  if (asSpan) {
    return (
      <span title={title} className={className}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={className}
    >
      {children}
    </button>
  );
}

export default UnifiedImageBlockRenderer;

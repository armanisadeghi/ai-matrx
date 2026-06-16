/**
 * features/files/blocks/video/UnifiedVideoBlockRenderer.tsx
 *
 * THE renderer for every video in the app. Reads ONLY `VideoBlock`. The
 * video twin of `image/UnifiedImageBlockRenderer.tsx` — same structure,
 * prop names, skeleton/error patterns, and the same single-menu doctrine.
 *
 * Affordances (matching the image renderer):
 *   - `useUnifiedVideoUrl` resolves the renderable `src` (+ poster) with
 *     signed-URL refresh via the file handler.
 *   - `useVideoActions` exposes the video-appropriate action callbacks
 *     (download, copyLink, openNewTab, viewOriginal).
 *   - `VideoSharePopover` wraps the Share button (same share-link path as
 *     images).
 *   - Hover toolbar (Expand, Download, Copy link, Share, "…"), a "…"
 *     DropdownMenu, a right-click ContextMenu, and a mobile long-press
 *     Drawer — all driven by one action set.
 *   - Expand → fullscreen lightbox (large `<video controls autoPlay>` + a
 *     close button).
 *   - `extraActions` (optional) — domain actions folded into the ONE menu
 *     as a leading group, so callers never bolt on a second "…" menu.
 *
 * Durability: rendered only from the resolved URL pipeline — never a raw
 * signed src the caller hand-derives.
 *
 * Variants:
 *   - "inline"  (default) — full hover toolbar, context menu, drawer,
 *                           lightbox.
 *   - "compact"           — click-to-expand thumbnail, no toolbar.
 */

"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  Download,
  ExternalLink,
  Expand,
  Link2,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Play,
  Share2,
  Video as VideoIcon,
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
import { useIsMobile } from "@/hooks/use-mobile";
import { VideoSharePopover } from "./VideoSharePopover";
import { useVideoActions } from "./useVideoActions";
import { useUnifiedVideoUrl } from "./useUnifiedVideoUrl";
import type { VideoBlock } from "../types";
import type { MediaExtraAction } from "../actions";

export interface UnifiedVideoBlockRendererProps {
  block: VideoBlock;
  variant?: "inline" | "compact";
  /**
   * Compact-mode click handler. Called with the resolved src. When omitted,
   * compact-mode falls back to the inline lightbox.
   */
  onCompactClick?: (src: string) => void;
  /**
   * Domain actions folded into the ONE canonical menu (dropdown, context
   * menu, mobile drawer) as a leading group. Keeps a single "…" menu.
   */
  extraActions?: MediaExtraAction[];
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function VideoSkeleton() {
  return (
    <div className="relative w-full h-full bg-muted/40 overflow-hidden rounded-lg">
      <div className="shimmer-sweep absolute inset-0 bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center">
        <VideoIcon className="w-10 h-10 text-muted-foreground/20" />
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

export const UnifiedVideoBlockRenderer: React.FC<
  UnifiedVideoBlockRendererProps
> = ({ block, variant = "inline", onCompactClick, extraActions }) => {
  const { src, status, posterUrl } = useUnifiedVideoUrl(block);
  const isMobile = useIsMobile();
  const fileId = block.origin === "matrx" ? block.fileId : null;

  const actions = useVideoActions({ block, currentSrc: src, fileId });

  const [isExpanded, setIsExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const showError =
    (status === "error" && !src) || block.status === "error";

  const handleExpand = useCallback(() => setIsExpanded(true), []);
  const longPressHandlers = useLongPress(() => setDrawerOpen(true));

  const hasExtra = !!extraActions && extraActions.length > 0;

  // ── Compact variant ─────────────────────────────────────────────────

  if (variant === "compact") {
    return (
      <CompactVideo
        src={src}
        posterUrl={posterUrl}
        loading={status === "loading"}
        onClick={() => {
          if (!src) return;
          if (onCompactClick) onCompactClick(src);
          else setIsExpanded(true);
        }}
      />
    );
  }

  // ── Error state ────────────────────────────────────────────────────

  if (showError) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/30 px-4 py-6 my-2">
        <AlertCircle className="w-5 h-5 text-muted-foreground" />
        <p className="text-muted-foreground text-xs">Video unavailable</p>
      </div>
    );
  }

  // ── Drawer body (mobile long-press) ───────────────────────────────
  const drawerBody = (
    <div className="px-4 pb-6 flex flex-col gap-0.5">
      {hasExtra ? (
        <>
          {extraActions!.map((a) => (
            <DrawerRow
              key={a.id}
              icon={a.icon}
              label={a.label}
              onClick={a.onClick}
              disabled={a.disabled}
              danger={a.danger}
            />
          ))}
          <DrawerSep />
        </>
      ) : null}
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
        label={actions.isDownloading ? "Saving…" : "Save video"}
        sublabel="Save to your device, AirDrop, or share"
        onClick={actions.download}
        disabled={actions.isDownloading}
      />
      <DrawerSep />
      <DrawerRow
        icon={<Link2 />}
        label="Copy link"
        onClick={actions.copyLink}
      />
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
            {!src && !showError && (
              <div
                className="absolute inset-0 z-10 rounded-lg overflow-hidden"
                aria-hidden="true"
              >
                <VideoSkeleton />
              </div>
            )}

            {/* Refresh overlay (subtle spinner when re-minting a URL) */}
            {status === "refreshing" && src && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/40 z-10 rounded-lg pointer-events-none">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {src && (
              <video
                src={src}
                poster={posterUrl ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="block max-w-full h-auto max-h-[28rem] rounded-lg min-h-[200px] min-w-[280px] bg-black"
              />
            )}

            {/* Hover toolbar (desktop) */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-end gap-0.5 px-1.5 py-1.5 rounded-t-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-gradient-to-b from-black/60 via-black/20 to-transparent">
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

              <VideoSharePopover block={block} currentSrc={src}>
                <ToolbarButton title="Share" asSpan>
                  <Share2 className="w-3.5 h-3.5" />
                </ToolbarButton>
              </VideoSharePopover>

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
                  {hasExtra ? (
                    <>
                      {extraActions!.map((a) => (
                        <DropdownMenuItem
                          key={a.id}
                          onClick={a.onClick}
                          disabled={a.disabled}
                          className={
                            a.danger
                              ? "text-destructive focus:text-destructive"
                              : undefined
                          }
                        >
                          {a.icon ? (
                            <span className="w-4 h-4 mr-2 inline-flex items-center justify-center">
                              {a.icon}
                            </span>
                          ) : null}
                          {a.label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
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
                  <DropdownMenuItem onClick={actions.copyLink}>
                    <Link2 className="w-4 h-4 mr-2" />
                    Copy link
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
          {hasExtra ? (
            <>
              {extraActions!.map((a) => (
                <ContextMenuItem
                  key={a.id}
                  onClick={a.onClick}
                  disabled={a.disabled}
                  className={
                    a.danger
                      ? "text-destructive focus:text-destructive"
                      : undefined
                  }
                >
                  {a.icon ? (
                    <span className="w-4 h-4 mr-2 inline-flex items-center justify-center">
                      {a.icon}
                    </span>
                  ) : null}
                  {a.label}
                </ContextMenuItem>
              ))}
              <ContextMenuSeparator />
            </>
          ) : null}
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
          <ContextMenuItem onClick={actions.copyLink}>
            <Link2 className="w-4 h-4 mr-2" />
            Copy link
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
              <VideoIcon className="w-4 h-4 text-primary" />
              Video options
            </DrawerTitle>
          </DrawerHeader>
          {drawerBody}
        </DrawerContent>
      </Drawer>

      {/* Lightbox */}
      {isExpanded && src && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="relative max-w-[92vw] max-h-[90dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={src}
              poster={posterUrl ?? undefined}
              controls
              autoPlay
              playsInline
              className="max-w-full max-h-[85dvh] rounded-lg bg-black"
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

function CompactVideo({
  src,
  posterUrl,
  loading,
  onClick,
}: {
  src: string | null;
  posterUrl: string | null;
  loading: boolean;
  onClick: () => void;
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
      className="relative w-full h-full cursor-pointer group bg-black"
      onClick={onClick}
    >
      <video
        src={src}
        poster={posterUrl ?? undefined}
        muted
        playsInline
        preload="metadata"
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/35 transition-colors">
        <Play className="w-6 h-6 text-white drop-shadow" />
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
  danger,
}: {
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) onClick();
      }}
      disabled={disabled}
      className={[
        "flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left",
        danger
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-accent",
      ].join(" ")}
    >
      <span
        className={[
          "w-4 h-4 flex-shrink-0",
          danger ? "text-destructive" : "text-muted-foreground",
        ].join(" ")}
      >
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

export default UnifiedVideoBlockRenderer;

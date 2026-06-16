"use client";

// features/overlays/surfaces/SidePanelSurface.tsx
//
// SidePanelSurface — the "flexible side panel" chrome for overlay content.
//
// WHY THIS EXISTS
// The Quick Access overlays (Quick Note / Task / Chat / Data) are authored as
// bare CONTENT components (`<div className="flex flex-col h-full">…`) so they
// can be reused as tab bodies inside the Utilities Hub (`UtilitiesOverlay`) as
// well as standalone. They carry no positioning, sizing, backdrop, or z-index
// of their own.
//
// Before the May-2026 overlay/window split, the legacy `OverlaySurface` gate
// supplied that side-panel chrome. When the system was rebuilt into the
// explicit-JSX `OverlayController`, those blocks were migrated to render the
// bare content directly — so they mounted as a zero-height `h-full` div under
// <body> and were invisible. This primitive restores the missing chrome.
//
// PRESENTATION — the MessagingSideSheet model, generalised
// Desktop: a NON-BLOCKING, drag-to-resize side panel. No modal backdrop and no
// scroll lock, so the rest of the app stays usable while it's open (you close
// it with the X or Escape). A handle on the left edge drags the width, clamped
// to [minWidth, maxWidth] and persisted per-panel in localStorage. It sits
// below the app header (`--header-height`) like the messaging sheet.
// Mobile: a bottom `Drawer` (vaul) — drawer-not-dialog per the mobile rules.
//
// Either way the content slot is a single flex column that fills the panel, so
// the child's own `h-full` layout works unchanged.

import * as React from "react";
import { X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * Lets panel CONTENT ask the surrounding panel to grow — e.g. Quick Chat
 * opening its history sidebar widens the panel by the sidebar's width (pushing
 * its left edge into the page) instead of eating the chat's width.
 * `requestWidthBoost(0)` releases it back to the user's dragged width. The
 * boost is added on top of the drag width and capped only by the viewport, so
 * it can exceed the normal drag ceiling when there's room. No-op on mobile.
 */
interface SidePanelSurfaceContextValue {
  requestWidthBoost: (px: number) => void;
}

const SidePanelSurfaceContext =
  React.createContext<SidePanelSurfaceContextValue | null>(null);

export function useSidePanelSurface(): SidePanelSurfaceContextValue | null {
  return React.useContext(SidePanelSurfaceContext);
}

export interface SidePanelSurfaceProps {
  /** Visible panel title (also the accessible dialog name). */
  title: string;
  /** Optional one-line subtitle / accessible description. */
  description?: string;
  /** Fired when the user dismisses the panel (X or Escape). */
  onClose: () => void;
  /** Initial desktop width in px (used when nothing is persisted). Default 460. */
  defaultWidth?: number;
  /** Minimum drag width in px. Default 360. */
  minWidth?: number;
  /** Maximum drag width in px. Default 900. */
  maxWidth?: number;
  /**
   * Stable key for persisting the dragged width across opens. Defaults to a
   * slug of the title. Pass an explicit key if two panels share a title.
   */
  storageKey?: string;
  /** Header controls rendered to the left of the close button (e.g. "New"). */
  headerActions?: React.ReactNode;
  /** The bare content component (owns its own internal layout/scroll). */
  children: React.ReactNode;
}

const ENTER_MS = 200;

function widthStorageKey(storageKey: string | undefined, title: string): string {
  const base =
    storageKey ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `matrx:side-panel-width:${base}`;
}

/** Compact, single-line panel header shared by both the panel and the Drawer. */
function PanelHeader({
  title,
  headerActions,
  onRequestClose,
}: {
  title: React.ReactNode;
  headerActions?: React.ReactNode;
  onRequestClose: () => void;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3">
      <span className="flex-1 truncate text-sm font-semibold text-foreground">
        {title}
      </span>
      {headerActions}
      <button
        type="button"
        onClick={onRequestClose}
        aria-label="Close panel"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function SidePanelSurface({
  title,
  description,
  onClose,
  defaultWidth = 460,
  minWidth = 360,
  maxWidth = 900,
  storageKey,
  headerActions,
  children,
}: SidePanelSurfaceProps) {
  const isMobile = useIsMobile();

  // Controlled open/close with an internal flag so the slide-out animation
  // plays before the controller unmounts us. The controller only mounts this
  // surface while the overlay is open, so the initial state is always `true`.
  const [open, setOpen] = React.useState(true);
  // `entered` flips on after first paint so the panel slides IN from the right
  // on mount instead of appearing in place.
  const [entered, setEntered] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const closeTimer = React.useRef<number | null>(null);
  const requestClose = React.useCallback(() => {
    if (closeTimer.current != null) return;
    setOpen(false);
    closeTimer.current = window.setTimeout(onClose, ENTER_MS + 20);
  }, [onClose]);
  React.useEffect(
    () => () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const handleDrawerOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) requestClose();
    },
    [requestClose],
  );

  // Escape-to-close — the only "outside" dismiss, since there is no backdrop.
  React.useEffect(() => {
    if (isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMobile, requestClose]);

  // ── Drag-to-resize width (desktop only) ──────────────────────────────────
  const clamp = React.useCallback(
    (w: number) => Math.min(Math.max(w, minWidth), maxWidth),
    [minWidth, maxWidth],
  );
  const [width, setWidth] = React.useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    const stored = window.localStorage.getItem(
      widthStorageKey(storageKey, title),
    );
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minWidth), maxWidth) : defaultWidth;
  });

  // Content-requested width boost (e.g. Quick Chat's history sidebar). Added on
  // top of the drag width and capped only by the viewport — so opening an
  // in-panel sidebar grows the panel beyond the normal drag ceiling when
  // there's room. Released to 0 when the content collapses.
  const [widthBoost, setWidthBoost] = React.useState(0);
  const ctx = React.useMemo<SidePanelSurfaceContextValue>(
    () => ({ requestWidthBoost: (px) => setWidthBoost(Math.max(0, px)) }),
    [],
  );

  const [viewportWidth, setViewportWidth] = React.useState<number>(() =>
    typeof window === "undefined" ? 1920 : window.innerWidth,
  );
  React.useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Effective width: the user's dragged width plus any content boost, capped so
  // a sliver of the page always stays visible (never wider than the viewport).
  const viewportCap = Math.max(minWidth, viewportWidth - 56);
  const effectiveWidth = Math.min(width + widthBoost, viewportCap);

  const handleResizeStart = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      // The panel is anchored to the right edge: dragging the left handle
      // leftwards (clientX decreasing) widens it.
      const onMove = (moveEvent: MouseEvent) => {
        setWidth(clamp(startWidth + (startX - moveEvent.clientX)));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        setWidth((w) => {
          try {
            window.localStorage.setItem(
              widthStorageKey(storageKey, title),
              String(w),
            );
          } catch {
            /* storage unavailable — width still applies for this session */
          }
          return w;
        });
      };

      // Suppress text selection + keep the resize cursor for the whole drag.
      document.body.style.userSelect = "none";
      document.body.style.cursor = "ew-resize";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [width, clamp, storageKey, title],
  );

  if (isMobile) {
    return (
      <SidePanelSurfaceContext.Provider value={ctx}>
        <Drawer open={open} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="h-[88dvh] gap-0 p-0">
            <DrawerTitle className="sr-only">{title}</DrawerTitle>
            {description ? (
              <DrawerDescription className="sr-only">
                {description}
              </DrawerDescription>
            ) : null}
            <PanelHeader
              title={title}
              headerActions={headerActions}
              onRequestClose={requestClose}
            />
            <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
          </DrawerContent>
        </Drawer>
      </SidePanelSurfaceContext.Provider>
    );
  }

  return (
    <SidePanelSurfaceContext.Provider value={ctx}>
    <div
      role="dialog"
      aria-label={title}
      className={cn(
        "fixed right-0 z-40 flex flex-col overflow-hidden",
        "top-[var(--header-height)] bottom-0",
        "border-l border-border bg-background shadow-2xl",
        "transition-[transform,width] duration-200 ease-out will-change-transform",
        open && entered ? "translate-x-0" : "translate-x-full",
      )}
      style={{ width: effectiveWidth }}
    >
      {/* Drag handle — left edge. Widens the panel as you pull it inward. */}
      <div
        onMouseDown={handleResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        className="group absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-ew-resize"
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary group-hover:w-0.5" />
      </div>

      <PanelHeader
        title={title}
        headerActions={headerActions}
        onRequestClose={requestClose}
      />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
    </SidePanelSurfaceContext.Provider>
  );
}

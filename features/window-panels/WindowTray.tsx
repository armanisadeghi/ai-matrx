"use client";

/**
 * WindowTray
 *
 * Renders the bottom-right minimized-window dock.
 * Mount exactly ONE instance high in the component tree (e.g. inside the
 * root layout, alongside any other fixed overlays).  It reads minimized window
 * entries from Redux and renders a draggable chip for each one.
 *
 * Chips:
 *  - Stacked horizontally from right → left (newest on the right)
 *  - Single-click restores the window (drag suppresses the click)
 *  - Chips are draggable within the tray to reorder them (moveTraySlot)
 *  - The tray itself is 100% CSS — fixed, bottom-right, no z-fighting
 *
 * Usage:
 *   // In your root layout or shell (outside any transform/overflow ancestor):
 *   <WindowTray />
 */

import React, { useCallback, useRef } from "react";
import { ChevronsUpDown, AppWindow } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  restoreWindow,
  moveTraySlot,
  focusWindow,
  selectTrayWindows,
} from "@/lib/redux/slices/windowManagerSlice";

import {
  TRAY_GAP_X,
  TRAY_CHIP_H_DESKTOP,
  TRAY_CHIP_W_DESKTOP,
} from "./constants/tray";
import { getStaticEntryByOverlayId } from "./registry/windowRegistryMetadata";
import { renderIcon } from "@/components/official/icons/IconResolver";
import { TrayChipPreview } from "./WindowTray/TrayChipPreview";

// ─── Constants ────────────────────────────────────────────────────────────────

// Standalone dock chips share the production minimized-card width even though
// this legacy dock is not currently mounted in production.
const CHIP_WIDTH = TRAY_CHIP_W_DESKTOP;
const CHIP_GAP = TRAY_GAP_X;
const TRAY_BOTTOM = 12;
const TRAY_RIGHT = 12;

// ─── Component ────────────────────────────────────────────────────────────────

export function WindowTray() {
  const minimized = useAppSelector(selectTrayWindows);
  const isMobile = useIsMobile();

  if (minimized.length === 0) return null;

  // ── Mobile: horizontal scroll strip pinned to bottom ──────────────────
  if (isMobile) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 pb-safe z-[9999]"
      >
        <div className="flex overflow-x-auto gap-1.5 px-2 py-1.5 bg-background/80 backdrop-blur-sm border-t border-border/50 scrollbar-none">
          {minimized.map((win) => (
            <MobileTrayChip key={win.id} id={win.id} title={win.title} />
          ))}
        </div>
      </div>
    );
  }

  // ── Desktop: absolute-positioned chips at bottom-right ────────────────
  return (
    <div
      className="fixed pointer-events-none"
      style={{
        bottom: TRAY_BOTTOM,
        right: TRAY_RIGHT,
        zIndex: 9999,
        display: "flex",
        flexDirection: "row-reverse",
        alignItems: "flex-end",
        gap: CHIP_GAP,
      }}
    >
      {[...minimized].reverse().map((win) => (
        <TrayChip
          key={win.id}
          id={win.id}
          title={win.title}
          chipWidth={CHIP_WIDTH}
        />
      ))}
    </div>
  );
}

// ─── MobileTrayChip ──────────────────────────────────────────────────────────

function MobileTrayChip({ id, title }: { id: string; title: string }) {
  const dispatch = useAppDispatch();
  const registryEntry = getStaticEntryByOverlayId(id);
  const iconNode = registryEntry?.icon
    ? renderIcon(registryEntry.icon, {
        className: "h-3 w-3 shrink-0 text-muted-foreground",
      })
    : (
      <AppWindow className="h-3 w-3 shrink-0 text-muted-foreground" />
    );
  return (
    <button
      type="button"
      className={cn(
        "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full",
        "bg-card border border-border shadow-sm",
        "text-xs whitespace-nowrap active:bg-accent transition-colors",
      )}
      onClick={() => dispatch(restoreWindow(id))}
    >
      {iconNode}
      <span className="truncate max-w-[120px]">{title}</span>
    </button>
  );
}

// ─── TrayChip ─────────────────────────────────────────────────────────────────

interface TrayChipProps {
  id: string;
  title: string;
  chipWidth: number;
}

function TrayChip({ id, title, chipWidth }: TrayChipProps) {
  const dispatch = useAppDispatch();
  const dragStartX = useRef<number | null>(null);
  const dragStartSlot = useRef<number | null>(null);
  // Track whether the mousedown moved enough to count as a drag
  const didDrag = useRef(false);

  // Resolve registry icon — falls back to AppWindow when no entry exists
  // or no icon is configured. `renderIcon` returns a JSX element.
  const registryEntry = getStaticEntryByOverlayId(id);
  const iconNode = registryEntry?.icon
    ? renderIcon(registryEntry.icon, {
        className: "h-3.5 w-3.5 text-muted-foreground shrink-0",
      })
    : (
      <AppWindow className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    );

  const handleRestore = useCallback(() => {
    dispatch(restoreWindow(id));
  }, [dispatch, id]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      dispatch(focusWindow(id));
      dragStartX.current = e.clientX;
      didDrag.current = false;

      const onMove = (ev: PointerEvent) => {
        if (dragStartX.current === null) return;
        const dx = Math.abs(ev.clientX - dragStartX.current);
        if (dx > 4) didDrag.current = true;

        const slotDx = dragStartX.current - ev.clientX;
        const slotDelta = Math.round(slotDx / (chipWidth + CHIP_GAP));
        if (slotDelta !== 0 && dragStartSlot.current !== null) {
          const newSlot = Math.max(0, dragStartSlot.current + slotDelta);
          dispatch(moveTraySlot({ id, toSlot: newSlot }));
          dragStartX.current = ev.clientX;
          dragStartSlot.current = newSlot;
        }
      };

      const onUp = () => {
        dragStartX.current = null;
        dragStartSlot.current = null;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    },
    [dispatch, id, chipWidth],
  );

  // Single-click restores, but only if the user didn't drag
  const handleClick = useCallback(() => {
    if (!didDrag.current) {
      handleRestore();
    }
  }, [handleRestore]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col rounded-xl select-none",
        "bg-card/95 backdrop-blur-md border border-border shadow-lg",
        "cursor-grab active:cursor-grabbing",
        "hover:bg-accent/60 hover:border-primary/30 transition-colors duration-150",
        "overflow-hidden",
      )}
      style={{
        width: chipWidth,
        minWidth: chipWidth,
        height: TRAY_CHIP_H_DESKTOP,
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      title="Click to restore"
    >
      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 h-8 border-b border-border/60 shrink-0">
        {iconNode}
        <span className="truncate flex-1 text-xs font-semibold text-foreground/90">
          {title}
        </span>
        <button
          type="button"
          className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            handleRestore();
          }}
          aria-label="Restore window"
        >
          <ChevronsUpDown className="h-3 w-3" />
        </button>
      </div>

      {/* ── Body row — content varies by registry preview mode ──────────── */}
      <TrayChipPreview registryKey={id} snapshotKey={id} title={title} />
    </div>
  );
}

export default WindowTray;

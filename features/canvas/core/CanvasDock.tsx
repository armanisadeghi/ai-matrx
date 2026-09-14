"use client";

/**
 * CanvasDock — the canvas as a RESIZABLE COLUMN beside the route's own content.
 *
 * This is the default presentation anywhere the route has room for it. Wrap the
 * route's body:
 *
 *   <CanvasDock groupId="chat-canvas">{routeBody}</CanvasDock>
 *
 * and the canvas stops being an overlay: opening it shrinks `routeBody` into
 * its own panel, the two are separated by a drag handle, and closing it folds
 * the column away with the page reclaiming the width. Nothing the route draws
 * is ever covered — the composer, the mic and the send button stay on screen
 * and prose re-wraps instead of being cut mid-word.
 *
 * Owner standard (2026-09-13): *"we have an entire Canvas system that gives us
 * a nice adjustable sidebar that can be folded out and in."* Same shape as
 * Claude.ai's artifact pane, Cursor's side panel and Claude Code.
 *
 * THE OVERLAY IS THE FALLBACK, NOT THE DEFAULT. While a dock is mounted the
 * slice carries `dockHosts > 0` and `CanvasSideSheet` renders nothing, so the
 * two presentations can never both be on screen. A dock deliberately does NOT
 * register below `DOCK_MIN_VIEWPORT_PX`: there is no room for two readable
 * columns on a phone or a narrow tablet, so the full-bleed sheet stays right
 * there — and it follows a window resize live, in both directions.
 *
 * Structure notes that matter:
 *  - The `<Group>` is ALWAYS rendered, open or closed. Swapping between a bare
 *    div and a panel group would remount the entire route body on every canvas
 *    toggle — losing chat scroll position, in-flight streams and input state.
 *    The canvas panel is `collapsible` and is driven to 0% instead.
 *  - The heavy canvas body is dynamic({ssr:false}) exactly as the sheet's is,
 *    so mounting a dock costs a panel group and nothing else until an item
 *    actually exists.
 */

import React, { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { PanelImperativeHandle } from "react-resizable-panels";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  registerCanvasDock,
  selectCanvasDockRatio,
  selectCanvasIsOpen,
  selectCurrentItemId,
  setCanvasDockRatio,
  unregisterCanvasDock,
} from "@/features/canvas/redux/canvasSlice";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

/**
 * A split needs room for TWO readable columns. Below this the canvas column
 * would be a 250px slot nothing renders well in, and the thread beside it
 * would be narrower than it is on a phone — so the full-bleed sheet is the
 * honest answer there, exactly as it is at 390px. Claude.ai, Cursor and VS
 * Code all draw the same line around a laptop width.
 */
const DOCK_MIN_VIEWPORT_PX = 1024;
const DOCK_QUERY = `(min-width: ${DOCK_MIN_VIEWPORT_PX}px)`;

function subscribeToDockQuery(onChange: () => void) {
  const mq = window.matchMedia(DOCK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True only where there is room for two columns. False during SSR. */
function useHasRoomToDock() {
  return useSyncExternalStore(
    subscribeToDockQuery,
    () => window.matchMedia(DOCK_QUERY).matches,
    () => false,
  );
}

const CanvasDockBody = dynamic(
  () => import("./CanvasDockBody").then((m) => m.CanvasDockBody),
  { ssr: false, loading: () => null },
);

export const CANVAS_DOCK_MAIN_PANEL_ID = "canvas-dock-main";
export const CANVAS_DOCK_PANEL_ID = "canvas-dock-canvas";

/** Where the docked width survives a reload. */
export const CANVAS_DOCK_RATIO_STORAGE_KEY = "matrx.canvas.dock.ratio";

export function readStoredDockRatio(
  storage: Pick<Storage, "getItem"> | undefined,
): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CANVAS_DOCK_RATIO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 20 || parsed > 70) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function CanvasDock({
  children,
  groupId,
  className,
}: {
  children: React.ReactNode;
  /** Stable group id — one per route shell. */
  groupId: string;
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const hasRoomToDock = useHasRoomToDock();
  const isOpen = useAppSelector(selectCanvasIsOpen);
  const currentItemId = useAppSelector(selectCurrentItemId);
  const dockRatio = useAppSelector(selectCanvasDockRatio);
  const panelRef = useRef<PanelImperativeHandle | null>(null);

  // No room for two columns → leave the overlay sheet in charge.
  const dockActive = hasRoomToDock;

  useEffect(() => {
    if (!dockActive) return undefined;
    dispatch(registerCanvasDock());
    return () => {
      dispatch(unregisterCanvasDock());
    };
  }, [dockActive, dispatch]);

  // Restore the user's width. Read in an effect, never during render: the
  // route is server-rendered and a localStorage read during render is a
  // hydration mismatch.
  useEffect(() => {
    const stored = readStoredDockRatio(
      typeof window === "undefined" ? undefined : window.localStorage,
    );
    if (stored != null) dispatch(setCanvasDockRatio(stored));
  }, [dispatch]);

  const shouldShow = dockActive && isOpen && !!currentItemId;

  // Fold out / fold in. The panel is always mounted so the route body beside
  // it is never remounted by a canvas toggle.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (shouldShow) {
      if (panel.isCollapsed()) panel.expand();
      // ALWAYS resize to the remembered ratio, never trust `expand()` alone:
      // it restores the PRE-COLLAPSE size, and on a freshly loaded page there
      // is no pre-collapse size — the library falls back to `minSize`, so the
      // width the user dragged to last week would be silently ignored.
      panel.resize(`${dockRatio}%`);
    } else if (!panel.isCollapsed()) {
      panel.collapse();
    }
  }, [shouldShow, dockRatio]);

  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      const canvas = layout[CANVAS_DOCK_PANEL_ID];
      if (!Number.isFinite(canvas) || canvas < 20 || canvas > 70) return;
      dispatch(setCanvasDockRatio(canvas));
      try {
        window.localStorage.setItem(
          CANVAS_DOCK_RATIO_STORAGE_KEY,
          String(Math.round(canvas)),
        );
      } catch {
        // A blocked localStorage costs the remembered width and nothing else.
      }
    },
    [dispatch],
  );

  return (
    <ResizablePanelGroup
      id={groupId}
      orientation="horizontal"
      className={cn("h-full w-full min-h-0", className)}
      onLayoutChanged={handleLayoutChanged}
      data-canvas-dock={shouldShow ? "open" : "closed"}
    >
      <ResizablePanel
        id={CANVAS_DOCK_MAIN_PANEL_ID}
        minSize="30%"
        style={{ overflow: "hidden", height: "100%" }}
      >
        {children}
      </ResizablePanel>
      {/* The handle is inert (and invisible) while the column is folded away,
        so a closed canvas leaves no mystery line down the page. It stays
        MOUNTED: removing it would rebuild the group's children. */}
      <ResizableHandle
        className={cn(!shouldShow && "pointer-events-none opacity-0")}
        aria-label="Resize canvas"
      />
      <ResizablePanel
        id={CANVAS_DOCK_PANEL_ID}
        panelRef={panelRef}
        collapsible
        collapsedSize="0%"
        // v4: a bare number is PIXELS. Mount folded away; the effect above
        // expands to the remembered percentage when an item exists.
        defaultSize="0%"
        minSize="24%"
        maxSize="70%"
        // The app shell's header FLOATS over the route body (the chat thread
        // deliberately scrolls under it and portals its own title into it), so
        // a docked column that starts at y=0 puts its pane header — title,
        // Preview/Source, the action cluster — underneath the shell's Records
        // button and avatar. The sheet never hit this because it was drawn
        // above the header at z-10000. Where the variable is not defined this
        // resolves to 0 and nothing moves.
        style={{
          overflow: "hidden",
          height: "100%",
          paddingTop: "var(--shell-header-h, 0px)",
        }}
      >
        {shouldShow ? <CanvasDockBody /> : null}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

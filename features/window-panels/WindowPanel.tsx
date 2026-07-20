"use client";

import { assertLazyLoaded } from "./utils/lazy-bundle-guard";
assertLazyLoaded("features/window-panels/WindowPanel.tsx");

/**
 * WindowPanel
 *
 * A floating, draggable, resizable, maximizable, minimizable OS-style window.
 *
 * Changes from v1:
 *  - Minimized and maximized states rendered via createPortal(document.body)
 *    so they always escape any parent stacking context / overflow:hidden.
 *  - Green traffic-light is single-click maximize (not double-click).
 *  - Green traffic-light shows an Apple-style dropdown on hover with
 *    "Move & Resize" options (snap left/right/top/bottom, centre) and
 *    "Enter Full Screen" / "Exit Full Screen".
 *  - Title is stored in Redux so WindowTray displays it correctly.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PanelImperativeHandle } from "react-resizable-panels";
import {
  Minus,
  Maximize2,
  Minimize2,
  X,
  RectangleVertical,
  PanelLeftClose,
  PanelLeft,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  LayoutIcon,
  LayoutIconButton,
  type LayoutIconType,
} from "./components/LayoutIcon";
import {
  useWindowPanel,
  type UseWindowPanelOptions,
  type ResizeEdge,
} from "./hooks/useWindowPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  updateWindowRect,
  selectWindowsHidden,
  selectAllWindows,
  arrangeActiveWindows,
} from "@/lib/redux/slices/windowManagerSlice";
import type { GlobalLayoutType } from "./utils/windowArrangements";
import { useIsMobile } from "@/hooks/use-mobile";
import { getStaticEntryByOverlayId } from "./registry/windowRegistryMetadata";
import {
  ackOverlayRender,
  clearOverlayRender,
} from "./diagnostics/overlayRenderWatchdog";
import type { OverlayId } from "./registry/overlay-ids";
import MobileDrawerSurface from "./mobile/MobileDrawerSurface";
import MobileCardSurface from "./mobile/MobileCardSurface";
import { selectIsDebugMode } from "@/lib/redux/preferences/adminDebugSlice";
import { useUrlSync } from "./url-sync/useUrlSync";
import { useWindowPersistence } from "./WindowPersistenceManager";
import { Save } from "lucide-react";
import { DebugStrip } from "./WindowPanel/DebugStrip";
import motionStyles from "./WindowPanel.module.css";
import { MobileWindowHeader } from "./WindowPanel/MobileHeader";
import {
  WINDOW_CHROME_ACTIONS,
  WINDOW_CHROME_INTERACTIVE,
} from "./WindowPanel/chromeClasses";
import { DeprecationBanner } from "./WindowPanel/DeprecationBanner";
import {
  detectPopoutCapability,
  type PopoutCapability,
} from "./popout/featureDetection";
import {
  selectPopoutMode,
  selectPopoutCandidateId,
  dockWindow,
  clampWindowRect,
  type WindowRect,
} from "@/lib/redux/slices/windowManagerSlice";
import { buildDockWindowPayload } from "./popout/dockWindowPayload";
import { usePopoutWindow } from "./popout/usePopoutWindow";
import { registerPopoutOpener } from "./popout/usePopoutControl";
import { PopoutPortal } from "./popout/PopoutPortal";
import { PopoutTopBar } from "./WindowPanel/PopoutTopBar";
import {
  setTraySnapshot,
  clearTraySnapshot,
} from "./WindowTray/traySnapshotMap";
import { MinimizedWindowContent } from "./WindowTray/MinimizedWindowContent";
import { getTrayPreviewEntry } from "./registry/trayPreviewRegistry";

// ─── Resize handle descriptors ───────────────────────────────────────────────

interface HandleDef {
  edge: ResizeEdge;
  className: string;
}

const HANDLES: HandleDef[] = [
  {
    edge: "e",
    className:
      "absolute right-0 top-2 bottom-2 w-2.5 translate-x-1/2 cursor-ew-resize",
  },
  {
    edge: "w",
    className:
      "absolute left-0 top-2 bottom-2 w-2.5 -translate-x-1/2 cursor-ew-resize",
  },
  {
    edge: "s",
    className:
      "absolute bottom-0 left-2 right-2 h-2.5 translate-y-1/2 cursor-ns-resize",
  },
  {
    // Start after the traffic-light hot zone (w-28) — top-left is close/minimize/maximize.
    edge: "n",
    className:
      "absolute top-0 left-2 right-2 h-2.5 -translate-y-1/2 cursor-ns-resize",
  },
  {
    edge: "se",
    className:
      "absolute bottom-0 right-0 w-2.5 h-2.5 -translate-x-1/4 -translate-y-1/4 cursor-nwse-resize",
  },
  {
    edge: "sw",
    className:
      "absolute bottom-0 left-0 w-2.5 h-2.5 -translate-x-1/4 -translate-y-1/4 cursor-nesw-resize",
  },
  {
    edge: "ne",
    className:
      "absolute top-0 right-0 w-2.5 h-2.5 -translate-x-1/4 -translate-y-1/4 cursor-nesw-resize",
  },
  {
    edge: "nw",
    className:
      "absolute top-0 left-0 w-2.5 h-2.5 -translate-x-1/4 -translate-y-1/4 cursor-nwse-resize",
  },
];

/**
 * Desktop windowed body shell — consumers style the inner slot via `bodyClassName`
 * only. The outer guard ring is structural: it keeps full-bleed children off the
 * resize-handle hit zones and uses pointer-events-none so bare edge clicks reach
 * the handle layer (z-50) even when inner content is `absolute inset-0`.
 */
function WindowPanelBodyShell({
  bodyRef,
  fitContent,
  bodyClassName,
  captureDimensions,
  children,
}: {
  bodyRef: React.RefObject<HTMLDivElement | null>;
  fitContent?: boolean;
  bodyClassName?: string;
  captureDimensions?: { width: number; height: number } | null;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={bodyRef}
      className={cn(
        "relative z-0 min-h-0 flex-1 overflow-hidden p-1.5 pointer-events-none",
        fitContent && "overflow-visible",
        captureDimensions && "fixed -left-[100000px] top-0 z-[-1] flex",
      )}
      style={captureDimensions ?? undefined}
    >
      <div
        className={cn(
          "h-full min-h-0 overflow-auto pointer-events-auto rounded-[10px]",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

/**
 * Props that don't participate in the close-binding discrimination.
 * Kept as an intersection base so the discriminated union below can layer
 * the close-binding contract on top without losing intellisense on the
 * common props.
 */
interface WindowPanelBaseProps extends UseWindowPanelOptions {
  children: React.ReactNode;
  title?: string;
  /** Rich title rendered in the header. Falls back to `title` (string) when omitted. */
  titleNode?: React.ReactNode;
  /** @deprecated Use `actionsLeft` and `actionsRight` instead */
  actions?: React.ReactNode;
  actionsLeft?: React.ReactNode;
  actionsRight?: React.ReactNode;
  bodyClassName?: string;
  className?: string;
  minWidth?: number;
  minHeight?: number;
  urlSyncKey?: string;
  urlSyncId?: string;
  urlSyncArgs?: Record<string, string>;
  /** Content to render in a collapsible left sidebar panel */
  sidebar?: React.ReactNode;
  /** Default width for the sidebar in pixels (default: 200) */
  sidebarDefaultSize?: number;
  /** Minimum width in pixels before the sidebar collapses (default: 150) */
  sidebarMinSize?: number;
  /** Whether the sidebar starts open (default: true) */
  defaultSidebarOpen?: boolean;
  /** Class name applied to the sidebar panel content wrapper */
  sidebarClassName?: string;
  /**
   * When true, opening the sidebar grows the window width by sidebarDefaultSize
   * and closing it shrinks it back, keeping the body content width constant.
   */
  sidebarExpandsWindow?: boolean;
  /**
   * Content for a collapsible RIGHT secondary panel — the canonical home for a
   * history / inspector / details pane that belongs to the window, not the body.
   * Resizable, mirrors the left `sidebar`. Desktop only; handle mobile in the
   * consumer (e.g. a Drawer) — see `features/notes` for the reference pattern.
   */
  secondaryPanel?: React.ReactNode;
  /** Whether the secondary panel is open (default: true when `secondaryPanel` is provided). */
  secondaryPanelOpen?: boolean;
  /** Default width for the secondary panel in pixels (default: 360) */
  secondaryPanelDefaultSize?: number;
  /** Minimum width in pixels for the secondary panel (default: 240) */
  secondaryPanelMinSize?: number;
  /** Class name applied to the secondary panel content wrapper */
  secondaryPanelClassName?: string;
  /**
   * When true, hides the header pop-out affordance (icon + green-dropdown entry).
   * Pop-out is shown by default on desktop when the browser supports it.
   */
  hidePopOutButton?: boolean;
  /** Content rendered in a full-width footer bar below the body. Renders as a single flex row. For zoned layout, use footerLeft/footerCenter/footerRight instead. */
  footer?: React.ReactNode;
  /** Left-aligned footer content (use instead of `footer` for zoned layout) */
  footerLeft?: React.ReactNode;
  /** Center-aligned footer content */
  footerCenter?: React.ReactNode;
  /** Right-aligned footer content */
  footerRight?: React.ReactNode;
  /**
   * Styling posture for the footer wrapper. Default `"bar"` applies the compact
   * metadata-bar chrome (thin chips, `text-xs`, tiny buttons/icons via descendant
   * selectors) tuned for status rows like `NoteMetadataBar`. That chrome CRUSHES
   * rich content — use `"rich"` when the footer hosts a composer / input bar /
   * anything with full-size buttons or a multi-row textarea (e.g. `SmartAgentInput`).
   * `"rich"` drops the compact descendant selectors and the `bg-muted/40` chrome,
   * leaving just `shrink-0 border-t` so the slot's own content owns its layout.
   */
  footerVariant?: "bar" | "rich";
  /**
   * When true, the windowed panel sizes itself to fit its content rather than
   * using the explicit width/height from Redux. A ResizeObserver syncs the
   * measured dimensions back into Redux so drag/snap operations still work.
   * The panel will still respect minWidth/minHeight constraints.
   */
  fitContent?: boolean;

  /**
   * Called by WindowPanel before a save so the child component can return
   * its current content state to include in the window_sessions `data` column.
   * Return value must be a plain object (JSON-serializable).
   */
  onCollectData?: () => Record<string, unknown>;
  /**
   * Called after the session row has been written with the row's UUID.
   * Useful if the child needs to track its own session id (rare).
   */
  onSessionSaved?: (sessionId: string) => void;
  /**
   * Phase 7 — Async snapshot hook for windows with heavy in-memory
   * buffers (Scraper results, PDF Extractor history, Markdown tester
   * state, Voice Pad transcripts). Opt-in via `heavySnapshot: true` on
   * the registry entry — WindowPanel awaits this BEFORE writing to DB
   * and merges the result into `data.snapshot`.
   */
  onHeavySnapshot?: () => Promise<Record<string, unknown>>;
  /**
   * Optional snapshot capture function for the minimized tray chip.
   * WindowPanel invokes it after minimizing against a briefly retained,
   * offscreen body and stores the resulting Blob in a bounded local cache.
   * Pass this from the window component if it implements custom capture logic.
   */
  captureTraySnapshot?: (bodyEl: HTMLElement) => Promise<Blob | null>;
  /** Overlay instance used by semantic minimized previews. Defaults to `default`. */
  overlayInstanceId?: string;
}

/**
 * The close-binding contract — enforced by the type system.
 *
 * Every WindowPanel must declare HOW it closes. There are exactly two valid
 * shapes:
 *
 *   1. Overlay-managed:  caller passes `overlayId`. The WindowPersistenceManager
 *      dispatches `closeOverlay({ overlayId })` from inside `closeWindow`, which
 *      flips `state.overlays[overlayId].isOpen` to false. OverlayController
 *      then unmounts the component, which fires the unmount-driven cleanups
 *      (URL sync unregister, autosave-on-blur flush, tray snapshot clear,
 *      popout opener unregister). The caller-supplied `onClose` becomes an
 *      OPTIONAL hook for extra work — it is no longer load-bearing.
 *
 *   2. Inline-managed:  caller passes `onClose`. The WindowPanel lives directly
 *      on a page (not via overlay slice) and the parent controls visibility
 *      via local state. `onClose` is REQUIRED here because nothing else will
 *      close the window.
 *
 * Passing NEITHER is a compile error. This used to be the silent-failure mode
 * that broke the Notes / AiVoice / Feedback X buttons — `onClose?` and
 * `overlayId?` were both optional, so a caller could forget both and the X
 * would render as a dead button. The Notes incident (Tuesday May 26 2026)
 * traced to exactly this: NotesWindow's controller block in OverlayController
 * supplied `overlayId` on WindowPanel but no `onClose`, and the persistence
 * layer's `closeWindow` only deleted the DB row, so clicking X deleted the
 * window_sessions row but left `isOpen=true` in Redux → window stayed mounted.
 *
 * Do NOT change `overlayId` and `onClose` back to both-optional. The
 * discriminated union is what makes the close mechanic structurally
 * unbreakable.
 */
type WindowPanelCloseBinding =
  | {
      /** Overlay slice id. When set, closing is handled by the persistence
       *  context which dispatches `closeOverlay({ overlayId })`. */
      overlayId: OverlayId;
      /** Optional extra cleanup hook (cancel uploads, save drafts, etc.). */
      onClose?: () => void;
    }
  | {
      overlayId?: never;
      /** Required when the panel is rendered inline (no overlay slice). */
      onClose: () => void;
    };

export type WindowPanelProps = WindowPanelBaseProps & WindowPanelCloseBinding;

// ─── Component ────────────────────────────────────────────────────────────────

export function WindowPanel({
  children,
  title,
  titleNode,
  actions,
  actionsLeft,
  actionsRight,
  onClose,
  bodyClassName,
  className,
  minWidth,
  minHeight,
  urlSyncKey,
  urlSyncId,
  urlSyncArgs,
  sidebar,
  sidebarDefaultSize = 200,
  sidebarMinSize = 100,
  defaultSidebarOpen = true,
  sidebarClassName,
  sidebarExpandsWindow = false,
  secondaryPanel,
  secondaryPanelOpen,
  secondaryPanelDefaultSize = 360,
  secondaryPanelMinSize = 240,
  secondaryPanelClassName,
  footer,
  footerLeft,
  footerCenter,
  footerRight,
  footerVariant = "bar",
  fitContent = false,
  overlayId,
  onCollectData,
  onSessionSaved,
  onHeavySnapshot,
  captureTraySnapshot,
  overlayInstanceId,
  hidePopOutButton = false,
  ...hookOpts
}: WindowPanelProps) {
  if (overlayId === "createProjectWindow") {
    console.log(
      "[Track New Project] 14, WindowPanel.tsx — WindowPanel render",
      {
        id: hookOpts.id,
        overlayId,
        title,
      },
    );
  }
  // ── Pre-compute id and popout capabilities BEFORE useWindowPanel so we
  //    can pass `onTriggerPopout` to the drag-detection logic. The id is
  //    derived the same way useWindowPanel does internally (`opts.id ?? useId()`).
  const reactId = useId();
  const id = hookOpts.id ?? reactId;
  const trayRegistryKey = overlayId ?? id;
  const isMobile = useIsMobile();

  const popoutCapabilityRef = useRef<PopoutCapability | null>(null);
  if (popoutCapabilityRef.current === null) {
    popoutCapabilityRef.current = detectPopoutCapability();
  }
  const popoutCapability = popoutCapabilityRef.current;

  // popout lifecycle hook — owns the actual browser popout window and its
  // open/close lifecycle. Always called (id is stable) but its `openPopout`
  // is only invoked when the user actually triggers a popout.
  const popout = usePopoutWindow(id);

  // Register the live openPopout in the module-level opener map so external
  // callers (`usePopoutControl`) can trigger popout for this window. Cleanup
  // on unmount is handled by the returned unregister function.
  useEffect(() => {
    return registerPopoutOpener(id, popout.openPopout);
  }, [id, popout.openPopout]);

  // Drag-out callback fired by useWindowPanel when the user drags this
  // window outside the viewport beyond the dwell threshold. Receives the
  // dragged rect at release time so popout sizing matches user intent.
  // The popout opener internally enforces single-PiP slot and surfaces
  // toasts on failure, so we don't double-check here.
  const handleDragOutPopout = useCallback(
    (draggedRect: WindowRect) => {
      void popout.openPopout({
        width: draggedRect.width,
        height: draggedRect.height,
        title: typeof title === "string" ? title : "Window",
      });
    },
    [popout, title],
  );

  // Hand drag-out detection a callback ONLY when popout is meaningful here:
  //  - desktop only (mobile path is fully separate)
  //  - browser must support some form of popout
  const onTriggerPopout =
    !isMobile && popoutCapability !== "none" ? handleDragOutPopout : undefined;

  // Pass title and our pre-computed id+trigger into the hook
  const {
    windowState,
    rect,
    zIndex,
    onDragStart,
    onResizeStart,
    onFocus,
    onRestore,
    onMaximize,
    onMinimize,
    onToggleMaximize,
    isInteracting,
  } = useWindowPanel({ ...hookOpts, id, title, onTriggerPopout });

  const dispatch = useAppDispatch();
  const windowsHidden = useAppSelector(selectWindowsHidden);
  const isDebugMode = useAppSelector(selectIsDebugMode);

  // On mobile, only the topmost non-minimized window is rendered visible.
  const allWindows = useAppSelector(selectAllWindows);
  const isTopWindow = !isMobile
    ? true
    : allWindows.find((w) => w.state !== "minimized")?.id === id;

  // Mobile sidebar/content toggle (not stored in Redux — purely a view concern)
  const [activePaneMobile, setActivePaneMobile] = useState<"main" | "sidebar">(
    "main",
  );

  // URL sync: prefer explicit props (back-compat), else derive from registry.
  // A window with `urlSync.key` in its registry entry auto-activates without
  // any prop wiring — fixes the "urlSyncKey set but urlSyncId missing" silent
  // no-op that previously left ~7 windows without deep-link support.
  const urlSyncRegEntry = overlayId
    ? getStaticEntryByOverlayId(overlayId)
    : undefined;
  const effectiveUrlSyncKey = urlSyncKey ?? urlSyncRegEntry?.urlSync?.key;
  const effectiveUrlSyncId =
    urlSyncId ?? (effectiveUrlSyncKey ? overlayId : undefined);
  useUrlSync(effectiveUrlSyncKey, effectiveUrlSyncId, urlSyncArgs);

  // Deprecation marker — when set on the registry entry, the shell renders a
  // red ring + dismissible banner so users can see at a glance that this
  // window is on its way out. Used during consolidation while the old window
  // is kept around for side-by-side parity verification with its replacement.
  const deprecation = urlSyncRegEntry?.deprecated;
  const isDeprecated = !!deprecation;
  const deprecatedRingClass = isDeprecated
    ? "ring-2 ring-destructive ring-offset-2 ring-offset-background"
    : "";

  // ── Sidebar state ─────────────────────────────────────────────────────────
  const hasSidebar = !!sidebar;
  const [sidebarOpen, setSidebarOpen] = useState(defaultSidebarOpen);

  // ── Persistence ───────────────────────────────────────────────────────────
  const persistence = useWindowPersistence();

  /**
   * Collect the current panel chrome state from Redux + local state and
   * merge it with whatever the child provides via onCollectData(), then
   * save to the DB. This is the shared path for both explicit saves and
   * piggyback saves.
   *
   * Phase 7: when `onHeavySnapshot` is provided, awaits the snapshot and
   * merges the result into `data.snapshot` before writing. Fire-and-forget
   * — errors are swallowed (persistence layer already logs).
   */
  const handleSaveWindowState = useCallback(() => {
    if (!overlayId) return;
    const panelState = {
      windowState,
      rect,
      sidebarOpen,
      zIndex,
    };
    const base = onCollectData?.() ?? {};

    if (!onHeavySnapshot) {
      persistence.saveWindow(overlayId, panelState, base, onSessionSaved);
      return;
    }

    // Heavy-snapshot path — await the async buffer serializer, then save.
    void (async () => {
      try {
        const snapshot = await onHeavySnapshot();
        persistence.saveWindow(
          overlayId,
          panelState,
          { ...base, snapshot },
          onSessionSaved,
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[WindowPanel] heavy snapshot failed for "${overlayId}", saving without it:`,
          err,
        );
        persistence.saveWindow(overlayId, panelState, base, onSessionSaved);
      }
    })();
  }, [
    overlayId,
    windowState,
    rect,
    sidebarOpen,
    zIndex,
    onCollectData,
    onSessionSaved,
    onHeavySnapshot,
    persistence,
  ]);

  /**
   * Phase 7 — Autosave-on-blur: when the registry entry opts in via
   * `autosave: true` (or implicitly via `heavySnapshot: true`), save the
   * window state whenever the tab becomes hidden or the window unmounts.
   * A 500 ms debounce guards against a flurry of visibility events.
   *
   * Only the most recent save wins — earlier pending timers are canceled.
   */
  const saveRef = useRef(handleSaveWindowState);
  saveRef.current = handleSaveWindowState;

  useEffect(() => {
    if (!overlayId) return undefined;
    const entry = getStaticEntryByOverlayId(overlayId);
    if (!entry || (!entry.autosave && !entry.heavySnapshot)) return undefined;
    if (entry.ephemeral) return undefined;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSave = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        saveRef.current();
      }, 500);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") scheduleSave();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // Flush once on unmount so unloading mid-session doesn't lose state.
      saveRef.current();
    };
  }, [overlayId]);

  /**
   * Wrap the onClose prop to also delete the DB row for this window.
   */
  const handleClose = useCallback(() => {
    if (overlayId) persistence.closeWindow(overlayId);
    onClose?.();
  }, [overlayId, onClose, persistence]);
  const sidebarPanelRef = useRef<PanelImperativeHandle>(null);

  useEffect(() => {
    if (!defaultSidebarOpen) {
      sidebarPanelRef.current?.collapse();
    }
  }, [defaultSidebarOpen]);

  // ── fitContent: sync measured shell size back into Redux ─────────────────
  const fitContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fitContent || isMobile) return undefined;
    const el = fitContentRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // Include border (2px each side) to match the element's full box size
      const borderH = el.offsetHeight - el.clientHeight;
      const borderW = el.offsetWidth - el.clientWidth;
      dispatch(
        updateWindowRect({
          id,
          rect: {
            width: Math.ceil(width + borderW),
            height: Math.ceil(height + borderH),
          },
        }),
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitContent, id, dispatch]);

  const toggleSidebar = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (sidebarOpen) {
      if (sidebarExpandsWindow) {
        dispatch(
          updateWindowRect({
            id,
            rect: { width: rect.width - sidebarDefaultSize },
          }),
        );
        requestAnimationFrame(() => panel.collapse());
      } else {
        panel.collapse();
      }
    } else {
      if (sidebarExpandsWindow) {
        dispatch(
          updateWindowRect({
            id,
            rect: { width: rect.width + sidebarDefaultSize },
          }),
        );
        requestAnimationFrame(() => panel.resize(sidebarDefaultSize));
      } else {
        panel.resize(sidebarDefaultSize);
      }
    }
  }, [
    sidebarOpen,
    sidebarDefaultSize,
    sidebarExpandsWindow,
    dispatch,
    id,
    rect.width,
  ]);

  const handleSidebarResize = useCallback(
    (panelSize: { asPercentage: number; inPixels: number }) => {
      setSidebarOpen(panelSize.asPercentage > 0);
    },
    [],
  );

  // ── Portal target (client-only) ──────────────────────────────────────────
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render acknowledgement ────────────────────────────────────────────────
  // Tell the render watchdog which window-manager id actually rendered this
  // overlay, so it can verify the panel became visible (and never false-flag a
  // window whose `id` differs from its registry slug). See overlayRenderWatchdog.
  useEffect(() => {
    if (!overlayId) return undefined;
    ackOverlayRender(overlayId, id);
    return () => clearOverlayRender(overlayId, id);
  }, [overlayId, id]);

  // Backward compat: legacy `actions` maps to actionsRight
  const resolvedActionsRight = actionsRight ?? actions ?? null;

  // ── Snap helpers (Move & Resize menu) ───────────────────────────────────
  const snapLeft = useCallback(() => {
    dispatch(
      updateWindowRect({
        id,
        rect: {
          x: 0,
          y: 0,
          width: Math.round(window.innerWidth / 2),
          height: window.innerHeight,
        },
      }),
    );
  }, [dispatch, id]);

  const snapRight = useCallback(() => {
    const half = Math.round(window.innerWidth / 2);
    dispatch(
      updateWindowRect({
        id,
        rect: {
          x: half,
          y: 0,
          width: window.innerWidth - half,
          height: window.innerHeight,
        },
      }),
    );
  }, [dispatch, id]);

  const snapTop = useCallback(() => {
    dispatch(
      updateWindowRect({
        id,
        rect: {
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: Math.round(window.innerHeight / 2),
        },
      }),
    );
  }, [dispatch, id]);

  const snapBottom = useCallback(() => {
    const half = Math.round(window.innerHeight / 2);
    dispatch(
      updateWindowRect({
        id,
        rect: {
          x: 0,
          y: half,
          width: window.innerWidth,
          height: window.innerHeight - half,
        },
      }),
    );
  }, [dispatch, id]);

  const snapCentre = useCallback(() => {
    const w = Math.min(rect.width, window.innerWidth);
    const h = Math.min(rect.height, window.innerHeight);
    dispatch(
      updateWindowRect({
        id,
        rect: {
          x: Math.round((window.innerWidth - w) / 2),
          y: Math.round((window.innerHeight - h) / 2),
          width: w,
          height: h,
        },
      }),
    );
  }, [dispatch, id, rect.width, rect.height]);

  const arrangeAll = useCallback(
    (layout: GlobalLayoutType) => {
      dispatch(
        arrangeActiveWindows({
          layout,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }),
      );
    },
    [dispatch],
  );

  // ── Pop-out menu-click wiring ─────────────────────────────────────────────
  // (popout, popoutCapability, isMobile already set up at top of component)
  const popoutMode = useAppSelector(selectPopoutMode(id));
  const popoutCandidateId = useAppSelector(selectPopoutCandidateId);

  // Menu affordance is shown only when:
  //   - desktop (mobile path is fully separate)
  //   - browser supports popout (DPiP or window.open)
  //   - the window isn't minimized (popout from the tray is awkward UX)
  //   - the window isn't already popped out
  //
  // The menu is NEVER disabled on PiP-slot-taken grounds: the popout hook
  // transparently falls back to `window.open()` for second+ popouts so the
  // user gets a working window without us blocking the action.
  const canShowPopOut =
    !hidePopOutButton &&
    !isMobile &&
    popoutCapability !== "none" &&
    windowState !== "minimized" &&
    popoutMode === null;

  // Menu-click handler — uses the live windowed rect (different from the
  // drag-out path which gets the rect from the gesture).
  const handlePopOut = useCallback(() => {
    void popout.openPopout({
      width: rect.width,
      height: rect.height,
      title: typeof title === "string" ? title : "Window",
    });
  }, [popout, rect.width, rect.height, title]);

  const handleDockBack = useCallback(() => {
    dispatch(dockWindow(buildDockWindowPayload(id)));
  }, [dispatch, id]);

  // ── Minimized thumbnail lifecycle ───────────────────────────────────────
  // Minimize dispatches immediately. The full body stays mounted offscreen
  // only long enough for one low-resolution local capture, then unmounts.
  // No network, persistent storage, polling, or full-size image is involved.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const captureGenerationRef = useRef(0);
  const effectiveTrayCapture =
    captureTraySnapshot ??
    getTrayPreviewEntry(trayRegistryKey).captureTraySnapshot;
  const [pendingTrayCapture, setPendingTrayCapture] = useState<{
    capture: (bodyEl: HTMLElement) => Promise<Blob | null>;
    width: number;
    height: number;
    generation: number;
  } | null>(null);

  const handleMinimize = useCallback(() => {
    const bodyEl = bodyRef.current;
    const generation = ++captureGenerationRef.current;
    if (effectiveTrayCapture && bodyEl) {
      const bounds = bodyEl.getBoundingClientRect();
      setPendingTrayCapture({
        capture: effectiveTrayCapture,
        width: Math.max(1, Math.round(bounds.width)),
        height: Math.max(1, Math.round(bounds.height)),
        generation,
      });
    } else {
      setPendingTrayCapture(null);
    }
    onMinimize();
  }, [effectiveTrayCapture, onMinimize]);

  useEffect(() => {
    if (windowState !== "minimized" || !pendingTrayCapture) return undefined;
    const bodyEl = bodyRef.current;
    if (!bodyEl) {
      setPendingTrayCapture(null);
      return undefined;
    }

    let cancelled = false;
    const { capture, generation } = pendingTrayCapture;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => resolve(null), 800);
    });
    void Promise.race([capture(bodyEl), timeout])
      .then((blob) => {
        if (blob && !cancelled && captureGenerationRef.current === generation) {
          setTraySnapshot(id, blob);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn(
            `[WindowPanel] captureTraySnapshot threw for "${id}":`,
            err,
          );
        }
      })
      .finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!cancelled && captureGenerationRef.current === generation) {
          setPendingTrayCapture((current) =>
            current?.generation === generation ? null : current,
          );
        }
      });

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [id, pendingTrayCapture, windowState]);

  const handleRestoreClearingSnapshot = useCallback(() => {
    captureGenerationRef.current += 1;
    setPendingTrayCapture(null);
    clearTraySnapshot(id);
    onRestore();
  }, [id, onRestore]);

  // Clear any lingering snapshot on unmount.
  useEffect(() => {
    return () => {
      captureGenerationRef.current += 1;
      clearTraySnapshot(id);
    };
  }, [id]);

  // External exits (reveal, maximize, pop-out) do not pass through the
  // click-to-restore handler. Invalidate their pending capture and local image
  // too, so every way out of minimized state has the same cleanup contract.
  const previousTrayStateRef = useRef(windowState);
  useEffect(() => {
    const wasMinimized = previousTrayStateRef.current === "minimized";
    previousTrayStateRef.current = windowState;
    if (!wasMinimized || windowState === "minimized") return;

    const invalidGeneration = ++captureGenerationRef.current;
    clearTraySnapshot(id);
    queueMicrotask(() => {
      setPendingTrayCapture((current) =>
        current && current.generation < invalidGeneration ? null : current,
      );
    });
  }, [id, windowState]);

  // ── Off-screen rescue ────────────────────────────────────────────────────
  // If the windowed rect is fully out of reach (drag-released outside the
  // viewport without popout firing, restored from a stale preMinimizedRect,
  // or docked back from a popped-out state where the docked rect was
  // off-screen), nudge it back into a position where the user can grab it.
  // Runs whenever the window transitions INTO `windowed` from min/max/popout.
  const prevStateRef = useRef<typeof windowState>(windowState);
  const prevPopoutModeRef = useRef<typeof popoutMode>(popoutMode);
  useEffect(() => {
    const wasNonWindowed =
      prevStateRef.current !== "windowed" || prevPopoutModeRef.current !== null;
    const isNowWindowed = windowState === "windowed" && popoutMode === null;
    prevStateRef.current = windowState;
    prevPopoutModeRef.current = popoutMode;
    if (wasNonWindowed && isNowWindowed) {
      dispatch(
        clampWindowRect({
          id,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }),
      );
    }
  }, [dispatch, id, windowState, popoutMode]);

  const isMinimized = windowState === "minimized";
  const isMaximized = windowState === "maximized";
  const isPopoutCandidate = popoutCandidateId === id;
  const minimizedTitle =
    title?.trim() ||
    getStaticEntryByOverlayId(trayRegistryKey)?.label ||
    "Window";

  // ── Header (shared across all states) ───────────────────────────────────
  const header = (
    <WindowHeader
      title={titleNode ?? title}
      minimizedTitle={minimizedTitle}
      actionsLeft={actionsLeft}
      actionsRight={resolvedActionsRight}
      onDragStart={onDragStart}
      onMinimize={handleMinimize}
      onToggleMaximize={onToggleMaximize}
      onClose={handleClose}
      onRestore={handleRestoreClearingSnapshot}
      isMaximized={isMaximized}
      isMinimized={isMinimized}
      snapLeft={snapLeft}
      snapRight={snapRight}
      snapTop={snapTop}
      snapBottom={snapBottom}
      snapCentre={snapCentre}
      arrangeAll={arrangeAll}
      hasSidebar={hasSidebar}
      sidebarOpen={sidebarOpen}
      onToggleSidebar={toggleSidebar}
      onSaveWindowState={overlayId ? handleSaveWindowState : undefined}
      onPopOut={canShowPopOut ? handlePopOut : undefined}
    />
  );

  // ────────────────────────────────────────────────────────────────────────
  // MAXIMIZED — portalled to body so it covers the full viewport
  // ────────────────────────────────────────────────────────────────────────
  // A secondary (right) panel is shown when content is provided and it's open.
  // Stable `id` props (sidebar/body/secondary) keep panel identity so toggling
  // the secondary panel doesn't tear down the body (and the live editor inside).
  const hasSecondaryPanel =
    secondaryPanel != null && (secondaryPanelOpen ?? true);

  const innerBody =
    hasSidebar || hasSecondaryPanel ? (
      <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
        {hasSidebar && (
          <>
            <ResizablePanel
              id="sidebar"
              panelRef={sidebarPanelRef}
              defaultSize={sidebarOpen ? sidebarDefaultSize : 0}
              minSize={sidebarMinSize}
              collapsible
              collapsedSize={0}
              groupResizeBehavior="preserve-pixel-size"
              onResize={handleSidebarResize}
              style={{ overflow: "hidden" }}
            >
              <div
                className={cn(
                  "h-full flex flex-col min-h-0 overflow-y-auto scrollbar-thin",
                  sidebarClassName,
                )}
              >
                {sidebar}
              </div>
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}
        <ResizablePanel id="body" minSize={200} className="min-h-0">
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {children}
          </div>
        </ResizablePanel>
        {hasSecondaryPanel && (
          <>
            <ResizableHandle />
            <ResizablePanel
              id="secondary"
              defaultSize={secondaryPanelDefaultSize}
              minSize={secondaryPanelMinSize}
              groupResizeBehavior="preserve-pixel-size"
              style={{ overflow: "hidden" }}
            >
              <div
                className={cn(
                  "h-full flex flex-col min-h-0",
                  secondaryPanelClassName,
                )}
              >
                {secondaryPanel}
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    ) : (
      children
    );

  const bodyContent = isDeprecated ? (
    <div className="h-full flex flex-col min-h-0">
      <DeprecationBanner
        replacedBy={deprecation?.replacedBy}
        note={deprecation?.note}
      />
      <div className="flex-1 min-h-0">{innerBody}</div>
    </div>
  ) : (
    innerBody
  );

  const hasZonedFooter = footerLeft || footerCenter || footerRight;
  const hasFooter = footer || hasZonedFooter;

  // Zoned trio — reused by both variants. In "bar" the wrapper is itself a flex
  // row so the trio drops in as direct children; in "rich" the wrapper is a
  // plain block, so the trio gets its own flex row to keep the left/center/right
  // layout (rich is normally used with a single `footer` node, though).
  const zonedFooter = (
    <>
      <div className="flex items-center gap-1 shrink-0">{footerLeft}</div>
      <div className="flex-1 flex items-center justify-center gap-1">
        {footerCenter}
      </div>
      <div className="flex items-center gap-1 shrink-0">{footerRight}</div>
    </>
  );

  const footerBar = hasFooter ? (
    <div
      className={cn(
        // Always: detach from scroll + separate from the body with a top border.
        "shrink-0 border-t border-border/50",
        WINDOW_CHROME_INTERACTIVE,
        footerVariant === "bar" &&
          // Compact metadata-bar chrome — thin chips, tiny buttons/icons. Crushes
          // rich content; consumers with a composer/input bar pass footerVariant="rich".
          "flex items-center gap-1 px-2 py-1 rounded-b-xl bg-muted/40 select-none text-xs [&_svg]:h-3 [&_svg]:w-3 [&_button]:h-5 [&_button]:text-xs",
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {footer ??
        (footerVariant === "bar" ? (
          zonedFooter
        ) : (
          <div className="flex items-center gap-1">{zonedFooter}</div>
        ))}
    </div>
  ) : null;

  // ────────────────────────────────────────────────────────────────────────
  // MOBILE — presentation varies by registry.mobilePresentation:
  //   "drawer"     → bottom-sheet (vaul) with optional nested sidebar drawer
  //   "card"       → small z-stacked floating card (utility windows)
  //   "hidden"     → do not mount on mobile at all
  //   "fullscreen" → one window at a time, fullscreen takeover (default)
  // ────────────────────────────────────────────────────────────────────────
  if (isMobile) {
    const regEntry = overlayId
      ? getStaticEntryByOverlayId(overlayId)
      : undefined;
    const mobilePresentation = regEntry?.mobilePresentation ?? "fullscreen";
    const mobileSidebarAs = regEntry?.mobileSidebarAs ?? "drawer";

    if (mobilePresentation === "hidden") {
      if (process.env.NODE_ENV !== "production" && overlayId) {
        // eslint-disable-next-line no-console
        console.warn(
          `[WindowPanel] overlay "${overlayId}" has mobilePresentation: "hidden" but was opened on mobile. Add a different mobilePresentation to its registry entry or gate opening.`,
        );
      }
      return null;
    }

    if (mobilePresentation === "drawer") {
      return (
        <MobileDrawerSurface
          isOpen={true}
          title={titleNode ?? title}
          onClose={handleClose}
          sidebar={sidebar}
          sidebarAs={mobileSidebarAs}
          footer={footerBar}
          actionsLeft={actionsLeft}
          actionsRight={resolvedActionsRight}
          bodyClassName={bodyClassName}
        >
          {children}
        </MobileDrawerSurface>
      );
    }

    if (mobilePresentation === "card") {
      return (
        <MobileCardSurface
          isOpen={true}
          title={titleNode ?? title}
          onClose={handleClose}
          footer={footerBar}
          actionsRight={resolvedActionsRight}
          bodyClassName={bodyClassName}
        >
          {children}
        </MobileCardSurface>
      );
    }

    // mobilePresentation === "fullscreen" — legacy behavior (default).
    const mobileBody =
      hasSidebar && activePaneMobile === "sidebar" ? (
        <div className={cn("h-full overflow-y-auto", sidebarClassName)}>
          {sidebar}
        </div>
      ) : (
        children
      );

    const mobileEl = (
      <div
        className={cn(
          "fixed inset-0 flex flex-col",
          "bg-card/98 backdrop-blur-md",
          "overflow-hidden",
          deprecatedRingClass,
          className,
        )}
        style={{
          top: "var(--header-height)",
          zIndex,
          display: isTopWindow && !isMinimized ? undefined : "none",
          visibility: windowsHidden ? "hidden" : undefined,
        }}
        onPointerDown={onFocus}
      >
        <MobileWindowHeader
          title={titleNode ?? title}
          actionsRight={resolvedActionsRight}
          onMinimize={onMinimize}
          onClose={handleClose}
          hasSidebar={hasSidebar}
          activePaneMobile={activePaneMobile}
          onSetActivePane={setActivePaneMobile}
        />
        {isDebugMode && <DebugStrip rect={rect} zIndex={zIndex} />}
        <div className={cn("flex-1 overflow-auto min-h-0", bodyClassName)}>
          {mobileBody}
        </div>
        {footerBar}
      </div>
    );
    return portalTarget ? createPortal(mobileEl, portalTarget) : null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // POPPED OUT — content is rendered into a separate browser window via
  // PopoutPortal. The same WindowPanel component instance covers both
  // docked and popped-out states, so React state, refs, effects, Redux
  // subscriptions, and Supabase realtime channels all survive the transition
  // with no remount.
  //
  // The OS / browser frame provides close + minimize at the window-manager
  // level, so we render `PopoutTopBar` (no traffic lights) instead of the
  // standard `header`. The "Dock" button in PopoutTopBar dispatches
  // `dockWindow`, which clears the popout state and triggers the
  // `usePopoutWindow` lifecycle to close the actual browser window.
  // ────────────────────────────────────────────────────────────────────────
  if (popoutMode !== null) {
    return (
      <PopoutPortal windowId={id}>
        <div className="h-full w-full flex flex-col bg-card text-foreground">
          <PopoutTopBar
            title={titleNode ?? title}
            actionsRight={resolvedActionsRight}
            onDock={handleDockBack}
          />
          {isDebugMode && <DebugStrip rect={rect} zIndex={zIndex} />}
          <div className={cn("flex-1 overflow-auto min-h-0", bodyClassName)}>
            {bodyContent}
          </div>
          {footerBar}
        </div>
      </PopoutPortal>
    );
  }

  if (isMaximized) {
    const el = (
      <div
        className={cn(
          "fixed inset-0 flex flex-col",
          "bg-card/98 backdrop-blur-md border border-border shadow-2xl",
          "overflow-hidden",
          motionStyles.enter,
          deprecatedRingClass,
          className,
        )}
        style={{ zIndex, visibility: windowsHidden ? "hidden" : undefined }}
        onPointerDown={onFocus}
      >
        {header}
        <div className={cn("flex-1 overflow-auto", bodyClassName)}>
          {bodyContent}
        </div>
        {footerBar}
      </div>
    );
    return portalTarget ? createPortal(el, portalTarget) : null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // WINDOWED + MINIMIZED — same shell, with the minimized rect supplied by
  // Redux. The full body unmounts after the one-shot offscreen capture; the
  // lightweight semantic/snapshot preview occupies the remaining card body.
  // ────────────────────────────────────────────────────────────────────────
  const el = (
    <div
      ref={fitContent ? fitContentRef : undefined}
      className={cn(
        "fixed overflow-visible",
        motionStyles.enter,
        // Programmatic rect changes glide; pointer drag/resize stays 1:1.
        !isInteracting && motionStyles.glide,
        // Drag-out candidate: ring-2 highlight signals "release here to pop out".
        isPopoutCandidate &&
          "ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow",
        deprecatedRingClass,
        className,
      )}
      style={{
        left: rect.x,
        top: rect.y,
        ...(fitContent && !isMinimized
          ? { width: "max-content", height: "auto" }
          : { width: rect.width, height: rect.height }),
        zIndex,
        // Cap CSS mins to the current rect so arrange/snap geometry wins.
        // Uncapped minWidth (e.g. 640) was overriding tile widths and stacking
        // every left-edge window on top of each other.
        minWidth: isMinimized
          ? 0
          : fitContent
            ? (minWidth ?? 180)
            : Math.min(minWidth ?? 180, rect.width),
        minHeight: isMinimized
          ? 0
          : fitContent
            ? (minHeight ?? 80)
            : Math.min(minHeight ?? 80, rect.height),
        visibility: windowsHidden ? "hidden" : undefined,
      }}
      onPointerDown={onFocus}
    >
      {!isMinimized &&
        HANDLES.map((h) => (
          <div
            key={h.edge}
            className={cn(
              h.className,
              "z-50 hover:bg-primary/20 transition-colors",
            )}
            style={{ touchAction: "none" }}
            onPointerDown={onResizeStart(h.edge)}
          />
        ))}
      <div
        className={cn(
          "flex h-full w-full min-h-0 flex-col",
          "rounded-xl bg-card/95 backdrop-blur-md border border-border shadow-xl",
          "overflow-hidden",
        )}
      >
        {header}

        {/* Debug strip — shown in the body when open, or in the minimized shell */}
        {isDebugMode && <DebugStrip rect={rect} zIndex={zIndex} />}

        {(!isMinimized || pendingTrayCapture) && (
          <WindowPanelBodyShell
            bodyRef={bodyRef}
            fitContent={fitContent}
            bodyClassName={bodyClassName}
            captureDimensions={
              isMinimized && pendingTrayCapture
                ? {
                    width: pendingTrayCapture.width,
                    height: pendingTrayCapture.height,
                  }
                : null
            }
          >
            {bodyContent}
          </WindowPanelBodyShell>
        )}

        {/* Minimized: fill the empty shell body with the canonical tray preview
            (registry custom / snapshot / default). Click anywhere to restore. */}
        {isMinimized && (
          <MinimizedWindowContent
            registryKey={trayRegistryKey}
            snapshotKey={id}
            overlayInstanceId={overlayInstanceId}
            title={minimizedTitle}
            onRestore={handleRestoreClearingSnapshot}
          />
        )}

        {!isMinimized && footerBar}

        {/* Drag-out ghost label — overlays the body during the candidate dwell.
            Pointer-events:none so it doesn't interfere with the in-progress drag. */}
        {isPopoutCandidate && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium shadow-lg">
              Release to pop out
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return portalTarget ? createPortal(el, portalTarget) : null;
}

// DebugStrip extracted to ./WindowPanel/DebugStrip.tsx (Phase 6).

// ─── WindowHeader ─────────────────────────────────────────────────────────────

function PopOutHeaderButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="p-0.5 rounded hover:bg-accent/60 transition-colors text-foreground/60 hover:text-foreground cursor-pointer"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      title="Pop out into a separate window"
      aria-label="Pop out into a separate window"
    >
      <ExternalLink className="w-3.5 h-3.5" />
    </button>
  );
}

interface WindowHeaderProps {
  title?: React.ReactNode;
  minimizedTitle: string;
  actionsLeft?: React.ReactNode;
  actionsRight?: React.ReactNode;
  onDragStart: (e: React.PointerEvent) => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onRestore: () => void;
  onClose?: () => void;
  isMaximized: boolean;
  isMinimized: boolean;
  snapLeft: () => void;
  snapRight: () => void;
  snapTop: () => void;
  snapBottom: () => void;
  snapCentre: () => void;
  arrangeAll: (layout: GlobalLayoutType) => void;
  hasSidebar: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  /** When set, a "Save Window State" button appears in the green traffic-light dropdown. */
  onSaveWindowState?: () => void;
  /**
   * When set, a header pop-out icon and green-dropdown entry are shown.
   * Clicking opens the window in a separate browser window.
   */
  onPopOut?: () => void;
}

function WindowHeader({
  title,
  minimizedTitle,
  actionsLeft,
  actionsRight,
  onDragStart,
  onMinimize,
  onToggleMaximize,
  onRestore,
  onClose,
  isMaximized,
  isMinimized,
  snapLeft,
  snapRight,
  snapTop,
  snapBottom,
  snapCentre,
  arrangeAll,
  hasSidebar,
  sidebarOpen,
  onToggleSidebar,
  onSaveWindowState,
  onPopOut,
}: WindowHeaderProps) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-between gap-1 px-2 py-1.5 min-h-[26px] z-20 shrink-0",
        "border-b border-border/50 bg-muted/40 select-none",
        isMaximized ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        isMinimized && "h-8 min-h-8 py-0 border-b border-border/50",
      )}
      data-window-panel-state={isMinimized ? "minimized" : undefined}
      style={isMaximized ? undefined : { touchAction: "none" }}
      onPointerDown={isMaximized ? undefined : onDragStart}
    >
      {/* macOS-style hot zone: absolutely positioned to cover the full
          left side of the header (top-to-bottom, no padding). The traffic
          lights and sidebar toggle live inside it so CSS group-hover/tl
          reveals all icons when the cursor enters the zone. */}
      <div
        className={cn(
          "group/tl absolute top-0 left-0 bottom-0 flex items-center z-20",
          hasSidebar ? "w-28" : "w-24",
        )}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="pl-2">
          <TrafficLightGroup
            isMinimized={isMinimized}
            isMaximized={isMaximized}
            onClose={onClose}
            onMinimize={onMinimize}
            onRestore={onRestore}
            onToggleMaximize={onToggleMaximize}
            snapLeft={snapLeft}
            snapRight={snapRight}
            snapTop={snapTop}
            snapBottom={snapBottom}
            snapCentre={snapCentre}
            arrangeAll={arrangeAll}
            hasSidebar={hasSidebar}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={onToggleSidebar}
            onSaveWindowState={onSaveWindowState}
            onPopOut={onPopOut}
          />
        </div>
      </div>

      <div className="flex items-center gap-1 z-10 shrink-0">
        {/* Spacer matching the hot zone width so left actions don't overlap */}
        <div className={hasSidebar ? "w-28" : "w-24"} />

        {/* Left action zone */}
        {!isMinimized && actionsLeft && (
          <div
            className={WINDOW_CHROME_ACTIONS}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {actionsLeft}
          </div>
        )}
      </div>

      {/* Open titles stay centered and may be interactive. Minimized titles use
          the fixed plain-text branch and can never inherit consumer typography
          or interaction from a rich titleNode. */}
      <div
        className={cn(
          "absolute top-0 bottom-0 flex items-center pointer-events-none",
          isMinimized
            ? "left-20 right-2 justify-start"
            : "inset-x-0 justify-center",
        )}
      >
        {isMinimized ? (
          <span
            className="block min-w-0 truncate text-[11px] leading-none font-semibold text-foreground/80"
            data-minimized-window-title
          >
            {minimizedTitle}
          </span>
        ) : typeof title === "string" || title == null ? (
          <span className="text-xs font-medium text-foreground/80 truncate px-16">
            {title ?? ""}
          </span>
        ) : (
          <div
            className="pointer-events-auto max-w-full px-16 flex items-center"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {title}
          </div>
        )}
      </div>

      {/* Right action zone */}
      <div className="flex items-center gap-1 z-10 shrink-0">
        {!isMinimized && (onPopOut || actionsRight) && (
          <div
            className={WINDOW_CHROME_ACTIONS}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {onPopOut ? <PopOutHeaderButton onClick={onPopOut} /> : null}
            {actionsRight}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TrafficLightGroup ────────────────────────────────────────────────────────
// Nested inside the group/tl hot zone — icon reveal uses CSS group-hover/tl.

interface TrafficLightGroupProps {
  isMinimized: boolean;
  isMaximized: boolean;
  onClose?: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  onToggleMaximize: () => void;
  snapLeft: () => void;
  snapRight: () => void;
  snapTop: () => void;
  snapBottom: () => void;
  snapCentre: () => void;
  arrangeAll: (layout: GlobalLayoutType) => void;
  hasSidebar: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSaveWindowState?: () => void;
  onPopOut?: () => void;
}

function TrafficLightGroup({
  isMinimized,
  isMaximized,
  onClose,
  onMinimize,
  onRestore,
  onToggleMaximize,
  snapLeft,
  snapRight,
  snapTop,
  snapBottom,
  snapCentre,
  arrangeAll,
  hasSidebar,
  sidebarOpen,
  onToggleSidebar,
  onSaveWindowState,
  onPopOut,
}: TrafficLightGroupProps) {
  return (
    <div className="flex items-center gap-1.5 shrink-0 cursor-default">
      {/* Red — Close */}
      <TrafficLight
        color="red"
        icon={
          <X className="w-2 h-2 stroke-[3.5]" style={{ color: "#000000" }} />
        }
        onClick={onClose ?? undefined}
        disabled={!onClose}
        aria-label="Close"
      />

      {/* Yellow — Minimize / restore */}
      <TrafficLight
        color="yellow"
        icon={
          isMinimized ? (
            <Maximize2
              className="w-2 h-2 stroke-[3.5]"
              style={{ color: "#000000" }}
            />
          ) : (
            <Minus
              className="w-2 h-2 stroke-[3.5]"
              style={{ color: "#000000" }}
            />
          )
        }
        onClick={isMinimized ? onRestore : onMinimize}
        aria-label={isMinimized ? "Restore" : "Minimize"}
      />

      {/* Green — Maximize / dropdown */}
      <GreenTrafficLight
        isMaximized={isMaximized}
        onToggleMaximize={onToggleMaximize}
        onRestore={onRestore}
        snapLeft={snapLeft}
        snapRight={snapRight}
        snapTop={snapTop}
        snapBottom={snapBottom}
        snapCentre={snapCentre}
        arrangeAll={arrangeAll}
        onSaveWindowState={onSaveWindowState}
        onPopOut={onPopOut}
      />

      {/* Sidebar toggle — sits tight next to the traffic lights */}
      {hasSidebar && !isMinimized && (
        <button
          type="button"
          className="ml-0.5 p-0.5 rounded hover:bg-accent/60 transition-colors text-foreground/60 group-hover/tl:text-foreground cursor-pointer"
          onClick={onToggleSidebar}
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-3.5 h-3.5" />
          ) : (
            <PanelLeft className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

// ─── TrafficLight (red / yellow) ─────────────────────────────────────────────

interface TrafficLightProps {
  color: "red" | "yellow";
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  "aria-label"?: string;
}

function TrafficLight({
  color,
  icon,
  onClick,
  disabled,
  "aria-label": label,
}: TrafficLightProps) {
  const base =
    "w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors shrink-0 relative";
  const colours =
    color === "red"
      ? disabled
        ? "bg-zinc-500 cursor-default"
        : "bg-red-500 hover:bg-red-400 cursor-pointer"
      : "bg-yellow-400 hover:bg-yellow-300 cursor-pointer";

  return (
    <button
      type="button"
      className={cn(base, colours)}
      onClick={disabled ? undefined : onClick}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={label}
      disabled={disabled}
    >
      <span
        className={cn(
          "opacity-0 transition-opacity duration-100",
          !disabled && "group-hover/tl:opacity-100",
        )}
      >
        {icon}
      </span>
    </button>
  );
}

// ─── GreenTrafficLight (with dropdown) ───────────────────────────────────────

interface GreenTrafficLightProps {
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onRestore: () => void;
  snapLeft: () => void;
  snapRight: () => void;
  snapTop: () => void;
  snapBottom: () => void;
  snapCentre: () => void;
  arrangeAll: (layout: GlobalLayoutType) => void;
  onSaveWindowState?: () => void;
  /** When set, renders a "Pop out" entry that opens the window in a separate browser window. */
  onPopOut?: () => void;
}

function GreenTrafficLight({
  isMaximized,
  onToggleMaximize,
  onRestore,
  snapLeft,
  snapRight,
  snapTop,
  snapBottom,
  snapCentre,
  arrangeAll,
  onSaveWindowState,
  onPopOut,
}: GreenTrafficLightProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const openDropdown = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setDropdownOpen(true);
  };
  const scheduleClose = () => {
    leaveTimer.current = setTimeout(() => {
      setDropdownOpen(false);
    }, 120);
  };

  const handleAction = (fn: () => void) => {
    fn();
    setDropdownOpen(false);
  };

  // Close dropdown when tapping outside — skip Radix portal targets
  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const onPointerOutside = (e: PointerEvent) => {
      const target = e.target as Element;
      if (containerRef.current && !containerRef.current.contains(target)) {
        if (target.closest?.("[data-radix-portal]")) return;
        setDropdownOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerOutside);
    return () => document.removeEventListener("pointerdown", onPointerOutside);
  }, [dropdownOpen]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={openDropdown}
      onMouseLeave={scheduleClose}
    >
      {/* The dot — click toggles maximize on mouse, tap opens dropdown on touch */}
      <button
        type="button"
        className={cn(
          "w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors shrink-0",
          "bg-green-500 hover:bg-green-400 cursor-pointer",
        )}
        onClick={(e) => {
          // On touch devices, open the dropdown instead of immediately maximizing.
          // Touch has no hover, so this is the only way to access snap/arrange options.
          if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
            setDropdownOpen((prev) => !prev);
          } else {
            handleAction(onToggleMaximize);
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={isMaximized ? "Restore" : "Maximize"}
      >
        <span className="opacity-0 group-hover/tl:opacity-100 transition-opacity duration-100 flex items-center justify-center relative w-full h-full">
          {isMaximized ? (
            <Minimize2
              className="w-2 h-2 stroke-[3.5] absolute"
              style={{ color: "#000000" }}
            />
          ) : (
            <Maximize2
              className="w-2 h-2 stroke-[3.5] absolute"
              style={{ color: "#000000" }}
            />
          )}
        </span>
      </button>

      {/* Dropdown */}
      {dropdownOpen && (
        <div
          className={cn(
            "absolute left-0 top-full mt-1.5 z-50",
            "w-52 rounded-xl overflow-hidden",
            "bg-card/95 backdrop-blur-xl border border-border shadow-2xl",
            "py-1 text-xs",
          )}
          onMouseEnter={openDropdown}
          onMouseLeave={scheduleClose}
        >
          {/* Move & Resize section */}
          {!isMaximized && (
            <>
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                Move &amp; Resize
              </div>
              <div className="flex flex-col gap-1 px-2 pb-2">
                <div className="flex gap-1 justify-center">
                  <LayoutIconButton
                    onClick={() => handleAction(snapLeft)}
                    type="left-half"
                  />
                  <LayoutIconButton
                    onClick={() => handleAction(snapRight)}
                    type="right-half"
                  />
                  <LayoutIconButton
                    onClick={() => handleAction(snapTop)}
                    type="top-half"
                  />
                  <LayoutIconButton
                    onClick={() => handleAction(snapBottom)}
                    type="bottom-half"
                  />
                </div>
                <div className="flex gap-1 justify-center">
                  <LayoutIconButton
                    onClick={() => handleAction(snapCentre)}
                    type="centre"
                  />
                  <LayoutIconButton
                    onClick={() => handleAction(onToggleMaximize)}
                    type="full"
                  />
                </div>
              </div>
              <div className="border-t border-border/50 my-1" />

              <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                Arrange All
              </div>
              <div className="flex flex-col gap-1 px-2 pb-2">
                <div className="flex gap-1 justify-center">
                  <LayoutIconButton
                    onClick={() => handleAction(() => arrangeAll("grid4"))}
                    type="grid4"
                  />
                  <LayoutIconButton
                    onClick={() => handleAction(() => arrangeAll("grid6"))}
                    type="grid6"
                  />
                  <LayoutIconButton
                    onClick={() => handleAction(() => arrangeAll("grid8"))}
                    type="grid8"
                  />
                  <LayoutIconButton
                    onClick={() => handleAction(() => arrangeAll("grid9"))}
                    type="grid9"
                  />
                  <LayoutIconButton
                    onClick={() => handleAction(() => arrangeAll("grid12"))}
                    type="grid12"
                  />
                </div>
                <div className="flex gap-1 justify-center">
                  <LayoutIconButton
                    onClick={() =>
                      handleAction(() => arrangeAll("stackRight2"))
                    }
                    type="stackRight2"
                  />
                  <LayoutIconButton
                    onClick={() =>
                      handleAction(() => arrangeAll("stackRight3"))
                    }
                    type="stackRight3"
                  />
                  <LayoutIconButton
                    onClick={() =>
                      handleAction(() => arrangeAll("stackRight4"))
                    }
                    type="stackRight4"
                  />
                  <LayoutIconButton
                    onClick={() =>
                      handleAction(() => arrangeAll("stackRight5"))
                    }
                    type="stackRight5"
                  />
                </div>
                <div className="flex gap-1 justify-center">
                  <LayoutIconButton
                    onClick={() => handleAction(() => arrangeAll("stackLeft2"))}
                    type="stackLeft2"
                  />
                  <LayoutIconButton
                    onClick={() => handleAction(() => arrangeAll("stackLeft3"))}
                    type="stackLeft3"
                  />
                  <LayoutIconButton
                    onClick={() => handleAction(() => arrangeAll("stackLeft4"))}
                    type="stackLeft4"
                  />
                  <LayoutIconButton
                    onClick={() => handleAction(() => arrangeAll("stackLeft5"))}
                    type="stackLeft5"
                  />
                </div>
              </div>
              <div className="border-t border-border/50 my-1" />
            </>
          )}

          {/* Full Screen */}
          <button
            type="button"
            className="flex items-center gap-2.5 w-full px-3 py-1.5 hover:bg-accent transition-colors text-foreground/80"
            onClick={() => handleAction(onToggleMaximize)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isMaximized ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 shrink-0" /> Exit Full Screen
              </>
            ) : (
              <>
                <RectangleVertical className="w-3.5 h-3.5 shrink-0" /> Enter
                Full Screen
              </>
            )}
          </button>

          {isMaximized && (
            <button
              type="button"
              className="flex items-center gap-2.5 w-full px-3 py-1.5 hover:bg-accent transition-colors text-foreground/80"
              onClick={() => handleAction(onRestore)}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Maximize2 className="w-3.5 h-3.5 shrink-0" />
              Restore window
            </button>
          )}

          {/* Pop out — opens the window in a separate browser window.
              The popout hook chooses Document Picture-in-Picture (frameless,
              always-on-top) when available and the slot is free; otherwise
              falls back to a regular browser window so multiple popouts
              never interfere with each other. Hidden entirely when popout
              is unavailable (mobile / unsupported browser / already out). */}
          {onPopOut && (
            <>
              <div className="border-t border-border/50 my-1" />
              <button
                type="button"
                className="flex items-center gap-2.5 w-full px-3 py-1.5 transition-colors text-foreground/80 hover:bg-accent"
                onClick={() => handleAction(onPopOut)}
                onPointerDown={(e) => e.stopPropagation()}
                title="Pop out into a separate window"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 text-left">Pop out</span>
              </button>
            </>
          )}

          {/* Save Window State — only shown when the window is persistable */}
          {onSaveWindowState && (
            <>
              <div className="border-t border-border/50 my-1" />
              <button
                type="button"
                className="flex items-center gap-2.5 w-full px-3 py-1.5 hover:bg-accent transition-colors text-foreground/80"
                onClick={() => handleAction(onSaveWindowState)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Save className="w-3.5 h-3.5 shrink-0" />
                Save window state
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// MobileWindowHeader extracted to ./WindowPanel/MobileHeader.tsx (Phase 6).

// SnapButton extracted to ./WindowPanel/SnapButton.tsx (Phase 6).

export default WindowPanel;

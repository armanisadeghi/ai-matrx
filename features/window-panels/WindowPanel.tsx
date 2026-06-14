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
import { MobileWindowHeader } from "./WindowPanel/MobileHeader";
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
import { usePopoutWindow } from "./popout/usePopoutWindow";
import { registerPopoutOpener } from "./popout/usePopoutControl";
import { PopoutPortal } from "./popout/PopoutPortal";
import { PopoutTopBar } from "./WindowPanel/PopoutTopBar";
import {
  setTraySnapshot,
  clearTraySnapshot,
} from "./WindowTray/traySnapshotMap";

// ─── Resize handle descriptors ───────────────────────────────────────────────

interface HandleDef {
  edge: ResizeEdge;
  className: string;
}

const HANDLES: HandleDef[] = [
  {
    edge: "e",
    className: "absolute right-0 top-2 bottom-2 w-1.5 cursor-ew-resize",
  },
  {
    edge: "w",
    className: "absolute left-0 top-2 bottom-2 w-1.5 cursor-ew-resize",
  },
  {
    edge: "s",
    className: "absolute bottom-0 left-2 right-2 h-1.5 cursor-ns-resize",
  },
  {
    edge: "n",
    className: "absolute top-0 left-2 right-2 h-1.5 cursor-ns-resize",
  },
  {
    edge: "se",
    className: "absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize",
  },
  {
    edge: "sw",
    className: "absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize",
  },
  {
    edge: "ne",
    className: "absolute top-0 right-0 w-3 h-3 cursor-nesw-resize",
  },
  { edge: "nw", className: "absolute top-0 left-0 w-3 h-3 cursor-nwse-resize" },
];

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
  /** Content rendered in a full-width footer bar below the body. Renders as a single flex row. For zoned layout, use footerLeft/footerCenter/footerRight instead. */
  footer?: React.ReactNode;
  /** Left-aligned footer content (use instead of `footer` for zoned layout) */
  footerLeft?: React.ReactNode;
  /** Center-aligned footer content */
  footerCenter?: React.ReactNode;
  /** Right-aligned footer content */
  footerRight?: React.ReactNode;
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
   * When provided, WindowPanel calls this just before minimizing and stores
   * the resulting data URL so the tray chip can show a thumbnail.
   * Pass this from the window component if it implements custom capture logic.
   */
  captureTraySnapshot?: (bodyEl: HTMLElement) => Promise<string | null>;
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
  footer,
  footerLeft,
  footerCenter,
  footerRight,
  fitContent = false,
  overlayId,
  onCollectData,
  onSessionSaved,
  onHeavySnapshot,
  captureTraySnapshot,
  ...hookOpts
}: WindowPanelProps) {
  // ── Pre-compute id and popout capabilities BEFORE useWindowPanel so we
  //    can pass `onTriggerPopout` to the drag-detection logic. The id is
  //    derived the same way useWindowPanel does internally (`opts.id ?? useId()`).
  const reactId = useId();
  const id = hookOpts.id ?? reactId;
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
    if (!overlayId) return;
    const entry = getStaticEntryByOverlayId(overlayId);
    if (!entry || (!entry.autosave && !entry.heavySnapshot)) return;
    if (entry.ephemeral) return;

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
    if (!fitContent || isMobile) return;
    const el = fitContentRef.current;
    if (!el) return;
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
    if (!overlayId) return;
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
    (layout: any) => {
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
    dispatch(dockWindow(id));
  }, [dispatch, id]);

  // ── Tray snapshot capture (Pass 3 / Mode D) ──────────────────────────────
  // When a window is about to be minimized, capture a thumbnail of the body
  // via the registry's `captureTraySnapshot` callback (if provided). The
  // capture must happen BEFORE the minimize dispatch, while the body is
  // still rendered at full size.
  //
  // Snapshot is stored in a module-level map (`traySnapshotMap`) which the
  // tray chip subscribes to. Cleared on restore + on unmount so a future
  // minimize captures fresh state.
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const handleMinimize = useCallback(() => {
    // Fire-and-forget the snapshot capture — don't block the minimize. The
    // chip shows a fallback (italic title) while waiting for the data URL.
    const bodyEl = bodyRef.current;
    if (captureTraySnapshot && bodyEl) {
      void captureTraySnapshot(bodyEl)
        .then((dataUrl) => {
          if (dataUrl) setTraySnapshot(id, dataUrl);
        })
        .catch((err) => {
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.warn(
              `[WindowPanel] captureTraySnapshot threw for "${id}":`,
              err,
            );
          }
        });
    }
    onMinimize();
  }, [id, captureTraySnapshot, onMinimize]);

  const handleRestoreClearingSnapshot = useCallback(() => {
    // Clear snapshot so the next minimize captures fresh state.
    clearTraySnapshot(id);
    onRestore();
  }, [id, onRestore]);

  // Clear any lingering snapshot on unmount.
  useEffect(() => {
    return () => {
      clearTraySnapshot(id);
    };
  }, [id]);

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

  // ── Header (shared across all states) ───────────────────────────────────
  const header = (
    <WindowHeader
      title={titleNode ?? title}
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
  const innerBody = hasSidebar ? (
    <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
      <ResizablePanel
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
      <ResizablePanel minSize={200}>{children}</ResizablePanel>
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

  const footerBar = hasFooter ? (
    <div
      className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-b-xl border-t border-border/50 bg-muted/40 select-none text-xs [&_svg]:h-3 [&_svg]:w-3 [&_button]:h-5 [&_button]:text-xs"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {footer ?? (
        <>
          <div className="flex items-center gap-1 shrink-0">{footerLeft}</div>
          <div className="flex-1 flex items-center justify-center gap-1">
            {footerCenter}
          </div>
          <div className="flex items-center gap-1 shrink-0">{footerRight}</div>
        </>
      )}
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
  // WINDOWED + MINIMIZED — same shell, minimized just has a tiny rect from
  // Redux (set by minimizeWindow) so no body content is visible.
  // The body is still rendered (keeps state alive) but clipped by overflow.
  // ────────────────────────────────────────────────────────────────────────
  const el = (
    <div
      ref={fitContent ? fitContentRef : undefined}
      className={cn(
        "fixed flex flex-col",
        "rounded-xl bg-card/95 backdrop-blur-md border border-border shadow-xl",
        "overflow-hidden",
        // Drag-out candidate: ring-2 highlight signals "release here to pop out".
        // Uses primary color from the design tokens so it adapts to theme.
        isPopoutCandidate &&
          "ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow",
        // Deprecation marker: red ring around the shell. Stays even when the
        // banner inside is dismissed, so the visual cue is persistent.
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
        minWidth: isMinimized ? 0 : (minWidth ?? 180),
        minHeight: isMinimized ? 0 : (minHeight ?? 80),
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
              "z-10 hover:bg-primary/20 transition-colors",
            )}
            style={{ touchAction: "none" }}
            onPointerDown={onResizeStart(h.edge)}
          />
        ))}
      {header}

      {/* Debug strip — shown in the body when open, or in the minimized shell */}
      {isDebugMode && <DebugStrip rect={rect} zIndex={zIndex} />}

      {!isMinimized && (
        <div
          ref={bodyRef}
          className={cn(
            fitContent ? "overflow-visible" : "flex-1 overflow-auto min-h-0",
            bodyClassName,
          )}
        >
          {bodyContent}
        </div>
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
  );

  return portalTarget ? createPortal(el, portalTarget) : null;
}

// DebugStrip extracted to ./WindowPanel/DebugStrip.tsx (Phase 6).

// ─── WindowHeader ─────────────────────────────────────────────────────────────

interface WindowHeaderProps {
  title?: React.ReactNode;
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
  arrangeAll: (layout: any) => void;
  hasSidebar: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  /** When set, a "Save Window State" button appears in the green traffic-light dropdown. */
  onSaveWindowState?: () => void;
  /**
   * When set, a "Pop out" entry appears in the green traffic-light dropdown.
   * Clicking it should open the window in a separate browser window
   * (Document Picture-in-Picture or `window.open` fallback). The actual
   * lifecycle is owned by `usePopoutWindow`; this prop is the click hook.
   * Hidden entirely on mobile and when no popout capability is available.
   */
  onPopOut?: () => void;
}

function WindowHeader({
  title,
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
        isMinimized && "border-b-0",
      )}
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
            className="flex items-center gap-0.5 shrink-0 text-foreground/80 [&_svg]:text-foreground/80"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {actionsLeft}
          </div>
        )}
      </div>

      {/* Absolute Centered title — always visible, including when minimized.
          The outer wrapper keeps pointer-events-none so string titles don't
          block the draggable header behind them. For interactive title nodes
          (e.g. a dropdown), we re-enable pointer events on an inner wrapper
          and stop pointer-down from initiating a window drag. */}
      <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center pointer-events-none">
        {typeof title === "string" || title == null ? (
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
        {!isMinimized && actionsRight && (
          <div
            className="flex items-center gap-0.5 shrink-0 text-foreground/80 [&_svg]:text-foreground/80"
            onPointerDown={(e) => e.stopPropagation()}
          >
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
  arrangeAll: (layout: any) => void;
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
          className="ml-0.5 p-0.5 rounded hover:bg-accent/60 transition-colors text-foreground/60 group-hover/tl:text-foreground"
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
  arrangeAll: (layout: any) => void;
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
    if (!dropdownOpen) return;
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

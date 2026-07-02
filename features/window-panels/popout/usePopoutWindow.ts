"use client";

/**
 * usePopoutWindow — lifecycle hook owning the Document Picture-in-Picture
 * (or `window.open` fallback) browser-window for a single window-panel.
 *
 * **Critical user-gesture constraint:** `documentPictureInPicture.requestWindow()`
 * and `window.open()` both require a synchronous user-gesture stack
 * (mouseup, click, keydown). The hook exposes `openPopout()` as a plain
 * imperative method so the caller can invoke it directly inside the
 * `pointerup` handler that detects a drag-out — *not* via `useEffect`,
 * which would lose the gesture chain and be rejected by the browser.
 *
 * **Order of operations:** open the OS window FIRST (synchronously), then
 * dispatch `popOutWindow` to Redux only after the window resolves. If we
 * dispatched first, `WindowPanel` would re-render mid-open with a null
 * portal target and visibly flicker.
 *
 * **Close handling:** the canonical close trigger is the popout's
 * `pagehide` event, which fires for both user-clicked-X and programmatic
 * `.close()` calls. The hook idempotently disposes styles, clears the
 * map entry, and dispatches `dockWindow`.
 *
 * **Dock-back from inside popout content:** `WindowPanel`'s "Dock" button
 * dispatches `dockWindow` directly. The hook's `useEffect` watching
 * `popoutMode` sees the transition to `null`, calls `pipWin.close()`, and
 * the `pagehide` handler fires (idempotent, so calling `dockWindow` again
 * is a Redux no-op).
 */
import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "sonner";
import {
  popOutWindow,
  dockWindow,
  selectActivePipWindowId,
  selectPopoutMode,
} from "@/lib/redux/slices/windowManagerSlice";
import {
  detectPopoutCapability,
  type WindowWithDocumentPictureInPicture,
} from "./featureDetection";
import {
  setPopoutWindow,
  deletePopoutWindow,
  getPopoutWindow,
} from "./popoutWindowMap";
import { cloneStylesIntoDocument } from "./cloneStyles";
import { markPopoutPending, clearPopoutPending } from "./popoutPendingStorage";
import { buildDockWindowPayload } from "./dockWindowPayload";

export interface OpenPopoutOptions {
  width: number;
  height: number;
  title: string;
}

export type OpenPopoutResult =
  | { ok: true; mode: "pip" | "popup" }
  | {
      ok: false;
      reason:
        "pip-slot-taken" | "popup-blocked" | "no-capability" | "request-failed";
    };

export interface UsePopoutWindowReturn {
  /**
   * Open a popout for this window. MUST be called synchronously inside a
   * user-gesture handler (pointerup, click, keydown) — otherwise the browser
   * rejects the request.
   */
  openPopout(opts: OpenPopoutOptions): Promise<OpenPopoutResult>;
  /**
   * Programmatically close the popout. Triggers the same cleanup path as
   * the user clicking the browser X button. Safe to call when there's no
   * popout open.
   */
  close(): void;
}

export function usePopoutWindow(windowId: string): UsePopoutWindowReturn {
  const dispatch = useAppDispatch();
  const popoutMode = useAppSelector(selectPopoutMode(windowId));
  const activePipWindowId = useAppSelector(selectActivePipWindowId);

  // Hold style-cleanup for this window's popout. Disposed on close.
  const stylesDisposeRef = useRef<(() => void) | null>(null);

  /**
   * Idempotent close handler. Called from:
   *  - `pagehide` (browser X click, programmatic close, parent navigation)
   *  - `close()` (programmatic from this hook)
   *  - the dock-watch effect (Redux popoutMode → null while window exists)
   */
  const handleClose = useCallback(() => {
    const win = getPopoutWindow(windowId);
    if (!win && process.env.NODE_ENV !== "production") {
      // No window registered — handleClose was triggered after we already
      // cleaned up. Idempotent: just ensure Redux is consistent.
    }
    stylesDisposeRef.current?.();
    stylesDisposeRef.current = null;
    deletePopoutWindow(windowId);
    // Clear the recovery flag — we're docked now, no recovery needed.
    clearPopoutPending(windowId);
    // Dispatch dockWindow if Redux still considers us popped out. The
    // reducer is itself idempotent, so a redundant dispatch is harmless.
    dispatch(dockWindow(buildDockWindowPayload(windowId)));
    // Best-effort close. If the close was triggered by `pagehide`, the
    // window is already going away. If by `close()`, this is the action.
    try {
      win?.close();
    } catch {
      /* ignore */
    }
    if (process.env.NODE_ENV !== "production" && win) {
      // eslint-disable-next-line no-console
      console.info(`[popout] closed window for "${windowId}"`);
    }
  }, [dispatch, windowId]);

  /**
   * Open a popout. The async work happens inside a Promise the caller can
   * await, but the *first synchronous step* (DPiP / window.open) runs
   * inside the user-gesture stack as long as the caller invokes openPopout
   * directly from a user-gesture handler.
   */
  const openPopout = useCallback(
    async (opts: OpenPopoutOptions): Promise<OpenPopoutResult> => {
      const capability = detectPopoutCapability();
      if (capability === "none") {
        toast.error("Pop-out not supported", {
          description: "Your browser doesn't support floating windows.",
        });
        return { ok: false, reason: "no-capability" };
      }

      // Single-PiP-per-origin: when a different window already holds the
      // Document PiP slot, we MUST skip `requestWindow()` — calling it would
      // close the existing PiP and steal its slot (per the WICG spec). Fall
      // through to `window.open()` instead so both windows coexist
      // peacefully. The price is browser chrome on the second window.
      const slotTakenByOther =
        activePipWindowId !== null && activePipWindowId !== windowId;

      let pipWin: Window | null = null;
      let mode: "pip" | "popup" = "popup";

      // Try Document PiP only when the slot is free OR this same window
      // already owns it (idempotent re-popout).
      if (capability === "pip" && !slotTakenByOther) {
        try {
          const w = window as WindowWithDocumentPictureInPicture;
          if (w.documentPictureInPicture) {
            pipWin = await w.documentPictureInPicture.requestWindow({
              width: Math.max(200, Math.round(opts.width)),
              height: Math.max(120, Math.round(opts.height)),
            });
            mode = "pip";
          }
        } catch (err) {
          // Some failures (user dismissal, permission policy) are recoverable
          // by falling through to the popup path.
          console.warn(
            "[popout] Document PiP request failed, falling back to popup:",
            err,
          );
        }
      }

      // Fallback: window.open
      if (!pipWin) {
        const features = [
          "popup=yes",
          `width=${Math.max(200, Math.round(opts.width))}`,
          `height=${Math.max(120, Math.round(opts.height))}`,
        ].join(",");
        try {
          pipWin = window.open("", `popout-${windowId}`, features);
          mode = "popup";
        } catch (err) {
          console.error("[popout] window.open failed:", err);
        }
      }

      if (!pipWin) {
        toast.error("Pop-up blocked", {
          description:
            "Please allow pop-ups for this site to use floating windows.",
        });
        return { ok: false, reason: "popup-blocked" };
      }

      // Title for the OS chrome (DPiP shows it; popup shows it in the title bar)
      try {
        pipWin.document.title = opts.title;
      } catch {
        /* ignore */
      }

      // Clone the CSS environment + start observers
      stylesDisposeRef.current = cloneStylesIntoDocument(
        window.document,
        pipWin.document,
      ).dispose;

      // Wire close lifecycle
      pipWin.addEventListener("pagehide", handleClose, { once: true });

      // Register the window FIRST so PopoutPortal can find it on the next render
      setPopoutWindow(windowId, pipWin);

      // Persist a recovery hint so a parent reload can surface "click to
      // restore" UX. Cleared on dock-back / close in handleClose.
      markPopoutPending(windowId);

      // Dispatch Redux state — this triggers WindowPanel re-render which
      // mounts the PopoutPortal that finally renders content into pipWin.
      dispatch(popOutWindow({ id: windowId, mode }));

      if (process.env.NODE_ENV !== "production") {
        console.info(
          `[popout] opened ${mode} window for "${windowId}" (${opts.width}x${opts.height})`,
        );
      }

      return { ok: true, mode };
    },
    [activePipWindowId, dispatch, handleClose, windowId],
  );

  /** Programmatic close — triggers the same lifecycle as user-clicked-X. */
  const close = useCallback(() => {
    const win = getPopoutWindow(windowId);
    if (!win) {
      // Already closed — make sure Redux is consistent.
      dispatch(dockWindow(buildDockWindowPayload(windowId)));
      return;
    }
    // Closing the window fires `pagehide`, which runs handleClose.
    try {
      win.close();
    } catch {
      handleClose();
    }
  }, [dispatch, handleClose, windowId]);

  // ── Dock-watch: when Redux says we're docked but we still own a window,
  //    close it. This is how the in-popout "Dock" button drives cleanup.
  useEffect(() => {
    if (popoutMode === null && getPopoutWindow(windowId) !== null) {
      try {
        getPopoutWindow(windowId)?.close();
      } catch {
        handleClose();
      }
    }
  }, [popoutMode, windowId, handleClose]);

  // ── Defensive parent-unload cleanup. Document PiP auto-closes when the
  //    opener unloads, but `window.open` popups can outlive their opener.
  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        getPopoutWindow(windowId)?.close();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [windowId]);

  return { openPopout, close };
}

"use client";

/**
 * usePopoutControl — imperative API for triggering popout / dock from
 * outside the WindowPanel chrome (e.g. an "Open in floating window" button
 * elsewhere in the app, a keyboard shortcut handler, an agent-driven
 * action).
 *
 * **User-gesture caveat:** the `popOut` method must be called synchronously
 * inside a user-gesture handler (click, keydown, pointerup) — Chrome
 * rejects `documentPictureInPicture.requestWindow()` calls outside the
 * gesture stack. The popOut method is fire-and-forget; errors surface as
 * toasts via `usePopoutWindow`.
 *
 * **How it locates the live window's openPopout:** each WindowPanel that
 * mounts registers its `usePopoutWindow.openPopout` reference into a
 * module-level map keyed by window id. This hook reads from the same map
 * to invoke the live opener. The registry is owned by `WindowPanel.tsx`
 * via `registerPopoutOpener` (see below); the registration auto-cleans on
 * unmount.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  dockWindow,
  type WindowRect,
} from "@/lib/redux/slices/windowManagerSlice";
import { buildDockWindowPayload } from "./dockWindowPayload";
import type { OpenPopoutOptions, OpenPopoutResult } from "./usePopoutWindow";

// ─── Module-level opener registry ────────────────────────────────────────────
//
// Mirrors `popoutWindowMap.ts`'s pattern but holds the open-callback rather
// than the live Window. Registered by WindowPanel on mount; unregistered on
// unmount. Lookup is a plain Map operation — no React subscription needed
// since callers invoke it imperatively from event handlers.

type OpenPopoutFn = (opts: OpenPopoutOptions) => Promise<OpenPopoutResult>;

const openerMap = new Map<string, OpenPopoutFn>();

/**
 * Register a window's openPopout function. Called by WindowPanel on mount.
 * Returns an unregister function for use in the cleanup of useEffect.
 */
export function registerPopoutOpener(
  windowId: string,
  fn: OpenPopoutFn,
): () => void {
  openerMap.set(windowId, fn);
  return () => {
    // Only delete if the entry still points to the same function — guards
    // against StrictMode double-mount races where a fresh registration may
    // race with the previous unmount's cleanup.
    if (openerMap.get(windowId) === fn) {
      openerMap.delete(windowId);
    }
  };
}

/** Get the live openPopout for a given window id, or null. */
export function getPopoutOpener(windowId: string): OpenPopoutFn | null {
  return openerMap.get(windowId) ?? null;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface PopoutControlApi {
  /**
   * Pop out a specific window by its id. Must be called inside a
   * user-gesture stack. Returns the same result shape as
   * `usePopoutWindow.openPopout`. If the window isn't currently mounted,
   * returns `{ ok: false, reason: "not-mounted" }`.
   */
  popOut(
    windowId: string,
    opts: OpenPopoutOptions,
  ): Promise<OpenPopoutResult | { ok: false; reason: "not-mounted" }>;
  /** Dock a popped-out window back into the parent viewport. */
  dock(windowId: string): void;
}

export function usePopoutControl(): PopoutControlApi {
  const dispatch = useAppDispatch();

  const popOut = useCallback<PopoutControlApi["popOut"]>(
    async (windowId, opts) => {
      const opener = getPopoutOpener(windowId);
      if (!opener) {
        return { ok: false, reason: "not-mounted" as const };
      }
      return opener(opts);
    },
    [],
  );

  const dock = useCallback<PopoutControlApi["dock"]>(
    (windowId) => {
      const payload = buildDockWindowPayload(windowId);
      dispatch(dockWindow(payload));
    },
    [dispatch],
  );

  return { popOut, dock };
}

// ─── Convenience helper ──────────────────────────────────────────────────────
//
// Sized for the common "open this window with a sensible default rect" call.
// Caller still owns the user-gesture handler.

export interface PopOutByIdOptions {
  /** Falls back to 480 if not provided. */
  width?: number;
  /** Falls back to 320 if not provided. */
  height?: number;
  /** Falls back to "Window" if not provided. */
  title?: string;
}

export function buildPopoutOpts(
  rect: Partial<WindowRect> | undefined,
  opts: PopOutByIdOptions | undefined,
): OpenPopoutOptions {
  return {
    width: opts?.width ?? rect?.width ?? 480,
    height: opts?.height ?? rect?.height ?? 320,
    title: opts?.title ?? "Window",
  };
}

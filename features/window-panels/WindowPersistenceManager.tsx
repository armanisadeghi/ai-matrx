"use client";

/**
 * WindowPersistenceManager
 *
 * Replaces the localStorage-based UrlPanelManager for window geometry/state persistence.
 *
 * This component wraps all overlay children in OverlayController.
 * It provides WindowPersistenceContext so every WindowPanel can:
 *  - Retrieve its existing sessionId (loaded from DB on hydration)
 *  - Trigger a save (piggyback on data-save or explicit user action)
 *  - Clean up its DB row on close
 *
 * On mount it fetches all window_sessions rows for the current user and:
 *  1. Dispatches openOverlay for each row so OverlayController mounts the component
 *  2. Dispatches restoreWindowState so geometry is in Redux before windowPanel registers
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import {
  closeOverlay,
  openOverlay,
  pruneStaleInstances,
} from "@/lib/redux/slices/overlaySlice";
import { restoreWindowState } from "@/lib/redux/slices/windowManagerSlice";
import {
  loadWindowSessions,
  migrateWindowSessionSlug,
  saveWindowSession,
  deleteWindowSession,
} from "./service/windowPersistenceService";
import {
  getStaticEntryByOverlayId,
  getStaticEntryBySlug,
  type PanelState,
} from "./registry/windowRegistryMetadata";
import { isOverlayId, type OverlayId } from "./registry/overlay-ids";
import type { WindowEntry } from "@/lib/redux/slices/windowManagerSlice";
import { clampRectToCurrentViewport } from "./utils/rectClamp";
import {
  getPendingPopoutWindowIds,
  clearAllPopoutPending,
} from "./popout/popoutPendingStorage";
import { getPopoutOpener } from "./popout/usePopoutControl";
import { toast } from "sonner";

// ─── Popout recovery toast ────────────────────────────────────────────────────

/**
 * Surface a toast for any windows that were popped out at the time of the
 * last parent-page unload. Clicking the toast action triggers a fresh
 * popout via `usePopoutControl` — the click counts as a user gesture so
 * `documentPictureInPicture.requestWindow()` will be accepted.
 *
 * The window must be mounted by the time the user clicks. We delay reading
 * the opener until click time so the registration ordering is forgiving.
 */
function surfacePopoutRecoveryToast(): void {
  const pendingIds = getPendingPopoutWindowIds();
  if (pendingIds.length === 0) return;

  // Clear immediately so a fast reload doesn't double-show the toast.
  // If the user dismisses without action, that's fine — the windows
  // restored docked, with their original geometry preserved.
  clearAllPopoutPending();

  const label =
    pendingIds.length === 1
      ? "A floating window was open before reload"
      : `${pendingIds.length} floating windows were open before reload`;

  toast(label, {
    description: "Click to restore.",
    duration: 10_000,
    action: {
      label: "Restore",
      onClick: () => {
        for (const id of pendingIds) {
          const opener = getPopoutOpener(id);
          if (!opener) {
            // Window not mounted — silently skip. The persistence layer
            // already restored its docked geometry; the user can manually
            // pop it out from the menu.
            continue;
          }
          // We don't have the saved width/height here — use defaults.
          // The opener honors the user-gesture chain because `onClick` is
          // a real click handler.
          void opener({
            width: 480,
            height: 320,
            title: "Window",
          });
        }
      },
    },
  });
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface WindowPersistenceContextValue {
  /**
   * Get the existing DB session id for an overlayId, if one was loaded
   * during hydration. Returns undefined for windows opened fresh this session.
   */
  getSessionId: (overlayId: OverlayId) => string | undefined;

  /**
   * Persist the current state for a window.
   * Upserts a window_sessions row. No-op for ephemeral windows.
   *
   * @param overlayId  The window's overlay ID
   * @param panelState Chrome state (geometry, sidebar, z-index, etc.)
   * @param data       Window-type-specific content state
   * @param onSaved    Called with the session id after successful save
   */
  saveWindow: (
    overlayId: OverlayId,
    panelState: PanelState,
    data: Record<string, unknown>,
    onSaved?: (sessionId: string) => void,
  ) => void;

  /**
   * Delete the DB row for a window.
   * Called when the user closes a window. No-op if no row exists.
   */
  closeWindow: (overlayId: OverlayId) => void;

  /** True once the initial DB hydration completes. */
  hydrated: boolean;
}

const WindowPersistenceContext = createContext<WindowPersistenceContextValue>({
  getSessionId: () => undefined,
  saveWindow: () => undefined,
  closeWindow: () => undefined,
  hydrated: false,
});

/**
 * Hook for WindowPanel components to access persistence operations.
 * Must be used inside <WindowPersistenceManager>.
 */
export function useWindowPersistence(): WindowPersistenceContextValue {
  return useContext(WindowPersistenceContext);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface WindowPersistenceManagerProps {
  children: React.ReactNode;
}

export function WindowPersistenceManager({
  children,
}: WindowPersistenceManagerProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const [hydrated, setHydrated] = useState(false);

  /**
   * Maps overlayId → sessionId for all persisted rows.
   * Ref (not state) so save/close callbacks always see the latest value
   * without triggering re-renders.
   */
  const sessionMapRef = useRef<Map<OverlayId, string>>(new Map());

  // ── Hydrate on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    // One-time migration off the legacy `matrx_window_manager_state`
    // localStorage sidecar. Reads the old blob, seeds Redux geometry
    // synchronously, then removes the key. Later DB hydration will
    // overwrite geometry with the authoritative row. Safe no-op on
    // subsequent loads once the key is gone.
    //
    // Delete this block after the next release cycle — by then every
    // active user will have hydrated at least once.
    try {
      const LEGACY_LS_KEY = "matrx_window_manager_state";
      const saved = localStorage.getItem(LEGACY_LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, WindowEntry> | null;
        if (parsed && typeof parsed === "object") {
          // Clamp each stored rect into the current viewport before seeding
          // Redux — the saved geometry may be from a larger screen.
          const clamped: Record<string, WindowEntry> = {};
          for (const [id, entry] of Object.entries(parsed)) {
            if (!entry || typeof entry !== "object") continue;
            clamped[id] = {
              ...entry,
              windowed: entry.windowed
                ? clampRectToCurrentViewport(entry.windowed)
                : entry.windowed,
            };
          }
          dispatch(restoreWindowState(clamped));
        }
        localStorage.removeItem(LEGACY_LS_KEY);
      }
    } catch {
      // Malformed LS blob — drop silently.
    }

    if (!userId) {
      setHydrated(true);
      return undefined;
    }
    // Narrow once for the closures below — `userId` is nullable at the
    // effect's type but is guaranteed non-null past this guard.
    const currentUserId = userId;

    let cancelled = false;

    /**
     * One-shot slug migrations. Each row maps an old slug to its new slug
     * after a registry rename. Gated by a localStorage key per user-agnostic
     * migration so it runs once per browser. Failures are swallowed — the
     * row simply stays stranded and the user can manually re-open the
     * window from the sidebar. Add new entries here and rev `MIGRATION_KEY`
     * if a future rename needs to reach already-migrated browsers.
     *
     * Delete entries here once telemetry shows zero stranded rows.
     */
    const SLUG_MIGRATIONS: Array<{ from: string; to: string }> = [
      // 2026-05-05 — quickAIResults → quickChatHistory rename (commit e62188b04)
      { from: "quick-ai-results", to: "quick-chat-history" },
    ];
    const MIGRATION_KEY = "window-panels-slug-migrations:2026-05-06";

    async function runSlugMigrations() {
      if (!userId) return;
      try {
        if (localStorage.getItem(MIGRATION_KEY) === "1") return;
      } catch {
        // localStorage unavailable — run anyway, idempotent.
      }
      try {
        await Promise.all(
          SLUG_MIGRATIONS.map((m) =>
            migrateWindowSessionSlug(userId, m.from, m.to),
          ),
        );
        try {
          localStorage.setItem(MIGRATION_KEY, "1");
        } catch {
          // Best-effort; if LS is unavailable the migration is harmlessly
          // re-run on next mount.
        }
      } catch (err) {
        console.warn(
          "WindowPersistenceManager: slug migration failed (continuing)",
          err,
        );
      }
    }

    async function hydrate() {
      try {
        await runSlugMigrations();
        if (cancelled) return;
        const sessions = await loadWindowSessions(currentUserId);
        if (cancelled) return;

        // Geometry restore payload: slug → WindowEntry shape.
        // Keys must be the window manager id (slug, e.g. "agent-settings-window"),
        // not the overlayId (e.g. "agentSettingsWindow") — WindowPanel registers
        // in windowManagerSlice under its `id` prop which is always the slug.
        const windowEntries: Record<string, WindowEntry> = {};

        for (const session of sessions) {
          // window_type column stores the slug (e.g. "notes-window")
          const regEntry = getStaticEntryBySlug(session.window_type);
          if (!regEntry || !isOverlayId(regEntry.overlayId)) continue;

          const overlayId = regEntry.overlayId;

          // Track the session id keyed by overlayId (used by WindowPanel)
          sessionMapRef.current.set(overlayId, session.id);

          // Re-open the overlay in Redux so OverlayController mounts the
          // component. overlayId is narrowed via isOverlayId (check-registry
          // keeps registry slugs in sync with OVERLAY_IDS).
          dispatch(
            openOverlay({
              overlayId,
              data: session.data,
            }),
          );

          // Build the geometry entry for windowManagerSlice. Clamp the
          // restored rect into the current viewport — a rect saved at a
          // larger screen can land off-screen on a smaller device.
          //
          // Key by regEntry.slug (e.g. "agent-settings-window"), NOT by
          // overlayId (e.g. "agentSettingsWindow"). WindowPanel registers in
          // windowManagerSlice under its `id` prop, which window components
          // set to the kebab-case slug — restoreWindowState skips any entry
          // whose key doesn't match an already-registered window id. (D6)
          const ps = session.panel_state as PanelState | null;
          if (ps?.rect) {
            const clamped = clampRectToCurrentViewport(ps.rect);
            windowEntries[regEntry.slug] = {
              id: regEntry.slug,
              title: session.label ?? regEntry.label,
              state: ps.windowState ?? "windowed",
              windowed: clamped,
              preMinimizedRect: null,
              zIndex: ps.zIndex ?? 1000,
              traySlot: null,
              // Popout state never restores from DB — see restoreWindowState reducer.
              popoutMode: null,
              prePopoutRect: null,
            };
          }
        }

        if (Object.keys(windowEntries).length > 0) {
          dispatch(restoreWindowState(windowEntries));
        }

        // ── Popout recovery on reload ────────────────────────────────────
        // If any windows were popped out at the time of the last unload,
        // surface a toast offering to restore them. The user must click
        // (fresh user gesture) — we can't programmatically reopen.
        if (!cancelled) {
          surfacePopoutRecoveryToast();
        }
      } catch (err) {
        console.warn("WindowPersistenceManager: hydration failed", err);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Idle GC sweep ──────────────────────────────────────────────────────────
  //
  // Every 30 minutes (idle-only), prune closed multi-instance overlay entries
  // that haven't been used in the same window. Keeps `state.overlays` from
  // growing unbounded when users repeatedly open/close Content Editors,
  // Smart Code Editor instances, image viewers, etc. Singleton slots are
  // preserved so stable-reference selectors don't thrash.
  useEffect(() => {
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    const runSweep = () => {
      const idleRun = () =>
        dispatch(pruneStaleInstances({ olderThanMs: THIRTY_MINUTES_MS }));

      // Prefer requestIdleCallback so the sweep never steals paint time.
      // Fall back to a microtask on Safari (no rIC support yet).
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(idleRun);
      } else {
        setTimeout(idleRun, 0);
      }
    };

    const interval = window.setInterval(runSweep, THIRTY_MINUTES_MS);
    return () => window.clearInterval(interval);
  }, [dispatch]);

  // ── Context callbacks ───────────────────────────────────────────────────────

  const getSessionId = useCallback(
    (overlayId: OverlayId): string | undefined =>
      sessionMapRef.current.get(overlayId),
    [],
  );

  const saveWindow = useCallback(
    (
      overlayId: OverlayId,
      panelState: PanelState,
      data: Record<string, unknown>,
      onSaved?: (sessionId: string) => void,
    ) => {
      if (!userId) return;

      const regEntry = getStaticEntryByOverlayId(overlayId);
      if (!regEntry || regEntry.ephemeral) return;

      const existingSessionId = sessionMapRef.current.get(overlayId);

      saveWindowSession({
        sessionId: existingSessionId,
        userId,
        windowType: regEntry.slug,
        label: regEntry.label,
        panelState,
        data,
      })
        .then((sessionId) => {
          sessionMapRef.current.set(overlayId, sessionId);
          onSaved?.(sessionId);
        })
        .catch((err) => {
          console.warn(
            `WindowPersistenceManager: save failed for overlayId="${overlayId}"`,
            err,
          );
        });
    },
    [userId],
  );

  const closeWindow = useCallback(
    (overlayId: OverlayId) => {
      // Structural close: dispatch the overlay-slice close so OverlayController
      // unmounts the component. Every unmount-driven cleanup (URL sync,
      // autosave-on-blur, tray snapshot, popout opener registry) depends on
      // this firing — without it the X button is silently dead for any
      // window whose controller block forgot to wire `onClose`. The reducer
      // is idempotent (no-op when the bucket is missing or already closed)
      // and defaults to the singleton instance slot, so callers that already
      // dispatch `closeOverlay` themselves continue to work, and
      // multi-instance windows are untouched (they pass an explicit
      // instanceId from their controller block).
      dispatch(closeOverlay({ overlayId }));

      const sessionId = sessionMapRef.current.get(overlayId);
      if (!sessionId) return;
      sessionMapRef.current.delete(overlayId);
      deleteWindowSession(sessionId).catch((err) => {
        console.warn(
          `WindowPersistenceManager: delete failed for overlayId="${overlayId}" session="${sessionId}"`,
          err,
        );
      });
    },
    [dispatch],
  );

  const contextValue: WindowPersistenceContextValue = {
    getSessionId,
    saveWindow,
    closeWindow,
    hydrated,
  };

  return (
    <WindowPersistenceContext.Provider value={contextValue}>
      {children}
    </WindowPersistenceContext.Provider>
  );
}

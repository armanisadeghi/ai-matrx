"use client";

/**
 * Local-first window preservation coordinator.
 *
 * Window layout is a tab-scoped device cache, not durable domain data. The
 * synchronous localStorage mirror protects reload/pagehide; IndexedDB is the
 * warm cache. Registry allowlists decide which windows and semantic keys may
 * restore. No screenshots, callbacks, blobs, or arbitrary feature state enter
 * this path.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectFingerprintId,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import {
  DEFAULT_INSTANCE_ID,
  closeOverlay,
  openOverlay,
  pruneStaleInstances,
} from "@/lib/redux/slices/overlaySlice";
import {
  clearWindowPersistenceState,
  hydrateWindowSessions,
  markWindowClosing,
  updateWindowPersistence,
  windowSessionKey,
  type WindowManagerState,
} from "@/lib/redux/slices/windowManagerSlice";
import { deriveIdentity } from "@/lib/sync/identity";
import type { IdentityKey } from "@/lib/sync/types";
import type { OverlayId } from "./registry/overlay-ids";
import type { PanelState } from "./registry/windowRegistryMetadata";
import {
  getPendingPopoutWindowIds,
  clearAllPopoutPending,
} from "./popout/popoutPendingStorage";
import { getPopoutOpener } from "./popout/usePopoutControl";
import { toast } from "@/lib/toast";
import {
  getWindowWorkspaceId,
  loadLocalWindowWorkspace,
  saveLocalWindowWorkspace,
} from "./persistence/localWindowSessionStore";
import {
  hydrateWindowWorkspace,
  serializeWindowWorkspace,
  type WindowPersistenceDiagnostic,
} from "./persistence/windowSessionSerialization";

const SAVE_DEBOUNCE_MS = 250;

function reportDiagnostics(diagnostics: WindowPersistenceDiagnostic[]): void {
  diagnostics.forEach((diagnostic) => {
    const log =
      diagnostic.level === "error" ? console.error : console.warn;
    log(`[window-preservation:${diagnostic.code}] ${diagnostic.message}`);
  });
}

function surfacePopoutRecoveryToast(): void {
  const pendingIds = getPendingPopoutWindowIds();
  if (pendingIds.length === 0) return;
  clearAllPopoutPending();
  toast(
    pendingIds.length === 1
      ? "A floating window was open before reload"
      : `${pendingIds.length} floating windows were open before reload`,
    {
      description: "Click to restore.",
      duration: 10_000,
      action: {
        label: "Restore",
        onClick: () => {
          pendingIds.forEach((id) => {
            void getPopoutOpener(id)?.({
              width: 480,
              height: 320,
              title: "Window",
            });
          });
        },
      },
    },
  );
}

export interface WindowPersistenceContextValue {
  getSessionId: (
    overlayId: OverlayId,
    instanceId?: string,
  ) => string | undefined;
  saveWindow: (
    overlayId: OverlayId,
    panelState: PanelState,
    data: Record<string, unknown>,
    onSaved?: (sessionId: string) => void,
    instanceId?: string,
  ) => void;
  closeWindow: (overlayId: OverlayId, instanceId?: string) => void;
  /** True after this identity/workspace has produced a hit or a confirmed miss. */
  hydrated: boolean;
}

const WindowPersistenceContext = createContext<WindowPersistenceContextValue>({
  getSessionId: () => undefined,
  saveWindow: () => undefined,
  closeWindow: () => undefined,
  hydrated: false,
});

export function useWindowPersistence(): WindowPersistenceContextValue {
  return useContext(WindowPersistenceContext);
}

interface WindowPersistenceManagerProps {
  children: React.ReactNode;
}

export function WindowPersistenceManager({
  children,
}: WindowPersistenceManagerProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const userId = useAppSelector(selectUserId);
  const fingerprintId = useAppSelector(selectFingerprintId);
  const identityKey = deriveIdentity({ userId, fingerprintId }).key;
  const [hydrated, setHydrated] = useState(false);
  const workspaceIdRef = useRef<string | null>(null);
  const identityRef = useRef<IdentityKey | null>(null);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWorkspaceJsonRef = useRef<string | null>(null);
  const lastWorkspaceFingerprintRef = useRef<string | null>(null);
  const lastSavedAtRef = useRef(0);
  const restoredInstancesRef = useRef<
    Array<{ overlayId: OverlayId; instanceId: string }>
  >([]);

  if (workspaceIdRef.current === null && typeof window !== "undefined") {
    workspaceIdRef.current = getWindowWorkspaceId();
  }

  const saveCurrentWorkspace = useCallback(() => {
    const identity = identityRef.current;
    const workspaceId = workspaceIdRef.current;
    if (!identity || !workspaceId || !hydratedRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const savedAt = Math.max(Date.now(), lastSavedAtRef.current + 1);
    const result = serializeWindowWorkspace(
      store.getState().windowManager,
      workspaceId,
      savedAt,
    );
    reportDiagnostics(result.diagnostics);
    const fingerprint = JSON.stringify(
      result.workspace.sessions.map((session) => ({
        ...session,
        savedAt: 0,
      })),
    );
    if (fingerprint === lastWorkspaceFingerprintRef.current) return;
    lastWorkspaceFingerprintRef.current = fingerprint;
    lastSavedAtRef.current = savedAt;
    const nextJson = JSON.stringify(result.workspace);
    if (nextJson === lastWorkspaceJsonRef.current) return;
    lastWorkspaceJsonRef.current = nextJson;
    // localStorage completes synchronously inside this call; IDB may finish
    // after the event/paint and is intentionally not awaited.
    void saveLocalWindowWorkspace(identity, result.workspace);
  }, [store]);

  // Observe the canonical Redux source once. No render-driven whole-state
  // selector and no per-window timers.
  useEffect(() => {
    let previousWindowState = store.getState().windowManager;
    const unsubscribe = store.subscribe(() => {
      if (!hydratedRef.current) return;
      const nextWindowState = store.getState().windowManager;
      if (nextWindowState === previousWindowState) return;
      previousWindowState = nextWindowState;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        saveCurrentWorkspace();
      }, SAVE_DEBOUNCE_MS);
    });
    const flush = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      saveCurrentWorkspace();
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [saveCurrentWorkspace, store]);

  // Explicit identity/workspace readiness. A cache miss is a completed load,
  // not a forever-loading state.
  useEffect(() => {
    const workspaceId = workspaceIdRef.current;
    if (!workspaceId) return undefined;
    const identity = deriveIdentity({ userId, fingerprintId });
    let cancelled = false;

    hydratedRef.current = false;
    setHydrated(false);
    lastWorkspaceJsonRef.current = null;
    lastWorkspaceFingerprintRef.current = null;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const previousIdentity = identityRef.current;
    if (previousIdentity && previousIdentity.key !== identity.key) {
      // An account/fingerprint swap cannot leave the prior identity's windows
      // visible or let their unmounts write into the next identity's cache.
      const previousInstances = new Map<
        string,
        { overlayId: OverlayId; instanceId: string }
      >();
      const currentWindowState = store.getState().windowManager;
      Object.values(currentWindowState.windows).forEach((entry) => {
        if (!entry.persistence) return;
        previousInstances.set(
          windowSessionKey(
            entry.persistence.overlayId,
            entry.persistence.instanceId,
          ),
          {
            overlayId: entry.persistence.overlayId,
            instanceId: entry.persistence.instanceId,
          },
        );
      });
      Object.values(currentWindowState.pendingRestores).forEach((session) => {
        previousInstances.set(session.sessionKey, {
          overlayId: session.overlayId,
          instanceId: session.instanceId,
        });
      });
      previousInstances.forEach(({ overlayId, instanceId }) => {
        dispatch(markWindowClosing({ overlayId, instanceId }));
        dispatch(closeOverlay({ overlayId, instanceId }));
      });
      restoredInstancesRef.current = [];
      dispatch(clearWindowPersistenceState());
    }
    identityRef.current = identity;

    void loadLocalWindowWorkspace(identity, workspaceId)
      .then(({ workspace }) => {
        if (cancelled || identityRef.current?.key !== identity.key) return;
        const result = hydrateWindowWorkspace(workspace, {
          width: window.innerWidth,
          height: window.innerHeight,
        }, workspaceId);
        reportDiagnostics(result.diagnostics);
        dispatch(
          hydrateWindowSessions({
            sessions: result.sessions,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          }),
        );
        result.sessions.forEach((session) => {
          dispatch(
            openOverlay({
              overlayId: session.overlayId,
              instanceId: session.instanceId,
              data: session.data,
            }),
          );
        });
        restoredInstancesRef.current = result.sessions.map(
          ({ overlayId, instanceId }) => ({ overlayId, instanceId }),
        );
        lastWorkspaceJsonRef.current = workspace
          ? JSON.stringify(workspace)
          : null;
        lastWorkspaceFingerprintRef.current = workspace
          ? JSON.stringify(
              workspace.sessions.map((session) => ({
                ...session,
                savedAt: 0,
              })),
            )
          : null;
        lastSavedAtRef.current = workspace?.savedAt ?? 0;
        hydratedRef.current = true;
        setHydrated(true);
        surfacePopoutRecoveryToast();
        // Let restored WindowPanels register before taking the normalized
        // initial snapshot. This also records a clean empty-cache miss.
        window.setTimeout(saveCurrentWorkspace, 0);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[window-preservation] local hydration failed", error);
        hydratedRef.current = true;
        setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
    // identityKey intentionally collapses fingerprint changes while signed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, identityKey, saveCurrentWorkspace, store]);

  useEffect(() => {
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    const runSweep = () => {
      const idleRun = () =>
        dispatch(pruneStaleInstances({ olderThanMs: THIRTY_MINUTES_MS }));
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(idleRun);
      } else {
        setTimeout(idleRun, 0);
      }
    };
    const interval = window.setInterval(runSweep, THIRTY_MINUTES_MS);
    return () => window.clearInterval(interval);
  }, [dispatch]);

  const getSessionId = useCallback(
    (overlayId: OverlayId, instanceId = DEFAULT_INSTANCE_ID) => {
      const key = windowSessionKey(overlayId, instanceId);
      const state = store.getState().windowManager as WindowManagerState;
      const isLive = Object.values(state.windows).some(
        (entry) =>
          entry.persistence?.overlayId === overlayId &&
          entry.persistence.instanceId === instanceId,
      );
      return isLive || state.pendingRestores[key] ? key : undefined;
    },
    [store],
  );

  const saveWindow = useCallback(
    (
      overlayId: OverlayId,
      panelState: PanelState,
      data: Record<string, unknown>,
      onSaved?: (sessionId: string) => void,
      instanceId = DEFAULT_INSTANCE_ID,
    ) => {
      const entry = Object.values(store.getState().windowManager.windows).find(
        (candidate) =>
          candidate.persistence?.overlayId === overlayId &&
          candidate.persistence.instanceId === instanceId,
      );
      if (!entry) return;
      dispatch(
        updateWindowPersistence({
          id: entry.id,
          data,
          sidebarOpen: panelState.sidebarOpen,
        }),
      );
      saveCurrentWorkspace();
      onSaved?.(windowSessionKey(overlayId, instanceId));
    },
    [dispatch, saveCurrentWorkspace, store],
  );

  const closeWindow = useCallback(
    (overlayId: OverlayId, instanceId = DEFAULT_INSTANCE_ID) => {
      // Tombstone precedes every unmount/collector path.
      dispatch(markWindowClosing({ overlayId, instanceId }));
      dispatch(closeOverlay({ overlayId, instanceId }));
      restoredInstancesRef.current = restoredInstancesRef.current.filter(
        (item) =>
          item.overlayId !== overlayId || item.instanceId !== instanceId,
      );
      saveCurrentWorkspace();
    },
    [dispatch, saveCurrentWorkspace],
  );

  return (
    <WindowPersistenceContext.Provider
      value={{
        getSessionId,
        saveWindow,
        closeWindow,
        hydrated,
      }}
    >
      {children}
    </WindowPersistenceContext.Provider>
  );
}

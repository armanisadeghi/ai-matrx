"use client";

/**
 * useCloudBrowser — the facade the panel consumes. Wires the slice to the
 * live service and owns the async flows (load, take/return control, consent).
 */

import { useCallback, useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useUser } from "@/lib/hooks/useUser";
import * as service from "../service";
import { BackendApiError } from "@/lib/api/errors";
import { useWrittenProgress } from "./useWrittenProgress";
import type { CloudBrowserConsent, CloudBrowserLoadError } from "../types";
import {
  hydrateSnapshot,
  setActiveProfile,
  setConsent,
  setController,
  setError,
  setLoading,
  setNotificationAcknowledged,
  setTelemetry,
} from "../redux/cloudBrowserSlice";
import {
  selectActiveProfile,
  selectActiveProfileId,
  selectActiveQuota,
  selectBindings,
  selectCloudBrowserError,
  selectCloudBrowserLoading,
  selectConsent,
  selectController,
  selectHandoff,
  selectNotificationAcknowledgedAt,
  selectProfiles,
  selectProgress,
  selectRun,
  selectTelemetry,
} from "../redux/selectors";

/** Keep what the server told us. `e.message` alone loses whether trying again
 *  can work and the id to quote — see `CloudBrowserLoadError`. */
function toLoadError(e: unknown): CloudBrowserLoadError {
  if (e instanceof BackendApiError) {
    const details = e.details as { retryable?: unknown } | null;
    return {
      message: e.userMessage,
      // No verdict from the server: an unknown failure is worth one more try.
      retryable:
        typeof details?.retryable === "boolean" ? details.retryable : true,
      requestId: e.requestId || null,
    };
  }
  return {
    message:
      e instanceof Error && e.message
        ? e.message
        : "The Cloud Browser could not load.",
    retryable: true,
    requestId: null,
  };
}

export function useCloudBrowser(
  initialProfileId?: string,
  /** The exact run to show, when the opener knows it (see `loadSnapshot`). */
  initialRunId?: string | null,
) {
  const dispatch = useAppDispatch();
  const { userId, activeUserName } = useUser();
  const me = useMemo(
    () => ({ userId: userId ?? "", displayName: activeUserName ?? "You" }),
    [activeUserName, userId],
  );

  const activeProfileId = useAppSelector(selectActiveProfileId);
  const activeProfile = useAppSelector(selectActiveProfile);
  const profiles = useAppSelector(selectProfiles);
  const quota = useAppSelector(selectActiveQuota);
  const run = useAppSelector(selectRun);
  const progress = useAppSelector(selectProgress);
  const handoff = useAppSelector(selectHandoff);
  const controller = useAppSelector(selectController);
  const bindings = useAppSelector(selectBindings);
  const telemetry = useAppSelector(selectTelemetry);
  const consent = useAppSelector(selectConsent);
  const notificationAcknowledgedAt = useAppSelector(
    selectNotificationAcknowledgedAt,
  );
  const loading = useAppSelector(selectCloudBrowserLoading);
  const error = useAppSelector(selectCloudBrowserError);

  const load = useCallback(
    async (profileId: string, runId?: string | null) => {
      dispatch(setLoading(true));
      try {
        const snap = await service.loadSnapshot(profileId, runId);
        dispatch(hydrateSnapshot(snap));
      } catch (e) {
        dispatch(setError(toLoadError(e)));
      }
    },
    [dispatch],
  );

  useEffect(() => {
    void load(initialProfileId ?? "", initialRunId);
  }, [initialProfileId, initialRunId, load]);

  // D-8 tier 1 — the DEFAULT face stays live for as long as this panel is
  // mounted. `load` above is the one-shot hydrate; this is what keeps it true.
  // Stops on unmount, on a terminal run, and while the tab is hidden.
  const { refreshProgress } = useWrittenProgress(run?.id ?? null, run?.state ?? null);

  // A fleet-backed start now returns its durable run while the worker is still
  // provisioning. Written-progress only reads action events, so it cannot
  // discover this transition. Rehydrate the *named* run instead: that path is
  // RLS-bound, cannot auto-start a profile, and carries its final failure back
  // to the visible panel. The in-flight flag belongs to this exact run's
  // effect: an old request must never hold up the browser selected after it.
  useEffect(() => {
    if (run?.state !== "provisioning" || !activeProfileId || run.profileId !== activeProfileId) return;
    const runId = run.id;
    const profileId = activeProfileId;
    let disposed = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = Date.now() + 25 * 60_000;

    const expire = (message: string) => {
      dispatch(setError({ message, retryable: true, requestId: null }));
    };

    const schedule = () => {
      if (!disposed && timer === null) {
        timer = setTimeout(() => {
          // A visibility change can now immediately resume the exact poll.
          timer = null;
          void poll();
        }, 2000);
      }
    };
    const poll = async () => {
      if (disposed || inFlight) return;
      if (typeof document !== "undefined" && document.hidden) return;
      inFlight = true;
      try {
        const snapshot = await service.loadSnapshot(profileId, runId);
        if (disposed || snapshot.activeProfileId !== profileId || snapshot.run?.id !== runId)
          return;
        dispatch(hydrateSnapshot(snapshot));
        if (snapshot.run.state === "provisioning") {
          if (Date.now() >= deadline) {
            expire("Your cloud browser did not finish starting. Please try again.");
          } else {
            schedule();
          }
        }
      } catch (error) {
        if (disposed) return;
        // Fleet placement can outlast an HTTP request. Keep the durable run
        // visible and retry its exact RLS read until it reaches a terminal state.
        if (error instanceof BackendApiError && (error.status === 403 || error.status === 404)) {
          dispatch(setError(toLoadError(error)));
        } else if (Date.now() >= deadline) {
          expire("Your cloud browser could no longer be checked while it was starting. Please try again.");
        } else {
          schedule();
        }
      } finally {
        inFlight = false;
      }
    };
    const onVisibility = () => {
      if (disposed || typeof document === "undefined" || document.hidden) return;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      void poll();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
    void poll();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeProfileId, dispatch, run?.id, run?.state]);

  const selectProfile = useCallback(
    (profileId: string) => {
      dispatch(setActiveProfile(profileId));
      void load(profileId);
    },
    [dispatch, load],
  );

  /**
   * Start ANOTHER cloud browser, named by the person (D-28, Arman 2026-08-23:
   * *"they can have as many as they want… make it easy to start"*).
   *
   * Selects the new browser immediately — creating one and being left staring
   * at the old one is the same dead end as not being able to create it. The new
   * profile is never the default; `loadSnapshot` starts its first run.
   */
  const createProfile = useCallback(
    async (displayName: string) => {
      const profileId = await service.createProfile(displayName);
      dispatch(setActiveProfile(profileId));
      await load(profileId);
      return profileId;
    },
    [dispatch, load],
  );

  const takeControl = useCallback(
    async (opts: { immediate?: boolean } = {}) => {
      if (!run) return;
      const next = await service.takeControl(run.id, me, opts);
      dispatch(setController(next));
    },
    [dispatch, me, run],
  );

  /** Ask the CURRENT human controller for the wheel — a real durable queue row,
   *  never a disguised claim (the claim fails closed against another human). */
  const requestControl = useCallback(async () => {
    if (!run) return;
    await service.requestControl(run.id);
  }, [run]);

  const returnControl = useCallback(async () => {
    if (!run) return;
    const next = await service.returnControl(run.id);
    dispatch(setController(next));
  }, [dispatch, run]);

  const refreshTelemetry = useCallback(async () => {
    const t = await service.getTelemetry();
    dispatch(setTelemetry(t));
  }, [dispatch]);

  const updateConsent = useCallback(
    async (next: CloudBrowserConsent) => {
      if (!activeProfileId) return;
      const saved = await service.saveConsent(activeProfileId, next);
      dispatch(setConsent(saved));
    },
    [activeProfileId, dispatch],
  );

  /** Records that the front-and-centre card was answered. The channel
   *  switches themselves are written to the canonical preference tables by
   *  `useHandoffNotificationPreferences` — never to profile metadata. */
  const acknowledgeNotificationPrompt = useCallback(async () => {
    if (!activeProfileId) return;
    const at = await service.acknowledgeNotificationPrompt(activeProfileId);
    dispatch(setNotificationAcknowledged(at));
  }, [activeProfileId, dispatch]);

  return {
    me,
    activeProfileId,
    activeProfile,
    profiles,
    quota,
    run,
    progress,
    handoff,
    controller,
    bindings,
    telemetry,
    consent,
    notificationAcknowledgedAt,
    loading,
    error,
    /** Force an immediate written-progress read (after an action the user took
     *  in this panel — no reason to make them wait out a tick). */
    refreshProgress,
    selectProfile,
    createProfile,
    reload: () =>
      activeProfileId
        ? load(activeProfileId, initialRunId)
        : Promise.resolve(),
    /**
     * Try again after a failed load or start. NOT `reload`: that one needs an
     * `activeProfileId`, which a first load that failed never set — so a retry
     * button wired to it would silently do nothing, a dead end in a nicer coat.
     * Starts over from what the panel was opened with.
     */
    retry: () =>
      load(activeProfileId ?? initialProfileId ?? "", initialRunId),
    takeControl,
    requestControl,
    returnControl,
    refreshTelemetry,
    updateConsent,
    acknowledgeNotificationPrompt,
  };
}

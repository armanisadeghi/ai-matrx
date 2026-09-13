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

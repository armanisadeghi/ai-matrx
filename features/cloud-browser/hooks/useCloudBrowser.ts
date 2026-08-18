"use client";

/**
 * useCloudBrowser — the facade the panel consumes. Wires the slice to the
 * fixture service and owns the async flows (load, take/return control, consent).
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { FIXTURE_ME } from "../fixtures";
import * as service from "../service";
import type { CloudBrowserConsent, NotificationConsent } from "../types";
import {
  hydrateSnapshot,
  setActiveProfile,
  setConsent,
  setController,
  setError,
  setLoading,
  setNotificationConsent,
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
  selectNotificationConsent,
  selectProfiles,
  selectProgress,
  selectRun,
  selectTelemetry,
} from "../redux/selectors";

export function useCloudBrowser(initialProfileId?: string) {
  const dispatch = useAppDispatch();

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
  const notificationConsent = useAppSelector(selectNotificationConsent);
  const loading = useAppSelector(selectCloudBrowserLoading);
  const error = useAppSelector(selectCloudBrowserError);

  const load = useCallback(
    async (profileId: string) => {
      dispatch(setLoading(true));
      try {
        const snap = await service.loadSnapshot(profileId);
        dispatch(hydrateSnapshot(snap));
      } catch (e) {
        dispatch(setError(e instanceof Error ? e.message : "Failed to load Cloud Browser."));
      }
    },
    [dispatch],
  );

  // First mount: choose a profile and load its snapshot.
  useEffect(() => {
    const target = initialProfileId ?? activeProfileId ?? "bp_personal_default";
    if (activeProfileId !== target) dispatch(setActiveProfile(target));
    void load(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectProfile = useCallback(
    (profileId: string) => {
      dispatch(setActiveProfile(profileId));
      void load(profileId);
    },
    [dispatch, load],
  );

  const takeControl = useCallback(async () => {
    if (!run) return;
    const next = await service.takeControl(run.id, FIXTURE_ME);
    dispatch(setController(next));
  }, [dispatch, run]);

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
      const saved = await service.saveConsent(next);
      dispatch(setConsent(saved));
    },
    [dispatch],
  );

  const updateNotificationConsent = useCallback(
    async (next: NotificationConsent) => {
      const saved = await service.saveNotificationConsent(next);
      dispatch(setNotificationConsent(saved));
    },
    [dispatch],
  );

  return {
    me: FIXTURE_ME,
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
    notificationConsent,
    loading,
    error,
    selectProfile,
    reload: () => (activeProfileId ? load(activeProfileId) : Promise.resolve()),
    takeControl,
    returnControl,
    refreshTelemetry,
    updateConsent,
    updateNotificationConsent,
  };
}

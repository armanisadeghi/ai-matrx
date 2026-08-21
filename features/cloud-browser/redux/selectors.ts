/**
 * Cloud Browser — memoized selectors. Every property has its own selector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { CloudBrowserState } from "./cloudBrowserSlice";

const root = (s: RootState): CloudBrowserState =>
  (s as unknown as { cloudBrowser: CloudBrowserState }).cloudBrowser;

export const selectCloudBrowserLoading = (s: RootState) => root(s).loading;
export const selectCloudBrowserError = (s: RootState) => root(s).error;
export const selectActiveProfileId = (s: RootState) => root(s).activeProfileId;
export const selectProfiles = (s: RootState) => root(s).profiles;
export const selectQuotas = (s: RootState) => root(s).quotas;
export const selectRun = (s: RootState) => root(s).run;
export const selectProgress = (s: RootState) => root(s).progress;
export const selectHandoff = (s: RootState) => root(s).handoff;
export const selectController = (s: RootState) => root(s).controller;
export const selectBindings = (s: RootState) => root(s).bindings;
export const selectTelemetry = (s: RootState) => root(s).telemetry;
export const selectConsent = (s: RootState) => root(s).consent;
export const selectNotificationConsent = (s: RootState) => root(s).notificationConsent;
export const selectFace = (s: RootState) => root(s).face;
export const selectScreenshot = (s: RootState) => root(s).screenshot;
/** Last streamed cloud-browser tool action — the event-driven capture trigger. */
export const selectBrowserActivityAt = (s: RootState) => root(s).browserActivityAt;
export const selectNotificationPromptSeen = (s: RootState) => root(s).notificationPromptSeen;

export const selectActiveProfile = createSelector(
  [selectProfiles, selectActiveProfileId],
  (profiles, id) => profiles.find((p) => p.id === id) ?? null,
);

export const selectActiveQuota = createSelector(
  [selectQuotas, selectActiveProfileId],
  (quotas, id) => (id ? quotas[id] ?? null : null),
);

/** True while a person (me or someone else) is driving. */
export const selectIsHumanControlled = createSelector(
  [selectController],
  (c) => c?.kind === "human",
);

/** The takeover canvas shows ONLY while a takeover stream is active. */
export const selectShowTakeoverCanvas = createSelector(
  [selectController, selectFace],
  (c, face) => face === "takeover" && !!c?.streamActive,
);

/** Screenshot session counts as observation for the idle timer (D-10). */
export const selectIsObserving = createSelector(
  [selectScreenshot, selectShowTakeoverCanvas],
  (shot, takeover) => shot.active || takeover,
);

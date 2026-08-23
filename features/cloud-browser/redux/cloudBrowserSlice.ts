/**
 * Cloud Browser — RTK slice.
 *
 * Global state for the panel: the selected profile, the live run + progress,
 * controller/takeover state, the bounded screenshot session, telemetry, and the
 * two consent surfaces. One slice, small individual updates (no big object
 * replacement); every read has its own memoized selector in ./selectors.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  AccountBinding,
  CloudBrowserConsent,
  CloudBrowserHandoff,
  CloudBrowserProfile,
  CloudBrowserRun,
  ControllerState,
  ProfileQuota,
  ProgressEvent,
  ScreenshotFrame,
  TelemetrySnapshot,
} from "../types";
import type { MediaTier } from "../constants";
import type { CloudBrowserSnapshot } from "../service";

type MediaFace = MediaTier;

export interface CloudBrowserState {
  activeProfileId: string | null;
  profiles: CloudBrowserProfile[];
  quotas: Record<string, ProfileQuota>;
  run: CloudBrowserRun | null;
  progress: ProgressEvent[];
  handoff: CloudBrowserHandoff | null;
  controller: ControllerState | null;
  bindings: AccountBinding[];
  telemetry: TelemetrySnapshot | null;
  consent: CloudBrowserConsent | null;
  /**
   * ONLY the one-time "the front-and-centre card was shown" stamp. The four
   * channel switches are NOT slice state: they live on the canonical
   * preference tables and are read by `useHandoffNotificationPreferences`.
   * Keeping them here was half of the parallel preference store.
   */
  notificationAcknowledgedAt: string | null;
  /** Which face is showing (D-8 tiers). Default = written progress. */
  face: MediaFace;
  /** Bounded screenshot session (D-8/D-21). */
  screenshot: {
    active: boolean;
    /** ms epoch when the session auto-offs; null when inactive. */
    autoOffAt: number | null;
    frames: ScreenshotFrame[];
  };
  /** ms epoch of the last streamed cloud-browser tool action (event-driven
   * screenshot trigger); null until the first action streams. */
  browserActivityAt: number | null;
  loading: boolean;
  error: string | null;
  /** True once the front-and-centre notification prompt has been answered. */
  notificationPromptSeen: boolean;
}

const initialState: CloudBrowserState = {
  browserActivityAt: null,
  activeProfileId: null,
  profiles: [],
  quotas: {},
  run: null,
  progress: [],
  handoff: null,
  controller: null,
  bindings: [],
  telemetry: null,
  consent: null,
  notificationAcknowledgedAt: null,
  face: "written",
  screenshot: { active: false, autoOffAt: null, frames: [] },
  loading: false,
  error: null,
  notificationPromptSeen: false,
};

const MAX_FRAMES = 12;

const slice = createSlice({
  name: "cloudBrowser",
  initialState,
  reducers: {
    setActiveProfile(state, action: PayloadAction<string>) {
      state.activeProfileId = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    hydrateSnapshot(state, action: PayloadAction<CloudBrowserSnapshot>) {
      const s = action.payload;
      state.activeProfileId = s.activeProfileId;
      state.profiles = s.profiles;
      state.quotas = s.quotas;
      state.run = s.run;
      state.progress = s.progress;
      state.handoff = s.handoff;
      state.controller = s.controller;
      state.bindings = s.bindings;
      state.telemetry = s.telemetry;
      state.consent = s.consent;
      state.notificationAcknowledgedAt = s.notificationAcknowledgedAt;
      state.loading = false;
      state.error = null;
    },
    /**
     * Append the written-progress tail — ONE dispatch for a whole page of
     * steps, never one per row.
     *
     * A dispatch-per-row loop notifies every subscriber and re-runs every
     * selector once PER ROW; that O(N^2) shape is the documented cause of this
     * app's realtime freezes (CLAUDE.md § Realtime, features/notes
     * FEATURE.md § Freeze-loop doctrine). So the payload is the BATCH, and the
     * batch is what the poll hands over.
     *
     * De-dup is by `sequence`, which `browser.action_event` guarantees unique
     * per run — so a re-read, an overlapping cursor, or a hydrate racing the
     * poll can never double a step.
     */
    appendProgress(state, action: PayloadAction<ProgressEvent[]>) {
      const seen = new Set(state.progress.map((e) => e.sequence));
      const fresh = action.payload.filter((e) => !seen.has(e.sequence));
      if (fresh.length === 0) return;
      state.progress.push(...fresh);
      state.progress.sort((a, b) => a.sequence - b.sequence);
    },
    setController(state, action: PayloadAction<ControllerState>) {
      state.controller = action.payload;
    },
    setFace(state, action: PayloadAction<MediaFace>) {
      state.face = action.payload;
    },
    startScreenshotSession(state, action: PayloadAction<{ autoOffAt: number }>) {
      state.screenshot.active = true;
      state.screenshot.autoOffAt = action.payload.autoOffAt;
      state.face = "screenshots";
    },
    /** Re-arm bumps the auto-off deadline without clearing frames. */
    rearmScreenshotSession(state, action: PayloadAction<{ autoOffAt: number }>) {
      state.screenshot.autoOffAt = action.payload.autoOffAt;
      state.screenshot.active = true;
    },
    stopScreenshotSession(state) {
      state.screenshot.active = false;
      state.screenshot.autoOffAt = null;
      if (state.face === "screenshots") state.face = "written";
    },
    /** Stamped by the chat stream processor whenever a cloud-browser tool
     * (cloud_browser_* / credential_login) starts or completes — the signal
     * that the page just changed, so the screenshot session captures NOW
     * instead of waiting for the idle timer (Arman 2026-08-21). */
    noteBrowserActivity(state, action: PayloadAction<number>) {
      state.browserActivityAt = action.payload;
    },
    pushFrame(state, action: PayloadAction<ScreenshotFrame>) {
      state.screenshot.frames.unshift(action.payload);
      if (state.screenshot.frames.length > MAX_FRAMES) {
        state.screenshot.frames = state.screenshot.frames.slice(0, MAX_FRAMES);
      }
    },
    setTelemetry(state, action: PayloadAction<TelemetrySnapshot>) {
      state.telemetry = action.payload;
    },
    setConsent(state, action: PayloadAction<CloudBrowserConsent>) {
      state.consent = action.payload;
    },
    setNotificationAcknowledged(state, action: PayloadAction<string>) {
      state.notificationAcknowledgedAt = action.payload;
      state.notificationPromptSeen = true;
    },
    markNotificationPromptSeen(state) {
      state.notificationPromptSeen = true;
    },
  },
});

export const {
  setActiveProfile,
  setLoading,
  setError,
  hydrateSnapshot,
  appendProgress,
  setController,
  setFace,
  noteBrowserActivity,
  startScreenshotSession,
  rearmScreenshotSession,
  stopScreenshotSession,
  pushFrame,
  setTelemetry,
  setConsent,
  setNotificationAcknowledged,
  markNotificationPromptSeen,
} = slice.actions;

export default slice.reducer;

/** True while the user's cloud-browser run is live (any non-terminal state).
 * Drives "the browser is active" affordances — e.g. the context-rail pill
 * above the chat input (Arman 2026-08-21: the pill appears only while a
 * browser is actually in use; the entry point is the `+` attach menu). */
export const selectCloudBrowserRunLive = (state: {
  cloudBrowser: CloudBrowserState;
}): boolean => {
  const runState = state.cloudBrowser.run?.state;
  return (
    runState !== undefined &&
    runState !== "stopped" &&
    runState !== "failed" &&
    runState !== "failed_persistence"
  );
};

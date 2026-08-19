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
  NotificationConsent,
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
  notificationConsent: NotificationConsent | null;
  /** Which face is showing (D-8 tiers). Default = written progress. */
  face: MediaFace;
  /** Bounded screenshot session (D-8/D-21). */
  screenshot: {
    active: boolean;
    /** ms epoch when the session auto-offs; null when inactive. */
    autoOffAt: number | null;
    frames: ScreenshotFrame[];
  };
  loading: boolean;
  error: string | null;
  /** True once the front-and-centre notification prompt has been answered. */
  notificationPromptSeen: boolean;
}

const initialState: CloudBrowserState = {
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
  notificationConsent: null,
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
      state.notificationConsent = s.notificationConsent;
      state.loading = false;
      state.error = null;
    },
    appendProgress(state, action: PayloadAction<ProgressEvent>) {
      // De-dup by sequence — echo-safe (never dispatch-per-row in a loop).
      if (!state.progress.some((e) => e.sequence === action.payload.sequence)) {
        state.progress.push(action.payload);
      }
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
    setNotificationConsent(state, action: PayloadAction<NotificationConsent>) {
      state.notificationConsent = action.payload;
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
  startScreenshotSession,
  rearmScreenshotSession,
  stopScreenshotSession,
  pushFrame,
  setTelemetry,
  setConsent,
  setNotificationConsent,
  markNotificationPromptSeen,
} = slice.actions;

export default slice.reducer;

/**
 * features/media-capture/core/constraints.ts
 *
 * Pure builders/deciders for camera track constraints. NO DOM access — the
 * camera stream manager (runtime/) is the only place that calls getUserMedia.
 *
 * Model (docs/media-capture-plan.md §Phase 2): REQUESTED, CAPABILITY, and
 * EFFECTIVE settings are always separate. An `ideal` constraint is a stream
 * selection preference, never a sensor guarantee; the recorded truth is
 * `getSettings()` / `videoWidth × videoHeight`.
 */

import type { CaptureQualityProfile } from "./capture-types";

export interface VideoConstraintRequest {
  deviceId?: string;
  facingMode?: "user" | "environment";
  profile: CaptureQualityProfile;
}

/** Ideal dimensions per profile. `maximum-available` over-asks; the browser
 * clamps to the best mode the device offers (no aspectRatio so nothing is
 * excluded). */
const PROFILE_DIMENSIONS: Record<CaptureQualityProfile, { width: number; height: number }> = {
  "maximum-available": { width: 4096, height: 4096 },
  "1080p": { width: 1920, height: 1080 },
  "720p": { width: 1280, height: 720 },
};

/**
 * Build `MediaTrackConstraints` for a camera acquisition.
 *
 * - 1080p / 720p: `ideal` width/height at the profile's dimensions.
 * - maximum-available: over-ask `ideal` 4096×4096 with NO aspectRatio, so the
 *   browser selects the highest mode available (the PDF-scanner contract).
 * - deviceId / facingMode are `ideal` (soft) — resolution falls back to the
 *   system default rather than failing acquisition outright; the runtime
 *   layer decides how to surface a mismatch.
 */
export function buildVideoConstraints(request: VideoConstraintRequest): MediaTrackConstraints {
  const { width, height } = PROFILE_DIMENSIONS[request.profile];
  const constraints: MediaTrackConstraints = {
    width: { ideal: width },
    height: { ideal: height },
  };
  if (request.deviceId) {
    constraints.deviceId = { ideal: request.deviceId };
  }
  if (request.facingMode) {
    constraints.facingMode = { ideal: request.facingMode };
  }
  return constraints;
}

/** One dimension of the requested/capability/effective report. All fields are
 * plain values — no device IDs, group IDs, or labels ever appear here. */
export interface TrackDimensionReport {
  width: number | null;
  height: number | null;
  frameRate: number | null;
  facingMode: string | null;
}

export interface TrackStateSummary {
  /** What we asked for (from the built constraints). */
  requested: TrackDimensionReport;
  /** What the hardware says it can do (`getCapabilities()`), or null where unavailable (Firefox). */
  capability: { widthMax: number | null; heightMax: number | null; frameRateMax: number | null } | null;
  /** What the track actually delivers (`getSettings()`) — the recorded truth. */
  effective: TrackDimensionReport;
}

function idealOf(value: ConstrainULong | ConstrainDouble | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "ideal" in value && typeof value.ideal === "number") {
    return value.ideal;
  }
  return null;
}

function facingModeOf(value: MediaTrackConstraints["facingMode"]): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (!Array.isArray(value) && typeof value === "object" && typeof value.ideal === "string") {
    return value.ideal;
  }
  return null;
}

/**
 * Summarize the requested vs capability vs effective state of a video track
 * into a plain diagnostics object. Pure — pass in the values, get a report.
 */
export function summarizeTrackState(
  requested: MediaTrackConstraints,
  capabilities: MediaTrackCapabilities | null,
  settings: MediaTrackSettings,
): TrackStateSummary {
  return {
    requested: {
      width: idealOf(requested.width),
      height: idealOf(requested.height),
      frameRate: idealOf(requested.frameRate),
      facingMode: facingModeOf(requested.facingMode),
    },
    capability: capabilities
      ? {
          widthMax: capabilities.width?.max ?? null,
          heightMax: capabilities.height?.max ?? null,
          frameRateMax: capabilities.frameRate?.max ?? null,
        }
      : null,
    effective: {
      width: settings.width ?? null,
      height: settings.height ?? null,
      frameRate: settings.frameRate ?? null,
      facingMode: settings.facingMode ?? null,
    },
  };
}

/**
 * Decide whether a change from `current` to `next` can be applied to the LIVE
 * track via `applyConstraints()` (returns true), or requires releasing and
 * reacquiring the stream (returns false).
 *
 * Reacquire ONLY on a device identity change: different deviceId or different
 * facingMode. A pure quality-profile change is always compatible.
 */
export function isCompatibleQualityChange(
  current: VideoConstraintRequest,
  next: VideoConstraintRequest,
): boolean {
  if ((current.deviceId ?? null) !== (next.deviceId ?? null)) return false;
  if ((current.facingMode ?? null) !== (next.facingMode ?? null)) return false;
  return true;
}

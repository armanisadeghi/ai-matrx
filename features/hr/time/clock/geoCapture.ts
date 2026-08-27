/**
 * features/hr/time/clock/geoCapture.ts — location capture on a punch (L3-46, SPEC-TIME §2.1, §4.9).
 *
 * 🚨 THREE RULES, ALL OF THEM ABOUT NOT BLOCKING A LEGITIMATE EMPLOYEE
 * --------------------------------------------------------------------
 * 1. **Capture is requested only when the server says so.** `clockState.capture.geoRequested` is the
 *    resolved knob (`hr.time_and_attendance.geo_required_web_punch`), and it is **off by default —
 *    ruled** (§4.9). This module never asks the browser for a position on its own initiative.
 * 2. **A denied browser permission produces a punch, not a refusal.** The punch is written and the
 *    server flags it `geo_missing` and opens an exception. *Blocking a legitimate employee because
 *    a browser dialog was dismissed is a defect.* Nothing in here throws, and nothing in here
 *    returns a value a caller could mistake for "do not punch".
 * 3. **Poor accuracy is recorded, not rejected.** `maxGeoAccuracyM` is how the server labels a fix
 *    unreliable. The client reports the accuracy it got and lets the server decide; it never
 *    withholds a fix for being fuzzy, because a withheld fix is indistinguishable from a denial.
 *
 * Transparency is a **build item now, not later** (§4.9, ruled): the employee is told *before* the
 * punch, on the control itself ({@link geoCaptureBeforeNotice}), and the confirmation states what
 * was captured ({@link GEO_CAPTURED_NOTICE}).
 */

"use client";

import type { PunchGeo } from "./punchIntent";

/**
 * What a surface knows about capture before a punch. A standalone shape on purpose: it used to be
 * `ClockState["capture"]`, and `hr.clock_state` sends no such field (G2 F6). The kiosk supplies it
 * from its device session config, which genuinely does carry one.
 */
export interface CapturePosture {
  geoRequested: boolean;
  photoRequested: boolean;
  maxGeoAccuracyM: number | null;
}

/** On the confirmation card, verbatim from §4.9's *"Location recorded"*. */
export const GEO_CAPTURED_NOTICE = "Location recorded";

/**
 * What the punch control says **before** it is pressed, where capture is on. Never a policy page,
 * never a one-time consent an employee has forgotten (§4.9).
 */
export function geoCaptureBeforeNotice(capture: CapturePosture): string | null {
  if (capture.geoRequested && capture.photoRequested) {
    return "Your location and a photo will be recorded with this punch.";
  }
  if (capture.geoRequested) return "Your location will be recorded with this punch.";
  if (capture.photoRequested) return "A photo will be recorded with this punch.";
  return null;
}

export interface GeoCaptureOutcome {
  /** The fix, or `null` when the browser refused, timed out, or has no geolocation at all. */
  geo: PunchGeo | null;
  /** For the confirmation card. `null` when nothing was captured — never a "location missing" scare. */
  notice: string | null;
  /**
   * Why there is no fix, for the surface's own quiet sentence. **Not** an error: the punch proceeds.
   * The authoritative flag is the server's, raised on the punch it writes.
   */
  unavailableReason: string | null;
}

const NO_CAPTURE: GeoCaptureOutcome = { geo: null, notice: null, unavailableReason: null };

const GEO_TIMEOUT_MS = 10_000;

/**
 * Capture a fix if — and only if — the server asked for one. Always resolves. A caller that wraps
 * this in a try/catch to "handle the failure" has misread the contract: there is no failure path
 * here, because a punch is never refused for a location.
 */
export async function captureGeoIfRequested(
  capture: CapturePosture,
): Promise<GeoCaptureOutcome> {
  if (!capture.geoRequested) return NO_CAPTURE;
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      geo: null,
      notice: null,
      unavailableReason: "This device cannot report a location. Your punch was still recorded.",
    };
  }

  return new Promise<GeoCaptureOutcome>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          geo: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            // Reported as measured. A fuzzy fix is recorded, never withheld — see rule 3.
            accuracyM: position.coords.accuracy,
          },
          notice: GEO_CAPTURED_NOTICE,
          unavailableReason: null,
        });
      },
      () => {
        resolve({
          geo: null,
          notice: null,
          unavailableReason:
            "Your location was not shared, so your punch is recorded without it. Your manager will see a note.",
        });
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

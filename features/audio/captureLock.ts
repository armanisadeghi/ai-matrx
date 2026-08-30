/**
 * Capture Lock — HOST WIRING ONLY.
 *
 * The arbitration itself (start-always-wins, id-guarded release, listener
 * fan-out, the holder contract) lives in `@ai-matrx/browser-audio/core`; read
 * that module for the rules a holder must obey. Nothing about how capture
 * ownership works is decided here, and nothing may be added here that catches,
 * retries, validates, or reinterprets what the package does.
 *
 * The ONE thing this file adds is app identity: this app's audio system mounts
 * lazily, so a claim has to wake it before the package takes ownership —
 * otherwise the session registry and the Audio panel have no mirror for raw
 * recorders (voice messages, flashcards) that never go through the global
 * engine. `activateAudio()` is that mount, and it is a fact about this app, not
 * about capture.
 */

import {
  claimAudioCapture,
  isAudioCaptureActive,
  releaseAudioCapture,
  subscribeAudioCapture,
  subscribeAudioCaptureDiagnostic,
  type AudioCaptureHolder,
} from "@ai-matrx/browser-audio/core";

import { activateAudio } from "@/features/audio/activation";

export type CaptureHolder = AudioCaptureHolder;

// The package reports arbitration failures through a typed sink rather than
// assuming a logging vendor. Choosing the console is this app's decision, so it
// is made here — the failure itself is detected and worded by the package.
subscribeAudioCaptureDiagnostic((diagnostic) => {
  console.error(`[captureLock] ${diagnostic.message}`, diagnostic.cause);
});

/** Claim exclusive capture, mounting this app's lazy audio system first. */
export function claimCapture(holder: CaptureHolder): void {
  activateAudio();
  claimAudioCapture(holder);
}

export const releaseCapture = releaseAudioCapture;
export const isCaptureActive = isAudioCaptureActive;
export const subscribeCapture = subscribeAudioCapture;

export { getActiveAudioCaptureId as getActiveCaptureId } from "@ai-matrx/browser-audio/core";

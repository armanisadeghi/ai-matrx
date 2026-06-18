"use client";

/**
 * RecordingPill — ELIMINATED.
 *
 * This used to render a floating recording indicator (top-center). The user
 * found it intrusive ("comes up and goes on top of things") — and every
 * recording surface already owns its own visible state + stop control (the
 * Scribe capture record button, the Agent+ mic, the focused working-document
 * editor's Stop, and the Scribe-section `GlobalRecordingIndicator` for
 * recording-elsewhere awareness). So there is no global floating pill anymore.
 *
 * The component is kept as a no-op (it's mounted in app/Providers.tsx and
 * app/EntityProviders.tsx) so those mounts stay valid without churn; it renders
 * nothing. Do NOT reintroduce a fixed/floating recording widget here.
 */
export function RecordingPill() {
  return null;
}

/**
 * Surface manifest — Transcript Studio (`matrx-user/transcript-studio`).
 *
 * The 4-column live transcription studio. Lives BOTH as a route
 * (`/transcripts/studio`, `StudioView` with containerVariant "page") and as
 * a floating window (overlay `transcriptStudioWindow`,
 * `TranscriptStudioWindow`, containerVariant "window"). Recording survives
 * window close — the recorder lives in `GlobalRecordingProvider` at the app
 * shell; `activeSessionId` comes from `features/transcript-studio` Redux.
 *
 * DELIBERATELY MINIMAL: the studio has rich hand-coded scope vocabulary
 * (live recording with 3 agent pipelines — see
 * `features/surfaces/FEATURE.md`, 2026-05-15 history) that must be
 * preserved, not overwritten by a generic vocabulary. Only the session
 * identity is declared here.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "active_session_id",
    label: "Active session ID",
    description:
      "UUID of the transcription session open in the studio. Empty when no session is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
];

export const transcriptStudioManifest: SurfaceManifest = {
  surfaceName: "matrx-user/transcript-studio",
  readiness: "stub",
  readinessNote:
    "Session identity only. The studio has rich hand-coded scope vocabulary (3 agent pipelines — see features/surfaces/FEATURE.md, 2026-05-15) that must be PRESERVED; the full manifest + emitter need a dedicated pass that adopts that vocabulary rather than inventing a parallel one.",
  overlayId: "transcriptStudioWindow",
  urlPattern: "/transcripts/studio",
  label: "Transcript Studio",
  intro: `<surface_intro>
You are on the Transcript Studio — the live transcription workbench where the user records audio and watches agent pipelines process the transcript in real time. active_session_id identifies the transcription session in focus. Recording continues even if the floating window is closed; only the explicit Stop button ends it.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createTranscriptStudioScope(values: {
  active_session_id?: string;
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

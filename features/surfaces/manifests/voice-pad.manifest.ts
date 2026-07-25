/**
 * Surface manifest — Voice Pad (`matrx-user/voice-pad`).
 *
 * The floating Voice Pad window (overlay `voicePad`, multi-instance
 * `VoicePad`): quick dictation. The mic button streams a live transcript;
 * completed dictations accumulate as entries; the combined text can be
 * edited as a draft and sent onward via the content action bar. State
 * lives in `voicePadSlice` keyed by (overlayId, instanceId).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "content",
    label: "Primary content",
    description:
      "The pad's current working text — the edited draft when one exists, otherwise all completed dictation entries joined. Empty when the pad is blank.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 200,
  },
  {
    name: "transcript_entries",
    label: "Transcript entries",
    description:
      "Completed dictation entries in order ({ id, text } each). Empty array when nothing has been dictated in this pad instance.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 300,
  },
  {
    name: "draft_text",
    label: "Draft text",
    description:
      "The user's manual edit of the combined transcript. Absent when the combined text has not been edited.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 310,
  },
  {
    name: "live_transcript",
    label: "Live transcript",
    description:
      "In-progress transcription of the current dictation while the mic is active. Empty when not recording.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 320,
  },
];

export const voicePadManifest: SurfaceManifest = {
  surfaceName: "matrx-user/voice-pad",
  readiness: "stub",
  readinessNote:
    "Values authored from a code audit of VoicePad; no runtime emitter yet — nothing emits this scope.",
  overlayId: "voicePad",
  label: "Voice Pad",
  intro: `<surface_intro>
You are on the Voice Pad — a small floating dictation window. The user speaks; completed dictations accumulate as transcript_entries and combine into content (or the user's edited draft_text). Agents here typically clean up, restructure, or act on the dictated text — treat it as spoken-word input: expect filler, missing punctuation, and homophone errors.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export function createVoicePadScope(values: {
  content?: string;
  transcript_entries?: Array<{ id: string; text: string }>;
  draft_text?: string;
  live_transcript?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

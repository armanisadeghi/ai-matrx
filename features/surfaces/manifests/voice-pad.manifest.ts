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
  SurfaceWriteTarget,
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

// ---------------------------------------------------------------------------
// Write half — the pad's ONE editable buffer.
// ---------------------------------------------------------------------------

/**
 * How a `pad_text` write combines with the pad's current working text. THE
 * vocabulary — the manifest description below and the handler in
 * `VoicePad.tsx` both read this constant, so they cannot drift.
 */
export const VOICE_PAD_TEXT_WRITE_MODES = ["replace", "append"] as const;

export type VoicePadTextWriteMode = (typeof VOICE_PAD_TEXT_WRITE_MODES)[number];

/** Wire value for the `pad_text` write target. */
export interface VoicePadTextWrite {
  /** The text to stage. Non-empty. */
  text: string;
  /** Defaults to `"replace"`. */
  mode?: VoicePadTextWriteMode;
}

/**
 * ONE target, deliberately. The pad holds exactly one piece of AUTHORED state
 * — the editable draft the user types into (`voicePadSlice.draftText`, shown
 * as `content`). Everything else it holds is CAPTURED EVIDENCE: `live_transcript`
 * and `transcript_entries` are what the microphone actually heard, and an agent
 * rewriting them would fabricate a record of something a human said. They get no
 * target, and neither does anything that starts/stops the mic (a device action
 * the human presses) or clears the pad (destructive — Clear stays human).
 *
 * The handler is registered by `VoicePad.tsx` on the SurfaceRuntimeProvider it
 * already mounts, and dispatches the SAME `setDraftText` action the textarea's
 * onChange dispatches.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "pad_text",
    label: "Pad text",
    description:
      `Stages text into the Voice Pad's editable draft — the same buffer the user types into, so it appears in the pad's textarea immediately. Nothing is persisted: the user still sends or saves the pad onward. Value: { text: string (non-empty), mode?: ${VOICE_PAD_TEXT_WRITE_MODES.join(" | ")} } — "replace" (the default) swaps the pad's ENTIRE working text, "append" adds after the current text separated by a blank line. Read \`content\` first when rewriting so you keep what the user wants kept. This never alters the recorded dictation — \`transcript_entries\` and \`live_transcript\` are the captured microphone record and stay untouched.`,
    valueType: "object",
    updatesValue: "content",
    mode: "draft",
    applyPolicy: "ask",
    sortOrder: 200,
  },
];

export const voicePadManifest: SurfaceManifest = {
  surfaceName: "matrx-user/voice-pad",
  readiness: "partial",
  readinessNote:
    "Emitter wired 2026-08-09 (nested SurfaceRuntimeProvider inside VoicePad — entries/draft/live transcript from voicePadSlice + local state at Run time). Needs the live browser pass to earn verified.",
  overlayId: "voicePad",
  label: "Voice Pad",
  intro: `<surface_intro>
You are on the Voice Pad — a small floating dictation window. The user speaks; completed dictations accumulate as transcript_entries and combine into content (or the user's edited draft_text). Agents here typically clean up, restructure, or act on the dictated text — treat it as spoken-word input: expect filler, missing punctuation, and homophone errors.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
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

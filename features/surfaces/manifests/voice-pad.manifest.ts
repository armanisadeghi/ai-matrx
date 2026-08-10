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
  {
    name: "is_recording",
    label: "Recording",
    description:
      "True while this pad's mic is actively recording. Always present. Check it before writing `pad_text` — a write is REFUSED while dictation is in flight, because the finished transcription is about to land in the same pad.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 330,
  },
  {
    name: "is_transcribing",
    label: "Transcribing",
    description:
      "True while a finished recording is still being transcribed (post-stop, pre-commit) — the speech has not landed in the pad yet. Always present. Like `is_recording`, it blocks `pad_text` writes.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 340,
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
 *
 * IN-FLIGHT DICTATION IS REFUSED (`is_recording` / `is_transcribing`). This is
 * not caution for its own sake — it closes a real way to lose speech. A pad
 * write sets `draftText`, and a non-null draft is what the textarea renders;
 * but `handleTranscriptionComplete` only pushes finished speech into
 * `entries`. So a write landing mid-dictation leaves the user watching the
 * agent's text while the words they just said are nowhere on screen (recorded
 * in the entries list, but silently absent from the box they are reading).
 * The handler throws instead, and the two flags above are declared so an agent
 * can see the refusal coming rather than discover it. Same posture as
 * `matrx-user/image-generate`, which refuses to rewrite a request mid-run.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "pad_text",
    label: "Pad text",
    description:
      `Stages text into the Voice Pad's editable draft — the same buffer the user types into, so it appears in the pad's textarea immediately. Nothing is persisted: the user still sends or saves the pad onward. Value: { text: string (non-empty), mode?: ${VOICE_PAD_TEXT_WRITE_MODES.join(" | ")} } — "replace" (the default) swaps the pad's ENTIRE working text, "append" adds after the current text separated by a blank line. Read \`content\` first when rewriting so you keep what the user wants kept. This never alters the recorded dictation — \`transcript_entries\` and \`live_transcript\` are the captured microphone record and stay untouched. REFUSED while \`is_recording\` or \`is_transcribing\` is true: the user is mid-dictation and their finished speech is about to land in this same box, so wait for it to arrive and then write.`,
    valueType: "object",
    updatesValue: "content",
    mode: "draft",
    applyPolicy: "ask",
    sortOrder: 200,
  },
];

/**
 * Write half of the 360 loop — what an agent may WRITE into the pad.
 *
 * This surface is deliberately NARROW: the pad owns exactly one authored
 * field, the draft buffer behind its textarea, and both targets below write
 * that one field. It still earns them because cleanup IS the pad's purpose —
 * dictation arrives with filler, no punctuation, and homophone errors, and
 * "tidy up what I just said" is the single most valuable thing an agent can
 * do here. The pair mirrors `matrx-user/agent-builder`'s
 * `system_instruction` / `append_system_instruction`: replace when the whole
 * buffer is being rewritten, append when only new text is being added, so a
 * long dictation never has to be round-tripped through the model just to add
 * a sentence to the end of it.
 *
 * WHAT IS DELIBERATELY NOT HERE, and must stay that way:
 *
 *  - `transcript_entries` and `live_transcript` are OBSERVED EVIDENCE — what
 *    the microphone actually heard. An agent that could rewrite the raw
 *    transcript could launder invention into something the user reads back as
 *    a faithful record of their own words, and there would be no way to tell
 *    the two apart afterwards. This is the same line the shipped
 *    `matrx-user/scraper` surface draws around scraped page content: the
 *    planning half is writable, the captured half never is. Cleanup belongs
 *    in the draft, where the entries list stays beside it as the untouched
 *    original.
 *  - Recording start/stop is a DEVICE action (it opens the user's
 *    microphone), not a write target.
 *  - Clearing the pad and removing entries are destructive and stay human —
 *    which is also why `draft_text` refuses an empty string rather than
 *    offering "erase everything" through the back door.
 *  - Sending the pad onward (the content action bar — save as a note, a task,
 *    a document) stays the user's press. Composing the text is the agent's
 *    job; deciding where it lands is not.
 *
 * Both targets are `mode: "draft"` + `applyPolicy: "ask"`: the value is
 * dispatched through `setDraftText`, the SAME action the pad's textarea
 * fires on every keystroke, so the change is visible in the pad immediately
 * and nothing is persisted anywhere until the user acts on it.
 *
 * MOUNTS: `VoicePad` (`components/official-candidate/voice-pad/components/
 * VoicePad.tsx`, overlay `voicePad`) is the only component that mounts a
 * `SurfaceRuntimeProvider` for this surface, so it is the only mount that
 * offers these targets — and it registers handlers for both.
 * `VoicePadAdvanced` (overlay `voicePadAdvanced`) and `VoicePadEmbed` share
 * the same `voicePadSlice` machinery but mount no surface runtime at all, so
 * they emit none of this surface's read values either; an agent run there is
 * offered no write tool. Giving them targets would mean adopting the surface
 * on those mounts first, read side included — a separate task. The
 * transcription-cleanup pad is a DIFFERENT surface
 * (`matrx-user/transcripts-cleanup`) and is untouched by this.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "draft_text",
    label: "Draft text",
    description:
      "REPLACES the pad's entire working text with the string you pass — it lands in the pad's textarea exactly as given, as if the user had selected all and retyped it. This is the cleaned-up-dictation target: read `content` first (that is the text the user is looking at, draft or entries joined) and pass back the full rewritten version, since nothing you omit is kept. Plain text only, not JSON or an object. An empty or whitespace-only string is refused — clearing the pad is the user's own button, not a write. The original dictation stays untouched in `transcript_entries` beside your rewrite, so the user can always compare. Refused while the microphone is live.",
    valueType: "string",
    updatesValue: "draft_text",
    mode: "draft",
    applyPolicy: "ask",
    sortOrder: 100,
  },
  {
    name: "append_draft_text",
    label: "Added draft text",
    description:
      "APPENDS the string you pass to the END of the pad's current working text, separated by a blank line. Nothing already in the pad is touched or re-sent — pass ONLY the new text. Use this to add a closing thought, a summary, or action items to a dictation; use `draft_text` when the whole buffer is being rewritten. When the user has not edited the pad yet, the existing dictation is carried into the draft first, so appending never drops what was already there. Plain text only, not JSON or an object; an empty or whitespace-only string is refused. Refused while the microphone is live.",
    valueType: "string",
    updatesValue: "draft_text",
    mode: "draft",
    applyPolicy: "ask",
    sortOrder: 110,
  },
];

export const voicePadManifest: SurfaceManifest = {
  surfaceName: "matrx-user/voice-pad",
  readiness: "verified",
  readinessNote:
    "Emitter wired 2026-08-09 (nested SurfaceRuntimeProvider inside VoicePad — entries/draft/live transcript from voicePadSlice + local state at Run time); read + write both confirmed in a live agent run 2026-08-10. NOTE for anyone verifying this surface: the header Agents panel prefers the ROUTE surface over a deeper floating runtime, so on a mapped route the popover offers that route's agents and the run carries ITS scope, even though the pad's write targets are still injected (they come off the live runtime stack). Open the pad from a route with no surface mapping — /reports works — to exercise this surface end to end.",
  overlayId: "voicePad",
  label: "Voice Pad",
  intro: `<surface_intro>
You are on the Voice Pad — a small floating dictation window. The user speaks; completed dictations accumulate as transcript_entries and combine into content (or the user's edited draft_text). Agents here typically clean up, restructure, or act on the dictated text — treat it as spoken-word input: expect filler, missing punctuation, and homophone errors.

You can also WRITE the cleaned-up text back into the pad. Two targets, both landing in the same editable buffer the user types in: draft_text REPLACES the whole buffer, append_draft_text ADDS to the end of it. Read content before you replace it — a replacement keeps nothing you leave out.

What you may not write is the RECORD of what was said: transcript_entries and live_transcript are what the microphone actually heard, and they stay read-only so the user always has the untouched original beside your rewrite. Never present a cleanup as if it were the transcript. Starting or stopping the recording, clearing the pad, and sending the text onward are the user's own actions — do those in your answer, not through a write.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createVoicePadScope(values: {
  // alwaysAvailable: true → required
  is_recording: boolean;
  is_transcribing: boolean;
  // alwaysAvailable: false → optional
  content?: string;
  transcript_entries?: Array<{ id: string; text: string }>;
  draft_text?: string;
  live_transcript?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

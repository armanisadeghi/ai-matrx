/**
 * Surface manifest — Transcript Scribe (`matrx-user/transcript-scribe`).
 *
 * The live audio-first studio at `/transcripts/scribe/:sessionId` (record →
 * clean → working document, with a per-session assistant conversation
 * roster). The `ui_surface` row predates this manifest (it has served as the
 * dictionary surface key — `SCRIBE_DICTIONARY_SURFACE` — since 2026-06); this
 * manifest makes the surface code-first and owns the `assistant` agent role.
 *
 * `assistant` role: the agent behind the Scribe assistant conversation. The
 * platform default is the seeded audio assistant (AUDIO_ASSISTANT_AGENT_ID);
 * users/orgs override via `ui_surface_agent_pref` (resolved in
 * `resolveDefaultAssistantAgentId` — this REPLACED the deleted
 * `userPreferences.transcription.scribeAssistantAgentId` preference,
 * 2026-07-12). Per-session choices live on the session roster and still win.
 *
 * Deliberately NOT `inheritsFrom: "matrx-user/transcripts"` — the transcripts
 * parent declares the viewer vocabulary (segments, playback position,
 * speakers) that the live studio does not emit; inheriting would advertise
 * values this surface never supplies. Generic baselines are auto-injected by
 * the registry.
 *
 * Groups audit (2026-07-24): this manifest's five resolved values are all
 * registry-injected baselines, which land in the reserved synthesized
 * `baseline` group — there are no own values to curate, so no `groups` are
 * declared. The studio's rich per-turn context (recording_NN_raw /
 * session_cleaned / working_document, built in
 * `features/transcript-studio/service/assistantContextBuilder.ts`) reaches the
 * assistant via named instance-context entries through `smartExecute`, NOT via
 * a surface `applicationScope` emitter. Declaring those as surface values
 * without an emitter would advertise values the launch path never supplies;
 * when a real surface-scope emitter lands, declare them (with curated groups)
 * in the same change.
 *
 * NO `writeTargets`, ASSESSED AND DECLINED 2026-08-12 — do not "finish" this
 * by adding some. See the Change Log in `features/surfaces/FEATURE.md` and
 * `features/transcript-studio/FEATURE.md` for the full reasoning. In short:
 *
 *  1. The one artifact authored on `/transcripts/scribe/:sessionId` is the
 *     working document, and `matrx-user/transcript-scribe-live` already
 *     declares `working_document_content` + `append_working_document` over it
 *     on this SAME `urlPattern` (2026-08-11). A second path is duplication.
 *  2. The cleaned-transcript and concepts columns that look like candidates
 *     are NOT on this route — they render only in `ActiveSessionView`
 *     (`/transcripts/studio` + the studio window) and are already writable via
 *     `matrx-user/transcript-studio`'s `cleaned_segment_text` / `concept_item`.
 *     This route renders `ScribeScreen`, whose transcript viewers are read-only.
 *  3. A provider here would be UNREACHABLE. All four Scribe tabs stay mounted
 *     (visibility flips via `hidden`), so `ScribeLiveScreen`'s provider is live
 *     on every tab, and agent launch adopts ONE surface via `getSurfaceRuntime()`
 *     — the DEEPEST runtime. A provider on the `ScribeScreen` ancestor would
 *     never be selected and its targets would be dead code.
 *
 * The session title is the only uncovered editable control and is a documented
 * refusal already (`transcripts-cleanup` owns that column; `useStudioAutoLabel`
 * derives it). This surface is config-and-roles — dictionary, session defaults,
 * the `assistant` role — not a page-runtime surface.
 */

import type { SurfaceManifest } from "@/features/surfaces/types";
import { AUDIO_ASSISTANT_AGENT_ID } from "@/features/transcript-studio/constants";

/** Canonical surface name for the Scribe studio. */
export const TRANSCRIPT_SCRIBE_SURFACE = "matrx-user/transcript-scribe";

export const transcriptScribeManifest: SurfaceManifest = {
  surfaceName: TRANSCRIPT_SCRIBE_SURFACE,
  readiness: "partial",
  readinessNote: "Context flows via smartExecute (useStudioAssistant), no surface-scope emitter",
  label: "Transcript Scribe",
  urlPattern: "/transcripts/scribe/:sessionId",
  // Baselines (selection / text_before / text_after / content / context) are
  // injected by the registry; the studio's rich per-column values stay
  // feature-owned until a real emitter lands (no speculative declarations).
  values: [],
  agentRoles: [
    {
      name: "assistant",
      label: "Scribe assistant",
      description:
        "The agent behind the Scribe assistant conversation. New sessions start with this agent; each session can switch on its own roster.",
      kind: "single",
      defaultAgentId: AUDIO_ASSISTANT_AGENT_ID,
      allowCustom: true,
      autoRun: "user-choice",
      sortOrder: 10,
    },
  ],
  configNamespaces: [
    {
      namespace: "dictionary",
      label: "Dictionary",
      description:
        "Term corrections and pronunciations applied to Scribe transcription and TTS (org + user layers merged).",
    },
    {
      namespace: "session_defaults",
      label: "Session defaults",
      description:
        "Seed values a NEW Scribe session starts from (per-session settings stay on studio_session_settings).",
    },
  ],
};

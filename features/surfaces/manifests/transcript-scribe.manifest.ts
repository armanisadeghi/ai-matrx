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
 */

import type { SurfaceManifest } from "@/features/surfaces/types";
import { AUDIO_ASSISTANT_AGENT_ID } from "@/features/transcript-studio/constants";

/** Canonical surface name for the Scribe studio. */
export const TRANSCRIPT_SCRIBE_SURFACE = "matrx-user/transcript-scribe";

export const transcriptScribeManifest: SurfaceManifest = {
  surfaceName: TRANSCRIPT_SCRIBE_SURFACE,
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

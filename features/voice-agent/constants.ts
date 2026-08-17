// features/voice-agent/constants.ts
//
// Frozen constants for the xAI Realtime voice agent.

import type { RealtimeToolSet, VoiceId } from "./types";

export const XAI_REALTIME_URL =
  "wss://api.x.ai/v1/realtime?model=grok-voice-latest";

export const XAI_MODEL_ID = "grok-voice-latest";

/** Hard-coded by xAI's audio pipeline; do NOT change without coordinating the worklet. */
export const SAMPLE_RATE_HZ = 24000;

/** 20ms at 24kHz mono. Matches the worklet's frame batching. */
export const FRAME_SAMPLES = 480;

/** Token TTL we request from xAI. Must be >> refresh-skew below. */
export const TOKEN_TTL_SECONDS = 300;

/** Refresh the ephemeral token this many seconds before `expires_at`. */
export const TOKEN_REFRESH_SKEW_SECONDS = 30;

/** Safety cap on the pre-`session.updated` mic buffer. ~10s at 24kHz mono. */
export const MIC_PREBUFFER_MAX_SAMPLES = 240_000;

/**
 * How far behind the actually-played audio the transcript reveal lags.
 *
 * xAI streams transcript deltas a few hundred ms AHEAD of the audio bytes
 * they describe. Without a lag the visible text races past what the user
 * is hearing; with the lag the reveal stays slightly behind the sound,
 * which reads as natural ("I see it as I hear it"). 250 ms hits the
 * sweet spot for most voices — tune here if it feels off.
 */
export const TRANSCRIPT_REVEAL_LAG_MS = 250;

export const VOICES: ReadonlyArray<{ id: VoiceId; label: string }> = [
  { id: "ara", label: "Ara" },
  { id: "eve", label: "Eve" },
  { id: "leo", label: "Leo" },
  { id: "rex", label: "Rex" },
  { id: "sal", label: "Sal" },
] as const;

export const DEFAULT_INTRO_VOICE: VoiceId = "ara";

/**
 * Fallback tool set seeded synchronously before `useRealtimeAgentConfig`
 * resolves the real set from the backend. Both are xAI builtins, so they
 * carry empty params and `execution: "builtin"` — they emit `{type: name}`
 * in `session.update` and are never client-executed.
 */
export const DEFAULT_INTRO_TOOLS: RealtimeToolSet = [
  { name: "web_search", description: "Search the web.", parameters: {}, execution: "builtin" },
  { name: "x_search", description: "Search X (Twitter).", parameters: {}, execution: "builtin" },
];

/**
 * 🚨 THE INTRO AGENT PERSONA IS NOT IN THIS REPO — it is the system message
 * of the agent row the `voice.intro` mandate resolves to. Until 2026-08-16 an
 * exact copy lived here as `INTRO_INSTRUCTIONS` and was used as a silent
 * fallback; it is deleted (Arman: the codebase is the connection, never the
 * definition).
 *
 * Where the pronunciation rules went: they are part of that agent record. An
 * xAI realtime agent has no SSML/lexicon/IPA controls, so brand pronunciation
 * can only be taught in the instructions — add new tricky words to the agent
 * in the builder, under its `## Pronunciation` section, NOT here.
 */


/** Discriminator used in `cx_conversation.source_app` for voice rows. */
export const PERSISTENCE_SOURCE_APP = "matrx-frontend";

/** Discriminator used in `cx_conversation.source_feature` for voice rows. */
export const PERSISTENCE_SOURCE_FEATURE = "voice-agent";

/**
 * `cx_message.source` is a strictly enumerated CHECK constraint
 * (`cx_message_source_check`) — only `'user'` and `'system'` are allowed,
 * verified by probing the live DB. The column describes the message's
 * INPUT source (typed by a user vs system-injected), not the feature it
 * came from. Voice provenance lives in `metadata.voice.provider` instead.
 *
 *   - user voice turn  → source='user'   (caller actually spoke it)
 *   - assistant turn   → source='system' (system generated via xAI Realtime)
 *
 * This matches the pattern aidream uses at `cx_data.py:933` for any
 * system-injected message. Do NOT pass voice-specific strings like
 * 'xai-voice' here — they will violate the check constraint.
 */
export const PERSISTENCE_MESSAGE_SOURCE_USER = "user";
export const PERSISTENCE_MESSAGE_SOURCE_ASSISTANT = "system";

/** Provider identifier baked into `cx_conversation.metadata.voice.provider`. */
export const PERSISTENCE_PROVIDER = "xai-realtime";

export const PERSISTENCE_REGION = "us-east-1";

/**
 * The mandate that decides WHICH agent runs the locked `/chat/voice` intro
 * experience. Declared in aidream `services/mandates/client_mandates.py`;
 * resolved via `resolveMandateServer` in the route. Duplicating the resolved
 * agent in the Agent Builder (then binding it here) is the supported way to
 * create a custom voice agent.
 *
 * 🚨 A raw agent UUID lived here until 2026-08-16. Never reintroduce one — the
 * mandate is the only sanctioned way to name an agent from this repo.
 */
export const VOICE_INTRO_MANDATE_KEY = "voice.intro";

/**
 * The mandate for the Scribe Live Assistant — the studio's Live tab. Its agent
 * carries the inline working-document mutator client tools
 * (`scribe_working_doc_append` / `_append_heading`) plus the auto-injected
 * `data`/`data_action` server tools; `useRealtimeAgentConfig` +
 * `useXaiVoiceSession` receive the RESOLVED id so the backend classifies those
 * tools for the voice session.
 */
export const SCRIBE_LIVE_MANDATE_KEY = "transcript_studio.scribe_live";

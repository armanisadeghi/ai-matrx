// features/voice-agent/constants.ts
//
// Frozen constants for the xAI Realtime voice agent.

import type { ToolName, VoiceId } from "./types";

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

export const VOICES: ReadonlyArray<{ id: VoiceId; label: string }> = [
  { id: "ara", label: "Ara" },
  { id: "eve", label: "Eve" },
  { id: "leo", label: "Leo" },
  { id: "rex", label: "Rex" },
  { id: "sal", label: "Sal" },
] as const;

export const DEFAULT_INTRO_VOICE: VoiceId = "ara";

export const DEFAULT_INTRO_TOOLS: ToolName[] = ["web_search", "x_search"];

/**
 * The AI Matrx Introduction Agent system prompt. Frozen — the locked intro route
 * uses this verbatim. The playground route accepts user edits in a textarea but
 * defaults to this on first mount.
 *
 * ## Note on pronunciation
 *
 * xAI's Realtime Voice Agent API has NO pronunciation controls — no SSML,
 * no lexicons, no IPA, no phoneme overrides. Confirmed against
 * https://docs.x.ai/developers/model-capabilities/audio/voice-agent and the
 * broader Voice docs (the standalone TTS endpoint has delivery-style tags
 * like [laugh] / <whisper>, but those control emotion, not phonetics, and
 * they don't apply to the realtime agent). The only mechanism for fixing
 * brand / name / acronym pronunciation is the system instructions: the
 * agent writes the text itself, then TTS reads it phonetically, so we tell
 * the agent how to render proper nouns aloud.
 *
 * The `## Pronunciation` section below is the canonical place to add new
 * tricky words as we find them. Pattern: "Spelled X — pronounced/say it as Y".
 */
export const INTRO_INSTRUCTIONS = `# AI Matrx Introduction Agent

You are a knowledgeable and approachable guide to AI Matrx, a production-grade agentic harness that helps businesses and enterprises turn frontier AI models into reliable, custom-built agents and workflows. Your role is to introduce callers to what AI Matrx does, understand their needs, and help them see where AI can fit into their business.

## Pronunciation (very important — read once, then internalize)

These rules govern how you SPEAK proper nouns. Treat them as spoken-form substitutions: when the underlying text contains the SPELLING on the left, your spoken delivery is the WORD on the right. Do NOT spell the letters out loud.

- "Matrx" → spoken as the English word "Matrix" (M-A-T-R-I-X), never "MAT-rks" or "M-A-T-R-X".
- "AI Matrx" → spoken as "A.I. Matrix" — the letters A and I said one at a time, then the word "Matrix".
- "aimatrx.com" → spoken as "A.I. Matrix dot com".
- "Matrx Engine" → spoken as "Matrix Engine".
- "matrxserver.com" → spoken as "Matrix server dot com".

If you ever catch yourself about to say the letters M, A, T, R, X individually as a name, stop and say the word "Matrix" instead. The brand name is intentionally spelled without the I in writing, but it is always spoken as "Matrix".

## Core Behaviors
- Greet callers warmly and briefly explain what AI Matrx is in plain language
- Ask thoughtful questions to understand the caller's business, current workflows, and pain points
- Identify opportunities where custom AI agents or AI-integrated apps could help
- Walk callers through how AI Matrx works at a high level: building custom agents, connecting them to real tools, and running them reliably in production
- Help callers think through their first use case — what problem to solve, what tools the agent would need, and what success looks like
- Offer to kick off next steps like creating a new agent, scoping an integration, or connecting them with the team for deeper work

## What to Convey About AI Matrx
- AI Matrx is the harness around frontier models — the system that makes models like Claude, GPT, and Gemini reliable, observable, and goal-directed in real production use
- Businesses use it to build custom agents with persistent memory, real tool access, safe execution, and full traceability — without writing fragile glue code
- Everything is toggleable and customizable: memory, tools, orchestration, guardrails, and model routing
- It works in three stages: Build the agent, Test it, then Consume it through chat, app integrations, or even a single click

## Communication Style
- Be warm, curious, and conversational — not salesy
- Speak in plain language; avoid jargon unless the caller uses it first
- Ask one question at a time and actually listen to the answer
- Use concrete examples when explaining concepts
- Confirm understanding by reflecting back what you heard before suggesting next steps

## Guidelines
- Focus on the caller's problem first, the product second
- If a caller isn't sure what they need, help them explore — don't push
- Be honest about what AI Matrx is great for and what it isn't
- If a question goes beyond your scope, offer to connect them with the right person on the team
- Never overpromise capabilities or timelines`;

/** Discriminator used in `cx_conversation.source_app` for voice rows. */
export const PERSISTENCE_SOURCE_APP = "chat";

/** Discriminator used in `cx_conversation.source_feature` for voice rows. */
export const PERSISTENCE_SOURCE_FEATURE = "voice-agent";

/** Discriminator used in `cx_message.source` for voice turn rows. */
export const PERSISTENCE_MESSAGE_SOURCE = "xai-voice";

/** Provider identifier baked into `cx_conversation.metadata.voice.provider`. */
export const PERSISTENCE_PROVIDER = "xai-realtime";

export const PERSISTENCE_REGION = "us-east-1";

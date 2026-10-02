// features/voice-agent/transport/clientEvents.ts
//
// Outbound message builders for the xAI Realtime WebSocket. Keeping these in
// one place makes the wire protocol changes a one-file diff.

import type { RealtimeToolSet, VoiceId } from "../types";
import {
  SAMPLE_RATE_HZ,
  TURN_PREFIX_PADDING_MS,
  TURN_SILENCE_MS,
} from "../constants";

export interface SessionUpdatePayload {
  voiceId: VoiceId;
  instructions: string;
  tools: RealtimeToolSet;
  /**
   * When false, server VAD still detects turns (transcription events fire)
   * but the model does NOT auto-generate a response — a response happens only
   * on an explicit `response.create`. This is THE ROUTING LAW's mechanical
   * half for the Voice Communication Layer (the relay routes the user's
   * transcript to a primary text agent and cues speech itself). Default true
   * (omitted on the wire) — every non-relay surface keeps today's behavior.
   */
  createResponseOnTurn?: boolean;
  /**
   * How long the speaker may go quiet before server VAD calls the turn over,
   * in milliseconds. See `TURN_SILENCE_MS` — the default is deliberately
   * generous, because a person thinking out loud pauses mid-sentence and
   * being cut off is the worst thing this surface can do.
   */
  turnSilenceMs?: number;
  /**
   * How much audio before speech onset is kept, in milliseconds. Guards the
   * first syllable, which VAD otherwise clips.
   */
  turnPrefixPaddingMs?: number;
}

/**
 * The two xAI wire shapes for a tool in `session.update`:
 *   - builtin → `{type: "<name>"}` (xAI runs it server-side).
 *   - function (server/client execution) → a full function declaration with
 *     the JSON-Schema parameters so the model can call it.
 */
type XaiBuiltinTool = { type: string };
type XaiFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};
type XaiTool = XaiBuiltinTool | XaiFunctionTool;

export function buildSessionUpdate(payload: SessionUpdatePayload): string {
  const tools: XaiTool[] = payload.tools.map((t) =>
    t.execution === "builtin"
      ? { type: t.name }
      : {
          type: "function",
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
  );
  return JSON.stringify({
    type: "session.update",
    session: {
      voice: payload.voiceId,
      instructions: payload.instructions,
      // THE TURN IS THE SPEAKER'S TO END. `silence_duration_ms` is always sent
      // — the provider default is short enough to cut a person off mid-thought,
      // which is exactly what a slow, considered answer sounds like to VAD.
      turn_detection: {
        type: "server_vad",
        silence_duration_ms: payload.turnSilenceMs ?? TURN_SILENCE_MS,
        prefix_padding_ms:
          payload.turnPrefixPaddingMs ?? TURN_PREFIX_PADDING_MS,
        ...(payload.createResponseOnTurn === false
          ? { create_response: false }
          : {}),
      },
      tools,
      input_audio_transcription: { model: "grok-2-audio" },
      audio: {
        input: { format: { type: "audio/pcm", rate: SAMPLE_RATE_HZ } },
        output: { format: { type: "audio/pcm", rate: SAMPLE_RATE_HZ } },
      },
    },
  });
}

export function buildAudioAppend(b64Pcm: string): string {
  return JSON.stringify({
    type: "input_audio_buffer.append",
    audio: b64Pcm,
  });
}

export function buildResponseCancel(): string {
  return JSON.stringify({ type: "response.cancel" });
}

export function buildFunctionCallOutput(callId: string, output: string): string {
  return JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output,
    },
  });
}

export function buildResponseCreate(instructions?: string): string {
  if (instructions && instructions.trim().length > 0) {
    return JSON.stringify({
      type: "response.create",
      response: { instructions },
    });
  }
  return JSON.stringify({ type: "response.create" });
}

/**
 * Inject a text message into the realtime conversation (the Voice
 * Communication Layer's cue channel — a primary agent's answer, a narration
 * cue). `id` is client-minted so the relay can prune its own items later.
 */
export function buildConversationTextItem(
  id: string,
  role: "user" | "assistant",
  text: string,
): string {
  return JSON.stringify({
    type: "conversation.item.create",
    item: {
      id,
      type: "message",
      role,
      content: [{ type: "input_text", text }],
    },
  });
}

/** Delete a previously client-minted conversation item (relay window pruning). */
export function buildConversationItemDelete(itemId: string): string {
  return JSON.stringify({ type: "conversation.item.delete", item_id: itemId });
}

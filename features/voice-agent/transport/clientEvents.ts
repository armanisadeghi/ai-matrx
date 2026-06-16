// features/voice-agent/transport/clientEvents.ts
//
// Outbound message builders for the xAI Realtime WebSocket. Keeping these in
// one place makes the wire protocol changes a one-file diff.

import type { RealtimeToolSet, VoiceId } from "../types";
import { SAMPLE_RATE_HZ } from "../constants";

export interface SessionUpdatePayload {
  voiceId: VoiceId;
  instructions: string;
  tools: RealtimeToolSet;
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
      turn_detection: { type: "server_vad" },
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

export function buildResponseCreate(): string {
  return JSON.stringify({ type: "response.create" });
}

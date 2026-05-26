// features/voice-agent/transport/clientEvents.ts
//
// Outbound message builders for the xAI Realtime WebSocket. Keeping these in
// one place makes the wire protocol changes a one-file diff.

import type { ToolName, VoiceId } from "../types";
import { SAMPLE_RATE_HZ } from "../constants";

export interface SessionUpdatePayload {
  voiceId: VoiceId;
  instructions: string;
  tools: ToolName[];
}

export function buildSessionUpdate(payload: SessionUpdatePayload): string {
  const tools = payload.tools.map((name) => ({ type: name }));
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

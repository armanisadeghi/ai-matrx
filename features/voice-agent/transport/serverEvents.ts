// features/voice-agent/transport/serverEvents.ts
//
// Typed discriminated union for every server event emitted by the xAI
// Realtime API. Reference: the developer guide section 5 (and the live
// behavior of `wss://api.x.ai/v1/realtime`).
//
// The runtime parser (`parseServerEvent`) is permissive: unknown event types
// are returned as `{type: 'unknown', raw}` so we never throw on a new event
// type the API adds in the future, but we DO surface them in dev logs.

export type XaiVoiceId = string;

export interface XaiRateLimit {
  name: string;
  limit: number;
  remaining: number;
  reset_seconds: number;
}

export interface XaiResponseUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export type XaiServerEvent =
  | { type: "session.created"; session: { id: string; model: string } }
  | { type: "session.updated"; session: { id: string } }
  | { type: "conversation.created"; conversation: { id: string } }
  | {
      type: "conversation.item.added";
      item: { id: string; role?: "user" | "assistant"; type?: string };
    }
  | {
      type: "conversation.item.created";
      item: { id: string; role?: "user" | "assistant"; type?: string };
    }
  | { type: "input_audio_buffer.speech_started"; audio_start_ms?: number; item_id?: string }
  | { type: "input_audio_buffer.speech_stopped"; audio_end_ms?: number; item_id?: string }
  | { type: "input_audio_buffer.committed"; item_id?: string }
  | {
      type: "conversation.item.input_audio_transcription.delta";
      item_id?: string;
      delta: string;
    }
  | {
      type: "conversation.item.input_audio_transcription.completed";
      item_id?: string;
      transcript: string;
    }
  | { type: "response.created"; response: { id: string } }
  | {
      type: "response.output_item.added";
      response_id?: string;
      item: { id: string; type: string; name?: string; call_id?: string };
    }
  | {
      type: "response.output_item.done";
      response_id?: string;
      item: { id: string; type: string; status?: string };
    }
  | { type: "response.content_part.added"; item_id?: string; part: { type: string } }
  | { type: "response.content_part.done"; item_id?: string; part: { type: string } }
  /** Audio chunk — `delta` is base64 PCM at the session's output rate. */
  | { type: "response.output_audio.delta"; response_id?: string; item_id?: string; delta: string }
  | { type: "response.output_audio.done"; response_id?: string; item_id?: string }
  /** Some xAI builds use the bare `response.audio.delta` name. Treat as alias. */
  | { type: "response.audio.delta"; response_id?: string; item_id?: string; delta: string }
  | { type: "response.audio.done"; response_id?: string; item_id?: string }
  | {
      type: "response.output_audio_transcript.delta";
      response_id?: string;
      item_id?: string;
      delta: string;
    }
  | {
      type: "response.output_audio_transcript.done";
      response_id?: string;
      item_id?: string;
      transcript: string;
    }
  | { type: "response.audio_transcript.delta"; response_id?: string; item_id?: string; delta: string }
  | { type: "response.audio_transcript.done"; response_id?: string; item_id?: string; transcript: string }
  | {
      type: "response.function_call.created";
      response_id?: string;
      call_id: string;
      name: string;
    }
  | {
      type: "response.function_call_arguments.done";
      response_id?: string;
      call_id: string;
      name: string;
      arguments: string;
    }
  | { type: "response.function_call.done"; response_id?: string; call_id: string }
  | {
      type: "response.done";
      response: { id: string; status?: string; usage?: XaiResponseUsage };
    }
  | { type: "response.cancelled"; response_id?: string }
  | { type: "rate_limits.updated"; rate_limits: XaiRateLimit[] }
  | { type: "error"; code: string; message: string }
  | { type: "unknown"; raw: unknown };

export function parseServerEvent(raw: string): XaiServerEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { type: "unknown", raw } as XaiServerEvent;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { type?: unknown }).type !== "string"
  ) {
    return { type: "unknown", raw: parsed } as XaiServerEvent;
  }
  return parsed as XaiServerEvent;
}

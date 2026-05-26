// features/voice-agent/persistence/voiceTranscriptWriter.ts
//
// Browser → Supabase direct writes for the voice agent transcript.
// Reuses cx_conversation + cx_message (no schema changes) with discriminators:
//   - cx_conversation.source_app = 'chat'
//   - cx_conversation.source_feature = 'voice-agent'
//   - cx_message.source = 'xai-voice'
//
// Raw audio is NEVER persisted. Contractual.
//
// Idempotency: each turn's id (`metadata.voice.turn_id`) is a client-generated
// UUID. The orchestrator tracks `persistedTurnIds` in the slice to ensure we
// don't double-write across React strict mode / re-renders.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "@/types/database.types";
import {
  PERSISTENCE_MESSAGE_SOURCE_ASSISTANT,
  PERSISTENCE_MESSAGE_SOURCE_USER,
  PERSISTENCE_PROVIDER,
  PERSISTENCE_REGION,
  PERSISTENCE_SOURCE_APP,
  PERSISTENCE_SOURCE_FEATURE,
  XAI_MODEL_ID,
} from "../constants";
import type {
  LatencySummary,
} from "../state/selectors";
import type {
  ToolName,
  VoiceAgentPreset,
  VoiceId,
  VoiceTurn,
} from "../types";

type CxConversationInsert =
  Database["public"]["Tables"]["cx_conversation"]["Insert"];
type CxMessageInsert = Database["public"]["Tables"]["cx_message"]["Insert"];

export interface EnsureConversationOpts {
  voiceId: VoiceId;
  instructions: string;
  tools: ToolName[];
  preset: VoiceAgentPreset;
}

export interface PersistTurnsOpts {
  conversationId: string;
  /** Turns to write, in the same order they appear in the slice's `turns` array. */
  turns: VoiceTurn[];
  /** The starting position. Conventionally = number of already-persisted turns. */
  startPosition: number;
}

export interface FinalizeOpts {
  conversationId: string;
  totalTurns: number;
  totalInterruptions: number;
  latency: LatencySummary;
  preset: VoiceAgentPreset;
  voiceId: VoiceId;
  tools: ToolName[];
}

function clientOrThrow(): SupabaseClient<Database> {
  return createClient() as SupabaseClient<Database>;
}

export async function ensureConversation(
  conversationId: string,
  opts: EnsureConversationOpts,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = clientOrThrow();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return {
      ok: false,
      error: userErr?.message ?? "Not authenticated.",
    };
  }

  const metadataVoice: Record<string, Json> = {
    provider: PERSISTENCE_PROVIDER,
    // Model slug — xAI Realtime models are NOT in the `ai_model` table, so we
    // record the identifier here instead of in `cx_conversation.last_model_id`
    // (which is a UUID FK to ai_model.id and would 22P02 with a slug).
    model: XAI_MODEL_ID,
    voice_id: opts.voiceId,
    tools_enabled: opts.tools,
    region: PERSISTENCE_REGION,
    preset: opts.preset,
    total_turns: 0,
    total_interruptions: 0,
  };

  const insert: CxConversationInsert = {
    id: conversationId,
    user_id: user.id,
    is_ephemeral: false,
    status: "active",
    source_app: PERSISTENCE_SOURCE_APP,
    source_feature: PERSISTENCE_SOURCE_FEATURE,
    system_instruction: opts.instructions,
    // Intentionally NOT setting last_model_id — it's a UUID FK to ai_model.id,
    // and the xAI Realtime model isn't registered there. The model slug lives
    // in metadata.voice.model above.
    metadata: { voice: metadataVoice } as Json,
    overrides: { tools: opts.tools } as unknown as Json,
    message_count: 0,
  };

  // Use upsert so accidental double-init (e.g. React strict mode) is a no-op.
  const { error } = await supabase
    .from("cx_conversation")
    .upsert(insert, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    console.error(
      "[voiceTranscriptWriter] ensureConversation error:",
      error.message,
    );
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function persistTurns(
  opts: PersistTurnsOpts,
): Promise<
  | { ok: true; persistedTurnIds: string[] }
  | { ok: false; error: string }
> {
  if (opts.turns.length === 0) return { ok: true, persistedTurnIds: [] };
  const supabase = clientOrThrow();

  const rows: CxMessageInsert[] = opts.turns.map((turn, idx) => {
    const voiceMeta: Record<string, Json> = {
      turn_id: turn.id,
      started_at_ms: turn.started_at_ms,
      ended_at_ms: turn.ended_at_ms ?? null,
      was_interrupted: turn.status === "interrupted",
    };
    if (turn.item_id) voiceMeta.item_id = turn.item_id;
    if (turn.response_id) voiceMeta.response_id = turn.response_id;
    if (turn.audio_duration_ms !== undefined) {
      voiceMeta.audio_duration_ms = turn.audio_duration_ms;
    }
    if (turn.speech_ttfb_ms !== undefined) {
      voiceMeta.speech_ttfb_ms = turn.speech_ttfb_ms;
    }

    return {
      conversation_id: opts.conversationId,
      role: turn.role,
      position: opts.startPosition + idx,
      // `cx_message.source` only allows 'user' | 'system' (CHECK constraint).
      // Voice provenance lives in metadata.voice.provider — see constants.ts.
      source:
        turn.role === "user"
          ? PERSISTENCE_MESSAGE_SOURCE_USER
          : PERSISTENCE_MESSAGE_SOURCE_ASSISTANT,
      content: [
        { type: "text", text: turn.text || "" },
      ] as unknown as Json,
      metadata: { voice: voiceMeta } as Json,
      status:
        turn.status === "interrupted" ? "interrupted" : "completed",
      // Interrupted assistant turns must NOT poison future model context.
      is_visible_to_model:
        turn.role === "assistant" && turn.status === "interrupted"
          ? false
          : true,
      is_visible_to_user: true,
    } satisfies CxMessageInsert;
  });

  const { error } = await supabase.from("cx_message").insert(rows);
  if (error) {
    console.error("[voiceTranscriptWriter] persistTurns error:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, persistedTurnIds: opts.turns.map((t) => t.id) };
}

export async function finalizeConversation(
  opts: FinalizeOpts,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = clientOrThrow();

  const voiceMeta: Record<string, Json> = {
    provider: PERSISTENCE_PROVIDER,
    model: XAI_MODEL_ID,
    voice_id: opts.voiceId,
    tools_enabled: opts.tools,
    region: PERSISTENCE_REGION,
    preset: opts.preset,
    total_turns: opts.totalTurns,
    total_interruptions: opts.totalInterruptions,
    latency_p50_ms: opts.latency.p50_ms,
    latency_p95_ms: opts.latency.p95_ms,
    latency_sample_count: opts.latency.count,
  };

  const { error } = await supabase
    .from("cx_conversation")
    .update({
      message_count: opts.totalTurns,
      metadata: { voice: voiceMeta } as Json,
    })
    .eq("id", opts.conversationId);

  if (error) {
    console.error(
      "[voiceTranscriptWriter] finalizeConversation error:",
      error.message,
    );
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

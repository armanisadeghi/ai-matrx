/**
 * features/voice-agent/agent-context/voiceTranscriptScope.ts
 *
 * Pure state → surface-scope derivation shared by BOTH realtime voice
 * surfaces (`matrx-user/chat-voice` and `matrx-user/transcript-scribe-live`).
 * Neither surface may fork this: the two manifests declare byte-identical
 * transcript vocabulary, so they must derive it from one place.
 *
 * DURABLE TRUTH, NOT THE RENDER BUFFER (the research.manifest.ts discipline):
 * a `VoiceTurn` carries BOTH the full arrived transcript (`text`) and a
 * render-only cutoff (`text_reveal_index`) that gates how much of it is
 * painted on screen so the words track the audio. The screen therefore lags
 * the truth by design. Everything here reads `turn.text` — the complete
 * arrived transcript — never the reveal-truncated slice. An agent asking
 * "what did I just say" must get the utterance, not the animation frame.
 *
 * Turn STATUS is likewise reported verbatim (`pending` / `completed` /
 * `interrupted`) rather than filtered, so an agent can tell a finished
 * sentence from one the user talked over.
 */

import type { VoiceTurn } from "../types";

/** One transcript turn as emitted in `transcript_turns`. */
export interface VoiceTurnScopeEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "pending" | "completed" | "interrupted";
  started_at_ms: number;
  ended_at_ms: number | null;
}

/** The in-flight turn as emitted in `active_turn`. */
export interface VoiceActiveTurnScope {
  id: string;
  role: "user" | "assistant";
  text: string;
  started_at_ms: number;
}

/** Everything the transcript groups of both voice manifests need. */
export interface VoiceTranscriptScopeParts {
  /** alwaysAvailable: true */
  turn_count: number;
  /** alwaysAvailable: true — empty array before the first turn. */
  transcript_turns: VoiceTurnScopeEntry[];
  /** alwaysAvailable: false */
  transcript_text?: string;
  last_user_utterance?: string;
  last_assistant_utterance?: string;
  active_turn?: VoiceActiveTurnScope;
}

function speakerLabel(role: VoiceTurn["role"]): string {
  return role === "user" ? "User" : "Assistant";
}

/**
 * Derive the transcript vocabulary from the live turn list.
 *
 * Called at TRIGGER time by each surface's `getScope`, never on mount — the
 * turn array mutates on every transcript delta.
 */
export function deriveVoiceTranscriptScope(
  turns: readonly VoiceTurn[],
): VoiceTranscriptScopeParts {
  const transcript_turns: VoiceTurnScopeEntry[] = turns.map((t) => ({
    id: t.id,
    role: t.role,
    text: t.text,
    status: t.status,
    started_at_ms: t.started_at_ms,
    ended_at_ms: t.ended_at_ms ?? null,
  }));

  const parts: VoiceTranscriptScopeParts = {
    turn_count: turns.length,
    transcript_turns,
  };

  if (turns.length === 0) return parts;

  const transcriptText = turns
    .filter((t) => t.text.trim().length > 0)
    .map((t) => `${speakerLabel(t.role)}: ${t.text.trim()}`)
    .join("\n\n");
  if (transcriptText.length > 0) parts.transcript_text = transcriptText;

  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (
      parts.last_user_utterance === undefined &&
      t.role === "user" &&
      t.text.trim().length > 0
    ) {
      parts.last_user_utterance = t.text;
    }
    if (
      parts.last_assistant_utterance === undefined &&
      t.role === "assistant" &&
      t.text.trim().length > 0
    ) {
      parts.last_assistant_utterance = t.text;
    }
    if (
      parts.last_user_utterance !== undefined &&
      parts.last_assistant_utterance !== undefined
    ) {
      break;
    }
  }

  const pending = turns.find((t) => t.status === "pending");
  if (pending) {
    parts.active_turn = {
      id: pending.id,
      role: pending.role,
      text: pending.text,
      started_at_ms: pending.started_at_ms,
    };
  }

  return parts;
}

// features/voice-agent/relay/sideChannel.ts
//
// THE SIDE CHANNEL (Arman's ruling 6, 2026-08-17 — SoR:
// common-docs/systems/voice-communication-layer/FEATURE.md): the Communicator
// may speak on the brain's behalf (deliveries, mirrored summaries, small
// clarifications), and the brain must ALWAYS see everything that was said
// aloud — structured, by its next turn. This module is that structure: a log
// of voice-layer turns since the brain's last turn, drained into one
// `<voice_exchange>` block prepended to the next message the brain receives.
//
// Pure — unit-tested in relay.test.ts.

export interface VoiceExchangeTurn {
  speaker: "communicator" | "user";
  text: string;
}

export interface VoiceExchangeLog {
  record(speaker: VoiceExchangeTurn["speaker"], text: string): void;
  /** Returns everything recorded since the last drain, and clears the log. */
  drain(): VoiceExchangeTurn[];
  /** Read without clearing — for live context publication. */
  peek(): VoiceExchangeTurn[];
  size(): number;
}

/** Per-turn cap so one runaway transcript cannot bloat the brain's context. */
const MAX_TURN_CHARS = 1_500;
/** Cap on retained turns between brain sends (oldest dropped, loudly). */
const MAX_TURNS = 40;

export function createVoiceExchangeLog(): VoiceExchangeLog {
  const turns: VoiceExchangeTurn[] = [];
  return {
    record(speaker, text) {
      const trimmed = text.trim();
      if (!trimmed) return;
      turns.push({
        speaker,
        text:
          trimmed.length > MAX_TURN_CHARS
            ? `${trimmed.slice(0, MAX_TURN_CHARS)}…`
            : trimmed,
      });
      if (turns.length > MAX_TURNS) {
        console.warn(
          `[voice-relay] voice_exchange log exceeded ${MAX_TURNS} turns before ` +
            "a brain send — dropping the oldest. A brain turn should have " +
            "happened by now.",
        );
        turns.shift();
      }
    },
    drain() {
      return turns.splice(0, turns.length);
    },
    peek() {
      return turns.map((t) => ({ ...t }));
    },
    size() {
      return turns.length;
    },
  };
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The context system inlines a rich value into the prompt only up to
 * min(max_inline_chars, 5000); past that it defers behind ctx_get, which the
 * brain may never call. The serialized block therefore stays under 5000 —
 * newest turns win, and a truncation marker says so.
 */
export const VOICE_EXCHANGE_INLINE_BUDGET_CHARS = 4_800;

/**
 * Format drained turns as the `<voice_exchange>` block for the brain. Empty
 * input → empty string (callers prepend nothing). Bounded to
 * VOICE_EXCHANGE_INLINE_BUDGET_CHARS so the block always rides INLINE in the
 * prompt (never falls into deferred/ctx_get territory) — oldest turns are
 * dropped first, loudly marked.
 */
export function formatVoiceExchange(turns: VoiceExchangeTurn[]): string {
  if (turns.length === 0) return "";
  const header =
    `<voice_exchange note="A voice agent is speaking your responses to the user ` +
    `and asking your questions on your behalf. These are the spoken turns since ` +
    `your last message — for your context only; the user's actual reply is the ` +
    `message itself.">`;
  const footer = "</voice_exchange>";
  const lines = turns.map(
    (t) => `  <${t.speaker}>${escapeXml(t.text)}</${t.speaker}>`,
  );
  // Keep the NEWEST lines that fit the inline budget.
  const budget =
    VOICE_EXCHANGE_INLINE_BUDGET_CHARS - header.length - footer.length - 64;
  const kept: string[] = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const cost = lines[i].length + 1;
    if (used + cost > budget) break;
    kept.unshift(lines[i]);
    used += cost;
  }
  const dropped = lines.length - kept.length;
  const body =
    (dropped > 0 ? `  <note>${dropped} earlier spoken turns omitted</note>\n` : "") +
    kept.join("\n");
  return `${header}\n${body}\n${footer}`;
}

/**
 * Compose an INLINE brain message: the voice_exchange block followed by the
 * user's verbatim words. NOT used on the live send path today — inlining the
 * block into the user message makes the scaffolding visible in the user's own
 * chat bubble and persists it (Bugbot, PR #177). Live delivery goes through
 * the deferred context channel instead (`voice_exchange` context entry in
 * useVoiceRelaySession); this composer is kept for the future server-side
 * hidden-message-part primitive (rollout checklist row 7).
 */
export function composeBrainMessage(
  exchangeTurns: VoiceExchangeTurn[],
  userUtterance: string,
): string {
  const block = formatVoiceExchange(exchangeTurns);
  return block ? `${block}\n\n${userUtterance}` : userUtterance;
}

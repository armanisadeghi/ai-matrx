// features/agents/utils/human-authored-text.ts
//
// WHOSE WORDS ARE THESE? — the one projection that answers it for a stored
// `chat.message` row, and the only thing any surface may count or quote when it
// says "what you said".
//
// THE PROBLEM. `chat.message.content` on a `role: 'user'` row is NOT the
// person's words. By the server's own contract it is the COMPLETE PROVIDER
// PAYLOAD: the agent definition's own seeded user turn, plus the resolved
// launch variables, plus whatever the human actually typed — merged into one
// row so model replay is lossless (aidream
// `packages/matrx-ai/matrx_ai/config/message_config.py`, `UnifiedMessage`).
//
// So a Masterwork Scout interview persists this at position 0:
//
//   "Let's get started. Follow the mode you were given above, then ask your
//    first concrete question.
//    The call I keep having to make personally is whether an incoming pallet…"
//
// The first sentence is the Scout's `agent.definition` seed talking to itself.
// Counted and quoted off `content`, it becomes the Expert's own opening line on
// a card that sits on her Rulebook page forever (cold walk 2026-09-16, #4).
//
// THE AUTHORSHIP RECORD. `chat.message.user_content` is the pristine, honest
// projection of what the HUMAN contributed to that row, written by the server
// at persist time. This is the same authorship model 09d06177f0 established for
// launch variables (`hostValueNames` on the instance entry): the host records
// what it supplied AT THE MOMENT IT SUPPLIES IT, and readers are given a tier
// that means "the person said this". Here that tier already exists in the
// column; nothing downstream was reading it.
//
// aidream reads it exactly this way in `transcript_message_text`
// (`aidream/services/vision_interview/live_turns.py`). This is its twin, so the
// two clients of the same table agree on who spoke.
//
// 🚨 NEVER match the host's text by string. The kickoff sentence lives in an
// `agent.definition` row in the database and changes whenever someone edits
// that agent; a filter keyed to today's wording is a lie with a timer on it.
// Authorship is a fact the writer recorded, not a phrase we recognise.
//
// WHAT WE HONESTLY CANNOT TELL. `user_content` is NULL on rows written before
// this contract, and on rows where the server merged nothing. Those two are
// indistinguishable from here. NULL therefore means "no authorship was
// recorded", and the honest fallback is `content` — the only text that exists
// for that row. It is right for the ordinary typed turn and it is the reason a
// host-INJECTED user-role turn that carries no human words at all (the
// orchestrator's "⚠️ SYSTEM NOTICE (not from the user)" retry nudges) can still
// be read as speech: closing that needs the server to stamp authorship on the
// turns it injects, and is named in FOUND_DEFECTS rather than guessed at here.
// What we refuse to do is guess: an empty human projection is NOT a turn the
// person took, and never becomes a quote.

/** The columns a `chat.message` select must carry to answer "whose words". */
export const HUMAN_AUTHORED_MESSAGE_COLUMNS = "content, user_content" as const;

/** The two fields of a stored `chat.message` row that carry authorship. */
export interface StoredUserMessage {
  /** `chat.message.content` — the complete provider payload. */
  content: unknown;
  /**
   * `chat.message.user_content` — the pristine human-authored projection.
   * `null`/absent means no authorship was recorded for this row.
   */
  user_content?: unknown;
}

interface MessagePart {
  type?: string;
  text?: string;
}

/**
 * A stored content value (string, or the JSONB array of typed parts) → plain
 * text. Only text parts are speech; attachments and tool machinery are surfaced
 * by their own readers and are never flattened into prose.
 */
export function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        const p = part as MessagePart;
        if (typeof p.text === "string") return p.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/**
 * THE ONE READER for "what this person actually said in this turn".
 *
 * Returns the human-authored text only. When the server recorded authorship
 * (`user_content` present) that record is absolute: the host-wired half of
 * `content` is not the person's words and does not come back from here, not
 * even when `user_content` is empty. When no authorship was recorded,
 * `content` is the only text the row has and is returned as-is.
 */
export function humanAuthoredText(message: StoredUserMessage): string {
  const authored = message.user_content;
  if (authored !== null && authored !== undefined) {
    return messageContentToText(authored);
  }
  return messageContentToText(message.content);
}

/**
 * Did the person take this turn at all?
 *
 * A stored `role: 'user'` row with no human-authored text is the host talking
 * to its own agent — a seeded kickoff, an injected notice, a resend with an
 * empty body. It is a row in the table, never a thing the Expert said, so it
 * must not be counted, must not add words, and must never be quoted.
 */
export function isHumanAuthoredTurn(message: StoredUserMessage): boolean {
  return humanAuthoredText(message).length > 0;
}

/**
 * Every turn the person genuinely took, in the order given, already projected
 * to their own words. The one derivation any "N things you said · M words ·
 * '…quote…'" summary is built from.
 */
export function humanAuthoredTurns<T extends StoredUserMessage>(
  messages: readonly T[],
): string[] {
  return messages.map(humanAuthoredText).filter((text) => text.length > 0);
}

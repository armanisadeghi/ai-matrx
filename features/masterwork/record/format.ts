// features/masterwork/record/format.ts
//
// Expert-language formatting for interview metadata — shared by every surface
// that renders an interview row (the InterviewChooser inside the panel, the
// Conversations section on the Rulebook page). One definition so "how much I
// said" can never read differently in two places.

import { formatRelativeTime } from "@/utils/datetime";
import {
  humanAuthoredTurns,
  type StoredUserMessage,
} from "@/features/agents/utils/human-authored-text";

/** Past this age an interview reads as a calendar date, not an age. */
const RELATIVE_CUTOFF_MS = 30 * 24 * 60 * 60 * 1000;

/** "12 minutes ago" / "3 days ago" / "Aug 17, 2026". */
export function relativeWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Date.now() - then >= RELATIVE_CUTOFF_MS) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return formatRelativeTime(iso, { style: "long" });
}

/** Characters mean nothing to an Expert; roughly-spoken words do. */
export function wordCount(chars: number): string {
  const words = Math.round(chars / 5.5);
  if (words < 1000) return `${words} words`;
  return `${(words / 1000).toFixed(1)}k words`;
}

// =============================================================================
// WHAT THE EXPERT ACTUALLY SAID
// =============================================================================

/**
 * THE ONE DERIVATION behind every "N things you said · M words" line and every
 * italic quote under it, on every surface in the Record.
 *
 * 🚨 A `role: 'user'` row in `chat.message` is NOT automatically a turn the
 * Expert took, and its `content` is NOT automatically her words. `content` is
 * the complete provider payload: the agent definition's own seeded user turn,
 * plus the resolved launch variables, plus whatever she typed, merged into one
 * row so model replay stays lossless. The Masterwork Scout's definition seeds
 *
 *   "Let's get started. Follow the mode you were given above, then ask your
 *    first concrete question."
 *
 * and the server persists that sentence newline-joined onto the front of her
 * real answer. Derived off `content`, the interviewer's cue to itself became
 * her opening quote on the Rulebook page and its words joined her word count
 * (live cold walk, 2026-09-16, finding #4).
 *
 * `humanAuthoredTurns` reads the authorship the server recorded
 * (`chat.message.user_content`) — the same tier `hostValueNames` created for
 * launch variables in 09d06177f0 — and drops any row with no human words in it
 * at all, so a seeded turn the Expert never answered is never counted, never
 * adds a character, and can never be quoted.
 *
 * Never filter by recognising the sentence: it lives in an `agent.definition`
 * row and changes the moment someone edits that agent.
 */
export interface ExpertTurnSummary {
  /** How many turns the Expert genuinely took. */
  expertTurnCount: number;
  /** Characters of HER text only — host-wired text contributes nothing. */
  expertChars: number;
  /** The opening line of the first thing SHE said, or null when she said nothing. */
  firstExpertLine: string | null;
}

/** First non-empty line, ellipsised — how an Expert recognises a conversation. */
export function firstLine(text: string, max = 140): string | null {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean);
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function summariseExpertTurns(
  messages: readonly StoredUserMessage[],
): ExpertTurnSummary {
  const texts = humanAuthoredTurns(messages);
  return {
    expertTurnCount: texts.length,
    expertChars: texts.reduce((sum, t) => sum + t.length, 0),
    firstExpertLine: texts.length > 0 ? firstLine(texts[0]) : null,
  };
}

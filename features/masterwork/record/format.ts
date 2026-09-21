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
// WHAT SHE CONTRIBUTED, BY KIND
// =============================================================================

/**
 * A contribution, reduced to the two facts a tally needs. Structural on
 * purpose: `service.ts` imports this module, so this module cannot import its
 * `ExpertContribution` back.
 */
export interface TallyableContribution {
  kind: string;
  lane: string;
  expertChars: number;
}

/** Her word for a piece of this kind, singular and plural. */
function nounFor(kind: string, lane: string): [string, string] {
  switch (kind) {
    case "message":
      return lane === "interview"
        ? ["interview turn", "interview turns"]
        : ["thing you said", "things you said"];
    case "chat_turn":
      return ["imported chat", "imported chats"];
    case "document":
      return ["document", "documents"];
    case "web_page":
      return ["page", "pages"];
    case "recording":
      return ["recording", "recordings"];
    case "note":
      return ["note", "notes"];
    default:
      return ["resource", "resources"];
  }
}

export interface ContributionTally {
  /** How many things she contributed, each counted ONCE. */
  total: number;
  /** "4 interview turns and 3 documents" — empty string when nothing is here. */
  byKind: string;
  /** Characters of HER words across those things. Never ours. */
  expertChars: number;
}

/**
 * THE ONE TALLY behind "Your words"' header.
 *
 * 🚨 THE HEADER THIS CLOSES (seventeenth cold walk, 2026-09-21, defect A). It
 * read "11 things you contributed · 1 interview · 3.4k words" for four
 * interview turns and three documents, while the product's own interview
 * screen said "4 things you said · 479 words" two clicks away. Three faults,
 * all now upstream of this function: every upload was listed twice under two
 * names, the whole interview was listed again beside her turns, and the totals
 * summed all of it. The server now shows ONE reading per source, so `total`
 * here is the honest count of things — and this says WHAT they were, because
 * "11 things" told an Expert nothing about what she had actually given.
 *
 * The words number is `expertChars` through the same `wordCount` helper the
 * interview summary uses, so the two lines can never disagree again.
 */
export function tallyContributions(
  contributions: readonly TallyableContribution[],
): ContributionTally {
  const counts = new Map<string, { nouns: [string, string]; n: number }>();
  let expertChars = 0;
  for (const c of contributions) {
    expertChars += c.expertChars;
    const nouns = nounFor(c.kind, c.lane);
    const entry = counts.get(nouns[0]);
    if (entry) entry.n += 1;
    else counts.set(nouns[0], { nouns, n: 1 });
  }
  const parts = [...counts.values()]
    .sort((a, b) => b.n - a.n || a.nouns[0].localeCompare(b.nouns[0]))
    .map(({ nouns, n }) => `${n} ${n === 1 ? nouns[0] : nouns[1]}`);
  const byKind =
    parts.length <= 1
      ? (parts[0] ?? "")
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return { total: contributions.length, byKind, expertChars };
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

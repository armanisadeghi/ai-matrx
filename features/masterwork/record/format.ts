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
import { entityTokenNouns } from "../sourceTally";

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

/**
 * Words she actually wrote: whitespace-separated runs carrying a letter or a
 * digit (a lone "—" is not a word).
 *
 * 🚨 A COUNT IS COUNTED (cold walk 23). This used to be `chars / 5.5`, shown
 * as an exact number: "420 words" for 447. Count from the text, where the text
 * is in hand, and carry the number — never re-derive it from characters.
 */
export function countWords(text: string): number {
  let n = 0;
  for (const token of text.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) n += 1;
  }
  return n;
}

/** "447 words" / "1 word" / "3.4k words" — the one format for a counted number. */
export function wordsLabel(words: number): string {
  if (words === 1) return "1 word";
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
  /** Counted words of HER text — see `countWords`. */
  expertWords: number;
}

/**
 * Her word for a piece of this kind, singular and plural.
 *
 * 🚨 ONE VOCABULARY WITH THE REST OF THE PLATFORM (cold walk 18, defect 2).
 * The kinds that are SOURCES — a document, a pasted note, a `udt_document`
 * handed over through the dump lane — take their words from
 * `../sourceTally.ts`, the same module the SOURCE column on `/masterwork/all`
 * and the Rulebook's Sources block read. Before this, a pasted document read
 * "1 resource" here and "1 document" there, about the same thing.
 *
 * What is deliberately NOT shared is the unit. This header counts what she
 * CONTRIBUTED — five interview turns are five things she said — while the
 * column counts SOURCES, where that whole sitting is one interview. Two
 * honest units, one vocabulary; the walk that verified "5 interview turns and
 * 3 documents" is not disturbed.
 */
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
    default: {
      // A dump-lane piece carries its own entity token as its kind. The
      // platform already has a word for every token the panel can attach.
      const shared = entityTokenNouns(kind);
      if (shared) return [shared.one, shared.many];
      return ["resource", "resources"];
    }
  }
}

export interface ContributionTally {
  /** How many things she contributed, each counted ONCE. */
  total: number;
  /** "4 interview turns and 3 documents" — empty string when nothing is here. */
  byKind: string;
  /** Characters of HER words across those things. Never ours. */
  expertChars: number;
  /** Counted words of HER words across those things. */
  expertWords: number;
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
 * The words number is `expertWords` through the same `wordsLabel` the
 * interview summary uses, so the two lines can never disagree again.
 */
export function tallyContributions(
  contributions: readonly TallyableContribution[],
): ContributionTally {
  const counts = new Map<string, { nouns: [string, string]; n: number }>();
  let expertChars = 0;
  let expertWords = 0;
  for (const c of contributions) {
    expertChars += c.expertChars;
    expertWords += c.expertWords;
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
  return { total: contributions.length, byKind, expertChars, expertWords };
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
  /** Counted words of HER text only. */
  expertWords: number;
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
    expertWords: texts.reduce((sum, t) => sum + countWords(t), 0),
    firstExpertLine: texts.length > 0 ? firstLine(texts[0]) : null,
  };
}

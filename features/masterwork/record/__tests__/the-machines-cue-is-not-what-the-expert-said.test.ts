/**
 * THE GUARD: a sentence the interviewer said to itself is never counted or
 * quoted as something the Expert said.
 *
 * WHAT WENT WRONG (live cold walk, 2026-09-16, finding #4). The interview
 * history card on a Rulebook page read "2 things you said · 160 words" and then
 * quoted, in italics, attributed to the Expert:
 *
 *   "Let's get started. Follow the mode you were given above, then ask your
 *    first concrete question."
 *
 * She never said that. It is the Masterwork Scout's OWN seeded opening turn,
 * carried in its `agent.definition.messages` (verified live: definition
 * 4a0b2f8e-18d0-4ade-8b88-7f5610f1d0c8, a `role: "user"` entry whose text is
 * that sentence verbatim). The server merges that seed with what the human
 * typed into ONE `chat.message` row, because `content` must stay a lossless
 * provider payload — so `chat.message.content` at position 0 of a real
 * interview (conversation d3f6aa6c-e783-4ebe-9a65-db46ed38520b) is:
 *
 *   "Let's get started. …ask your first concrete question.\n
 *    The call I keep having to make personally is whether an incoming pallet…"
 *
 * while `chat.message.user_content` on the SAME row holds only:
 *
 *   "The call I keep having to make personally is whether an incoming pallet…"
 *
 * `user_content` is the authorship record. Reading `content` instead put the
 * machine's words in the Expert's mouth on a card that lives on her Rulebook
 * page forever.
 *
 * WHY THIS TEST IS NOT SELF-CONGRATULATION:
 *  - The fixtures below are the REAL rows, copied from the live database, in
 *    the exact shape `readExpertMessages` selects — not a shape invented to
 *    make the assertion pass.
 *  - It drives the real `summariseExpertTurns`, the one derivation every
 *    surface uses. Nothing is mocked, stubbed or spied.
 *  - It asserts on the OBSERVABLE output — the count, the characters and the
 *    quote — and scans every one of them for the host's text, rather than
 *    checking the one field we happen to remember.
 *  - It never mentions the kickoff sentence as a filter. Edit that sentence in
 *    the agent definition and this test still guards the class, because the
 *    thing under test is authorship, not wording.
 *
 * Proven failing against the shipped derivation (`messageContentToText(m.content)`
 * with `expertTurnCount: mine.length`) before the fix, and passing after.
 */

import {
  summariseExpertTurns,
  wordCount,
} from "../format";
import type { StoredUserMessage } from "@/features/agents/utils/human-authored-text";

/**
 * The Masterwork Scout's own seeded opening turn, verbatim from
 * `agent.definition.messages` for definition 4a0b2f8e-…. The host wired this;
 * no person ever typed it.
 */
const HOST_WIRED_KICKOFF =
  "Let's get started. Follow the mode you were given above, then ask your first concrete question.";

/** What the Expert actually typed, turn 1 — live row, conversation d3f6aa6c-…. */
const HER_FIRST_ANSWER =
  "The call I keep having to make personally is whether an incoming pallet of mixed e-waste gets shredded whole or pulled for manual sort first. Most people think it's about weight or size, but really it's about what's hiding inside that the shredder can't handle safely or that we'd lose value on if we just shredded it.";

/** What the Expert actually typed, turn 2 — live row, same conversation. */
const HER_SECOND_ANSWER =
  "Safety reasons: any pallet with visible lithium-ion battery packs loose (not inside a sealed device), anything leaking fluid, or CRT monitors/TVs (leaded glass, can implode) always gets pulled for manual sort, never shredded whole. Value reasons: if I see server gear, networking switches, or anything with visible gold-plated connectors, that goes to manual pull too because the shredder mixes the metals and we lose the premium price we'd get from hand-stripping it.";

/** The JSONB shape `chat.message.content` / `.user_content` really store. */
function parts(text: string): unknown {
  return [{ id: "", text, type: "text", metadata: {}, citations: [] }];
}

/**
 * The real interview, as the database holds it: two `role: 'user'` rows, the
 * first of which carries the host's seed merged in front of her answer.
 */
const REAL_INTERVIEW: StoredUserMessage[] = [
  {
    content: parts(`${HOST_WIRED_KICKOFF}\n${HER_FIRST_ANSWER}`),
    user_content: parts(HER_FIRST_ANSWER),
  },
  {
    content: parts(HER_SECOND_ANSWER),
    user_content: parts(HER_SECOND_ANSWER),
  },
];

/**
 * The same interview at the moment it was launched and before she answered:
 * the host's seeded turn is persisted, and the human contributed nothing to it.
 */
const KICKOFF_ONLY: StoredUserMessage[] = [
  {
    content: parts(HOST_WIRED_KICKOFF),
    user_content: [],
  },
];

describe("what the Expert said is only ever what the Expert said", () => {
  it("counts her turns, not the rows the host also wrote in", () => {
    const summary = summariseExpertTurns(REAL_INTERVIEW);
    expect(summary.expertTurnCount).toBe(2);
  });

  it("never quotes the interviewer's cue back at her as her own words", () => {
    const summary = summariseExpertTurns(REAL_INTERVIEW);
    // Her own opening words, ellipsised by `firstLine` at 140 characters.
    expect(summary.firstExpertLine).toBe(`${HER_FIRST_ANSWER.slice(0, 139)}…`);
    expect(summary.firstExpertLine).not.toContain("Let's get started");
  });

  it("counts none of the host's characters toward 'how much I said'", () => {
    const summary = summariseExpertTurns(REAL_INTERVIEW);
    expect(summary.expertChars).toBe(
      HER_FIRST_ANSWER.length + HER_SECOND_ANSWER.length,
    );
    // The card's own sentence, end to end — the thing the Expert reads.
    //
    // 786 characters of her words → 143 words. The card photographed on the
    // cold walk said "160 words": exactly 786 + 96 characters of the host's
    // kickoff (95 + the joining newline) → 882 → 160. That arithmetic is the
    // whole defect, so the old number is asserted absent by name.
    const line = `${summary.expertTurnCount} things you said · ${wordCount(summary.expertChars)}`;
    expect(line).toBe("2 things you said · 143 words");
    expect(line).not.toBe("2 things you said · 160 words");
  });

  it("puts the host's text in NO part of the summary, whichever field we add next", () => {
    const summary = summariseExpertTurns(REAL_INTERVIEW);
    for (const [field, value] of Object.entries(summary)) {
      if (typeof value !== "string") continue;
      expect(`${field}: ${value}`).not.toContain(HOST_WIRED_KICKOFF);
    }
  });

  it("says she has said nothing yet when only the host's turn exists", () => {
    const summary = summariseExpertTurns(KICKOFF_ONLY);
    expect(summary).toEqual({
      expertTurnCount: 0,
      expertChars: 0,
      firstExpertLine: null,
    });
  });

  it("still reads a row that predates the authorship column", () => {
    // `user_content` NULL means no authorship was recorded, not empty input.
    // `content` is then the only text the row has, and suppressing it would
    // blank the Record for every pre-contract conversation.
    const summary = summariseExpertTurns([
      { content: parts(HER_SECOND_ANSWER), user_content: null },
    ]);
    expect(summary.expertTurnCount).toBe(1);
    expect(summary.expertChars).toBe(HER_SECOND_ANSWER.length);
    // `firstLine` ellipsises past 140 characters — her words, not the host's.
    expect(summary.firstExpertLine).toBe(
      `${HER_SECOND_ANSWER.slice(0, 139)}…`,
    );
  });
});

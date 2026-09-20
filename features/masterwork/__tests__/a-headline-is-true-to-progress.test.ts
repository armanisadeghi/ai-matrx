/**
 * A HEADLINE IS TRUE TO PROGRESS, AND A COUNT AGREES WITH ITS NOUN.
 *
 * Cold walk 13, 2026-09-20 (Friction). Four sentences on the main path said
 * something that was not so:
 *
 *   1. *"Almost there — 2 rules left to review."* was the Rulebook's headline
 *      after the FIRST interview turn, with **0 of 2 approved**. The walker:
 *      "Nobody is almost there at that point." The sentence was computed from
 *      the size of the queue (`n <= 3`) — a fact about the queue, never about
 *      the person's progress through it.
 *   2. *"Checking your Other rules rules"*, four times in one run's live plan
 *      — a section called "Other rules" through a template that appends
 *      " rules".
 *   3. *"0 of 0 threads you replied to"* directly above one visible thread.
 *   4. *"1 messages · 178 words"*, and *"Pick your voice and we'll shadow it —
 *      pick your voice below."*
 *
 * They are one class: a sentence assembled from a number or a name without
 * asking what the reader can see. This file holds the frontend half; the
 * server half is `aidream/services/masterwork_assists/tests/test_journey.py`
 * and `aidream/services/masterworks/tests/test_checking_step_label.py`, and
 * the two `journey` implementations are mirrors that must agree.
 */
import { draftsWaitingHeadline } from "../journey";
import { alreadyAsksForVoice } from "../components/detail/ShadowInboxDialog";

describe('"Almost there" is earned, never a function of queue size', () => {
  it("never says it to someone who has approved nothing", () => {
    // The exact walk-13 state: two draft rules, nothing approved.
    expect(draftsWaitingHeadline(2, 0)).not.toContain("Almost there");
  });

  it("says something true and actionable instead", () => {
    const line = draftsWaitingHeadline(2, 0);
    expect(line).toContain("Your first 2 rules are written");
    expect(line).toContain("approve, correct, or reject");
  });

  it("gets the grammar right for a single first rule", () => {
    const line = draftsWaitingHeadline(1, 0);
    expect(line).toContain("Your first 1 rule is written");
    expect(line).toContain("read it");
  });

  it("DOES say it once the Expert really is nearly through", () => {
    expect(draftsWaitingHeadline(2, 10)).toBe(
      "Almost there — 2 rules left to review.",
    );
    expect(draftsWaitingHeadline(1, 10)).toBe(
      "Almost there — 1 rule left to review.",
    );
  });

  it("never claims it over a big pile, however much is approved", () => {
    expect(draftsWaitingHeadline(40, 100)).not.toContain("Almost there");
    expect(draftsWaitingHeadline(40, 100)).toContain("40 suggested rules need");
  });
});

describe("the inbox says the instruction once", () => {
  it("recognises a server sentence that already asks", () => {
    expect(
      alreadyAsksForVoice(
        "we can't tell which of these is you — we read 3 messages in it, from " +
          "Dana Whitfield, Ray Almeida, and nothing in the thread matches " +
          "admin@admin.com. Pick your voice and we'll shadow it",
      ),
    ).toBe(true);
  });

  it("leaves a sentence that does not ask alone", () => {
    expect(alreadyAsksForVoice("nobody replied in this thread")).toBe(false);
    expect(alreadyAsksForVoice(null)).toBe(false);
  });
});

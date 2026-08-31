/**
 * 🚨 THE RAIL'S SENTENCE, HELD HONEST — V1 finding F2.
 *
 * `HolderInputsColumn` printed "Fed by N offered value(s)" from a RAW SOURCE
 * COUNT, so it was false in two of the four source kinds and in the
 * unfinished-pick state. The adversary caught it claiming "Fed by 1 offered
 * value." over a stored `direct_value` while the offered column, on the same
 * screen, correctly called every offered value unused; over a `prompt_user`
 * read back from the database; and over an offered source whose value nobody
 * had picked, which the row itself and the Save both call unfinished.
 *
 * These cases fail against a count and pass against `feedSentence`.
 */
import type { ConsumptionEntry } from "@/features/mandates/provision-shapes";
import { feedSentence, isFed } from "@/features/bindings/words";

const offered = (target: string): ConsumptionEntry => ({
  mapType: "offered_value",
  target,
  deliver: "variable",
});
const literal: ConsumptionEntry = {
  mapType: "direct_value",
  target: "The house rulebook, verbatim.",
  deliver: "variable",
};
const question: ConsumptionEntry = {
  mapType: "prompt_user",
  prompt: "What brief?",
  deliver: "variable",
};

describe("feedSentence — names the kind it has actually checked", () => {
  it("says nothing feeds an input with no sources", () => {
    expect(feedSentence([])).toBe(
      "Nothing feeds this — the holder's own default applies.",
    );
    expect(feedSentence(undefined)).toContain("Nothing feeds this");
    expect(isFed([])).toBe(false);
  });

  it("calls one offered value an offered value", () => {
    expect(feedSentence([offered("task_overview")])).toBe(
      "Fed by 1 offered value.",
    );
  });

  it("NEVER calls a fixed value an offered value", () => {
    const sentence = feedSentence([literal]);
    expect(sentence).toBe("Fed by a fixed value.");
    expect(sentence).not.toContain("offered");
  });

  it("NEVER calls a question an offered value", () => {
    const sentence = feedSentence([question]);
    expect(sentence).toBe("Fed by a question the person answers.");
    expect(sentence).not.toContain("offered");
  });

  it("does not count an unpicked offered source as a feed", () => {
    const sentence = feedSentence([offered("")]);
    expect(sentence).toContain("Waiting for you to pick");
    expect(sentence).not.toContain("Fed by");
    expect(isFed([offered("")])).toBe(false);
  });

  it("names every kind in a mixed many-to-one map, and says they join", () => {
    const sentence = feedSentence([offered("inputs"), offered("outputs"), literal]);
    expect(sentence).toBe(
      "Fed by 2 offered values and a fixed value, joined in order.",
    );
  });

  it("reports a settled feed AND an outstanding pick in the same breath", () => {
    const sentence = feedSentence([offered("inputs"), offered("")]);
    expect(sentence).toContain("Fed by 1 offered value.");
    expect(sentence).toContain("still waiting for you to pick");
    expect(isFed([offered("inputs"), offered("")])).toBe(true);
  });
});

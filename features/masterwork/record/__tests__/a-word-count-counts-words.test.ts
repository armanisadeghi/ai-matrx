/**
 * A WORD COUNT COUNTS WORDS — cold walk 23 (friction).
 *
 * "420 words" for an interview turn of 447, and "762 words" for 807: every
 * "N words" line about the Expert was her characters ÷ 5.5, printed as if it
 * were a count. The number is now counted from her text, once, at the place
 * the text is in hand, and every line formats THAT.
 */
import {
  countWords,
  summariseExpertTurns,
  tallyContributions,
  wordsLabel,
} from "../format";

/** 447 real words whose average length is nowhere near 5.5 characters. */
const SHORT_WORDS = Array.from({ length: 447 }, (_, i) =>
  i % 3 === 0 ? "a" : i % 3 === 1 ? "floor" : "refinishing",
).join(" ");

describe("countWords", () => {
  it("counts whitespace-separated words, not characters", () => {
    expect(countWords(SHORT_WORDS)).toBe(447);
    // The estimate this replaces would have said otherwise.
    expect(Math.round(SHORT_WORDS.length / 5.5)).not.toBe(447);
  });

  it("does not count punctuation on its own as a word", () => {
    expect(countWords("Recoat — then resand. It's poly, not wax!")).toBe(7);
    expect(countWords("  \n ")).toBe(0);
  });
});

describe("every 'N words' line formats a counted number", () => {
  it("shows an exact count under a thousand", () => {
    expect(wordsLabel(447)).toBe("447 words");
    expect(wordsLabel(1)).toBe("1 word");
  });

  it("the interview summary carries her counted words", () => {
    const summary = summariseExpertTurns([
      { content: SHORT_WORDS, user_content: SHORT_WORDS } as never,
    ]);
    expect(summary.expertWords).toBe(447);
  });

  it("the Record header's tally sums counted words", () => {
    const tally = tallyContributions([
      { kind: "message", lane: "interview", expertChars: 999, expertWords: 447 },
      { kind: "document", lane: "upload", expertChars: 5000, expertWords: 360 },
    ]);
    expect(tally.expertWords).toBe(807);
    expect(wordsLabel(tally.expertWords)).toBe("807 words");
  });
});

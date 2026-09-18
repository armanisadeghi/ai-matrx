// features/question-desk/__tests__/answer-words.test.ts
//
// THE FORCING TEST for the whitespace-only answer class (V2 finding 2,
// 2026-09-14).
//
// WHAT HAPPENED ON PRODUCTION. In the review triage, `N` on a decision, three
// spaces typed, "Send it back" clicked — and it saved: row `v2r-02`,
// `verdict = 'overturn'`, `answer_text` hex `202020`, `status = 'delivered'`,
// and the server's follow-through refiled a real question whose whole premise
// read `"You overturned it and said, verbatim:    "`, with a Work Loop item
// behind it. The write box had the same hole (`"   \n"`, hex `2020200a`, saved
// as `own_words`). Three save paths, one bug, written the same way three times:
// `length === 0` where the question is "did this person say anything".
//
// RED RECIPE (run it before believing this test). Revert either half and watch
// it fail:
//   1. In `../answerWords.ts` make `hasWords` return `value.length > 0` — the
//      three "refuses whitespace" cases below fail.
//   2. In `../data/questions.ts` restore `answerText.length === 0` — the
//      backstop case fails.
//   3. Put `words.length === 0` back in any of the three boxes — the source
//      census below names the file and fails.
// Proven red on 2026-09-14 with recipe 1 and 2 (4 failures), green after.
//
// The census is a source assertion on purpose: the three boxes are React
// components whose refusal lives inside a click handler, and what must be true
// of them is not "one handler behaves" but "no save path anywhere on this
// surface asks the old question again". That is a property of the files.

import { readFileSync } from "fs";
import { join } from "path";

const chains: Array<unknown> = [];

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["update", "select", "eq", "is", "order", "limit"]) chain[m] = self;
  chain.maybeSingle = () => Promise.resolve(result);
  return chain;
}

jest.mock("../data/db", () => ({
  LIST_CAP: 2000,
  db: () => ({
    from: () => {
      const next = chains.shift();
      if (!next) throw new Error("test: no scripted response left");
      return makeChain(next);
    },
  }),
}));

jest.mock("../data/interviews", () => ({
  QuestionDeskReadError: class extends Error {},
}));

import { NO_WORDS_MESSAGE, hasWords } from "../answerWords";
import { saveAnswer } from "../data/questions";
import type { DecisionQuestionRow } from "../types";

const row = {
  id: "q-1",
  interview_id: "i-1",
  version: 4,
  status: "asked",
  verdict: null,
  answered_at: null,
} as unknown as DecisionQuestionRow;

/** The words a person could actually give, and what each one is. */
const WHITESPACE_ONLY = ["", " ", "   ", "\n", "\t", "   \n", "\n\n  \t ", " "];
const REAL_WORDS = ["x", "  x\n", "   Keep the bloody serif. ", "0", "—"];

describe("has words: one predicate, whitespace is not an answer", () => {
  it.each(WHITESPACE_ONLY)("refuses %j", (value) => {
    expect(hasWords(value)).toBe(false);
  });

  it.each(REAL_WORDS)("accepts %j", (value) => {
    expect(hasWords(value)).toBe(true);
  });

  it("refuses nothing at all", () => {
    expect(hasWords(null)).toBe(false);
    expect(hasWords(undefined)).toBe(false);
  });
});

describe("the save path itself refuses a whitespace-only answer", () => {
  it.each(["own_words", "overturn"] as const)(
    "a %s answer of three spaces never reaches the wire",
    async (verdict) => {
      chains.length = 0; // nothing is scripted: a wire call would throw.
      const outcome = await saveAnswer({
        question: row,
        verdict,
        answerText: "   ",
        source: "typed",
        answeredBy: "user-1",
      });
      expect(outcome.status).toBe("failed");
      if (outcome.status !== "failed") throw new Error("unreachable");
      expect(outcome.message).toBe(NO_WORDS_MESSAGE);
    },
  );

  it("a whitespace-only overturn cannot become a refiled question's premise", async () => {
    chains.length = 0;
    const outcome = await saveAnswer({
      question: row,
      verdict: "overturn",
      answerText: "   \n",
      source: "typed",
      answeredBy: "user-1",
    });
    expect(outcome.status).toBe("failed");
  });

  it("REAL words still save, byte for byte, with the leading spaces on them", async () => {
    const words = "   V2 own words — record this ruling.\n";
    chains.length = 0;
    chains.push({ data: { ...row, version: 5, answer_text: words }, error: null });
    const outcome = await saveAnswer({
      question: row,
      verdict: "own_words",
      answerText: words,
      source: "typed",
      answeredBy: "user-1",
    });
    expect(outcome.status).toBe("saved");
    if (outcome.status !== "saved") throw new Error("unreachable");
    expect(outcome.row.answer_text).toBe(words);
  });
});

describe("no save path on this surface asks the old question", () => {
  const BOXES = [
    "components/InterviewClient.tsx",
    "components/ReviewTriage.tsx",
    "components/AskTable.tsx",
    "data/questions.ts",
  ];

  it.each(BOXES)("%s decides with hasWords, never with a length check", (file) => {
    const source = readFileSync(join(__dirname, "..", file), "utf8")
      // Strip comments: the prose above these guards describes the old bug.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain("hasWords");
    // The three spellings the bug wore. `discardDraft` asks a DIFFERENT
    // question (was anything typed at all) and is spelled `=== ""` so it can
    // never be mistaken for — or quietly become — the save gate again.
    for (const dead of [
      "words.length === 0",
      "draft.text.length === 0",
      "answerText.length === 0",
    ]) {
      expect(source).not.toContain(dead);
    }
  });
});

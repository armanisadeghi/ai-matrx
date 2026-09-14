// features/question-desk/__tests__/refused-save.test.ts
//
// THE FORCING TEST for the refused-save class (2026-09-13).
//
// PostgREST reports a row-level-security refusal of an UPDATE as "0 rows, no
// error" — indistinguishable at the wire from a version race. Before this
// test, a refused answer was reported as "This question changed somewhere
// else" (a lie) or "This question no longer exists" (a lie), and the person
// answering had no way to learn that nothing was recorded. The classifier is
// the row itself: a race moved `version` on; a refusal left it exactly where
// the client read it.
//
// This test drives the REAL `saveAnswer` through a fake supabase-js chain,
// which is the only seam between the classification and the wire. It was run
// RED against the pre-fix module (the conflict branch fired with the
// "changed somewhere else" sentence) and GREEN after.

const chains: Array<{ kind: "update" | "select"; result: unknown }> = [];

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
      return makeChain(next.result);
    },
  }),
}));

jest.mock("../data/interviews", () => ({
  QuestionDeskReadError: class extends Error {},
}));

import { REFUSED_SAVE_MESSAGE, saveAnswer } from "../data/questions";
import type { DecisionQuestionRow } from "../types";

const row = {
  id: "q-1",
  interview_id: "i-1",
  version: 4,
  status: "asked",
  verdict: null,
  answered_at: null,
} as unknown as DecisionQuestionRow;

async function drive(afterUpdate: { version: number } | null) {
  chains.length = 0;
  // 1. the guarded UPDATE: zero rows, no error — the RLS shape.
  chains.push({ kind: "update", result: { data: null, error: null } });
  // 2. the re-read the guard performs.
  chains.push({
    kind: "select",
    result: {
      data: afterUpdate ? { ...row, version: afterUpdate.version } : null,
      error: null,
    },
  });
  return saveAnswer({
    question: row,
    verdict: "confirm",
    answerText: null,
    source: "keystroke",
    answeredBy: "user-1",
  });
}

describe("a refused save is named a refusal", () => {
  it("zero rows + same version = REFUSED, never 'changed somewhere else'", async () => {
    const outcome = await drive({ version: 4 });
    expect(outcome.status).toBe("refused");
    if (outcome.status !== "refused") throw new Error("unreachable");
    expect(outcome.message).toBe(REFUSED_SAVE_MESSAGE);
    expect(outcome.message).toMatch(/NOT SAVED/);
    expect(outcome.message).not.toMatch(/changed somewhere else/);
  });

  it("zero rows + a moved version is still an honest conflict", async () => {
    const outcome = await drive({ version: 5 });
    expect(outcome.status).toBe("conflict");
  });

  it("zero rows + unreadable row says NOT SAVED, never 'no longer exists' alone", async () => {
    const outcome = await drive(null);
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("unreachable");
    expect(outcome.message).toMatch(/NOT SAVED/);
  });
});

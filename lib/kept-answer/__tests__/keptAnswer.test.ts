/**
 * THE KEPT ANSWER — the store a gate keeps its answer in so a remount or a wake never blanks it.
 * Pure store rules (the component-level proof is
 * features/unified-data/table-page/__tests__/the-table-survives-remount-and-wake.test.tsx).
 */
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));

import { createKeptAnswers, forgetAllKeptAnswers } from "../keptAnswer";

type Answer = { state: "found"; org: string } | { state: "unavailable" };

it("asks once while in flight and once while fresh; a forced ask keeps the answer shown", async () => {
  const kept = createKeptAnswers<Answer>({ keep: (a) => a.state !== "unavailable" });
  const ask = jest.fn(async (): Promise<Answer> => ({ state: "found", org: "cedar-ridge" }));
  await Promise.all([kept.ensure("t1", ask), kept.ensure("t1", ask)]);
  await kept.ensure("t1", ask);
  expect(ask).toHaveBeenCalledTimes(1);
  const shown = kept.peek("t1")?.answer;
  const forced = kept.ensure("t1", ask, true);
  expect(kept.peek("t1")).toEqual({ answer: shown, asking: true });
  await forced;
  expect(ask).toHaveBeenCalledTimes(2);
  // The same answer again keeps the SAME object: nothing on screen re-renders.
  expect(kept.peek("t1")?.answer).toBe(shown);
});

it("a failed read is shown but never kept fresh past the floor", async () => {
  const kept = createKeptAnswers<Answer>({ keep: (a) => a.state !== "unavailable" });
  const ask = jest.fn(async (): Promise<Answer> => ({ state: "unavailable" }));
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  await kept.ensure("t2", ask);
  await kept.ensure("t2", ask);
  expect(ask).toHaveBeenCalledTimes(1);
  now.mockReturnValue(1_000_000 + 3_001);
  await kept.ensure("t2", ask);
  expect(ask).toHaveBeenCalledTimes(2);
  now.mockRestore();
});

it("a changed answer replaces the shown one; sign-out forgets everything", async () => {
  const kept = createKeptAnswers<Answer>();
  await kept.ensure("t3", async () => ({ state: "found", org: "cedar-ridge" }));
  await kept.ensure("t3", async () => ({ state: "found", org: "rincon-plumbing" }), true);
  expect(kept.peek("t3")?.answer).toEqual({ state: "found", org: "rincon-plumbing" });
  forgetAllKeptAnswers();
  expect(kept.peek("t3")).toBeNull();
});

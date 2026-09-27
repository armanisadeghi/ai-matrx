/**
 * `/education/flashcards/weak-areas?topic=…` drills ONE topic: every studied
 * card in it, worst first — the progress dashboard's topic rows link here, so
 * a topic the learner is strong in must still open its cards, and no card from
 * another topic may leak in.
 */

import { renderHook, settle } from "@/test-utils/renderHook";

const USER = "33333333-3333-4333-8333-333333333333";
const requested: string[][] = [];
const sessions: unknown[] = [];

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => USER,
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock("@/features/flashcards/data/fcService", () => ({
  fcService: {
    getTopicsForCardIds: async () => ({
      data: { a: "Krebs Cycle", b: "Glycolysis", c: "Krebs Cycle" },
      error: null,
    }),
    getCardsByIds: async (ids: string[]) => {
      requested.push(ids);
      return { data: ids.map((id) => ({ id, front: id, back: id })), error: null };
    },
  },
}));
jest.mock("@/features/education/study/service/studyService", () => ({
  studyService: {
    // Only card "b" is globally weak; the Krebs Cycle cards are strong.
    listWeakest: async () => ({
      data: [{ item_id: "b", item_type: "fc_card", struggle_flag: true }],
      error: null,
    }),
    listAllMastery: async () => ({
      data: [
        { item_id: "a", item_type: "fc_card", struggle_flag: false },
        { item_id: "b", item_type: "fc_card", struggle_flag: true },
        { item_id: "c", item_type: "fc_card", struggle_flag: true },
        { item_id: "q", item_type: "assessment_item", struggle_flag: true },
      ],
      error: null,
    }),
    createSession: async (input: unknown) => {
      sessions.push(input);
      return { data: { id: "s1" }, error: null };
    },
    updateSession: async () => ({ data: null, error: null }),
  },
}));

import { useWeakAreaDrill } from "../useWeakAreaDrill";

describe("weak-area drill — ?topic=", () => {
  beforeEach(() => {
    requested.length = 0;
    sessions.length = 0;
  });

  it("drills every studied card in the topic, struggling first, nothing else", async () => {
    const hook = await renderHook(() => useWeakAreaDrill({ topic: "Krebs Cycle" }));
    await settle(hook, (h) => !h.loading && h.cards.length > 0, "topic cards");
    expect(requested.at(-1)).toEqual(["c", "a"]);
    expect(sessions.at(-1)).toMatchObject({ sourceQuery: { topic: "Krebs Cycle" } });
  });

  it("without a topic, drills every flashcard the dashboard counts as needing work, flagged first", async () => {
    const hook = await renderHook(() => useWeakAreaDrill());
    await settle(hook, (h) => !h.loading && h.cards.length > 0, "weak cards");
    // a has no live mastery (reads 0%) so it needs work too; the quiz item never joins.
    expect(requested.at(-1)).toEqual(["b", "c", "a"]);
  });
});

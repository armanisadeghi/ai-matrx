/**
 * Studying for a TEST combines the decks of every unit it covers: one review
 * over all their cards (never a card from another deck), the ones that need
 * practice first, then cards never studied. The session files under no single
 * deck and records the test it counts toward.
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
    getSetWithCards: async (id: string) => ({
      data: {
        cards:
          id === "deck-1"
            ? [{ id: "a" }, { id: "b" }]
            : id === "deck-2"
              ? [{ id: "b" }, { id: "c" }, { id: "d" }]
              : [{ id: "z" }],
      },
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
    listAllMastery: async () => ({
      data: [
        { item_id: "a", item_type: "fc_card", struggle_flag: true, attempt_count: 3 },
        { item_id: "c", item_type: "fc_card", struggle_flag: false, attempt_count: 0 },
        // Studied in a deck the test does NOT cover: must never join.
        { item_id: "z", item_type: "fc_card", struggle_flag: true, attempt_count: 5 },
      ],
      error: null,
    }),
    createSession: async (input: unknown) => {
      sessions.push(input);
      return { data: { id: "s1" }, error: null };
    },
    updateSession: async () => ({ data: null, error: null }),
    recordAttempt: async () => ({ data: { attemptId: "a1", mastery: null }, error: null }),
  },
}));

import { useWeakAreaDrill } from "../useWeakAreaDrill";

describe("weak-area drill — deckIds (study for a test)", () => {
  beforeEach(() => {
    requested.length = 0;
    sessions.length = 0;
  });

  it("opens every card of every covered deck once, needs-practice first, none from another deck", async () => {
    const query = { test: "t1", units: ["u1", "u2"], decks: ["deck-1", "deck-2"] };
    const hook = await renderHook(() =>
      useWeakAreaDrill({ deckIds: ["deck-1", "deck-2"], sourceQuery: query }),
    );
    await settle(hook, (h) => !h.loading && h.cards.length > 0, "test cards");
    const ids = requested.at(-1)!;
    expect([...ids].sort()).toEqual(["a", "b", "c", "d"]);
    expect(ids[0]).toBe("a");
    await hook.act(async () => {
      await hook.current.grade("correct");
    });
    const session = sessions.at(-1) as Record<string, unknown>;
    expect(session.sourceQuery).toEqual(query);
    expect(session.sourceSetId).toBeUndefined();
  });
});

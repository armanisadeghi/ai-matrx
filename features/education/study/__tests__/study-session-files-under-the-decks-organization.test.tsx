/**
 * A study session files under the DECK's own organization — never the one the
 * person happens to have selected (common-docs /policies/active-org-is-never-a-list-filter.md,
 * law 3: an existing record's org travels with the write). Each set-based
 * study mode hands `createSession` the loaded deck's `organization_id`; the
 * cross-deck modes hand it the first card's.
 */

import "fake-indexeddb/auto";
import { renderHook, type HookHandle } from "@/test-utils/renderHook";

const USER = "55555555-5555-4555-8555-555555555555";
const SET = "set-org-1";
const DECK_ORG = "org-that-owns-the-deck";
const CARDS = [
  { id: "c1", front: "alpha", back: "one", organization_id: DECK_ORG },
  { id: "c2", front: "beta", back: "two", organization_id: DECK_ORG },
  { id: "c3", front: "gamma", back: "three", organization_id: DECK_ORG },
  { id: "c4", front: "delta", back: "four", organization_id: DECK_ORG },
];

const createSession = jest.fn(
  async (_input: { orgId?: string | null; mode: string }) => ({
    data: { id: "session-1" },
    error: null,
  }),
);

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => USER,
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
jest.mock("@/features/flashcards/data/fcService", () => ({
  fcService: {
    getSetWithCards: async () => ({
      data: {
        set: { id: SET, name: "Greek", organization_id: DECK_ORG },
        cards: CARDS,
      },
      error: null,
    }),
    getCardsByIds: async () => ({ data: CARDS, error: null }),
  },
}));
jest.mock("@/features/education/study/service/planService", () => ({
  planService: { getActiveDailyItemCap: async () => null },
}));
jest.mock("@/features/education/study/service/studyService", () => ({
  studyService: {
    createSession: (input: { orgId?: string | null; mode: string }) =>
      createSession(input),
    updateSession: async () => ({ data: null, error: null }),
    getMasteryBulk: async () => ({ data: [], error: null }),
    listDue: async () => ({
      data: CARDS.map((c) => ({ item_id: c.id })),
      error: null,
    }),
    recordAttempt: async () => ({
      data: { attemptId: "attempt-1", mastery: null },
      error: null,
    }),
  },
}));

import { useFlashcardStudy } from "@/features/flashcards/data/useFlashcardStudy";
import { useDueReview } from "@/features/flashcards/data/useDueReview";

async function drain<T>(hook: HookHandle<T>): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await hook.act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

describe("a study session files under the deck's organization", () => {
  beforeEach(() => createSession.mockClear());

  it("set study passes the deck's organization_id", async () => {
    const hook = await renderHook(() =>
      useFlashcardStudy({ setId: SET, withSession: true }),
    );
    await drain(hook);
    await hook.act(async () => {
      await hook.current.grade("correct");
    });
    await drain(hook);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession.mock.calls[0]![0].orgId).toBe(DECK_ORG);
    await hook.unmount();
  });

  it("due review (cross-deck) passes its first card's organization_id", async () => {
    const hook = await renderHook(() => useDueReview());
    await drain(hook);
    await hook.act(async () => {
      await hook.current.grade("correct");
    });
    await drain(hook);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession.mock.calls[0]![0].orgId).toBe(DECK_ORG);
    await hook.unmount();
  });
});

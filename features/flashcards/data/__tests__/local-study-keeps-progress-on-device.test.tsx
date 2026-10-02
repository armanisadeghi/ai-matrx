/** @jest-environment jsdom */
//
// The public deck page studies on the DEVICE (useLocalFlashcardStudy): a guest
// grades cards, reloads, and finds the sitting where they left it; Learn mode
// brings a missed card back and ends only when every card is known. These are
// the promises the public page makes ("Studied 3 of 16 on this device").

import { renderHook } from "@/test-utils/renderHook";
import { publicCardsToStudyCards } from "../publicDeck";
import {
  clearDeviceProgress,
  readDeviceProgress,
  useLocalFlashcardStudy,
} from "../useLocalFlashcardStudy";
import { requeueAfterGrade } from "../useFlashcardStudy";

const SET_ID = "set-1";
const cards = publicCardsToStudyCards(
  ["a", "b", "c", "d", "e"].map((id) => ({ id, front: `Q ${id}`, back: `A ${id}` })),
);
const ids = cards.map((c) => c.id);

beforeEach(() => {
  window.localStorage.clear();
});

describe("on-device study", () => {
  it("keeps grades and position across a reload", async () => {
    const first = await renderHook(() =>
      useLocalFlashcardStudy({ setId: SET_ID, cards, mode: "study" }),
    );
    await first.act(() => first.current.grade("correct"));
    await first.act(() => first.current.grade("incorrect"));
    expect(first.current.currentIndex).toBe(2);
    await first.unmount();

    const reloaded = await renderHook(() =>
      useLocalFlashcardStudy({ setId: SET_ID, cards, mode: "study" }),
    );
    expect(reloaded.current.currentIndex).toBe(2);
    expect(reloaded.current.progress).toEqual({ done: 2, total: 5, correct: 1 });
    expect(readDeviceProgress(SET_ID, ids)).toMatchObject([
      { mode: "study", done: 2, total: 5, correct: 1 },
    ]);

    await reloaded.unmount();
    clearDeviceProgress(SET_ID);
    expect(readDeviceProgress(SET_ID, ids)).toEqual([]);
  });

  it("Learn brings a missed card back and finishes only when all are known", async () => {
    const h = await renderHook(() =>
      useLocalFlashcardStudy({ setId: SET_ID, cards, mode: "learn" }),
    );
    await h.act(() => h.current.grade("incorrect")); // "a" goes 3 slots ahead
    expect(h.current.cards.map((c) => c.id)).toEqual(["b", "c", "d", "a", "e"]);
    for (let i = 0; i < 4; i++) {
      await h.act(() => h.current.grade("correct"));
      expect(h.current.progress.done).toBeLessThan(5);
    }
    await h.act(() => h.current.grade("correct"));
    expect(h.current.cards).toHaveLength(0);
    expect(h.current.progress).toEqual({ done: 5, total: 5, correct: 5 });
    await h.unmount();
  });

  it("reshuffle keeps every grade", async () => {
    const h = await renderHook(() =>
      useLocalFlashcardStudy({ setId: SET_ID, cards, mode: "study" }),
    );
    await h.act(() => h.current.grade("correct"));
    await h.act(() => h.current.reshuffle());
    expect(h.current.progress.done).toBe(1);
    expect(h.current.cards.map((c) => c.id).sort()).toEqual(ids);
    const at = h.current.cards[h.current.currentIndex];
    expect(h.current.resultsByCard[at.id]).toBeUndefined();
    await h.unmount();
  });

  it("a blocked store still studies", async () => {
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const h = await renderHook(() =>
      useLocalFlashcardStudy({ setId: SET_ID, cards, mode: "study" }),
    );
    await h.act(() => h.current.grade("correct"));
    expect(h.current.progress.done).toBe(1);
    await h.unmount();
    spy.mockRestore();
  });
});

describe("requeueAfterGrade (shared Learn step)", () => {
  const q = ids.map((id) => ({ id }));
  it("drops a known card and requeues a missed one", () => {
    expect(requeueAfterGrade(q, q[0], "correct").map((c) => c.id)).toEqual(["b", "c", "d", "e"]);
    expect(requeueAfterGrade(q, q[0], "partial").map((c) => c.id)).toEqual(["b", "c", "d", "a", "e"]);
  });
});

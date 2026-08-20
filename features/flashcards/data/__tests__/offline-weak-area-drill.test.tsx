/**
 * Weak-area drill (`method='weak_area'`) survives a dropped connection.
 * STATE.md §4.1 B item 8 — see `offline-due-review.test.tsx` for why these
 * suites drive the real hook rather than the wrapper.
 *
 * This mode has the sharpest stake in the fix: it exists to re-drill the cards
 * a learner is WORST at, so a dropped answer here does not just lose one row —
 * it leaves the card flagged struggling and re-serves it, making the learner
 * redo the exact work they already did.
 */

import "fake-indexeddb/auto";
import { createStudySpineFake } from "@/test-utils/study-spine-fake";
import { renderHook, settle } from "@/test-utils/renderHook";

const USER = "22222222-2222-4222-8222-222222222222";
const CARD = "card-weak-1";
const SESSION = "session-weak-1";

const spine = createStudySpineFake();

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => USER,
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock("@/features/flashcards/data/fcService", () => ({
  fcService: {
    getCardsByIds: async () => ({
      data: [{ id: CARD, front: "front", back: "back" }],
      error: null,
    }),
  },
}));
jest.mock("@/features/education/study/service/studyService", () => ({
  studyService: {
    listWeakest: async () => ({
      data: [{ item_id: CARD, struggle_flag: true }],
      error: null,
    }),
    createSession: async () => ({ data: { id: SESSION }, error: null }),
    updateSession: async () => ({ data: null, error: null }),
    recordAttempt: (input: unknown) =>
      spine.recordAttempt(input as Record<string, unknown>),
  },
}));

import { useWeakAreaDrill } from "../useWeakAreaDrill";
import { flushStudyOutbox } from "@/features/education/study/offline/replay";
import {
  countPendingAttempts,
  enqueueAttempt,
  listPendingAttempts,
  removeAttempt,
} from "@/features/education/study/offline/outbox";

async function clearOutbox(): Promise<void> {
  for (const row of await listPendingAttempts(USER)) {
    if (row.seq != null) await removeAttempt(row.seq);
  }
}

describe("weak-area drill — offline answers survive (STATE §4.1 B8)", () => {
  beforeEach(async () => {
    spine.reset();
    jest.clearAllMocks();
    await clearOutbox();
  });

  it("queues the answer offline, then replays it EXACTLY ONCE", async () => {
    const hook = await renderHook(() => useWeakAreaDrill());
    await settle(hook, (h) => !h.loading && h.cards.length === 1, "weak cards");

    spine.goOffline();
    await hook.act(async () => {
      await hook.current.grade("incorrect", { confidence: 2 });
    });

    expect(spine.attempts.size).toBe(0);
    expect(await countPendingAttempts(USER)).toBe(1);

    const [queued] = await listPendingAttempts(USER);
    expect(queued).toMatchObject({
      userId: USER,
      itemId: CARD,
      method: "weak_area",
      result: "incorrect",
      confidence: 2,
      sessionId: SESSION,
    });

    spine.goOnline();
    expect((await flushStudyOutbox(USER)).flushed).toBe(1);

    expect(spine.attemptsFor(CARD)).toHaveLength(1);
    expect(spine.masteryFor("fc_card", CARD)).toMatchObject({
      attempt_count: 1,
      correct_count: 0,
      last_result: "incorrect",
    });

    await hook.unmount();
  });

  it("a second flush of the same answer cannot double-count it", async () => {
    const hook = await renderHook(() => useWeakAreaDrill());
    await settle(hook, (h) => !h.loading && h.cards.length === 1, "weak cards");

    spine.goOffline();
    await hook.act(async () => {
      await hook.current.grade("incorrect");
    });
    const [queued] = await listPendingAttempts(USER);
    spine.goOnline();
    await flushStudyOutbox(USER);

    const { seq: _s, failedAttempts: _f, lastError: _l, ...replayable } = queued;
    await enqueueAttempt(replayable);
    await flushStudyOutbox(USER);

    expect(spine.attemptsFor(CARD)).toHaveLength(1);
    expect(spine.masteryFor("fc_card", CARD)).toMatchObject({
      attempt_count: 1,
    });

    await hook.unmount();
  });
});

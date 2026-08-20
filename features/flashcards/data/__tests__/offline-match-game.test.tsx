/**
 * Match (`method='match'`) survives a dropped connection.
 * STATE.md §4.1 B item 8 — the mode named in no existing doc.
 *
 * Match is the WORST case of the six, for two reasons:
 *   • A pair self-grades exactly once and then leaves the board. There is no
 *     card left to retry against, so a failed write is unrecoverable in-session.
 *   • The write was fire-and-forget (`void ....then(...)`), so the game never
 *     even paused on failure — the tiles cleared, the round completed, and the
 *     learner saw a perfect score for work that reached the server zero times.
 *
 * This suite also pins the toast policy: an 8-card board offline queues eight
 * attempts and must produce exactly ONE notice, not eight.
 */

import "fake-indexeddb/auto";
import { createStudySpineFake } from "@/test-utils/study-spine-fake";
import { renderHook, settle } from "@/test-utils/renderHook";

const USER = "44444444-4444-4444-8444-444444444444";
const SET = "set-match-1";
const SESSION = "session-match-1";

const spine = createStudySpineFake();

const CARDS = [
  { id: "m-card-1", front: "alpha", back: "one" },
  { id: "m-card-2", front: "beta", back: "two" },
  { id: "m-card-3", front: "gamma", back: "three" },
];

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => USER,
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock("@/features/flashcards/data/fcService", () => ({
  fcService: {
    getSetWithCards: async () => ({
      data: { set: { id: SET, name: "Greek" }, cards: CARDS },
      error: null,
    }),
  },
}));
jest.mock("@/features/education/study/service/studyService", () => ({
  studyService: {
    createSession: async () => ({ data: { id: SESSION }, error: null }),
    updateSession: async () => ({ data: null, error: null }),
    recordAttempt: (input: unknown) =>
      spine.recordAttempt(input as Record<string, unknown>),
  },
}));

import { useMatchGame } from "../useMatchGame";
import { flushStudyOutbox } from "@/features/education/study/offline/replay";
import {
  countPendingAttempts,
  enqueueAttempt,
  listPendingAttempts,
  removeAttempt,
} from "@/features/education/study/offline/outbox";
import { toast } from "@/lib/toast";

async function clearOutbox(): Promise<void> {
  for (const row of await listPendingAttempts(USER)) {
    if (row.seq != null) await removeAttempt(row.seq);
  }
}

/** Pair one card by selecting its front tile then its back tile. */
async function pair(
  hook: Awaited<ReturnType<typeof renderHook<ReturnType<typeof useMatchGame>>>>,
  cardId: string,
): Promise<void> {
  await hook.act(async () => {
    hook.current.selectTile(`${cardId}-front`);
  });
  await hook.act(async () => {
    hook.current.selectTile(`${cardId}-back`);
  });
  // The write is fire-and-forget; let its microtasks drain.
  await hook.act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("match game — offline answers survive (STATE §4.1 B8)", () => {
  beforeEach(async () => {
    spine.reset();
    jest.clearAllMocks();
    await clearOutbox();
  });

  it("queues each matched pair offline, then replays each EXACTLY ONCE", async () => {
    const hook = await renderHook(() => useMatchGame({ setId: SET }));
    await settle(hook, (h) => !h.loading && h.tiles.length > 0, "board");

    spine.goOffline();
    for (const card of CARDS) await pair(hook, card.id);

    expect(hook.current.matchedCardIds.size).toBe(CARDS.length);
    expect(spine.attempts.size).toBe(0);
    expect(await countPendingAttempts(USER)).toBe(CARDS.length);

    // Exactly one notice for the whole round, not one per pair.
    expect(toast.success).toHaveBeenCalledTimes(1);

    const queued = await listPendingAttempts(USER);
    expect(queued.map((q) => q.itemId).sort()).toEqual(
      CARDS.map((c) => c.id).sort(),
    );
    for (const row of queued) {
      expect(row).toMatchObject({
        userId: USER,
        method: "match",
        result: "correct",
        sessionId: SESSION,
      });
    }

    spine.goOnline();
    expect((await flushStudyOutbox(USER)).flushed).toBe(CARDS.length);

    for (const card of CARDS) {
      expect(spine.attemptsFor(card.id)).toHaveLength(1);
      expect(spine.masteryFor("fc_card", card.id)).toMatchObject({
        attempt_count: 1,
        correct_count: 1,
      });
    }

    await hook.unmount();
  });

  it("a second flush of the same pairs cannot double-count them", async () => {
    const hook = await renderHook(() => useMatchGame({ setId: SET }));
    await settle(hook, (h) => !h.loading && h.tiles.length > 0, "board");

    spine.goOffline();
    for (const card of CARDS) await pair(hook, card.id);
    const queued = await listPendingAttempts(USER);
    spine.goOnline();
    await flushStudyOutbox(USER);

    for (const row of queued) {
      const { seq: _s, failedAttempts: _f, lastError: _l, ...replayable } = row;
      await enqueueAttempt(replayable);
    }
    await flushStudyOutbox(USER);

    for (const card of CARDS) {
      expect(spine.attemptsFor(card.id)).toHaveLength(1);
      expect(spine.masteryFor("fc_card", card.id)).toMatchObject({
        attempt_count: 1,
      });
    }

    await hook.unmount();
  });
});

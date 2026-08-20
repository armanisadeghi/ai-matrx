/**
 * Due review (`method='adaptive'`) survives a dropped connection.
 *
 * STATE.md §4.1 B item 8: six of seven study modes called
 * `studyService.recordAttempt` directly and lost the learner's answer with no
 * connection. This suite is the proof for THIS mode, and it deliberately drives
 * the real hook — not the wrapper — because the defect was never in the
 * wrapper. The wrapper worked; five modes just never called it. A test that
 * exercised `recordAttemptOfflineAware` directly would have passed throughout
 * the entire year the bug existed.
 *
 * The assertion that matters is EXACTLY ONCE: the answer reaches
 * `education.study_attempt` a single time after a full offline→replay cycle,
 * with `item_mastery` counters advanced once. Idempotency failures do not
 * error — they silently double a learner's history and corrupt the schedule.
 */

import "fake-indexeddb/auto";
import { createStudySpineFake } from "@/test-utils/study-spine-fake";
import { renderHook, settle } from "@/test-utils/renderHook";

const USER = "11111111-1111-4111-8111-111111111111";
const CARD = "card-due-1";
const SESSION = "session-due-1";

const spine = createStudySpineFake();

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => USER,
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock("@/features/education/study/service/planService", () => ({
  planService: { getActiveDailyItemCap: async () => null },
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
    listDue: async () => ({ data: [{ item_id: CARD }], error: null }),
    createSession: async () => ({ data: { id: SESSION }, error: null }),
    updateSession: async () => ({ data: null, error: null }),
    recordAttempt: (input: unknown) =>
      spine.recordAttempt(input as Record<string, unknown>),
  },
}));

import { useDueReview } from "../useDueReview";
import { flushStudyOutbox } from "@/features/education/study/offline/replay";
import {
  countPendingAttempts,
  listPendingAttempts,
  removeAttempt,
} from "@/features/education/study/offline/outbox";
import { toast } from "@/lib/toast";

async function clearOutbox(): Promise<void> {
  for (const row of await listPendingAttempts(USER)) {
    if (row.seq != null) await removeAttempt(row.seq);
  }
}

describe("due review — offline answers survive (STATE §4.1 B8)", () => {
  beforeEach(async () => {
    spine.reset();
    jest.clearAllMocks();
    await clearOutbox();
  });

  it("queues the answer offline, then replays it EXACTLY ONCE", async () => {
    const hook = await renderHook(() => useDueReview());
    await settle(hook, (h) => !h.loading && h.cards.length === 1, "due cards");

    spine.goOffline();
    await hook.act(async () => {
      await hook.current.grade("correct");
    });

    // Nothing reached the spine, and the answer is NOT gone — it is queued.
    expect(spine.attempts.size).toBe(0);
    expect(await countPendingAttempts(USER)).toBe(1);
    expect(toast.success).toHaveBeenCalledWith(
      "Saved offline — this syncs when you reconnect.",
    );

    // The captured row is the OBSERVATION, carrying this mode's own provenance.
    const [queued] = await listPendingAttempts(USER);
    expect(queued).toMatchObject({
      userId: USER,
      itemId: CARD,
      method: "adaptive",
      result: "correct",
      sessionId: SESSION,
    });

    spine.goOnline();
    const first = await flushStudyOutbox(USER);
    expect(first.flushed).toBe(1);
    expect(first.deadLettered).toEqual([]);
    expect(await countPendingAttempts(USER)).toBe(0);

    // The answer landed once, stamped with WHEN the learner answered.
    expect(spine.attemptsFor(CARD)).toHaveLength(1);
    expect(spine.attemptsFor(CARD)[0].reviewedAt).toBe(queued.capturedAt);
    expect(spine.masteryFor("fc_card", CARD)).toMatchObject({
      attempt_count: 1,
      correct_count: 1,
      last_result: "correct",
    });

    await hook.unmount();
  });

  it("a second flush of the same answer cannot double-count it", async () => {
    const hook = await renderHook(() => useDueReview());
    await settle(hook, (h) => !h.loading && h.cards.length === 1, "due cards");

    spine.goOffline();
    await hook.act(async () => {
      await hook.current.grade("correct");
    });
    const [queued] = await listPendingAttempts(USER);
    spine.goOnline();
    await flushStudyOutbox(USER);

    // Re-queue the SAME attempt id — the shape a duplicated outbox, a second
    // device, or a retry after an unseen response actually takes.
    const { enqueueAttempt } = await import(
      "@/features/education/study/offline/outbox"
    );
    const { seq: _seq, failedAttempts: _f, lastError: _l, ...replayable } = queued;
    expect(await enqueueAttempt(replayable)).toBe(true);
    const second = await flushStudyOutbox(USER);

    expect(second.flushed).toBe(1);
    expect(spine.attemptsFor(CARD)).toHaveLength(1);
    expect(spine.masteryFor("fc_card", CARD)).toMatchObject({
      attempt_count: 1,
      correct_count: 1,
    });

    await hook.unmount();
  });

  it("never queues an answer the SERVER refused — only a dead transport", async () => {
    const hook = await renderHook(() => useDueReview());
    await settle(hook, (h) => !h.loading && h.cards.length === 1, "due cards");

    // Online, but the row is rejected (RLS, validation, a bad FK). Queuing this
    // would retry a genuine bug forever and hide it behind a sync indicator.
    spine.recordAttempt = async () => ({
      data: null,
      error: 'new row violates row-level security policy for table "study_attempt"',
    });

    await hook.act(async () => {
      await hook.current.grade("incorrect");
    });

    expect(await countPendingAttempts(USER)).toBe(0);
    expect(toast.error).toHaveBeenCalled();

    await hook.unmount();
  });
});

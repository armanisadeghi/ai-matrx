/**
 * Test mode / multiple choice (`method='test'`) survives a dropped connection.
 * STATE.md §4.1 B item 8 — see `offline-due-review.test.tsx` for the rationale.
 *
 * Test mode's specific hazard: the UI marks the option right or wrong the
 * instant it is clicked, from LOCAL comparison, before the write returns. So a
 * lost write here is invisible by construction — the learner watches their
 * answer be graded and it never happened.
 */

import "fake-indexeddb/auto";
import { createStudySpineFake } from "@/test-utils/study-spine-fake";
import { renderHook, settle } from "@/test-utils/renderHook";

const USER = "33333333-3333-4333-8333-333333333333";
const SET = "set-quiz-1";
const SESSION = "session-quiz-1";

const spine = createStudySpineFake();

const CARDS = [
  { id: "q-card-1", front: "capital of France", back: "Paris" },
  { id: "q-card-2", front: "capital of Japan", back: "Tokyo" },
  { id: "q-card-3", front: "capital of Peru", back: "Lima" },
  { id: "q-card-4", front: "capital of Kenya", back: "Nairobi" },
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
      data: { set: { id: SET, name: "Capitals" }, cards: CARDS },
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

import { useQuizStudy } from "../useQuizStudy";
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

describe("test mode — offline answers survive (STATE §4.1 B8)", () => {
  beforeEach(async () => {
    spine.reset();
    jest.clearAllMocks();
    await clearOutbox();
  });

  it("queues the answer offline, then replays it EXACTLY ONCE", async () => {
    const hook = await renderHook(() => useQuizStudy({ setId: SET }));
    await settle(hook, (h) => !h.loading && h.questions.length > 0, "questions");

    const q = hook.current.questions[0];
    spine.goOffline();
    await hook.act(async () => {
      await hook.current.answer(q.correctAnswer);
    });

    // The UI already showed the answer as graded — the observation must survive.
    expect(hook.current.selected).toBe(q.correctAnswer);
    expect(spine.attempts.size).toBe(0);
    expect(await countPendingAttempts(USER)).toBe(1);

    const [queued] = await listPendingAttempts(USER);
    expect(queued).toMatchObject({
      userId: USER,
      itemId: q.cardId,
      method: "test",
      result: "correct",
      responseKind: "selected",
      sessionId: SESSION,
    });

    spine.goOnline();
    expect((await flushStudyOutbox(USER)).flushed).toBe(1);

    expect(spine.attemptsFor(q.cardId)).toHaveLength(1);
    expect(spine.masteryFor("fc_card", q.cardId)).toMatchObject({
      attempt_count: 1,
      correct_count: 1,
    });

    await hook.unmount();
  });

  it("a second flush of the same answer cannot double-count it", async () => {
    const hook = await renderHook(() => useQuizStudy({ setId: SET }));
    await settle(hook, (h) => !h.loading && h.questions.length > 0, "questions");

    const q = hook.current.questions[0];
    spine.goOffline();
    await hook.act(async () => {
      await hook.current.answer(q.correctAnswer);
    });
    const [queued] = await listPendingAttempts(USER);
    spine.goOnline();
    await flushStudyOutbox(USER);

    const { seq: _s, failedAttempts: _f, lastError: _l, ...replayable } = queued;
    await enqueueAttempt(replayable);
    await flushStudyOutbox(USER);

    expect(spine.attemptsFor(q.cardId)).toHaveLength(1);
    expect(spine.masteryFor("fc_card", q.cardId)).toMatchObject({
      attempt_count: 1,
      correct_count: 1,
    });

    await hook.unmount();
  });
});

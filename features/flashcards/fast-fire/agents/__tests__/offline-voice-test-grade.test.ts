/**
 * Voice test (`gradeSpokenAnswer`, `method='voice_test'`) survives a dropped
 * connection. STATE.md §4.1 B item 8.
 *
 * Same split as FastFire (see `offline-fastfire-grade.test.ts`): the
 * OBSERVATION is queued, the GRADE is never queued. The difference worth its
 * own suite is that this thunk AWAITS and hands the grade back to a
 * self-contained UI — so it has a second, easy-to-get-wrong path: a grade-only
 * call with no `itemType`/`itemId` has no observation to keep and must queue
 * NOTHING rather than invent an attempt against a nonexistent item.
 */

import "fake-indexeddb/auto";
import { createStudySpineFake } from "@/test-utils/study-spine-fake";

const USER = "66666666-6666-4666-8666-666666666666";
const CARD = "vt-card-1";
const SESSION = "vt-session-1";

const spine = createStudySpineFake();
const uploadResponseClip = jest.fn();
const runSpokenGrader = jest.fn();

jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => USER,
}));
jest.mock("../grading-core", () => ({
  uploadResponseClip: (...a: unknown[]) => uploadResponseClip(...a),
  runSpokenGrader: (...a: unknown[]) => () => runSpokenGrader(...a),
}));
jest.mock("@/features/education/study/service/studyService", () => ({
  studyService: {
    recordAttempt: (input: unknown) =>
      spine.recordAttempt(input as Record<string, unknown>),
  },
}));

import { gradeSpokenAnswer } from "../gradeSpokenAnswer.thunk";
import { flushStudyOutbox } from "@/features/education/study/offline/replay";
import {
  countPendingAttempts,
  listPendingAttempts,
  removeAttempt,
} from "@/features/education/study/offline/outbox";

async function clearOutbox(): Promise<void> {
  for (const row of await listPendingAttempts(USER)) {
    if (row.seq != null) await removeAttempt(row.seq);
  }
}

const dispatch = ((action: unknown) =>
  typeof action === "function"
    ? (action as (d: unknown, g: unknown) => unknown)(dispatch, getState)
    : action) as never;
const getState = (() => ({})) as never;

function args(overrides: Record<string, unknown> = {}) {
  return {
    front: "front",
    back: "back",
    secondsAllowed: 20,
    clip: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }),
    itemType: "fc_card",
    itemId: CARD,
    method: "voice_test",
    sessionId: SESSION,
    ...overrides,
  };
}

describe("voice test — the offline split (STATE §4.1 B8)", () => {
  beforeEach(async () => {
    spine.reset();
    jest.clearAllMocks();
    await clearOutbox();
    uploadResponseClip.mockResolvedValue(null); // no fileId: the network is gone
    runSpokenGrader.mockRejectedValue(
      new Error("the grader must never run offline"),
    );
  });

  it("queues the OBSERVATION offline and replays it exactly once", async () => {
    spine.goOffline();
    const res = await gradeSpokenAnswer(args())(dispatch, getState);

    expect(res.status).toBe("skipped");
    expect(runSpokenGrader).not.toHaveBeenCalled();
    expect(spine.attempts.size).toBe(0);
    expect(await countPendingAttempts(USER)).toBe(1);

    const [queued] = await listPendingAttempts(USER);
    expect(queued).toMatchObject({
      userId: USER,
      itemType: "fc_card",
      itemId: CARD,
      method: "voice_test",
      responseKind: "spoken",
      sessionId: SESSION,
    });
    // THE SPLIT: no grade, no audio pointer, no grader attribution.
    expect(queued.result).toBeNull();
    expect(queued.scoreValue).toBeNull();
    expect(queued.responseAudioFileId).toBeNull();
    expect(queued.gradedBy).toBeNull();

    spine.goOnline();
    expect((await flushStudyOutbox(USER)).flushed).toBe(1);
    expect(spine.attemptsFor(CARD)).toHaveLength(1);
    expect(spine.masteryFor("fc_card", CARD)).toMatchObject({
      attempt_count: 1,
      correct_count: 0,
    });
  });

  it("a GRADE-ONLY call queues nothing — there is no item to attribute", async () => {
    spine.goOffline();
    const res = await gradeSpokenAnswer(
      args({ itemType: undefined, itemId: undefined }),
    )(dispatch, getState);

    expect(res.status).toBe("skipped");
    expect(await countPendingAttempts(USER)).toBe(0);
    expect(spine.attempts.size).toBe(0);
  });

  it("online, the grade IS recorded — the split is offline-only", async () => {
    uploadResponseClip.mockResolvedValue("file-789");
    runSpokenGrader.mockResolvedValue({
      verdict: {
        correct: true,
        partial: false,
        misconception: null,
        explanation: "good",
      },
      score: 0.88,
      rubric: { coverage: 1 },
      transcript: "the learner said this",
      missing: [],
      pronunciation: null,
    });

    const res = await gradeSpokenAnswer(args())(dispatch, getState);

    expect(res.status).toBe("graded");
    expect(await countPendingAttempts(USER)).toBe(0);
    const [row] = spine.attemptsFor(CARD);
    expect(row).toMatchObject({
      method: "voice_test",
      result: "correct",
      responseAudioFileId: "file-789",
    });
    expect(row.gradedBy).toBeTruthy();
    expect(spine.masteryFor("fc_card", CARD)).toMatchObject({
      attempt_count: 1,
      correct_count: 1,
    });
  });
});

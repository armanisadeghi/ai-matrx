/**
 * FastFire + voice test survive a dropped connection — and THE SPLIT.
 * STATE.md §4.1 B item 8.
 *
 * FastFire is the one mode whose grade comes from a SERVER agent, so offline it
 * cannot be treated like the click-to-grade modes. The decision this suite pins
 * (documented in `gradeCard.thunk.ts` and `features/education/FEATURE.md`):
 *
 *   • THE OBSERVATION is queued. The learner answered card X in session S at
 *     time T, spoken — that is a fact about the learner, capturable offline,
 *     and it replays idempotently on reconnect.
 *   • THE GRADE is NEVER queued. It is derived state only the server can
 *     produce, and `study_record_attempt` is idempotent BY ID — a replayed
 *     attempt returns the existing row and deliberately touches nothing — so a
 *     grade arriving later could not be attached through this path anyway. A
 *     queued half-grade would also break the outbox's founding rule.
 *   • THE AUDIO is not retained (its upload needs the network), so an offline
 *     FastFire card lands ungraded and audio-less. Accepted and documented;
 *     making it whole is a separate build.
 *
 * The negative assertions here are the load-bearing ones: a future change that
 * "helpfully" queues a fabricated grade must fail this suite.
 */

import "fake-indexeddb/auto";
import { createStudySpineFake } from "@/test-utils/study-spine-fake";

const USER = "55555555-5555-4555-8555-555555555555";
const CARD = "ff-card-1";
const SESSION = "ff-session-1";

const spine = createStudySpineFake();
const upload = jest.fn();
const runHeadlessAgentJson = jest.fn();

jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => USER,
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: {
    upload: (...args: unknown[]) => upload(...args),
    toContentPart: async () => ({ type: "file", file_id: "f1" }),
  },
}));
jest.mock(
  "@/features/agents/redux/execution-system/thunks/run-headless-agent-json",
  () => ({
    runHeadlessAgentJson: (...args: unknown[]) => runHeadlessAgentJson(...args),
  }),
);
jest.mock("@/features/education/study/service/studyService", () => ({
  studyService: {
    recordAttempt: (input: unknown) =>
      spine.recordAttempt(input as Record<string, unknown>),
  },
}));

import { gradeCard } from "../gradeCard.thunk";
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

const dispatched: { type: string; payload?: unknown }[] = [];
const dispatch = ((action: unknown) => {
  dispatched.push(action as { type: string });
  return action;
}) as never;
const getState = (() => ({})) as never;

function clip(): Blob {
  return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
}

function args(overrides: Record<string, unknown> = {}) {
  return {
    cardId: CARD,
    front: "front",
    back: "back",
    secondsAllowed: 20,
    clip: clip(),
    sessionId: SESSION,
    ...overrides,
  };
}

describe("FastFire — the offline split (STATE §4.1 B8)", () => {
  beforeEach(async () => {
    spine.reset();
    jest.clearAllMocks();
    dispatched.length = 0;
    await clearOutbox();
    // The upload is the FIRST thing the network kills.
    upload.mockRejectedValue(new TypeError("Failed to fetch"));
    runHeadlessAgentJson.mockRejectedValue(
      new Error("the grader must never run offline"),
    );
  });

  it("queues the OBSERVATION offline and replays it exactly once", async () => {
    spine.goOffline();
    await gradeCard(args())(dispatch, getState);

    // The grader was never reached — offline it CANNOT be, and calling it would
    // hallucinate a grade from the card back (the 100%-on-everything bug).
    expect(runHeadlessAgentJson).not.toHaveBeenCalled();
    expect(spine.attempts.size).toBe(0);
    expect(await countPendingAttempts(USER)).toBe(1);

    const [queued] = await listPendingAttempts(USER);
    expect(queued).toMatchObject({
      userId: USER,
      itemId: CARD,
      itemType: "fc_card",
      method: "fast_fire",
      responseKind: "spoken",
      sessionId: SESSION,
    });

    // THE SPLIT, asserted negatively: no grade, no score, no audio pointer, no
    // grader attribution. An offline attempt claims nothing it cannot know.
    expect(queued.result).toBeNull();
    expect(queued.scoreValue).toBeNull();
    expect(queued.score).toBeNull();
    expect(queued.responseTranscript).toBeNull();
    expect(queued.responseAudioFileId).toBeNull();
    expect(queued.gradedBy).toBeNull();

    // The learner is told once, and told the truth about grading.
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(String((toast.success as jest.Mock).mock.calls[0][0])).toMatch(
      /Grading needs a connection/i,
    );

    spine.goOnline();
    expect((await flushStudyOutbox(USER)).flushed).toBe(1);
    expect(spine.attemptsFor(CARD)).toHaveLength(1);
    expect(spine.attemptsFor(CARD)[0]).toMatchObject({
      method: "fast_fire",
      result: null,
      reviewedAt: queued.capturedAt,
    });
    expect(spine.masteryFor("fc_card", CARD)).toMatchObject({
      attempt_count: 1,
      correct_count: 0,
    });
  });

  it("tells the learner ONCE per session, not once per card", async () => {
    spine.goOffline();
    // A DIFFERENT session id from the other cases: the notice latch is
    // per-session and module-level by design (the drill's grade thunks are
    // fire-and-forget and share no component instance), so a suite that reused
    // one session id would be asserting leftover state from an earlier test.
    for (const id of ["ff-a", "ff-b", "ff-c", "ff-d"]) {
      await gradeCard(args({ cardId: id, sessionId: "ff-session-burst" }))(
        dispatch,
        getState,
      );
    }
    expect(await countPendingAttempts(USER)).toBe(4);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("online, the grade IS recorded — the split is offline-only", async () => {
    upload.mockResolvedValue({ fileId: "file-123" });
    runHeadlessAgentJson.mockResolvedValue({
      data: {
        score: 0.9,
        verdict: { result: "correct", explanation: "good" },
        rubric: { coverage: 1 },
        transcript: "the learner said this",
        missing: [],
      },
      error: null,
    });

    await gradeCard(args())(dispatch, getState);

    expect(await countPendingAttempts(USER)).toBe(0);
    const [row] = spine.attemptsFor(CARD);
    expect(row).toMatchObject({
      method: "fast_fire",
      result: "correct",
      responseAudioFileId: "file-123",
    });
    expect(row.gradedBy).toBeTruthy();
    expect(spine.masteryFor("fc_card", CARD)).toMatchObject({
      attempt_count: 1,
      correct_count: 1,
    });
  });

  it("a grader failure ONLINE is a real error, never an offline queue", async () => {
    upload.mockResolvedValue({ fileId: "file-456" });
    runHeadlessAgentJson.mockResolvedValue({
      data: null,
      error: "provider rejected the request",
    });

    await gradeCard(args())(dispatch, getState);

    // Result-less attempt written straight to the spine, so the response audio
    // and session are not lost with the grade — and nothing is queued.
    expect(await countPendingAttempts(USER)).toBe(0);
    expect(spine.attemptsFor(CARD)).toHaveLength(1);
    expect(spine.attemptsFor(CARD)[0]).toMatchObject({
      result: null,
      responseAudioFileId: "file-456",
    });
  });

  it("a second flush of a queued FastFire answer cannot double-count it", async () => {
    spine.goOffline();
    await gradeCard(args())(dispatch, getState);
    const [queued] = await listPendingAttempts(USER);
    spine.goOnline();
    await flushStudyOutbox(USER);

    const { enqueueAttempt } = await import(
      "@/features/education/study/offline/outbox"
    );
    const { seq: _s, failedAttempts: _f, lastError: _l, ...replayable } = queued;
    await enqueueAttempt(replayable);
    await flushStudyOutbox(USER);

    expect(spine.attemptsFor(CARD)).toHaveLength(1);
    expect(spine.masteryFor("fc_card", CARD)).toMatchObject({
      attempt_count: 1,
    });
  });
});

/**
 * FastFire + voice test survive a dropped connection — and THE SPLIT.
 * STATE.md §4.1 B item 8.
 *
 * FastFire is the one mode whose grade comes from a SERVER agent, so offline it
 * cannot be treated like the click-to-grade modes. The decision this suite pins
 * (documented in `gradeCard.thunk.ts` and `features/education/FEATURE.md`):
 *
 *   • THE OBSERVATION is captured. The learner answered card X in session S at
 *     time T, spoken — a fact about the learner, capturable offline.
 *   • THE GRADE is NEVER captured offline and NEVER fabricated. Nothing in the
 *     outbox ever carries a result the server did not produce. That assertion
 *     is the load-bearing one in this file and must not be weakened.
 *   • THE CLIP IS HELD (2026-08-20). It used to die with the drill, leaving an
 *     ungraded, AUDIO-LESS attempt — the learner's work counted, their answer
 *     gone. Now the clip is stored and the attempt is HELD BACK from the ledger
 *     until the flush can upload it and grade it, so it lands ONCE, complete.
 *
 * WHY HOLD BACK instead of recording now and attaching the grade later: there
 * is no write that could attach it. `study_record_attempt` is idempotent BY ID
 * (proven here), and `study_override_attempt` stamps `is_manually_edited` —
 * branding an AI grade as the learner's own correction — and cannot carry the
 * audio pointer, transcript or `graded_by` at all.
 *
 * The negative assertions here are still the load-bearing ones: a future change
 * that queues a fabricated grade, or that lets an ungraded attempt claim a
 * result, must fail this suite.
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
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
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
import {
  flushStudyOutbox,
  MAX_GRADE_RETRIES,
} from "@/features/education/study/offline/replay";
import { createPendingGradeResolver } from "@/features/education/study/offline/resolvePendingGrade";
import {
  countPendingAttempts,
  getClip,
  listPendingAttempts,
  removeAttempt,
  removeClip,
  OFFLINE_CLIP_MAX_BYTES,
} from "@/features/education/study/offline/outbox";
import { toast } from "@/lib/toast";

async function clearOutbox(): Promise<void> {
  for (const row of await listPendingAttempts(USER)) {
    if (row.seq != null) await removeAttempt(row.seq);
    await removeClip(row.attemptId);
  }
}

const dispatched: { type: string; payload?: unknown }[] = [];
// Thunk-aware: `runSpokenGrader` (and therefore the pending-grade resolver) is
// a thunk, so a dispatch that only collects plain actions would never run the
// grader and every replay test would silently pass by doing nothing.
const dispatch = ((action: unknown) => {
  if (typeof action === "function") {
    return (action as (d: unknown, g: unknown) => unknown)(dispatch, getState);
  }
  dispatched.push(action as { type: string });
  return action;
}) as never;
const getState = (() => ({})) as never;

const resolver = createPendingGradeResolver(dispatch, getState);

function clip(bytes = 3): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "audio/wav" });
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

/** A grader that answers correctly — the reconnect happy path. */
function graderReturnsGrade(): void {
  runHeadlessAgentJson.mockResolvedValue({
    data: {
      score: 0.9,
      result: "correct",
      verdict: { result: "correct", explanation: "good" },
      rubric: { accuracy: 1, completeness: 1, clarity: 1 },
      transcript: "the learner said this",
      feedback: "good",
      missing: [],
    },
    error: null,
  });
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

  it("holds the answer offline — observation queued, clip kept, NO grade", async () => {
    spine.goOffline();
    await gradeCard(args())(dispatch, getState);

    // The grader was never reached — offline it CANNOT be, and calling it would
    // hallucinate a grade from the card back (the 100%-on-everything bug).
    expect(runHeadlessAgentJson).not.toHaveBeenCalled();
    // AND the attempt is HELD: nothing reached the ledger, because a row
    // written now could never be given its grade or its audio afterwards.
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

    // 🚨 THE LOAD-BEARING NEGATIVE, unchanged and never to be weakened: an
    // offline attempt claims NOTHING it cannot know. Holding the clip did not
    // buy us permission to invent a grade to go with it.
    expect(queued.result).toBeNull();
    expect(queued.scoreValue).toBeNull();
    expect(queued.score).toBeNull();
    expect(queued.responseTranscript).toBeNull();
    expect(queued.gradedBy).toBeNull();
    // No audio POINTER either — there is no file id until the upload lands.
    expect(queued.responseAudioFileId).toBeNull();

    // What IS new: the learner's actual recording survives, with the grader's
    // inputs beside it, and the row is marked incomplete.
    expect(queued.pendingGrade).toMatchObject({
      mandateKey: "flashcards.grade_spoken",
      front: "front",
      back: "back",
      secondsAllowed: 20,
    });
    const held = await getClip(queued.attemptId);
    expect(held?.bytes).toBe(3);
    expect(held?.data.byteLength).toBe(3);

    // The toast no longer promises these stay ungraded — that sentence became
    // false the moment the clip was kept.
    expect(toast.success).toHaveBeenCalledTimes(1);
    const said = String((toast.success as jest.Mock).mock.calls[0][0]);
    expect(said).toMatch(/graded as soon as you reconnect/i);
    expect(said).not.toMatch(/stay ungraded/i);
  });

  it("on reconnect the held answer is uploaded, graded, and recorded ONCE", async () => {
    spine.goOffline();
    await gradeCard(args())(dispatch, getState);
    const [queued] = await listPendingAttempts(USER);

    spine.goOnline();
    upload.mockResolvedValue({ fileId: "file-replayed" });
    graderReturnsGrade();

    const report = await flushStudyOutbox(USER, resolver);
    expect(report).toMatchObject({ flushed: 1, graded: 1, ungraded: 0 });

    // ONE ledger row, complete: the grade AND the learner's own audio.
    const rows = spine.attemptsFor(CARD);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      method: "fast_fire",
      result: "correct",
      responseAudioFileId: "file-replayed",
      // Scheduled from when they ANSWERED, not when they reconnected.
      reviewedAt: queued.capturedAt,
    });
    expect(rows[0].gradedBy).toBe("flashcards.grade_spoken");
    expect(spine.masteryFor("fc_card", CARD)).toMatchObject({
      attempt_count: 1,
      correct_count: 1,
    });

    // The queue and the held recording are both released.
    expect(await countPendingAttempts(USER)).toBe(0);
    expect(await getClip(queued.attemptId)).toBeNull();
  });

  it("a flush with no resolver records the observation rather than blocking", async () => {
    // A caller with no Redux store (a worker, a test) must not strand every
    // answer behind a capability it does not have.
    spine.goOffline();
    await gradeCard(args())(dispatch, getState);
    spine.goOnline();

    const report = await flushStudyOutbox(USER);
    expect(report).toMatchObject({ flushed: 1, graded: 0, ungraded: 1 });
    expect(spine.attemptsFor(CARD)).toHaveLength(1);
    // Degraded HONESTLY: no grade was produced, so none is claimed.
    expect(spine.attemptsFor(CARD)[0].result).toBeNull();
  });

  it("a still-dead upload keeps the answer held — it is not spent on one try", async () => {
    spine.goOffline();
    await gradeCard(args())(dispatch, getState);
    const [queued] = await listPendingAttempts(USER);

    // Back online enough for the RPC, not enough for a multi-megabyte upload.
    spine.goOnline();
    upload.mockRejectedValue(new TypeError("Failed to fetch"));

    const report = await flushStudyOutbox(USER, resolver);
    expect(report.halted).toBe(true);
    expect(report.flushed).toBe(0);
    // Nothing recorded, clip still held, ready for the next flush.
    expect(spine.attempts.size).toBe(0);
    expect(await getClip(queued.attemptId)).not.toBeNull();

    // And when the upload finally works, it lands complete.
    upload.mockResolvedValue({ fileId: "file-later" });
    graderReturnsGrade();
    expect(await flushStudyOutbox(USER, resolver)).toMatchObject({
      flushed: 1,
      graded: 1,
    });
    expect(spine.attemptsFor(CARD)[0]).toMatchObject({
      result: "correct",
      responseAudioFileId: "file-later",
    });
  });

  it("a permanently failing upload records ungraded rather than holding forever", async () => {
    spine.goOffline();
    await gradeCard(args())(dispatch, getState);
    const [queued] = await listPendingAttempts(USER);
    spine.goOnline();
    upload.mockRejectedValue(new TypeError("Failed to fetch"));

    for (let i = 0; i < MAX_GRADE_RETRIES; i += 1) {
      await flushStudyOutbox(USER, resolver);
    }

    // The learner's WORK still counts — an answer held forever would stop even
    // that from happening.
    expect(spine.attemptsFor(CARD)).toHaveLength(1);
    expect(spine.attemptsFor(CARD)[0]).toMatchObject({
      result: null,
      responseAudioFileId: null,
    });
    expect(await countPendingAttempts(USER)).toBe(0);
    expect(await getClip(queued.attemptId)).toBeNull();
  });

  it("upload succeeds but the grader fails → the AUDIO is still saved, ungraded", async () => {
    // The asymmetry that matters: an ungraded attempt WITH audio can be graded
    // later by anything that can see it; one without audio never can.
    spine.goOffline();
    await gradeCard(args())(dispatch, getState);
    spine.goOnline();
    upload.mockResolvedValue({ fileId: "file-audio-only" });
    runHeadlessAgentJson.mockResolvedValue({ data: null, error: "grader down" });

    const report = await flushStudyOutbox(USER, resolver);
    expect(report).toMatchObject({ flushed: 1, graded: 0, ungraded: 1 });
    expect(spine.attemptsFor(CARD)[0]).toMatchObject({
      responseAudioFileId: "file-audio-only",
      result: null,
    });
  });

  it("ordering survives a slow re-grade — an earlier answer is never overtaken", async () => {
    // FSRS state is sequential, so two answers to the SAME card must reach the
    // ledger in the order they were given, no matter how long grading takes.
    spine.goOffline();
    await gradeCard(args())(dispatch, getState);
    await new Promise((r) => setTimeout(r, 5));
    await gradeCard(args())(dispatch, getState);
    const queued = await listPendingAttempts(USER);
    expect(queued).toHaveLength(2);

    spine.goOnline();
    let call = 0;
    upload.mockImplementation(async () => {
      // The FIRST card's upload is the slow one — the exact race a parallel
      // flush would lose.
      call += 1;
      const mine = call;
      await new Promise((r) => setTimeout(r, mine === 1 ? 30 : 1));
      return { fileId: `file-${mine}` };
    });
    graderReturnsGrade();

    await flushStudyOutbox(USER, resolver);

    const rows = spine.attemptsFor(CARD);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.reviewedAt)).toEqual([
      queued[0].capturedAt,
      queued[1].capturedAt,
    ]);
    expect(rows[0].responseAudioFileId).toBe("file-1");
  });

  it("a recording too large to keep is REFUSED LOUDLY, never dropped silently", async () => {
    spine.goOffline();
    await gradeCard(
      args({ clip: clip(OFFLINE_CLIP_MAX_BYTES + 1), cardId: "ff-huge" }),
    )(dispatch, getState);

    // The observation still survives — the work counts.
    const [queued] = await listPendingAttempts(USER);
    expect(queued.itemId).toBe("ff-huge");
    // But it is NOT held, because there is nothing to grade later...
    expect(queued.pendingGrade).toBeNull();
    expect(await getClip(queued.attemptId)).toBeNull();
    // ...and the learner is told exactly that, in its own message.
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(String((toast.warning as jest.Mock).mock.calls[0][0])).toMatch(
      /too long to keep offline/i,
    );
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

  it("online, the grade IS recorded — the hold-back is offline-only", async () => {
    upload.mockResolvedValue({ fileId: "file-123" });
    graderReturnsGrade();

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
    upload.mockResolvedValue({ fileId: "file-once" });
    graderReturnsGrade();
    await flushStudyOutbox(USER, resolver);

    const { enqueueAttempt } = await import(
      "@/features/education/study/offline/outbox"
    );
    const { seq: _s, failedAttempts: _f, lastError: _l, ...replayable } = queued;
    await enqueueAttempt(replayable);
    await flushStudyOutbox(USER, resolver);

    // The idempotency key is what makes this safe — and it is ALSO why a late
    // grade could never have been attached to an already-recorded attempt.
    expect(spine.attemptsFor(CARD)).toHaveLength(1);
    expect(spine.masteryFor("fc_card", CARD)).toMatchObject({
      attempt_count: 1,
    });
  });
});

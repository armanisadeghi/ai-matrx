/**
 * IC-8 §5 proof: "study offline, replay the same outbox TWICE, diff the spine —
 * zero duplicate attempts, mastery identical to a single replay."
 *
 * This exercises the real outbox (fake-indexeddb) and the real replay loop
 * against a fake spine that reproduces the LIVE RPC's contract, verified
 * against pg_get_functiondef on 2026-08-17:
 *   • p_attempt_id becomes the ledger row's primary key
 *   • a call whose attempt id already exists returns {replayed:true} and does
 *     NOT touch item_mastery
 *   • mastery counters are deltas (attempt_count + 1)
 *
 * That last property is why the test matters: if idempotency were broken, a
 * second replay would silently double every counter, which is invisible in the
 * UI until a learner's schedule is already wrong.
 */

import "fake-indexeddb/auto";

const spine = {
  attempts: new Map<string, { itemId: string; result: string | null }>(),
  mastery: new Map<string, { attempt_count: number; correct_count: number }>(),
};

interface FakeAttemptInput {
  itemType: string;
  itemId: string;
  result?: string | null;
  attemptId?: string | null;
  reviewedAt?: string | null;
}
interface FakeMastery {
  attempt_count: number;
  correct_count: number;
}
type FakeResult = {
  data: { attemptId: string; mastery: FakeMastery } | null;
  error: string | null;
};

const recordAttempt = jest.fn<Promise<FakeResult>, [FakeAttemptInput]>(
  async (input: FakeAttemptInput) => {
    const id = input.attemptId ?? `server-${spine.attempts.size}`;
    const key = `${input.itemType}:${input.itemId}`;

    // Idempotent replay: existing id → return current mastery, touch nothing.
    if (spine.attempts.has(id)) {
      return {
        data: {
          attemptId: id,
          mastery: spine.mastery.get(key) ?? { attempt_count: 0, correct_count: 0 },
        },
        error: null,
      };
    }

    spine.attempts.set(id, { itemId: input.itemId, result: input.result ?? null });
    const prior = spine.mastery.get(key) ?? { attempt_count: 0, correct_count: 0 };
    const next = {
      attempt_count: prior.attempt_count + 1,
      correct_count: prior.correct_count + (input.result === "correct" ? 1 : 0),
    };
    spine.mastery.set(key, next);
    return { data: { attemptId: id, mastery: next }, error: null };
  },
);

jest.mock("../../service/studyService", () => ({
  studyService: {
    recordAttempt: (input: unknown) =>
      recordAttempt(input as Parameters<typeof recordAttempt>[0]),
  },
}));

import { enqueueAttempt, countPendingAttempts, listPendingAttempts } from "../outbox";
import { flushStudyOutbox } from "../replay";

const USER = "11111111-1111-4111-8111-111111111111";

function attempt(n: number, result: "correct" | "incorrect") {
  return {
    attemptId: `aaaaaaaa-0000-4000-8000-00000000000${n}`,
    userId: USER,
    itemType: "fc_card",
    itemId: "card-1",
    sessionId: "session-1",
    method: "flashcards",
    result,
    confidence: null,
    score: null,
    scoreValue: null,
    responseKind: null,
    responseTranscript: null,
    responseAudioFileId: null,
    responseImageFileId: null,
    gradedBy: null,
    latencyMs: 1200,
    capturedAt: new Date(Date.UTC(2026, 7, 17, 10, n)).toISOString(),
  };
}

describe("offline study replay (IC-8)", () => {
  beforeEach(() => {
    spine.attempts.clear();
    spine.mastery.clear();
    recordAttempt.mockClear();
  });

  it("replaying the same outbox twice records each attempt exactly once", async () => {
    await enqueueAttempt(attempt(1, "correct"));
    await enqueueAttempt(attempt(2, "incorrect"));
    await enqueueAttempt(attempt(3, "correct"));
    expect(await countPendingAttempts(USER)).toBe(3);

    const first = await flushStudyOutbox(USER);
    expect(first).toMatchObject({ flushed: 3, remaining: 0, halted: false });

    const masteryAfterOne = { ...spine.mastery.get("fc_card:card-1")! };
    expect(masteryAfterOne).toEqual({ attempt_count: 3, correct_count: 2 });
    expect(spine.attempts.size).toBe(3);
    expect(await countPendingAttempts(USER)).toBe(0);

    // Re-queue the identical observations (the "replayed twice" scenario: a
    // queue that was flushed but whose acknowledgement the client never saw).
    await enqueueAttempt(attempt(1, "correct"));
    await enqueueAttempt(attempt(2, "incorrect"));
    await enqueueAttempt(attempt(3, "correct"));

    const second = await flushStudyOutbox(USER);
    expect(second).toMatchObject({ flushed: 3, remaining: 0, halted: false });

    // The spine is IDENTICAL to a single replay — the whole point.
    expect(spine.attempts.size).toBe(3);
    expect(spine.mastery.get("fc_card:card-1")).toEqual(masteryAfterOne);
  });

  it("passes the captured time as the review instant, not the flush time", async () => {
    await enqueueAttempt(attempt(1, "correct"));
    await flushStudyOutbox(USER);

    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "aaaaaaaa-0000-4000-8000-000000000001",
        reviewedAt: new Date(Date.UTC(2026, 7, 17, 10, 1)).toISOString(),
      }),
    );
  });

  it("replays in capture order, because FSRS state is sequential", async () => {
    await enqueueAttempt(attempt(1, "correct"));
    await enqueueAttempt(attempt(2, "incorrect"));
    await enqueueAttempt(attempt(3, "correct"));
    await flushStudyOutbox(USER);

    const order = recordAttempt.mock.calls.map((c) => c[0].attemptId);
    expect(order).toEqual([
      "aaaaaaaa-0000-4000-8000-000000000001",
      "aaaaaaaa-0000-4000-8000-000000000002",
      "aaaaaaaa-0000-4000-8000-000000000003",
    ]);
  });

  it("halts on a server error and leaves the rest queued for the next flush", async () => {
    await enqueueAttempt(attempt(1, "correct"));
    await enqueueAttempt(attempt(2, "incorrect"));
    await enqueueAttempt(attempt(3, "correct"));

    recordAttempt
      .mockImplementationOnce(async () => ({
        data: { attemptId: "x", mastery: { attempt_count: 1, correct_count: 1 } },
        error: null,
      }))
      .mockImplementationOnce(async () => ({ data: null, error: "boom" }));

    const report = await flushStudyOutbox(USER);
    expect(report.halted).toBe(true);
    expect(report.flushed).toBe(1);
    expect(report.haltReason).toContain("boom");

    // The failed item and everything after it are still queued — nothing lost,
    // and nothing replayed out of order.
    const still = await listPendingAttempts(USER);
    expect(still.map((a) => a.attemptId)).toEqual([
      "aaaaaaaa-0000-4000-8000-000000000002",
      "aaaaaaaa-0000-4000-8000-000000000003",
    ]);
  });
});

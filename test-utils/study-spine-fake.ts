/**
 * test-utils/study-spine-fake.ts
 *
 * A fake `education.study_attempt` / `item_mastery` spine that reproduces the
 * LIVE `study_record_attempt` RPC's contract, verified against
 * pg_get_functiondef on 2026-08-17 (the same contract the IC-8 replay proof
 * asserts against, lifted out of that suite so every study mode tests the same
 * server, not its own approximation of one):
 *
 *   • `p_attempt_id` becomes the ledger row's PRIMARY KEY.
 *   • A call whose attempt id already exists returns the existing attempt and
 *     does NOT touch `item_mastery` — that is what makes replay idempotent.
 *   • Mastery counters are DELTAS (attempt_count + 1), so a broken idempotency
 *     guard silently doubles a learner's history instead of erroring.
 *
 * `offline()` flips the failure mode to what a dead transport actually looks
 * like from supabase-js: a TypeError from `fetch`, plus `navigator.onLine`
 * false. A test that only sets `onLine` proves half the wrapper.
 */

export interface FakeMastery {
  item_id: string;
  attempt_count: number;
  correct_count: number;
  last_result: string | null;
  /** The FSRS review instant the RPC used — proves `reviewedAt` is honored. */
  last_reviewed_at: string | null;
}

export interface FakeAttemptRow {
  attemptId: string;
  itemType: string;
  itemId: string;
  sessionId: string | null;
  method: string | null;
  result: string | null;
  responseKind: string | null;
  responseAudioFileId: string | null;
  gradedBy: string | null;
  reviewedAt: string | null;
}

export interface StudySpineFake {
  attempts: Map<string, FakeAttemptRow>;
  mastery: Map<string, FakeMastery>;
  /** Every call the spine received, including idempotent replays. */
  calls: number;
  recordAttempt: (input: Record<string, unknown>) => Promise<unknown>;
  reset: () => void;
  /** Kill the transport: `navigator.onLine` false AND a fetch-style TypeError. */
  goOffline: () => void;
  goOnline: () => void;
  isOffline: () => boolean;
  /** Attempts recorded for one item, in insertion order. */
  attemptsFor: (itemId: string) => FakeAttemptRow[];
  masteryFor: (itemType: string, itemId: string) => FakeMastery | undefined;
}

function setOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
  });
}

export function createStudySpineFake(): StudySpineFake {
  const attempts = new Map<string, FakeAttemptRow>();
  const mastery = new Map<string, FakeMastery>();
  let offline = false;

  const spine: StudySpineFake = {
    attempts,
    mastery,
    calls: 0,
    reset() {
      attempts.clear();
      mastery.clear();
      spine.calls = 0;
      offline = false;
      setOnLine(true);
    },
    goOffline() {
      offline = true;
      setOnLine(false);
    },
    goOnline() {
      offline = false;
      setOnLine(true);
    },
    isOffline: () => offline,
    attemptsFor: (itemId) =>
      [...attempts.values()].filter((a) => a.itemId === itemId),
    masteryFor: (itemType, itemId) => mastery.get(`${itemType}:${itemId}`),

    async recordAttempt(input) {
      spine.calls += 1;
      if (offline) {
        // Exactly how a dead transport surfaces through studyService: not a
        // PostgrestError with a code, but fetch's TypeError, stringified.
        return { data: null, error: "TypeError: Failed to fetch" };
      }

      const itemType = String(input.itemType);
      const itemId = String(input.itemId);
      const key = `${itemType}:${itemId}`;
      const id = (input.attemptId as string | null) ?? `server-${attempts.size}`;

      // Idempotent replay: an id we already hold returns the existing attempt
      // and leaves mastery ALONE.
      const existing = attempts.get(id);
      if (existing) {
        return { data: { attemptId: id, mastery: mastery.get(key) }, error: null };
      }

      const result = (input.result as string | null) ?? null;
      attempts.set(id, {
        attemptId: id,
        itemType,
        itemId,
        sessionId: (input.sessionId as string | null) ?? null,
        method: (input.method as string | null) ?? null,
        result,
        responseKind: (input.responseKind as string | null) ?? null,
        responseAudioFileId: (input.responseAudioFileId as string | null) ?? null,
        gradedBy: (input.gradedBy as string | null) ?? null,
        reviewedAt: (input.reviewedAt as string | null) ?? null,
      });

      const prior = mastery.get(key) ?? {
        item_id: itemId,
        attempt_count: 0,
        correct_count: 0,
        last_result: null,
        last_reviewed_at: null,
      };
      const next: FakeMastery = {
        item_id: itemId,
        attempt_count: prior.attempt_count + 1,
        correct_count: prior.correct_count + (result === "correct" ? 1 : 0),
        last_result: result,
        last_reviewed_at: (input.reviewedAt as string | null) ?? null,
      };
      mastery.set(key, next);
      return { data: { attemptId: id, mastery: next }, error: null };
    },
  };

  return spine;
}

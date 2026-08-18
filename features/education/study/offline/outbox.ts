/**
 * features/education/study/offline/outbox.ts
 *
 * The offline study outbox — the client half of IC-8
 * (common-docs/projects/education-platform/INTEGRATION_MAP.md).
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: **capture the observation, never
 * the derived state.** `study_record_attempt` is a non-idempotent ledger append
 * whose mastery counters are deltas and whose FSRS state is computed on the
 * CLIENT from the row's prior mastery. So an attempt captured offline stores
 * only what the learner actually did — item, result, confidence, when. The FSRS
 * math is re-derived at flush time against the then-current mastery row. If we
 * stored the computed FSRS state instead, two devices studying the same deck
 * offline would each flush a scheduling decision made against a stale mastery
 * row and corrupt the card's schedule.
 *
 * Ordering is load-bearing: FSRS state is sequential, so attempts replay in the
 * order they were captured (`seq`, a monotonic autoincrement).
 *
 * Durability: Dexie/IndexedDB, the same library the sync engine uses. A browser
 * with IndexedDB unavailable (private mode, quota) degrades to "no offline
 * capture" — loudly, via `isOutboxAvailable()`, never by silently dropping a
 * learner's answers on the floor.
 */

import Dexie, { type Table } from "dexie";

export const STUDY_OFFLINE_DB = "matrx-study-offline";
export const STUDY_OFFLINE_SCHEMA_VERSION = 1;

/**
 * One captured attempt. Mirrors IC-8 §1 exactly — note the ABSENCE of
 * difficulty/stability/due/retrievability/lapses. That is deliberate.
 */
export interface OutboxAttempt {
  /** Autoincrement — the replay order. */
  seq?: number;
  /** Client-generated UUID; becomes the ledger row's PK (the idempotency key). */
  attemptId: string;
  /** Whose attempt — so one device's queue never flushes under another login. */
  userId: string;
  itemType: string;
  itemId: string;
  /** Client-generated session id, created offline and reused across the queue. */
  sessionId: string | null;
  method: string | null;
  result: "correct" | "partial" | "incorrect" | null;
  confidence: number | null;
  score: Record<string, unknown> | null;
  scoreValue: number | null;
  responseKind:
    | "spoken"
    | "written"
    | "typed"
    | "handwritten"
    | "selected"
    | null;
  responseTranscript: string | null;
  latencyMs: number | null;
  /** When the learner answered. Becomes the FSRS review instant on replay. */
  capturedAt: string;
  /** Failed flush attempts, for surfacing a stuck queue rather than hiding it. */
  failedAttempts: number;
  lastError: string | null;
}

/** A deck cached for offline study (IC-8 §4). */
export interface OfflineDeck {
  /** `fc_set.id`. */
  setId: string;
  userId: string;
  /** The set row, its cards, and the per-card detail needed to render. */
  payload: unknown;
  /** The learner's item_mastery snapshot for this deck at cache time. */
  mastery: unknown;
  /** The due-queue snapshot at cache time. */
  dueQueue: unknown;
  cachedAt: number;
  /** Human label, so the manage-downloads UI never renders a bare id. */
  title: string;
  cardCount: number;
}

class StudyOfflineDb extends Dexie {
  attempts!: Table<OutboxAttempt, number>;
  decks!: Table<OfflineDeck, [string, string]>;

  constructor() {
    super(STUDY_OFFLINE_DB);
    this.version(STUDY_OFFLINE_SCHEMA_VERSION).stores({
      // ++seq = autoincrement primary key (replay order).
      // &attemptId = unique, so a double-capture cannot queue twice.
      attempts: "++seq, &attemptId, userId, capturedAt",
      // The deck key is [userId+setId], NOT setId. Keyed on setId alone, two
      // learners sharing a device collided: B opening set S read A's cached
      // cards AND A's item_mastery snapshot, and B's download silently
      // overwrote A's row. A cache key that omits the owner is a data leak.
      decks: "[userId+setId], setId, userId, cachedAt",
    });
  }
}

let db: StudyOfflineDb | null = null;
let openFailed = false;

function getDb(): StudyOfflineDb | null {
  if (openFailed) return null;
  if (db) return db;
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return null;
  }
  try {
    db = new StudyOfflineDb();
    return db;
  } catch {
    openFailed = true;
    return null;
  }
}

/** False when this browser cannot persist offline work at all. */
export function isOutboxAvailable(): boolean {
  return getDb() != null;
}

/**
 * Queue one attempt. Returns false when it could NOT be persisted — the caller
 * must then tell the learner their answer was not saved rather than pretending
 * it was.
 */
export async function enqueueAttempt(
  attempt: Omit<OutboxAttempt, "seq" | "failedAttempts" | "lastError">,
): Promise<boolean> {
  const database = getDb();
  if (!database) return false;
  try {
    await database.attempts.add({
      ...attempt,
      failedAttempts: 0,
      lastError: null,
    });
    return true;
  } catch (e) {
    // A duplicate attemptId means it is already queued — that is success, not
    // a failure: the whole point of the id is that capturing twice is safe.
    if (e instanceof Dexie.ConstraintError) return true;
    return false;
  }
}

/** Pending attempts for one user, in capture order. */
export async function listPendingAttempts(
  userId: string,
): Promise<OutboxAttempt[]> {
  const database = getDb();
  if (!database) return [];
  try {
    const rows = await database.attempts.where("userId").equals(userId).toArray();
    return rows.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  } catch {
    return [];
  }
}

export async function countPendingAttempts(userId: string): Promise<number> {
  const database = getDb();
  if (!database) return 0;
  try {
    return await database.attempts.where("userId").equals(userId).count();
  } catch {
    return 0;
  }
}

/** Remove an attempt once the server has durably accepted it. */
export async function removeAttempt(seq: number): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await database.attempts.delete(seq);
  } catch {
    /* a queue we cannot prune is retried; never throw into a study loop */
  }
}

/** Record a failed flush so a permanently stuck item is visible, not silent. */
export async function markAttemptFailed(
  seq: number,
  message: string,
): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    const row = await database.attempts.get(seq);
    if (!row) return;
    await database.attempts.update(seq, {
      failedAttempts: row.failedAttempts + 1,
      lastError: message.slice(0, 500),
    });
  } catch {
    /* non-fatal */
  }
}

// ─── Cached decks ─────────────────────────────────────────────────────────

export async function putOfflineDeck(deck: OfflineDeck): Promise<boolean> {
  const database = getDb();
  if (!database) return false;
  try {
    await database.decks.put(deck);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read one cached deck FOR ONE LEARNER. The userId is required, not optional:
 * making it optional is how the original version leaked one learner's cached
 * cards and mastery snapshot to the next person to sign in on the same device.
 */
export async function getOfflineDeck(
  userId: string,
  setId: string,
): Promise<OfflineDeck | null> {
  const database = getDb();
  if (!database) return null;
  try {
    return (await database.decks.get([userId, setId])) ?? null;
  } catch {
    return null;
  }
}

export async function listOfflineDecks(
  userId: string,
): Promise<OfflineDeck[]> {
  const database = getDb();
  if (!database) return [];
  try {
    const rows = await database.decks.where("userId").equals(userId).toArray();
    return rows.sort((a, b) => b.cachedAt - a.cachedAt);
  } catch {
    return [];
  }
}

export async function removeOfflineDeck(
  userId: string,
  setId: string,
): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await database.decks.delete([userId, setId]);
  } catch {
    /* non-fatal */
  }
}

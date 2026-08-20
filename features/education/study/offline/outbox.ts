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
 *
 * ── THE PENDING-GRADE EXTENSION (v2, 2026-08-20) ─────────────────────────────
 * One family of attempt cannot be completed offline at all: the SPOKEN modes
 * (FastFire, voice test), whose grade is produced by a server agent from an
 * audio clip that itself needs the network to upload. Those attempts are queued
 * as an observation PLUS the raw clip and the grader's inputs (`pendingGrade`),
 * and are HELD BACK from the ledger until the flush can upload + grade them —
 * see `replay.ts`. The clip lives in its own `clips` table rather than on the
 * attempt row so that listing the queue stays cheap: audio is orders of
 * magnitude larger than an attempt row, and `listPendingAttempts` would
 * otherwise pull every megabyte of it into memory on every flush and every
 * queue-depth poll.
 *
 * This does NOT weaken the founding rule. A `pendingGrade` row still stores only
 * what the learner DID — what they said (the clip) and what they were asked
 * (front/back/seconds) — never a grade. The grade is still derived at flush,
 * by the server, exactly as it would have been online.
 */

import Dexie, { type Table } from "dexie";
import type { SourceFeature } from "@/features/agents/types/instance.types";

export const STUDY_OFFLINE_DB = "matrx-study-offline";
export const STUDY_OFFLINE_SCHEMA_VERSION = 2;

/**
 * Everything the flush needs to reproduce, at reconnect, the grader run that
 * could not happen offline. It is the grader's INPUTS and nothing else: the
 * prompt the learner answered, how long they had, and which MANDATE grades it
 * (a mandate key, never an agent id — the DB decides the agent, and it may be a
 * different one by the time this replays, which is correct).
 */
export interface PendingGradeSpec {
  mandateKey: string;
  front: string;
  back: string;
  secondsAllowed: number;
  /** Cloud folder the clip belongs in once it can be uploaded. */
  folderPath: string;
  /** Free-form provenance stamped on the uploaded file (origin, session, card). */
  uploadMetadata: Record<string, unknown>;
  /** Names the uploaded clip exactly as the online path would. */
  cardId: string | null;
  /** Optional extra grading rubric (voice-test surfaces pass one). */
  rubric: string | null;
  /** Which surface captured it — telemetry + the grader's `surfaceKey`. */
  surface: string;
  /** Keeps replayed grader runs out of the learner's normal chats. */
  sourceFeature: SourceFeature;
  /** Canonical `ui_surface.name` of the lane, so surface bindings resolve. */
  surfaceName: string | null;
}

/**
 * A learner's recorded answer, held until the flush can upload and grade it.
 *
 * Stored as raw BYTES plus its mime type, not as a `Blob`. IndexedDB's
 * structured clone handles `ArrayBuffer` identically everywhere; `Blob` does
 * not — Safari shipped years of IndexedDB builds that stored a Blob and handed
 * back an empty object, and `fake-indexeddb` does the same today, so the bug
 * would have been invisible in tests and silent in the field (a learner's
 * recording reading back as zero bytes and being written off as "gone"). The
 * Blob is reconstructed at upload time from these two fields, which is exactly
 * the information it carried.
 */
export interface OutboxClip {
  /** Same id as the attempt it belongs to — one clip per attempt, or none. */
  attemptId: string;
  userId: string;
  data: ArrayBuffer;
  mimeType: string;
  /** `data.byteLength`, denormalized so the budget scan never touches payloads. */
  bytes: number;
}

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
  /**
   * Durable pointers to media the learner produced, when the upload landed
   * BEFORE the connection died (FastFire and the voice surfaces upload the clip
   * first, then record the attempt — so the id can exist while the write fails).
   * Dropping them here silently detached a learner's own audio from the attempt
   * it belongs to, which is a lost answer wearing a saved answer's clothes.
   */
  responseAudioFileId: string | null;
  responseImageFileId: string | null;
  /** Which grader produced `result`/`score`, when one ran before the drop. */
  gradedBy: string | null;
  latencyMs: number | null;
  /** When the learner answered. Becomes the FSRS review instant on replay. */
  capturedAt: string;
  /** Failed flush attempts, for surfacing a stuck queue rather than hiding it. */
  failedAttempts: number;
  lastError: string | null;
  /**
   * Set when this attempt is INCOMPLETE and must be graded before it may be
   * recorded (the spoken modes). Null on every attempt the learner's own device
   * could finish — which is six of the seven study modes.
   *
   * The hold-back is deliberate and the alternative was rejected on the
   * evidence: `study_record_attempt` is idempotent BY ID and touches nothing on
   * replay, so a grade arriving later cannot be attached through it, and the
   * only other write — `study_override_attempt` — stamps `is_manually_edited`
   * and `edited_by`, which would brand an AI grade as the LEARNER'S manual
   * correction (the flag exists for contest integrity), and cannot carry
   * `response_audio_file_id`, `response_transcript` or `graded_by` at all.
   * Recording once, complete, is the only honest shape.
   */
  pendingGrade?: PendingGradeSpec | null;
  /**
   * How many times the flush tried and failed to GRADE this attempt (distinct
   * from `failedAttempts`, which counts ledger-write failures). At the cap the
   * attempt is recorded ungraded rather than held forever — a held answer that
   * never lands is worse than an ungraded one that does.
   */
  gradeFailures?: number;
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
  clips!: Table<OutboxClip, string>;

  constructor() {
    super(STUDY_OFFLINE_DB);
    // v1 is declared verbatim so a browser holding a v1 database upgrades
    // rather than being torn down. Dexie applies versions in order and an
    // upgrade that only ADDS a store keeps every existing row: a learner who
    // queued answers before this shipped must not lose them to a schema bump.
    this.version(1).stores({
      attempts: "++seq, &attemptId, userId, capturedAt",
      decks: "[userId+setId], setId, userId, cachedAt",
    });
    this.version(STUDY_OFFLINE_SCHEMA_VERSION).stores({
      // ++seq = autoincrement primary key (replay order).
      // &attemptId = unique, so a double-capture cannot queue twice.
      // Non-indexed columns (responseAudioFileId, gradedBy, ...) are free-form
      // in Dexie — only INDEXES live in this string, so widening the captured
      // payload needs no version bump and leaves already-queued rows readable.
      attempts: "++seq, &attemptId, userId, capturedAt",
      // The deck key is [userId+setId], NOT setId. Keyed on setId alone, two
      // learners sharing a device collided: B opening set S read A's cached
      // cards AND A's item_mastery snapshot, and B's download silently
      // overwrote A's row. A cache key that omits the owner is a data leak.
      decks: "[userId+setId], setId, userId, cachedAt",
      // The learner's own recording, held until it can be uploaded and graded.
      // Keyed by attemptId (one clip per attempt), indexed by userId so the
      // per-learner budget and cleanup never scan another learner's audio.
      clips: "attemptId, userId",
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
      pendingGrade: null,
      gradeFailures: 0,
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

// ─── Held recordings (the pending-grade clips) ────────────────────────────

/**
 * THE STORAGE BUDGET — an agent decision under blind approval (2026-08-20),
 * review by 2026-10-20 once real device data exists.
 *
 * These are NOT product entitlements and deliberately not admin knobs: nothing
 * here consumes a resource we pay for. The bytes live on the LEARNER'S disk in
 * their own browser, and the only thing a number here can do is decide whether
 * we keep their recording or tell them we could not. Routing that through a
 * server-fetched setting would make offline capture depend on the network,
 * which is the one thing it must not do.
 *
 * Basis: a FastFire clip is uncompressed WAV from the capture core — roughly
 * 32 KB per second at 16 kHz mono 16-bit, so a 20-second card is ~640 KB and
 * even a 2-minute long-form answer is under 4 MB. PER_CLIP is set far above
 * that so a legitimate answer is never refused for being long, and TOTAL holds
 * several hundred typical clips — many multiples of any single offline
 * sitting — while staying a small fraction of the multi-gigabyte IndexedDB
 * quota browsers grant on a normal device.
 */
export const OFFLINE_CLIP_MAX_BYTES = 25 * 1024 * 1024;
export const OFFLINE_CLIP_TOTAL_BUDGET_BYTES = 250 * 1024 * 1024;

/** Why a recording could not be held. Never "it just didn't happen". */
export type ClipRejection = "unavailable" | "too-large" | "budget-full" | "write-failed";

export interface StoreClipResult {
  stored: boolean;
  reason: ClipRejection | null;
}

/**
 * Read a recording's raw bytes.
 *
 * `Blob.arrayBuffer()` is the obvious call and is what runs on every current
 * browser — but it only reached Safari in 14, and a learner on an older iOS
 * device is exactly the person most likely to be studying with no signal. The
 * `FileReader` fallback is the API that has always existed, so this never
 * throws away a recording over a missing method. (It is also the path jsdom
 * takes, so the tests exercise it rather than a branch production skips.)
 */
export async function readClipBytes(clip: Blob): Promise<ArrayBuffer | null> {
  try {
    if (typeof clip.arrayBuffer === "function") return await clip.arrayBuffer();
  } catch {
    /* fall through to FileReader */
  }
  if (typeof FileReader === "undefined") return null;
  return new Promise<ArrayBuffer | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(
        reader.result instanceof ArrayBuffer ? reader.result : null,
      );
    reader.onerror = () => resolve(null);
    try {
      reader.readAsArrayBuffer(clip);
    } catch {
      resolve(null);
    }
  });
}

/** Bytes of held audio for one learner. */
export async function heldClipBytes(userId: string): Promise<number> {
  const database = getDb();
  if (!database) return 0;
  try {
    let total = 0;
    await database.clips
      .where("userId")
      .equals(userId)
      .each((row) => {
        total += row.bytes;
      });
    return total;
  } catch {
    return 0;
  }
}

/**
 * Hold one recording against its attempt.
 *
 * REFUSES rather than EVICTS when the budget is full. Every clip already held
 * belongs to an answer we have already told the learner is saved; dropping one
 * to make room for a newer one would destroy an answer they were promised —
 * silently, and with no way to know which. Refusing the new one is visible at
 * the moment it happens, and the caller MUST say so (that is why this returns a
 * reason rather than a bare boolean).
 *
 * Orphans — clips whose attempt has already flushed or been dead-lettered —
 * are the only thing ever reclaimed, by `pruneOrphanClips`.
 */
export async function storeClip(clip: OutboxClip): Promise<StoreClipResult> {
  const database = getDb();
  if (!database) return { stored: false, reason: "unavailable" };
  if (clip.bytes > OFFLINE_CLIP_MAX_BYTES) {
    return { stored: false, reason: "too-large" };
  }
  try {
    const held = await heldClipBytes(clip.userId);
    if (held + clip.bytes > OFFLINE_CLIP_TOTAL_BUDGET_BYTES) {
      return { stored: false, reason: "budget-full" };
    }
    await database.clips.put(clip);
    return { stored: true, reason: null };
  } catch {
    // A QuotaExceededError from the browser itself lands here. It is a refusal
    // like any other and gets the same loud treatment — the learner is told
    // their recording was not kept, never left to assume it was.
    return { stored: false, reason: "write-failed" };
  }
}

export async function getClip(attemptId: string): Promise<OutboxClip | null> {
  const database = getDb();
  if (!database) return null;
  try {
    return (await database.clips.get(attemptId)) ?? null;
  } catch {
    return null;
  }
}

/** Drop a held recording once its attempt has reached the ledger (or died). */
export async function removeClip(attemptId: string): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await database.clips.delete(attemptId);
  } catch {
    /* a clip we cannot prune is retried next flush; never throw */
  }
}

/**
 * Reclaim clips whose attempt is no longer queued. A crash between "record the
 * attempt" and "remove the clip" would otherwise leak the learner's budget
 * forever, and the leak is invisible: the queue reads empty while the disk
 * stays full. Cheap enough to run at the end of every flush.
 */
export async function pruneOrphanClips(userId: string): Promise<number> {
  const database = getDb();
  if (!database) return 0;
  try {
    const live = new Set(
      (await database.attempts.where("userId").equals(userId).toArray()).map(
        (a) => a.attemptId,
      ),
    );
    const orphans: string[] = [];
    await database.clips
      .where("userId")
      .equals(userId)
      .each((row) => {
        if (!live.has(row.attemptId)) orphans.push(row.attemptId);
      });
    if (orphans.length > 0) await database.clips.bulkDelete(orphans);
    return orphans.length;
  } catch {
    return 0;
  }
}

/** Record a failed GRADE so a held attempt cannot be held forever. */
export async function markGradeFailed(seq: number): Promise<number> {
  const database = getDb();
  if (!database) return 0;
  try {
    const row = await database.attempts.get(seq);
    if (!row) return 0;
    const next = (row.gradeFailures ?? 0) + 1;
    await database.attempts.update(seq, { gradeFailures: next });
    return next;
  } catch {
    return 0;
  }
}

/**
 * Give up on grading this attempt and let it flush as the bare observation.
 * Clearing `pendingGrade` is what releases the hold-back — after this the row
 * is an ordinary queued attempt and replays like any other.
 */
export async function clearPendingGrade(seq: number): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await database.attempts.update(seq, { pendingGrade: null });
  } catch {
    /* non-fatal — the retry cap is re-checked on the next flush */
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

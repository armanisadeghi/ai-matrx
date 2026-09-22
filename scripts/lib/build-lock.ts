/**
 * `campaign_watch.build_lock` — THE ONE TAKE / RENEW / RELEASE PATH (lane LOCK-HYGIENE).
 * ======================================================================================
 *
 * THE DEFECT THIS CLOSES, three times on 2026-09-22: a lane finishes and its lock row stays.
 * FIX-10A held `custom` for 20 minutes after its DONE report; STORE-TXN-3 held `platform` after
 * its final report; the TAILS lane held `custom` for 18 hours. The next lane's TAKE returns zero
 * rows against a holder that no longer exists, and §4.7 tells it to wait — an hour of somebody's
 * night spent on a lock nobody is using.
 *
 * No amount of trap discipline in the HOLDER can fix that, because a lane that dies has no code
 * running. The fix is in the row: `expires_at` is a bounded lease (`campaign_watch.lock_lease()`,
 * fifteen minutes), pushed forward by every renew, and a row whose lease has lapsed is EXPIRED —
 * not held. `campaign_watch.lock_take()` evicts an expired row and names its former holder and
 * its age; a LIVE row still blocks, so no refusal is weakened.
 *
 * This module is the TypeScript half of that one path. `pnpm db:apply`, `pnpm db:rehearse` and
 * `pnpm locks:sweep` call it; `scripts/night/lib-night.sh` and `scripts/lib/borrow-live-switch.sh`
 * call the same four SQL functions from zsh. Nobody writes the take SQL by hand any more, which
 * is why the eviction sentence is built in the database: every caller prints the same sentence.
 *
 * 🚨 ABSENCE IS A NAMED REFUSAL, NEVER A FALLBACK. On a database where the lease migration has
 * not landed, these calls fail with 42883/42703 and the caller is told exactly that, with the
 * file to apply. Falling back to a raw `on conflict do nothing` insert would be the old
 * behaviour wearing the new behaviour's name — a lock that never expires, silently.
 */

export type LockQuery = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** What `campaign_watch.lock_take()` answers. `taken`/`evicted`/`renewed` mean you hold it. */
export type TakeOutcome = "taken" | "evicted" | "renewed" | "held";

export interface TakeResult {
  readonly outcome: TakeOutcome;
  /** true for taken | evicted | renewed — the caller holds the lock and must release it. */
  readonly held: boolean;
  readonly lockName: string;
  readonly heldBy: string | null;
  readonly takenAt: string | null;
  readonly expiresAt: string | null;
  /** Set only on `evicted`: whose dead row was cleared, and how old it was. */
  readonly evictedHolder: string | null;
  readonly evictedAge: string | null;
  /** The database's own sentence. Print THIS — every caller then says the same thing. */
  readonly message: string;
}

export interface LockStatusRow {
  readonly lock_name: string;
  readonly held_by: string;
  readonly taken_at: string;
  readonly heartbeat_at: string;
  readonly expires_at: string;
  readonly note: string | null;
  readonly state: "live" | "expired";
  readonly held_for: string;
  readonly since_heartbeat: string;
  readonly lease_left: string;
}

/** The file that installs the four functions — named in every refusal, never guessed at. */
export const LEASE_MIGRATION = "migrations/campaign/lockhyg_a_lock_row_carries_a_lease.sql";

/**
 * A missing function or column is the ONE failure this module translates, because it is the one
 * an operator can act on: the lease migration has not landed on THIS database.
 */
export class BuildLockLeaseAbsent extends Error {}

function isAbsence(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42883" || code === "42703" || code === "42P01";
}

function rethrow(err: unknown, what: string, where: string): never {
  if (isAbsence(err)) {
    throw new BuildLockLeaseAbsent(
      `campaign_watch.lock_${what}() is not on ${where} — the build-lock LEASE has not been ` +
        `applied there.\n` +
        `  Refusing rather than falling back to a raw insert: a lock with no lease is a lock that\n` +
        `  never expires, which is the defect this path exists to close.\n` +
        `  Apply it:  pnpm db:apply ${LEASE_MIGRATION} --source campaign --target <branch|clone|production> --lane <LANE>`,
    );
  }
  throw err;
}

/**
 * TAKE. Never waits on the database: exactly one caller wins the `on conflict do nothing` insert
 * and everybody else is told who holds it and how much lease is left. An EXPIRED row is evicted
 * on the way past and the result says whose it was.
 */
export async function takeBuildLock(
  query: LockQuery,
  lockName: string,
  heldBy: string,
  note: string | null,
  where: string,
): Promise<TakeResult> {
  let rows: Record<string, unknown>[];
  try {
    rows = await query(
      `select outcome, lock_name, held_by, taken_at::text as taken_at, expires_at::text as expires_at,
              evicted_holder, evicted_age::text as evicted_age, message
         from campaign_watch.lock_take($1, $2, $3)`,
      [lockName, heldBy, note],
    );
  } catch (err) {
    rethrow(err, "take", where);
  }
  const r = rows[0];
  if (!r) {
    throw new Error(
      `campaign_watch.lock_take('${lockName}', '${heldBy}') on ${where} returned no row at all. ` +
        `Nothing is assumed about whether the lock was taken — look before acting: ` +
        `select * from campaign_watch.build_lock_status;`,
    );
  }
  const outcome = String(r.outcome) as TakeOutcome;
  return {
    outcome,
    held: outcome !== "held",
    lockName: String(r.lock_name ?? lockName),
    heldBy: (r.held_by as string) ?? null,
    takenAt: (r.taken_at as string) ?? null,
    expiresAt: (r.expires_at as string) ?? null,
    evictedHolder: (r.evicted_holder as string) ?? null,
    evictedAge: (r.evicted_age as string) ?? null,
    message: String(r.message),
  };
}

/** RENEW. false means this caller is NOT the holder any more — that is news, not noise. */
export async function renewBuildLock(
  query: LockQuery,
  lockName: string,
  heldBy: string,
  where: string,
): Promise<boolean> {
  try {
    const rows = await query(`select campaign_watch.lock_renew($1, $2) as ok`, [lockName, heldBy]);
    return rows[0]?.ok === true;
  } catch (err) {
    rethrow(err, "renew", where);
  }
}

/** RELEASE, holder-scoped. false means no row matched — announce it, never swallow it. */
export async function releaseBuildLock(
  query: LockQuery,
  lockName: string,
  heldBy: string,
  where: string,
): Promise<boolean> {
  try {
    const rows = await query(`select campaign_watch.lock_release($1, $2) as ok`, [lockName, heldBy]);
    return rows[0]?.ok === true;
  } catch (err) {
    rethrow(err, "release", where);
  }
}

/** Every row with its state — what `pnpm locks:sweep` prints. */
export async function listBuildLocks(query: LockQuery, where: string): Promise<LockStatusRow[]> {
  try {
    const rows = await query(
      `select lock_name, held_by, taken_at::text as taken_at, heartbeat_at::text as heartbeat_at,
              expires_at::text as expires_at, note, state,
              held_for::text as held_for, since_heartbeat::text as since_heartbeat,
              lease_left::text as lease_left
         from campaign_watch.build_lock_status
        order by state desc, taken_at`,
    );
    return rows as unknown as LockStatusRow[];
  } catch (err) {
    rethrow(err, "status", where);
  }
}

/**
 * THE HEARTBEAT, for work that outlives one statement.
 *
 * A fifteen-minute lease and a twenty-minute apply is a lane losing its own lock halfway
 * through, so anything that holds a lock across real work renews it while that work is in
 * flight. The interval is a THIRD of the lease: two consecutive renews may be lost (a pooler
 * hiccup, a transient disconnect) and the lease still outlives them.
 *
 * `onLost` fires when a renew returns false — somebody else now holds this row, which the
 * caller must hear about rather than discover in its own failure.
 */
export function startLockHeartbeat(
  query: LockQuery,
  lockName: string,
  heldBy: string,
  where: string,
  onLost: (why: string) => void,
): { stop: () => void } {
  const everyMs = 5 * 60 * 1000; // a third of the 15-minute lease
  const timer = setInterval(() => {
    void renewBuildLock(query, lockName, heldBy, where)
      .then((ok) => {
        if (!ok) {
          onLost(
            `the heartbeat for LOCK:${lockName} on ${where} renewed NOTHING — ${heldBy} is no ` +
              `longer the holder. Somebody evicted or released this row while the work was running.`,
          );
        }
      })
      .catch((err: unknown) => {
        onLost(
          `the heartbeat for LOCK:${lockName} on ${where} could not run: ` +
            `${err instanceof Error ? err.message : String(err)}. The lease keeps running down.`,
        );
      });
  }, everyMs);
  // Never hold the process open for a heartbeat.
  (timer as unknown as { unref?: () => void }).unref?.();
  return { stop: () => clearInterval(timer) };
}

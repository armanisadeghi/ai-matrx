/**
 * THE LOCK-WAIT POLICY every migration runner enforces (lane LOCK-QUEUE, 2026-09-25).
 *
 * WHY. A DDL statement that asks for ACCESS EXCLUSIVE on a hot table (auth.users,
 * iam.permissions, context.*) and has to WAIT for it sits at the head of that table's lock
 * queue. Postgres lock queues are FIFO, so every later plain SELECT on the table queues
 * BEHIND the waiting DDL — sign-in and dozens of PostgREST reads stall for as long as the
 * DDL is willing to wait. Measured 2026-09-25: a file carrying `set lock_timeout = '30s'`
 * queued on auth.users at 06:50 UTC and stalled every reader for 30 s; at 13:26 UTC an
 * `alter table iam.permissions add column` did the same, and a context security migration
 * retried seven times, each retry a fresh 30 s stall.
 *
 * THE RULE (GitLab / Shopify / Stripe style): wait at most LOCK_TIMEOUT_CEILING_MS per attempt
 * for any lock, and let the RUNNER retry a lock timeout a bounded number of times with
 * jittered backoff. A file that raises its own lock_timeout above the ceiling (or to 0 /
 * DEFAULT) or statement_timeout above the runner's ceiling is refused before a byte runs,
 * naming the file and the line.
 *
 * Twin: aidream/db/migration_lock_policy.py — same ceiling, same attempts, same parse.
 */

export const LOCK_TIMEOUT_CEILING_MS = 3_000;
export const LOCK_RETRY_ATTEMPTS = 10;
export const LOCK_RETRY_BASE_SECONDS = 0.5;
export const LOCK_RETRY_CAP_SECONDS = 8;
export const IDLE_IN_TRANSACTION_CEILING = "60s";
export const TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM = 170000;

/** Sleep before the next attempt; `attempt` is the one that just failed (1-based). */
export function backoffSeconds(
  attempt: number,
  rng: () => number = Math.random,
): number {
  const ceiling = Math.min(
    LOCK_RETRY_CAP_SECONDS,
    LOCK_RETRY_BASE_SECONDS * 2 ** (attempt - 1),
  );
  return ceiling * (0.5 + rng() / 2);
}

const UNIT_MS: Record<string, number> = {
  us: 0.001,
  ms: 1,
  s: 1000,
  min: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** A Postgres time GUC value in ms; `null` = DEFAULT. Throws when unreadable. Bare number = ms. */
export function parseDurationMs(raw: string): number | null {
  let v = raw.trim();
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
  v = v.trim().toLowerCase();
  if (v === "default" || v === "") return null;
  const m = /^(\d+(?:\.\d+)?)\s*(us|ms|s|min|h|d)?$/.exec(v);
  if (!m) throw new Error(`unreadable duration ${JSON.stringify(raw)}`);
  return Number(m[1]) * UNIT_MS[m[2] ?? "ms"]!;
}

const DOLLAR_RE = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y;
const DO_INTRO_RE = /\bdo\s*(?:language\s+[a-z_][a-z0-9_]*\s*)?$/i;
const blank = (s: string) => s.replace(/[^\n]/g, " ");

/**
 * Same length and line breaks as `sql`; comments and routine BODIES blanked. A `DO $$…$$`
 * body runs at apply time and is kept (masked recursively) unless keepDoBodies is false.
 * Single-quoted literals are kept unless keepLiterals is false.
 */
export function maskSql(
  sql: string,
  keepDoBodies = true,
  keepLiterals = true,
): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i]!;
    if (sql.startsWith("--", i)) {
      let j = sql.indexOf("\n", i);
      if (j < 0) j = n;
      out += blank(sql.slice(i, j));
      i = j;
    } else if (sql.startsWith("/*", i)) {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth) {
        if (sql.startsWith("/*", j)) ((depth += 1), (j += 2));
        else if (sql.startsWith("*/", j)) ((depth -= 1), (j += 2));
        else j += 1;
      }
      out += blank(sql.slice(i, j));
      i = j;
    } else if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      const piece = sql.slice(i, j + 1);
      out += keepLiterals ? piece : blank(piece);
      i = j + 1;
    } else if (c === '"') {
      let j = sql.indexOf('"', i + 1);
      if (j < 0) j = n - 1;
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === "$" && !(i > 0 && /[A-Za-z0-9_]/.test(sql[i - 1]!))) {
      DOLLAR_RE.lastIndex = i;
      const m = DOLLAR_RE.exec(sql);
      if (!m) {
        out += c;
        i += 1;
        continue;
      }
      const tag = m[0];
      const bodyStart = i + tag.length;
      let end = sql.indexOf(tag, bodyStart);
      if (end < 0) end = n;
      const body = sql.slice(bodyStart, end);
      const isDo = DO_INTRO_RE.test(out.slice(-64));
      out +=
        tag +
        (isDo && keepDoBodies
          ? maskSql(body, true, keepLiterals)
          : blank(body));
      if (end < n) out += tag;
      i = end + tag.length;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

const SET_HEAD_RE =
  /\bset\s+(?:(?:local|session)\s+)?(lock_timeout|statement_timeout)\s*(?:=|\bto\b)/gi;
const VALUE_RE = /\s*('(?:[^']|'')*'|[^\s;]+)/y;
const RESET_RE = /\breset\s+(lock_timeout)\b/gi;
const SET_CONFIG_HEAD_RE = /\bset_config\s*\(/gi;
const SET_CONFIG_RE =
  /set_config\s*\(\s*'(lock_timeout|statement_timeout)'\s*,\s*('(?:[^']|'')*')/iy;
/** A SET clause of these statements configures something ELSE — a role, a database, a routine. */
const NOT_THIS_SESSION_RE =
  /^\s*(?:alter\s+(?:role|user|database|function|procedure|routine)\b|create\s+(?:or\s+replace\s+)?(?:function|procedure)\b)/i;

export interface TimeoutOverride {
  line: number;
  text: string;
  why: string;
}

export function overrideSentence(filename: string, f: TimeoutOverride): string {
  return `${filename}:${f.line}: \`${f.text}\` — ${f.why}`;
}

/** Every place `sql` raises its own lock wait or statement ceiling past the runner's. */
export function timeoutOverrideFindings(
  sql: string,
  statementCeilingMs: number,
): TimeoutOverride[] {
  const masked = maskSql(sql);
  const shape = maskSql(sql, true, false);
  const hits: Array<{
    pos: number;
    guc: string;
    raw: string | null;
    text: string;
  }> = [];
  for (const m of shape.matchAll(SET_HEAD_RE)) {
    const end = m.index! + m[0].length;
    VALUE_RE.lastIndex = end;
    const v = VALUE_RE.exec(masked);
    const raw = v ? v[1]! : "";
    hits.push({
      pos: m.index!,
      guc: m[1]!.toLowerCase(),
      raw,
      text: `${masked.slice(m.index!, end)} ${raw}`,
    });
  }
  for (const m of shape.matchAll(RESET_RE))
    hits.push({
      pos: m.index!,
      guc: m[1]!.toLowerCase(),
      raw: null,
      text: m[0],
    });
  for (const m of shape.matchAll(SET_CONFIG_HEAD_RE)) {
    SET_CONFIG_RE.lastIndex = m.index!;
    const v = SET_CONFIG_RE.exec(masked);
    if (v)
      hits.push({
        pos: m.index!,
        guc: v[1]!.toLowerCase(),
        raw: v[2]!,
        text: `${v[0]}, …)`,
      });
  }
  hits.sort((a, b) => a.pos - b.pos);
  const found: TimeoutOverride[] = [];
  for (const h of hits) {
    const head = shape.slice(shape.lastIndexOf(";", h.pos - 1) + 1, h.pos);
    if (NOT_THIS_SESSION_RE.test(head)) continue;
    const line = masked.slice(0, h.pos).split("\n").length;
    const text = h.text.split(/\s+/).filter(Boolean).join(" ");
    let ms: number | null;
    try {
      ms = h.raw === null ? null : parseDurationMs(h.raw);
    } catch {
      found.push({
        line,
        text,
        why: `${h.guc} value the runner cannot read — write it in ms or s`,
      });
      continue;
    }
    if (h.guc === "lock_timeout") {
      if (ms === null)
        found.push({
          line,
          text,
          why:
            "resets lock_timeout to the role default, which this runner does not bound; delete it — " +
            `the runner already sets ${LOCK_TIMEOUT_CEILING_MS / 1000}s or less and retries`,
        });
      else if (ms === 0)
        found.push({
          line,
          text,
          why: "lock_timeout = 0 means WAIT FOREVER — every reader of the table queues behind it",
        });
      else if (ms > LOCK_TIMEOUT_CEILING_MS)
        found.push({
          line,
          text,
          why:
            `lock_timeout above the ${LOCK_TIMEOUT_CEILING_MS}ms ceiling: while this waits for a lock every ` +
            "later reader of that table waits behind it (FIFO lock queue). Delete the line — the runner " +
            "waits at most 2s per attempt and retries with backoff",
        });
    } else if (ms !== null && (ms === 0 || ms > statementCeilingMs)) {
      found.push({
        line,
        text,
        why:
          `statement_timeout ${ms === 0 ? "0 (unbounded)" : `${ms}ms`} is above the runner's ` +
          `${statementCeilingMs}ms ceiling; a longer job belongs in a batched tool`,
      });
    }
  }
  return found;
}

/** Postgres `lock_not_available` — what a lock wait that hit lock_timeout raises. */
export function isLockTimeout(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "55P03"
  );
}

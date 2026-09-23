/**
 * WHO APPLIED THIS ROW — the attribution every ledger write carries (lane LEDGER-LANE, 2026-09-23).
 *
 * THE INCIDENT. At 11:51Z and 11:52Z on 2026-09-23 two production migrations
 * (`hubfix_each_table_says_who_can_see_it_and_whose_it_is.sql` and its grant, the grant with
 * `--confirm-chair-step`) landed outside the 1–4 AM Pacific window, and nobody could say who ran
 * them. `public._schema_migrations` held source, filename, checksum, applied_at, duration_ms,
 * chair_step and rebase_receipts — and not the `--lane` the runner had just demanded, nor anything
 * about the machine or the session. A row that cannot be attributed is a row the chair cannot ask
 * about.
 *
 * WHAT A ROW NOW CARRIES (additive columns, `migrations/campaign/ledgerlane_a_ledger_row_names_who_applied_it.sql`):
 *   applied_by_lane       the `--lane` flag, else `MATRX_LANE`, else null
 *   applied_by_os_user    `USER` / `LOGNAME` / os.userInfo()
 *   applied_by_host       os.hostname()
 *   applied_by_session    the agent session id when the environment carries one
 *                         (`claude:<CLAUDE_CODE_SESSION_ID>`, `codex:<CODEX_THREAD_ID>`, …)
 *   applied_by_process    the ancestor process chain (command lines, REDACTED, truncated)
 *   applied_from_git_head the HEAD of the checkout the FILE sits in, and whether the file was
 *                         committed, modified or untracked there (DRIFT-9 found three files run
 *                         from a working tree and edited before anyone committed them)
 *   applied_in_window     computed IN THE DATABASE at apply time, America/Los_Angeles, 01:00–04:00
 *
 * A REBASE executes nothing, so it does not overwrite the apply's attribution: its own attribution
 * goes into the receipt it appends to `rebase_receipts`.
 *
 * The aidream runner's twin is `aidream/db/ledger_attribution.py` — same columns, same session
 * keys, same redaction, same window rule.
 */
import { execFileSync } from "node:child_process";
import { hostname, userInfo } from "node:os";
import { basename, dirname } from "node:path";
import process from "node:process";

/** The columns, in order, with their exact types. The migration and the shape exemption read this. */
export const ATTRIBUTION_COLUMNS: ReadonlyArray<readonly [string, "text" | "boolean"]> = [
  ["applied_by_lane", "text"],
  ["applied_by_os_user", "text"],
  ["applied_by_host", "text"],
  ["applied_by_session", "text"],
  ["applied_by_process", "text"],
  ["applied_from_git_head", "text"],
  ["applied_in_window", "boolean"],
] as const;

/** The file that adds them — named in every "not recorded" sentence so the remedy is one command away. */
export const ATTRIBUTION_MIGRATION = "migrations/campaign/ledgerlane_a_ledger_row_names_who_applied_it.sql";

/** Environment keys that name an agent session, in the order they are tried. Values are ids, never tokens. */
export const SESSION_ENV_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["CLAUDE_CODE_SESSION_ID", "claude"],
  ["CLAUDE_SESSION_ID", "claude"],
  ["CODEX_THREAD_ID", "codex"],
  ["CODEX_SESSION_ID", "codex"],
  ["CURSOR_SESSION_ID", "cursor"],
] as const;

export interface Attribution {
  readonly lane: string | null;
  readonly osUser: string;
  readonly host: string;
  readonly session: string | null;
  readonly process: string | null;
  readonly gitHead: string | null;
}

/**
 * The window predicate, evaluated by the DATABASE in the apply's own transaction — same bounds as
 * `isInsideWindow` in migration-target.ts (01:00 through 04:00 Pacific inclusive).
 */
export const IN_WINDOW_SQL =
  `(to_char(now() at time zone 'America/Los_Angeles', 'HH24MI')::int between 100 and 400)`;

/** Credentials never reach the ledger: a DSN password, a password=/token= pair, a --password value. */
export function redact(s: string): string {
  return s
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^:/@\s]*:)[^@\s]*@/gi, "$1***@")
    .replace(/\b((?:PG)?PASSWORD|PASSWD|PWD|SECRET|TOKEN|API_KEY|APIKEY|KEY)(=|:)\S+/gi, "$1$2***")
    .replace(/(--(?:password|token|secret|api-key)(?:=|\s+))\S+/gi, "$1***")
    .replace(/\b(sk|pk|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{12,}/g, "$1-***")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, "***jwt***");
}

function sessionFromEnv(env: NodeJS.ProcessEnv): string | null {
  const parts: string[] = [];
  for (const [key, kind] of SESSION_ENV_KEYS) {
    const v = env[key]?.trim();
    if (v && /^[A-Za-z0-9._:-]{4,128}$/.test(v) && !parts.some((p) => p.endsWith(v))) parts.push(`${kind}:${v}`);
  }
  const host = env.CLAUDE_CODE_HOST_SESSION_ID?.trim();
  if (host && /^[A-Za-z0-9._:-]{4,128}$/.test(host)) parts.push(`host:${host}`);
  return parts.length ? parts.join(" ") : null;
}

/** The ancestor chain above this process: `pid command` for up to six levels, each redacted and cut. */
function processChain(): string | null {
  const out: string[] = [];
  let pid = process.ppid;
  for (let depth = 0; depth < 6 && pid > 1; depth += 1) {
    let line: string;
    try {
      line = execFileSync("ps", ["-o", "ppid=,command=", "-p", String(pid)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2000,
      }).trim();
    } catch {
      break;
    }
    const m = line.match(/^(\d+)\s+(.*)$/s);
    if (!m) break;
    out.push(`${pid} ${redact(m[2]!).replace(/\s+/g, " ").slice(0, 160)}`);
    pid = Number(m[1]);
  }
  return out.length ? out.join(" <- ") : null;
}

/** HEAD of the checkout the file sits in, and the file's own state there. */
export function gitHeadOf(filePath: string): string | null {
  const dir = dirname(filePath);
  const git = (args: string[]) =>
    execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  let head: string;
  try {
    head = git(["rev-parse", "HEAD"]);
  } catch {
    return "not a git checkout";
  }
  let state = "committed";
  try {
    const porcelain = git(["status", "--porcelain", "--", basename(filePath)]);
    if (porcelain.startsWith("??")) state = "untracked";
    else if (porcelain) state = "modified since HEAD";
  } catch {
    state = "state unreadable";
  }
  return `${head} (file ${state})`;
}

export function collectAttribution(filePath: string, lane: string | null, env: NodeJS.ProcessEnv = process.env): Attribution {
  let osUser = env.USER || env.LOGNAME || "";
  if (!osUser) {
    try {
      osUser = userInfo().username;
    } catch {
      osUser = "unknown";
    }
  }
  return {
    lane: lane ?? (env.MATRX_LANE?.trim() || null),
    osUser,
    host: hostname(),
    session: sessionFromEnv(env),
    process: processChain(),
    gitHead: gitHeadOf(filePath),
  };
}

type Q = (text: string) => Promise<{ rows: Array<Record<string, unknown>> }>;

/** Which attribution columns this ledger carries. All seven or none is the only shape written. */
export async function attributionColumnsPresent(q: Q): Promise<{ present: boolean; missing: string[] }> {
  const r = await q(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = '_schema_migrations'`,
  );
  const have = new Set(r.rows.map((x) => String(x.column_name)));
  const missing = ATTRIBUTION_COLUMNS.map(([c]) => c).filter((c) => !have.has(c));
  return { present: missing.length === 0, missing };
}

/** The column list, VALUES expressions and ON CONFLICT sets for the ledger upsert. */
export function attributionUpsertParts(a: Attribution, lit: (s: string) => string): {
  cols: string[];
  values: string[];
  sets: string[];
} {
  const v = (s: string | null) => (s === null ? "null" : lit(s));
  const values = [v(a.lane), v(a.osUser), v(a.host), v(a.session), v(a.process), v(a.gitHead), IN_WINDOW_SQL];
  const cols = ATTRIBUTION_COLUMNS.map(([c]) => c);
  return { cols, values, sets: cols.map((c) => `${c} = excluded.${c}`) };
}

/** The receipt form (a rebase appends it; nothing executed, so the apply's columns stay). */
export function attributionJson(a: Attribution, inWindow: boolean): Record<string, unknown> {
  return {
    lane: a.lane,
    os_user: a.osUser,
    host: a.host,
    session: a.session,
    process: a.process,
    git_head: a.gitHead,
    in_window: inWindow,
  };
}

/** One sentence: printed when the ledger cannot hold attribution yet. Never a refusal. */
export function notRecordedSentence(target: string, missing: readonly string[]): string {
  return (
    `attribution NOT recorded — the ${target} ledger has no ${missing.join(", ")} column(s) yet; ` +
    `${ATTRIBUTION_MIGRATION} adds them (the chair applies it to production in the 1–4 AM Pacific window).`
  );
}

/** One sentence: a production apply outside the window. Allowed — the point is that it is named. */
export function outsideWindowSentence(filename: string, a: Attribution, at: Date = new Date()): string {
  const pt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return (
    `${filename} was applied to production at ${pt} Pacific, outside the 1–4 AM window, by lane ` +
    `${a.lane ?? "(no lane named)"} (${a.osUser}@${a.host}${a.session ? `, ${a.session}` : ""}); ` +
    `this is allowed and the ledger row now says who did it.`
  );
}

/**
 * THE RUNNER'S OWN LEDGER SHAPE — the one door through the self-ledger refusal.
 *
 * A file that writes `public._schema_migrations` is refused, because the runner owns every row and
 * every checksum. Adding a column is not writing a row, but the refusal cannot tell the two apart by
 * verb, so it is narrowed here by a CLOSED LIST: exactly
 *     alter table public._schema_migrations add column if not exists <attribution column> <its type>
 *     alter table public._schema_migrations drop column if exists <attribution column>
 * one column per statement, for the seven columns above and nothing else. Every other ledger
 * statement — another column, another type, an INSERT, an UPDATE, a DROP TABLE — is still refused.
 * Input is the statement-detection text (comments, literals and dollar bodies already stripped).
 * Mirror: `strip_ledger_shape_statements` in `aidream/db/ledger_attribution.py`.
 */
export function stripLedgerShapeStatements(stripped: string): string {
  const types = new Map(ATTRIBUTION_COLUMNS.map(([c, t]) => [c, t] as const));
  const re =
    /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\s*\.\s*)?_schema_migrations\s+(?:add\s+column\s+if\s+not\s+exists\s+([a-z_][a-z0-9_]*)\s+(text|boolean)|drop\s+column\s+if\s+exists\s+([a-z_][a-z0-9_]*))\s*(?=;|$)/gi;
  return stripped.replace(re, (whole, addCol?: string, addType?: string, dropCol?: string) => {
    if (addCol) return types.get(addCol.toLowerCase()) === addType!.toLowerCase() ? " " : whole;
    return dropCol && types.has(dropCol.toLowerCase()) ? " " : whole;
  });
}

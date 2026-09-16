/**
 * `--target branch|production` — WHICH database a migration is allowed to land on.
 *
 * WHY THIS EXISTS
 * ---------------
 * The unified-data campaign rehearses every DDL file on a Supabase preview branch
 * and then applies the SAME file to production. Both databases are named
 * `postgres`, both connect as role `postgres`, and both sit behind the same
 * Supavisor host — so until this module existed, NOTHING in either runner could
 * tell them apart, and a file meant for the rehearsal branch landed on production
 * on the strength of whichever five `SUPABASE_MATRIX_*` values the shell happened
 * to hold. The environment SELECTS a connection; it has never AUTHORISED one.
 *
 * WHAT IT REFUSES, AND WHERE
 * --------------------------
 * The refusal happens in two places, in this order, and both are provable:
 *
 *   1. BEFORE ANY CONNECTION — the configured host/user/database is compared to
 *      `common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF`. This half is
 *      demonstrable with NO production credential in the process at all.
 *   2. ON THE OPEN CONNECTION — `pg_control_system().system_identifier`, the
 *      cluster's own control-file identity, is compared to the identifier
 *      `BRANCH-REF` records for that target. This is read from the SERVER, never
 *      from the argument the caller passed, so removing the flag does not remove
 *      the check and passing `--target branch` at production is refused by the
 *      production server's own answer.
 *
 * A missing or unreadable `BRANCH-REF` is a REFUSAL, never a fallback to whatever
 * `SUPABASE_MATRIX_*` happens to hold.
 *
 * THE HEADER RULE — and why it does not break every other campaign
 * ---------------------------------------------------------------
 * A migration may head itself `-- target: branch`, `-- target: production` or
 * `-- target: branch,production`.
 *   · `--target branch` REQUIRES the header and requires it to name `branch`. A
 *     file with no header can never be applied to the rehearsal branch.
 *   · `--target production` is the default and is refused only when the file DOES
 *     carry a header that does not name `production`. A file with no header is
 *     production-only — which is every migration in this repo that predates this
 *     module, unchanged.
 *   · `-- target: branch,production` — one file for both — is accepted only when
 *     it also carries `-- additive: yes` and `-- guard: <feature>/<key>` naming a
 *     real `platform.feature_knob` key (the table's primary key is TWO columns,
 *     `(feature, key)`, so a single token cannot address it), and only when the
 *     body parses as additive: no DROP, no REVOKE, no `ALTER TYPE … ADD VALUE`,
 *     no `ALTER TABLE … DROP COLUMN`, no `ALTER COLUMN … TYPE`.
 *
 * Shared with `aidream/db/migration_target.py`, which implements the identical
 * rules for the Python runner. The two are kept in step by `BRANCH-REF` being the
 * single source of both identities.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Target = "branch" | "production";

export const TARGETS: readonly Target[] = ["branch", "production"] as const;

/** Where `BRANCH-REF` lives, relative to the matrx-frontend checkout root. */
export const BRANCH_REF_PATH =
  "../common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF";

export interface BranchRef {
  readonly branchRef: string;
  readonly parentRef: string;
  readonly poolerHost: string;
  readonly poolerPort: number;
  readonly poolerUser: string;
  readonly database: string;
  readonly passwordEnvVar: string;
  readonly systemIdentifier: string;
  readonly parentSystemIdentifier: string;
  readonly path: string;
}

export class TargetRefusal extends Error {}

function fail(lines: string[]): never {
  throw new TargetRefusal(lines.join("\n"));
}

/**
 * Read `BRANCH-REF`. Absent, unreadable or short of a required key is a refusal
 * with the remedy — never a fallback.
 */
export function loadBranchRef(root: string, overridePath?: string): BranchRef {
  const path = overridePath ?? resolve(root, BRANCH_REF_PATH);
  if (!existsSync(path)) {
    fail([
      `BRANCH-REF not found at ${path}.`,
      `  --target reads the rehearsal branch's identity from that checked-in file and`,
      `  refuses rather than falling back to whatever SUPABASE_MATRIX_* holds.`,
      `  Remedy: check out common-docs beside this repo, or pass --branch-ref=<path>.`,
    ]);
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    fail([`BRANCH-REF at ${path} is unreadable: ${String(e)}`]);
  }
  const bag: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/);
    if (m) bag[m[1]!] = m[2]!;
  }
  const need = [
    "branch_ref",
    "parent_ref",
    "pooler_host",
    "pooler_port",
    "pooler_user",
    "database",
    "password_env_var",
    "system_identifier",
    "parent_system_identifier",
  ];
  const missing = need.filter((k) => !bag[k]);
  if (missing.length) {
    fail([
      `BRANCH-REF at ${path} is missing: ${missing.join(", ")}.`,
      `  Every one of them is an identity, not a secret, and --target cannot decide`,
      `  anything without them. Refusing rather than guessing.`,
    ]);
  }
  return {
    branchRef: bag.branch_ref!,
    parentRef: bag.parent_ref!,
    poolerHost: bag.pooler_host!,
    poolerPort: Number(bag.pooler_port!),
    poolerUser: bag.pooler_user!,
    database: bag.database!,
    passwordEnvVar: bag.password_env_var!,
    systemIdentifier: bag.system_identifier!,
    parentSystemIdentifier: bag.parent_system_identifier!,
    path,
  };
}

/**
 * `--target <t>`. Default `production`, so every migration written before this
 * module behaves exactly as it did. An unknown value is refused, never coerced.
 */
export function parseTargetFlag(argv: readonly string[]): Target {
  const arg = argv.find((a) => a === "--target" || a.startsWith("--target="));
  if (!arg) return "production";
  const value =
    arg === "--target" ? (argv[argv.indexOf(arg) + 1] ?? "") : arg.slice("--target=".length);
  if (!TARGETS.includes(value as Target)) {
    fail([
      `--target ${value || "(nothing)"} is not a target.`,
      `  Valid: --target branch | --target production. Refusing rather than picking one.`,
    ]);
  }
  return value as Target;
}

const HEADER_TARGET_RE = /^\s*--\s*target\s*:\s*(.+?)\s*$/i;
const HEADER_ADDITIVE_RE = /^\s*--\s*additive\s*:\s*yes\s*$/i;
const HEADER_GUARD_RE = /^\s*--\s*guard\s*:\s*([a-z0-9_]+)\s*\/\s*([a-z0-9_.]+)\s*$/i;

export interface MigrationHeader {
  /** null when the file carries no `-- target:` line at all. */
  readonly targets: Target[] | null;
  readonly additive: boolean;
  readonly guard: { feature: string; key: string } | null;
}

/** Read the `-- target:` / `-- additive:` / `-- guard:` lines out of a file's head. */
export function readHeader(sql: string): MigrationHeader {
  let targets: Target[] | null = null;
  let additive = false;
  let guard: { feature: string; key: string } | null = null;
  for (const line of sql.split("\n", 40)) {
    const t = line.match(HEADER_TARGET_RE);
    if (t) {
      const parts = t[1]!
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const bad = parts.filter((p) => !TARGETS.includes(p as Target));
      if (bad.length) {
        fail([
          `\`-- target: ${t[1]}\` names something that is not a target: ${bad.join(", ")}.`,
          `  Valid headers: \`-- target: branch\`, \`-- target: production\`,`,
          `  \`-- target: branch,production\`.`,
        ]);
      }
      targets = parts as Target[];
    }
    if (HEADER_ADDITIVE_RE.test(line)) additive = true;
    const g = line.match(HEADER_GUARD_RE);
    if (g) guard = { feature: g[1]!, key: g[2]! };
    if (/^\s*--\s*guard\s*:/.test(line) && !g) {
      fail([
        `\`${line.trim()}\` is not a guard key.`,
        `  platform.feature_knob's primary key is TWO columns, (feature, key), so the guard`,
        `  is written \`-- guard: <feature>/<key>\` — e.g. \`-- guard: custom/associations_guard\`.`,
      ]);
    }
  }
  return { targets, additive, guard };
}

/** The body checks `-- target: branch,production` must pass to be applied to both. */
const NON_ADDITIVE_RES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bDROP\s+(TABLE|COLUMN|SCHEMA|TYPE|CONSTRAINT|POLICY|TRIGGER|INDEX|FUNCTION|VIEW)\b/i, "a DROP"],
  [/\bREVOKE\b/i, "a REVOKE"],
  [/\bALTER\s+TYPE\s+\S+\s+ADD\s+VALUE\b/i, "ALTER TYPE … ADD VALUE"],
  [/\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i, "ALTER COLUMN … TYPE"],
  [/\bALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL\b/i, "SET NOT NULL on an existing column"],
  [/\bTRUNCATE\b/i, "a TRUNCATE"],
  [/\bDELETE\s+FROM\b/i, "a DELETE"],
];

export function nonAdditiveReasons(strippedSql: string): string[] {
  return NON_ADDITIVE_RES.filter(([re]) => re.test(strippedSql)).map(([, what]) => what);
}

export interface AgreementInput {
  readonly filename: string;
  readonly flagTarget: Target;
  readonly header: MigrationHeader;
  /** SQL with comments and string literals already stripped, for body detection. */
  readonly strippedSql: string;
}

/**
 * Header vs flag, before anything opens a connection.
 *
 * Returns the guard key a `branch,production` file names, so the caller can prove
 * it resolves OFF on the server before the production half runs.
 */
export function assertHeaderAgreesWithFlag(
  input: AgreementInput,
): { guard: { feature: string; key: string } | null } {
  const { filename, flagTarget, header, strippedSql } = input;
  const named = header.targets;

  if (flagTarget === "branch") {
    if (named === null) {
      fail([
        `${filename} carries no \`-- target:\` header, so it cannot be applied to the rehearsal branch.`,
        `  A file with no header is production-only — that is every migration written before`,
        `  --target existed, and their behaviour is unchanged.`,
        `  Remedy: add \`-- target: branch\` (or \`-- target: branch,production\`) as the file's`,
        `  first line if this file really is part of the rehearsal.`,
      ]);
    }
    if (!named.includes("branch")) {
      fail([
        `${filename} is headed \`-- target: ${named.join(",")}\` but you passed --target branch.`,
        `  file header: ${named.join(",")}`,
        `  command flag: branch`,
        `  Refusing. Change one of them deliberately; the runner will not choose.`,
      ]);
    }
  } else if (named !== null && !named.includes("production")) {
    fail([
      `${filename} is headed \`-- target: ${named.join(",")}\` and must not land on production.`,
      `  file header: ${named.join(",")}`,
      `  command flag: production`,
      `  Refusing. Rehearse it with --target branch; a branch-only file reaches production`,
      `  only after its header is changed on purpose and it is re-reviewed.`,
    ]);
  }

  const both = named !== null && named.includes("branch") && named.includes("production");
  if (both) {
    if (!header.additive) {
      fail([
        `${filename} is headed \`-- target: branch,production\` without \`-- additive: yes\`.`,
        `  One file for both databases is accepted only when it states that it is additive and`,
        `  names the knob that holds it OFF. Add both header lines, or split the file.`,
      ]);
    }
    if (!header.guard) {
      fail([
        `${filename} is headed \`-- target: branch,production\` without a \`-- guard:\` line.`,
        `  Every shared object this campaign changes on production lands behind a`,
        `  platform.feature_knob row that is OFF, so the old path is untouched until the switch.`,
        `  Add \`-- guard: <feature>/<key>\` naming a seeded knob.`,
      ]);
    }
    const reasons = nonAdditiveReasons(strippedSql);
    if (reasons.length) {
      fail([
        `${filename} is headed \`-- target: branch,production\` but its body contains ${reasons.join(", ")}.`,
        `  A two-target file must be additive and reversible by construction. Split the`,
        `  non-additive half into its own \`-- target: branch\` file, or make it a chair step`,
        `  with its own inverse migration.`,
      ]);
    }
  }
  return { guard: header.guard };
}

export interface ConfiguredConnection {
  readonly user: string;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  /** Where the values came from, for the refusal message. */
  readonly from: string;
}

/**
 * THE PRE-CONNECTION REFUSAL. No socket is opened by this function, and it needs
 * no production credential to demonstrate: it compares the configured identity to
 * `BRANCH-REF`'s.
 */
export function assertConfiguredHostMatchesTarget(
  conn: ConfiguredConnection,
  target: Target,
  ref: BranchRef,
): void {
  const looksLikeBranch =
    conn.user === ref.poolerUser ||
    conn.host.includes(ref.branchRef) ||
    conn.user.endsWith(`.${ref.branchRef}`);
  if (target === "branch" && !looksLikeBranch) {
    fail([
      `--target branch, but the configured connection is not the rehearsal branch.`,
      `  configured: ${conn.user}@${conn.host}:${conn.port}/${conn.database} (from ${conn.from})`,
      `  BRANCH-REF: ${ref.poolerUser}@${ref.poolerHost}:${ref.poolerPort}/${ref.database} (${ref.path})`,
      `  Nothing was opened. Set ${ref.passwordEnvVar} to the branch DSN; --target branch reads`,
      `  that variable and nothing else.`,
    ]);
  }
  if (target === "production" && looksLikeBranch) {
    fail([
      `--target production, but the configured connection IS the rehearsal branch ${ref.branchRef}.`,
      `  configured: ${conn.user}@${conn.host}:${conn.port}/${conn.database} (from ${conn.from})`,
      `  Nothing was opened. Refusing rather than ledgering a production row against a branch.`,
    ]);
  }
}

/**
 * THE POST-CONNECTION REFUSAL. Read from the SERVER — `pg_control_system()` —
 * never from the argument the caller passed, so a wrong `--target` is caught by
 * the database's own answer. Both databases are named `postgres` and both connect
 * as `postgres`; the control-file identifier is the one thing that differs and
 * does not move.
 */
export async function assertServerMatchesTarget(
  query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>,
  target: Target,
  ref: BranchRef,
  filename: string,
): Promise<string> {
  const res = await query(
    "select system_identifier::text as sysid from pg_control_system()",
  );
  const sysid = String(res.rows[0]?.sysid ?? "");
  if (!sysid) {
    fail([
      `The connected server did not answer pg_control_system().`,
      `  --target cannot be honoured without the server's own identity, and there is no`,
      `  weaker check to fall back to. Nothing was applied.`,
    ]);
  }
  const expected = target === "branch" ? ref.systemIdentifier : ref.parentSystemIdentifier;
  if (sysid !== expected) {
    const named =
      sysid === ref.systemIdentifier
        ? `the rehearsal branch ${ref.branchRef}`
        : sysid === ref.parentSystemIdentifier
          ? `production ${ref.parentRef}`
          : `an UNKNOWN cluster (system_identifier ${sysid})`;
    fail([
      `${filename}: the connected server is ${named}, not the --target you passed.`,
      `  command flag:      ${target}`,
      `  expected sysid:    ${expected}   (${ref.path})`,
      `  connected sysid:   ${sysid}`,
      `  Read from the server, not from the flag. Rolled back, nothing applied, no ledger row.`,
    ]);
  }
  return sysid;
}

/**
 * A `-- target: branch,production` file may only land on PRODUCTION when its named
 * knob exists there and resolves OFF. The knob's platform value is
 * `coalesce(value, default_value)` — `platform.knob_resolve(f, k, null)` — because
 * `platform.knob_scope_kind` has no `system` rung and never did.
 */
export async function assertGuardResolvesOff(
  query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>,
  guard: { feature: string; key: string },
  filename: string,
): Promise<void> {
  let res;
  try {
    res = await query(
      `select platform.knob_resolve(${JSON.stringify(guard.feature).replace(/"/g, "'")}, ` +
        `${JSON.stringify(guard.key).replace(/"/g, "'")}, null)::text as v`,
    );
  } catch (e) {
    const code = (e as { code?: string }).code;
    const message = e instanceof Error ? e.message : String(e);
    if (code === "P0001" || /is not seeded/.test(message)) {
      fail([
        `${filename}: its guard ${guard.feature}/${guard.key} has NO row in platform.feature_knob,`,
        `  so platform.knob_resolve raises P0001 the moment anything reads it — including the`,
        `  policy, trigger or function this file is about to land.`,
        `  Verbatim: ${message}`,
        `  Remedy: seed the knob register for this campaign on BOTH databases first`,
        `  (one row per guarded object, value false), then re-run. A guarded file is never`,
        `  applied to production ahead of its knob.`,
      ]);
    }
    fail([
      `${filename}: could not resolve its guard ${guard.feature}/${guard.key}: ${message}`,
      `  Refusing rather than applying a guarded file whose guard nobody could read.`,
    ]);
  }
  const v = String(res.rows[0]?.v ?? "");
  if (v !== "false") {
    fail([
      `${filename}: its guard ${guard.feature}/${guard.key} resolves ${v || "(nothing)"}, not false.`,
      `  A guarded file lands on production only while its knob is OFF, so the old path is`,
      `  untouched until the switch. Seed or set the knob to false and re-run.`,
    ]);
  }
}

/**
 * The branch connection, built from the ONE variable `BRANCH-REF` names —
 * `SUPABASE_BRANCH_DATABASE_URL`, a whole DSN — and verified against `BRANCH-REF`'s
 * host/user/database before it is handed back. The five `SUPABASE_MATRIX_*`
 * variables are never consulted for `--target branch`: they select production's
 * connection and this runner must never reach the branch through them by accident.
 */
export interface BranchDbEnv {
  readonly user: string;
  readonly password: string;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly from: string;
}

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]!] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
  }
  return out;
}

export function loadBranchDbEnv(root: string, ref: BranchRef): BranchDbEnv {
  const candidates: Array<[string, string | undefined]> = [
    ["the environment", process.env[ref.passwordEnvVar]],
    [".env.local", readEnvFile(resolve(root, ".env.local"))[ref.passwordEnvVar]],
    [".env", readEnvFile(resolve(root, ".env"))[ref.passwordEnvVar]],
    [
      "../aidream/.env",
      readEnvFile(resolve(process.env.AIDREAM_DIR ?? resolve(root, "..", "aidream"), ".env"))[
        ref.passwordEnvVar
      ],
    ],
  ];
  const hit = candidates.find(([, v]) => v);
  if (!hit) {
    fail([
      `--target branch needs ${ref.passwordEnvVar} and it is not set.`,
      `  Looked in: ${candidates.map(([w]) => w).join(", ")}.`,
      `  It holds the WHOLE branch DSN. Re-mint it with the recipe inside ${ref.path};`,
      `  there is no fallback to SUPABASE_MATRIX_*, which points at production.`,
    ]);
  }
  const [from, dsn] = hit;
  let u: URL;
  try {
    u = new URL(dsn!);
  } catch {
    fail([
      `${ref.passwordEnvVar} (from ${from}) is not a DSN.`,
      `  Expected postgresql://<user>:<password>@<host>:<port>/<database>.`,
    ]);
  }
  const env: BranchDbEnv = {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: Number(u.port || 5432),
    database: u.pathname.replace(/^\//, "") || ref.database,
    from: `${ref.passwordEnvVar} (${from})`,
  };
  if (env.user !== ref.poolerUser || env.host !== ref.poolerHost) {
    fail([
      `${ref.passwordEnvVar} does not point at the branch ${ref.branchRef}.`,
      `  DSN says:    ${env.user}@${env.host}:${env.port}/${env.database}`,
      `  BRANCH-REF:  ${ref.poolerUser}@${ref.poolerHost}:${ref.poolerPort}/${ref.database}`,
      `  Refusing rather than applying a rehearsal to whatever that DSN really is.`,
    ]);
  }
  return env;
}

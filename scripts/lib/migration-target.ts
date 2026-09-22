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
 *     carry a header that does not name `production`.
 *
 * 🚨 THE ADDITIVE/GUARD RULE KEYS ON THE HEADER NAMING `production`, NOT ON IT
 *    NAMING BOTH (ATTACK-4 finding 3, fixed 2026-09-15)
 * ---------------------------------------------------------------------------
 * Until this was fixed, `-- additive: yes`, `-- guard:` and the non-additive body
 * scan ran only when the header named BOTH targets. So a file headed exactly
 * `-- target: production` carrying `DROP TABLE platform.associations` and no
 * guard at all passed every header check and landed on production on the strength
 * of the server-identity check alone. The requirement now fires whenever the
 * header NAMES `production` — `-- target: production` and
 * `-- target: branch,production` alike.
 *
 * ⚠️ AND IT KEYS ON *AN EXPLICIT HEADER*, DELIBERATELY. A file with NO
 *    `-- target:` line at all is production-only BY DEFINITION and its behaviour
 *    has NOT moved one inch: no additive requirement, no guard requirement, no
 *    body scan. That is every one of the ~3,567 migrations already in this repo
 *    and in aidream, and making them retroactively refusable would break the
 *    world for no safety gain — they already landed. This absence is a decision,
 *    not an oversight; the refusal messages below say so out loud so nobody
 *    "fixes" it later by accident.
 *
 *     A file that names production must carry `-- additive: yes` and
 *     `-- guard: <feature>/<key>` naming a real `platform.feature_knob` key (the
 *     table's primary key is TWO columns, `(feature, key)`, so a single token
 *     cannot address it), and its body must parse as additive: no DROP, no
 *     REVOKE, no `ALTER TYPE … ADD VALUE`, no `ALTER TABLE … DROP COLUMN`, no
 *     `ALTER COLUMN … TYPE`, no SET NOT NULL, no TRUNCATE, no `DELETE FROM`.
 *
 * THE ONE NAMED, BOUNDED ESCAPE FROM `a REVOKE` — `-- allows: revoke <schema>`
 * ---------------------------------------------------------------------------
 * The campaign's first DDL file must `revoke usage on schema custom from
 * authenticated` on production, and `REVOKE` is on the non-additive list by name,
 * so before this existed that file had NO sanctioned path (ATTACK-4 finding 4).
 * `-- allows: revoke <schema>` suppresses the `a REVOKE` reason and NOTHING else:
 * every other non-additive reason still refuses, `-- additive: yes` and
 * `-- guard:` are still required, the schema may not be one of the protected set
 * this campaign did not create, and the file is refused unless EVERY `REVOKE` in
 * its body names that one schema. When it is used it is ANNOUNCED — one `[ OK ]`
 * line naming the schema and the statements it allowed. Nothing fails silently
 * and nothing passes silently either.
 *
 * Shared with `aidream/db/migration_target.py`, which implements the identical
 * rules for the Python runner — including `-- seeds-guards:` and
 * `-- allows: revoke`. The two are kept in step by `BRANCH-REF` being the single
 * source of both identities.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Target = "branch" | "production" | "clone";

export const TARGETS: readonly Target[] = ["branch", "production", "clone"] as const;

/** Where `BRANCH-REF` lives, relative to the matrx-frontend checkout root. */
export const BRANCH_REF_PATH =
  "../common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF";

/**
 * `--target clone` — THE NIGHTLY DEV CLONE, AND WHY IT NEEDED ITS OWN IDENTITY RULE.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The clone is a Supabase DATA branch of production (`with_data: true`): a PHYSICAL
 * RESTORE of production's cluster, refreshed nightly. It is the only rehearsal
 * database that holds production's real row counts, real indexes and real lock
 * behaviour, which is why W1-ORG-PREP rehearsed four chair steps on it — and why it
 * had to do so with `psql --single-transaction`, outside this runner, with no
 * judgement and no ledger row, because `--target` knew only `branch` and
 * `production`.
 *
 * 🚨 THE TRAP, AND THE ONE THING THAT CLOSES IT. A physical restore reports the SAME
 * `pg_control_system().system_identifier` as its parent — production's own
 * 7642734024280108049 (measured 2026-09-22). So the post-connection check that
 * separates `branch` from `production` CANNOT separate the clone from production: it
 * would call the clone MAIN and say `[ OK ] target production` while pointed at a
 * copy, and would just as happily accept `--target clone` against PRODUCTION and
 * rehearse a `DROP` on the live database.
 *
 * The identity that does separate them is the CONNECTION's PROJECT REF: the Supabase
 * pooler user is `postgres.<ref>` and the direct host is `db.<ref>.supabase.co`. So a
 * clone target is `(system_identifier, project ref)` TOGETHER — never the number alone.
 * Both halves are read from the checked-in `common-docs/operations/clone/CLONE-REF`,
 * the same file `scripts/campaign-tests/_branch-sysid.sh` and `scripts/night/lib-night.sh`
 * read, so a fresh nightly clone needs no edit here.
 *
 * AND A SECOND, SERVER-SIDE CHECK, because a project ref is still something the CALLER
 * configured. The nightly job QUARANTINES the clone — it drops `pg_net` and deactivates
 * every `pg_cron` job — and neither is ever true of production. So:
 *   · `--target clone` additionally REQUIRES the server to be quarantined. Production
 *     presented as the clone is refused by production's own answer.
 *   · `--target production` additionally REFUSES a quarantined server. The clone
 *     presented as production is refused by the clone's own answer.
 * Two facts, read from the server, in conjunction — so a single one of them changing
 * on production can never refuse a real production apply.
 *
 * REACHABLE ONLY THROUGH THE CLONE'S OWN CONNECTION VARIABLES. `CLONE_DATABASE_URL`
 * (the whole DSN), or the identities in `CLONE-REF` plus the password file `CLONE-REF`
 * names. The five `SUPABASE_MATRIX_*` variables are NEVER consulted for `--target
 * clone`: they select production's connection, and the whole point of this target is
 * that production and the clone are indistinguishable by everything except the ref.
 *
 * WHAT IS JUDGED. Exactly what production is judged by, because the clone IS
 * production's copy: the allow-list for a file that names production, the deny-list
 * for a header-less file that has not run here yet, `-- chair-step:` as the named
 * escape (announced here, confirmed only at production), the guard that must resolve
 * OFF, the inverse ground gate and the campaign directory rules. The differences are
 * the two the rehearsal role demands: `--confirm-chair-step` is not required (a
 * rehearsal is one command), and the ledger row is MARKED as a rehearsal so the next
 * nightly refresh overwriting it is expected rather than alarming.
 */
export const CLONE_REF_PATH = "../common-docs/operations/clone/CLONE-REF";

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

export class TargetRefusal extends Error {
  /**
   * The STABLE reason token this refusal carries — `migrations/JUDGMENT.md`'s
   * vocabulary, not the prose. The prose is for the human at 3 a.m. and is free to
   * differ between the two runners; the token is what the conformance corpus
   * compares, so a divergence in JUDGMENT between `pnpm db:apply` and
   * `uv run python db/apply_migrations.py` is a red test rather than a coin flip
   * decided by which command a tired lane typed (ATTACK-7 findings 1–4).
   */
  readonly code: string;
  constructor(message: string, code = "refused") {
    super(message);
    this.code = code;
  }
}

function fail(lines: string[], code = "refused"): never {
  throw new TargetRefusal(lines.join("\n"), code);
}

/**
 * Read `BRANCH-REF`. Absent, unreadable or short of a required key is a refusal
 * with the remedy — never a fallback.
 */
/**
 * `--branch-ref=<path>` / `MATRX_BRANCH_REF` — the override the refusal already PROMISED.
 *
 * 🚨 ATTACK-7 finding 10: the ref is resolved from the repo root's PARENT, so inside a
 * throwaway worktree — the working mode rules 2, 10 and 27 and `W3-ASSERT`/`V3` all
 * require — every `--target` run refused with `BRANCH-REF not found at …` and the printed
 * remedy named a flag no runner implemented. A remedy that does not exist is a screen
 * lying about what the operator can do. Both runners take it now, and it is read exactly
 * like the checked-in file: a missing or unreadable override is still a refusal, never a
 * fallback to whatever `SUPABASE_MATRIX_*` holds.
 */
export function branchRefOverride(argv: readonly string[]): string | undefined {
  const arg = argv.find((a) => a.startsWith("--branch-ref="));
  if (arg) return resolve(arg.slice("--branch-ref=".length).trim());
  const env = process.env.MATRX_BRANCH_REF;
  return env ? resolve(env) : undefined;
}

export function loadBranchRef(root: string, overridePath?: string): BranchRef {
  const path = overridePath ?? resolve(root, BRANCH_REF_PATH);
  if (!existsSync(path)) {
    fail([
      `BRANCH-REF not found at ${path}.`,
      `  --target reads the rehearsal branch's identity from that checked-in file and`,
      `  refuses rather than falling back to whatever SUPABASE_MATRIX_* holds.`,
      `  Remedy: check out common-docs beside this repo, or pass --branch-ref=<path>`,
      `  (or set MATRX_BRANCH_REF) — which is what a run from a throwaway worktree needs,`,
      `  since the ref is resolved from this repo's PARENT directory.`,
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

// ── the nightly dev clone: CLONE-REF, its connection, and its two server facts ──

export interface CloneRef {
  readonly cloneRef: string;
  readonly cloneName: string;
  readonly parentRef: string;
  readonly poolerHost: string;
  readonly poolerPort: number;
  readonly poolerUser: string;
  readonly database: string;
  readonly directHost: string;
  readonly systemIdentifier: string;
  readonly parentSystemIdentifier: string;
  readonly passwordEnvVar: string;
  /** Local staging path for the clone's OWN password. Never printed, never committed. */
  readonly passwordFile: string;
  readonly path: string;
}

/** `--clone-ref=<path>` / `MATRX_CLONE_REF`, the same override BRANCH-REF already takes. */
export function cloneRefOverride(argv: readonly string[]): string | undefined {
  const arg = argv.find((a) => a.startsWith("--clone-ref="));
  if (arg) return resolve(arg.slice("--clone-ref=".length).trim());
  const env = process.env.MATRX_CLONE_REF;
  return env ? resolve(env) : undefined;
}

/**
 * Read `CLONE-REF`. Absent, unreadable or short of a required key is a REFUSAL with the
 * remedy — never a fallback. CLONE-REF says so itself and it is the whole safety
 * argument: a connection that cannot be PROVEN to be the clone is never treated as the
 * clone, and a connection that cannot be proven NOT to be the clone is never treated as
 * production.
 */
export function loadCloneRef(root: string, overridePath?: string): CloneRef {
  const path = overridePath ?? resolve(root, CLONE_REF_PATH);
  if (!existsSync(path)) {
    fail([
      `CLONE-REF not found at ${path}.`,
      `  --target clone reads the nightly dev clone's identity from that checked-in file — its`,
      `  project ref AND its system_identifier, because a data clone reports its PARENT's`,
      `  system_identifier and the number alone cannot tell them apart.`,
      `  Refusing rather than falling back to whatever SUPABASE_MATRIX_* holds, which is`,
      `  production.`,
      `  Remedy: check out common-docs beside this repo, or pass --clone-ref=<path>`,
      `  (or set MATRX_CLONE_REF).`,
    ], "clone-ref-missing");
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    fail([`CLONE-REF at ${path} is unreadable: ${String(e)}`], "clone-ref-unreadable");
  }
  const bag: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/);
    if (m) bag[m[1]!] = m[2]!;
  }
  const need = [
    "clone_ref",
    "parent_ref",
    "pooler_host",
    "pooler_port",
    "pooler_user",
    "database",
    "system_identifier",
    "parent_system_identifier",
    "password_env_var",
    "password_file",
  ];
  const missing = need.filter((k) => !bag[k]);
  if (missing.length) {
    fail([
      `CLONE-REF at ${path} is missing: ${missing.join(", ")}.`,
      `  Every one of them is an identity, not a secret, and --target clone cannot decide`,
      `  anything without them. Refusing rather than guessing.`,
    ], "clone-ref-incomplete");
  }
  return {
    cloneRef: bag.clone_ref!,
    cloneName: bag.clone_name ?? bag.clone_ref!,
    parentRef: bag.parent_ref!,
    poolerHost: bag.pooler_host!,
    poolerPort: Number(bag.pooler_port!),
    poolerUser: bag.pooler_user!,
    database: bag.database!,
    directHost: bag.direct_host ?? "",
    systemIdentifier: bag.system_identifier!,
    parentSystemIdentifier: bag.parent_system_identifier!,
    passwordEnvVar: bag.password_env_var!,
    passwordFile: bag.password_file!,
    path,
  };
}

/**
 * THE PROJECT REF A CONNECTION IS POINTED AT, read from the connection itself.
 *
 * This is the ONE thing that separates a physical data clone from the production
 * cluster it was restored from, because the two answer `pg_control_system()`
 * identically. Two shapes, which is every shape Supabase gives out:
 *     pooler  → user `postgres.<ref>`        (everything after the FIRST dot)
 *     direct  → host `db.<ref>.supabase.co`  (or `<ref>.supabase.co`)
 * Anything else yields the empty string, which matches NO target and is therefore
 * refused — never silently treated as "probably production".
 *
 * Identical to `night_conn_ref` in `scripts/night/lib-night.sh` and to the `matrx_ref`
 * expression in `scripts/campaign-tests/_preamble.sql`. Three readers, one rule.
 */
export function projectRefOf(user: string, host: string): string {
  const u = (user ?? "").trim();
  const h = (host ?? "").trim();
  const dot = u.indexOf(".");
  if (dot > 0 && dot < u.length - 1) return u.slice(dot + 1);
  const direct = /^db\.([a-z0-9]+)\.supabase\.(co|com)$/i.exec(h);
  if (direct) return direct[1]!;
  const bare = /^([a-z0-9]+)\.supabase\.(co|com)$/i.exec(h);
  if (bare) return bare[1]!;
  return "";
}

/**
 * The QUARANTINE FACTS, as the SERVER answers them — the second, independent half of
 * the clone's identity, and the only half production cannot be made to fake by
 * pointing an environment variable somewhere.
 *
 * The nightly clone job drops `pg_net` and deactivates every `pg_cron` job. Production
 * has both. Read in CONJUNCTION, deliberately: one of the two changing on production
 * one day must never refuse a real production apply.
 */
export interface QuarantineFacts {
  readonly pgNetInstalled: boolean;
  readonly activeCronJobs: number;
  readonly cronTablePresent: boolean;
  readonly quarantined: boolean;
}

export async function readQuarantineFacts(
  query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>,
): Promise<QuarantineFacts> {
  const base = await query(
    `select (select count(*)::int from pg_extension where extname = 'pg_net') as net,
            (to_regclass('cron.job') is not null) as cron_table`,
  );
  const pgNetInstalled = Number(base.rows[0]?.net ?? 0) > 0;
  const cronTablePresent = base.rows[0]?.cron_table === true;
  let activeCronJobs = 0;
  if (cronTablePresent) {
    const c = await query(`select count(*)::int as n from cron.job where active`);
    activeCronJobs = Number(c.rows[0]?.n ?? 0);
  }
  return {
    pgNetInstalled,
    activeCronJobs,
    cronTablePresent,
    quarantined: !pgNetInstalled && activeCronJobs === 0,
  };
}

/**
 * The clone's connection, built from the ONE variable `CLONE-REF` names —
 * `CLONE_DATABASE_URL`, a whole DSN — or, failing that, from `CLONE-REF`'s own
 * identities plus the password file it names. Verified against `CLONE-REF`'s
 * host/user before it is handed back.
 *
 * 🚨 The five `SUPABASE_MATRIX_*` variables are NEVER consulted here, and there is no
 * fallback to them. They point at production, and production and the clone are
 * indistinguishable by everything except the project ref — so a fallback would not be
 * a convenience, it would be the failure this target exists to prevent.
 */
export interface CloneDbEnv {
  readonly user: string;
  readonly password: string;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly from: string;
}

export function loadCloneDbEnv(root: string, ref: CloneRef): CloneDbEnv {
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
  let env: CloneDbEnv;
  if (hit) {
    const [from, dsn] = hit;
    let u: URL;
    try {
      u = new URL(dsn!);
    } catch {
      fail([
        `${ref.passwordEnvVar} (from ${from}) is not a DSN.`,
        `  Expected postgresql://<user>:<password>@<host>:<port>/<database>.`,
      ], "clone-dsn-malformed");
    }
    env = {
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      host: u.hostname,
      port: Number(u.port || ref.poolerPort),
      database: u.pathname.replace(/^\//, "") || ref.database,
      from: `${ref.passwordEnvVar} (${from})`,
    };
  } else {
    // The checked-in identities plus the password file CLONE-REF names. The password is
    // read and never printed; only the path it came from is.
    if (!ref.passwordFile || !existsSync(ref.passwordFile)) {
      fail([
        `--target clone needs ${ref.passwordEnvVar}, and it is not set.`,
        `  Looked in: ${candidates.map(([w]) => w).join(", ")}.`,
        `  The fallback — the password file ${ref.path} names — is not there either:`,
        `    ${ref.passwordFile || "(no password_file key)"}`,
        `  A branch gets its OWN password; production's is not it, and there is no fallback to`,
        `  SUPABASE_MATRIX_*. Re-mint the clone's password with the recipe inside ${ref.path}.`,
      ], "clone-password-missing");
    }
    let password: string;
    try {
      password = readFileSync(ref.passwordFile, "utf8").trim();
    } catch (e) {
      fail([
        `The clone password file ${ref.passwordFile} is unreadable: ${String(e)}`,
      ], "clone-password-unreadable");
    }
    if (!password) {
      fail([`The clone password file ${ref.passwordFile} is empty.`], "clone-password-empty");
    }
    env = {
      user: ref.poolerUser,
      password,
      host: ref.poolerHost,
      port: ref.poolerPort,
      database: ref.database,
      from: `${ref.path} + ${ref.passwordFile}`,
    };
  }
  if (env.user !== ref.poolerUser || env.host !== ref.poolerHost) {
    fail([
      `${ref.passwordEnvVar} does not point at the dev clone ${ref.cloneRef}.`,
      `  DSN says:   ${env.user}@${env.host}:${env.port}/${env.database}`,
      `  CLONE-REF:  ${ref.poolerUser}@${ref.poolerHost}:${ref.poolerPort}/${ref.database}`,
      `  project ref in the DSN: ${projectRefOf(env.user, env.host) || "(none)"}; expected ${ref.cloneRef}.`,
      `  Refusing rather than rehearsing against whatever that DSN really is — which, if it is`,
      `  production, answers pg_control_system() with the very number CLONE-REF records.`,
    ], "clone-dsn-not-the-clone");
  }
  return env;
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
      `  Valid: --target branch | --target clone | --target production.`,
      `  \`clone\` is the nightly dev clone named in ${CLONE_REF_PATH} — production's own data,`,
      `  quarantined, judged exactly as production is. Refusing rather than picking one.`,
    ]);
  }
  return value as Target;
}

const HEADER_TARGET_RE = /^\s*--\s*target\s*:\s*(.+?)\s*$/i;
const HEADER_ADDITIVE_RE = /^\s*--\s*additive\s*:\s*yes\s*$/i;
const HEADER_SEEDS_GUARDS_RE = /^\s*--\s*seeds-guards\s*:\s*yes\s*$/i;
const HEADER_GUARD_RE = /^\s*--\s*guard\s*:\s*([a-z0-9_]+)\s*\/\s*([a-z0-9_.]+)\s*$/i;
/**
 * A knob-directive ATTEMPT: one identifier, or one `feature/key`, and nothing else.
 * `-- guard: custom` is this (malformed). A sentence — `-- Guard: the test at
 * features/ai-work/…/file.test.ts` — is not: migrations use "Guard:" as English
 * for the witness that watches the file, and refusing those blocked every runner
 * that read the header, including `--accept-drift`, which executes nothing.
 */
const HEADER_GUARD_ATTEMPT_RE =
  /^\s*--\s*guard\s*:\s*[A-Za-z0-9_]+(?:\/[A-Za-z0-9_.]+)?\s*$/i;
const HEADER_ALLOWS_RE = /^\s*--\s*allows\s*:\s*(.+?)\s*$/i;
const HEADER_ALLOWS_REVOKE_RE = /^revoke\s+([a-z_][a-z0-9_]*)$/;
const HEADER_CHAIR_STEP_RE = /^\s*--\s*chair-step\s*:\s*(.+?)\s*$/i;

/**
 * Schemas `-- allows: revoke <schema>` may NEVER name. None of them was created by
 * this campaign, and a REVOKE inside any of them can take the platform off the
 * air (`public`, `auth`, `storage`) or silently strip the very grants the doctrine
 * work depends on (`platform`, `iam`).
 */
export const REVOKE_PROTECTED_SCHEMAS: readonly string[] = [
  "public",
  "auth",
  "iam",
  "platform",
  "storage",
  "extensions",
  "graphql",
  "graphql_public",
  "realtime",
  "vault",
  "cron",
  "net",
  "pgbouncer",
  "supabase_functions",
  "information_schema",
  "pg_catalog",
  "admin",
  "history",
] as const;

export interface MigrationHeader {
  /** null when the file carries no `-- target:` line at all. */
  readonly targets: Target[] | null;
  readonly additive: boolean;
  readonly guard: { feature: string; key: string } | null;
  /**
   * THE ONE EXEMPTION from the guard requirement, and it is bounded.
   *
   * Every other two-target file must name a knob that already resolves OFF. The
   * file that SEEDS those knobs cannot: it is what makes them resolvable, and
   * before it runs `platform.knob_resolve` raises P0001 on every one of them.
   * So `-- seeds-guards: yes` stands in for `-- guard:` — and the runner then
   * REFUSES the file unless its body touches nothing but the knob register
   * itself (`platform.feature_knob`, `platform.knob_override`,
   * `platform.knob_rung_lock`). A register file cannot smuggle anything else
   * past the guard rule.
   */
  readonly seedsGuards: boolean;
  /**
   * `-- allows: revoke <schema>` — the ONE named escape from the `a REVOKE`
   * reason, and it is bounded in four ways at once: it suppresses only that one
   * reason, the schema may not be protected, EVERY `REVOKE` in the body must name
   * that schema and nothing else, and the file still needs `-- additive: yes` and
   * a `-- guard:` line. null when the file carries no such header.
   */
  readonly allowsRevokeSchema: string | null;
  /**
   * `-- chair-step: <why>` — the ONE named escape from the header-less production
   * judgement below, and it is loud by construction: the runner prints the reason
   * AND the file's entire body before a single byte executes. It suppresses
   * nothing else: a file that also NAMES production in a `-- target:` header still
   * meets the additive + guard requirements. null when the file carries no such
   * header.
   */
  readonly chairStep: string | null;
}

/** Read the `-- target:` / `-- additive:` / `-- guard:` lines out of a file's head. */
export function readHeader(sql: string): MigrationHeader {
  let targets: Target[] | null = null;
  let additive = false;
  let seedsGuards = false;
  let allowsRevokeSchema: string | null = null;
  let chairStep: string | null = null;
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
          `  Valid headers: \`-- target: branch\`, \`-- target: clone\`, \`-- target: production\`,`,
          `  \`-- target: branch,production\`.`,
        ], "header-target-unknown");
      }
      targets = parts as Target[];
    }
    if (HEADER_ADDITIVE_RE.test(line)) additive = true;
    if (HEADER_SEEDS_GUARDS_RE.test(line)) seedsGuards = true;
    const g = line.match(HEADER_GUARD_RE);
    if (g) guard = { feature: g[1]!, key: g[2]! };
    else if (HEADER_GUARD_ATTEMPT_RE.test(line)) {
      fail([
        `\`${line.trim()}\` is not a guard key.`,
        `  platform.feature_knob's primary key is TWO columns, (feature, key), so the guard`,
        `  is written \`-- guard: <feature>/<key>\` — e.g. \`-- guard: custom/associations_guard\`.`,
      ], "header-guard-malformed");
    }
    const a = line.match(HEADER_ALLOWS_RE);
    if (a) {
      const claim = a[1]!.trim().toLowerCase();
      const r = claim.match(HEADER_ALLOWS_REVOKE_RE);
      if (!r) {
        fail([
          `\`${line.trim()}\` is not an \`-- allows:\` clause this runner knows.`,
          `  The ONE form is \`-- allows: revoke <schema>\` — one lowercase schema token, e.g.`,
          `  \`-- allows: revoke custom\`. It is deliberately not a general escape hatch: it`,
          `  suppresses the "a REVOKE" reason and nothing else.`,
        ], "header-allows-unknown");
      }
      const schema = r[1]!;
      if (REVOKE_PROTECTED_SCHEMAS.includes(schema)) {
        fail([
          `\`${line.trim()}\` names the PROTECTED schema \`${schema}\`.`,
          `  This campaign did not create it, so it may never be the subject of the revoke`,
          `  exemption. Protected: ${REVOKE_PROTECTED_SCHEMAS.join(", ")}.`,
          `  A REVOKE inside one of those is a chair step with its own inverse migration —`,
          `  never a header line.`,
        ], "header-allows-revoke-protected");
      }
      if (allowsRevokeSchema && allowsRevokeSchema !== schema) {
        fail([
          `${line.trim()} — the file already carries \`-- allows: revoke ${allowsRevokeSchema}\`.`,
          `  The exemption names ONE schema. Two of them is two exemptions; split the file.`,
        ], "header-allows-revoke-two-schemas");
      }
      allowsRevokeSchema = schema;
    }
    const cs = line.match(HEADER_CHAIR_STEP_RE);
    if (cs) {
      const why = cs[1]!.trim();
      if (why.length < 12) {
        fail([
          `\`${line.trim()}\` does not say why.`,
          `  \`-- chair-step:\` is the escape from the header-less production judgement, so it`,
          `  carries the reason a human will read at 3 a.m. — at least a sentence, not a word.`,
        ], "header-chair-step-no-reason");
      }
      chairStep = why;
    }
  }
  return { targets, additive, guard, seedsGuards, allowsRevokeSchema, chairStep };
}

// ── the revoke exemption's containment check ────────────────────────────────

/** One `REVOKE …` statement lifted out of a comment-stripped body. */
export interface RevokeStatement {
  readonly text: string;
  /** Every schema this statement names. Empty means "it named none we could see". */
  readonly schemas: string[];
  /** Object references that carry no schema qualification at all. */
  readonly unqualified: string[];
}

/**
 * Every `REVOKE` statement in a comment-stripped body, with the schemas it names.
 *
 * This is a CONTAINMENT check, so it errs toward finding things and toward saying
 * "I could not tell" (an empty `schemas` with a non-empty `unqualified`) rather
 * than toward silence. Four shapes are understood, which is every shape Postgres
 * accepts for a schema-scoped revoke:
 *     REVOKE … ON SCHEMA <s>
 *     REVOKE … ON ALL <things> IN SCHEMA <s>
 *     REVOKE … ON <s>.<object>
 *     ALTER DEFAULT PRIVILEGES [FOR ROLE …] IN SCHEMA <s> REVOKE …
 * Anything else lands in `unqualified` and refuses the file by name.
 *
 * 🚨 The fourth shape was missing until 2026-09-16, and its absence made the OFF
 * switch unwritable. `ALTER DEFAULT PRIVILEGES IN SCHEMA custom REVOKE ALL ON
 * TABLES FROM anon` fell through to the object-list arm below, which reads the
 * subject between the first ` on ` and the last ` from ` — here the bare word
 * `tables` — reported it `unqualified`, and refused the whole file. The refusal
 * then told the builder to write it `ON SCHEMA custom` / `ON ALL … IN SCHEMA
 * custom`, neither of which is legal syntax for ALTER DEFAULT PRIVILEGES. So the
 * campaign's one sanctioned REVOKE route was a dead end whose remedy did not
 * parse, and the next route a tired builder finds is a header-less file.
 *
 * ALTER DEFAULT PRIVILEGES with NO `IN SCHEMA` is database-wide, so it stays
 * unqualified and still refuses the file — that is the whole point of the check.
 */
const ALTER_DEFAULT_PRIVILEGES_RE = /^alter\s+default\s+privileges\b/i;
const ALTER_DEFAULT_PRIVILEGES_IN_SCHEMA_RE =
  /^alter\s+default\s+privileges\s+(?:for\s+(?:role|user)\s+[a-z0-9_",\s]+?\s+)?in\s+schema\s+([a-z0-9_",\s]+?)\s+revoke\b/i;

export function revokeStatementsOf(strippedSql: string): RevokeStatement[] {
  const out: RevokeStatement[] = [];
  for (const raw of strippedSql.split(";")) {
    if (!/\bREVOKE\b/i.test(raw)) continue;
    const text = raw.replace(/\s+/g, " ").trim();
    // ALTER DEFAULT PRIVILEGES names its schema BEFORE the REVOKE keyword, so the
    // `on … from …` subject extraction below cannot see it. Attribute it here.
    if (ALTER_DEFAULT_PRIVILEGES_RE.test(text)) {
      const inSchemaM = ALTER_DEFAULT_PRIVILEGES_IN_SCHEMA_RE.exec(text);
      if (!inSchemaM) {
        out.push({
          text,
          schemas: [],
          unqualified: ["(ALTER DEFAULT PRIVILEGES with no IN SCHEMA — database-wide)"],
        });
        continue;
      }
      const names = inSchemaM[1]!
        .split(",")
        .map((x) => x.trim().replace(/"/g, "").toLowerCase())
        .filter(Boolean);
      out.push({ text, schemas: [...new Set(names)], unqualified: [] });
      continue;
    }
    // The subject sits between the FIRST ` on ` and the LAST ` from ` — `from`
    // also introduces the grantee list, which is what makes "last" right.
    const onM = /\bon\b/i.exec(text);
    const fromIdx = text.toLowerCase().lastIndexOf(" from ");
    if (!onM || fromIdx < 0 || fromIdx <= onM.index) {
      out.push({ text, schemas: [], unqualified: ["(unparseable REVOKE)"] });
      continue;
    }
    const subject = text.slice(onM.index + onM[0].length, fromIdx).trim();
    const inSchema = subject.match(/^all\s+.*?\bin\s+schema\s+(.+)$/i);
    const bareSchema = subject.match(/^schema\s+(.+)$/i);
    if (inSchema || bareSchema) {
      const names = (inSchema ? inSchema[1]! : bareSchema![1]!)
        .split(",")
        .map((x) => x.trim().replace(/^"|"$/g, "").toLowerCase())
        .filter(Boolean);
      out.push({ text, schemas: names, unqualified: [] });
      continue;
    }
    // An object list. Drop argument lists so a function signature's commas do not
    // split one reference into two.
    const flat = subject.replace(/\([^)]*\)/g, "");
    const schemas: string[] = [];
    const unqualified: string[] = [];
    for (const item of flat.split(",")) {
      const token = item.trim().split(/\s+/).pop() ?? "";
      const cleaned = token.replace(/"/g, "").toLowerCase();
      if (!cleaned) continue;
      const q = cleaned.match(/^([a-z_][a-z0-9_$]*)\.[a-z_][a-z0-9_$]*$/);
      if (q) schemas.push(q[1]!);
      else unqualified.push(cleaned);
    }
    out.push({ text, schemas: [...new Set(schemas)], unqualified });
  }
  return out;
}

/**
 * The revoke exemption, checked. Returns the statements it allowed so the runner
 * can ANNOUNCE them — a passing exemption is as loud as a failing one.
 */
export function assertRevokeExemptionIsContained(
  filename: string,
  schema: string,
  strippedSql: string,
): RevokeStatement[] {
  const statements = revokeStatementsOf(strippedSql);
  if (statements.length === 0) {
    fail([
      `${filename} carries \`-- allows: revoke ${schema}\` but its body contains no REVOKE at all.`,
      `  An exemption nobody uses is an exemption nobody reviewed. Delete the header line.`,
    ], "revoke-exemption-unused");
  }
  for (const st of statements) {
    const foreign = st.schemas.filter((s) => s !== schema);
    if (foreign.length || st.unqualified.length) {
      fail([
        `${filename} carries \`-- allows: revoke ${schema}\` but this REVOKE does not stay inside it:`,
        `      ${st.text}`,
        foreign.length
          ? `  It names ${foreign.join(", ")}, not ${schema}.`
          : `  It names ${st.unqualified.join(", ")}, which is not schema-qualified, so nothing`,
        foreign.length
          ? `  The exemption covers ONE schema and the runner will not widen it.`
          : `  can prove it stays inside ${schema}. Qualify it as ${schema}.<object>, or write it`,
        foreign.length
          ? ``
          : `  as \`ON SCHEMA ${schema}\` / \`ON ALL … IN SCHEMA ${schema}\` — or, for default\n` +
            `  privileges, as \`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE … FROM …\`,\n` +
            `  which is the only legal way to bound that statement to a schema.`,
      ].filter(Boolean), "revoke-exemption-uncontained");
    }
  }
  return statements;
}

/** What a `-- seeds-guards: yes` file is allowed to touch, and nothing else. */
const KNOB_REGISTER_TABLES = [
  "platform.feature_knob",
  "platform.knob_override",
  "platform.knob_rung_lock",
] as const;

/** Every `<schema>.<table>` a statement writes to, however crudely — this is a
 *  containment check, so it errs toward FINDING things. */
function writeTargetsOf(strippedSql: string): string[] {
  const out = new Set<string>();
  const re =
    /\b(?:insert\s+into|update|delete\s+from|alter\s+table(?:\s+if\s+exists)?|create\s+table(?:\s+if\s+not\s+exists)?|truncate(?:\s+table)?)\s+(?:only\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;
  for (const m of strippedSql.matchAll(re)) out.add(m[1]!.toLowerCase());
  return [...out];
}

/**
 * THE DENY-LIST — for a HEADER-LESS file only (rule 8's amnesty half).
 *
 * A file that NAMES production is judged by the ALLOW-LIST below; this list is what
 * an unledgered file with no `-- target:` line at all is judged by, and it must stay
 * a deny-list for the reason rule 8 already records: an allow-list here would refuse
 * every ordinary migration every other lane in these two repos writes.
 *
 * 🚨 Extended 2026-09-16 (ATTACK-6 finding 3) with the privilege-widening shapes that
 * are RARE in ordinary work and catastrophic when they land unjudged. `GRANT` is
 * deliberately NOT here — hundreds of ordinary migrations carry
 * `grant execute on function … to authenticated` — but it is off the allow-list, so
 * every file that names production is refused for it by name.
 */
const NON_ADDITIVE_RES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bDROP\s+(TABLE|COLUMN|SCHEMA|TYPE|CONSTRAINT|POLICY|TRIGGER|INDEX|FUNCTION|VIEW)\b/i, "a DROP"],
  [/\bREVOKE\b/i, "a REVOKE"],
  [/\bALTER\s+TYPE\s+\S+\s+ADD\s+VALUE\b/i, "ALTER TYPE … ADD VALUE"],
  [/\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i, "ALTER COLUMN … TYPE"],
  [/\bALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL\b/i, "SET NOT NULL on an existing column"],
  [/\bTRUNCATE\b/i, "a TRUNCATE"],
  [/\bDELETE\s+FROM\b/i, "a DELETE"],
  // ── the eight ATTACK-6 ran through the old scan, minus GRANT (see above) ──
  [/\bCREATE\s+POLICY\b[\s\S]*?\b(?:USING|WITH\s+CHECK)\s*\(\s*true\s*\)/i, "CREATE POLICY with a `true` predicate"],
  [/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i, "DISABLE ROW LEVEL SECURITY"],
  [/\bNO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\b/i, "NO FORCE ROW LEVEL SECURITY"],
  [/\bALTER\s+TABLE\b[\s\S]*?\bDISABLE\s+TRIGGER\b/i, "ALTER TABLE … DISABLE TRIGGER"],
  [/\bALTER\s+POLICY\b/i, "ALTER POLICY on a live policy"],
  [/\bALTER\s+DEFAULT\s+PRIVILEGES\b[\s\S]*?\bGRANT\b/i, "ALTER DEFAULT PRIVILEGES … GRANT"],
  [/\bALTER\s+FUNCTION\b[^;]*?\bSECURITY\s+DEFINER\b/i, "ALTER FUNCTION … SECURITY DEFINER"],
];

/**
 * Why a HEADER-LESS body is not additive, by the deny-list above. `allowRevokeSchema`
 * suppresses the `a REVOKE` reason and NOTHING else.
 */
export function nonAdditiveReasonsDenyList(
  strippedSql: string,
  opts?: { readonly allowRevokeSchema?: string | null },
): string[] {
  const allowRevoke = Boolean(opts?.allowRevokeSchema);
  return NON_ADDITIVE_RES.filter(
    ([re, what]) => re.test(strippedSql) && !(allowRevoke && what === "a REVOKE"),
  ).map(([, what]) => what);
}

// ── ATTACK-6 finding 2: "additive" is an ALLOW-LIST, not a blacklist ────────
//
// 🚨 The blacklist below `NON_ADDITIVE_RES` used to be the WHOLE judgement, and a
// blacklist only knows what somebody thought of. ATTACK-6 ran the old
// `nonAdditiveReasons` against eight privilege-widening bodies and every one of
// them returned `[]` — including `GRANT USAGE ON SCHEMA custom TO authenticated`,
// which is switch-checklist step 3, the statement the OFF switch's whole security
// boundary consists of REVOKING. A file headed `-- target: branch,production` +
// `-- additive: yes` + `-- guard: custom/system_enabled` carrying that GRANT passed
// header agreement, passed the additive scan and passed `assert_guard_resolves_off`
// (the knob really is false) — so every mechanical check said OFF while the schema
// was open to every signed-in user. `CREATE POLICY … USING (true)` is literally
// additive and opens every row of the table it names; policies are OR'd.
//
// So a file that NAMES production is now judged by an ALLOW-LIST: its body is split
// into statements and EVERY statement must match one of the enumerated additive
// shapes below. Anything else is refused WITH THE STATEMENT NAMED. A shape nobody
// enumerated is refused rather than ignored, which is the only direction a safety
// scan may fail in.
//
// ⚠️ THE ALLOW-LIST APPLIES TO FILES THAT NAME PRODUCTION IN A `-- target:` HEADER,
//    WHICH IS THIS CAMPAIGN'S CONTRACT AND NOTHING ELSE. A header-less file keeps
//    the blacklist (extended, see `nonAdditiveReasonsDenyList`), because an
//    allow-list there would refuse every ordinary migration every other lane in
//    these two repos writes — `GRANT EXECUTE ON FUNCTION … TO authenticated` is in
//    hundreds of them. Same reasoning rule 8 already records for `-- additive: yes`
//    and `-- guard:`: the campaign's contract binds the campaign, and widening it to
//    the whole repo buys nothing and breaks the world.

/**
 * One statement of a comment-stripped body, dollar-quote aware, EXACTLY AS WRITTEN —
 * every newline kept.
 *
 * 🚨 WHY THIS EXISTS SEPARATELY FROM `topLevelStatements` (lane STORE-TXN, 2026-09-22).
 * `topLevelStatements` collapses every run of whitespace to one space, which is right for
 * the thing it was written for: the allow-list reads each statement as a single line. It is
 * WRONG for anything that EXECUTES the statements, because a `--` comment inside a
 * `$function$` body then comments out everything after it — the whole rest of the function,
 * now on the same line. `pnpm db:rehearse`'s measure pass executed the collapsed form, so a
 * `create or replace function` whose body carries a line comment died on
 * `syntax error at end of input` in the measure pass while the SAME file applied cleanly
 * through `pnpm db:apply` and through psql. Anything that runs SQL uses THIS function.
 */
export function topLevelStatementsVerbatim(strippedSql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  while (i < strippedSql.length) {
    const tag = /^\$([A-Za-z_]\w*)?\$/.exec(strippedSql.slice(i));
    if (tag) {
      const close = strippedSql.indexOf(tag[0], i + tag[0].length);
      const end = close < 0 ? strippedSql.length : close + tag[0].length;
      buf += strippedSql.slice(i, end);
      i = end;
      continue;
    }
    const ch = strippedSql[i]!;
    if (ch === "'") {
      let j = i + 1;
      while (j < strippedSql.length) {
        if (strippedSql[j] === "'") {
          if (strippedSql[j + 1] === "'") {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      buf += strippedSql.slice(i, j);
      i = j;
      continue;
    }
    if (ch === ";") {
      out.push(buf);
      buf = "";
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  out.push(buf);
  return out.map((t) => t.trim()).filter(Boolean);
}

/** The same statements, each collapsed to ONE LINE — for reading and judging, never for
 * executing (see `topLevelStatementsVerbatim`). */
export function topLevelStatements(strippedSql: string): string[] {
  return topLevelStatementsVerbatim(strippedSql)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// ── POLICY-LOCK (2026-09-22) — A POLICY CHANGE NEVER RIDES INSIDE A LONG FILE ─────────────
//
// THE FACT THIS IS BUILT ON, measured on the dev clone and confirmed on the main database:
// Supabase's own `supautils` extension carries a `policy_grants` hook. Every
// CREATE / ALTER / DROP POLICY run as `postgres` takes ACCESS EXCLUSIVE on the 23 `auth.*`,
// `storage.*` and `realtime.*` relations named in `supautils.policy_grants` — and PostgreSQL
// holds them until COMMIT. While they are held NOBODY can sign in, refresh a token, read a
// file or receive a realtime message. The setting is `sighup`, read from Supabase's own
// configuration file: `SET`, `SET LOCAL` and `ALTER ROLE … SET` are all refused, and
// `postgres` is not superuser here. The hook costs no measurable time; the damage is entirely
// that the locks are held to COMMIT, so THE FREEZE IS AS LONG AS THE TRANSACTION.
//
// The runner owns the transaction — one file, one transaction — so the length of a file
// carrying policy DDL IS the length of the outage. A file that creates a table, backfills it,
// replaces four functions AND touches one policy freezes the platform for all of it.
//
// So: a campaign file that contains policy DDL is POLICY-ONLY. Policy statements, the grants
// and comments that belong to them, and `set local` — nothing else. Everything else goes in a
// second file. The rule is mechanical and it is refused with a sentence, never a warning.

/**
 * The statement kinds that may sit beside policy DDL in one file.
 *
 * `platform.entity_types` is here on purpose and it is the ONLY table write that is: a lane
 * declares a token's class or its anon lane and regenerates in the SAME transaction precisely
 * so the declaration and the policies can never disagree, and one registry row costs
 * microseconds. Every other write, every table or index, every function replace is a second
 * file — those are the ones that turn a policy change into minutes of nobody being able to
 * sign in.
 */
const POLICY_COMPANION_RES: readonly RegExp[] = [
  /^(grant|revoke)\b/i,
  /^comment\s+on\b/i,
  /^(set|reset)\b/i,
  /^alter\s+table\b[\s\S]*\brow\s+level\s+security\b/i,
  /^(insert\s+into|update)\s+platform\.entity_types\b/i,
];

/**
 * Comments stripped, QUOTE-AWARE — `'… nullable -- NULL names nobody …'` is prose inside a
 * string literal, not a comment, and the naive stripper this file used to share eats the rest
 * of that line, unbalances the quote and hands the splitter a statement that starts in the
 * middle of an English sentence. Measured on
 * `migrations/campaign/secsweep2_ops_system_error_user_id_is_the_caller.sql`, 2026-09-22.
 */
export function stripCommentsQuoteAware(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const tag = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i));
    if (tag) {
      const close = sql.indexOf(tag[0], i + tag[0].length);
      const end = close < 0 ? sql.length : close + tag[0].length;
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    const ch = sql[i]!;
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { j += 2; continue; }
          break;
        }
        j += 1;
      }
      out += sql.slice(i, Math.min(j + 1, sql.length));
      i = j + 1;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      out += " ";
      i = nl < 0 ? sql.length : nl;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      out += " ";
      i = close < 0 ? sql.length : close + 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** The functions whose call regenerates policies for one or many tables. */
export const POLICY_REGENERATORS: readonly string[] = [
  "iam.apply_rls",
  "iam._apply_rls_unchecked",
  "iam._rls_emit_policies",
  "platform.reopen_declared_doors",
];

/**
 * Why this ONE statement issues policy DDL, or null. A `CREATE OR REPLACE FUNCTION` whose
 * BODY contains `create policy` is not a policy statement — replacing a body takes no lock;
 * running it does. So the regenerator test only fires on a statement that CALLS one
 * (`select`, `do`, `call`, `with`), which is exactly the statement that takes the locks.
 */
export function policyStatementReasonOf(stmt: string): string | null {
  const t = stmt.trim();
  const m = /^(create|alter|drop)\s+policy\b/i.exec(t);
  if (m) return `${m[1].toUpperCase()} POLICY`;
  if (/^(select|do|call|with|perform)\b/i.test(t)) {
    for (const fn of POLICY_REGENERATORS) {
      if (new RegExp(`\\b${fn.replace(/[.]/g, "\\.")}\\s*\\(`, "i").test(t)) {
        return `a call to ${fn}(), which issues policy DDL`;
      }
    }
  }
  return null;
}

export interface PolicyOnlyVerdict {
  /** The statements that issue policy DDL, with the reason each one does. */
  readonly policy: Array<{ readonly stmt: string; readonly why: string }>;
  /** The statements that may NOT ride with them — empty means the file is policy-only. */
  readonly strangers: string[];
}

/**
 * Judge the RAW bytes (it strips its own comments, quote-aware). When the body contains NO
 * policy DDL the rule does not fire and
 * `policy` is empty; when it does, every other statement must be a companion or it is named.
 */
export function policyOnlyVerdict(rawSql: string): PolicyOnlyVerdict {
  const stmts = topLevelStatements(stripCommentsQuoteAware(rawSql));
  const policy: Array<{ stmt: string; why: string }> = [];
  const rest: string[] = [];
  for (const stmt of stmts) {
    const why = policyStatementReasonOf(stmt);
    if (why) policy.push({ stmt, why });
    else rest.push(stmt);
  }
  if (policy.length === 0) return { policy: [], strangers: [] };
  const strangers = rest.filter((s) => !POLICY_COMPANION_RES.some((re) => re.test(s.trim())));
  return { policy, strangers };
}


// ── WINDOW-CLASS (2026-09-22, lane TRIGGER-LOCK): TRIGGER DDL ON A PARTITIONED PARENT ──────
//
// The POLICY-LOCK rule above closed one door: a policy change freezes sign-in for as long as
// its transaction. Trigger DDL is the SECOND door onto the same corridor, and it was found the
// hard way — lane OLD-TABLES-1, 2026-09-22, measured a single `drop trigger` on `custom.record`
// taking ACCESS EXCLUSIVE on ~41 relations for ~810 ms: the same 23 `auth.*`/`storage.*`/
// `realtime.*` relations `supautils.policy_grants` freezes, PLUS the table and its 16 hash
// partitions. This lane re-measured it statement by statement on the dev clone the same day,
// from the measuring backend's own `pg_locks`, each probe inside a rolled-back transaction, and
// counts FORTY (23 + parent + 16); the one-relation difference from OLD-TABLES-1's count is not
// reconciled and does not change any rule. The shape (full table: `scripts/night/README.md`):
//
//   · `drop trigger`                  — ACCESS EXCLUSIVE. On `custom.record`: 40 relations —
//                                       the parent, all 16 partitions, and the SAME 23
//                                       auth/storage/realtime relations a `create policy`
//                                       freezes. A DROP TRIGGER stops sign-in exactly the way
//                                       a policy change does. On a plain table: 24 (itself
//                                       plus the 23).
//   · `create trigger`                — SHARE ROW EXCLUSIVE on the parent and every partition
//                                       (17 on `custom.record`), and NOTHING from the supautils
//                                       set. It stops no reader and no sign-in; it stops every
//                                       WRITER to the record store.
//   · `alter table … enable/disable`  — SHARE ROW EXCLUSIVE, same fan-out (17), no supautils
//                                       set. That is PostgreSQL 15's lowered lock, and it
//                                       surprised this lane, which expected ACCESS EXCLUSIVE.
//   · `create or replace function`    — takes neither: no ACCESS EXCLUSIVE anywhere and no lock
//                                       on the table at all. Replacing a trigger function's
//                                       BODY is free; attaching or detaching it is not.
//
// THE FAN-OUT IS POSTGRESQL'S, NOT OURS, AND NEITHER IS THE 23. A scratch hash-partitioned
// table with four partitions that this campaign never touched behaves identically — 5 own
// relations where `custom.record` has 17 — and a `drop trigger` on an ordinary UNPARTITIONED
// scratch table still drags in all 23. So the supautils hook is not policy-specific: it fires
// on DDL, and the partition count is simply the multiplier on top of it. `history.row_versions`
// has 29 partitions.
//
// So: a file that issues trigger DDL on a partitioned parent is WINDOW-CLASS. It says so in its
// own header, and at `--target production` it runs in the 1-4 AM Pacific maintenance window and
// nowhere else. The inverse is window-class too — undoing a trigger is `drop trigger`, which is
// the expensive half — so it carries the same declaration, and a 3 a.m. operator reading the
// abort checklist can see which steps freeze the estate before running them.

/**
 * The partitioned parents on this estate, censused on the dev clone 2026-09-22 (`relkind='p'`).
 * `realtime.messages` is Supabase's and is not ours to carry trigger DDL for; the two that are
 * ours are here with their partition counts, which ARE the freeze multiplier.
 */
export const PARTITIONED_PARENTS: Readonly<Record<string, number>> = {
  "custom.record": 16,
  "history.row_versions": 29,
};

/** `custom.record` → `record`. A campaign file that writes the bare name still means this table. */
const PARTITIONED_PARENT_BARE_NAMES: readonly string[] = Object.keys(PARTITIONED_PARENTS).map(
  (t) => t.split(".")[1]!,
);

/** Quotes off, whitespace off, lowercase — `"custom"."record"` and `custom.record` are one table. */
function normalizeTableRef(raw: string): string {
  return raw.trim().replace(/"/g, "").toLowerCase();
}

/**
 * Is this table reference one of the partitioned parents? A schema-qualified name must match
 * exactly; a BARE name matches on the table name alone, on purpose and in the safe direction —
 * a false positive costs a file one header line and a maintenance window, a false negative
 * costs the estate a frozen sign-in at midday.
 */
export function isPartitionedParentRef(rawRef: string): string | null {
  const ref = normalizeTableRef(rawRef);
  if (ref in PARTITIONED_PARENTS) return ref;
  if (!ref.includes(".") && PARTITIONED_PARENT_BARE_NAMES.includes(ref)) {
    return Object.keys(PARTITIONED_PARENTS).find((t) => t.endsWith(`.${ref}`))!;
  }
  return null;
}

const TABLE_REF = `((?:"[^"]+"|[a-z0-9_]+)(?:\\s*\\.\\s*(?:"[^"]+"|[a-z0-9_]+))?)`;

/**
 * Every trigger-DDL site in ONE piece of SQL text, as [why, table] pairs. It is run over a
 * top-level statement AND over the body of a `DO`/`CALL`/`SELECT` that issues DDL dynamically,
 * because that statement takes the locks when it runs.
 */
function triggerDdlSitesIn(text: string): Array<{ why: string; table: string; mode: TriggerLockMode }> {
  const out: Array<{ why: string; table: string; mode: TriggerLockMode }> = [];
  const push = (why: string, table: string, mode: TriggerLockMode) => out.push({ why, table, mode });
  for (const m of text.matchAll(
    new RegExp(`\\bcreate\\s+(?:or\\s+replace\\s+)?(?:constraint\\s+)?trigger\\b[\\s\\S]*?\\bon\\s+${TABLE_REF}`, "gi"),
  )) push("CREATE TRIGGER", m[1]!, "SHARE ROW EXCLUSIVE");
  for (const m of text.matchAll(
    new RegExp(`\\bdrop\\s+trigger\\b(?:\\s+if\\s+exists)?\\s+(?:"[^"]+"|[a-z0-9_]+)\\s+on\\s+${TABLE_REF}`, "gi"),
  )) push("DROP TRIGGER", m[1]!, "ACCESS EXCLUSIVE");
  for (const m of text.matchAll(
    new RegExp(`\\balter\\s+table\\b(?:\\s+if\\s+exists)?(?:\\s+only)?\\s+${TABLE_REF}[\\s\\S]{0,200}?\\b(enable|disable)\\s+(?:always\\s+|replica\\s+)?trigger\\b`, "gi"),
  )) push(`ALTER TABLE … ${m[2]!.toUpperCase()} TRIGGER`, m[1]!, "SHARE ROW EXCLUSIVE");
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE MEASURED DDL LOCK FOOTPRINT (lane DDL-LOCK-CENSUS, 2026-09-22)
// ─────────────────────────────────────────────────────────────────────────────
// POLICY-LOCK judged by the word "policy". TRIGGER-LOCK judged by the words "drop trigger". Both
// were right about the statements they had measured and silent about the twenty they had not, so
// this runner's window rule was a list of NAMES — and a name is a guess about a lock.
//
// So the rule now reads a MEASUREMENT. `ddl-lock-footprint.json`, beside this file, is the census:
// every DDL class a campaign file can carry, run on the dev clone inside its own
// `begin … rollback` against a COMMITTED scratch estate (one plain table, one four-partition hash
// parent), with the locks read from the measuring backend's own `pg_locks` and counted only on
// relations that existed before the probe. Two runs; identical on strongest lock, hook membership
// and ACCESS EXCLUSIVE count.
//
// WHAT THE CENSUS CORRECTED. TRIGGER-LOCK wrote that Supabase's `supautils.policy_grants` hook
// "fires on DDL" generally. It does not. Measured, it fires on CREATE/ALTER/DROP POLICY and on
// DROP TRIGGER, and on NOTHING ELSE in the census — `drop table`, `alter column … type`,
// `truncate` and `drop index` all take ACCESS EXCLUSIVE with zero hook relations. The hook is
// narrower than feared; ACCESS EXCLUSIVE is far more widespread than the old name list knew.
//
// THE RULE, and it is decided by the footprint, never by the statement's name:
//   A statement is WINDOW-CLASS at `--target production` when its measured footprint either
//   (a) includes the hook set — sign-in, token refresh, file reads and realtime stop until
//       COMMIT — or
//   (b) holds ACCESS EXCLUSIVE on a partitioned parent (`custom.record`, 16 partitions;
//       `history.row_versions`, 29) — every reader AND every writer of the store waits.
// The old name-based trigger rule stays as the FLOOR: whatever the JSON says, trigger DDL on a
// partitioned parent is still window-class, so a mis-measured or truncated census can only ever
// make this rule stricter than it was on 2026-09-22, never weaker.

export type DdlShape = "plainTable" | "partitionedParent" | "noTable";

export interface DdlFootprintShape {
  readonly strongest: string;
  readonly ownRelations: number;
  readonly hookRelations: number;
  readonly totalAccessExclusive: number;
  readonly ms: number | null;
  readonly windowClass: boolean;
  readonly because?: string;
  readonly note?: string;
}

export interface DdlFootprintClass {
  readonly id: string;
  readonly statement: string;
  readonly plainTable?: DdlFootprintShape;
  readonly partitionedParent?: DdlFootprintShape;
  readonly noTable?: DdlFootprintShape;
}

export interface DdlFootprint {
  readonly schemaVersion: number;
  readonly measuredOn: string;
  readonly hookSetSize: number;
  readonly partitionedParents: Readonly<Record<string, number>>;
  readonly classes: readonly DdlFootprintClass[];
}

/**
 * Where the census sits, WITHOUT naming `import.meta`.
 *
 * 🚨 THIS IS NOT A STYLE CHOICE (lane CI-FIX-3, 2026-09-22). The census loader shipped as
 * `new URL("./ddl-lock-footprint.json", import.meta.url).pathname`, and `import.meta` is a
 * SYNTAX-LEVEL ESM marker: one occurrence anywhere in this file makes the whole module
 * ESM-only, so jest could no longer require it and THREE suites stopped running altogether —
 * `migration-target-refusals`, `gate-corpus-refuses-production-identity` and
 * `rehearse-comment-stripper-shared`, which between them are the only automated proof that
 * the migration judge refuses what it is supposed to refuse. They did not fail an assertion;
 * they failed to LOAD, which is the worse shape, because a suite that cannot start asserts
 * nothing and says so only in a runner nobody reads. Guarding the reference behind a branch
 * would not have helped: the parser sees the token whether or not the branch runs.
 *
 * `__dirname` is not the answer either — it is CommonJS-only, and this module is executed as
 * real ESM by tsx in every runner. So the anchor is the ONE thing both worlds agree on: the
 * package root, which is where `pnpm <script>` and jest's rootDir both put the working
 * directory, walked upward so a script invoked from a subdirectory still finds it.
 *
 * An unfound file is still a REFUSAL — see `loadDdlFootprint`. Nothing here falls back to a
 * guess; this only decides WHERE to look.
 */
function ddlFootprintCandidates(): string[] {
  const out: string[] = [];
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    out.push(resolve(dir, "scripts", "lib", "ddl-lock-footprint.json"));
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return out;
}

/** The checked-in census. An unreadable or unparseable file is a REFUSAL, never a fallback. */
export function loadDdlFootprint(path?: string): DdlFootprint {
  const candidates = path ? [path] : ddlFootprintCandidates();
  const file = candidates.find((c) => existsSync(c)) ?? candidates[0]!;
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (e) {
    fail([
      `ddl-lock-footprint.json is unreadable at ${file}: ${String(e)}`,
      `  The window-class rule is decided by that measurement. Without it this runner cannot`,
      `  say which statements freeze the estate, and it refuses rather than guessing by name.`,
    ]);
  }
  const parsed = JSON.parse(raw!) as DdlFootprint;
  if (!parsed.classes?.length || !parsed.partitionedParents) {
    fail([`ddl-lock-footprint.json at ${file} has no classes or no partitioned parents.`]);
  }
  return parsed;
}

export const DDL_LOCK_FOOTPRINT: DdlFootprint = loadDdlFootprint();

/** One DDL site found in a statement: which measured class it is, and what it points at. */
interface DdlSite {
  readonly classId: string;
  /** The table it acts on, raw as written, or null for a class that names no table. */
  readonly table: string | null;
}

const ALTER_TABLE_HEAD = new RegExp(`^alter\\s+table\\b(?:\\s+if\\s+exists)?(?:\\s+only)?\\s+${TABLE_REF}([\\s\\S]*)$`, "i");

/**
 * Every measured DDL class a single top-level statement carries. Detection is deliberately
 * GENEROUS on the table reference (a bare name matches a partitioned parent) and deliberately
 * CONSERVATIVE on the class: an unrecognised statement contributes nothing, which is why the
 * name-based trigger floor stays in place beneath it.
 */
export function ddlSitesIn(stmt: string): DdlSite[] {
  const out: DdlSite[] = [];
  const t = stmt.trim();
  const push = (classId: string, table: string | null) => out.push({ classId, table });

  const alter = t.match(ALTER_TABLE_HEAD);
  if (alter) {
    const table = alter[1]!;
    const body = alter[2]!;
    if (/\badd\s+(column\b|(?!constraint\b)(?:if\s+not\s+exists\s+)?"?[a-z0-9_]+"?\s)/i.test(body)) push("add_column", table);
    if (/\bdrop\s+(column\b|"?[a-z0-9_]+"?\s*(,|;|$))/i.test(body) && !/\bdrop\s+constraint\b/i.test(body)) push("drop_column", table);
    if (/\balter\s+(column\s+)?"?[a-z0-9_]+"?\s+(set\s+data\s+)?type\b/i.test(body)) push("alter_column_type", table);
    if (/\badd\s+constraint\b[\s\S]*?\bforeign\s+key\b/i.test(body) || /\badd\s+foreign\s+key\b/i.test(body)) push("add_constraint_fk", table);
    else if (/\badd\s+(constraint\b[\s\S]{0,120}?)?\b(unique|primary\s+key)\b/i.test(body)) push("add_constraint_unique", table);
    else if (/\badd\s+(constraint\b[\s\S]{0,120}?)?\bcheck\b/i.test(body)) push("add_constraint_check", table);
    if (/\bdrop\s+constraint\b/i.test(body)) push("drop_constraint", table);
    if (/\b(enable|disable)\s+(always\s+|replica\s+)?trigger\b/i.test(body)) push("alter_trigger_enable_disable", table);
    if (/\benable\s+row\s+level\s+security\b/i.test(body)) push("enable_rls", table);
    if (/\bforce\s+row\s+level\s+security\b/i.test(body)) push("force_rls", table);
    return out;
  }

  let m: RegExpMatchArray | null;
  if ((m = t.match(new RegExp(`^truncate\\b(?:\\s+table)?(?:\\s+only)?\\s+${TABLE_REF}`, "i")))) push("truncate", m[1]!);
  else if ((m = t.match(new RegExp(`^drop\\s+table\\b(?:\\s+if\\s+exists)?\\s+${TABLE_REF}`, "i")))) push("drop_table", m[1]!);
  else if (/^create\s+(unlogged\s+|global\s+|local\s+|temp\w*\s+)*table\b/i.test(t)) push("create_table", null);
  else if ((m = t.match(new RegExp(`^create\\s+(?:unique\\s+)?index\\s+concurrently\\b[\\s\\S]*?\\bon\\s+(?:only\\s+)?${TABLE_REF}`, "i")))) push("create_index_concurrently", m[1]!);
  else if ((m = t.match(new RegExp(`^create\\s+(?:unique\\s+)?index\\b[\\s\\S]*?\\bon\\s+(?:only\\s+)?${TABLE_REF}`, "i")))) push("create_index", m[1]!);
  else if (/^drop\s+index\s+concurrently\b/i.test(t)) push("drop_index_concurrently", null);
  else if (/^drop\s+index\b/i.test(t)) push("drop_index", null);
  else if (/^alter\s+index\b[\s\S]*?\brename\s+to\b/i.test(t)) push("rename_index", null);
  else if ((m = t.match(new RegExp(`^create\\s+policy\\b[\\s\\S]*?\\bon\\s+${TABLE_REF}`, "i")))) push("create_policy", m[1]!);
  else if ((m = t.match(new RegExp(`^alter\\s+policy\\b[\\s\\S]*?\\bon\\s+${TABLE_REF}`, "i")))) push("alter_policy", m[1]!);
  else if ((m = t.match(new RegExp(`^drop\\s+policy\\b[\\s\\S]*?\\bon\\s+${TABLE_REF}`, "i")))) push("drop_policy", m[1]!);
  else if ((m = t.match(new RegExp(`^create\\s+(?:or\\s+replace\\s+)?(?:constraint\\s+)?trigger\\b[\\s\\S]*?\\bon\\s+${TABLE_REF}`, "i")))) push("create_trigger", m[1]!);
  else if ((m = t.match(new RegExp(`^drop\\s+trigger\\b(?:\\s+if\\s+exists)?\\s+(?:"[^"]+"|[a-z0-9_]+)\\s+on\\s+${TABLE_REF}`, "i")))) push("drop_trigger", m[1]!);
  else if (/^drop\s+function\b/i.test(t)) push("drop_function", null);
  else if (/^create\s+(or\s+replace\s+)?function\b/i.test(t)) push("create_or_replace_function", null);
  else if ((m = t.match(new RegExp(`^grant\\b[\\s\\S]*?\\bon\\s+(?:table\\s+)?${TABLE_REF}`, "i")))) push("grant", m[1]!);
  else if ((m = t.match(new RegExp(`^revoke\\b[\\s\\S]*?\\bon\\s+(?:table\\s+)?${TABLE_REF}`, "i")))) push("revoke", m[1]!);
  else if (/^create\s+(or\s+replace\s+)?(recursive\s+)?view\b/i.test(t)) push("create_view", null);
  else if (/^drop\s+view\b/i.test(t)) push("drop_view", null);
  else if (/^comment\s+on\b/i.test(t)) push("comment_on", null);
  return out;
}

/** The measured footprint of one class in one shape, or undefined when the census is silent. */
export function ddlFootprintOf(
  classId: string,
  shape: DdlShape,
  footprint: DdlFootprint = DDL_LOCK_FOOTPRINT,
): DdlFootprintShape | undefined {
  const c = footprint.classes.find((x) => x.id === classId);
  if (!c) return undefined;
  return c[shape] ?? (shape === "partitionedParent" ? c.plainTable : undefined);
}

/**
 * The two lock modes trigger DDL actually takes, measured on the dev clone 2026-09-22.
 * ACCESS EXCLUSIVE additionally drags in the 23-relation supautils set, so it stops sign-in;
 * SHARE ROW EXCLUSIVE stops every WRITER and no reader. Both fan out across every partition.
 */
export type TriggerLockMode = "ACCESS EXCLUSIVE" | "SHARE ROW EXCLUSIVE";

export interface WindowClassSite {
  readonly why: string;
  /** What this statement kind actually takes, per the measurement, not per belief. */
  readonly mode: string;
  /** True when this statement also freezes the supautils auth/storage/realtime set. */
  readonly freezesSignIn: boolean;
  /** The table, canonically qualified when it is one of the partitioned parents. */
  readonly table: string;
  /** How many partitions one statement reaches through it; 0 for an ordinary table. */
  readonly partitions: number;
  /** Which measured shape decided this — or `nameRule` for the trigger floor. */
  readonly shape: DdlShape | "nameRule";
  /** The census class id, or the name-rule label. */
  readonly classId: string;
  /** The measured sentence saying WHY this one is window-class. */
  readonly because: string;
  readonly stmt: string;
}

/**
 * The window-class sites in a file's RAW bytes, or an empty array. A `CREATE OR REPLACE
 * FUNCTION` whose BODY contains trigger DDL is NOT a site — replacing a body takes no lock,
 * running the attachment does — exactly the distinction `policyStatementReasonOf` draws.
 */
export function windowClassVerdict(
  rawSql: string,
  footprint: DdlFootprint = DDL_LOCK_FOOTPRINT,
): WindowClassSite[] {
  const sites: WindowClassSite[] = [];
  const seen = new Set<string>();
  const add = (site: WindowClassSite) => {
    const key = `${site.table}|${site.stmt}`;
    if (seen.has(key)) return;
    seen.add(key);
    sites.push(site);
  };

  for (const stmt of topLevelStatements(stripCommentsQuoteAware(rawSql))) {
    const t = stmt.trim();
    // A `CREATE OR REPLACE FUNCTION` whose BODY contains DDL is not a site — replacing a body
    // takes no lock (measured: nothing at all on any table), running the attachment does.
    if (/^create\s+(or\s+replace\s+)?function\b/i.test(t) || /^create\s+(or\s+replace\s+)?procedure\b/i.test(t)) continue;

    // ── THE MEASUREMENT DECIDES ────────────────────────────────────────────
    for (const d of ddlSitesIn(t)) {
      const parent = d.table ? isPartitionedParentRef(d.table) : null;
      const shape: DdlShape = parent ? "partitionedParent" : d.table ? "plainTable" : "noTable";
      const fp = ddlFootprintOf(d.classId, shape, footprint);
      if (!fp || !fp.windowClass) continue;
      const cls = footprint.classes.find((x) => x.id === d.classId)!;
      add({
        why: cls.statement.toUpperCase(),
        mode: fp.strongest,
        freezesSignIn: fp.hookRelations > 0,
        table: parent ?? normalizeTableRef(d.table ?? "?"),
        partitions: parent ? footprint.partitionedParents[parent]! : 0,
        shape,
        classId: d.classId,
        because: fp.because ?? "measured window-class",
        stmt: t.slice(0, 160),
      });
    }

    // ── THE NAME RULE STAYS AS THE FLOOR ───────────────────────────────────
    // TRIGGER-LOCK's rule, 2026-09-22: trigger DDL on a partitioned parent is window-class
    // whatever a census says. A truncated, stale or mis-measured footprint can therefore only
    // ever make this verdict STRICTER than it was that day, never weaker.
    for (const site of triggerDdlSitesIn(t)) {
      const parent = isPartitionedParentRef(site.table);
      if (!parent) continue;
      add({
        why: site.why,
        mode: site.mode,
        freezesSignIn: site.mode === "ACCESS EXCLUSIVE",
        table: parent,
        partitions: PARTITIONED_PARENTS[parent]!,
        shape: "nameRule",
        classId: "trigger-ddl-name-rule",
        because:
          site.mode === "ACCESS EXCLUSIVE"
            ? "trigger DDL on a partitioned parent, and this kind also freezes the supautils set"
            : "trigger DDL on a partitioned parent: SHARE ROW EXCLUSIVE on the parent and every partition, so every WRITER to the store waits until COMMIT",
        stmt: t.slice(0, 160),
      });
    }
  }
  return sites;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ONE VERIFIED EXEMPTION: `-- policy-ddl: one-table` (chair ruling, 2026-09-22)
// ─────────────────────────────────────────────────────────────────────────────
// The census made every policy migration window-class, because policy DDL freezes the 23-relation
// supautils set exactly as a `drop trigger` does. POLICY-LOCK had measured the other half: with
// `iam.apply_rls` reordered, ONE table's policy regeneration is 89 ms, and a 89 ms freeze at
// midday is affordable. Both are true, so the allowance survives — as an EXEMPTION THE RUNNER
// VERIFIES, never as a switch a file can assert.
//
// A file may declare `-- policy-ddl: one-table` in its header. At `--target production` outside
// the window the runner honours it ONLY when it can prove BOTH halves itself:
//
//   (a) every policy statement in the file names the SAME ONE table, and the file is policy-only
//       (POLICY-LOCK's existing rule: policy, grant, comment, `set local` and an atomic
//       `platform.entity_types` declaration, nothing else); and
//   (b) a `pnpm db:rehearse --target clone` measure pass OF THESE EXACT BYTES recorded
//       first-policy-DDL → end-of-transaction under 200 ms, and the runner finds that record
//       HASH-BOUND to the file — the way the night jobs' inverse gate is bound to its inverse.
//       One byte changes and the measurement is gone, because it measured a different file.
//
// Anything missing is a REFUSAL that NAMES the missing proof. A declaration alone proves nothing;
// a file that says "one table" and touches two is refused by counting, not by trust.

/** The measured ceiling. A freeze under this is affordable at midday; over it waits for 1 a.m. */
export const POLICY_DDL_ONE_TABLE_MAX_MS = 200;

const HEADER_POLICY_DDL_ONE_TABLE_RE = /^\s*--\s*policy-ddl:\s*one-table\s*$/i;

/** Does the file CLAIM the exemption? Claiming it is not having it. */
export function policyDdlOneTableDeclared(rawSql: string): boolean {
  return rawSql.split("\n", 40).some((line) => HEADER_POLICY_DDL_ONE_TABLE_RE.test(line));
}

/** What a rehearsal wrote down about one exact file. `target` is always the clone. */
export interface PolicyDdlMeasurement {
  readonly file: string;
  readonly sha256: string;
  readonly target: string;
  /** First policy statement → end of transaction, in ms. That span IS the sign-in freeze. */
  readonly firstPolicyDdlToEndMs: number;
  readonly tables: readonly string[];
  readonly measuredAt: string;
}

/** `migrations/campaign/x.sql` + sha → `migrations/measurements/<sha>.json`. */
export function policyDdlMeasurementPath(migrationFilePath: string, sha: string): string {
  return resolve(dirname(resolve(migrationFilePath)), "..", "measurements", `${sha}.json`);
}

export function sha256OfBytes(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Read the record for these exact bytes, or null. A malformed record is null, never a pass. */
export function loadPolicyDdlMeasurement(
  migrationFilePath: string,
  sha: string,
): PolicyDdlMeasurement | null {
  const path = policyDdlMeasurementPath(migrationFilePath, sha);
  if (!existsSync(path)) return null;
  try {
    const m = JSON.parse(readFileSync(path, "utf8")) as PolicyDdlMeasurement;
    if (m.sha256 !== sha) return null;
    if (typeof m.firstPolicyDdlToEndMs !== "number") return null;
    return m;
  } catch {
    return null;
  }
}

/** The table one policy statement names, or null when it names none statically. */
export function policyStatementTableOf(stmt: string): string | null {
  const m = stmt
    .trim()
    .match(new RegExp(`^(?:create|alter|drop)\\s+policy\\b[\\s\\S]*?\\bon\\s+${TABLE_REF}`, "i"));
  return m ? normalizeTableRef(m[1]!) : null;
}

export interface PolicyDdlOneTableVerdict {
  /** True only when the runner PROVED both halves. */
  readonly exempt: boolean;
  /** The sentence naming the missing proof. Null when the file never claimed the exemption. */
  readonly refusal: string | null;
  readonly table?: string;
  readonly measuredMs?: number;
}

/**
 * The verified exemption. `load` is injectable so the RED-then-GREEN self-test can hand it a
 * measurement that does not exist on disk — the same trick that makes the footprint self-test
 * honest.
 */
export function policyDdlOneTableVerdict(
  rawSql: string,
  migrationFilePath: string,
  sites: readonly WindowClassSite[],
  load: (file: string, sha: string) => PolicyDdlMeasurement | null = loadPolicyDdlMeasurement,
): PolicyDdlOneTableVerdict {
  if (!policyDdlOneTableDeclared(rawSql)) return { exempt: false, refusal: null };

  const POLICY_CLASSES = new Set(["create_policy", "alter_policy", "drop_policy"]);
  const others = sites.filter((x) => !POLICY_CLASSES.has(x.classId));
  if (others.length > 0) {
    return {
      exempt: false,
      refusal:
        `it declares \`-- policy-ddl: one-table\`, but the window-class DDL in it is not all ` +
        `policy DDL — ${others.map((x) => `${x.why} on ${x.table}`).join(", ")}. The exemption ` +
        `covers a single table's policy regeneration and nothing else.`,
    };
  }

  const verdict = policyOnlyVerdict(rawSql);
  if (verdict.policy.length === 0) {
    return {
      exempt: false,
      refusal: `it declares \`-- policy-ddl: one-table\` and contains no policy DDL at all.`,
    };
  }
  if (verdict.strangers.length > 0) {
    return {
      exempt: false,
      refusal:
        `it declares \`-- policy-ddl: one-table\`, but it is not policy-only — ` +
        `${verdict.strangers.length} statement(s) ride with the policy DDL, starting with ` +
        `"${verdict.strangers[0]!.slice(0, 80)}". The length of the file is the length of the freeze.`,
    };
  }

  const tables = new Set<string>();
  for (const p of verdict.policy) {
    const t = policyStatementTableOf(p.stmt);
    if (!t) {
      return {
        exempt: false,
        refusal:
          `it declares \`-- policy-ddl: one-table\`, but "${p.why}" names no table this runner ` +
          `can read before it connects ("${p.stmt.slice(0, 80)}"). A regenerator call can touch ` +
          `any number of tables, so the exemption cannot be proved on the bytes.`,
      };
    }
    tables.add(t);
  }
  if (tables.size !== 1) {
    return {
      exempt: false,
      refusal:
        `it declares \`-- policy-ddl: one-table\` and names ${tables.size}: ` +
        `${[...tables].sort().join(", ")}. Each table's policies go in their own file, because ` +
        `one transaction is one freeze.`,
    };
  }
  const table = [...tables][0]!;

  const sha = sha256OfBytes(rawSql);
  const m = load(migrationFilePath, sha);
  if (!m) {
    return {
      exempt: false,
      refusal:
        `it declares \`-- policy-ddl: one-table\`, but there is NO measurement for these exact ` +
        `bytes (sha256 ${sha.slice(0, 12)}…). Run \`pnpm db:rehearse <file> --target clone\`, ` +
        `which writes ${policyDdlMeasurementPath(migrationFilePath, sha)}. A measurement of an ` +
        `earlier version of this file is a measurement of a different file.`,
    };
  }
  if (m.target !== "clone") {
    return {
      exempt: false,
      refusal:
        `its measurement was taken against "${m.target}", not the dev clone. The only target ` +
        `that may execute-and-roll-back a policy change for measurement is the disposable copy.`,
    };
  }
  if (m.firstPolicyDdlToEndMs >= POLICY_DDL_ONE_TABLE_MAX_MS) {
    return {
      exempt: false,
      refusal:
        `its measured freeze is ${m.firstPolicyDdlToEndMs} ms — first policy statement to end of ` +
        `transaction — and the exemption stops at ${POLICY_DDL_ONE_TABLE_MAX_MS} ms. That is ` +
        `${m.firstPolicyDdlToEndMs} ms in which nobody signs in, refreshes a token, reads a file ` +
        `or receives a realtime message. It waits for the window.`,
    };
  }
  return { exempt: true, refusal: null, table, measuredMs: m.firstPolicyDdlToEndMs };
}

/** The maintenance window, Pacific, as HHMM. Same window every night job in `scripts/night/` uses. */
export const WINDOW_CLASS_OPEN_HHMM = 100;
export const WINDOW_CLASS_CLOSE_HHMM = 400;

/** Local Pacific time as HHMM, from the one clock the runner and the night jobs share. */
export function pacificHHMM(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hh = Number(parts.find((p) => p.type === "hour")!.value);
  const mm = Number(parts.find((p) => p.type === "minute")!.value);
  return hh * 100 + mm;
}

export function isInsideWindow(now: Date = new Date()): boolean {
  const hhmm = pacificHHMM(now);
  return hhmm >= WINDOW_CLASS_OPEN_HHMM && hhmm <= WINDOW_CLASS_CLOSE_HHMM;
}

const HEADER_WINDOW_CLASS_RE = /^\s*--\s*window-class:\s*(.+)$/i;

/** The `-- window-class: <why>` a window-class file declares, or null. Read from the header. */
export function windowClassDeclaration(rawSql: string): string | null {
  for (const line of rawSql.split("\n", 40)) {
    const m = line.match(HEADER_WINDOW_CLASS_RE);
    if (m && m[1]!.trim().length >= 12) return m[1]!.trim();
  }
  return null;
}

/**
 * 🚨 THE GRANDFATHER LIST, AND IT NEVER GROWS. These campaign files were written before the
 * rule existed and are ledgered history; their bytes are frozen and rewriting them is not a
 * thing this campaign does (BUILD-BOOK rule: an already-ledgered file is never re-judged, and
 * a NEW migration is the one remedy). The rule binds every file written from 2026-09-22.
 * Census: lane POLICY-LOCK, 2026-09-22, over all 870 files in `migrations/campaign/` — 203
 * contain policy DDL, and these 28 are the ones that also carry other work.
 * ADDING A NAME HERE IS NOT A FIX. Split the file.
 */
export const POLICY_MIXED_GRANDFATHERED: readonly string[] = [
  "deadkeys_feature_knob_has_no_signed_out_reader.sql",
  "doorsonly3_batch_a_three_doors_for_three_tables.sql",
  "doorsonly4_a_table_whose_doors_are_not_built_says_so.sql",
  "doorsonly4_the_generator_stops_emitting_client_writes.sql",
  "doorsonly5_categories_gets_its_doors.sql",
  "doorsonly5_rulebook_gets_its_doors.sql",
  "doorsonly5_rulebook_leaves_the_pending_register.sql",
  "doorsonly5_saved_view_gets_its_doors.sql",
  "doorsonly5_saved_view_leaves_the_pending_register.sql",
  "fix7b_a_list_of_people_is_never_platform_content.sql",
  "mergehist_a_compound_operation_signs_its_revision.sql",
  "open_census_a_closed_schema_closes_itself.sql",
  "orgarch_an_organization_is_archived_never_deleted.sql",
  "realtime_INVERSE.sql",
  "realtime_a_topic_is_admitted_by_its_owning_schema.sql",
  "rls_reference_convert_catalogues.sql",
  "rls_reference_variant.sql",
  "storerel_a_carrying_link_has_a_door.sql",
  "storerel_pruning_can_be_asked_for.sql",
  "storerel_the_merge_answers_a_client.sql",
  "w0_sync2_masterwork_source_and_definer_lint.sql",
  "w0_sync_provisioner_and_shape_guard.sql",
  "w1_org_billing_owner_columns_move_on_main.sql",
  "w1_org_billing_owner_columns_move_to_the_organization.sql",
  "w1_reg_virtual_tokens_and_the_partial_index.sql",
  "w3_hist_retention_and_the_floor.sql",
  "w3_hist_the_one_store.sql",
  "w3_mig_the_ten_verbs.sql",
] as const;

/**
 * 🚨 THE WINDOW-CLASS GRANDFATHER LIST. It was closed once and REOPENED once, by the census
 * that replaced the name rule with a measurement — and it is closed again.
 *
 *   · Lane TRIGGER-LOCK, 2026-09-22: 58 files (33 campaign, 25 inverse) carrying trigger DDL on
 *     a partitioned parent.
 *   · Lane DDL-LOCK-CENSUS, the same day: once the verdict read the MEASURED footprint instead
 *     of the statement's name, 291 more files were window-class and had always been — 286 of
 *     them not yet named here. Almost all are policy DDL (158 `drop policy`, 149 `create policy`,
 *     2 `alter policy`), which freezes the 23-relation supautils set exactly as a `drop trigger`
 *     does; the rest are `add column`, `add constraint`, `drop constraint` and `enable rls` on a
 *     partitioned parent, which the old rule could not see at all.
 *
 * 344 names, and their bytes are ledgered history: this campaign does not rewrite an
 * applied file. The rule binds every file written from 2026-09-22 onward.
 * ADDING A NAME HERE IS NOT A FIX. Declare `-- window-class: <why>` and apply it in the window.
 */
export const WINDOW_CLASS_GRANDFATHERED: readonly string[] = [
  "apprvtail_a_field_row_is_a_field.sql",
  "apprvtail_a_field_row_is_a_field_down.sql",
  "checklists_a_checklist_is_a_template_of_work.sql",
  "checklists_a_checklist_is_a_template_of_work_down.sql",
  "deadkeys_feature_knob_has_no_signed_out_reader.inverse.sql",
  "deadkeys_feature_knob_has_no_signed_out_reader.sql",
  "doorfix_a_field_type_change_converts_or_retires.sql",
  "doorfix_a_field_type_change_converts_or_retires_down.sql",
  "doorsonly2_iam_access_requests_is_never_client_written.inverse.sql",
  "doorsonly2_iam_access_requests_is_never_client_written.sql",
  "doorsonly2_iam_permissions_is_never_client_written.inverse.sql",
  "doorsonly2_iam_permissions_is_never_client_written.sql",
  "doorsonly2_platform__bak_assoc_file_processed_document_20260812_is_never_client_written.inverse.sql",
  "doorsonly2_platform__bak_assoc_file_processed_document_20260812_is_never_client_written.sql",
  "doorsonly2_platform__bak_assoc_type_file_processed_document_20260812_is_never_client_written.inverse.sql",
  "doorsonly2_platform__bak_assoc_type_file_processed_document_20260812_is_never_client_written.sql",
  "doorsonly2_platform__base_entity_is_never_client_written.inverse.sql",
  "doorsonly2_platform__base_entity_is_never_client_written.sql",
  "doorsonly2_platform_actor_session_is_never_client_written.inverse.sql",
  "doorsonly2_platform_actor_session_is_never_client_written.sql",
  "doorsonly2_platform_approach_is_never_client_written.inverse.sql",
  "doorsonly2_platform_approach_is_never_client_written.sql",
  "doorsonly2_platform_assist_producer_policy_is_never_client_written.inverse.sql",
  "doorsonly2_platform_assist_producer_policy_is_never_client_written.sql",
  "doorsonly2_platform_assists_is_never_client_written.inverse.sql",
  "doorsonly2_platform_assists_is_never_client_written.sql",
  "doorsonly2_platform_association_types_is_never_client_written.inverse.sql",
  "doorsonly2_platform_association_types_is_never_client_written.sql",
  "doorsonly2_platform_associations_is_never_client_written.inverse.sql",
  "doorsonly2_platform_associations_is_never_client_written.sql",
  "doorsonly2_platform_assurance_level_is_never_client_written.inverse.sql",
  "doorsonly2_platform_assurance_level_is_never_client_written.sql",
  "doorsonly2_platform_change_type_default_is_never_client_written.inverse.sql",
  "doorsonly2_platform_change_type_default_is_never_client_written.sql",
  "doorsonly2_platform_comments_is_never_client_written.inverse.sql",
  "doorsonly2_platform_comments_is_never_client_written.sql",
  "doorsonly2_platform_custom_entity_definition_is_never_client_written.inverse.sql",
  "doorsonly2_platform_custom_entity_definition_is_never_client_written.sql",
  "doorsonly2_platform_custom_field_definition_is_never_client_written.inverse.sql",
  "doorsonly2_platform_custom_field_definition_is_never_client_written.sql",
  "doorsonly2_platform_custom_field_target_is_never_client_written.inverse.sql",
  "doorsonly2_platform_custom_field_target_is_never_client_written.sql",
  "doorsonly2_platform_custom_record_is_never_client_written.inverse.sql",
  "doorsonly2_platform_custom_record_is_never_client_written.sql",
  "doorsonly2_platform_deprecated_relations_is_never_client_written.inverse.sql",
  "doorsonly2_platform_deprecated_relations_is_never_client_written.sql",
  "doorsonly2_platform_domain_classification_is_never_client_written.inverse.sql",
  "doorsonly2_platform_domain_classification_is_never_client_written.sql",
  "doorsonly2_platform_edge_payload_kind_is_never_client_written.inverse.sql",
  "doorsonly2_platform_edge_payload_kind_is_never_client_written.sql",
  "doorsonly2_platform_entity_relationships_is_never_client_written.inverse.sql",
  "doorsonly2_platform_entity_relationships_is_never_client_written.sql",
  "doorsonly2_platform_entity_types_is_never_client_written.inverse.sql",
  "doorsonly2_platform_entity_types_is_never_client_written.sql",
  "doorsonly2_platform_lifecycle_entity_plan_is_never_client_written.inverse.sql",
  "doorsonly2_platform_lifecycle_entity_plan_is_never_client_written.sql",
  "doorsonly2_platform_lifecycle_reference_map_is_never_client_written.inverse.sql",
  "doorsonly2_platform_lifecycle_reference_map_is_never_client_written.sql",
  "doorsonly2_platform_masterwork_corpus_item_is_never_client_written.inverse.sql",
  "doorsonly2_platform_masterwork_corpus_item_is_never_client_written.sql",
  "doorsonly2_platform_masterwork_source_is_never_client_written.inverse.sql",
  "doorsonly2_platform_masterwork_source_is_never_client_written.sql",
  "doorsonly2_platform_mtx_media_heal_queue_is_never_client_written.inverse.sql",
  "doorsonly2_platform_mtx_media_heal_queue_is_never_client_written.sql",
  "doorsonly2_platform_mtx_public_url_guard_is_never_client_written.inverse.sql",
  "doorsonly2_platform_mtx_public_url_guard_is_never_client_written.sql",
  "doorsonly2_platform_org_change_policy_is_never_client_written.inverse.sql",
  "doorsonly2_platform_org_change_policy_is_never_client_written.sql",
  "doorsonly2_platform_org_module_config_is_never_client_written.inverse.sql",
  "doorsonly2_platform_org_module_config_is_never_client_written.sql",
  "doorsonly2_platform_outcome_event_is_never_client_written.inverse.sql",
  "doorsonly2_platform_outcome_event_is_never_client_written.sql",
  "doorsonly2_platform_output_feedback_is_never_client_written.inverse.sql",
  "doorsonly2_platform_output_feedback_is_never_client_written.sql",
  "doorsonly2_platform_outsider_consumer_is_never_client_written.inverse.sql",
  "doorsonly2_platform_outsider_consumer_is_never_client_written.sql",
  "doorsonly2_platform_purpose_is_never_client_written.inverse.sql",
  "doorsonly2_platform_purpose_is_never_client_written.sql",
  "doorsonly2_platform_reachability_is_never_client_written.inverse.sql",
  "doorsonly2_platform_reachability_is_never_client_written.sql",
  "doorsonly2_platform_reference_categories_is_never_client_written.inverse.sql",
  "doorsonly2_platform_reference_categories_is_never_client_written.sql",
  "doorsonly2_platform_reference_declaration_is_never_client_written.inverse.sql",
  "doorsonly2_platform_reference_declaration_is_never_client_written.sql",
  "doorsonly2_platform_repo_is_never_client_written.inverse.sql",
  "doorsonly2_platform_repo_is_never_client_written.sql",
  "doorsonly2_platform_schemas_is_never_client_written.inverse.sql",
  "doorsonly2_platform_schemas_is_never_client_written.sql",
  "doorsonly2_platform_shareable_resource_registry_is_never_client_written.inverse.sql",
  "doorsonly2_platform_shareable_resource_registry_is_never_client_written.sql",
  "doorsonly2_platform_source_authority_is_never_client_written.inverse.sql",
  "doorsonly2_platform_source_authority_is_never_client_written.sql",
  "doorsonly2_platform_taxonomy_node_is_never_client_written.inverse.sql",
  "doorsonly2_platform_taxonomy_node_is_never_client_written.sql",
  "doorsonly2_platform_user_entity_state_is_never_client_written.inverse.sql",
  "doorsonly2_platform_user_entity_state_is_never_client_written.sql",
  "doorsonly3_iam_organization_preferences_is_never_client_written.inverse.sql",
  "doorsonly3_iam_organization_preferences_is_never_client_written.sql",
  "doorsonly3_iam_organizations_is_never_client_written.inverse.sql",
  "doorsonly3_iam_organizations_is_never_client_written.sql",
  "doorsonly3_platform_egress_device_is_never_client_written.inverse.sql",
  "doorsonly3_platform_egress_device_is_never_client_written.sql",
  "doorsonly3_platform_flexible_data_is_never_client_written.inverse.sql",
  "doorsonly3_platform_flexible_data_is_never_client_written.sql",
  "doorsonly3_platform_guided_checklist_run_is_never_client_written.inverse.sql",
  "doorsonly3_platform_guided_checklist_run_is_never_client_written.sql",
  "doorsonly3_platform_masterwork_run_is_never_client_written.inverse.sql",
  "doorsonly3_platform_masterwork_run_is_never_client_written.sql",
  "doorsonly5_machinery_batch_01_the_for_select_twin.inverse.sql",
  "doorsonly5_machinery_batch_01_the_for_select_twin.sql",
  "doorsonly5_machinery_batch_02_the_for_select_twin.inverse.sql",
  "doorsonly5_machinery_batch_02_the_for_select_twin.sql",
  "doorsonly5_machinery_batch_03_the_for_select_twin.inverse.sql",
  "doorsonly5_machinery_batch_03_the_for_select_twin.sql",
  "doorsonly5_machinery_batch_04_the_for_select_twin.inverse.sql",
  "doorsonly5_machinery_batch_04_the_for_select_twin.sql",
  "doorsonly5_platform_categories_is_never_client_written.inverse.sql",
  "doorsonly5_platform_categories_is_never_client_written.sql",
  "doorsonly5_platform_rulebook_is_never_client_written.inverse.sql",
  "doorsonly5_platform_rulebook_is_never_client_written.sql",
  "doorsonly5_platform_saved_view_is_never_client_written.inverse.sql",
  "doorsonly5_platform_saved_view_is_never_client_written.sql",
  "doorsonly5_the_tail_of_the_write_surface.inverse.sql",
  "doorsonly5_the_tail_of_the_write_surface.sql",
  "doorsonly_iam_industries_is_never_client_written.inverse.sql",
  "doorsonly_iam_industries_is_never_client_written.sql",
  "doorsonly_iam_industry_curators_is_never_client_written.inverse.sql",
  "doorsonly_iam_industry_curators_is_never_client_written.sql",
  "doorsonly_iam_membership_grant_is_never_client_written.inverse.sql",
  "doorsonly_iam_membership_grant_is_never_client_written.sql",
  "doorsonly_iam_memberships_is_never_client_written.inverse.sql",
  "doorsonly_iam_memberships_is_never_client_written.sql",
  "doorsonly_iam_org_industries_is_never_client_written.inverse.sql",
  "doorsonly_iam_org_industries_is_never_client_written.sql",
  "doorsonly_iam_system_orgs_is_never_client_written.inverse.sql",
  "doorsonly_iam_system_orgs_is_never_client_written.sql",
  "doorsonly_iam_system_personal_org_failures_is_never_client_written.inverse.sql",
  "doorsonly_iam_system_personal_org_failures_is_never_client_written.sql",
  "doorsonly_platform_activity_log_is_never_client_written.inverse.sql",
  "doorsonly_platform_activity_log_is_never_client_written.sql",
  "doorsonly_platform_assist_producer_policy_history_is_never_client_written.inverse.sql",
  "doorsonly_platform_assist_producer_policy_history_is_never_client_written.sql",
  "doorsonly_platform_ddl_guard_log_is_never_client_written.inverse.sql",
  "doorsonly_platform_ddl_guard_log_is_never_client_written.sql",
  "doorsonly_platform_entity_grants_is_never_client_written.inverse.sql",
  "doorsonly_platform_entity_grants_is_never_client_written.sql",
  "doorsonly_platform_feature_knob_is_never_client_written.inverse.sql",
  "doorsonly_platform_feature_knob_is_never_client_written.sql",
  "doorsonly_platform_knob_scope_kind_is_never_client_written.inverse.sql",
  "doorsonly_platform_knob_scope_kind_is_never_client_written.sql",
  "doorsonly_platform_knob_write_door_is_never_client_written.inverse.sql",
  "doorsonly_platform_knob_write_door_is_never_client_written.sql",
  "doorsonly_platform_lifecycle_archive_is_never_client_written.inverse.sql",
  "doorsonly_platform_lifecycle_archive_is_never_client_written.sql",
  "doorsonly_platform_lifecycle_archive_row_is_never_client_written.inverse.sql",
  "doorsonly_platform_lifecycle_archive_row_is_never_client_written.sql",
  "doorsonly_platform_lifecycle_audit_is_never_client_written.inverse.sql",
  "doorsonly_platform_lifecycle_audit_is_never_client_written.sql",
  "doorsonly_platform_lifecycle_map_build_is_never_client_written.inverse.sql",
  "doorsonly_platform_lifecycle_map_build_is_never_client_written.sql",
  "doorsonly_platform_lifecycle_run_is_never_client_written.inverse.sql",
  "doorsonly_platform_lifecycle_run_is_never_client_written.sql",
  "doorsonly_platform_route_manifest_is_never_client_written.inverse.sql",
  "doorsonly_platform_route_manifest_is_never_client_written.sql",
  "fieldtruth_a_record_carries_only_declared_fields.sql",
  "fieldtruth_a_table_cannot_claim_a_column_it_never_defined.sql",
  "fieldtruth_a_table_says_where_its_columns_come_from.sql",
  "fieldtruth_the_deferred_guard_comes_off.sql",
  "mergehist_a_compound_operation_signs_its_revision.sql",
  "oldtables_w0_the_two_halves_of_a_relation_can_never_disagree.sql",
  "oldtables_w0_the_two_halves_of_a_relation_can_never_disagree_down.sql",
  "orgarch_an_organization_is_archived_never_deleted.sql",
  "orgarch_an_organization_is_archived_never_deleted_down.sql",
  "pipelines_a_stage_is_a_field_and_its_moves_are_rules.sql",
  "pipelines_a_stage_is_a_field_and_its_moves_are_rules_down.sql",
  "realtime_INVERSE.sql",
  "realtime_a_topic_is_admitted_by_its_owning_schema.sql",
  "seckeys_api_keys_have_exactly_one_door.sql",
  "secsweep2_browser_profile_owner_user_id_is_the_caller.inverse.sql",
  "secsweep2_browser_profile_owner_user_id_is_the_caller.sql",
  "secsweep2_browser_stream_ticket_user_id_is_the_caller.inverse.sql",
  "secsweep2_browser_stream_ticket_user_id_is_the_caller.sql",
  "secsweep2_canvas_canvas_items_user_id_is_the_caller.inverse.sql",
  "secsweep2_canvas_canvas_items_user_id_is_the_caller.sql",
  "secsweep2_communication_contact_submissions_user_id_is_the_caller.inverse.sql",
  "secsweep2_communication_contact_submissions_user_id_is_the_caller.sql",
  "secsweep2_communication_meet_call_invites_caller_user_id.inverse.sql",
  "secsweep2_communication_meet_call_invites_caller_user_id.sql",
  "secsweep2_communication_meet_meetings_host_user_id.inverse.sql",
  "secsweep2_communication_meet_meetings_host_user_id.sql",
  "secsweep2_communication_notification_preference_user_id_is_the_caller.inverse.sql",
  "secsweep2_communication_notification_preference_user_id_is_the_caller.sql",
  "secsweep2_communication_notification_recipient_user_id.inverse.sql",
  "secsweep2_communication_notification_recipient_user_id.sql",
  "secsweep2_communication_sms_consent_user_id_is_the_caller.inverse.sql",
  "secsweep2_communication_sms_consent_user_id_is_the_caller.sql",
  "secsweep2_communication_sms_conversations_user_id_is_the_caller.inverse.sql",
  "secsweep2_communication_sms_conversations_user_id_is_the_caller.sql",
  "secsweep2_communication_sms_notification_preferences_user_id_is_the_caller.inverse.sql",
  "secsweep2_communication_sms_notification_preferences_user_id_is_the_caller.sql",
  "secsweep2_communication_sms_notifications_user_id_is_the_caller.inverse.sql",
  "secsweep2_communication_sms_notifications_user_id_is_the_caller.sql",
  "secsweep2_communication_sms_phone_numbers_user_id_is_the_caller.inverse.sql",
  "secsweep2_communication_sms_phone_numbers_user_id_is_the_caller.sql",
  "secsweep2_docproc_derive_runs_user_id_is_the_caller.inverse.sql",
  "secsweep2_docproc_derive_runs_user_id_is_the_caller.sql",
  "secsweep2_docproc_page_extraction_jobs_owner_id_is_the_caller.inverse.sql",
  "secsweep2_docproc_page_extraction_jobs_owner_id_is_the_caller.sql",
  "secsweep2_docproc_page_extraction_page_runs_user_id_is_the_caller.inverse.sql",
  "secsweep2_docproc_page_extraction_page_runs_user_id_is_the_caller.sql",
  "secsweep2_docproc_processed_documents_owner_id_is_the_caller.inverse.sql",
  "secsweep2_docproc_processed_documents_owner_id_is_the_caller.sql",
  "secsweep2_education_game_room_host_user_id.inverse.sql",
  "secsweep2_education_game_room_host_user_id.sql",
  "secsweep2_hr_access_audit_is_never_client_written.inverse.sql",
  "secsweep2_hr_access_audit_is_never_client_written.sql",
  "secsweep2_hr_candidate_actor_user_id.inverse.sql",
  "secsweep2_hr_candidate_actor_user_id.sql",
  "secsweep2_hr_eeo_response_actor_user_id.inverse.sql",
  "secsweep2_hr_eeo_response_actor_user_id.sql",
  "secsweep2_hr_employee_login_user_id.inverse.sql",
  "secsweep2_hr_employee_login_user_id.sql",
  "secsweep2_hr_reference_check_actor_user_id.inverse.sql",
  "secsweep2_hr_reference_check_actor_user_id.sql",
  "secsweep2_interview_decision_interview_respondent_user_id.inverse.sql",
  "secsweep2_interview_decision_interview_respondent_user_id.sql",
  "secsweep2_legal_wc_claim_user_id_is_the_caller.inverse.sql",
  "secsweep2_legal_wc_claim_user_id_is_the_caller.sql",
  "secsweep2_ops_ops_issue_event_user_id_is_the_caller.inverse.sql",
  "secsweep2_ops_ops_issue_event_user_id_is_the_caller.sql",
  "secsweep2_ops_system_error_user_id_is_the_caller.inverse.sql",
  "secsweep2_ops_system_error_user_id_is_the_caller.sql",
  "secsweep2_ops_system_write_failure_user_id_is_the_caller.inverse.sql",
  "secsweep2_ops_system_write_failure_user_id_is_the_caller.sql",
  "secsweep2_platform_assists_user_id.inverse.sql",
  "secsweep2_platform_assists_user_id.sql",
  "secsweep2_public_app_instances_user_id_is_the_caller.inverse.sql",
  "secsweep2_public_app_instances_user_id_is_the_caller.sql",
  "secsweep2_public_sandbox_instances_user_id_is_the_caller.inverse.sql",
  "secsweep2_public_sandbox_instances_user_id_is_the_caller.sql",
  "secsweep2_rag_context_item_suggestions_user_id_is_the_caller.inverse.sql",
  "secsweep2_rag_context_item_suggestions_user_id_is_the_caller.sql",
  "secsweep2_rag_kg_alerts_user_id_is_the_caller.inverse.sql",
  "secsweep2_rag_kg_alerts_user_id_is_the_caller.sql",
  "secsweep2_rag_kg_sweep_run_user_id_is_the_caller.inverse.sql",
  "secsweep2_rag_kg_sweep_run_user_id_is_the_caller.sql",
  "secsweep2_rag_kg_value_matches_user_id_is_the_caller.inverse.sql",
  "secsweep2_rag_kg_value_matches_user_id_is_the_caller.sql",
  "secsweep2_rag_ner_canonicalizer_shadow_user_id_is_the_caller.inverse.sql",
  "secsweep2_rag_ner_canonicalizer_shadow_user_id_is_the_caller.sql",
  "secsweep2_rag_scope_suggestions_user_id_is_the_caller.inverse.sql",
  "secsweep2_rag_scope_suggestions_user_id_is_the_caller.sql",
  "secsweep2_scheduler_sch_task_user_id_is_the_caller.inverse.sql",
  "secsweep2_scheduler_sch_task_user_id_is_the_caller.sql",
  "secsweep2_three_vault_tables_are_never_client_written.inverse.sql",
  "secsweep2_transcripts_studio_runs_user_id_is_the_caller.inverse.sql",
  "secsweep2_transcripts_studio_runs_user_id_is_the_caller.sql",
  "secsweep2_ui_ui_surface_agent_pref_user_id_is_the_caller.inverse.sql",
  "secsweep2_ui_ui_surface_agent_pref_user_id_is_the_caller.sql",
  "secsweep2_ui_ui_surface_config_user_id_is_the_caller.inverse.sql",
  "secsweep2_ui_ui_surface_config_user_id_is_the_caller.sql",
  "secsweep2_users_invitation_codes_used_by_user_id.inverse.sql",
  "secsweep2_users_invitation_codes_used_by_user_id.sql",
  "secsweep2_users_system_announcements_target_user_id.inverse.sql",
  "secsweep2_users_system_announcements_target_user_id.sql",
  "secsweep2_users_user_email_preferences_user_id_is_the_caller.inverse.sql",
  "secsweep2_users_user_email_preferences_user_id_is_the_caller.sql",
  "secsweep2_users_user_feedback_user_id_is_the_caller.inverse.sql",
  "secsweep2_users_user_feedback_user_id_is_the_caller.sql",
  "secsweep2_users_user_surface_state_user_id_is_the_caller.inverse.sql",
  "secsweep2_users_user_surface_state_user_id_is_the_caller.sql",
  "secsweep2_workbench_heatmap_saves_user_id_is_the_caller.inverse.sql",
  "secsweep2_workbench_heatmap_saves_user_id_is_the_caller.sql",
  "secsweep2_workbench_udt_datasets_user_id_is_the_caller.inverse.sql",
  "secsweep2_workbench_udt_datasets_user_id_is_the_caller.sql",
  "secsweep2_workbench_udt_documents_user_id_is_the_caller.inverse.sql",
  "secsweep2_workbench_udt_documents_user_id_is_the_caller.sql",
  "secsweep2_workbench_udt_structured_lists_user_id_is_the_caller.inverse.sql",
  "secsweep2_workbench_udt_structured_lists_user_id_is_the_caller.sql",
  "secsweep2_workbench_udt_workbooks_user_id_is_the_caller.inverse.sql",
  "secsweep2_workbench_udt_workbooks_user_id_is_the_caller.sql",
  "secsweep_iam_access_audit_is_never_client_written.inverse.sql",
  "secsweep_iam_emergency_door_request_is_never_client_written.inverse.sql",
  "secsweep_iam_org_member_controls_is_never_client_written.inverse.sql",
  "secsweep_platform_action_request_is_never_client_written.inverse.sql",
  "secsweep_platform_retention_policy_is_never_client_written.inverse.sql",
  "secsweep_the_invitation_token_has_exactly_one_door.inverse.sql",
  "secsweep_the_invitation_token_has_exactly_one_door.sql",
  "secsweep_the_share_link_token_has_exactly_one_door.inverse.sql",
  "secsweep_the_share_link_token_has_exactly_one_door.sql",
  "secsweep_the_unsubscribe_token_has_exactly_one_door.inverse.sql",
  "secsweep_the_unsubscribe_token_has_exactly_one_door.sql",
  "storerel_a_relation_edge_names_its_field.sql",
  "storerel_a_relation_edge_names_its_field_down.sql",
  "storet_a_choice_is_a_word_and_unique_means_unique.sql",
  "storet_a_choice_is_a_word_and_unique_means_unique_down.sql",
  "tableowner_the_table_door_names_an_owner.sql",
  "visfix_containment_reaches_the_ladder.inverse.sql",
  "visfix_containment_reaches_the_ladder.sql",
  "w0_sync2_masterwork_source_and_definer_lint.sql",
  "w0_sync_provisioner_and_shape_guard.sql",
  "w1_field_definitions_and_validation.sql",
  "w1_field_definitions_and_validation_down.sql",
  "w1_field_types_the_parity_floor.sql",
  "w1_field_types_the_parity_floor_down.sql",
  "w1_field_types_thirteen_parity_types.sql",
  "w1_index_the_promotion_layer.sql",
  "w1_index_the_promotion_layer_down.sql",
  "w1_org_billing_owner_columns_move_on_main.sql",
  "w1_org_billing_owner_columns_move_on_main_down.sql",
  "w1_org_billing_owner_columns_move_to_the_organization.sql",
  "w1_org_billing_owner_columns_move_to_the_organization_down.sql",
  "w1_rule_apply_membership_and_applicability.sql",
  "w1_rule_apply_the_other_two_uses_down.sql",
  "w1_rule_object_and_uses.sql",
  "w1_rule_object_and_uses_down.sql",
  "w1_store_custom_record_store.sql",
  "w1_table_table_home_containment.sql",
  "w1_table_table_home_containment_down.sql",
  "w1_v1_fixes_one_door_predicate_down.sql",
  "w1_v1store_organizations_are_hard_walls.sql",
  "w1_v1store_organizations_are_hard_walls_down.sql",
  "w1_v1store_the_soft_delete_door.sql",
  "w1_v1store_the_soft_delete_door_down.sql",
  "w1_val_the_value_envelope.sql",
  "w1_val_the_value_envelope_down.sql",
  "w1_val_the_value_envelope_on_main.sql",
  "w3_hist_down.sql",
  "w3_hist_retention_and_the_floor.sql",
  "w3_hist_the_one_store.sql",
  "w3_hist_two_clocks.sql",
  "w3_mig_the_ten_verbs.sql",
  "w3_work_assignment_templates_and_slots.sql",
  "w3_work_assignment_templates_and_slots_down.sql",
  "w4_door_the_read_door.sql",
  "w4_door_the_read_door_down.sql",
  "w4_io_down.sql",
  "w4_io_the_outbox_and_its_consumer.sql",
  "workdoors_one_approval_queue.sql",
  "workdoors_one_approval_queue_down.sql",
  "writeperf2_the_after_triggers_fire_once_per_statement.sql",
  "writeperf2_the_after_triggers_fire_once_per_statement_down.sql",
  "writeperf3_a_structure_row_empties_the_memo_before_it_lands.sql",
  "writeperf3_a_structure_row_empties_the_memo_before_it_lands_down.sql",
] as const;

/** Every function name a file declares it was written against (`-- based-on:`). */
export function basedOnFunctionNames(rawSql: string): Set<string> {
  const out = new Set<string>();
  for (const m of rawSql.matchAll(/^\s*--\s*based-on:\s*([a-z0-9_."]+)\s*\(/gim)) {
    out.add(m[1]!.replace(/"/g, "").toLowerCase());
  }
  return out;
}

/**
 * The tables an `INSERT` may name inside a production-naming campaign file.
 * Registrations no live code reads are rule 4's third exception; a write into any
 * other table is data movement and is a chair step.
 */
export const REGISTRY_INSERT_TABLES: readonly string[] = [
  "platform.feature_knob",
  "platform.knob_override",
  "platform.knob_rung_lock",
  "platform.entity_types",
  "platform.entity_relationships",
  "platform.client_callable_door",
  "campaign_watch.build_lock",
  "campaign_watch.go_signal_capture",
] as const;

/**
 * The registry table that is a fixture on the branch and a LIVE TOKEN MINT on
 * production, named once so both the allow-list and `JUDGMENT.md` cite the same string.
 */
export const ENTITY_TYPES_TABLE = "platform.entity_types";

// ── THE CUSTOM-DATA INSERT (the campaign's own store lane) ──────────────────
//
// `INSERT INTO custom.<table>` was refused at production by
// "not one of the registry tables", and that refusal was wrong for this ONE class.
// Schema `custom` is created by this campaign, revoked from PUBLIC, anon,
// authenticated and service_role (default privileges included), absent from
// `pgrst.db_schemas`, and held shut by `custom/system_enabled`: a row written there
// is unreachable by every client and is removed by the file's own stored inverse. It
// is additive in the judgement's own sense — and the kernel Table rows are the store
// lane's ONLY positive production proof, so without this shape that lane cannot prove
// it ran at all.
//
// It is bounded, and every bound is checked here:
//   · the target schema is EXACTLY `custom`, written plainly — no quoting, no
//     `customx`, no `custom` as a TABLE name in some other schema;
//   · the file's guard is a `custom/…` knob (plus `-- additive: yes`, which the
//     header rule already demands of anything naming production);
//   · the row's source is `VALUES`/constants or a `SELECT` that reads only `custom.*`
//     — never a SELECT out of a live schema, which would COPY CUSTOMER DATA into a
//     table whose whole safety argument is that it holds nothing yet;
//   · `ON CONFLICT DO NOTHING` is admitted; `ON CONFLICT … DO UPDATE` is an UPDATE
//     wearing an INSERT's clothes and is refused.
// `UPDATE` and `DELETE` on `custom.*` are NOT on the allow-list and stay refused at
// production, exactly as before.

/** The ONE schema whose data rows an additive production file may INSERT. */
export const CUSTOM_DATA_SCHEMA = "custom";

/**
 * The table name when this statement is plainly `INSERT INTO custom.<table>`, else null.
 *
 * 🚨 Read from the statement AS WRITTEN, never from a lowercased, quote-stripped
 * rendering, because that rendering is exactly where the tricks live: `INSERT INTO
 * "custom.record"` is ONE identifier in whatever schema `search_path` picks, and
 * `INSERT INTO "Custom".record` names a DIFFERENT schema than `custom`. Both collapse
 * to `custom.record` once quotes are dropped and case is folded. So a double quote
 * anywhere in the reference means "not plainly custom" and the statement falls through
 * to the ordinary registry refusal.
 */
const CUSTOM_INSERT_TARGET_RE =
  /^insert\s+into\s+(?:only\s+)?custom\.([a-z_][a-z0-9_$]*)(?=[\s(]|$)/i;

export function customDataInsertTargetOf(stmt: string): string | null {
  const m = CUSTOM_INSERT_TARGET_RE.exec(stmt.replace(/\s+/g, " ").trim());
  return m ? m[1]!.toLowerCase() : null;
}

/** Every relation a statement reads (`FROM`/`JOIN`), as written. */
function readRelationsOf(stmt: string): string[] {
  return [...stmt.matchAll(/\b(?:from|join)\s+(?:only\s+)?([a-z0-9_."$]+)/gi)].map((m) => m[1]!);
}

const CUSTOM_RELATION_RE = /^custom\.[a-z_][a-z0-9_$]*$/i;

/**
 * Why this `INSERT INTO custom.<table>` is NOT the bounded custom-data shape — or null
 * when it is, and may land on production.
 */
export function customDataInsertRefusal(
  stmt: string,
  table: string,
  guard: { feature: string; key: string } | null,
): string | null {
  const s = stmt.replace(/\s+/g, " ").trim();
  if (!guard || guard.feature.toLowerCase() !== CUSTOM_DATA_SCHEMA) {
    return (
      `an INSERT into ${CUSTOM_DATA_SCHEMA}.${table} in a file whose \`-- guard:\` is ` +
      `${guard ? `${guard.feature}/${guard.key}` : "(absent)"} — a custom-data INSERT is admitted ` +
      `only under a \`-- guard: ${CUSTOM_DATA_SCHEMA}/<key>\` knob, because the argument that the ` +
      `row is unreachable IS that switch`
    );
  }
  if (/\bon\s+conflict\b/i.test(s) && !/\bon\s+conflict\b[\s\S]*?\bdo\s+nothing\b/i.test(s)) {
    return (
      `an INSERT into ${CUSTOM_DATA_SCHEMA}.${table} whose ON CONFLICT clause is not ` +
      `DO NOTHING — an upsert rewrites rows that are already there, which is an UPDATE`
    );
  }
  if (/\bselect\b/i.test(s)) {
    for (const ref of readRelationsOf(s)) {
      if (!CUSTOM_RELATION_RE.test(ref)) {
        return (
          `an INSERT … SELECT into ${CUSTOM_DATA_SCHEMA}.${table} that reads ${ref} — a ` +
          `custom-data INSERT may read VALUES, constants, or ${CUSTOM_DATA_SCHEMA}.* and nothing ` +
          `else; copying rows out of a live schema moves CUSTOMER DATA into the table whose ` +
          `whole safety argument is that it holds nothing yet`
        );
      }
    }
  }
  return null;
}

/**
 * The custom-data INSERTs a body carries and this judgement ACCEPTED — the runner
 * prints them, exactly as it prints the statements `-- allows: revoke` admitted.
 * Nothing passes silently.
 */
export function customDataInsertsOf(
  strippedSql: string,
  guard: { feature: string; key: string } | null,
): string[] {
  const out: string[] = [];
  for (const stmt of topLevelStatements(strippedSql)) {
    const table = customDataInsertTargetOf(stmt);
    if (table && customDataInsertRefusal(stmt, table, guard) === null) out.push(stmt);
  }
  return out;
}

/** Session GUCs §6b.3 REQUIRES every production file to set explicitly. */
const ALLOWED_SET_GUCS = ["lock_timeout", "statement_timeout", "idle_in_transaction_session_timeout"];

export interface AllowListContext {
  /** `-- allows: revoke <schema>` — containment is proven separately. */
  readonly allowRevokeSchema?: string | null;
  /** function names the file declares with `-- based-on:` (lowercased, unqualified-or-qualified as written). */
  readonly basedOnNames?: ReadonlySet<string>;
  /**
   * WHICH database this judgement is for. One shape is target-dependent and says so
   * out loud: an `INSERT` into `platform.entity_types` is a rehearsal fixture on the
   * branch and a production token mint on production (ATTACK-7 finding 3).
   */
  readonly flagTarget?: Target;
  /**
   * The file's `-- guard:` — the custom-data INSERT shape is admitted only under a
   * `custom/…` knob, so the allow-list has to see it.
   */
  readonly guard?: { feature: string; key: string } | null;
}

/** `{ ok }` or the reason this statement is not one of the enumerated shapes. */
function additiveVerdictOf(stmt: string, ctx: AllowListContext): string | null {
  const s = stmt.replace(/\s+/g, " ").trim();
  const head = s.toLowerCase();

  // — CREATE SCHEMA: creating a namespace grants nobody anything. The GRANT that
  //   would open it is NOT on this list.
  if (/^create\s+schema\b/.test(head)) return null;
  // — CREATE TABLE / CREATE TYPE / CREATE INDEX / CREATE SEQUENCE: new objects.
  if (/^create\s+(?:unlogged\s+)?table\b/.test(head)) return null;
  if (/^create\s+type\b/.test(head)) return null;
  if (/^create\s+(?:unique\s+)?index\b/.test(head)) return null;
  if (/^create\s+sequence\b/.test(head)) return null;
  // — CREATE VIEW: a NEW view only. `OR REPLACE` rewrites a live body.
  if (/^create\s+(?:materialized\s+)?view\b/.test(head)) return null;
  if (/^create\s+or\s+replace\s+(?:materialized\s+)?view\b/.test(head))
    return `CREATE OR REPLACE VIEW rewrites a live view body with no concurrency check`;
  // — a NEW function, or a replacement that DECLARES the body it saw (DD-220).
  const fn = /^create\s+(or\s+replace\s+)?(?:function|procedure)\s+([a-z0-9_."]+)\s*\(/.exec(head);
  if (fn) {
    if (!fn[1]) return null;
    const name = fn[2]!.replace(/"/g, "");
    const declared = ctx.basedOnNames ?? new Set<string>();
    if (declared.has(name) || [...declared].some((d) => d.endsWith(`.${name}`) || name.endsWith(`.${d}`)))
      return null;
    return (
      `CREATE OR REPLACE FUNCTION ${name} replaces a live body and the file declares no ` +
      `\`-- based-on:\` line for it (pnpm db:based-on ${name})`
    );
  }
  // — CREATE TRIGGER: new only. `OR REPLACE TRIGGER` rewrites a live one.
  if (/^create\s+(?:constraint\s+)?trigger\b/.test(head)) return null;
  if (/^create\s+or\s+replace\s+trigger\b/.test(head))
    return `CREATE OR REPLACE TRIGGER rewrites a live trigger`;
  // — CREATE POLICY, and the predicate may not be literally true. Policies are
  //   OR'd: a `USING (true)` policy opens every row of the table it names, and it
  //   is "additive" by every structural reading of the word.
  if (/^create\s+policy\b/.test(head)) {
    if (/\b(?:using|with\s+check)\s*\(\s*true\s*\)/.test(head))
      return `CREATE POLICY with a \`true\` predicate opens every row of the table (policies are OR'd)`;
    return null;
  }
  if (/^alter\s+policy\b/.test(head))
    return `ALTER POLICY rewrites a live policy's predicate`;
  // — ALTER TABLE: only ADD COLUMN (nullable or defaulted), ADD CONSTRAINT … NOT
  //   VALID, and ENABLE ROW LEVEL SECURITY. Everything else, including every
  //   DISABLE, is refused.
  if (/^alter\s+table\b/.test(head)) {
    if (/\benable\s+(?:row\s+level\s+security|always\s+trigger|replica\s+trigger)\b/.test(head))
      return null;
    if (/\bforce\s+row\s+level\s+security\b/.test(head) && !/\bno\s+force\b/.test(head)) return null;
    if (/\bdisable\s+row\s+level\s+security\b/.test(head))
      return `ALTER TABLE … DISABLE ROW LEVEL SECURITY removes the table's row boundary`;
    if (/\bno\s+force\s+row\s+level\s+security\b/.test(head))
      return `ALTER TABLE … NO FORCE ROW LEVEL SECURITY exempts the owner from the table's policies`;
    if (/\bdisable\s+trigger\b/.test(head))
      return `ALTER TABLE … DISABLE TRIGGER turns off a live trigger`;
    if (/\badd\s+column\b/.test(head)) {
      if (/\bnot\s+null\b/.test(head) && !/\bdefault\b/.test(head))
        return `ADD COLUMN … NOT NULL with no DEFAULT rewrites and locks the whole table and fails on existing rows`;
      if (/\b(?:drop|alter)\s+column\b/.test(head))
        return `an ALTER TABLE that ADDs and also DROPs/ALTERs a column is not one additive shape`;
      return null;
    }
    if (/\badd\s+constraint\b/.test(head)) {
      if (/\bnot\s+valid\b/.test(head)) return null;
      return `ADD CONSTRAINT without NOT VALID validates every existing row under an ACCESS EXCLUSIVE lock`;
    }
    return `ALTER TABLE in a shape the allow-list does not enumerate`;
  }
  // — ALTER DEFAULT PRIVILEGES: REVOKE narrows, GRANT widens.
  if (/^alter\s+default\s+privileges\b/.test(head)) {
    if (/\brevoke\b/.test(head)) return null;
    return `ALTER DEFAULT PRIVILEGES … GRANT widens every future object's privileges`;
  }
  // — a REVOKE, only under the bounded `-- allows: revoke <schema>` exemption whose
  //   containment assertRevokeExemptionIsContained has already proven.
  if (/^revoke\b/.test(head)) {
    if (ctx.allowRevokeSchema) return null;
    return `a REVOKE (the bounded route is \`-- allows: revoke <schema>\`)`;
  }
  if (/^grant\b/.test(head))
    return `a GRANT widens privileges — the OFF switch's boundary IS the absence of these`;
  // — INSERT, only into a registry table.
  const ins = /^insert\s+into\s+(?:only\s+)?([a-z0-9_."]+)/.exec(head);
  if (ins) {
    const t = ins[1]!.replace(/"/g, "");
    // 🚨 ATTACK-7 finding 3, second half. `platform.entity_types` is a registry table
    // like the others on the branch — and on PRODUCTION it is the table whose rows are
    // live entity tokens: one INSERT mints a production `custom:` token, which
    // `pnpm check:entity-types` reds and `scripts/release.sh` turns into a halted
    // frontend release train for every unrelated lane, and which `W1-REG`'s own
    // `must not touch` cell forbids. So the allowance is the branch's, not
    // production's, and the refusal says which target it is talking about.
    if (t === ENTITY_TYPES_TABLE && ctx.flagTarget === "production")
      return (
        `an INSERT into ${ENTITY_TYPES_TABLE} at --target production — on the branch that is a ` +
        `rehearsal fixture, on production it MINTS A LIVE ENTITY TOKEN (it reds ` +
        `pnpm check:entity-types, which halts the frontend release train, and W1-REG's ` +
        `\`must not touch\` forbids it). Rehearse it with --target branch; a production token ` +
        `is a chair step with its own inverse`
      );
    if (REGISTRY_INSERT_TABLES.includes(t)) return null;
    // The campaign's own store lane: a data row in schema `custom`, bounded four ways.
    const customTable = customDataInsertTargetOf(s);
    if (customTable) return customDataInsertRefusal(s, customTable, ctx.guard ?? null);
    return `an INSERT into ${t}, which is not one of the registry tables (${REGISTRY_INSERT_TABLES.join(", ")})`;
  }
  // — COMMENT ON: documentation.
  if (/^comment\s+on\b/.test(head)) return null;
  // — the timeouts §6b.3 requires the file itself to set.
  const set = /^set\s+(?:local\s+)?([a-z_]+)\b/.exec(head);
  if (set && ALLOWED_SET_GUCS.includes(set[1]!)) return null;
  if (/^do\b/.test(head))
    return `a DO block builds DDL at run time, so the allow-list cannot read what it will execute`;
  return `a statement in no enumerated additive shape`;
}

/**
 * Why this body is not additive — the ALLOW-LIST judgement, one reason per statement
 * that is not one of the enumerated shapes, each naming the statement.
 *
 * `allowRevokeSchema` admits `REVOKE` and nothing else; the caller has already proven,
 * separately, that every REVOKE stays inside that schema.
 */
export function nonAdditiveReasons(
  strippedSql: string,
  opts?: {
    readonly allowRevokeSchema?: string | null;
    readonly basedOnNames?: ReadonlySet<string>;
    readonly flagTarget?: Target;
    readonly guard?: { feature: string; key: string } | null;
  },
): string[] {
  const ctx: AllowListContext = {
    allowRevokeSchema: opts?.allowRevokeSchema ?? null,
    basedOnNames: opts?.basedOnNames,
    flagTarget: opts?.flagTarget,
    guard: opts?.guard ?? null,
  };
  const out: string[] = [];
  for (const stmt of topLevelStatements(strippedSql)) {
    const why = additiveVerdictOf(stmt, ctx);
    if (why) out.push(`${why}:\n      ${stmt.slice(0, 200)}${stmt.length > 200 ? " …" : ""}`);
  }
  return out;
}

/**
 * A GUARDED BODY MUST READ ITS GUARD (ATTACK-6 finding 2, second half).
 *
 * Nothing compared the `-- guard:` key to the body, so a `CREATE OR REPLACE FUNCTION`
 * that replaced a live SECURITY DEFINER body — `public._provision_new_user_personal_org()`
 * is the trigger every signup runs — and never read the knob satisfied every mechanical
 * check, and the only defence was the lane's self-reported OFF-path diff. This is a
 * STATIC check: the feature and the key must both appear in the body that replaces a
 * live definition or creates a policy. It cannot prove the read is on the right branch;
 * it can prove the body never mentions the thing that is supposed to hold it OFF.
 *
 * 🚨 A `CREATE OR REPLACE FUNCTION | PROCEDURE` IN SCHEMA `custom` IS EXEMPT — EXCEPT A
 * FUNCTION `RETURNS TRIGGER` OR `RETURNS EVENT_TRIGGER`, WHICH IS NOT.
 *
 * The exemption for the rest of the schema stands for the reason `triggerOnLiveTableUnguardedBy`
 * already gives for a trigger there: the whole schema is this campaign's own new namespace —
 * revoked from PUBLIC, `anon`, `authenticated` and `service_role`, absent from
 * `pgrst.db_schemas`, absent from the ORM's `generate:` blocks — so nothing reads it until
 * the switch and replacing an ordinary body there cannot change a live path. Without this, a
 * wave-1 lane extending an EARLIER WAVE-1 LANE's function (`W1-VAL` extending `W1-FIELD`'s
 * `custom.record_values` so it does not return the new reserved keys as if they were the
 * record's own values) is refused unless it writes a knob read into a pure projection
 * function that has no business reading one — which buys nothing and teaches the next
 * author that the guard line is a formality to be satisfied with a mention.
 *
 * A `RETURNS TRIGGER` (or `RETURNS EVENT_TRIGGER`) function is different: Postgres resolves a
 * trigger's function by OID at fire time, not by schema privilege, so `custom.zz_hook()` bound
 * with `CREATE TRIGGER … ON platform.associations … EXECUTE FUNCTION custom.zz_hook()` (see
 * `triggerOnLiveTableUnguardedBy`'s own example) is a live path the moment that trigger exists
 * — schema `custom` being unreadable by every client role stops nothing, because nothing
 * reads the schema to fire the trigger. A LATER file that does
 * `CREATE OR REPLACE FUNCTION custom.zz_hook() RETURNS TRIGGER …` replaces the body every write
 * to that live table now executes, with no guard read required, which is exactly the class of
 * defect this whole check exists to close (`public._provision_new_user_personal_org()`).  So a
 * trigger-returning function in `custom` is judged exactly as it would be outside `custom`: its
 * body must name the guard. `functionReturnsTrigger` decides this from the statement's own
 * `RETURNS` clause; when it cannot determine the return type at all, the statement is treated
 * as if it does return a trigger — an unproven negative is never grounds for exemption.
 *
 * An UNQUALIFIED name is treated as OUTSIDE `custom`, because `search_path` decides it at
 * execution time and nothing static can prove where it lands.
 */
export function guardUnreadBy(
  guard: { feature: string; key: string } | null,
  strippedSql: string,
): string | null {
  if (!guard) return null;
  const body = strippedSql.toLowerCase();
  const gates = topLevelStatements(strippedSql)
    .filter((s) =>
      /^create\s+or\s+replace\s+(?:function|procedure|view|trigger)\b|^create\s+policy\b/i.test(s),
    )
    .filter((s) => replacedObjectSchema(s) !== "custom" || !customReplaceIsExempt(s));
  if (gates.length === 0) return null;
  if (body.includes(guard.feature.toLowerCase()) && body.includes(guard.key.toLowerCase())) return null;
  return (
    `it replaces a live definition (or creates a policy) and its body never names ` +
    `${guard.feature}/${guard.key} — the knob that is supposed to hold it OFF:\n` +
    `      ${gates[0]!.slice(0, 160)}${gates[0]!.length > 160 ? " …" : ""}`
  );
}


/**
 * The schema a `CREATE OR REPLACE FUNCTION | PROCEDURE` REPLACES A BODY IN, or null for
 * every other shape and for an unqualified name (which `search_path` settles at execution
 * time, so nothing static can prove where it lands).
 *
 * 🚨 DELIBERATELY NOT `VIEW` — `CREATE OR REPLACE VIEW` is refused by `additiveVerdictOf`
 * (`"CREATE OR REPLACE VIEW rewrites a live view body with no concurrency check"`) before a
 * file's statements ever reach `guardUnreadBy`, at BOTH targets, unconditionally. A view arm
 * here would judge a shape the runner has already refused for every other reason — dead code
 * that looks like coverage. Confirmed unreachable: no corpus fixture exercises it, and none
 * should — `not-additive` fires first every time.
 *
 * 🚨 DELIBERATELY NOT triggers and NOT policies, although both are in `guardUnreadBy`'s
 * gate set. This function exists to answer one question — "could this statement replace a
 * body a live path already executes?" — and only a function or procedure body can. A
 * `CREATE POLICY` decides row access the moment the switch flips, and
 * `migrations/judgment-corpus/a6-13-guard-unread-by-policy.sql` already fixes the verdict
 * for one on a `custom` table at `refuse:guard-unread`; a `CREATE OR REPLACE TRIGGER` binds
 * behaviour rather than replacing a body. Neither is narrowed here, so no existing verdict
 * moves.
 */
export function replacedObjectSchema(stmt: string): string | null {
  const one = stmt.replace(/\s+/g, " ").trim();
  const own = /^create\s+or\s+replace\s+(?:function|procedure)\s+([a-z0-9_."]+)/i.exec(one);
  if (!own) return null;
  const bare = own[1]!.replace(/"/g, "").toLowerCase();
  return bare.includes(".") ? bare.split(".")[0]! : null;
}

/**
 * `CREATE OR REPLACE FUNCTION`'s RETURNS clause, read case-insensitively across
 * whitespace/newlines, with or without a `pg_catalog.` prefix or double quotes, and whether
 * or not it is immediately followed by `AS`/`LANGUAGE`/a volatility keyword — so `RETURNS
 * TRIGGER AS $$`, `returns\n  pg_catalog.trigger`, and `RETURNS "trigger" LANGUAGE plpgsql`
 * all match.
 *
 * Returns `true` when the clause names `trigger` or `event_trigger`, `false` when a RETURNS
 * clause is found and provably names something else, and `null` when the statement is not a
 * `CREATE OR REPLACE FUNCTION` at all, OR when it is one but no RETURNS clause could be
 * found — which cannot legitimately happen (a function statement is invalid SQL without
 * one), so an undetectable clause means the parse missed something, not that the function is
 * safe. The caller treats `null` the same as `true`: never exempt on an unproven negative.
 */
export function functionReturnsTrigger(stmt: string): boolean | null {
  const one = stmt.replace(/\s+/g, " ").trim();
  if (!/^create\s+or\s+replace\s+function\b/i.test(one)) return null;
  if (/\breturns\s+(?:pg_catalog\s*\.\s*)?"?(?:trigger|event_trigger)"?\b/i.test(one)) return true;
  if (/\breturns\s+/i.test(one)) return false;
  return null;
}

/**
 * Called only once `replacedObjectSchema(stmt) === "custom"`. A `CREATE OR REPLACE
 * PROCEDURE` has no `RETURNS` clause at all, so it can never be a trigger function and the
 * schema-wide exemption holds unconditionally. A `CREATE OR REPLACE FUNCTION` is exempt only
 * when `functionReturnsTrigger` can PROVE its `RETURNS` clause names something other than
 * `trigger`/`event_trigger` — `true` (returns trigger) and `null` (undetermined) both refuse
 * the exemption, per `functionReturnsTrigger`'s own contract.
 */
function customReplaceIsExempt(stmt: string): boolean {
  const one = stmt.replace(/\s+/g, " ").trim();
  if (/^create\s+or\s+replace\s+procedure\b/i.test(one)) return true;
  return functionReturnsTrigger(stmt) === false;
}

/**
 * A NEW TRIGGER ON A LIVE TABLE MUST NAME ITS GUARD (ATTACK-7 finding 3, first half).
 *
 * 🚨 `guardUnreadBy` is written for "a `CREATE OR REPLACE` of a live definition, or a
 * `CREATE POLICY`". A **new** function bound to a **live** table by a **new** trigger is
 * neither shape — both statements are on the allow-list, both are literally additive —
 * and it changes production behaviour on EVERY WRITE to that table while every
 * mechanical check reports additive, guarded and OFF. ATTACK-7 planted exactly that:
 *
 *     create function custom.zz_hook() returns trigger language plpgsql
 *       as $$ begin raise exception 'boom'; end $$;
 *     create trigger zz_hook_trg before insert on platform.associations
 *       for each row execute function custom.zz_hook();
 *
 * headed `-- target: branch,production` + `-- additive: yes` + `-- guard: custom/system_enabled`,
 * and it PASSED in both runners — a trigger that stops every write to
 * `platform.associations`, behind a knob nothing reads.
 *
 * So: a file that names production and creates a trigger on a table OUTSIDE schema
 * `custom` must NAME its guard's feature and key somewhere in the file (the trigger
 * function's body is the place; this check cannot prove the read is on the right branch,
 * only that the file mentions the thing that is supposed to hold it OFF — same honesty
 * as `guardUnreadBy`). Schema `custom` is exempt because the whole schema is this
 * campaign's own new namespace: nothing reads it until the switch, so a trigger there
 * cannot change a live path.
 *
 * An UNQUALIFIED table name is treated as outside `custom`: it resolves through
 * `search_path` at execution time, so nothing static can prove where it lands.
 */
export function triggerOnLiveTableUnguardedBy(
  guard: { feature: string; key: string } | null,
  seedsGuards: boolean,
  strippedSql: string,
): string | null {
  const body = strippedSql.toLowerCase();
  const offenders: string[] = [];
  for (const stmt of topLevelStatements(strippedSql)) {
    const m =
      /^create\s+(?:constraint\s+)?(?:or\s+replace\s+)?trigger\s+[a-z0-9_."]+[\s\S]*?\son\s+(?:only\s+)?([a-z0-9_."]+)/i.exec(
        stmt.replace(/\s+/g, " ").trim(),
      );
    if (!m) continue;
    const table = m[1]!.replace(/"/g, "").toLowerCase();
    const schema = table.includes(".") ? table.split(".")[0]! : null;
    if (schema === "custom") continue;
    offenders.push(`${stmt.slice(0, 160)}${stmt.length > 160 ? " …" : ""} (table ${table})`);
  }
  if (offenders.length === 0) return null;
  if (seedsGuards)
    return (
      `it claims \`-- seeds-guards: yes\` and creates a trigger on a live table:\n      ` +
      offenders.join(`\n      `) +
      `\n  The register file seeds the knobs; it may not also bind behaviour to a live table.`
    );
  if (!guard)
    return (
      `it creates a trigger on a live table and names no \`-- guard:\`:\n      ` + offenders.join(`\n      `)
    );
  if (body.includes(guard.feature.toLowerCase()) && body.includes(guard.key.toLowerCase())) return null;
  return (
    `it creates a trigger on a live table and the file never names ${guard.feature}/${guard.key} — ` +
    `the knob that is supposed to hold it OFF:\n      ` +
    offenders.join(`\n      `)
  );
}


export interface AgreementInput {
  readonly filename: string;
  readonly flagTarget: Target;
  readonly header: MigrationHeader;
  /** SQL with comments and string literals already stripped, for body detection. */
  readonly strippedSql: string;
  /**
   * Is this file already in `public._schema_migrations`?
   *
   * Frozen history gets amnesty; a file that has NOT run yet is judged. Defaults
   * to `true` — amnesty — so a caller that cannot answer never invents a refusal.
   * Every caller that CAN answer must pass it, and both runners do.
   */
  readonly alreadyLedgered?: boolean;
  /**
   * Every function name the file declares with `-- based-on:`, from the RAW sql —
   * `strippedSql` has the comments removed, so the allow-list cannot see them.
   * Compute with `basedOnFunctionNames(sql)`. Absent means "declared none".
   */
  readonly basedOnNames?: ReadonlySet<string>;
}

/**
 * Header vs flag, before anything opens a connection.
 *
 * Returns the guard key a `branch,production` file names, so the caller can prove
 * it resolves OFF on the server before the production half runs.
 */
export interface AgreementVerdict {
  readonly guard: { feature: string; key: string } | null;
  /**
   * Set when `-- allows: revoke <schema>` was USED — the runner prints it. A
   * passing exemption announces itself exactly as loudly as a failing one.
   */
  readonly revokeExemption: { schema: string; statements: RevokeStatement[] } | null;
  /**
   * Set when a header-less file reached production on its `-- chair-step:` escape.
   * The runner PRINTS the reason and the file's whole body before executing it —
   * the escape is loud or it is not an escape.
   */
  readonly chairStep: { why: string; reasons: string[] } | null;
  /**
   * The `INSERT INTO custom.<table>` statements the allow-list ADMITTED, so the runner
   * prints them the way it prints a used `-- allows: revoke` exemption. A shape that
   * lets rows onto production announces itself or it is not bounded.
   */
  readonly customDataInserts: string[];
}

export function assertHeaderAgreesWithFlag(input: AgreementInput): AgreementVerdict {
  const { filename, flagTarget, header, strippedSql } = input;
  const named = header.targets;
  const alreadyLedgered = input.alreadyLedgered !== false;

  if (flagTarget === "branch") {
    // 🚨 ATTACK-7 finding 2 / finding 12. A header-less file is production-only BY
    // AMNESTY — that is the ~3,567 migrations written before `--target` existed — and
    // amnesty is not a reason to keep the rehearsal branch out of reach of the ONE
    // shape that most needs rehearsing. A `-- chair-step:` file is not legacy: somebody
    // wrote that line on purpose, it is by construction the non-additive, irreversible
    // kind, and it is exactly the file a lane wants to run on the disposable database
    // FIRST. Without this, rule 27's "the inverse was RUN on the branch" had no route
    // for an inverse and switch-checklist step 3's GRANT had no route at all: the only
    // remaining path was to head the file `-- target: branch,production`, which is the
    // waiver this round abolished.
    if (named === null && !header.chairStep) {
      fail([
        `${filename} carries no \`-- target:\` header, so it cannot be applied to the rehearsal branch.`,
        `  A file with no header is production-only — that is every migration written before`,
        `  --target existed, and their behaviour is unchanged.`,
        `  Remedy: add \`-- target: branch\` (or \`-- target: branch,production\`) as the file's`,
        `  first line if this file really is part of the rehearsal — or, if it is a chair`,
        `  step (an inverse, a GRANT, anything non-additive by construction), keep it`,
        `  header-less and give it \`-- chair-step: <why>\`, which rehearses HERE and runs on`,
        `  production only when the command NAMES it (--confirm-chair-step), from the SAME bytes.`,
      ], "branch-needs-target-header");
    }
    if (named !== null && !named.includes("branch")) {
      fail([
        `${filename} is headed \`-- target: ${named.join(",")}\` but you passed --target branch.`,
        `  file header: ${named.join(",")}`,
        `  command flag: branch`,
        `  Refusing. Change one of them deliberately; the runner will not choose.`,
      ], "header-flag-disagree");
    }
  } else if (flagTarget === "clone") {
    // 🚨 THE CLONE IS PRODUCTION'S COPY, so its header rule is production's, not the
    // branch's — with ONE refusal added and ONE amnesty kept.
    //
    // KEPT: a header-LESS file rehearses here. That is the ~3,567 migrations written
    // before --target existed, production-only BY DEFINITION, and the clone is the only
    // rehearsal database on which "what will this do to production" is a real question
    // (production's rows, production's indexes, production's locks). The branch refuses
    // them because the branch is not production's data; refusing them HERE would leave
    // the one shape that most needs rehearsing with nowhere to rehearse — which is
    // exactly the hole W1-ORG-PREP fell into, rehearsing four chair steps through
    // `psql --single-transaction` with no judgement and no ledger row at all.
    // They are judged below by the same deny-list production judges them by.
    //
    // ADDED: a file headed `-- target: branch` and nothing else names the OTHER
    // rehearsal database on purpose. One deliberate header, one database — the same
    // reason `--target branch` refuses a production-headed file.
    if (named !== null && !named.includes("clone") && !named.includes("production")) {
      fail([
        `${filename} is headed \`-- target: ${named.join(",")}\` but you passed --target clone.`,
        `  file header: ${named.join(",")}`,
        `  command flag: clone`,
        `  The dev clone is PRODUCTION'S OWN DATA, physically restored and quarantined, so a file`,
        `  rehearses here when it names \`production\` (or \`clone\`) — or when it carries no`,
        `  \`-- target:\` line at all, which is production-only by definition and is judged here`,
        `  exactly as production judges it.`,
        `  A \`-- target: branch\` file names the other rehearsal database deliberately; rehearse`,
        `  it there, or change its header on purpose.`,
      ], "header-flag-disagree");
    }
  } else if (named !== null && !named.includes("production")) {
    fail([
      `${filename} is headed \`-- target: ${named.join(",")}\` and must not land on production.`,
      `  file header: ${named.join(",")}`,
      `  command flag: production`,
      `  Refusing. Rehearse it with --target branch; a branch-only file reaches production`,
      `  only after its header is changed on purpose and it is re-reviewed.`,
      `  A rehearsal-only file belongs in \`migrations/rehearsal/\`, which no release path`,
      `  scans — see REHEARSAL_DIRNAME in this module.`,
    ], "header-flag-disagree");
  }

  // 🚨 ATTACK-5 finding 3. A file with NO `-- target:` line used to reach production
  // with no additive scan, no ALTER TYPE refusal and no guard requirement, in BOTH
  // runners, deliberately — so rule 8 ("every production apply is additive and
  // guarded … through the runner, not through this sentence") and §4.9 ("ALTER TYPE
  // … ADD VALUE is refused by both, in every lane, with no exception") were false of
  // the exact path a tired builder reaches by forgetting one comment line.
  //
  // The amnesty that remains is HISTORY, not shape: a file already in the ledger is
  // frozen and never re-judged, which is all ~3,567 landed migrations. A file that
  // has NOT run yet is judged for the seven non-additive statement classes. This is
  // ALWAYS ON rather than only while the campaign runs — strictly more coverage in
  // time, and it needs no campaign flag anyone can forget to clear.
  //
  // What it deliberately does NOT do: require `-- additive: yes` or `-- guard:` on a
  // header-less file. Those two lines are the CAMPAIGN's contract, and demanding
  // them here would refuse every ordinary additive migration every other lane in
  // this repo writes. So rule 8's second half holds only for files that name
  // production; the book must say so rather than claim the runner enforces it.
  const chairStep = header.chairStep;
  let headerlessChairStep: AgreementVerdict["chairStep"] = null;
  // The verdict carries the chair step on BOTH targets, so the runner announces the
  // reason and the whole body when the file rehearses on the branch too — the same
  // file, the same bytes, the same loudness. Only the CONFIRMATION is production-only.
  if (flagTarget === "branch" && named === null && chairStep)
    headerlessChairStep = { why: chairStep, reasons: [] };
  // `clone` is judged here EXACTLY as `production` is: same deny-list, same
  // `-- chair-step:` escape, same "already ledgered is frozen history" amnesty. The
  // clone carries production's ledger (it is a physical copy of it), so
  // `alreadyLedgered` answers the same question it answers on production. The ONE
  // difference lives in the runner, not here: the chair step is ANNOUNCED on the clone
  // and CONFIRMED only on production.
  if ((flagTarget === "production" || flagTarget === "clone") && named === null && !alreadyLedgered) {
    // The DENY-list, deliberately: this is the header-less path, which is every
    // ordinary migration every other lane writes. See the list's own comment.
    const reasons = nonAdditiveReasonsDenyList(strippedSql, {
      allowRevokeSchema: header.allowsRevokeSchema,
    });
    if (reasons.length && !chairStep) {
      fail([
        `${filename} carries NO \`-- target:\` header and its body contains ${reasons.join(", ")}.`,
        `  It has never been applied, so it is not frozen history — and a non-additive`,
        `  statement reaches production here with nothing between it and the database but`,
        `  this check. Refusing by name.`,
        `  Three ways forward, all deliberate:`,
        `    1. \`-- target: branch\` + move it to \`migrations/rehearsal/\` — rehearse it first;`,
        `       no release path scans that directory.`,
        `    2. \`-- target: branch,production\` + \`-- additive: yes\` + \`-- guard: <feature>/<key>\``,
        `       — the campaign contract, which proves the old path is untouched while OFF.`,
        `    3. \`-- chair-step: <why it must be non-additive>\` — a NAMED step (--confirm-chair-step). The`,
        `       runner then prints that reason AND this file's entire body before executing`,
        `       a single byte of it.`,
        `  (An already-ledgered file is never judged here: applied SQL is frozen history.)`,
      ], "headerless-non-additive");
    }
    if (chairStep) headerlessChairStep = { why: chairStep, reasons };
  }

  // 🚨 ATTACK-4 finding 3. This used to read `both` — branch AND production — so a
  // file headed exactly `-- target: production` passed NO additive check, NO
  // `-- additive: yes` requirement and NO `-- guard:` requirement, and reached
  // production with nothing but the server-identity check between it and a
  // `DROP TABLE platform.associations`. The requirement keys on the header NAMING
  // production, which covers `-- target: production` and `-- target: branch,production`.
  //
  // ⚠️ AND ONLY ON AN EXPLICIT HEADER. `named === null` — no `-- target:` line at
  // all — is production-only by definition and is NOT touched: that is every one
  // of the ~3,567 migrations already in these two repos, all of them already
  // landed, and refusing them retroactively buys nothing. The absence is
  // deliberate; see the module docstring.
  const namesProduction = named !== null && named.includes("production");

  // The revoke exemption is checked whenever it is CLAIMED, whatever the target,
  // so a branch-only rehearsal proves the same containment production will demand.
  let revokeExemption: AgreementVerdict["revokeExemption"] = null;
  if (header.allowsRevokeSchema) {
    revokeExemption = {
      schema: header.allowsRevokeSchema,
      statements: assertRevokeExemptionIsContained(
        filename,
        header.allowsRevokeSchema,
        strippedSql,
      ),
    };
  }

  // 🚨 ATTACK-7 finding 2 — THE WAIVER IS GONE, AND THE TWO RUNNERS NOW AGREE.
  // This used to return here: on a header that NAMED production, `-- chair-step:`
  // stood in for `-- additive: yes`, for `-- guard:` AND for the whole allow-list,
  // with the confirmation as the only surviving control. `db/migration_target.py` never
  // did that — it set its chair-step verdict only on the header-LESS path — so ONE
  // FILE, `migrations/inverse/custom_entity_types_detail_variant_down.sql`, was
  // ACCEPTED by `pnpm db:apply --target production` and REFUSED by
  // `uv run python db/apply_migrations.py`, and §8.9 step 3a's outcome depended on
  // which command a tired chair typed at 3 a.m. One judgement, and it is the stricter
  // one: a header that names production is judged by the allow-list, with no waiver.
  //
  // The chair-step route is the HEADER-LESS one, and it is not a downgrade: the same
  // bytes rehearse on the branch (see the branch arm above) and reach production only
  // through a terminal. So a file carrying BOTH is a contradiction, and a contradiction
  // that silently resolves in favour of the stricter reading is a comment nobody reads
  // — it is refused, by name, with the one-line remedy.
  if (namesProduction && chairStep) {
    fail([
      `${filename} carries BOTH \`-- target: ${named!.join(",")}\` and \`-- chair-step:\`.`,
      `  \`-- chair-step:\` is the HEADER-LESS route and it waives nothing here: a file that`,
      `  names production in its \`-- target:\` header is judged by the ALLOW-LIST, in both`,
      `  runners, with no exception. Carrying both means one of the two lines does nothing,`,
      `  and which one it is used to depend on which runner you typed.`,
      `  Remedy: DELETE the \`-- target:\` line. A header-less \`-- chair-step:\` file rehearses`,
      `  on the branch with --target branch and reaches production only when NAMED, from`,
      `  the same bytes — or, if the file really is additive and guarded, delete the`,
      `  \`-- chair-step:\` line instead and let the allow-list judge it.`,
    ], "chair-step-names-production");
  }

  if (namesProduction) {
    const headerText = named!.join(",");
    const because =
      `  (This fires because the file NAMES production in its \`-- target:\` header. A file\n` +
      `   with NO \`-- target:\` line is production-only by definition and is deliberately\n` +
      `   untouched by this rule — that is every migration written before --target existed.)`;
    if (!header.additive) {
      fail([
        `${filename} is headed \`-- target: ${headerText}\` without \`-- additive: yes\`.`,
        `  A file that names production is accepted only when it states that it is additive and`,
        `  names the knob that holds it OFF. Add both header lines, or split the file.`,
        because,
      ], "production-not-declared-additive");
    }
    if (!header.guard && !header.seedsGuards) {
      fail([
        `${filename} is headed \`-- target: ${headerText}\` without a \`-- guard:\` line.`,
        `  Every shared object this campaign changes on production lands behind a`,
        `  platform.feature_knob row that is OFF, so the old path is untouched until the switch.`,
        `  Add \`-- guard: <feature>/<key>\` naming a seeded knob — or, if this IS the file that`,
        `  seeds the register, \`-- seeds-guards: yes\`, which restricts it to`,
        `  ${KNOB_REGISTER_TABLES.join(", ")} and nothing else.`,
        because,
      ], "production-no-guard");
    }
    if (header.seedsGuards) {
      if (header.guard) {
        fail([
          `${filename} carries both \`-- seeds-guards: yes\` and \`-- guard:\`.`,
          `  A register file seeds the guards; it is not itself guarded. Keep one.`,
        ], "seeds-guards-with-guard");
      }
      const touched = writeTargetsOf(strippedSql).filter(
        (t) => !KNOB_REGISTER_TABLES.includes(t as (typeof KNOB_REGISTER_TABLES)[number]),
      );
      if (touched.length) {
        fail([
          `${filename} claims \`-- seeds-guards: yes\` but writes to ${touched.join(", ")}.`,
          `  That exemption exists only for the knob register itself — it may touch`,
          `  ${KNOB_REGISTER_TABLES.join(", ")} and nothing else, because it is the one file`,
          `  that cannot name a guard that already resolves. Split the rest into a guarded file.`,
        ], "seeds-guards-out-of-bounds");
      }
    }
    // 🚨 THE ALLOW-LIST (ATTACK-6 finding 2). Every statement must be one of the
    // enumerated additive shapes; anything else is refused with the statement named.
    const reasons = nonAdditiveReasons(strippedSql, {
      allowRevokeSchema: header.allowsRevokeSchema,
      basedOnNames: input.basedOnNames,
      flagTarget,
      guard: header.guard,
    });
    if (reasons.length) {
      fail([
        `${filename} is headed \`-- target: ${headerText}\` and ${reasons.length} statement(s) in its`,
        `  body are not one of the enumerated ADDITIVE shapes:`,
        ...reasons.map((r) => `  • ${r}`),
        ``,
        `  A file that names production is judged by an ALLOW-LIST, not a blacklist: CREATE`,
        `  SCHEMA/TABLE/TYPE/INDEX/SEQUENCE/VIEW/TRIGGER, a NEW function (or a replacement that`,
        `  declares its \`-- based-on:\`), CREATE POLICY with a predicate that is not \`true\`,`,
        `  ALTER TABLE ADD COLUMN (nullable or defaulted) / ADD CONSTRAINT … NOT VALID / ENABLE`,
        `  ROW LEVEL SECURITY, INSERT into a registry table, ALTER DEFAULT PRIVILEGES … REVOKE,`,
        `  COMMENT ON, and SET of the three timeout GUCs. Everything else — every GRANT`,
        `  included — is refused here by name.`,
        `  Split the rest into its own \`-- target: branch\` file, or make it a chair step with`,
        `  its own inverse migration.`,
        reasons.some((r) => r.startsWith("a REVOKE"))
          ? `  A REVOKE confined to ONE schema this campaign created has a sanctioned path:\n` +
            `  \`-- allows: revoke <schema>\`, which admits that statement and nothing else.`
          : ``,
        because,
      ].filter(Boolean), "not-additive");
    }
    // 🚨 A NEW TRIGGER ON A LIVE TABLE MUST NAME ITS GUARD (ATTACK-7 finding 3).
    const unguardedTrigger = triggerOnLiveTableUnguardedBy(
      header.guard,
      header.seedsGuards,
      strippedSql,
    );
    if (unguardedTrigger) {
      fail([
        `${filename} is headed \`-- target: ${headerText}\` and ${unguardedTrigger}`,
        ``,
        `  A new function bound to a live table by a new trigger is two allow-listed`,
        `  statements and a changed production write path: it fires on every INSERT or`,
        `  UPDATE that table takes, while the additive scan, the guard header and`,
        `  assert_guard_resolves_off all read green. Either read the knob in the trigger`,
        `  function's body (platform.knob_resolve('<feature>', '<key>', null)) and return`,
        `  early when it is false, or move the trigger to a \`-- target: branch\` file and`,
        `  land it on production as a chair step at the switch.`,
        because,
      ], "trigger-guard-unnamed");
    }
    // 🚨 A GUARDED BODY MUST READ ITS GUARD (ATTACK-6 finding 2, second half).
    const unread = guardUnreadBy(header.guard, strippedSql);
    if (unread) {
      fail([
        `${filename} is headed \`-- guard: ${header.guard!.feature}/${header.guard!.key}\` but ${unread}`,
        ``,
        `  A guard that the body never reads is a comment, not a switch: the OFF proof rests`,
        `  on the lane's own self-reported diff and nothing mechanical. Either read the knob in`,
        `  the body (platform.knob_resolve('${header.guard!.feature}', '${header.guard!.key}', null)),`,
        `  or split the replacement out of this file.`,
        because,
      ], "guard-unread");
    }
  }
  return {
    guard: header.guard,
    revokeExemption,
    chairStep: headerlessChairStep,
    // Only a file the allow-list judged can carry an ADMITTED custom-data INSERT: a
    // header-less file never reaches this shape, and a refusal never reaches here.
    customDataInserts: namesProduction ? customDataInsertsOf(strippedSql, header.guard) : [],
  };
}

/**
 * The ONE directory rehearsal-only migrations live in, and the reason it exists.
 *
 * 🚨 2026-09-16, 03:52:12Z. `migrations/custom_entity_types_detail_variant.sql`,
 * headed `-- target: branch` at its only commit, was applied TO PRODUCTION by the
 * scheduled fleet release `release-all: v0.4.1940` — it widened two CHECK
 * constraints on `platform.entity_types`, the registry table 1,571 policies read,
 * with nobody watching. The release path is `scripts/release.sh` →
 * `apply_frontend_migrations()`, which runs the applier out of a SIBLING aidream
 * checkout (`${AIDREAM_DIR:-../aidream}`) over THIS repo's `migrations/*.sql`. Two
 * properties made it possible and neither was about the header: the release passed
 * no `--target` at all, and the rehearsal file sat in the very directory the train
 * scans. A refusal in the runner is therefore not enough on its own — the rehearsal
 * file must not be in the swept set at all.
 *
 * So: a rehearsal-only file lives HERE, `migrations/rehearsal/`, and
 *   · aidream's `_glob_for` globs `migrations/*.sql` non-recursively, so the train
 *     cannot see it (guard: `db/tests/test_rehearsal_dir_is_never_swept.py`);
 *   · `pnpm db:apply` refuses any file under this directory at `--target production`
 *     by name, and refuses one that is not headed `-- target: branch`;
 *   · `pnpm check:migrations` does not count it pending against production.
 */
export const REHEARSAL_DIRNAME = "rehearsal";

/**
 * The directory INVERSE migrations live in — the other half of the same lesson.
 *
 * §4.13 requires every migration to carry its own down-migration in the same commit,
 * and §8.9's abort checklist runs them. Until 2026-09-16 they were marked
 * `-- migrate: skip:` so no sweep would apply them — and `pnpm db:apply` refuses a
 * skip-marked file "by any path", while the Supabase MCP path is forbidden for this
 * repo. So the inverses had NO sanctioned route at all, on either database: ATTACK-5
 * finding 1's "the abort checklist cannot undo it", exactly.
 *
 * `migrations/inverse/` is the route, and it is bounded the same way `rehearsal/` is:
 * no release sweeps it (every glob is non-recursive), so it needs no skip marker; and
 * a file here reaching `--target production` must carry `-- chair-step: <why>`, which
 * makes the runner print the reason and the file's entire body before it executes.
 * An inverse is by construction non-additive — that is what reversing means — so
 * `-- chair-step:` is what stands in for `-- additive: yes` and `-- guard:` here.
 */
export const INVERSE_DIRNAME = "inverse";

/**
 * THE CAMPAIGN'S OWN DIRECTORY — the third one no release path scans, and the one
 * that closes ATTACK-6 finding 1.
 *
 * 🚨 `migrations/rehearsal/` closed the INSTANCE (a `-- target: branch` file) and left
 * the CLASS open. Every closure ATTACK-5 built keys on the header naming `branch`
 * alone — but every campaign DDL file by contract sits in `migrations/`, headed
 * `-- target: branch,production`, additive and guarded, which is the exact shape both
 * unattended 30-minute sweeps are built to APPLY. So the campaign's own files reached
 * production before the lane's branch exit had passed, outside the object lock, and
 * whether or not the lane ever got there: §6b.1, §6b.5 and §4.14 were all false.
 *
 * A campaign file lives HERE, and the ONLY route to either database is the plan's own
 * command — `--source campaign --target branch|production`, one named file at a time:
 *   · every migration glob in both repos is non-recursive, so no sweep can see it
 *     (guards: `db/tests/test_campaign_dir_is_never_swept.py`,
 *     `scripts/__tests__/migration-target-refusals.test.ts`);
 *   · a file here applied without `--source campaign` is refused by LOCATION;
 *   · `--source campaign` naming a file that is NOT here is refused too — the flag is
 *     an assertion about the file, not a mood;
 *   · at `--target production` the runner additionally requires the SAME bytes to
 *     already carry a rehearsal ledger row on the BRANCH, and
 *     `campaign_watch.build_lock` on the branch to be held by the calling `--lane`.
 *     A lane that failed its rehearsal, or that does not hold its lock, cannot land.
 */
/**
 * The CONFORMANCE CORPUS — fixture migrations that exist to be JUDGED and never
 * applied (ATTACK-7: "two runners, two judges").
 *
 * 🚨 Every file in `migrations/judgment-corpus/` carries an `-- expect:` line naming the
 * verdict BOTH runners must return for it at each target, and `pnpm check:migration-judgment`
 * / `uv run python scripts/check_migration_judgment.py` run the whole directory through
 * both judges and fail on any disagreement with the expectation OR between the two
 * runners. The corpus deliberately contains bodies nobody may ever execute — `DROP TABLE`,
 * `GRANT USAGE ON SCHEMA custom TO authenticated`, a trigger that raises on every write to
 * `platform.associations` — so the directory is refused by LOCATION on every apply path, at
 * every target, in both runners, on top of being invisible to every (non-recursive) sweep.
 *
 * The one normative description of what those verdicts mean is `migrations/JUDGMENT.md`.
 */
export const JUDGMENT_CORPUS_DIRNAME = "judgment-corpus";

export const CAMPAIGN_DIRNAME = "campaign";

/** The one `--source` value that may name a file in `migrations/campaign/`. */
export const CAMPAIGN_SOURCE = "campaign";

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
  cloneRef?: CloneRef | null,
): void {
  const connRef = projectRefOf(conn.user, conn.host);
  const looksLikeClone = Boolean(cloneRef) && connRef === cloneRef!.cloneRef;
  // 🚨 THE CLONE'S HALF OF THE PRE-CONNECTION REFUSAL, both directions, with no
  // credential in the process for either. The clone answers pg_control_system() with
  // PRODUCTION'S OWN system_identifier, so this is the only check that can refuse
  // before a socket is opened.
  if (target === "clone") {
    if (!cloneRef) {
      fail([
        `--target clone, but CLONE-REF was not loaded, so nothing can prove this connection is`,
        `  the clone. A connection that cannot be PROVEN to be the clone is never treated as`,
        `  the clone. Nothing was opened.`,
      ], "clone-ref-missing");
    }
    if (!looksLikeClone) {
      const what =
        connRef === cloneRef.parentRef
          ? `PRODUCTION ${cloneRef.parentRef}`
          : connRef
            ? `project ${connRef}`
            : `a connection carrying no project ref at all`;
      fail([
        `--target clone, but the configured connection is ${what}, not the dev clone.`,
        `  configured: ${conn.user}@${conn.host}:${conn.port}/${conn.database} (from ${conn.from})`,
        `  CLONE-REF:  ${cloneRef.poolerUser}@${cloneRef.poolerHost}:${cloneRef.poolerPort}/${cloneRef.database} (${cloneRef.path})`,
        `  A data clone reports its PARENT's pg_control_system().system_identifier, so the project`,
        `  ref in the connection is the only thing that separates them. Nothing was opened.`,
        `  Set ${cloneRef.passwordEnvVar} to the clone DSN; --target clone reads that variable (or`,
        `  the password file CLONE-REF names) and nothing else — never SUPABASE_MATRIX_*.`,
      ], "clone-configured-not-the-clone");
    }
    return;
  }
  if (target === "production" && looksLikeClone) {
    fail([
      `--target production, but the configured connection IS the dev clone ${cloneRef!.cloneRef}.`,
      `  configured: ${conn.user}@${conn.host}:${conn.port}/${conn.database} (from ${conn.from})`,
      `  The clone answers pg_control_system() with production's own system_identifier`,
      `  (${cloneRef!.systemIdentifier}), so the server-side check CANNOT catch this one — the`,
      `  project ref in the connection is what caught it. Nothing was opened.`,
      `  Refusing rather than reporting a production apply that landed on a copy which the next`,
      `  nightly refresh throws away.`,
    ], "production-is-the-clone");
  }
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
  cloneRef?: CloneRef | null,
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
  const expected =
    target === "branch"
      ? ref.systemIdentifier
      : target === "clone"
        ? (cloneRef?.systemIdentifier ?? ref.parentSystemIdentifier)
        : ref.parentSystemIdentifier;
  if (sysid !== expected) {
    const named =
      sysid === ref.systemIdentifier
        ? `the rehearsal branch ${ref.branchRef}`
        : sysid === ref.parentSystemIdentifier
          ? `production ${ref.parentRef} (or a physical copy of it — see below)`
          : `an UNKNOWN cluster (system_identifier ${sysid})`;
    fail([
      `${filename}: the connected server is ${named}, not the --target you passed.`,
      `  command flag:      ${target}`,
      `  expected sysid:    ${expected}   (${target === "clone" && cloneRef ? cloneRef.path : ref.path})`,
      `  connected sysid:   ${sysid}`,
      `  Read from the server, not from the flag. Rolled back, nothing applied, no ledger row.`,
    ]);
  }

  // 🚨 THE SECOND, SERVER-SIDE HALF — and for `clone` vs `production` it is the ONLY
  // server-side half there can be, because a physical data clone answers
  // pg_control_system() with its PARENT's number. The nightly job quarantines the
  // clone: it drops `pg_net` and deactivates every `pg_cron` job. Neither is ever true
  // of production, and the two are read in CONJUNCTION so that one of them changing on
  // production one day can never refuse a real production apply.
  if (target === "clone" || (target === "production" && cloneRef)) {
    let facts: QuarantineFacts;
    try {
      facts = await readQuarantineFacts(query);
    } catch (e) {
      fail([
        `${filename}: could not read the quarantine facts from the connected server: ${String(e)}`,
        `  They are what separates the dev clone from production, which answer`,
        `  pg_control_system() identically. Refusing rather than guessing which one this is.`,
      ]);
    }
    const shape =
      `pg_net ${facts.pgNetInstalled ? "installed" : "absent"}, ` +
      `${facts.activeCronJobs} active pg_cron job(s)`;
    if (target === "clone" && !facts.quarantined) {
      fail([
        `${filename}: --target clone, and the connected server is NOT QUARANTINED (${shape}).`,
        `  The nightly clone job drops pg_net and deactivates every cron job; production has`,
        `  both. This server therefore looks like PRODUCTION — and it answers`,
        `  pg_control_system() with the very number CLONE-REF records for the clone, because a`,
        `  data clone is a physical restore, so that number proves nothing on its own.`,
        `  Rolled back, nothing applied, no ledger row. Point ${cloneRef?.passwordEnvVar ?? "CLONE_DATABASE_URL"}`,
        `  at today's clone (${cloneRef?.cloneRef ?? "see CLONE-REF"}) and re-run.`,
      ], "clone-server-not-quarantined");
    }
    if (target === "production" && facts.quarantined) {
      fail([
        `${filename}: --target production, and the connected server is a QUARANTINED COPY (${shape}).`,
        `  Every pg_cron job is inactive and pg_net is absent — that is what the nightly clone`,
        `  job does to the dev clone, and it is never true of production.`,
        `  Rolled back, nothing applied, no ledger row. Refusing rather than reporting a`,
        `  production apply that landed on a copy the next refresh throws away.`,
      ], "production-server-is-quarantined");
    }
  }
  return sysid;
}

/**
 * KNOBS THE OWNER HAS RULED ON — the one bounded exception to "a guarded file lands only
 * while its knob is OFF", and the exception is DATA, never a flag a tired lane can pass.
 *
 * 🚨 WHY IT EXISTS (lane STORE-ON, 2026-09-23). `assertGuardResolvesOff` refuses a guarded
 * production file whose knob does not resolve `false`, so that a file landing behind a
 * switch cannot change a path anybody is on. That is exactly right while the switch is
 * still down. On 2026-09-23 Arman ruled the record store's default ON and every active
 * organization was switched on — so `custom/system_enabled` resolves `true` and EVERY
 * campaign file headed `-- guard: custom/system_enabled` would be refused from that moment,
 * with no remedy a lane could apply: the only "fix" the refusal offers is to turn the
 * owner's ruling back off.
 *
 * So a knob the owner has DELIBERATELY thrown stops being a reason to refuse and becomes a
 * reason to SAY SO LOUDLY: the object this file lands is LIVE the moment it lands, and the
 * runner prints that above the apply rather than implying the old path is untouched. Every
 * other knob keeps the refusal exactly as it was — an unlisted knob that resolves true is
 * still a file being applied behind a switch somebody already threw without telling anyone,
 * which is the defect this gate was built for.
 *
 * Identical to `KNOBS_THE_OWNER_TURNED_ON` in aidream's `db/migration_target.py`; the two
 * runners must return the same verdict for the same bytes (migrations/JUDGMENT.md).
 */
export const KNOBS_THE_OWNER_TURNED_ON: ReadonlyArray<string> = [
  // Arman, 2026-09-23: "The default is ON." The record store itself, and the half aidream's
  // server kill switch reads — one switch, so both halves are named.
  "custom/system_enabled",
  "custom/code_paths_enabled",
  // The same ruling, the same day, for the older store's relation columns (OLD-TABLES-2 W4).
  "data_tables.relation/relation_columns_enabled",
];

/**
 * A `-- target: branch,production` file may only land on PRODUCTION when its named
 * knob exists there and resolves OFF — or when that knob is one the owner has ruled ON
 * (`KNOBS_THE_OWNER_TURNED_ON`), in which case the apply is ANNOUNCED as live rather than
 * refused. The knob's platform value is `coalesce(value, default_value)` —
 * `platform.knob_resolve(f, k, null)` — because `platform.knob_scope_kind` has no `system`
 * rung and never did.
 */
export type GuardVerdict = "off" | "owner-on";

export async function assertGuardResolvesOff(
  query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>,
  guard: { feature: string; key: string },
  filename: string,
): Promise<GuardVerdict> {
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
  if (v === "false") return "off";

  const id = `${guard.feature}/${guard.key}`;
  if (v === "true" && KNOBS_THE_OWNER_TURNED_ON.includes(id)) {
    // NOTHING FAILS SILENTLY, and nothing passes silently either. The file is applied, and
    // the operator is told in the same breath that its guard is no longer holding anything
    // back — because the sentence this gate used to print ("the old path is untouched until
    // the switch") would now be a lie.
    process.stderr.write(
      `\n  🚨 ${filename}: its guard ${id} resolves TRUE — the owner turned this switch ON.\n` +
        `     This file is NOT being applied behind a closed switch. Whatever it lands is LIVE\n` +
        `     the moment it commits, for every organization that has not turned ${id} off itself.\n` +
        `     Applying anyway, because refusing would offer no remedy but undoing the ruling.\n\n`,
    );
    // THE CALLER MUST NOT PRINT "the old path is untouched" AFTER THIS. That is why the
    // verdict is returned rather than swallowed: a runner that says "resolves false" over a
    // knob that resolves true is a screen telling a lie, which is the one thing a screen
    // may never do.
    return "owner-on";
  }

  fail([
    `${filename}: its guard ${guard.feature}/${guard.key} resolves ${v || "(nothing)"}, not false.`,
    `  A guarded file lands on production only while its knob is OFF, so the old path is`,
    `  untouched until the switch. Seed or set the knob to false and re-run.`,
    `  (The one exception is a knob the OWNER has ruled ON — KNOBS_THE_OWNER_TURNED_ON in this`,
    `  file and in aidream's db/migration_target.py. ${guard.feature}/${guard.key} is not one of`,
    `  them, so a knob that is true here is a switch somebody threw without saying so.)`,
  ]);
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

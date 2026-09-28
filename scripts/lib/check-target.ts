/**
 * WHERE A CHECK RUNS: THE NIGHTLY CLONE BY DEFAULT, LIVE ONLY WHEN ASKED AND ONLY BOUNDED.
 *
 * WHY (2026-09-27, common-docs/projects/database-workload-safety/incidents/2026-09-27-per-connection-memory.md).
 * The live database kept running out of memory: every warm connection costs it ~66 MB, and our
 * own verification work held connections for minutes — `check:store-doors-decide` alone ran
 * `custom.shared_only_disagreements(null)` for 4-10 minutes on live, many times a day, as
 * `postgres` through the pooler. A census, an equivalence sweep or a benchmark reads production's
 * data just as well on the nightly clone (a physical restore of production, quarantined), and
 * costs live nothing there. So:
 *
 *   - a heavy check calls `openCheckDb({ gate, defaultTarget: "clone" })` and runs on the clone
 *     unless the command line says `--target production`;
 *   - on production the gate ceiling is the live ceiling (30 s, `GATE_DB_LIMITS.liveStatementTimeoutMs`)
 *     and asking for more is refused before a socket opens (`gate-db.ts`);
 *   - EVERY run prints one `[TARGET]` line naming the database it ran against and, on the clone,
 *     when the clone was promoted — the clone is a day old and may trail live by a few
 *     migrations, and a clone result must never be read as a live one.
 *
 * THE CLONE'S IDENTITY is the one `pnpm db:apply --target clone` uses (`migration-target.ts`),
 * reused, not copied: the connection comes from `CLONE_DATABASE_URL` or CLONE-REF plus the
 * password file it names (never `SUPABASE_MATRIX_*`, which is production); the project ref read
 * from the CONNECTION must be the clone's and not its parent's, because the clone answers
 * `pg_control_system()` with production's own number; and after connecting the SERVER must answer
 * with the quarantine facts (pg_net absent AND no active pg_cron job), which production never
 * does. Production presented as the clone is refused on both halves.
 */
import { resolve } from "node:path";
import type pg from "pg";
import type { DbEnv } from "./direct-db-env";
import { isLiveConnection, loadDbEnvFrom } from "./direct-db-env";
import { GATE_DB_LIMITS, openGateDb } from "./gate-db";
import {
  type CloneRef,
  type QuarantineFacts,
  cloneRefOverride,
  loadCloneDbEnv,
  loadCloneRef,
  projectRefOf,
  readQuarantineFacts,
} from "./migration-target";

export type CheckTarget = "clone" | "production";
export const CHECK_TARGETS: readonly CheckTarget[] = ["clone", "production"] as const;

/** A check asked to run somewhere it may not, or could not prove where it is. Never caught and ignored. */
export class CheckTargetRefusal extends Error {
  readonly code: string;
  constructor(message: string, code = "check-target-refused") {
    super(`CHECK TARGET REFUSED: ${message}`);
    this.name = "CheckTargetRefusal";
    this.code = code;
  }
}

/**
 * `--target clone|production` (or `--target=…`). Absent means `fallback`. Anything else is
 * refused, never coerced — `branch` included: the rehearsal branch was deleted 2026-09-26.
 */
export function parseCheckTarget(
  argv: readonly string[],
  fallback: CheckTarget,
): { readonly target: CheckTarget; readonly explicit: boolean } {
  const i = argv.findIndex((a) => a === "--target" || a.startsWith("--target="));
  if (i < 0) return { target: fallback, explicit: false };
  const arg = argv[i]!;
  const value = arg === "--target" ? (argv[i + 1] ?? "") : arg.slice("--target=".length);
  if (!(CHECK_TARGETS as readonly string[]).includes(value)) {
    throw new CheckTargetRefusal(
      `--target ${value || "(nothing)"} is not a check target. Valid: --target clone (the nightly ` +
        "dev clone, the default for heavy checks) | --target production (live, every statement " +
        `capped at ${GATE_DB_LIMITS.liveStatementTimeoutMs / 1000} s).`,
      "check-target-unknown",
    );
  }
  return { target: value as CheckTarget, explicit: true };
}

/** `promoted` → a Date, or null when CLONE-REF does not carry a parseable one. */
export function parsePromoted(promoted: string): Date | null {
  if (!promoted.trim()) return null;
  const d = new Date(promoted.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "13h old", "2d 4h old", or the honest "promotion time unknown". */
export function cloneAge(promoted: string, now: Date = new Date()): string {
  const d = parsePromoted(promoted);
  if (!d) return "promotion time unknown (CLONE-REF carries no `promoted`)";
  const hours = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 3_600_000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h old` : `${hours}h old`;
}

/**
 * THE CONNECTION HALF of the clone's identity, before a socket opens: the project ref read from
 * the connection's user/host must be CLONE-REF's `clone_ref`, must not be its parent's, and must
 * not be a live ref at all. Exported for the unit test.
 */
export function assertConnectionIsClone(env: { user: string; host: string }, ref: CloneRef): void {
  const connRef = projectRefOf(env.user, env.host);
  if (!ref.cloneRef || ref.cloneRef === ref.parentRef) {
    throw new CheckTargetRefusal(
      `CLONE-REF (${ref.path}) names clone_ref ${ref.cloneRef || "(empty)"}, which is its own parent. ` +
        "Refusing rather than treating production as the clone.",
      "clone-ref-is-parent",
    );
  }
  if (connRef !== ref.cloneRef || connRef === ref.parentRef || isLiveConnection(env.user, env.host)) {
    throw new CheckTargetRefusal(
      `the connection is ${env.user}@${env.host} (project ref ${connRef || "(none)"}), which is not ` +
        `the dev clone ${ref.cloneRef} named in ${ref.path}. Refusing: the clone and production ` +
        "answer pg_control_system() identically, so the connection's ref is the proof, and it says no.",
      "connection-not-the-clone",
    );
  }
}

/** THE SERVER HALF: the quarantine facts, read after connecting. Exported for the unit test. */
export function assertQuarantined(facts: QuarantineFacts, ref: CloneRef): void {
  if (!facts.quarantined) {
    throw new CheckTargetRefusal(
      `the server reached as the clone ${ref.cloneRef} is NOT quarantined (pg_net ` +
        `${facts.pgNetInstalled ? "installed" : "absent"}, ${facts.activeCronJobs} active pg_cron ` +
        "job(s)). That is production's shape, never the clone's. Nothing was measured.",
      "clone-server-not-quarantined",
    );
  }
}

/** The one `[TARGET]` line. Exported for the unit test. */
export function targetBanner(
  gate: string,
  target: CheckTarget,
  where: { cloneRef?: CloneRef; liveRef?: string; explicit: boolean },
  now: Date = new Date(),
): string {
  if (target === "clone") {
    const r = where.cloneRef!;
    return (
      `[TARGET] ${gate}: the nightly CLONE ${r.cloneRef} (${r.cloneName}), promoted ` +
      `${r.promoted || "(unknown)"} — ${cloneAge(r.promoted, now)}. This is a CLONE result, not a ` +
      "live one: the clone may trail live by the migrations applied since it was promoted. " +
      "Live, bounded: --target production."
    );
  }
  return (
    `[TARGET] ${gate}: LIVE production ${where.liveRef || "(ref unknown)"}` +
    `${where.explicit ? " (--target production)" : " (this check's default)"} — every statement ` +
    `capped at ${GATE_DB_LIMITS.liveStatementTimeoutMs / 1000} s.`
  );
}

export interface ResolvedCheckDb {
  readonly target: CheckTarget;
  readonly explicit: boolean;
  readonly env: Pick<DbEnv, "host" | "port" | "user" | "password" | "database">;
  readonly cloneRef?: CloneRef;
  readonly from: string;
}

/** The repo root, from the working directory `pnpm` runs scripts in (no `import.meta`, jest-safe). */
function repoRoot(): string {
  return resolve(process.env.MATRX_FRONTEND_ROOT ?? process.cwd());
}

/** Resolve where this run goes and its credentials. Refuses; never falls back to the other target. */
export function resolveCheckDb(opts: {
  readonly argv?: readonly string[];
  readonly defaultTarget: CheckTarget;
  readonly root?: string;
}): ResolvedCheckDb {
  const argv = opts.argv ?? process.argv.slice(2);
  const root = opts.root ?? repoRoot();
  const { target, explicit } = parseCheckTarget(argv, opts.defaultTarget);
  if (target === "clone") {
    const ref = loadCloneRef(root, cloneRefOverride(argv));
    const env = loadCloneDbEnv(root, ref);
    assertConnectionIsClone(env, ref);
    return { target, explicit, env, cloneRef: ref, from: env.from };
  }
  const env = loadDbEnvFrom(root);
  if ("missing" in env) {
    throw new CheckTargetRefusal(
      `--target production needs ${env.missing.join(", ")}; looked in ${env.looked.join(", ") || "(nothing)"}.`,
      "production-env-missing",
    );
  }
  if (!isLiveConnection(env.user, env.host)) {
    throw new CheckTargetRefusal(
      `--target production, and SUPABASE_MATRIX_* (${env.from}) point at ${env.user}@${env.host}, ` +
        "which is not the live database. Refusing rather than reporting a live verdict from elsewhere.",
      "production-env-not-live",
    );
  }
  return { target, explicit, env, from: env.from };
}

export interface CheckDb {
  readonly client: pg.Client;
  readonly target: CheckTarget;
  readonly banner: string;
  /** Reconnect to the SAME target (a census that lost its connection). Re-proves the quarantine. */
  readonly reconnect: () => Promise<pg.Client>;
}

/**
 * Open ONE governed gate session on the resolved target, print the `[TARGET]` line, and — on the
 * clone — prove the server is quarantined before handing the client back.
 *
 * `statementTimeoutMs` above the live ceiling is fine on the clone and refused on production
 * (`gate-db.ts`); on production the ceiling defaults to the live ceiling.
 */
export async function openCheckDb(opts: {
  readonly gate: string;
  readonly defaultTarget: CheckTarget;
  readonly argv?: readonly string[];
  readonly statementTimeoutMs?: number;
  readonly statementTimeoutReason?: string;
  readonly log?: (line: string) => void;
}): Promise<CheckDb> {
  const resolved = resolveCheckDb({ argv: opts.argv, defaultTarget: opts.defaultTarget });
  const onClone = resolved.target === "clone";
  const banner = targetBanner(opts.gate, resolved.target, {
    cloneRef: resolved.cloneRef,
    liveRef: onClone ? undefined : projectRefOf(resolved.env.user, resolved.env.host),
    explicit: resolved.explicit,
  });
  (opts.log ?? console.log)(banner);
  const open = async (): Promise<pg.Client> => {
    const client = await openGateDb(resolved.env, {
      gate: opts.gate,
      // The raised ceiling is a clone privilege. On production the gate helper refuses anything
      // above the live ceiling, so it is passed through only on the clone.
      ...(onClone && opts.statementTimeoutMs
        ? { statementTimeoutMs: opts.statementTimeoutMs, statementTimeoutReason: opts.statementTimeoutReason }
        : {}),
    });
    if (onClone) {
      try {
        const facts = await readQuarantineFacts(
          (sql) => client.query(sql) as unknown as Promise<{ rows: Array<Record<string, unknown>> }>,
        );
        assertQuarantined(facts, resolved.cloneRef!);
      } catch (err) {
        await client.end().catch(() => undefined);
        throw err;
      }
    }
    return client;
  };
  const client = await open();
  return { client, target: resolved.target, banner, reconnect: open };
}

/**
 * The same resolution for a check written against a plain `connectDirect` client (its own
 * `begin`/`set local`/`rollback`). On production the client carries the production guard
 * (`production-guard.ts`: 30 s statements, nothing may loosen it); on the clone it is a plain
 * client and the server is proven quarantined before it is handed back. Prints the `[TARGET]` line.
 */
export async function connectCheckDirect(opts: {
  readonly gate: string;
  readonly defaultTarget: CheckTarget;
  readonly argv?: readonly string[];
  readonly log?: (line: string) => void;
}): Promise<{ readonly client: pg.Client; readonly target: CheckTarget; readonly banner: string }> {
  const resolved = resolveCheckDb({ argv: opts.argv, defaultTarget: opts.defaultTarget });
  const onClone = resolved.target === "clone";
  const banner = targetBanner(opts.gate, resolved.target, {
    cloneRef: resolved.cloneRef,
    liveRef: onClone ? undefined : projectRefOf(resolved.env.user, resolved.env.host),
    explicit: resolved.explicit,
  });
  (opts.log ?? console.log)(banner);
  // Loaded lazily: direct-db.ts locates the repo through import.meta, which ts-jest cannot compile,
  // and this module's pure half is unit-tested under jest.
  const { connectDirect } = await import("./direct-db");
  const client = await connectDirect({ ...resolved.env, from: resolved.from }, opts.gate);
  if (onClone) {
    try {
      const facts = await readQuarantineFacts(
        (sql) => client.query(sql) as unknown as Promise<{ rows: Array<Record<string, unknown>> }>,
      );
      assertQuarantined(facts, resolved.cloneRef!);
    } catch (err) {
      await client.end().catch(() => undefined);
      throw err;
    }
  }
  return { client, target: resolved.target, banner };
}

/**
 * A statement ceiling for THIS run: `ms` on the clone, never more than the live ceiling on
 * production (where the guard would refuse it). Use it in every `set local statement_timeout`.
 */
export function ceilingFor(target: CheckTarget, ms: number): string {
  const capped = target === "production" ? Math.min(ms, GATE_DB_LIMITS.liveStatementTimeoutMs) : ms;
  return capped % 1000 === 0 ? `${capped / 1000}s` : `${capped}ms`;
}

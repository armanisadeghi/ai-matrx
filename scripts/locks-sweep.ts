/**
 * `pnpm locks:sweep [--target branch|clone|production]` — WHAT IS HOLDING THE CAMPAIGN.
 * =====================================================================================
 *
 * §4.7 gave the chair a sweep: go and look for rows a finished lane left behind, and delete
 * them. Lane LOCK-HYGIENE (2026-09-22) made that sweep UNNECESSARY — every row carries a
 * bounded lease, an expired row blocks nobody, and the next lane's `campaign_watch.lock_take()`
 * evicts it and names its former holder. Nothing needs sweeping any more.
 *
 * It stays as a COMMAND because "nothing needs doing" is worth being able to SEE. This prints
 * every row with its state — `live` (it blocks) or `expired` (it blocks nobody) — plus how long
 * it has been held, how long since its last sign of life, and how much lease is left. Read-only
 * by construction: there is no delete in this file, because the take already does the only
 * eviction that is ever correct, at the only moment it is ever correct.
 *
 * Exit code is 0 whatever it finds. A held lock is the system working, and a command that goes
 * red because a lane is busy would be a false alarm every night.
 */
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  branchRefOverride,
  cloneRefOverride,
  loadBranchDbEnv,
  loadBranchRef,
  loadCloneDbEnv,
  loadCloneRef,
  TargetRefusal,
} from "./lib/migration-target";
import { loadDbEnvFrom } from "./lib/direct-db-env";
import { listBuildLocks, BuildLockLeaseAbsent, type LockQuery } from "./lib/build-lock";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ESC = String.fromCharCode(27);
const C = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
};

type Where = "branch" | "clone" | "production";

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function connectionFor(where: Where): Promise<{ client: pg.Client; label: string }> {
  if (where === "branch") {
    const ref = loadBranchRef(ROOT, branchRefOverride(process.argv));
    const env = loadBranchDbEnv(ROOT, ref);
    return {
      client: new pg.Client({ ...env, ssl: { rejectUnauthorized: false }, application_name: "locks:sweep" }),
      label: `the rehearsal branch ${ref.branchRef}`,
    };
  }
  if (where === "clone") {
    const ref = loadCloneRef(ROOT, cloneRefOverride(process.argv));
    const env = loadCloneDbEnv(ROOT, ref);
    return {
      client: new pg.Client({ ...env, ssl: { rejectUnauthorized: false }, application_name: "locks:sweep" }),
      label: `the dev clone ${ref.cloneRef}`,
    };
  }
  const env = loadDbEnvFrom(ROOT);
  if ("missing" in env) {
    throw new TargetRefusal(
      `--target production needs ${env.missing.join(", ")} and they are not set (looked in ` +
        `${env.looked.join(", ") || "nothing readable"}).`,
    );
  }
  return {
    client: new pg.Client({ ...env, ssl: { rejectUnauthorized: false }, application_name: "locks:sweep" }),
    label: `the MAIN database (${env.host})`,
  };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      `${C.bold}pnpm locks:sweep [--target branch|clone|production]${C.reset}\n` +
        `  Lists every campaign_watch.build_lock row with its state: \`live\` (it blocks other\n` +
        `  lanes) or \`expired\` (its lease has lapsed, it blocks nobody, and the next take evicts\n` +
        `  it by name). Read-only; always exits 0. --target defaults to branch, which is the\n` +
        `  database pnpm db:apply reads a lane's authorisation from.`,
    );
    return 0;
  }
  const i = argv.findIndex((a) => a === "--target" || a.startsWith("--target="));
  const raw =
    i === -1 ? "branch" : argv[i]!.includes("=") ? argv[i]!.split("=")[1]! : (argv[i + 1] ?? "");
  if (!["branch", "clone", "production"].includes(raw)) {
    console.error(`${C.red}--target must be branch, clone or production (got "${raw}").${C.reset}`);
    return 2;
  }
  const where = raw as Where;

  let conn;
  try {
    conn = await connectionFor(where);
  } catch (err) {
    console.error(`${C.red}${err instanceof Error ? err.message : String(err)}${C.reset}`);
    return 2;
  }
  const { client, label } = conn;
  try {
    await client.connect();
    const q: LockQuery = async (sql, params) => (await client.query(sql, params as never)).rows;
    const rows = await listBuildLocks(q, label);
    if (rows.length === 0) {
      console.log(`${C.green}No build_lock row on ${label}. Nothing is holding anything.${C.reset}`);
      return 0;
    }
    // Postgres prints an interval as `00:13:36.973147`; trim the fraction so the columns line up
    // and a human reads a duration instead of a microsecond count.
    const dur = (v: string) => v.replace(/\.\d+$/, "");
    const w = Math.max(9, ...rows.map((r) => r.lock_name.length));
    const h = Math.max(7, ...rows.map((r) => r.held_by.length));
    console.log(`${C.bold}campaign_watch.build_lock on ${label}${C.reset}`);
    console.log(
      `${C.dim}${pad("state", 9)}${pad("lock", w + 2)}${pad("held by", h + 2)}` +
        `${pad("held for", 12)}${pad("last beat", 12)}lease left${C.reset}`,
    );
    for (const r of rows) {
      const colour = r.state === "expired" ? C.dim : C.yellow;
      console.log(
        `${colour}${pad(r.state, 9)}${pad(r.lock_name, w + 2)}${pad(r.held_by, h + 2)}` +
          `${pad(dur(r.held_for), 12)}${pad(dur(r.since_heartbeat), 12)}` +
          `${r.state === "expired" ? "—" : dur(r.lease_left)}${C.reset}` +
          (r.note ? `\n${C.dim}         "${r.note}"${C.reset}` : ""),
      );
    }
    const live = rows.filter((r) => r.state === "live").length;
    const expired = rows.length - live;
    console.log(
      `\n${live} live, ${expired} expired. ` +
        (expired
          ? `${C.dim}An expired row blocks nobody — the next lane's campaign_watch.lock_take() ` +
            `evicts it and names its former holder. Nothing to do here.${C.reset}`
          : `${C.dim}Every row is a lane doing work right now.${C.reset}`),
    );
    return 0;
  } catch (err) {
    if (err instanceof BuildLockLeaseAbsent) {
      console.error(`${C.red}${err.message}${C.reset}`);
      return 2;
    }
    console.error(
      `${C.red}could not read the locks on ${label}: ` +
        `${err instanceof Error ? err.message : String(err)}${C.reset}`,
    );
    return 2;
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().then((code) => {
  process.exitCode = code;
});
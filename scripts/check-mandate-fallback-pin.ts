#!/usr/bin/env npx tsx
/**
 * THE FALLBACK MUST SURVIVE A PIN ADVANCE — liveness for
 * `mandate.clear_mandate_fallback_on_default_change`.
 *
 * WHAT IT PROTECTS
 * ----------------
 * `mandate.definition.fallback_mandate_key` — the job a mandate falls to when its
 * own holder cannot answer — against the BEFORE-UPDATE trigger that clears it.
 * The trigger means "you changed WHICH holder answers, so the fallback you chose
 * for the old one is void". Until migrations/agent_change_impact_02_fallback_
 * survives_pin_advance.sql it compared the whole TRIPLE
 * (default_holder_type, default_holder_id, default_holder_version_id), so
 * advancing the pin of the SAME agent from version N to version N+1 — which
 * changes only the third element — silently destroyed the fallback.
 *
 * And the writer could not defend itself: the trigger is BEFORE, so it overwrites
 * `new.fallback_mandate_key` AFTER the writer set it in the same statement. There
 * is no application-side fix. (R11, common-docs/projects/agent-change-impact/
 * REGISTER.md.)
 *
 * WHY IT CONSTRUCTS THE CONDITION INSTEAD OF READING PRODUCTION
 * -------------------------------------------------------------
 * Measured live 2026-09-12: 32 mandates carry a fallback, 189 carry a pin, and
 * the two sets are DISJOINT — `fallback_and_pinned = 0`. So no production row can
 * exhibit this defect today and a census would report a healthy system forever.
 * It is LATENT: it fires the first time anyone pins a mandate that has a fallback,
 * which is precisely what I3 (batch pin advance) is built to do at scale. The
 * only honest guard is one that builds the condition on a disposable row.
 *
 * WHY A DIRECT POSTGRES TRANSACTION THAT ROLLS BACK
 * -------------------------------------------------
 * The probe writes a real `mandate.definition` row through every real trigger on
 * that table and then throws the whole transaction away. Nothing is left behind —
 * not the row, not its `platform._version_capture` history, not its associations.
 * The connection is the same one `pnpm db:apply` uses (the five
 * SUPABASE_MATRIX_* variables), pinned and `RESET ROLE`d, because under a pooled
 * `SET ROLE` the triggers under test can fire for the wrong role.
 *
 * WHY A SOURCE SCAN WOULD PROVE NOTHING: the .sql file on disk looks identical
 * whether the live function body was replaced, reverted, or the trigger dropped.
 * The answer is in the catalog and in the row (db-rules FEATURE.md §1).
 *
 *   pnpm check:mandate-fallback-pin           # loud, exit 0
 *   pnpm check:mandate-fallback-pin:strict    # exit 1 on ANY finding (CI)
 *
 * PROVEN FAILING THEN PASSING, on the live database (2026-09-12):
 *   before the migration: fallback_survives_version_only_advance FAIL
 *     ("the pin advanced from version 29 to version 30 of the SAME agent and the
 *      fallback was nulled"), the other checks green.
 *   after the migration:  all five checks green.
 * The RED run was produced by the unfixed trigger itself — nothing in this script
 * or in the shared tree was weakened to produce it.
 *
 * 🚨 UNMEASURED IS NOT PASSED. No credentials, no connection, or no fixture to
 * build the probe from is a FAILURE under --strict and prints the same
 * `LIVE PULL FAILED` banner run-release-gates.sh already recognises. A guard that
 * cannot see the system reports that it cannot see it; it never reports green.
 *
 * Exit codes:
 *   0  every check ok, OR findings/unmeasured in default (advisory) mode
 *   1  findings or an unmeasured run AND --strict
 *   2  the script itself crashed
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");

/** A key no human mandate can collide with, and one this run alone owns. */
const PROBE_KEY = `guardrail.fallback_pin_probe_${Date.now().toString(36)}`;

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  ok: `${C.green}[ OK ]${C.reset} `,
};

interface Check {
  readonly key: string;
  readonly ok: boolean;
  readonly detail: string;
}
const checks: Check[] = [];
const record = (key: string, ok: boolean, detail: string) => checks.push({ key, ok, detail });

// ─────────────────────────────────────────────────────────────────────────────
// Connection — the same five variables, the same file order, as pnpm db:apply.
// ─────────────────────────────────────────────────────────────────────────────
const DB_VARS = [
  "SUPABASE_MATRIX_USER",
  "SUPABASE_MATRIX_PASSWORD",
  "SUPABASE_MATRIX_HOST",
  "SUPABASE_MATRIX_PORT",
  "SUPABASE_MATRIX_DATABASE_NAME",
] as const;

interface DbEnv {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
  from: string;
}

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]!] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function loadDbEnv(): DbEnv | null {
  const tryBag = (bag: Record<string, string | undefined>, from: string): DbEnv | null => {
    if (DB_VARS.some((k) => !bag[k])) return null;
    return {
      user: bag.SUPABASE_MATRIX_USER!,
      password: bag.SUPABASE_MATRIX_PASSWORD!,
      host: bag.SUPABASE_MATRIX_HOST!,
      port: Number(bag.SUPABASE_MATRIX_PORT!),
      database: bag.SUPABASE_MATRIX_DATABASE_NAME!,
      from,
    };
  };
  const fromProcess = tryBag(process.env, "the environment");
  if (fromProcess) return fromProcess;
  for (const path of [
    resolve(ROOT, ".env.local"),
    resolve(ROOT, ".env.production.local"),
    resolve(ROOT, ".env.production"),
    resolve(ROOT, ".env"),
    resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), ".env"),
  ]) {
    if (!existsSync(path)) continue;
    const hit = tryBag(parseEnvFile(path), relative(ROOT, path));
    if (hit) return hit;
  }
  return null;
}

function unmeasured(why: string, remedy: string): never {
  console.log("");
  console.log(`${C.red}${C.bold}LIVE PULL FAILED — THE FALLBACK/PIN GUARD IS UNMEASURED${C.reset}`);
  console.log(`${TAG.fail}${why}`);
  console.log(`${TAG.info}Remedy: ${remedy}`);
  console.log(
    `${TAG.info}Unmeasured is not passed: this run proved nothing about the live trigger.`,
  );
  process.exit(STRICT ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// The fixture — resolved from live rows, never hardcoded ids.
// ─────────────────────────────────────────────────────────────────────────────
interface Fixture {
  orgId: string;
  orgName: string;
  adminUid: string;
  agentId: string;
  agentName: string;
  versionLoId: string;
  versionLoNum: number;
  versionHiId: string;
  versionHiNum: number;
  otherAgentId: string;
  otherAgentName: string;
  fallbackKey: string;
}

async function resolveFixture(client: pg.Client): Promise<Fixture | string> {
  const admin = await client.query<{ id: string }>(
    `select id from auth.users where email = 'admin@admin.com' limit 1`,
  );
  if (!admin.rows[0]) return "no auth.users row for admin@admin.com";
  const adminUid = admin.rows[0].id;

  const org = await client.query<{ id: string; name: string }>(
    `select id, name from iam.organizations
      where created_by = $1
      order by (name = 'admin''s Workspace') desc, created_at asc
      limit 1`,
    [adminUid],
  );
  if (!org.rows[0]) return "admin@admin.com owns no organization to home the probe in";

  // The agent with the most versions among admin's own agents: two REAL versions
  // of ONE agent is the exact shape a pin advance moves between.
  const agent = await client.query<{
    agent_id: string;
    name: string;
    lo_id: string;
    lo_num: number;
    hi_id: string;
    hi_num: number;
  }>(
    `with ranked as (
       select v.agent_id, a.name,
              v.id as version_id, v.version_number,
              row_number() over (partition by v.agent_id order by v.version_number asc)  as asc_rn,
              row_number() over (partition by v.agent_id order by v.version_number desc) as desc_rn,
              count(*)    over (partition by v.agent_id) as n
       from agent.definition_version v
       join agent.definition a on a.id = v.agent_id
       where v.deleted_at is null and a.deleted_at is null and a.created_by = $1
     )
     select agent_id, name,
            (array_agg(version_id)     filter (where asc_rn  = 1))[1] as lo_id,
            (array_agg(version_number) filter (where asc_rn  = 1))[1] as lo_num,
            (array_agg(version_id)     filter (where desc_rn = 1))[1] as hi_id,
            (array_agg(version_number) filter (where desc_rn = 1))[1] as hi_num
     from ranked
     where n >= 2
     group by agent_id, name, n
     order by n desc
     limit 1`,
    [adminUid],
  );
  if (!agent.rows[0]) return "admin@admin.com owns no agent with two or more versions";

  const other = await client.query<{ id: string; name: string }>(
    `select id, name from agent.definition
      where created_by = $1 and deleted_at is null and id <> $2
      order by created_at asc limit 1`,
    [adminUid, agent.rows[0].agent_id],
  );
  if (!other.rows[0]) return "admin@admin.com owns no second agent to move the holder to";

  const fb = await client.query<{ mandate_key: string }>(
    `select mandate_key from mandate.definition where deleted_at is null order by mandate_key limit 1`,
  );
  if (!fb.rows[0]) return "mandate.definition is empty; no real key to use as a fallback";

  const r = agent.rows[0];
  return {
    orgId: org.rows[0].id,
    orgName: org.rows[0].name,
    adminUid,
    agentId: r.agent_id,
    agentName: r.name,
    versionLoId: r.lo_id,
    versionLoNum: Number(r.lo_num),
    versionHiId: r.hi_id,
    versionHiNum: Number(r.hi_num),
    otherAgentId: other.rows[0].id,
    otherAgentName: other.rows[0].name,
    fallbackKey: fb.rows[0].mandate_key,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`${C.bold}THE FALLBACK MUST SURVIVE A PIN ADVANCE${C.reset}  ${C.dim}(R11)${C.reset}`);

  const env = loadDbEnv();
  if (!env) {
    unmeasured(
      `the five SUPABASE_MATRIX_* variables were not found (looked in the environment, this repo's .env files, then ../aidream/.env).`,
      "run it where the database credentials are available; the same five variables pnpm db:apply uses.",
    );
  }
  console.log(`${TAG.info}Connection variables from ${C.bold}${env.from}${C.reset}.`);

  const client = new pg.Client({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    database: env.database,
    ssl: { rejectUnauthorized: false },
    application_name: "matrx-frontend check:mandate-fallback-pin",
    connectionTimeoutMillis: 15_000,
  });
  try {
    await client.connect();
  } catch (e) {
    unmeasured(
      `could not connect to ${env.host}:${env.port}/${env.database} — ${e instanceof Error ? e.message : String(e)}`,
      "check the credentials and network, then re-run.",
    );
  }

  let probeCommitted = false;
  try {
    // Supavisor pools in transaction mode: pin the server connection and prove
    // we are ourselves before any trigger fires (same reason as db:apply).
    await client.query("begin");
    await client.query("reset role");
    const who = await client.query<{ cu: string; su: string }>(
      `select current_user::text as cu, session_user::text as su`,
    );
    if (who.rows[0]!.cu !== who.rows[0]!.su) {
      await client.query("rollback");
      unmeasured(
        `the pooled connection is acting as '${who.rows[0]!.cu}' instead of '${who.rows[0]!.su}'; triggers would fire for the wrong role.`,
        "re-run; if it persists, the Supavisor pool is leaking SET ROLE between clients.",
      );
    }

    // ── 0. THE TRIGGER'S SHAPE, pinned ──────────────────────────────────────
    // A dropped trigger, or one recreated AFTER/STATEMENT, makes every behavioural
    // check below pass for the wrong reason: nothing clears anything.
    const trg = await client.query<{ def: string }>(
      `select pg_get_triggerdef(t.oid) as def
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where not t.tgisinternal
          and n.nspname = 'mandate' and c.relname = 'definition'
          and t.tgname = 'clear_mandate_fallback_on_default_change'`,
    );
    const def = trg.rows[0]?.def ?? "";
    const shapeOk =
      /BEFORE UPDATE OF default_holder_type, default_holder_id, default_holder_version_id/i.test(
        def,
      ) && /FOR EACH ROW/i.test(def);
    record(
      "trigger_installed",
      shapeOk,
      def
        ? shapeOk
          ? "BEFORE UPDATE OF the three holder columns, FOR EACH ROW, on mandate.definition."
          : `the trigger exists but its shape changed: ${def}`
        : "mandate.definition carries no clear_mandate_fallback_on_default_change trigger at all.",
    );

    const fx = await resolveFixture(client);
    if (typeof fx === "string") {
      await client.query("rollback");
      unmeasured(
        `the probe fixture could not be built — ${fx}.`,
        "this guard needs admin@admin.com to own an organization, an agent with at least two versions, and a second agent. Restore them and re-run.",
      );
    }
    console.log(
      `${TAG.info}Probe: mandate ${C.bold}${PROBE_KEY}${C.reset} in ${C.bold}${fx.orgName}${C.reset}, ` +
        `holder ${C.bold}${fx.agentName}${C.reset} v${fx.versionLoNum} -> v${fx.versionHiNum}, ` +
        `other holder ${C.bold}${fx.otherAgentName}${C.reset}, fallback '${fx.fallbackKey}'.`,
    );

    // ── The disposable row ───────────────────────────────────────────────────
    // `is_enabled = false` keeps mandate.guard_definition_holder's runnability
    // containment out of the way: that guard is a different invariant, it is
    // tested elsewhere, and a probe is not entitled to make the floor of a real
    // organization point at an agent its members may not hold.
    await client.query(
      `insert into mandate.definition
         (mandate_key, label, goal, origin, organization_id, created_by, updated_by,
          is_enabled, visibility, default_holder_type, default_holder_id,
          default_holder_version_id, fallback_mandate_key, metadata)
       values ($1, 'Fallback pin guard probe',
               'Prove that advancing a pin does not destroy a fallback.', 'user',
               $2, $3, $3, false, 'personal'::platform.visibility, 'agent', $4, $5, $6,
               jsonb_build_object('probe', 'check:mandate-fallback-pin'))`,
      [PROBE_KEY, fx.orgId, fx.adminUid, fx.agentId, fx.versionLoId, fx.fallbackKey],
    );

    const readFallback = async (): Promise<string | null> => {
      const r = await client.query<{ fallback_mandate_key: string | null }>(
        `select fallback_mandate_key from mandate.definition where mandate_key = $1`,
        [PROBE_KEY],
      );
      return r.rows[0]?.fallback_mandate_key ?? null;
    };
    /**
     * Re-arm between checks with an UPDATE that touches NONE of the three
     * trigger columns, so the trigger does not fire. Without this, a failed
     * check 1 leaves the fallback already null and checks 2 and 3 would report
     * "cleared" without the trigger doing anything — a false green.
     */
    const arm = async (): Promise<void> => {
      await client.query(
        `update mandate.definition set fallback_mandate_key = $2 where mandate_key = $1`,
        [PROBE_KEY, fx.fallbackKey],
      );
      if ((await readFallback()) !== fx.fallbackKey) {
        throw new Error("could not arm the probe: the fallback did not take on a plain write");
      }
    };

    if ((await readFallback()) !== fx.fallbackKey) {
      throw new Error("the probe row was inserted without its fallback; nothing below is testable");
    }

    // ── 1. THE DEFECT: a version-only advance of the SAME agent ─────────────
    await client.query(
      `update mandate.definition
          set default_holder_version_id = $2
        where mandate_key = $1`,
      [PROBE_KEY, fx.versionHiId],
    );
    const afterAdvance = await readFallback();
    record(
      "fallback_survives_version_only_advance",
      afterAdvance === fx.fallbackKey,
      afterAdvance === fx.fallbackKey
        ? `the pin advanced from version ${fx.versionLoNum} to version ${fx.versionHiNum} of ${fx.agentName} and the fallback '${fx.fallbackKey}' survived.`
        : `the pin advanced from version ${fx.versionLoNum} to version ${fx.versionHiNum} of the SAME agent (${fx.agentName}) and the fallback was ${afterAdvance === null ? "nulled" : `changed to '${afterAdvance}'`}. Nobody changed WHICH holder answers, so nothing about the chosen fallback became void. R11.`,
    );

    // ── 2. THE TRIGGER STILL DOES ITS REAL JOB: a different holder ──────────
    await arm();
    await client.query(
      `update mandate.definition
          set default_holder_id = $2, default_holder_version_id = null
        where mandate_key = $1`,
      [PROBE_KEY, fx.otherAgentId],
    );
    const afterHolderChange = await readFallback();
    record(
      "fallback_cleared_on_holder_change",
      afterHolderChange === null,
      afterHolderChange === null
        ? `moving the holder from ${fx.agentName} to ${fx.otherAgentName} cleared the fallback, as it must.`
        : `the holder moved from ${fx.agentName} to ${fx.otherAgentName} and the fallback stayed '${afterHolderChange}'. The fallback was chosen for a holder that no longer answers; the trigger has stopped working.`,
    );

    // ── 3. …and removing the holder entirely is also a holder change ────────
    await arm();
    await client.query(
      `update mandate.definition
          set default_holder_id = null, default_holder_version_id = null
        where mandate_key = $1`,
      [PROBE_KEY],
    );
    const afterHolderRemoved = await readFallback();
    record(
      "fallback_cleared_when_holder_removed",
      afterHolderRemoved === null,
      afterHolderRemoved === null
        ? "clearing the default holder cleared the fallback, as it must."
        : `the default holder was removed and the fallback stayed '${afterHolderRemoved}'. An identity comparison that ignores NULL is not an identity comparison.`,
    );

    // ── Throw the probe away, all of it ─────────────────────────────────────
    await client.query("rollback");

    // ── 4. …and prove from outside the transaction that it is gone ──────────
    const left = await client.query<{ n: string }>(
      `select count(*)::text as n from mandate.definition where mandate_key = $1`,
      [PROBE_KEY],
    );
    const leftN = Number(left.rows[0]?.n ?? "1");
    probeCommitted = leftN > 0;
    record(
      "probe_row_removed",
      leftN === 0,
      leftN === 0
        ? `no mandate.definition row named ${PROBE_KEY} exists after the rollback.`
        : `${leftN} probe row(s) named ${PROBE_KEY} survived the rollback and are live in the database.`,
    );
  } catch (e) {
    try {
      await client.query("rollback");
    } catch {
      /* the connection may already be gone; the transaction dies with it */
    }
    console.log("");
    console.log(`${TAG.fail}The probe could not be run: ${e instanceof Error ? e.message : String(e)}`);
    await client.end().catch(() => {});
    unmeasured(
      "the probe transaction failed before it could judge the trigger.",
      "read the error above; it is the verbatim database refusal.",
    );
  } finally {
    await client.end().catch(() => {});
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  console.log("");
  for (const c of checks) {
    console.log(`${c.ok ? TAG.ok : TAG.fail}${C.bold}${c.key}${C.reset} — ${c.detail}`);
  }
  const failed = checks.filter((c) => !c.ok);
  console.log("");
  if (failed.length === 0) {
    console.log(`${TAG.ok}${checks.length}/${checks.length} checks green.`);
    process.exit(0);
  }
  console.log(
    `${TAG.fail}${failed.length} of ${checks.length} checks FAILED: ${failed.map((f) => f.key).join(", ")}.`,
  );
  if (failed.some((f) => f.key === "fallback_survives_version_only_advance")) {
    console.log(
      `${TAG.info}Fix: migrations/agent_change_impact_02_fallback_survives_pin_advance.sql narrows ` +
        `mandate.clear_mandate_fallback_on_default_change() to compare holder IDENTITY ` +
        `(type + id) only. Apply it with pnpm db:apply.`,
    );
  }
  if (probeCommitted) {
    console.log(
      `${TAG.warn}Remove the leftover probe row by hand: delete from mandate.definition where mandate_key = '${PROBE_KEY}';`,
    );
  }
  process.exit(STRICT ? 1 : 0);
}

main().catch((e) => {
  console.error(`${TAG.fail}check:mandate-fallback-pin crashed: ${e instanceof Error ? e.stack : e}`);
  process.exit(2);
});

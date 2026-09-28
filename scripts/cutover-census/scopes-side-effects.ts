#!/usr/bin/env npx tsx
/**
 * THE SCOPES SIDE-EFFECTS CENSUS GUARD (lane SCOPES-SIDE-EFFECTS, SCOPES-CUTOVER-PLAN step 0.3).
 *
 * Every trigger on a `context.*` table does a job for somebody. The day the old scope tables stop
 * being written (plan 4.3.3) every one of those jobs stops with them, silently. The census
 * (`scopes-side-effects.census.json`, beside this file) names every trigger and rules on it:
 *   twin_exists — the record store already does this job for every Record, Field and Table
 *   needs_twin  — only the old tables did it; `twin` names what does it from the store
 *   dies        — a job of the image itself, and the reason says why nothing is lost
 *   stays       — reference data that is not dropped (templates, system context, …)
 *
 * This guard reads the LIVE catalogue and FAILS when:
 *   - a trigger on context.* is not in the census (UNLISTED — somebody added a side effect nobody ruled on)
 *   - a census row names a trigger that is gone, or that now calls a different function (STALE)
 *   - a needs_twin row names a twin function that does not exist, or the store's change-feed
 *     consumer (the zz_gridprim_record_events_s_i trigger on custom.io_outbox, whose function must call
 *     custom._context_side_effects) is missing or no longer calls it (TWIN MISSING)
 *
 *   npx tsx scripts/cutover-census/scopes-side-effects.ts                   production catalogue (read-only)
 *   npx tsx scripts/cutover-census/scopes-side-effects.ts --target clone    the dev clone
 *   npx tsx scripts/cutover-census/scopes-side-effects.ts --self-test       prove it can fail, offline
 *   npx tsx scripts/cutover-census/scopes-side-effects.ts --target clone --plant
 *        prove it fails LIVE: inside one transaction on the clone, plant a trigger on context.templates,
 *        run the guard against that transaction's catalogue, and roll back (never on production)
 *
 * Exit 0 green, 1 red, 2 could not measure.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import pg from "pg";
import { loadDbEnvFrom } from "../lib/direct-db-env";
import { guardIfProduction } from "../lib/production-guard";

const ROOT = resolve(import.meta.dirname, "..", "..");
const CENSUS_PATH = resolve(import.meta.dirname, "scopes-side-effects.census.json");
// The twins ride the store's existing change-feed consumer: this statement trigger on custom.io_outbox
// runs custom._record_events_to_activity, whose body must call custom._context_side_effects.
const CONSUMER_TRIGGER = { table: "custom.io_outbox", trigger: "zz_gridprim_record_events_s_i", calls: "custom._context_side_effects(" };
const RULINGS = new Set(["twin_exists", "needs_twin", "dies", "stays"]);

export interface CensusRow {
  table: string;
  trigger: string;
  function: string;
  ruling: string;
  plain: string;
  twin?: string;
}
export interface LiveTrigger {
  table: string;
  trigger: string;
  function: string;
}
export interface Catalogue {
  triggers: LiveTrigger[];
  functions: Set<string>;
  consumerTrigger: boolean;
}

const key = (t: { table: string; trigger: string }) => `${t.table} ${t.trigger}`;

/** The schema-qualified function names a twin sentence names (custom.x, platform.y). */
export function twinFunctions(twin: string): string[] {
  const out = new Set<string>();
  for (const m of twin.matchAll(/\b(custom|platform|public|iam|context)\.([a-z_][a-z0-9_]*)\b/g)) {
    const name = `${m[1]}.${m[2]}`;
    if (name === "custom.record" || name === "custom.io_outbox" || name === "history.record") continue;
    out.add(name);
  }
  return [...out];
}

export function judge(rows: CensusRow[], cat: Catalogue): string[] {
  const problems: string[] = [];
  const listed = new Map(rows.map((r) => [key(r), r]));
  for (const r of rows) {
    if (!RULINGS.has(r.ruling)) problems.push(`BAD ROW ${key(r)}: ruling "${r.ruling}" is not one of ${[...RULINGS].join(", ")}`);
    if (!r.plain?.trim()) problems.push(`BAD ROW ${key(r)}: no sentence says what the trigger does and why the ruling holds`);
    if (r.ruling === "needs_twin" && !r.twin?.trim()) problems.push(`BAD ROW ${key(r)}: needs a twin and names none`);
  }
  const live = new Map(cat.triggers.map((t) => [key(t), t]));
  for (const t of cat.triggers) {
    if (!listed.has(key(t))) {
      problems.push(`UNLISTED ${key(t)} (calls ${t.function}): a trigger on context.* nobody ruled on — add it to scopes-side-effects.census.json with twin_exists / needs_twin / dies / stays`);
    }
  }
  for (const r of rows) {
    const t = live.get(key(r));
    if (!t) problems.push(`STALE ${key(r)}: the census lists a trigger the catalogue no longer has — re-census`);
    else if (t.function !== r.function) problems.push(`STALE ${key(r)}: it now calls ${t.function}, the census says ${r.function} — re-rule it`);
  }
  let needsConsumer = false;
  for (const r of rows.filter((x) => x.ruling === "needs_twin")) {
    for (const fn of twinFunctions(r.twin ?? "")) {
      if (fn === "custom._context_side_effects") needsConsumer = true;
      if (!cat.functions.has(fn)) problems.push(`TWIN MISSING ${key(r)}: ${fn} does not exist on this database`);
    }
  }
  if (needsConsumer && !cat.consumerTrigger) {
    problems.push(`TWIN MISSING: the change-feed consumer ${CONSUMER_TRIGGER.trigger} on ${CONSUMER_TRIGGER.table} does not exist or its function no longer calls ${CONSUMER_TRIGGER.calls}...)`);
  }
  return problems;
}

// ── the database ──────────────────────────────────────────────────────────────────────────────

function readRef(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([a-z_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

async function connect(target: "production" | "clone"): Promise<pg.Client> {
  let cfg: pg.ClientConfig;
  if (target === "clone") {
    const ref = readRef(resolve(ROOT, "..", "common-docs/operations/clone/CLONE-REF"));
    cfg = { host: ref.pooler_host, port: 5432, user: ref.pooler_user, password: readFileSync(ref.password_file!, "utf8").trim(), database: ref.database };
  } else {
    const env = loadDbEnvFrom(ROOT);
    if ("missing" in env) throw new Error(`no database connection: ${env.missing.join(", ")}`);
    cfg = { host: env.host, port: env.port, user: env.user, password: env.password, database: env.database };
  }
  const client = guardIfProduction(
    new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false }, application_name: "scopes-side-effects-census", connectionTimeoutMillis: 15_000 }),
    "scopes-side-effects-census",
  );
  await client.connect();
  const active = Number((await client.query("select count(*) as n from cron.job where active")).rows[0].n);
  if (target === "clone" && active > 0) throw new Error("--target clone reached a database with active cron jobs; nothing measured");
  if (target === "production" && active === 0) throw new Error("--target production reached the clone; nothing measured");
  return client;
}

const TRIGGERS_SQL = `
  select 'context.' || c.relname as "table", t.tgname as "trigger", p.pronamespace::regnamespace::text || '.' || p.proname as "function"
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
   where n.nspname = 'context' and not t.tgisinternal
   order by 1, 2`;

async function readCatalogue(client: pg.Client, rows: CensusRow[]): Promise<Catalogue> {
  const triggers = (await client.query<LiveTrigger>(TRIGGERS_SQL)).rows;
  const wanted = [...new Set(rows.flatMap((r) => (r.ruling === "needs_twin" ? twinFunctions(r.twin ?? "") : [])))];
  const have = (
    await client.query<{ fn: string }>(
      `select n.nspname || '.' || p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname || '.' || p.proname = any($1::text[])`,
      [wanted],
    )
  ).rows.map((r) => r.fn);
  const consumer = await client.query(
    `select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = 'custom.io_outbox'::regclass and t.tgname = $1 and not t.tgisinternal
        and strpos(p.prosrc, $2) > 0`,
    [CONSUMER_TRIGGER.trigger, CONSUMER_TRIGGER.calls],
  );
  return { triggers, functions: new Set(have), consumerTrigger: (consumer.rowCount ?? 0) > 0 };
}

function loadCensus(): CensusRow[] {
  const doc = JSON.parse(readFileSync(CENSUS_PATH, "utf8")) as { rows: CensusRow[] };
  return doc.rows;
}

function report(problems: string[], rows: CensusRow[], where: string): number {
  const by = (r: string) => rows.filter((x) => x.ruling === r).length;
  if (problems.length === 0) {
    console.log(
      `GREEN — ${where}: all ${rows.length} triggers on context.* are ruled (${by("twin_exists")} twin exists, ${by("needs_twin")} twin built, ${by("dies")} die with the image, ${by("stays")} stay with reference data); every twin exists.`,
    );
    return 0;
  }
  console.error(`RED — ${where}: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--self-test")) return selfTest();
  const target = (argv.includes("--target") ? argv[argv.indexOf("--target") + 1] : "production") as "production" | "clone";
  if (target !== "production" && target !== "clone") throw new Error(`--target is production or clone, not ${target}`);
  const rows = loadCensus();
  const client = await connect(target);
  try {
    if (argv.includes("--plant")) {
      if (target !== "clone") throw new Error("--plant writes a trigger (rolled back) and runs on the clone only");
      await client.query("begin");
      try {
        await client.query("set local lock_timeout = '3s'");
        await client.query(
          "create trigger zz_planted_by_the_side_effects_guard before update on context.templates for each row execute function public.set_updated_at()",
        );
        const problems = judge(rows, await readCatalogue(client, rows));
        const caught = problems.some((p) => p.startsWith("UNLISTED context.templates zz_planted_by_the_side_effects_guard"));
        console.log(caught ? "PLANT RED (as it must be): the planted trigger is UNLISTED" : "PLANT: the planted trigger was NOT caught");
        for (const p of problems) console.log(`  ${p}`);
        return caught ? 0 : 1;
      } finally {
        await client.query("rollback");
      }
    }
    return report(judge(rows, await readCatalogue(client, rows)), rows, target);
  } finally {
    await client.end();
  }
}

function selfTest(): number {
  const rows = loadCensus();
  const clean: Catalogue = {
    triggers: rows.map((r) => ({ table: r.table, trigger: r.trigger, function: r.function })),
    functions: new Set(rows.flatMap((r) => (r.ruling === "needs_twin" ? twinFunctions(r.twin ?? "") : []))),
    consumerTrigger: true,
  };
  if (judge(rows, clean).length !== 0) {
    console.error("SELF-TEST RED: the census against its own catalogue is not green", judge(rows, clean));
    return 1;
  }
  const planted = { ...clean, triggers: [...clean.triggers, { table: "context.scopes", trigger: "zz_new_side_effect", function: "public.do_something" }] };
  if (!judge(rows, planted).some((p) => p.startsWith("UNLISTED context.scopes zz_new_side_effect"))) {
    console.error("SELF-TEST RED: a planted trigger on context.scopes was not UNLISTED");
    return 1;
  }
  const renamed = { ...clean, triggers: clean.triggers.map((t) => (t.trigger === "_search_item_sync" && t.table === "context.scopes" ? { ...t, function: "platform.other" } : t)) };
  if (!judge(rows, renamed).some((p) => p.startsWith("STALE context.scopes _search_item_sync"))) {
    console.error("SELF-TEST RED: a trigger that now calls another function was not STALE");
    return 1;
  }
  const noTwin = { ...clean, functions: new Set([...clean.functions].filter((f) => f !== "custom._ctx_scope_parent_holds")) };
  if (!judge(rows, noTwin).some((p) => p.includes("custom._ctx_scope_parent_holds does not exist"))) {
    console.error("SELF-TEST RED: a missing twin function was not TWIN MISSING");
    return 1;
  }
  if (!judge(rows, { ...clean, consumerTrigger: false }).some((p) => p.includes(CONSUMER_TRIGGER.trigger))) {
    console.error("SELF-TEST RED: a missing change-feed consumer trigger was not TWIN MISSING");
    return 1;
  }
  const unruled = rows.map((r, i) => (i === 0 ? { ...r, ruling: "later" } : r));
  if (!judge(unruled, clean).some((p) => p.startsWith("BAD ROW"))) {
    console.error("SELF-TEST RED: a row with no known ruling was accepted");
    return 1;
  }
  console.log("SELF-TEST GREEN — a planted trigger is UNLISTED, a re-pointed one STALE, a missing twin and a missing consumer TWIN MISSING, an unruled row BAD ROW; the census against its own catalogue is green.");
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`scopes side-effects census could not run: ${(e as Error).message}`);
    process.exit(2);
  },
);

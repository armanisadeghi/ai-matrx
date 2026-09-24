#!/usr/bin/env npx tsx
/**
 * `pnpm check:not-found-is-honest [--target production|clone|branch]` — A THING THAT IS NOT THERE,
 * OR NOT YOURS, ANSWERS "NOT FOUND", NEVER A SERVER FAULT.
 *
 * Lane ERRORS-HONEST, 2026-09-24. PostgREST answers SQLSTATE P0002 (no_data_found) with HTTP 500.
 * On that date 204 functions raised P0002 themselves (241 sites), so a person asking for an id that
 * does not exist, or one she was never given, got a server FAULT and every client page drew the
 * "something went wrong" screen instead of the honest not-found / no-access one. Measured as
 * test@test.com through production's REST: `500 {"code":"P0002",…}` for a table never given her.
 *
 * THE CONVENTION (migrations/campaign/errorshonest_s1_one_way_to_say_not_found.sql): a not-found is
 * raised ONE way, `perform platform.refuse_not_found(message, hint, detail)`. Inside a PostgREST
 * request it raises PostgREST's own error shape (HTTP 404, error code still P0002, same words);
 * called directly it raises exactly the P0002 it replaced, so the server (matrx-orm's
 * RecordNotAvailableError, the topical-map tool's not_found), every suite and every catching
 * function see what they always saw.
 *
 * THIS GATE reads every function body in the target database (outside pg_catalog,
 * information_schema, pgsodium, extensions and extension-owned functions) and FAILS BY NAME on:
 *   RAISES-P0002  a RAISE with errcode 'P0002' / 'no_data_found', `raise sqlstate 'P0002'`, or
 *                 `raise no_data_found` — anywhere but platform.refuse_not_found itself. It is a
 *                 superset of "client-callable": a helper no client may call is still reached
 *                 through a door that can, and the convention costs a server-only caller nothing.
 *   SECOND-SHAPE  a RAISE of SQLSTATE 'PGRST' anywhere but platform.refuse_not_found — a second way
 *                 to say not-found, which hands a direct caller a JSON blob under an unknown code.
 * Each finding prints whether a client role (anon / authenticated) holds EXECUTE on it.
 *
 * Read-only on every target (production is opened `read only`). `--self-test` proves the judge RED
 * and GREEN on fixed bodies, then (with `--target clone`) proves the LIVE census RED and GREEN on a
 * function created inside a transaction that is always rolled back.
 *
 * Not covered, by name: `select … into strict` with no handler also raises P0002 implicitly. That
 * is a different statement (a lookup the author asserted must hit), not a refusal the author wrote,
 * and it is not judged here; the lane's PROGRESS doc lists the client-granted ones.
 */
import { resolve } from "node:path";
import process from "node:process";
import pg from "pg";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { loadBranchDbEnv, loadBranchRef, loadCloneDbEnv, loadCloneRef } from "./lib/migration-target";
import { judgeBody } from "./lib/plpgsql-raise";

const ROOT = resolve(import.meta.dirname, "..");
const C = { x: "\x1b[0m", b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m" };
const HELPER = "platform.refuse_not_found";

type Target = "production" | "clone" | "branch";
function parseTarget(argv: string[]): Target {
  const i = argv.findIndex((a) => a === "--target" || a.startsWith("--target="));
  if (i < 0) return "production";
  const v = argv[i]!.includes("=") ? argv[i]!.split("=")[1] : argv[i + 1];
  if (v === "production" || v === "clone" || v === "branch") return v;
  console.error(`${C.r}--target must be production, clone or branch (got ${v}).${C.x}`);
  process.exit(2);
}

async function open(target: Target): Promise<pg.Client> {
  if (target === "production") {
    const env = loadDbEnv();
    if ("missing" in env) {
      console.error(`${C.r}UNMEASURED — production's connection variables are missing (${env.missing.join(", ")}); looked in ${env.looked.join(", ")}.${C.x}`);
      process.exit(2);
    }
    const c = await connectDirect(env, "check-not-found-is-honest");
    await c.query("set session characteristics as transaction read only");
    return c;
  }
  const env = target === "clone" ? loadCloneDbEnv(ROOT, loadCloneRef(ROOT)) : loadBranchDbEnv(ROOT, loadBranchRef(ROOT));
  const c = new pg.Client({ host: env.host, port: env.port, user: env.user, password: env.password, database: env.database, ssl: { rejectUnauthorized: false }, application_name: "check-not-found-is-honest" });
  await c.connect();
  return c;
}

const CENSUS_SQL = `
  select n.nspname || '.' || p.proname as qname,
         p.oid::regprocedure::text as sig,
         p.prosrc,
         (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')) as client
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
   where l.lanname = 'plpgsql'
     and n.nspname not in ('pg_catalog', 'information_schema', 'pgsodium', 'extensions')
     and n.nspname not like 'pg\\_%'
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and p.prosrc ~* '(p0002|no_data_found|pgrst)'`;

type Row = { qname: string; sig: string; prosrc: string; client: boolean };
type Hit = { sig: string; client: boolean; kind: string; count: number; first: string };

export function judgeRows(rows: Row[]): { hits: Hit[]; scanned: number; helperSeen: boolean } {
  const hits: Hit[] = [];
  let helperSeen = false;
  for (const r of rows) {
    if (r.qname === HELPER) { helperSeen = true; continue; }
    for (const f of judgeBody(r.prosrc)) hits.push({ sig: r.sig, client: r.client, kind: f.kind, count: f.count, first: f.first });
  }
  return { hits, scanned: rows.length, helperSeen };
}

async function census(c: pg.Client): Promise<{ hits: Hit[]; scanned: number; helperSeen: boolean }> {
  const r = await c.query<Row>(CENSUS_SQL);
  return judgeRows(r.rows);
}

function report(target: Target, res: { hits: Hit[]; scanned: number; helperSeen: boolean }): number {
  const sites = res.hits.reduce((s, h) => s + h.count, 0);
  if (!res.hits.length) {
    console.log(`${C.g}✓ not-found is honest on ${target}${C.x}: ${res.scanned} candidate bodies read; no function raises P0002 itself, and none raises PostgREST's shape but ${HELPER}${res.helperSeen ? "" : ` ${C.y}(${HELPER} is not on this database yet)${C.x}`}.`);
    return 0;
  }
  const fns = new Set(res.hits.map((h) => h.sig)).size;
  const client = new Set(res.hits.filter((h) => h.client).map((h) => h.sig)).size;
  console.log(`${C.r}${C.b}✗ ${fns} function(s) on ${target} still answer a not-found as a server fault${C.x} (${sites} raise site(s); ${client} client-granted, ${fns - client} reached through a door):`);
  for (const h of res.hits) console.log(`  ${h.kind.padEnd(13)} ${h.client ? "client " : "door   "} ${h.sig}  ×${h.count}\n  ${C.d}              ${h.first}${C.x}`);
  console.log(`\n  Remedy: raise it as ${C.b}perform ${HELPER}(<sentence>, <hint>, <detail>);${C.x} — through PostgREST that is HTTP 404 with`);
  console.log(`  error code P0002, called directly it is the same P0002. A new campaign file with a -- based-on line per`);
  console.log(`  function; rewriteNotFoundRaises() in scripts/lib/plpgsql-raise.ts does the rewrite (errorshonest_s2 … _s7 are its output).`);
  return 1;
}

// ── self-test ────────────────────────────────────────────────────────────────────────────────────
const RED_BODIES: Array<[string, string]> = [
  ["errcode P0002 after a format", `begin if not found then raise exception 'topic % not found', p_slug using errcode = 'P0002'; end if; end`],
  ["errcode no_data_found", `begin RAISE EXCEPTION 'folder % not found', p_id USING ERRCODE = 'no_data_found'; end`],
  ["USING-only form with a hint", `begin raise exception using errcode = 'P0002', message = 'That site does not exist.', hint = 'Open it from the list.'; end`],
  ["raise sqlstate 'P0002'", `begin raise sqlstate 'P0002' using message = 'gone'; end`],
  ["raise no_data_found", `begin raise no_data_found; end`],
  ["inline PostgREST shape (second shape)", `begin raise sqlstate 'PGRST' using message = '{"code":"P0002","message":"x"}', detail = '{"status":404}'; end`],
];
const GREEN_BODIES: Array<[string, string]> = [
  ["the convention", `begin if not found then perform platform.refuse_not_found(format('topic %s not found', p_slug)); end if; end`],
  ["P0002 only in a comment", `begin -- raise exception 'x' using errcode = 'P0002';\n return 1; end`],
  ["P0002 only in a string", `begin return jsonb_build_object('code', 'P0002'); end`],
  ["a handler that CATCHES no_data_found", `begin select 1 into strict v; exception when no_data_found then return null; end`],
  ["another code", `begin raise exception 'Authentication required' using errcode = '42501'; end`],
  ["P0002 in a dollar-quoted string", `begin execute $q$ raise exception 'x' using errcode = 'P0002' $q$; end`],
];

async function selfTest(target: Target | null): Promise<number> {
  let bad = 0;
  for (const [name, body] of RED_BODIES) {
    const ok = judgeBody(body).length > 0;
    console.log(`  ${ok ? `${C.g}RED  ok${C.x}` : `${C.r}RED  MISSED${C.x}`}  ${name}`);
    if (!ok) bad++;
  }
  for (const [name, body] of GREEN_BODIES) {
    const ok = judgeBody(body).length === 0;
    console.log(`  ${ok ? `${C.g}GREEN ok${C.x}` : `${C.r}GREEN FALSE-RED${C.x}`}  ${name}`);
    if (!ok) bad++;
  }
  const helperExempt = judgeRows([{ qname: HELPER, sig: `${HELPER}(text,text,text)`, prosrc: `begin raise exception using errcode = 'P0002', message = p_message; end`, client: true }]).hits.length === 0;
  console.log(`  ${helperExempt ? `${C.g}GREEN ok${C.x}` : `${C.r}GREEN FALSE-RED${C.x}`}  the convention's own body is exempt, and only it`);
  if (!helperExempt) bad++;
  if (target && target !== "production") {
    // LIVE arm: the census, not only the judge, sees a planted function and then its fix.
    const c = await open(target);
    try {
      await c.query("begin");
      await c.query("set local lock_timeout = '5s'");
      await c.query(`create schema if not exists errorshonest_selftest`);
      await c.query(`create function errorshonest_selftest.open_note(p_id uuid) returns text language plpgsql as $f$
        begin raise exception 'note % is not available to this account', p_id using errcode = 'P0002'; end $f$`);
      await c.query(`grant usage on schema errorshonest_selftest to authenticated; grant execute on function errorshonest_selftest.open_note(uuid) to authenticated`);
      const red = (await census(c)).hits.some((h) => h.sig.startsWith("errorshonest_selftest.open_note") && h.client);
      await c.query(`create or replace function errorshonest_selftest.open_note(p_id uuid) returns text language plpgsql as $f$
        begin perform platform.refuse_not_found(format('note %s is not available to this account', p_id)); return null; end $f$`);
      const green = !(await census(c)).hits.some((h) => h.sig.startsWith("errorshonest_selftest.open_note"));
      console.log(`  ${red ? `${C.g}RED  ok${C.x}` : `${C.r}RED  MISSED${C.x}`}  LIVE on ${target}: a planted client-granted door raising P0002 is named`);
      console.log(`  ${green ? `${C.g}GREEN ok${C.x}` : `${C.r}GREEN FALSE-RED${C.x}`}  LIVE on ${target}: the same door through the convention is not`);
      if (!red) bad++;
      if (!green) bad++;
    } finally {
      await c.query("rollback").catch(() => {});
      await c.end();
    }
  } else {
    console.log(`  ${C.d}(live arm skipped: pass --target clone or --target branch to run it; it never runs on production)${C.x}`);
  }
  console.log(bad ? `${C.r}✗ self-test: ${bad} arm(s) wrong${C.x}` : `${C.g}✓ self-test: every arm as expected${C.x}`);
  return bad ? 1 : 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const target = parseTarget(argv);
  if (argv.includes("--self-test")) {
    const explicit = argv.some((a) => a.startsWith("--target"));
    process.exit(await selfTest(explicit ? target : null));
  }
  const c = await open(target);
  try {
    process.exitCode = report(target, await census(c));
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(`${C.r}UNMEASURED — ${e?.message ?? e}${C.x}`);
  process.exit(2);
});

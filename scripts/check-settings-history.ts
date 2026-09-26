/**
 * pnpm check:settings-history — the settings change log, proven live.
 *
 * Every knob/setting write lands exactly ONE row in `platform.knob_override_audit`,
 * labelled with the door it came through, and the two read doors answer from it:
 *
 *   ui         a signed-in browser request (PostgREST with Origin)      → door 'ui'
 *   api        a signed-in request without a browser (supabase-js/node) → door 'api'
 *   server     a direct connection impersonating a person (matrx-orm)   → door 'server'
 *   migration  a direct connection that declared app.write_door         → door 'migration'
 *   platform   platform.feature_knob changed (inside a rolled-back txn) → scope_kind 'platform'
 *   no-op      writing the value already there                           → 0 rows
 *   history    platform.knob_history returns them, newest first, door + who
 *   revert     "Revert to this" = the same door with the old value     → 1 row, value restored
 *   export     platform.knob_configuration now + as_of replay
 *
 * Runs as admin@admin.com on its own workspace organization, on a loop-guard knob, and
 * restores the organization's previous value at the end (success or failure). Needs
 * .env.local (Supabase URL/key + AI_ADMIN_*) and the SUPABASE_MATRIX_* direct connection.
 * Prints UNMEASURED and exits 2 when either is missing — never a silent pass.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { connectDirect, loadDbEnv } from "./lib/direct-db";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORG = process.env.SETTINGS_HISTORY_ORG ?? "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
const FEATURE = "orchestration.loop_guard";
const KEY = "min_calls_before_check";

function env(): Record<string, string> {
  const out: Record<string, string> = { ...(process.env as Record<string, string>) };
  const path = resolve(ROOT, ".env.local");
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !out[m[1]!]) out[m[1]!] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
    }
  }
  return out;
}

let failures = 0;
function check(ok: boolean, what: string, detail?: unknown) {
  if (ok) console.log(`  PASS  ${what}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

async function main() {
  const e = env();
  const url = e.NEXT_PUBLIC_SUPABASE_URL;
  const key = e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? e.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const db = loadDbEnv();
  if (!url || !key || !e.AI_ADMIN_USERNAME || !e.AI_ADMIN_PASSWORD || "missing" in db) {
    console.log("UNMEASURED: needs .env.local (Supabase URL/key, AI_ADMIN_*) and SUPABASE_MATRIX_*.");
    process.exit(2);
  }

  const signIn = async (headers: Record<string, string>) => {
    const sb = createClient(url, key, { auth: { persistSession: false }, global: { headers } });
    const { data, error } = await sb.auth.signInWithPassword({ email: e.AI_ADMIN_USERNAME!, password: e.AI_ADMIN_PASSWORD! });
    if (error || !data.user) throw new Error(`sign-in failed: ${error?.message}`);
    return { sb, uid: data.user.id };
  };
  const browser = await signIn({ Origin: "http://settings-history.localhost:3001", Referer: "http://settings-history.localhost:3001/" });
  const api = await signIn({});
  const uid = api.uid;
  const pgc = await connectDirect(db, "check:settings-history");

  const count = async (since: string) => {
    const r = await pgc.query(
      `select count(*)::int n, array_agg(door order by id) doors from platform.knob_override_audit
        where feature=$1 and key=$2 and organization_id=$3 and scope_kind='organization' and at > $4::timestamptz`,
      [FEATURE, KEY, ORG, since],
    );
    return r.rows[0] as { n: number; doors: string[] | null };
  };
  const now = async () => (await pgc.query("select clock_timestamp()::text t")).rows[0].t as string;
  const set = (client: SupabaseClient, value: unknown) =>
    client.schema("platform").rpc("knob_override_set", {
      p_feature: FEATURE, p_key: KEY, p_scope_kind: "organization", p_scope_id: ORG,
      p_organization_id: ORG, p_value: value, p_note: "check:settings-history",
    });

  const original = (await pgc.query(
    `select value from platform.knob_override where feature=$1 and key=$2 and scope_kind='organization' and organization_id=$3 and scope_id=$3`,
    [FEATURE, KEY, ORG],
  )).rows[0]?.value ?? null;
  const base = Number((await pgc.query(`select coalesce(value, default_value) v from platform.feature_knob where feature=$1 and key=$2`, [FEATURE, KEY])).rows[0].v);
  const A = base + 3, B = base + 4, C = base + 5, D = base + 6;

  try {
    const t0 = await now();
    console.log(`settings history on ${FEATURE}.${KEY} @ ${ORG} (platform ${base}, org had ${JSON.stringify(original)})`);

    const r1 = await set(browser.sb, A);
    check(!r1.error && (r1.data as { ok: boolean }).ok, "ui door write accepted", r1.error ?? r1.data);
    let c = await count(t0);
    check(c.n === 1 && c.doors?.[0] === "ui", "ui door → exactly one row, door=ui", c);
    const tA = await now();

    await set(api.sb, B);
    c = await count(t0);
    check(c.n === 2 && c.doors?.[1] === "api", "api door → exactly one more row, door=api", c);

    await set(api.sb, B);
    c = await count(t0);
    check(c.n === 2, "writing the value already there adds no row", c);

    // server: a direct connection impersonating the person, the matrx-orm rls_session shape.
    await pgc.query("begin");
    await pgc.query(`select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
      [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await pgc.query(`select platform.knob_override_set($1,$2,'organization',$3,$3,$4::jsonb,'check:settings-history')`, [FEATURE, KEY, ORG, JSON.stringify(C)]);
    await pgc.query("commit");
    c = await count(t0);
    check(c.n === 3 && c.doors?.[2] === "server", "direct impersonating connection → one row, door=server", c);

    // migration: the runners declare app.write_door.
    await pgc.query("begin");
    await pgc.query(`select set_config('app.write_door','migration',true), set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await pgc.query(`select platform.knob_override_set($1,$2,'organization',$3,$3,$4::jsonb,'check:settings-history')`, [FEATURE, KEY, ORG, JSON.stringify(D)]);
    await pgc.query("commit");
    c = await count(t0);
    check(c.n === 4 && c.doors?.[3] === "migration", "declared migration door → one row, door=migration", c);

    // platform rung, inside a transaction that is rolled back (no platform value changes).
    await pgc.query("begin");
    const before = (await pgc.query(`select count(*)::int n from platform.knob_override_audit where feature=$1 and key=$2 and scope_kind='platform'`, [FEATURE, KEY])).rows[0].n;
    await pgc.query(`update platform.feature_knob set value = to_jsonb($3::int) where feature=$1 and key=$2`, [FEATURE, KEY, base + 1]);
    await pgc.query(`update platform.feature_knob set updated_at = now() where feature=$1 and key=$2`, [FEATURE, KEY]);
    const after = (await pgc.query(`select count(*)::int n, (array_agg(door order by id desc))[1] door, (array_agg(old_value order by id desc))[1] old from platform.knob_override_audit where feature=$1 and key=$2 and scope_kind='platform'`, [FEATURE, KEY])).rows[0];
    await pgc.query("rollback");
    check(after.n === before + 1 && Number(after.old) === base, "platform value change → exactly one platform row (a no-op touch adds none)", { before, after });

    // history
    const h = await api.sb.schema("platform").rpc("knob_history", {
      p_feature: FEATURE, p_key: KEY, p_organization_id: ORG, p_scope_kind: "organization", p_scope_id: ORG, p_limit: 10,
    });
    const entries = ((h.data as { entries?: Array<{ door: string; new_value: unknown; actor_name: string | null; is_this_rung: boolean }> } | null)?.entries ?? [])
      .filter((x) => x.is_this_rung);
    check(!h.error && entries.slice(0, 4).map((x) => x.door).join(",") === "migration,server,api,ui",
      "knob_history lists them newest first with their doors", h.error ?? entries.slice(0, 4).map((x) => x.door));
    check(entries[0]?.actor_name != null, "knob_history names who made the change", entries[0]);

    // revert to the ui entry's value, through the same door the row uses
    const uiEntry = entries.find((x) => x.door === "ui");
    const before2 = (await count(t0)).n;
    await set(browser.sb, uiEntry?.new_value);
    const cur = (await pgc.query(`select value from platform.knob_override where feature=$1 and key=$2 and scope_kind='organization' and organization_id=$3 and scope_id=$3`, [FEATURE, KEY, ORG])).rows[0]?.value;
    check(Number(cur) === A && (await count(t0)).n === before2 + 1, "revert writes the old value through the door, one row", { cur });

    // export now + replay
    const exNow = await api.sb.schema("platform").rpc("knob_configuration", { p_organization_id: ORG });
    const k = ((exNow.data as { knobs: Array<{ key: string; effective_value: unknown; origin: string; platform_value: unknown }> }).knobs ?? [])
      .find((x) => x.key === `${FEATURE}.${KEY}`);
    check(!exNow.error && Number(k?.effective_value) === A && k?.origin === "organization", "export: effective value + origin now", exNow.error ?? k);
    const exA = await api.sb.schema("platform").rpc("knob_configuration", { p_organization_id: ORG, p_as_of: tA });
    const kA = ((exA.data as { knobs: Array<{ key: string; effective_value: unknown }> }).knobs ?? []).find((x) => x.key === `${FEATURE}.${KEY}`);
    check(!exA.error && Number(kA?.effective_value) === A, "export as_of replays the value at that moment", exA.error ?? kA);
    const ex0 = await api.sb.schema("platform").rpc("knob_configuration", { p_organization_id: ORG, p_as_of: t0 });
    const k0 = ((ex0.data as { knobs: Array<{ key: string; effective_value: unknown }> }).knobs ?? []).find((x) => x.key === `${FEATURE}.${KEY}`);
    const expected0 = original === null ? base : Number(original);
    check(!ex0.error && Number(k0?.effective_value) === expected0, "export as_of before the test replays the original", { k0, expected0 });

    // access: another organization's history is refused for a non-member
    const foreign = await api.sb.schema("platform").rpc("knob_history", {
      p_feature: FEATURE, p_key: KEY, p_organization_id: "00000000-0000-4000-8000-000000000001",
    });
    check(Boolean(foreign.error), "knob_history refuses an organization the caller does not belong to", foreign.data);
  } finally {
    await set(api.sb, original);
    await pgc.end();
  }

  console.log(failures === 0 ? "\nsettings history: all checks passed" : `\nsettings history: ${failures} check(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

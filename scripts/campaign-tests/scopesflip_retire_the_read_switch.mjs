#!/usr/bin/env node
/**
 * LANE 9 SCOPES-ON-THE-STORE (the flip) — RETIRE THE SCOPE READ SWITCH THROUGH ITS OWN DOORS.
 *
 *   node scripts/campaign-tests/scopesflip_retire_the_read_switch.mjs --target clone        # rehearsal
 *   node scripts/campaign-tests/scopesflip_retire_the_read_switch.mjs --target production   # after scopesflip_b is live
 *
 * The knob `custom.scope_readers_read_the_store` is retired the canonical way, never by SQL:
 *   1. every override row is CLEARED by the person who owns it, through `platform.knob_override_set`
 *      (value null — the door's own clearing path, which the audit trigger records). Only the two test seats'
 *      rows can be cleared here; any other owner's row stops the run and is named.
 *   2. the register row is ARCHIVED by a platform admin (admin@admin.com) through `platform.knob_archive`, which
 *      itself refuses while any database function still reads the pair (`platform.knob_live_readers`) — so this
 *      run cannot retire the switch before scopesflip_b's bodies are live.
 * Credentials come from .env.local / .env (AI_ADMIN_* / AI_MEMBER_*) and are never printed. Exit 0 done, 1 refused.
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..", "..");
const require = createRequire(resolve(ROOT, "package.json"));
const { createClient } = require("@supabase/supabase-js");
const target = process.argv[process.argv.indexOf("--target") + 1];
if (!["clone", "production"].includes(target)) throw new Error("--target clone | production");

const env = {};
const files = target === "clone" ? [".env.clone.local", ".env.local", ".env"] : [".env.local", ".env"];
for (const f of files) {
  const p = resolve(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const want = target === "clone" ? readFileSync(resolve(ROOT, "../common-docs/operations/clone/CLONE-REF"), "utf8").match(/[a-z]{20}/)?.[0] : "brsgrqvjdzwihsvnfqkf";
const isTarget = target === "clone" ? url?.includes(want) : url?.includes(want) || url?.includes("db.matrxserver.com");
if (!url || !key || !isTarget) throw new Error(`REFUSED: the ${target} URL is not ${want}`);

const FEATURE = "custom";
const KEY = "scope_readers_read_the_store";
async function seat(user, pass, adminLane = false) {
  // The admin seat opens the admin lane the way the admin console's Limits & Knobs page does
  // (`x-matrx-admin-lane: 1`, utils/supabase/adminLane.ts): knob_archive is a platform-admin act.
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: adminLane ? { headers: { "x-matrx-admin-lane": "1" } } : undefined,
  });
  const { data, error } = await c.auth.signInWithPassword({ email: user, password: pass });
  if (error) throw new Error(`sign-in refused for a test seat: ${error.message}`);
  return { c, id: data.user.id };
}
const admin = await seat(env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, true);
const member = await seat(env.AI_MEMBER_USERNAME, env.AI_MEMBER_PASSWORD);
const seats = new Map([[admin.id, admin], [member.id, member]]);

let refused = 0;
const { data: overrides, error: ovErr } = await admin.c
  .schema("platform")
  .from("knob_override")
  .select("scope_kind, scope_id, organization_id")
  .eq("feature", FEATURE)
  .eq("key", KEY);
if (ovErr) throw new Error(`reading the overrides: ${ovErr.message}`);
console.log(`# ${target}: ${overrides.length} override row(s) on ${FEATURE}.${KEY}`);
for (const o of overrides) {
  const owner = o.scope_kind === "user" ? seats.get(o.scope_id) : null;
  if (!owner) {
    refused++;
    console.log(`REFUSED: an override at ${o.scope_kind} ${o.scope_id} is not a test seat's own row — its owner (or an org admin) clears it in Settings.`);
    continue;
  }
  const { error } = await owner.c.schema("platform").rpc("knob_override_set", {
    p_feature: FEATURE, p_key: KEY, p_scope_kind: "user", p_scope_id: o.scope_id,
    p_organization_id: o.organization_id, p_value: null,
    p_note: "The scope read switch is retired (lane 9 flip): scopes read from the record store only.",
  });
  console.log(error ? `REFUSED clear ${o.scope_id.slice(0, 8)}@${String(o.organization_id).slice(0, 8)}: ${error.message}` : `cleared ${o.scope_id.slice(0, 8)}@${String(o.organization_id).slice(0, 8)}`);
  if (error) refused++;
}
if (refused) process.exit(1);
const { data: archived, error: aErr } = await admin.c.schema("platform").rpc("knob_archive", {
  p_feature: FEATURE, p_key: KEY,
  p_reason: "Retired by the scopes flip (lane 9 SCOPES-ON-THE-STORE, 2026-10-03): every scope reader, web, server and database, reads the record store only; nothing decides between two paths any more.",
  p_lane: "SCOPES-ON-THE-STORE",
});
if (aErr) {
  console.log(`REFUSED archive: ${aErr.message}${aErr.hint ? ` (${aErr.hint})` : ""}`);
  process.exit(1);
}
console.log(`archive: ${JSON.stringify(archived)}`);

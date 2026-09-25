// LANE SCOPE-ADMIN-2 — the disposable organization the admin-lane walk opens.
// As test@test.com (the non-admin seat), through the same RPC doors the app uses:
//   node scripts/scope-admin-2-disposable-org.mjs setup     → creates "Coastal Pool Service"
//        with one scope type ("Service Route", one scope) and prints its id
//   node scripts/scope-admin-2-disposable-org.mjs archive <orgId>  → archives it (soft; never deleted)
//   node scripts/scope-admin-2-disposable-org.mjs archive-own-type <typeId> → admin archives its own lens-step type
// admin@admin.com is not a member, which is the point.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const [cmd, arg] = process.argv.slice(2);
// `archive-own-type <typeId>` archives a scope type admin@admin.com made in its OWN workspace (the lens step).
const seat = cmd === "archive-own-type"
  ? { email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD }
  : { email: "test@test.com", password: process.env.TEST_SEAT_PASSWORD };
const { error: signErr } = await sb.auth.signInWithPassword(seat);
if (signErr) throw signErr;
const NAME = "Coastal Pool Service";
if (cmd === "setup") {
  const slug = `coastal-pool-service-${Date.now().toString(36)}`;
  const { data: org, error } = await sb.rpc("org_create", { p_name: NAME, p_slug: slug, p_description: "Residential pool cleaning and repair, north county" });
  if (error) throw error;
  const orgId = org.id ?? org.organization_id ?? org;
  const { data: type, error: e2 } = await sb.rpc("create_scope_type", { p_org_id: orgId, p_label_singular: "Service Route", p_label_plural: "Service Routes", p_description: "Weekly cleaning routes" });
  if (e2) throw e2;
  const { error: e3 } = await sb.rpc("create_scope", { p_org_id: orgId, p_type_id: type.id, p_name: "Carlsbad Tuesday", p_description: "Twelve homes, Tuesday mornings" });
  if (e3) throw e3;
  console.log(JSON.stringify({ orgId, slug, typeId: type.id }));
} else if (cmd === "archive") {
  const { data, error } = await sb.schema("iam").rpc("organization_archive", { p_org: arg, p_confirm_name: NAME, p_reason: "SCOPE-ADMIN-2 walk disposable" });
  if (error) throw error;
  console.log(JSON.stringify(data));
} else if (cmd === "archive-own-type") {
  const { data, error } = await sb.rpc("delete_scope_type", { p_type_id: arg });
  if (error) throw error;
  console.log(JSON.stringify(data));
} else throw new Error("setup | archive <orgId> | archive-own-type <typeId>");

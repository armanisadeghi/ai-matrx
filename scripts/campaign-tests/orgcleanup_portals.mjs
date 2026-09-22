// ORG-CLEANUP — Rincon's nine duplicate "Your jobs and invoices" portals, through the new door.
//
// `custom.portal_archive` / `custom.portal_restore` / `custom.list_portals` landed on the main
// database in orgcleanup_a_portal_is_archived_never_deleted.sql. This drives them from the
// admin@admin.com seat exactly as a screen would — never a table write.
//
//   node scripts/campaign-tests/orgcleanup_portals.mjs list
//   node scripts/campaign-tests/orgcleanup_portals.mjs archive
//   node scripts/campaign-tests/orgcleanup_portals.mjs roundtrip <portal-id>
//   node scripts/campaign-tests/orgcleanup_portals.mjs refusals        (the door's own noes)
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(new URL(".", import.meta.url).pathname, "../..");
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99"; // Rincon Plumbing Co
const TITLE = "Your jobs and invoices";
// The one the owner guide's walk offers: the first one made, and the only one whose address is
// the plain `your-jobs-and-invoices` a client link would carry.
const KEEP = "87ec3161-a193-4981-8a2e-91b83e0b315f";
const REASON =
  "ORG-CLEANUP 2026-09-22 — one of ten identical portals left by a walk repeated nine times, " +
  "which made the 'add this table to a portal' offer draw ten identical buttons. Nothing deleted.";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } },
);
const { data: seat, error: authErr } = await sb.auth.signInWithPassword({
  email: process.env.AI_ADMIN_USERNAME,
  password: process.env.AI_ADMIN_PASSWORD,
});
if (authErr) throw new Error(`sign-in refused: ${authErr.message}`);
console.log(`seat: ${seat.user.email}`);

const call = async (fn, args) => {
  const { data, error } = await sb.schema("custom").rpc(fn, args);
  if (error) throw new Error(`${fn} refused: ${error.message}`);
  return data;
};
const list = (filter) => call("list_portals", { p_organization_id: ORG, p_archived: filter });

const [cmd, arg] = process.argv.slice(2);

if (cmd === "list") {
  for (const f of ["active", "archived", "all"]) {
    const rows = await list(f);
    console.log(`${f.padEnd(9)} ${rows.length}: ${rows.map((r) => r.slug).join(", ")}`);
  }
} else if (cmd === "archive") {
  const before = await list("active");
  console.log(`before: ${before.length} live portals`);
  let n = 0;
  for (const row of before) {
    if (row.portal_id === KEEP || row.title !== TITLE) continue;
    const r = await call("portal_archive", {
      p_organization_id: ORG,
      p_portal_id: row.portal_id,
      p_confirm_title: row.title,
      p_reason: REASON,
    });
    if (r.changed) n += 1;
    console.log(`${r.changed ? "ARCHIVED" : "already "}  ${row.slug}  ${r.sentence}`);
  }
  const after = await list("active");
  const archived = await list("archived");
  console.log(`\n${n} archived. live ${before.length} -> ${after.length}; archived list holds ${archived.length}.`);
  console.log(`live now: ${after.map((r) => r.slug).join(", ")}`);
} else if (cmd === "roundtrip") {
  const row = (await list("all")).find((r) => r.portal_id === arg);
  if (!row) throw new Error(`${arg} is not a portal of this organization`);
  console.log("restore  :", (await call("portal_restore", { p_organization_id: ORG, p_portal_id: arg, p_confirm_title: row.title })).sentence);
  console.log("live now :", (await list("active")).length);
  console.log("re-arch  :", (await call("portal_archive", { p_organization_id: ORG, p_portal_id: arg, p_confirm_title: row.title, p_reason: REASON })).sentence);
  console.log("live now :", (await list("active")).length);
} else if (cmd === "refusals") {
  // THE DOOR'S OWN NOES, each shown once. A door whose refusals nobody has seen is a door
  // nobody has tested.
  const rows = await list("all");
  const victim = rows.find((r) => r.portal_id !== KEEP) ?? rows[0];
  const tries = [
    ["a title that is not this portal's", () => call("portal_archive", { p_organization_id: ORG, p_portal_id: victim.portal_id, p_confirm_title: "Your jobs", p_reason: null })],
    ["a portal id from nowhere", () => call("portal_archive", { p_organization_id: ORG, p_portal_id: "00000000-0000-4000-8000-000000000000", p_confirm_title: TITLE, p_reason: null })],
    ["an organization the seat is not in", () => call("list_portals", { p_organization_id: "00000000-0000-4000-8000-000000000001", p_archived: "active" })],
    ["a fourth filter value", () => call("list_portals", { p_organization_id: ORG, p_archived: "deleted" })],
  ];
  for (const [what, run] of tries) {
    try {
      await run();
      console.log(`NOT REFUSED (defect): ${what}`);
    } catch (e) {
      console.log(`refused — ${what}: ${String(e.message).split("\n")[0]}`);
    }
  }
} else {
  console.log("usage: orgcleanup_portals.mjs list|archive|roundtrip <portal-id>|refusals");
  process.exit(1);
}

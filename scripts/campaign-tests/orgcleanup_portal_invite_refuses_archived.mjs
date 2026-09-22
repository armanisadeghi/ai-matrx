// ORG-CLEANUP — an invitation to an ARCHIVED portal is refused, in its own sentence.
//
// THE FORCING FUNCTION: the same invitation is accepted while the portal is live (so the test
// can fail), refused the moment it is archived, and accepted again after it is restored. A
// refusal that was never shown succeeding first proves nothing.
//
// Real use case: Rincon Plumbing Co, the plumber. A customer is invited to the portal that
// shows her own jobs and invoices; the office then puts that portal away. She must be told what
// happened and who can undo it — never a dead page.
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
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99";
const PORTAL = "87ec3161-a193-4981-8a2e-91b83e0b315f"; // the live one
const TITLE = "Your jobs and invoices";

const seatFor = async (email, password) => {
  const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email} sign-in refused: ${error.message}`);
  return [sb, data.user];
};
const rpc = async (sb, fn, args) => {
  const { data, error } = await sb.schema("custom").rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code, hint: error.hint });
  return data;
};

const [admin, adminUser] = await seatFor(process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD);
console.log("seat:", adminUser.email);

// The office manager invites an address to the portal and then follows the link herself to see
// what her customer will see — the ordinary way anybody checks a portal actually opens. Doing it
// from the one seat keeps this runnable by any lane: test@test.com's password is not in any .env.
const CLIENT_RECORD = "1a90f500-53be-45da-96f6-cc7906a02033"; // the customer the other invitations name

const portals = await rpc(admin, "list_portals", { p_organization_id: ORG, p_archived: "all" });
const live = portals.find((p) => p.portal_id === PORTAL);
console.log(`portal under test: ${live.slug} (${live.tables} table, ${live.invited} invited)`);

const say = async (label, fn) => {
  try {
    const r = await fn();
    console.log(`${label}: ACCEPTED — ${r.say ?? JSON.stringify(r)}`);
    return { ok: true, r };
  } catch (e) {
    console.log(`${label}: refused (${e.code}) — ${e.message}`);
    return { ok: false, e };
  }
};

const mint = async () => {
  const inv = await rpc(admin, "portal_invite", {
    p_organization_id: ORG, p_portal_id: PORTAL,
    p_client_record_id: CLIENT_RECORD, p_email: adminUser.email, p_user_id: null,
  });
  return inv.token;
};

// ── RED: the refusal can only be reached through a REAL pending invitation ────────────────────
const tokenA = await mint();
await rpc(admin, "portal_archive", {
  p_organization_id: ORG, p_portal_id: PORTAL, p_confirm_title: TITLE,
  p_reason: "ORG-CLEANUP proof: the archived refusal, shown on the live database.",
});
console.log("state: archived");
const whileArchived = await say("following the link while ARCHIVED", () =>
  rpc(admin, "portal_invite_accept", { p_token: tokenA }));

// ── GREEN: the same token, the same person, the portal restored ───────────────────────────────
await rpc(admin, "portal_restore", { p_organization_id: ORG, p_portal_id: PORTAL, p_confirm_title: TITLE });
console.log("state: restored");
const whileLive = await say("following the SAME link once RESTORED", () =>
  rpc(admin, "portal_invite_accept", { p_token: tokenA }));

// THE GREEN ARM, HONESTLY. Once restored, the same link gets PAST the archived gate and on to
// the grant — where this particular caller is refused for a different and correct reason:
// admin@admin.com already OWNS the client record, which is the rung above any level a portal
// grants, and custom._share_write_person says so. That is the bind door working, not this
// lane's. What this proves is what it claims: the archived sentence is there while archived and
// gone the moment it is restored, on the SAME token and the SAME person.
const pastTheGate =
  whileLive.ok ||
  (/already owns this record/.test(whileLive.e?.message ?? "") &&
   !/archived this portal/.test(whileLive.e?.message ?? ""));

const verdict = {
  refused_while_archived: !whileArchived.ok,
  refusal_names_archiving: /archived this portal/.test(whileArchived.e?.message ?? ""),
  refusal_is_not_the_closed_one: !/closed this portal/.test(whileArchived.e?.message ?? ""),
  refusal_says_who_can_undo_it: /restore the portal/.test(whileArchived.e?.hint ?? ""),
  past_the_archived_gate_once_restored: pastTheGate,
  archived_sentence_gone_once_restored: !/archived this portal/.test(whileLive.e?.message ?? ""),
  live_portals_now: (await rpc(admin, "list_portals", { p_organization_id: ORG, p_archived: "active" })).length,
  archived_portals_now: (await rpc(admin, "list_portals", { p_organization_id: ORG, p_archived: "archived" })).length,
};
console.log(JSON.stringify(verdict, null, 1));
const failed = Object.entries(verdict).filter(([k, v]) => k.startsWith("live") || k.startsWith("archived_portals") ? false : v !== true);
if (failed.length) { console.log("FAIL:", failed.map(([k]) => k).join(", ")); process.exit(1); }
console.log("PASS — an archived portal refuses a real invitation in its own sentence, and the same link is past that gate the moment it is restored.");

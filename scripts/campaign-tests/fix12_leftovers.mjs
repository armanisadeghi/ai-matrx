// FIX-12 — PUTTING BACK WHAT VERIFIER-12 LEFT BEHIND, THROUGH THE DOORS IT USED.
//
// A verification walk is allowed to change the world; it is not allowed to leave it changed.
// VERIFIER-12 (2026-09-22) left three things standing, all of them in real test-fixture
// organizations of the plumbing and approvals use cases:
//
//   1. Calder Approvals had SHARING WITH PEOPLE OUTSIDE turned on, to prove the control asks
//      before it acts. It is an organization-wide door and nobody was invited through it.
//   2. Rincon Plumbing Co carried a PENDING OUTSIDE INVITATION to r.okafor@coastlinesupply.test
//      on the Jobs table.
//   3. Rincon carried a PENDING PORTAL INVITATION to d.pruitt@ashportpropertycare.test on the
//      portal "Your jobs and invoices", which that walk archived and left archived.
//
// Each is undone through the SAME door it was made with, as admin@admin.com, from the seat —
// never a direct write, never a delete. A revoked invitation keeps its row (soft-delete
// everything important): what stops is the access, and `iam.invitations.status` says `revoked`
// so the history of what happened is still readable.
//
// Re-runnable: every step reads the state first and says "already" rather than acting twice.
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

const RINCON = "6069a466-1445-42df-a64e-cf37ecdc1b99";
const CALDER = "235a6add-e8b5-43f9-883e-9dd0389c1759";
const PORTAL = "87ec3161-a193-4981-8a2e-91b83e0b315f";
const PORTAL_TITLE = "Your jobs and invoices";
const OUTSIDE_INVITATION = "eef32db6-47b1-4d03-bbbd-47b461cd4950"; // r.okafor@coastlinesupply.test
const PORTAL_PRINCIPAL = "9da9634c-41ec-46a7-ad73-90f46db6b5c5"; // d.pruitt@ashportpropertycare.test

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const { data: signedIn, error: signInError } = await sb.auth.signInWithPassword({
  email: process.env.AI_ADMIN_USERNAME,
  password: process.env.AI_ADMIN_PASSWORD,
});
if (signInError) throw new Error(`sign-in refused: ${signInError.message}`);
console.log("seat:", signedIn.user.email);

const door = async (schema, fn, args) => {
  const { data, error } = await sb.schema(schema).rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code, hint: error.hint });
  return data;
};

const out = {};

// ── 1. CALDER APPROVALS: the outside door, closed through the door that opened it. ────────────
// `openOutsideLane` in features/sharing/outside/outsideShareService.ts writes this exact knob
// through this exact door; turning it off is the same call with `false`.
const calderBefore = await door("platform", "knob_resolve", {
  p_feature: "custom", p_key: "external_principal_enabled", p_organization_id: CALDER,
});
if (calderBefore === true || calderBefore === "true") {
  const answer = await door("platform", "knob_override_set", {
    p_feature: "custom",
    p_key: "external_principal_enabled",
    p_scope_kind: "organization",
    p_scope_id: CALDER,
    p_organization_id: CALDER,
    p_value: false,
    p_note: "FIX-12: put back after VERIFIER-12 turned it on to prove the control asks first. Nobody was invited through it.",
  });
  if (!answer?.ok) throw new Error(`the outside door would not close: ${answer?.detail ?? answer?.reason ?? "no reason given"}`);
}
out.calder_outside_sharing = await door("platform", "knob_resolve", {
  p_feature: "custom", p_key: "external_principal_enabled", p_organization_id: CALDER,
});

// ── 2. RINCON: the pending outside invitation, taken back through the share door. ─────────────
const outside = await door("custom", "table_share_outside_revoke", {
  p_organization_id: RINCON, p_invitation_id: OUTSIDE_INVITATION,
}).catch((e) => ({ say: `already: ${e.message}` }));
out.outside_invitation = outside.say ?? JSON.stringify(outside);

// ── 3. RINCON: the pending portal invitation, taken back through the portal's own door. ───────
// An archived portal still answers `portal_revoke` — taking somebody's access back must never
// depend on the portal being open, or an archive would freeze every grant it holds.
const portalRevoke = await door("custom", "portal_revoke", {
  p_organization_id: RINCON, p_portal_id: PORTAL, p_principal_id: PORTAL_PRINCIPAL,
}).catch((e) => ({ say: `already: ${e.message}` }));
out.portal_invitation = portalRevoke.say ?? JSON.stringify(portalRevoke);

// ── 4. AND THE PORTAL ITSELF, ARCHIVED, THE WAY VERIFIER-12 LEFT IT. ──────────────────────────
const archived = await door("custom", "portal_archive", {
  p_organization_id: RINCON, p_portal_id: PORTAL, p_confirm_title: PORTAL_TITLE,
  p_reason: "FIX-12: left archived, the way VERIFIER-12 left it.",
});
out.portal_state = archived.sentence;

console.log(JSON.stringify(out, null, 1));

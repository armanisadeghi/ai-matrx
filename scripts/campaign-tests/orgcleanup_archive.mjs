// ORG-CLEANUP — archive the census of throwaway / duplicate test organizations.
//
// THE DOOR, NEVER THE TABLE. Every change here goes through `iam.organization_archive`
// (and `iam.organization_restore` for the proof), signed in as admin@admin.com through
// the ordinary authenticated client — the same door the Danger Zone screen calls. No
// service-role key, no UPDATE on iam.organizations, nothing deleted.
//
// Usage:
//   node scripts/campaign-tests/orgcleanup_archive.mjs list
//   node scripts/campaign-tests/orgcleanup_archive.mjs archive
//   node scripts/campaign-tests/orgcleanup_archive.mjs roundtrip <org-id>   (restore, then re-archive)
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

const REASON =
  "ORG-CLEANUP 2026-09-22 — throwaway or duplicate organization from campaign testing; " +
  "archived on Arman's ruling of 2026-09-21. Nothing deleted; restorable.";

// name is the typed confirmation the door demands — it is the organization's own name.
export const TARGETS = [
  ["1e51ac0a-77bd-47e6-97e1-39cd017ac680", "Rincon Plumbing Co — Ojai Branch"],
  ["2ea16580-deff-432e-83d8-a3807ce8e02f", "Rincon Plumbing Co — Ojai Branch"],
  ["a788bc44-01d7-4157-bae5-5f426c7e2cef", "Rincon Plumbing Co — Ojai Branch"],
  ["d46f323b-c132-4d27-8004-70670c4b8a11", "Rincon Plumbing Co — Ojai Branch"],
  ["f09a8181-410c-4f26-b12e-9ee01e0a3852", "Rincon Plumbing Co — Ojai Branch"],
  ["95725d0b-aa9b-4817-8311-29a581c3cef1", "Rincon Plumbing Co — Ojai Branch"],
  ["d7e629b0-e96b-4dd4-bb69-5aaa9319c9fd", "Rincon Plumbing Co — Ojai Branch"],
  ["4e05cf9e-6652-451d-b4e5-e4d541363716", "Rincon Plumbing Co — Ojai Branch"],
  ["ca0c5df9-462f-4ff3-a423-77eeb0c7f00b", "Rincon Plumbing Co — Ojai Branch"],
  ["e9e7e190-ddac-4824-bd10-a02c9d1239c0", "Rincon Plumbing Co — Ojai Branch"],
  ["1f9db115-6387-4284-ba33-0d869747d519", "SCREENS-2 Walkthrough"],
  ["e94367a8-d04b-42ff-b0d1-ed1d86e8e6a8", "Z7B"],
  ["2237fcf3-8cdc-4cdf-a1cc-8dd37245ee89", "Harbor Dental Group"],
  ["3de73904-45cc-4263-b011-3fde014ff0c3", "Harbor Dental Group"],
  ["41bee828-98f8-4e0f-9161-343feaa6235b", "Cascade Electronics Recovery"],
  ["52993fa0-6cb9-401d-b241-9348c56fc57c", "Compass Route Relocation Advisors"],
  ["4cef0211-6ce2-48d0-bdea-985bb426d939", "Kessler Lab for Applied Microbial Ecology"],
  ["3fd68771-8cb2-40ea-9b14-49746e69aff0", "Wraithmoor Regional Museum of Art & Craft"],
  ["72dac591-0bc7-44e8-b9f2-2ba4fe4176f3", "Wraithmoor Regional Museum of Art & Craft"],
];

// ROUND 2 (coordinator ruling, 2026-09-22): the classification is the test, not the name.
// Each of these was created by admin@admin.com and has admin@admin.com as its ONLY member —
// a test artifact by evidence, not by a junk name. They are classified through the settings
// door `public.org_update` (never a table write), then archived through the same door as the
// nineteen. The classification is MERGED into the settings the organization already carries,
// because org_update replaces the whole object.
export const UNCLASSIFIED = [
  ["91b6ddff-12ce-4423-986a-04ac69802f70", "Rincon Plumbing Co — Ojai Branch"],
  ["971ad659-17d0-409c-9864-8b2b462ab6ec", "Rincon Plumbing Co — Ojai Branch"],
  ["d670c242-8f7a-40ec-92f8-f0376395ee09", "Rincon Plumbing Co — Carpinteria Branch"],
  ["f07a44ca-4aec-4769-beb1-b887b9a9cf26", "Rincon Plumbing Co — Carpinteria Branch"],
  ["89b13539-fbe4-4256-9b19-bf30e9c26e43", "Rincon Plumbing Co — Carpinteria Branch"],
  ["cdd75e04-f55a-41c1-8365-37ee07c93b14", "Linden Approvals"],
  ["6b17f54c-8d06-4c52-9113-2c3712bc668f", "Linden Approvals II"],
  ["6b69e71b-7a49-4f5e-9565-3023e77d2959", "Linden Approvals III"],
  ["6c7d2f58-168a-4cff-a9f2-01402b092633", "Linden Approvals IV"],
  ["6eccc9f7-a17c-4065-bf0d-fcf3da6064f4", "Linden Approvals V"],
  ["8cdec2ab-c189-484e-ab37-90922e5caa24", "Linden Approvals VI"],
  ["db06c283-fdff-47a2-a4c2-a4b13053b352", "Linden Approvals VII"],
  ["1265c43e-7028-41af-8255-d41fde1ef46b", "Knox Review"],
  ["3cf77ee2-3e79-4056-bb8c-6e9320fd1aa6", "Knox Review II"],
  ["757ecbf3-756d-440a-a2a0-c804b4006c16", "Knox Review III"],
  ["319fad99-427c-4aaf-8e0b-17af53dd0424", "Fairview People II"],
];

const CLASSIFICATION =
  "ORG-CLEANUP 2026-09-22 — created by admin@admin.com with admin@admin.com as its only member";

async function seat() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb.auth.signInWithPassword({
    email: process.env.AI_ADMIN_USERNAME,
    password: process.env.AI_ADMIN_PASSWORD,
  });
  if (error) throw new Error(`sign-in refused: ${error.message}`);
  console.log(`seat: ${data.user.email} (${data.user.id})`);
  return sb;
}

const call = async (sb, fn, args) => {
  const { data, error } = await sb.schema("iam").rpc(fn, args);
  if (error) throw new Error(`${fn} refused: ${error.message}`);
  return data;
};

const [cmd, arg] = process.argv.slice(2);
const sb = await seat();

if (cmd === "list") {
  for (const [id, name] of TARGETS) {
    const s = await call(sb, "organization_archive_state", { p_org: id });
    console.log(`${id}  ${JSON.stringify(s)}  ${name}`);
  }
} else if (cmd === "archive") {
  let changed = 0;
  for (const [id, name] of TARGETS) {
    const r = await call(sb, "organization_archive", {
      p_org: id,
      p_confirm_name: name,
      p_reason: REASON,
    });
    if (r.changed) changed += 1;
    console.log(`${r.changed ? "ARCHIVED " : "already  "} ${id}  ${r.sentence}`);
  }
  console.log(`\n${changed} newly archived of ${TARGETS.length} targets.`);
} else if (cmd === "roundtrip") {
  const row = TARGETS.find(([id]) => id === arg);
  if (!row) throw new Error(`${arg} is not one of this lane's targets`);
  const [id, name] = row;
  console.log("restore  :", (await call(sb, "organization_restore", { p_org: id, p_confirm_name: name })).sentence);
  console.log("state    :", JSON.stringify(await call(sb, "organization_archive_state", { p_org: id })));
  console.log("re-archive:", (await call(sb, "organization_archive", { p_org: id, p_confirm_name: name, p_reason: REASON })).sentence);
  console.log("state    :", JSON.stringify(await call(sb, "organization_archive_state", { p_org: id })));
} else if (cmd === "classify-and-archive") {
  let classified = 0;
  let archived = 0;
  for (const [id, name] of UNCLASSIFIED) {
    // Read what it already carries — the settings door replaces the whole object.
    const { data: before, error: readErr } = await sb
      .schema("iam")
      .from("organizations")
      .select("id, name, settings, created_by")
      .eq("id", id)
      .single();
    if (readErr) throw new Error(`could not read ${id}: ${readErr.message}`);
    if (before.name !== name) throw new Error(`${id} is named "${before.name}", not "${name}"`);

    // THE EVIDENCE TEST, RE-RUN HERE rather than trusted from a census taken minutes ago.
    const { data: members, error: memErr } = await sb
      .schema("iam")
      .from("memberships")
      .select("user_id")
      .eq("organization_id", id)
      .is("deleted_at", null);
    if (memErr) throw new Error(`could not read members of ${id}: ${memErr.message}`);
    const SEATS = new Set([
      "87a6e699-3622-4869-8843-d0867456c0dd", // admin@admin.com
      "4060701e-706a-4c76-b3ca-0bbc69fa5a14", // test@test.com
    ]);
    const strangers = members.filter((m) => !SEATS.has(m.user_id));
    if (strangers.length > 0 || !SEATS.has(before.created_by)) {
      console.log(`LEFT ALONE ${id}  ${name} — a person outside the test seats made it or is in it`);
      continue;
    }

    const settings = { ...(before.settings ?? {}), test_fixture: CLASSIFICATION };
    const { error: updErr } = await sb.rpc("org_update", { p_org_id: id, p_patch: { settings } });
    if (updErr) throw new Error(`org_update refused ${id}: ${updErr.message}`);
    classified += 1;

    const r = await call(sb, "organization_archive", {
      p_org: id,
      p_confirm_name: name,
      p_reason: REASON,
    });
    if (r.changed) archived += 1;
    console.log(`CLASSIFIED+${r.changed ? "ARCHIVED" : "already "} ${id}  ${name}`);
  }
  console.log(`\n${classified} classified test_fixture through public.org_update, ${archived} newly archived.`);
} else {
  console.log("usage: orgcleanup_archive.mjs list|archive|classify-and-archive|roundtrip <org-id>");
  process.exit(1);
}

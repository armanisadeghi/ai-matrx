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
} else {
  console.log("usage: orgcleanup_archive.mjs list|archive|roundtrip <org-id>");
  process.exit(1);
}

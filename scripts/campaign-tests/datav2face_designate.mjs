/**
 * LANE DATA-V2-FACE — designate a copied older table's default view as the Sheet, AS A PERSON, through
 * the store's one designation door (`custom.view_designate`, the table page's "Make … the default"). This is the
 * write the older-table mover should make for every copy; it is done here for one admin-owned test
 * table so the designated face can be seen.
 *
 *   FACE_EMAIL=… FACE_PASSWORD=… FACE_ORG=<uuid> FACE_TABLE=<uuid> FACE_VIEW=<uuid> [FACE_LAYOUT=sheet|grid] \
 *   node scripts/campaign-tests/datav2face_designate.mjs
 *
 * FACE_LAYOUT=grid puts the view back. Credentials come from the environment and are never printed.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const { FACE_EMAIL, FACE_PASSWORD, FACE_ORG, FACE_TABLE, FACE_VIEW } = process.env;
const layout = process.env.FACE_LAYOUT ?? "sheet";
if (!FACE_EMAIL || !FACE_PASSWORD || !FACE_ORG || !FACE_TABLE || !FACE_VIEW) {
  console.error("FACE_EMAIL, FACE_PASSWORD, FACE_ORG, FACE_TABLE and FACE_VIEW are required.");
  process.exit(2);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const signed = await supabase.auth.signInWithPassword({ email: FACE_EMAIL, password: FACE_PASSWORD });
if (signed.error) {
  console.error(`sign-in refused: ${signed.error.message}`);
  process.exit(1);
}
console.log(`signed in as ${signed.data.user?.email}`);
// THE ONE DESIGNATION DOOR (lane VIEW-SWITCH-NOT-DESIGNATION, 2026-09-25): `custom.view_designate`,
// editor on the table. `view_declare` now refuses a change to the default view's layout or
// is_default by name — a look at a table never changes how it opens.
const answered = await supabase.schema("custom").rpc("view_designate", {
  p_organization_id: FACE_ORG,
  p_table_id: FACE_TABLE,
  p_view_id: FACE_VIEW,
  p_layout: layout,
});
if (answered.error) {
  console.error(`view_designate refused: ${answered.error.message}`);
  process.exit(1);
}
console.log(`view ${FACE_VIEW} now has layout "${layout}" (door answered ${JSON.stringify(answered.data)})`);

/**
 * SHARE-LANE-2 — the walk's disposable setting, made AS THE PEOPLE through the client doors.
 *
 * THE REAL USE CASE. Dr. Reyes (test@test.com) founded "Cedar Hollow Veterinary", a two-vet
 * practice, and keeps her own case notes in a Table set to "Only people I share it with". When the
 * practice brought in a practice owner (admin@admin.com), she handed him the organization: he is
 * now its OWNER and she is an admin. He is not named on her notes, so he must not open them. When
 * she moves to another clinic, he transfers her notes to himself — with a reason, audited, and told
 * to both of them — and only then reads them.
 *
 *   node scripts/campaign-tests/sharelane2_setup.mjs          → prints {org, home, table} as JSON
 *   ARCHIVE=1 ORG=<id> TABLE=<id> HOME_ID=<id> node …         → archives (soft) all three
 *   (credentials from the environment: TEST_SEAT_PASSWORD, AI_ADMIN_PASSWORD)
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ADMIN_ID = "87a6e699-3622-4869-8843-d0867456c0dd";
const TEST_ID = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const ORG_NAME = "Cedar Hollow Veterinary";
const seat = async (email, password) => {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
};
const must = (label, { data, error }) => {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};

const reyes = await seat("test@test.com", process.env.TEST_SEAT_PASSWORD);
const owner = await seat("admin@admin.com", process.env.AI_ADMIN_PASSWORD);

if (process.env.ARCHIVE) {
  const org = process.env.ORG;
  // after the walk the Table is the owner's; he archives it and the home, then the organization.
  must("table_archive", await owner.schema("custom").rpc("table_archive", {
    p_organization_id: org, p_table_id: process.env.TABLE, p_chunk: 500, p_include_table: true,
  }));
  must("home", await reyes.schema("custom").rpc("record_delete", { p_organization_id: org, p_record_id: process.env.HOME_ID }));
  must("organization_archive", await owner.schema("iam").rpc("organization_archive", {
    p_org: org, p_confirm_name: ORG_NAME, p_reason: "SHARE-LANE-2 walk disposable, finished",
  }));
  console.log("archived", org);
  process.exit(0);
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const org = must("org_create", await reyes.rpc("org_create", {
  p_name: ORG_NAME,
  p_slug: `cedar-hollow-veterinary-${stamp}`,
  p_description: "Two-vet companion-animal practice: appointments, case notes and kennel schedule.",
  p_logo_url: null, p_logo_file_id: null, p_website: null, p_settings: {}, p_abbreviation: "CHV",
}));
const inv = must("inv_create", await reyes.rpc("inv_create", {
  p_target_type: "organization", p_target_id: org.id, p_email: "admin@admin.com", p_role: "admin",
  p_org_id: org.id, p_invited_user_id: null,
  p_expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
}));
must("inv_accept", await owner.rpc("inv_accept", { p_token: inv.token, p_hr_half_handled: false }));

const home = must("home", await reyes.schema("custom").rpc("record_write", {
  p_organization_id: org.id,
  p_table_id: "11111111-0000-4000-8000-000000000004",
  p_data: { name: "Cedar Hollow Veterinary — front desk" },
}));
const homeId = typeof home === "string" ? home : home.id;
const table = must("table_declare", await reyes.schema("custom").rpc("table_declare", {
  p_organization_id: org.id,
  p_spec: {
    name: "My case notes", slug: "my_case_notes", label_singular: "Note", label_plural: "Notes",
    type: "entity", display: "list", ordered: false, weight: "light", retention_days: 30,
    default_sort: [], row_order: "sorted", agent_writable: true,
    fields: [{ name: "patient", kind: "text" }, { name: "note", kind: "text" }],
    title_field: "patient", parent_id: homeId,
  },
}));
must("row", await reyes.schema("custom").rpc("record_write", {
  p_organization_id: org.id, p_table_id: table,
  p_data: { patient: "Biscuit (beagle, 6y)", note: "Recheck ear cytology in 10 days; owner prefers mornings." },
}));
must("share_lane_set", await reyes.schema("custom").rpc("share_lane_set", {
  p_organization_id: org.id, p_subject_id: table, p_choice: "mine",
}));
must("transfer_organization_ownership", await reyes.rpc("transfer_organization_ownership", {
  org_id: org.id, current_owner_id: TEST_ID, new_owner_id: ADMIN_ID,
}));
console.log(JSON.stringify({ org: org.id, home: homeId, table }));

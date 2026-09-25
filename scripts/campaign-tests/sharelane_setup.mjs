/**
 * SHARE-LANE-CONTROL — the walk's disposable setting, made AS THE PEOPLE through the client doors.
 *
 * THE REAL USE CASE. Alex Hart (test@test.com) coordinates "Maple Street Community Garden", a
 * volunteer garden she runs; admin@admin.com (Morgan) is a plain volunteer member. Alex keeps a
 * Table, "Plot waitlist", of neighbours waiting for a raised bed. The walk then sets it to "Only
 * people I share it with", checks Morgan is refused, names Morgan, and sets it back.
 *
 *   node scripts/campaign-tests/sharelane_setup.mjs          → prints {org, table} as JSON
 *   (credentials from the environment: TEST_SEAT_PASSWORD, AI_ADMIN_PASSWORD)
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
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

const alex = await seat("test@test.com", process.env.TEST_SEAT_PASSWORD);
const morgan = await seat("admin@admin.com", process.env.AI_ADMIN_PASSWORD);

// ARCHIVE=<table id> HOME=<home id> (with ORG): archive (soft) the table, its home and the garden.
if (process.env.ARCHIVE) {
  const org = process.env.ORG;
  must("table_archive", await alex.schema("custom").rpc("table_archive", {
    p_organization_id: org, p_table_id: process.env.ARCHIVE, p_chunk: 500, p_include_table: true,
  }));
  must("home", await alex.schema("custom").rpc("record_delete", { p_organization_id: org, p_record_id: process.env.HOME_ID }));
  must("organization_archive", await alex.schema("iam").rpc("organization_archive", {
    p_org: org, p_confirm_name: "Maple Street Community Garden",
    p_reason: "SHARE-LANE-CONTROL walk disposable, finished",
  }));
  console.log("archived", org);
  process.exit(0);
}
// RESET=<table id> (with ORG): take Morgan's name back and return the table to "Everyone in …",
// so the walk can run again from its first state.
if (process.env.RESET) {
  const t = process.env.RESET;
  must("share_revoke", await alex.schema("custom").rpc("share_revoke", {
    p_organization_id: process.env.ORG, p_subject_id: t, p_principal_kind: "person",
    p_principal_id: "87a6e699-3622-4869-8843-d0867456c0dd",
  }));
  must("share_lane_set", await alex.schema("custom").rpc("share_lane_set", {
    p_organization_id: process.env.ORG, p_subject_id: t, p_choice: "organization",
  }));
  console.log("reset", t);
  process.exit(0);
}
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
// ORG=<id> reuses an organization a previous run already made.
const org = process.env.ORG ? { id: process.env.ORG } : must("org_create", await alex.rpc("org_create", {
  p_name: "Maple Street Community Garden",
  p_slug: `maple-street-community-garden-${stamp}`,
  p_description: "Volunteer-run community garden on Maple Street: plots, waitlist and work days.",
  p_logo_url: null, p_logo_file_id: null, p_website: null, p_settings: {}, p_abbreviation: "MSG",
}));
const inv = process.env.ORG ? null : must("inv_create", await alex.rpc("inv_create", {
  p_target_type: "organization", p_target_id: org.id, p_email: "admin@admin.com", p_role: "member",
  p_org_id: org.id, p_invited_user_id: null,
  p_expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
}));
if (!process.env.ORG)
  must("inv_accept", await morgan.rpc("inv_accept", { p_token: inv.token, p_hr_half_handled: false }));

// A Table lives somewhere: the garden's own home (a record in the kernel "Organization" table).
const home = must("home", await alex.schema("custom").rpc("record_write", {
  p_organization_id: org.id,
  p_table_id: "11111111-0000-4000-8000-000000000004",
  p_data: { name: "Maple Street Community Garden" },
}));
const table = must("table_declare", await alex.schema("custom").rpc("table_declare", {
  p_organization_id: org.id,
  p_spec: {
    name: "Plot waitlist", slug: "plot_waitlist", label_singular: "Request", label_plural: "Requests",
    type: "entity", display: "list", ordered: false, weight: "light", retention_days: 30,
    default_sort: [], row_order: "sorted", agent_writable: true,
    fields: [{ name: "neighbour", kind: "text" }, { name: "bed_size", kind: "text" }],
    title_field: "neighbour", parent_id: typeof home === "string" ? home : home.id,
  },
}));
must("row", await alex.schema("custom").rpc("record_write", {
  p_organization_id: org.id, p_table_id: table,
  p_data: { neighbour: "Rosa Delgado (14 Maple St)", bed_size: "4 x 8 raised bed" },
}));
console.log(JSON.stringify({ org: org.id, home: typeof home === "string" ? home : home.id, table }));

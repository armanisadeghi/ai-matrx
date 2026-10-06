// features/spaces/store-db/template-label-live-proof.ts — live proof of the "template" label on a Space.
//
// Run: pnpm tsx --env-file=.env.local features/spaces/store-db/template-label-live-proof.ts <source-space-id> <organization-id>
// The label is the platform category document_label/template, assigned by a document -> category
// association (label "labeled"). Sets it, reads "templates I can open" through assoc_for_targets,
// checks an outsider does not see it, unsets it, and archives the Space it made.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const [sourceId, orgId] = process.argv.slice(2);
if (!url || !key || !sourceId || !orgId) throw new Error("Need Supabase env and <source-space-id> <organization-id>.");
type Db = SupabaseClient<Database>;
/* eslint-disable @typescript-eslint/no-explicit-any */
async function signedIn(email: string, password: string): Promise<Db> {
  const db = createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return db;
}
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const ROLE = "labeled";

async function main() {
  const admin = await signedIn(process.env.AI_ADMIN_USERNAME!, process.env.AI_ADMIN_PASSWORD!);
  const second = await signedIn("test@test.com", process.env.SPACES_PROOF_SECOND_PASSWORD ?? process.env.AI_ADMIN_PASSWORD!);
  let made: string | null = null;
  try {
    const dup = await (admin.schema("content") as any).rpc("space_duplicate", { p_space_id: sourceId, p_organization_id: orgId, p_with_children: false, p_title: "Template label proof" });
    if (dup.error) throw new Error(dup.error.message);
    made = dup.data as string;

    const cat = await admin.schema("platform").from("categories").select("id").eq("dimension", "document_label").eq("slug", "template").is("deleted_at", null).single();
    check("the template label is a platform category", !!cat.data, cat.data?.id ?? cat.error?.message);
    const catId = cat.data!.id;

    const templatesICanOpen = async (db: Db) => {
      const { data, error } = await db.rpc("assoc_for_targets", { p_target_type: "category", p_target_ids: [catId] });
      if (error) throw new Error(error.message);
      return (data ?? []).filter((e) => e.source_type === "document" && e.label === "labeled").map((e) => e.source_id);
    };

    check("not a template at first", !(await templatesICanOpen(admin)).includes(made));
    const set = await admin.rpc("assoc_link", { p_source_type: "document", p_source_id: made, p_target_type: "category", p_target_id: catId, p_role: ROLE, p_label: "labeled" });
    check("set the label", !set.error, set.error?.message ?? "");
    const listed = await templatesICanOpen(admin);
    check("templates I can open (one read) lists it", listed.includes(made), `${listed.length} template(s)`);
    check("an outsider who cannot open it does not see it", !(await templatesICanOpen(second)).includes(made));
    const unset = await admin.rpc("assoc_unlink", { p_source_type: "document", p_source_id: made, p_target_type: "category", p_target_id: catId, p_role: ROLE });
    check("unset the label", !unset.error, unset.error?.message ?? "");
    check("no longer listed", !(await templatesICanOpen(admin)).includes(made));
    const meta = await admin.schema("content").from("document").select("metadata").eq("id", made).single();
    check("document metadata untouched", JSON.stringify(meta.data?.metadata) === "{}", JSON.stringify(meta.data?.metadata));
  } finally {
    if (made) await admin.schema("content").from("document").update({ deleted_at: new Date().toISOString() }).eq("id", made);
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

// features/spaces/publish/publish-live-proof.ts — live proof of Publish (J1, I4) and every refusal path.
//
// Run: pnpm tsx --env-file=.env --env-file=.env.local features/spaces/publish/publish-live-proof.ts <admin-org-id> <outsider-org-id>
// Signs in as admin@admin.com (AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD) and test@test.com
// (SPACES_PROOF_SECOND_PASSWORD, else the admin password). <admin-org-id>: one the admin owns and test@test.com
// is NOT in (else test@test.com can edit the page); <outsider-org-id>: one test@test.com is in.
// Makes a fresh page + sub-page (never the sample), then proves, as a SIGNED-OUT client:
//   refusal 1  unpublished          → content.space_public_view answers null (root and sub-page)
//   publish + Include sub-pages on  → root by link, sub-page by id, root lists the sub-page
//   refusal 2  sub-pages off        → the sub-page answers null, the root still answers and lists nothing
//   refusal 3  signed out           → space_duplicate_published and space_publish are refused
//   refusal 4  duplicate off        → a signed-in outsider is refused; on → the copy lands in their org
//   unpublish                       → the root answers null again
// Leaves nothing behind: every page it made (and the copy) goes to Trash.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseSpacesStore } from "../store-db/supabase-store";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const [adminOrg, outsiderOrg] = process.argv.slice(2);
if (!url || !key || !adminOrg || !outsiderOrg) throw new Error("Need Supabase env and <admin-org-id> <outsider-org-id>.");

type Db = SupabaseClient<Database>;
const fresh = (): Db => createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
async function signedIn(email: string, password: string): Promise<Db> {
  const db = fresh();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return db;
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function view(db: Db, k: string) {
  const { data, error } = await db.schema("content").rpc("space_public_view", { p_key: k });
  if (error) throw new Error(`space_public_view(${k}): ${error.message}`);
  return data as { id: string; slug: string | null; children: Array<{ id: string }> } | null;
}

async function main() {
  const adminEmail = process.env.AI_ADMIN_USERNAME ?? "admin@admin.com";
  const adminPassword = process.env.AI_ADMIN_PASSWORD;
  if (!adminPassword) throw new Error("AI_ADMIN_PASSWORD is not set.");
  const admin = await signedIn(adminEmail, adminPassword);
  const outsider = await signedIn("test@test.com", process.env.SPACES_PROOF_SECOND_PASSWORD ?? adminPassword);
  const anon = fresh();

  const store = new SupabaseSpacesStore(admin, adminOrg);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const root = await store.create({ parentId: null, title: `Knee Recovery Home Program ${stamp}` });
  const rootDoc = await store.get(root.id);
  await store.save({ ...rootDoc!, blocks: [{ id: crypto.randomUUID(), type: "text", text: [{ text: "Daily exercises after knee surgery: range of motion, quad sets and gentle walking." }] }] }, rootDoc!.version);
  const sub = await store.create({ parentId: root.id, title: "Week 1 exercises" });
  const made: string[] = [root.id, sub.id];

  try {
    // refusal 1: unpublished
    check("unpublished root answers nothing signed out", (await view(anon, root.id)) === null);
    check("unpublished sub-page answers nothing signed out", (await view(anon, sub.id)) === null);

    // publish with sub-pages
    const { data: pub, error: pubErr } = await admin.schema("content").rpc("space_publish", { p_space_id: root.id, p_published: true });
    check("publish succeeds for the editor", !pubErr, pubErr?.message);
    const slug = (pub as { slug?: string } | null)?.slug ?? "";
    check("publish mints a link", /^knee-recovery-home-program-/.test(slug), slug);
    const onWeb = await view(anon, slug);
    check("published root answers by its link signed out", onWeb?.id === root.id);
    check("published root lists its published sub-page", (onWeb?.children ?? []).some((c) => c.id === sub.id));
    check("sub-page answers signed out when sub-pages are included", (await view(anon, sub.id))?.id === sub.id);

    // refusal 2: sub-pages off
    await admin.schema("content").rpc("space_publish", { p_space_id: root.id, p_include_sub_pages: false });
    check("sub-page refused when Include sub-pages is off", (await view(anon, sub.id)) === null);
    const rootOnly = await view(anon, slug);
    check("root still on the web, lists no sub-page", rootOnly?.id === root.id && rootOnly.children.length === 0);
    await admin.schema("content").rpc("space_publish", { p_space_id: root.id, p_include_sub_pages: true });
    check("sub-page answers again when Include sub-pages is back on", (await view(anon, sub.id))?.id === sub.id);

    // refusal 3: signed out
    const { error: anonDup } = await anon.schema("content").rpc("space_duplicate_published", { p_key: slug, p_organization_id: outsiderOrg });
    check("signed out cannot duplicate", !!anonDup, anonDup?.message);
    const { error: anonPub } = await anon.schema("content").rpc("space_publish", { p_space_id: root.id, p_published: false });
    check("signed out cannot publish or unpublish", !!anonPub, anonPub?.message);
    const { error: outsiderPub } = await outsider.schema("content").rpc("space_publish", { p_space_id: root.id, p_published: false });
    check("a reader who cannot edit cannot unpublish", !!outsiderPub, outsiderPub?.message);

    // refusal 4 + duplicate
    await admin.schema("content").rpc("space_publish", { p_space_id: root.id, p_allow_duplicate: false });
    const { error: offErr } = await outsider.schema("content").rpc("space_duplicate_published", { p_key: slug, p_organization_id: outsiderOrg });
    check("duplicate refused when the owner turned it off", !!offErr, offErr?.message);
    await admin.schema("content").rpc("space_publish", { p_space_id: root.id, p_allow_duplicate: true });
    const { data: copyId, error: dupErr } = await outsider.schema("content").rpc("space_duplicate_published", { p_key: slug, p_organization_id: outsiderOrg });
    check("signed-in outsider duplicates into their own organization", !dupErr && typeof copyId === "string", dupErr?.message);
    if (typeof copyId === "string") {
      made.push(copyId);
      const { data: copy } = await outsider.schema("content").from("document").select("organization_id, title, published_to_web").eq("id", copyId).single();
      check("the copy is theirs, keeps the title and is not published", copy?.organization_id === outsiderOrg && copy.title === root.title && copy.published_to_web === false);
      const { data: kids } = await outsider.schema("content").rpc("space_children", { p_parent_id: copyId });
      check("the copy carries the published sub-page", (kids ?? []).length === 1);
      if (kids?.[0]) made.push(kids[0].id);
    }

    // unpublish
    await admin.schema("content").rpc("space_publish", { p_space_id: root.id, p_published: false });
    check("unpublished root answers nothing again", (await view(anon, slug)) === null && (await view(anon, root.id)) === null);
    check("its sub-page answers nothing again", (await view(anon, sub.id)) === null);
  } finally {
    for (const id of made.reverse()) {
      const db = id === root.id || id === sub.id ? admin : outsider;
      await db.schema("content").from("document").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    }
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

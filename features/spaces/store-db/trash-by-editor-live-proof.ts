// features/spaces/store-db/trash-by-editor-live-proof.ts — Move to Trash by a full-access editor who is not the creator.
//
// Run: pnpm tsx features/spaces/store-db/trash-by-editor-live-proof.ts <organization-id>
// The organization must be one test@test.com belongs to and admin@admin.com administers (e.g. 884d1ce8…).
// test@test.com makes a page there; the admin (editor access through the organization, not the creator) moves it
// to Trash through the store. Before round 38 this was a PATCH of `deleted_at`, refused 42501 because the
// owner-only trash rule hides the trashed row from the admin. Prints PASS/FAIL per claim; exit 1 on any FAIL.
// SPACES_PROOF_STORE=<path> runs the same claims against another store module (the pre-fix copy, for the red run).

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseSpacesStore } from "./supabase-store";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const orgId = process.argv[2];
if (!url || !key || !orgId) throw new Error("Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and an organization id argument.");

async function signedIn(email: string, password: string) {
  const db = createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return db;
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
async function attempt(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : JSON.stringify(e);
  }
}

async function main() {
  const Store: typeof SupabaseSpacesStore = process.env.SPACES_PROOF_STORE
    ? (await import(process.env.SPACES_PROOF_STORE)).SupabaseSpacesStore
    : SupabaseSpacesStore;
  const adminDb = await signedIn(process.env.AI_ADMIN_USERNAME!, process.env.AI_ADMIN_PASSWORD!);
  const memberDb = await signedIn("test@test.com", process.env.SPACES_PROOF_SECOND_PASSWORD ?? process.env.AI_ADMIN_PASSWORD!);
  const admin = new Store(adminDb, orgId);
  const member = new Store(memberDb, orgId);

  const page = await member.create({ parentId: null, title: "Spring recall mailing list" });
  try {
    const opened = await admin.get(page.id);
    check("the admin opens the member's page", opened?.id === page.id);
    const refused = await attempt(() => admin.archive(page.id));
    check("the admin (editor, not the creator) moves it to Trash", refused === null, refused ?? "trashed");
    const head = await memberDb.schema("content").from("document").select("deleted_at").eq("id", page.id).single();
    check("the creator sees it in Trash", head.data?.deleted_at != null, String(head.data?.deleted_at));
    const restored = await attempt(() => member.restore(page.id));
    check("the creator restores it", restored === null, restored ?? "restored");
    const back = await admin.get(page.id);
    check("restored, the admin opens it again", back?.id === page.id && !back.isArchived);
  } finally {
    const left = await attempt(() => member.archive(page.id));
    check("scratch page trashed by its creator", left === null, left ?? page.id);
  }
  process.exit(failures ? 1 : 0);
}

void main();

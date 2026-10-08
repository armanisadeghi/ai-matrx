// features/spaces/store-db/trash-reminders-live-proof.ts — Trash cancels a page's reminders; restore brings them back.
//
// Run: pnpm tsx features/spaces/store-db/trash-reminders-live-proof.ts <organization-id>
// Uses the admin account (AI_ADMIN_USERNAME/PASSWORD) in an organization it belongs to. The admin sets a reminder on a
// page and on its sub-page (the page's scope `spaces:<id>:`), moves the parent to Trash (the sub-page trashes with it),
// checks both reminders are cancelled, restores the parent and checks they are pending again. Prints PASS/FAIL per claim.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseSpacesStore } from "./supabase-store";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const orgId = process.argv[2];
if (!url || !key || !orgId) throw new Error("Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and an organization id argument.");

// Same scope as features/spaces/editor/reminders.ts (not imported: that file pulls in the browser client).
const reminderScope = (spaceId: string) => `spaces:${spaceId}:`;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  const db = createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email: process.env.AI_ADMIN_USERNAME!, password: process.env.AI_ADMIN_PASSWORD! });
  if (error || !data.user) throw new Error(`Sign-in failed: ${error?.message}`);
  const uid = data.user.id;
  const store = new SupabaseSpacesStore(db, orgId);

  const parent = await store.create({ parentId: null, title: "Quarterly tax filing checklist" });
  const child = await store.create({ parentId: parent.id, title: "Estimated payment worksheet" });
  const remind = async (spaceId: string, block: string) => {
    const when = new Date(Date.now() + 30 * 86400_000).toISOString();
    const { error: e } = await db.schema("communication").rpc("reconcile_my_notices", {
      p_scope: reminderScope(spaceId),
      p_notices: [{ source_key: `${reminderScope(spaceId)}${block}:0`, deliver_at: when, subject: { title: "Reminder: filing", body: "Estimated payment due" }, deep_link: `/spaces/${spaceId}#block-${block}` }],
      p_organization_id: orgId,
    });
    if (e) throw new Error(`reconcile failed: ${e.message}`);
  };
  const statusOf = async (spaceId: string) => {
    const { data: rows, error: e } = await db.schema("communication").from("notification").select("status").eq("recipient_user_id", uid).like("metadata->>scheduled_notice_key", `${reminderScope(spaceId)}%`);
    if (e) throw new Error(e.message);
    return (rows ?? []).map((r) => r.status).join(",") || "none";
  };
  try {
    await remind(parent.id, "b1");
    await remind(child.id, "b2");
    check("both reminders start pending", (await statusOf(parent.id)) === "pending" && (await statusOf(child.id)) === "pending");
    await store.archive(parent.id);
    const p1 = await statusOf(parent.id);
    const c1 = await statusOf(child.id);
    check("trashing the page cancels its reminder", p1 === "cancelled", p1);
    check("the sub-page that trashed with it is cancelled too", c1 === "cancelled", c1);
    await store.restore(parent.id);
    const p2 = await statusOf(parent.id);
    check("restoring the page makes its reminder pending again", p2 === "pending", p2);
  } finally {
    await store.archive(parent.id).catch(() => undefined);
    await db.schema("communication").rpc("cancel_scheduled_notice", { p_user_id: uid, p_source_key: "spaces:", p_prefix: true }).then(() => undefined, () => undefined);
  }
  process.exit(failures ? 1 : 0);
}

void main();

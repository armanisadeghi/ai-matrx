// features/spaces/store-db/live-proof.ts — live proof of the database SpacesStore.
//
// Run: pnpm tsx features/spaces/store-db/live-proof.ts <organization-id>
// Signs in as admin@admin.com (AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD) and test@test.com
// (SPACES_PROOF_SECOND_PASSWORD, else the admin password), walks the store end to end on the live
// database, prints one PASS/FAIL line per claim, and archives every Space it made.
// The organization must be one the admin owns and test@test.com is NOT a member of.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { SpaceDoc } from "../contract";
import { SupabaseSpacesStore } from "./supabase-store";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const orgId = process.argv[2];
if (!url || !key || !orgId) throw new Error("Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and an organization id argument.");

async function signedIn(email: string, password: string) {
  const db = createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return { db, userId: data.user.id };
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function refused(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : JSON.stringify(e);
  }
}

async function main() {
  const admin = await signedIn(process.env.AI_ADMIN_USERNAME!, process.env.AI_ADMIN_PASSWORD!);
  const second = await signedIn("test@test.com", process.env.SPACES_PROOF_SECOND_PASSWORD ?? process.env.AI_ADMIN_PASSWORD!);
  const store = new SupabaseSpacesStore(admin.db, orgId);
  const theirs = new SupabaseSpacesStore(second.db, orgId);
  const made: string[] = [];

  try {
    const parent = await store.create({ parentId: null, title: "Q4 launch plan" });
    made.push(parent.id);
    check("create a Space", parent.title === "Q4 launch plan" && parent.parentId === null, parent.id);
    const visibilityOf = async (id: string) =>
      (await admin.db.schema("content").from("document").select("visibility").eq("id", id).single()).data?.visibility;

    const child = await store.create({ parentId: parent.id, title: "Press outreach" });
    made.push(child.id);
    check("create a sub-Space", child.parentId === parent.id, `position ${child.position}`);
    const [pv, cv] = [await visibilityOf(parent.id), await visibilityOf(child.id)];
    check("a top-level Space is Organization; its sub-Space inherits it", pv === "internal" && cv === pv, `${pv} / ${cv}`);

    const block = (text: string) => ({ id: crypto.randomUUID(), type: "paragraph", text: [{ text }] });
    const v0 = parent.version;
    const saved1 = await store.save({ ...parent, blocks: [block("Ship the beta to 40 design partners.")] }, v0);
    const saved2 = await store.save(
      { ...saved1, settings: { ...saved1.settings, fullWidth: true }, blocks: [...saved1.blocks, block("Announce on the 14th.")] },
      saved1.version,
    );
    check("save twice", saved2.version > saved1.version && saved1.version > v0, `versions ${v0} -> ${saved1.version} -> ${saved2.version}`);

    const stale = await refused(() => store.save({ ...saved1, blocks: [block("stale edit")] }, saved1.version));
    check("a stale version is refused", stale !== null && /changed since/.test(stale), stale ?? "saved");

    const history = await store.history(parent.id);
    check(
      "page history holds both snapshots",
      history.length === 2 && history[0].snapshot.blocks.length === 2 && history[1].snapshot.blocks.length === 1,
      `${history.length} snapshot(s)`,
    );

    const reread = (await store.get(parent.id)) as SpaceDoc;
    check("get returns the latest snapshot", reread.blocks.length === 2 && reread.settings.fullWidth, `${reread.blocks.length} blocks`);

    const listed = await store.list();
    check(
      "list holds the Space and its sub-Space",
      listed.some((s) => s.id === parent.id && s.parentId === null) && listed.some((s) => s.id === child.id && s.parentId === parent.id),
    );

    check("second account cannot open the Space before sharing", (await theirs.get(parent.id)) === null);
    check("second account cannot open the sub-Space before sharing", (await theirs.get(child.id)) === null);

    await store.archive(parent.id);
    const parentTrashed = await store.get(parent.id);
    const childTrashed = await store.get(child.id);
    check("archive the Space", parentTrashed?.isArchived === true);
    check("its sub-Space is archived with it", childTrashed?.isArchived === true);

    await store.restore(parent.id);
    const parentBack = await store.get(parent.id);
    const childBack = await store.get(child.id);
    check("restore brings the Space back", parentBack?.isArchived === false);
    check("restore brings the sub-Space back under it", childBack?.isArchived === false && childBack?.parentId === parent.id);

    const { error: shareError } = await admin.db.rpc("share_resource_with_user", {
      p_resource_type: "document",
      p_resource_id: parent.id,
      p_target_user_id: second.userId,
      p_permission_level: "viewer",
    });
    check("share the Space with the second account", !shareError, shareError?.message ?? "");
    check("second account opens the shared Space", (await theirs.get(parent.id)) !== null);
    check("second account opens the sub-Space through its parent", (await theirs.get(child.id)) !== null);
    const theirChildren = await theirs.children(parent.id);
    check("second account expands the shared Space to its sub-Space", theirChildren.some((s) => s.id === child.id));
    const theirList = await theirs.list();
    check(
      "second account's list shows the shared Space and its sub-Space",
      theirList.some((s) => s.id === parent.id) && theirList.some((s) => s.id === child.id),
      `${theirList.filter((s) => s.id === parent.id || s.id === child.id).length}/2 listed`,
    );
  } finally {
    if (made[0]) {
      await admin.db.rpc("revoke_resource_access", { p_resource_type: "document", p_resource_id: made[0], p_target_user_id: second.userId });
    }
    for (const id of made.reverse()) {
      const doc = await store.get(id).catch(() => null);
      if (doc && !doc.isArchived) await store.archive(id).catch((e) => console.log(`cleanup: ${String(e)}`));
    }
    console.log(`cleanup: archived ${made.join(", ")}`);
  }
  console.log(failures ? `${failures} FAILED` : "ALL PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch((e: unknown) => {
  console.log(`FAIL  the proof stopped: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
  process.exit(1);
});

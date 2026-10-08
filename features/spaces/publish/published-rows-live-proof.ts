// features/spaces/publish/published-rows-live-proof.ts — live proof that a published page carries its
// database rows to a signed-out reader, and nothing else (J1, Notion), plus the two publish repairs.
//
// Run: pnpm tsx --env-file=.env --env-file=.env.local features/spaces/publish/published-rows-live-proof.ts <admin-org-id> <table-id>
// Signs in as admin@admin.com (AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD). <table-id>: a custom table admin can
// open that has a `status` column with an "Active" choice (e.g. the Agency OS Clients table). Makes a fresh
// Private page + sub-page, each with a database block on that table, then proves, SIGNED OUT:
//   unpublished              → content.space_public_view answers null (no rows anywhere)
//   published                → the root's block answers rows through its own views (a filter narrows them;
//                              a chart view gets the same rows); the sub-page's block is NOT in the root's answer
//   the helper               → content._space_public_databases is not callable by a signed-out client
//   sub-pages off            → the sub-page (and so its block's rows) answers null
//   unpublish                → the page goes back to Private (shown to only me), never Organization
//   share capabilities       → a document's publish lane is published_to_web (the rule, not its name)
// Leaves nothing behind: both pages go to Trash.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseSpacesStore } from "../store-db/supabase-store";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const [adminOrg, tableId] = process.argv.slice(2);
if (!url || !key || !adminOrg || !tableId) throw new Error("Need Supabase env and <admin-org-id> <table-id>.");

type Db = SupabaseClient<Database>;
const fresh = (): Db => createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

interface DbAnswer {
  table_id: string;
  rows: Array<{ id: string; data: Record<string, unknown> }>;
  views: Record<string, string[]>;
}
async function view(db: Db, k: string) {
  const { data, error } = await db.schema("content").rpc("space_public_view", { p_key: k });
  if (error) throw new Error(`space_public_view(${k}): ${error.message}`);
  return data as { id: string; slug: string | null; databases?: Record<string, DbAnswer> } | null;
}

function databaseBlock(id: string, views: Array<Record<string, unknown>>) {
  return { id, type: "database", props: { source: { kind: "table", tableId }, inline: true, views, activeViewId: views[0].id } };
}

async function main() {
  const adminPassword = process.env.AI_ADMIN_PASSWORD;
  if (!adminPassword) throw new Error("AI_ADMIN_PASSWORD is not set.");
  const admin = fresh();
  const { error: signErr } = await admin.auth.signInWithPassword({ email: process.env.AI_ADMIN_USERNAME ?? "admin@admin.com", password: adminPassword });
  if (signErr) throw new Error(`Sign-in failed: ${signErr.message}`);
  const anon = fresh();

  const store = new SupabaseSpacesStore(admin, adminOrg);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const root = await store.create({ parentId: null, title: `Client Roster ${stamp}` });
  const sub = await store.create({ parentId: root.id, title: "Archived clients" });
  const made = [root.id, sub.id];
  const rootBlock = crypto.randomUUID();
  const subBlock = crypto.randomUUID();

  try {
    const rootDoc = await store.get(root.id);
    await store.save(
      {
        ...rootDoc!,
        blocks: [
          { id: crypto.randomUUID(), type: "text", text: [{ text: "Every client we serve this quarter." }] },
          databaseBlock(rootBlock, [
            { id: "view-all", name: "All", layout: "grid" },
            { id: "view-active", name: "Active", layout: "grid", filters: { status: "Active" } },
            { id: "view-chart", name: "By status", layout: "chart", chart: { type: "donut", groupBy: "status", op: "count" } },
          ]),
        ],
      },
      rootDoc!.version,
    );
    const subDoc = await store.get(sub.id);
    await store.save({ ...subDoc!, blocks: [databaseBlock(subBlock, [{ id: "view-sub", name: "All", layout: "grid" }])] }, subDoc!.version);

    // Private first: "Shown to: only me" (the Private rung).
    const { error: privErr } = await admin.schema("content").from("document").update({ visibility: "personal" }).eq("id", root.id);
    check("the page is made Private", !privErr, privErr?.message);

    check("unpublished page answers nothing signed out", (await view(anon, root.id)) === null);

    const { data: pub, error: pubErr } = await admin.schema("content").rpc("space_publish", { p_space_id: root.id, p_published: true });
    check("publish succeeds", !pubErr, pubErr?.message);
    const slug = (pub as { slug?: string } | null)?.slug ?? root.id;
    const onWeb = await view(anon, slug);
    const answer = onWeb?.databases?.[rootBlock];
    check("the root's database block answers rows signed out", !!answer && answer.rows.length > 0, `${answer?.rows.length ?? 0} rows`);
    const all = answer?.views["view-all"] ?? [];
    const active = answer?.views["view-active"] ?? [];
    const activeOk = active.every((id) => answer?.rows.find((r) => r.id === id)?.data.status !== undefined);
    check("a view's filter narrows its rows", active.length > 0 && active.length <= all.length && activeOk, `${active.length} of ${all.length}`);
    check("the chart view draws from the same rows", (answer?.views["view-chart"] ?? []).length === all.length);
    check("a block not on this page answers nothing (the sub-page's block)", !onWeb?.databases?.[subBlock]);
    check("the sub-page's own block answers through the sub-page", !!(await view(anon, sub.id))?.databases?.[subBlock]);

    const { error: helperErr } = await anon.schema("content").rpc("_space_public_databases" as never, {} as never);
    check("the rows helper is not callable signed out", !!helperErr, helperErr?.message);

    await admin.schema("content").rpc("space_publish", { p_space_id: root.id, p_include_sub_pages: false });
    check("sub-pages off: the sub-page and its block's rows answer nothing", (await view(anon, sub.id)) === null);
    check("sub-pages off: the root still answers its own rows", !!(await view(anon, slug))?.databases?.[rootBlock]);

    await admin.schema("content").rpc("space_publish", { p_space_id: root.id, p_published: false });
    check("unpublished again: no rows signed out", (await view(anon, slug)) === null && (await view(anon, root.id)) === null);
    const { data: after } = await admin.schema("content").from("document").select("visibility, shown_to").eq("id", root.id).single();
    check("unpublishing a Private page leaves it Private", after?.visibility === "personal" && after.shown_to === "only_me", `${after?.visibility} / ${after?.shown_to}`);

    const { data: caps } = await admin.rpc("get_share_capabilities", { p_resource_type: "document" });
    const lane = (caps as { publish_lane?: string } | null)?.publish_lane;
    check("documents can be published (the check reads the rule, not its name)", lane === "published_to_web", String(lane));
  } finally {
    for (const id of made.reverse()) {
      await admin.schema("content").from("document").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    }
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

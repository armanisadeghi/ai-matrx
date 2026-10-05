// lib/spaces-blocks/live-proof.ts — live proof of the Spaces import doors.
//
// Run: pnpm exec tsx --env-file=.env --env-file=.env.local lib/spaces-blocks/live-proof.ts <organization-id> <row-record-id>
// Signs in as admin@admin.com (AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD) and test@test.com
// (SPACES_PROOF_SECOND_PASSWORD, else the admin password), converts a realistic Notion page with
// notionMarkdownToBlocks, drives content.space_upsert_external, a row body (row_body) and a block
// comment (public.cmt_add) on the live database, prints one PASS/FAIL line per claim, and archives
// every Space it made. The organization must be one the admin owns and test@test.com is NOT in;
// the row must be a custom.record in that organization.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { notionMarkdownToBlocks } from "./notion-markdown";
import { validateSnapshot } from "./schema";
import { DEFAULT_PAGE_SETTINGS, type SpaceSnapshot } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const [orgId, rowId] = process.argv.slice(2);
if (!url || !key || !orgId || !rowId) throw new Error("Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, an organization id and a row (custom.record) id.");

async function signedIn(email: string, password: string) {
  const db = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return { db, userId: data.user.id };
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

interface UpsertRow {
  space_id: string;
  version: number;
  content_version: number;
  created: boolean;
  content_changed: boolean;
  placement: string;
}

async function upsert(db: SupabaseClient, args: Record<string, unknown>): Promise<UpsertRow> {
  const { data, error } = await db.schema("content").rpc("space_upsert_external", args);
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return (data as UpsertRow[])[0];
}

async function refusal(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : JSON.stringify(e);
  }
}

function snapshotOf(md: string, seed: string): SpaceSnapshot {
  const { blocks } = notionMarkdownToBlocks(md, { idSeed: seed });
  const snap: SpaceSnapshot = { v: 1, settings: DEFAULT_PAGE_SETTINGS, icon: { icon: "TreePalm" }, cover: null, blocks };
  const problems = validateSnapshot(snap);
  if (problems.length) throw new Error(`invalid snapshot: ${problems.join("; ")}`);
  return snap;
}

const ROOT_MD = [
  "# The Traveling SMM™ OS",
  '<callout icon="📌" color="gray_bg">',
  "\tEvery client gets a Loom recap on Fridays.",
  "</callout>",
  "## Scaling to $30K Months",
  "- [x] Hire a second editor",
  '- [ ] Launch the Momentum campaign {color="orange"}',
  "<details>",
  "<summary>Scripts</summary>",
  "\t1. Hook: I fly around the world filming hotels.",
  "</details>",
].join("\n");

async function main() {
  const admin = await signedIn(process.env.AI_ADMIN_USERNAME!, process.env.AI_ADMIN_PASSWORD!);
  const second = await signedIn("test@test.com", process.env.SPACES_PROOF_SECOND_PASSWORD ?? process.env.AI_ADMIN_PASSWORD!);
  const run = crypto.randomUUID().slice(0, 8);
  const rootKey = `notion:page/proof-${run}-root`;
  const childKey = `notion:page/proof-${run}-clients-os`;
  const otherKey = `notion:page/proof-${run}-90-day-plan`;
  const made = new Set<string>();
  const payloadCount = async (id: string) =>
    (await admin.db.schema("content").from("space_payload").select("content_version", { count: "exact", head: true }).eq("document_id", id)).count ?? -1;
  const parentOf = async (id: string) =>
    (
      await admin.db
        .schema("platform")
        .from("associations")
        .select("target_id, position")
        .eq("source_type", "document")
        .eq("source_id", id)
        .eq("label", "sub_page")
        .is("deleted_at", null)
        .maybeSingle()
    ).data;

  try {
    const rootSnap = snapshotOf(ROOT_MD, rootKey);
    const base = { p_organization_id: orgId, p_external_key: rootKey, p_title: "The Traveling SMM™ OS", p_snapshot: rootSnap };
    const first = await upsert(admin.db, base);
    made.add(first.space_id);
    check("first import creates the Space", first.created && first.content_changed, `${first.space_id} v${first.version} cv${first.content_version}`);
    const again = await upsert(admin.db, base);
    check("same key, same input: same Space, no new version", again.space_id === first.space_id && !again.created && !again.content_changed && again.version === first.version, `v${again.version} cv${again.content_version}`);
    check("one snapshot stored after two identical runs", (await payloadCount(first.space_id)) === 1, `${await payloadCount(first.space_id)} payload row(s)`);

    const edited = snapshotOf(`${ROOT_MD}\n- [ ] Post the client win on LinkedIn`, rootKey);
    const changed = await upsert(admin.db, { ...base, p_snapshot: edited });
    check("changed body: new version, same Space", changed.space_id === first.space_id && changed.content_changed && changed.content_version > first.content_version, `cv${first.content_version} -> cv${changed.content_version}`);
    check("two snapshots stored after the edit", (await payloadCount(first.space_id)) === 2);

    const { data: body } = await admin.db.schema("content").from("document").select("body, source_uri, icon").eq("id", first.space_id).single();
    check("search body is regenerated from the snapshot", Boolean(body?.body?.includes("Post the client win on LinkedIn")) && body?.source_uri === rootKey, `${body?.body?.length} chars`);

    const child = await upsert(admin.db, {
      p_organization_id: orgId,
      p_external_key: childKey,
      p_title: "Clients OS",
      p_parent_external_key: rootKey,
      p_snapshot: snapshotOf("- Bella Vista Resort\n- Casa Mar Boutique Hotel", childKey),
    });
    made.add(child.space_id);
    check("child import is placed under its parent by key", child.placement === "placed" && (await parentOf(child.space_id))?.target_id === first.space_id, child.placement);
    const childAgain = await upsert(admin.db, {
      p_organization_id: orgId,
      p_external_key: childKey,
      p_title: "Clients OS",
      p_parent_external_key: rootKey,
      p_snapshot: snapshotOf("- Bella Vista Resort\n- Casa Mar Boutique Hotel", childKey),
    });
    check("re-import of the child changes nothing", childAgain.placement === "unchanged" && !childAgain.content_changed && childAgain.space_id === child.space_id);

    const other = await upsert(admin.db, { p_organization_id: orgId, p_external_key: otherKey, p_title: "90 Day Plan", p_snapshot: snapshotOf("## Month 1", otherKey) });
    made.add(other.space_id);
    const moved = await upsert(admin.db, {
      p_organization_id: orgId,
      p_external_key: childKey,
      p_title: "Clients OS",
      p_parent_id: other.space_id,
      p_position: 2048,
      p_snapshot: snapshotOf("- Bella Vista Resort\n- Casa Mar Boutique Hotel", childKey),
    });
    const edge = await parentOf(child.space_id);
    check("move parent: the one sub_page edge moves", moved.placement === "moved" && edge?.target_id === other.space_id && edge?.position === 2048, `${moved.placement} -> ${edge?.target_id} @${edge?.position}`);
    const { count: liveEdges } = await admin.db
      .schema("platform")
      .from("associations")
      .select("id", { count: "exact", head: true })
      .eq("source_id", child.space_id)
      .eq("label", "sub_page")
      .is("deleted_at", null);
    check("exactly one live parent edge", liveEdges === 1, `${liveEdges}`);

    const outsider = await refusal(() => upsert(second.db, { ...base, p_external_key: `notion:page/proof-${run}-outsider` }));
    check("a non-member cannot import into the organization", outsider !== null && outsider.startsWith("42501"), outsider ?? "imported");
    const noOrg = await refusal(() => upsert(admin.db, { ...base, p_organization_id: null }));
    check("no organization named: refused", noOrg !== null && noOrg.startsWith("23502"), noOrg ?? "imported");

    // ---- comments on a block (existing door public.cmt_add, part_anchor)
    const blockId = rootSnap.blocks[1].id;
    const { data: commentId, error: cErr } = await admin.db.rpc("cmt_add", {
      p_entity_type: "document",
      p_entity_id: first.space_id,
      p_body: "Can we move the Loom recap to Thursdays?",
      p_anchor: { __kind: "part_anchor", part_key: `block:${blockId}`, label: "Callout" },
    });
    check("comment on a block via cmt_add + part_anchor", !cErr && typeof commentId === "string", cErr?.message ?? String(commentId));
    const { data: comment } = await admin.db.schema("platform").from("comments").select("entity_type, entity_id, anchor").eq("id", commentId as string).maybeSingle();
    check("the comment reads back with its block anchor", comment?.entity_id === first.space_id && (comment?.anchor as { part_key?: string })?.part_key === `block:${blockId}`);
    const { error: rawErr } = await admin.db.rpc("cmt_add", { p_entity_type: "document", p_entity_id: first.space_id, p_body: "x", p_anchor: { block_id: blockId } });
    check("a bare {block_id} anchor is refused (use part_anchor)", rawErr?.code === "22023", rawErr?.message ?? "accepted");
    const { data: theirComments } = await second.db.schema("platform").from("comments").select("id").eq("id", commentId as string);
    check("an outsider cannot read the comment", (theirComments ?? []).length === 0);

    // ---- row body: a Clients row's body page
    const rowBodyKey = `notion:page/proof-${run}-row-body`;
    const rowBody = await upsert(admin.db, {
      p_organization_id: orgId,
      p_external_key: rowBodyKey,
      p_title: "Bella Vista Resort — onboarding notes",
      p_row_record_id: rowId,
      p_snapshot: snapshotOf("## Kickoff\n- [ ] Collect brand assets\n- [ ] Book the first shoot", rowBodyKey),
    });
    made.add(rowBody.space_id);
    check("row body Space is linked to the row", rowBody.placement === "row_body", rowBody.placement);
    const openBody = async (db: SupabaseClient) => (await db.schema("content").from("document").select("id").eq("id", rowBody.space_id).maybeSingle()).data !== null;
    // The record store is doors-only: "can open the row" is the access kernel's answer.
    const openRow = async (db: SupabaseClient) => (await db.schema("iam").rpc("has_access", { p_type: "record", p_id: rowId, p_required: "viewer" })).data === true;
    check("outsider cannot open the row nor its body before sharing", !(await openRow(second.db)) && !(await openBody(second.db)));
    const { error: shareError } = await admin.db.rpc("share_resource_with_user", {
      p_resource_type: "record",
      p_resource_id: rowId,
      p_target_user_id: second.userId,
      p_permission_level: "viewer",
    });
    check("share the row (only the row) with the outsider", !shareError, shareError?.message ?? "");
    check("outsider opens the row", await openRow(second.db));
    check("outsider opens the row's body Space through row_body", await openBody(second.db));
    const second2 = await refusal(() => upsert(admin.db, { p_organization_id: orgId, p_external_key: `notion:page/proof-${run}-row-body-2`, p_title: "dup", p_row_record_id: rowId, p_snapshot: { blocks: [] } }));
    check("a row holds one live body Space", second2 !== null && second2.startsWith("23505"), second2 ?? "linked twice");
    const { data: dupDoc } = await admin.db.schema("content").from("document").select("id").eq("source_uri", `notion:page/proof-${run}-row-body-2`).maybeSingle();
    if (dupDoc) made.add(dupDoc.id);
  } finally {
    await admin.db.rpc("revoke_resource_access", { p_resource_type: "record", p_resource_id: rowId, p_target_user_id: second.userId });
    for (const id of [...made].reverse()) {
      const { error } = await admin.db.schema("content").from("document").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
      if (error) console.log(`cleanup ${id}: ${error.message}`);
    }
    console.log(`cleanup: archived ${[...made].join(", ")}; revoked the row share`);
  }
  console.log(failures ? `${failures} FAILED` : "ALL PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch((e: unknown) => {
  console.log(`FAIL  the proof stopped: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
  process.exit(1);
});

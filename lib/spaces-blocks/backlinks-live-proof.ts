// lib/spaces-blocks/backlinks-live-proof.ts — live proof of the derived Space edges and content.space_backlinks.
//
// Run: pnpm exec tsx --env-file=.env --env-file=.env.local lib/spaces-blocks/backlinks-live-proof.ts <organization-id> <table-id> <second-user-organization-id>
// Signs in as admin@admin.com (AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD) and test@test.com
// (SPACES_PROOF_SECOND_PASSWORD, else the admin password). The first organization is one the admin is in and
// test@test.com is NOT; the table is a custom table (custom.record) in it; the third is an organization of
// test@test.com. Saves go through content.space_upsert_external (so content.space_save), the database keeps the
// mentions / embeds edges, and every Space made here is archived at the end.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PAGE_SETTINGS, type SpaceBlock, type SpaceSnapshot } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const [orgId, tableId, secondOrgId] = process.argv.slice(2);
if (!url || !key || !orgId || !tableId || !secondOrgId) {
  throw new Error("Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, an organization id, a table id and the second user's organization id.");
}

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

const snap = (blocks: SpaceBlock[]): SpaceSnapshot => ({ v: 1, settings: DEFAULT_PAGE_SETTINGS, icon: { icon: "Link" }, cover: null, blocks });
const para = (id: string, text: string): SpaceBlock => ({ id, type: "text", text: [{ text }] });
const mentionPara = (id: string, before: string, spaceId: string, title: string): SpaceBlock => ({
  id,
  type: "text",
  text: [{ text: before }, { text: title, mention: { kind: "space", spaceId } }],
});

async function upsert(db: SupabaseClient, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.schema("content").rpc("space_upsert_external", args);
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return (data as { space_id: string }[])[0].space_id;
}

async function backlinks(db: SupabaseClient, spaceId: string): Promise<{ id: string; title: string; icon: string | null }[]> {
  const { data, error } = await db.schema("content").rpc("space_backlinks", { p_space_id: spaceId });
  if (error) throw new Error(`space_backlinks: ${error.code}: ${error.message}`);
  return data as { id: string; title: string; icon: string | null }[];
}

async function main() {
  const admin = await signedIn(process.env.AI_ADMIN_USERNAME!, process.env.AI_ADMIN_PASSWORD!);
  const second = await signedIn("test@test.com", process.env.SPACES_PROOF_SECOND_PASSWORD ?? process.env.AI_ADMIN_PASSWORD!);
  const run = crypto.randomUUID().slice(0, 8);
  const made: { db: SupabaseClient; id: string }[] = [];
  const keyOf = (name: string) => `proof:backlinks/${run}/${name}`;

  try {
    // B: the page being linked to. A: a meeting-notes page that mentions B and embeds the client table.
    const b = await upsert(admin.db, {
      p_organization_id: orgId, p_external_key: keyOf("b"), p_title: "Q4 Launch Plan",
      p_snapshot: snap([para("b1", "Launch the spring menu at both locations by March 3.")]),
    });
    made.push({ db: admin.db, id: b });
    const aBlocks = (withMention: boolean): SpaceBlock[] => [
      withMention ? mentionPara("a1", "Agreed the timeline in ", b, "Q4 Launch Plan") : para("a1", "Agreed the timeline."),
      para("a2", "Owners: Dana (menu), Luis (staffing)."),
      { id: "a3", type: "database", props: { inline: true, source: { kind: "table", tableId }, title: "Clients" } },
    ];
    const aArgs = { p_organization_id: orgId, p_external_key: keyOf("a"), p_title: "Weekly Sync — Oct 6" };
    const a = await upsert(admin.db, { ...aArgs, p_snapshot: snap(aBlocks(true)) });
    made.push({ db: admin.db, id: a });

    const afterMention = await backlinks(admin.db, b);
    check("A mentions B: B's backlinks list A", afterMention.some((r) => r.id === a), afterMention.map((r) => r.title).join(", "));
    check("backlink row carries title and icon", afterMention.find((r) => r.id === a)?.title === "Weekly Sync — Oct 6" && !!afterMention.find((r) => r.id === a)?.icon);

    const embeds = await admin.db.schema("platform").from("associations").select("target_id")
      .eq("source_type", "document").eq("source_id", a).eq("target_type", "record").eq("role", "embeds").is("deleted_at", null);
    check("a database block bound to a table makes one embeds edge", !embeds.error && embeds.data?.length === 1 && embeds.data[0].target_id === tableId,
      embeds.error?.message ?? `${embeds.data?.length} edge(s)`);

    await upsert(admin.db, { ...aArgs, p_snapshot: snap(aBlocks(false)) });
    const afterRemove = await backlinks(admin.db, b);
    check("mention removed: A is gone from B's backlinks", !afterRemove.some((r) => r.id === a), `${afterRemove.length} backlink(s)`);

    await upsert(admin.db, { ...aArgs, p_snapshot: snap(aBlocks(true)) });
    check("mention restored: A is back (tombstone revived)", (await backlinks(admin.db, b)).some((r) => r.id === a));

    // Hidden source: test@test.com owns T; admin's A (an organization test@test.com is not in) mentions T.
    const t = await upsert(second.db, {
      p_organization_id: secondOrgId, p_external_key: keyOf("t"), p_title: "Helpdesk Runbook",
      p_snapshot: snap([para("t1", "Reset a customer password from the admin panel.")]),
    });
    made.push({ db: second.db, id: t });
    const t2 = await upsert(second.db, {
      p_organization_id: secondOrgId, p_external_key: keyOf("t2"), p_title: "On-call Checklist",
      p_snapshot: snap([mentionPara("u1", "Start with the ", t, "Helpdesk Runbook")]),
    });
    made.push({ db: second.db, id: t2 });
    await upsert(admin.db, { ...aArgs, p_snapshot: snap([...aBlocks(true), mentionPara("a4", "See also ", t, "Helpdesk Runbook")]) });

    const edgeToT = await admin.db.schema("platform").from("associations").select("id", { count: "exact", head: true })
      .eq("source_id", a).eq("target_id", t).eq("role", "mentions").is("deleted_at", null);
    check("the edge A -> T exists (written by the database)", edgeToT.count === 1, `${edgeToT.count ?? edgeToT.error?.message}`);
    const seenByOwner = await backlinks(second.db, t);
    check("T's owner sees the Space they can open (On-call Checklist)", seenByOwner.some((r) => r.id === t2), seenByOwner.map((r) => r.title).join(", "));
    check("T's owner does NOT see A, which they cannot open", !seenByOwner.some((r) => r.id === a), seenByOwner.map((r) => r.title).join(", "));
    const asked = await backlinks(second.db, b);
    check("asking about a Space you cannot open returns nothing", asked.length === 0, `${asked.length} row(s)`);
  } finally {
    for (const { db, id } of made.reverse()) {
      const { error } = await db.schema("content").from("document").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
      if (error) console.log(`cleanup ${id}: ${error.message}`);
    }
    console.log(`cleanup: archived ${made.map((m) => m.id).join(", ")}`);
  }
  console.log(failures ? `${failures} FAILED` : "ALL PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch((e: unknown) => {
  console.log(`FAIL  the proof stopped: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
  process.exit(1);
});

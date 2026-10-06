// features/spaces/store-db/duplicate-live-proof.ts — live proof of content.space_duplicate.
//
// Run: pnpm tsx --env-file=.env features/spaces/store-db/duplicate-live-proof.ts <source-space-id> <organization-id> [<outsider's-own-organization-id>]
// Signs in as admin@admin.com (AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD) and test@test.com
// (SPACES_PROOF_SECOND_PASSWORD, else the admin password); duplicates the source with its tree,
// checks size, order, mention remap and that the source is untouched; checks a person who cannot
// open the source is refused; archives every copy it made.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const [sourceId, orgId] = process.argv.slice(2);
if (!url || !key || !sourceId || !orgId) throw new Error("Need Supabase env and <source-space-id> <organization-id>.");

type Db = SupabaseClient<Database>;
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

interface Node { id: string; title: string; parent: string | null; pos: number | null; path: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
async function walk(db: Db, rootId: string): Promise<Node[]> {
  const root = await db.schema("content").from("document").select("id,title").eq("id", rootId).single();
  const out: Node[] = [{ id: rootId, title: root.data!.title, parent: null, pos: null, path: "" }];
  for (let i = 0; i < out.length; i++) {
    const { data, error } = await (db.schema("content") as any).rpc("space_children", { p_parent_id: out[i].id });
    if (error) throw new Error(error.message);
    for (const k of data as any[]) out.push({ id: k.id, title: k.title, parent: out[i].id, pos: k.edge_position, path: `${out[i].path}/${k.title}` });
  }
  return out;
}

async function snapshots(db: Db, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 20) {
    const { data, error } = await db.schema("content").from("space_payload").select("document_id,content_version,snapshot")
      .in("document_id", ids.slice(i, i + 20)).order("content_version", { ascending: false });
    if (error) throw new Error(error.message);
    for (const r of data!) if (!m.has(r.document_id)) m.set(r.document_id, JSON.stringify(r.snapshot));
  }
  return m;
}

async function fingerprint(db: Db, ids: string[]) {
  const { data } = await db.schema("content").from("document").select("id,version,content_version,updated_at,deleted_at,title").in("id", ids);
  return JSON.stringify((data ?? []).sort((a, b) => a.id.localeCompare(b.id)));
}

async function main() {
  const admin = await signedIn(process.env.AI_ADMIN_USERNAME!, process.env.AI_ADMIN_PASSWORD!);
  const second = await signedIn("test@test.com", process.env.SPACES_PROOF_SECOND_PASSWORD ?? process.env.AI_ADMIN_PASSWORD!);
  const made: string[] = [];
  const rpc = (db: Db, args: Record<string, unknown>) => (db.schema("content") as any).rpc("space_duplicate", args) as Promise<{ data: string | null; error: { code?: string; message: string } | null }>;
  try {
    const src = await walk(admin, sourceId);
    const srcIds = src.map((n) => n.id);
    const before = await fingerprint(admin, srcIds);
    const srcSnaps = await snapshots(admin, srcIds);
    console.log(`source tree: ${src.length} pages`);

    const t0 = Date.now();
    const { data: rootId, error } = await rpc(admin, { p_space_id: sourceId, p_organization_id: orgId });
    const ms = Date.now() - t0;
    if (error || !rootId) throw new Error(`duplicate failed: ${error?.message}`);
    made.push(rootId);
    console.log(`duplicate with children: ${ms} ms`);

    const copy = await walk(admin, rootId);
    check("same tree size", copy.length === src.length, `${copy.length} vs ${src.length}`);
    check("new ids, none shared with the source", copy.every((c) => !srcIds.includes(c.id)));
    const shape = (ns: Node[]) => ns.map((n) => `${n.path}|${n.pos}|${n.title}`.replace(/^\|null\|.*/, "root"));
    const rootTitleOk = copy[0].title === `${src[0].title} (1)`;
    check("root title gets the Notion suffix", rootTitleOk, copy[0].title);
    check("same order, positions and titles below the root", JSON.stringify(shape(copy).slice(1)) === JSON.stringify(shape(src).slice(1)));

    const copySnaps = await snapshots(admin, copy.map((c) => c.id));
    const back = new Map(copy.map((c, i) => [c.id, src[i].id]));
    let identical = 0, inTree = 0, outTree = 0;
    const uuidRe = /"(?:spaceId)":"([0-9a-f-]{36})"/g;
    for (let i = 0; i < copy.length; i++) {
      let text = copySnaps.get(copy[i].id) ?? "";
      const s = srcSnaps.get(src[i].id) ?? "";
      for (const m of s.matchAll(uuidRe)) srcIds.includes(m[1]) ? inTree++ : outTree++;
      for (const [n, o] of back) text = text.split(n).join(o);
      if (text === s) identical++;
    }
    check("every page's blocks equal the source's once copy ids map back (block ids kept)", identical === copy.length, `${identical}/${copy.length}`);
    check("source holds page mentions inside its tree to remap", inTree > 0, `${inTree} in-tree, ${outTree} outside`);
    let leaked = 0;
    for (const c of copy) for (const m of (copySnaps.get(c.id) ?? "").matchAll(uuidRe)) if (srcIds.includes(m[1])) leaked++;
    check("no copy mentions a source page from inside the tree", leaked === 0, `${leaked}`);
    check("source untouched (versions, timestamps, titles, tree)", (await fingerprint(admin, srcIds)) === before && JSON.stringify((await walk(admin, sourceId)).map((n) => n.id)) === JSON.stringify(srcIds));

    const { data: derived } = await admin.schema("platform").from("associations").select("source_id,target_id").eq("label", "mentions").is("deleted_at", null).in("source_id", copy.map((c) => c.id));
    const copyIds = new Set(copy.map((c) => c.id));
    check("derived mention edges of the copies point inside the copy tree (none at the originals)", (derived ?? []).some((e) => copyIds.has(e.target_id)) && !(derived ?? []).some((e) => srcIds.includes(e.target_id)), `${derived?.length} edges`);

    // A single page, placed under the copy at a chosen position, with a chosen title.
    const kid = src[1];
    const one = await rpc(admin, { p_space_id: kid.id, p_organization_id: orgId, p_parent_id: rootId, p_position: 5, p_with_children: false, p_title: "One page copy" });
    if (one.data) made.push(one.data);
    const placed = one.data ? await admin.schema("platform").from("associations").select("position,target_id").eq("source_id", one.data).eq("label", "sub_page").is("deleted_at", null) : null;
    check("single page, explicit title, parent and position", !one.error && placed?.data?.length === 1 && placed.data[0].position === 5 && placed.data[0].target_id === rootId, one.error?.message ?? "");
    const oneKids = one.data ? await walk(admin, one.data) : [];
    check("p_with_children=false copies one page", oneKids.length === 1);

    // A person who cannot open the source.
    const refusedOrg = await rpc(second, { p_space_id: sourceId, p_organization_id: orgId });
    check("outsider refused (not in the organization)", refusedOrg.error?.code === "42501" && !refusedOrg.data, refusedOrg.error?.message);
    // An organization the outsider belongs to (argument 3), so only "cannot open the source" can refuse.
    const ownOrg = process.argv[4];
    if (ownOrg) {
      const r = await rpc(second, { p_space_id: sourceId, p_organization_id: ownOrg });
      check("outsider refused with their own organization (cannot open the source)", r.error?.code === "42501" && !r.data, r.error?.message);
      if (r.data) made.push(r.data);
    } else console.log("SKIP  outsider own-organization case (no readable organization)");
    const nullOrg = await rpc(admin, { p_space_id: sourceId, p_organization_id: null });
    check("null organization refused", nullOrg.error?.code === "23502");

    // Archive: the copies' roots; the cascade trashes children.
    for (const id of made) await admin.schema("content").from("document").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    const left = await admin.schema("content").from("document").select("id").in("id", copy.map((c) => c.id)).is("deleted_at", null);
    check("archiving the root trashes every copied page", (left.data ?? []).length === 0, `${left.data?.length} still live`);
  } finally {
    for (const id of made) await admin.schema("content").from("document").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

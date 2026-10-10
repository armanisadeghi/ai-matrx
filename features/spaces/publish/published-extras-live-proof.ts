// features/spaces/publish/published-extras-live-proof.ts — live proof for the second half of "publish carries what is
// on the page": formula columns, relation words, built-in module blocks, and the CDN address of public pictures (J1).
//
// Run: pnpm tsx --env-file=.env --env-file=.env.local features/spaces/publish/published-extras-live-proof.ts \
//        <crm-org-id> <table-org-id> <table-id> <formula-key> <public-file-id> <private-file-id> <locked-table-id>
// Signs in as admin@admin.com (AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD). Makes its own fresh pages (never the sample),
// publishes them, reads SIGNED OUT, and puts every page in Trash at the end.
//   formula     → a published row carries the value the signed-in store computes (same value, same row)
//   relation    → a related record the publisher can open arrives as its title; nothing else arrives
//   built-in    → a task block answers rows through its own view; a module that is not on offer, a block not on the
//                 page, an unpublished page, and the helpers themselves answer nothing signed out
//   media       → the CDN address of a public file, and nothing for a private file

import { storeDoors } from "@ai-matrx/records/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseSpacesStore } from "../store-db/supabase-store";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const [crmOrg, tableOrg, tableId, formulaKey, publicFile, privateFile, lockedTable] = process.argv.slice(2);
if (!url || !key || !crmOrg || !tableOrg || !tableId || !formulaKey || !publicFile || !privateFile || !lockedTable) throw new Error("Need Supabase env and all seven arguments.");

type Db = SupabaseClient<Database>;
const fresh = (): Db => createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

interface View {
  id: string;
  slug: string | null;
  databases?: Record<string, { rows: Array<{ id: string; data: Record<string, unknown> }>; related?: Record<string, string>; fields: Array<{ data: Record<string, unknown> }> }>;
  entities?: Record<string, { token: string; columns: Array<{ api_name: string }>; rows: Array<Record<string, unknown>>; views?: Record<string, string[]> }>;
  media?: Record<string, string>;
}
async function view(db: Db, k: string) {
  const { data, error } = await db.schema("content").rpc("space_public_view", { p_key: k });
  if (error) throw new Error(`space_public_view(${k}): ${error.message}`);
  return data as unknown as View | null;
}

async function main() {
  const pw = process.env.AI_ADMIN_PASSWORD;
  if (!pw) throw new Error("AI_ADMIN_PASSWORD is not set.");
  const admin = fresh();
  const { error: signErr } = await admin.auth.signInWithPassword({ email: process.env.AI_ADMIN_USERNAME ?? "admin@admin.com", password: pw });
  if (signErr) throw new Error(`Sign-in failed: ${signErr.message}`);
  const anon = fresh();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const made: string[] = [];

  const crm = new SupabaseSpacesStore(admin, crmOrg);
  const tbl = new SupabaseSpacesStore(admin, tableOrg);
  const pageA = await crm.create({ parentId: null, title: `Open tasks ${stamp}` });
  const pageB = await tbl.create({ parentId: null, title: `Crew roster ${stamp}` });
  made.push(pageA.id, pageB.id);
  const taskBlock = crypto.randomUUID();
  const lockedBlock = crypto.randomUUID();
  const tableBlock = crypto.randomUUID();
  const lockedTableBlock = crypto.randomUUID();
  const entity = (id: string, token: string, views: unknown[]) => ({ id, type: "database", props: { source: { kind: "entity", token }, inline: true, views, activeViewId: (views[0] as { id: string }).id } });

  try {
    const a = await crm.get(pageA.id);
    await crm.save(
      {
        ...a!,
        icon: { fileId: privateFile },
        cover: { fileId: publicFile, offsetY: 50 },
        blocks: [
          entity(taskBlock, "task", [{ id: "view-open", name: "Active", layout: "grid", filters: { status: "active" } }]),
          entity(lockedBlock, "agent", [{ id: "view-all", name: "All", layout: "grid" }]),
        ],
      } as never,
      a!.version,
    );
    const b = await tbl.get(pageB.id);
    await tbl.save(
      {
        ...b!,
        blocks: ["table", "locked"].map((which) => ({
          id: which === "table" ? tableBlock : lockedTableBlock,
          type: "database",
          props: { source: { kind: "table", tableId: which === "table" ? tableId : lockedTable }, inline: true, views: [{ id: "view-all", name: "All", layout: "grid" }], activeViewId: "view-all" },
        })),
      } as never,
      b!.version,
    );

    check("unpublished: the built-in block answers nothing signed out", (await view(anon, pageA.id)) === null);

    for (const id of [pageA.id, pageB.id]) {
      const { error } = await admin.schema("content").rpc("space_publish", { p_space_id: id, p_published: true });
      if (error) throw new Error(`publish ${id}: ${error.message}`);
    }

    // ── 4. built-in module sources ───────────────────────────────────────────────
    const va = await view(anon, pageA.id);
    const ent = va?.entities?.[taskBlock];
    if (!ent || ent.rows.length === 0) console.log("  entity answer:", JSON.stringify(ent ?? null).slice(0, 300));
    check("built-in: a task block answers rows signed out", !!ent && ent.rows.length > 0, `${ent?.rows.length ?? 0} rows`);
    const cols = new Set(ent?.columns.map((c) => c.api_name));
    const allowed = new Set(["title", "status", "priority", "due_date", "project_id"]);
    check("built-in: only the listed columns travel", !!ent && [...cols].every((c) => allowed.has(c)) && ent.rows.every((r) => Object.keys(r).every((k) => k === "id" || allowed.has(k))));
    check("built-in: the view's filter narrows to its rows", !!ent && ent.rows.every((r) => String(r.status).toLowerCase() === "active") && (ent.views?.["view-open"]?.length ?? 0) === ent.rows.length);
    check("built-in: a module not on offer (agents) answers nothing", !va?.entities?.[lockedBlock]);
    check("built-in: a block of another page answers nothing", !(await view(anon, pageB.id))?.entities?.[taskBlock]);
    const calls: Array<[string, Record<string, unknown>]> = [
      ["_space_public_entities", { p_doc: {}, p_snap: {} }],
      ["_space_public_media", { p_blob: {} }],
      ["_space_public_databases", { p_doc: {}, p_snap: {} }],
    ];
    for (const [helper, args] of calls) {
      const { error } = await anon.schema("content").rpc(helper as never, args as never);
      check(`the helper ${helper} refuses a signed-out caller`, !!error && /permission denied/i.test(error.message), error?.message?.slice(0, 80));
    }

    // ── 1. pictures ──────────────────────────────────────────────────────────────
    const media = va?.media ?? {};
    check("media: the public file answers its CDN address", /^https:\/\/[a-z0-9.-]+\/.+/.test(media[publicFile] ?? ""), media[publicFile]);
    check("media: a private file answers nothing", !(privateFile in media));
    if (media[publicFile]) {
      const res = await fetch(media[publicFile], { method: "HEAD" });
      check("media: the CDN address is served with no session", res.ok, `HTTP ${res.status}`);
    }

    // ── 2. formula and 3. relation ───────────────────────────────────────────────
    const tT = Date.now();
    const vb = await view(anon, pageB.id);
    const db = vb?.databases?.[tableBlock];
    if (!db || !db.rows) console.log("  table answer:", JSON.stringify(db ?? null).slice(0, 300));
    console.log(`  table read took ${Date.now() - tT}ms`);
    check("table: rows answer signed out", !!db && (db.rows?.length ?? 0) > 0, `${db?.rows?.length ?? 0} rows`);
    const filled = (db?.rows ?? []).filter((r) => r.data[formulaKey] !== undefined && r.data[formulaKey] !== null && String(r.data[formulaKey]) !== "");
    check("formula: published rows carry a computed value", filled.length > 0, `${filled.length} of ${db?.rows.length ?? 0} rows`);
    // the signed-in table's own reader, for the same rows
    const { data: signed, error: readErr } = await storeDoors(admin).readRecordsPage({
      p_organization_id: tableOrg,
      p_table_id: tableId,
      p_filter: {},
      p_sort: [],
      p_limit: 500,
      p_offset: 0,
    });
    if (readErr) console.log("signed-in read:", readErr.message);
    const rows = ((signed as { rows?: Array<Record<string, unknown>> } | null)?.rows ?? []) as Array<Record<string, unknown>>;
    const doc = (r: Record<string, unknown>) => ((r.data ?? r.document ?? r) as Record<string, unknown>);
    const same = filled.filter((r) => {
      const s = rows.find((x) => x.id === r.id);
      return s && String(doc(s)[formulaKey]) === String(r.data[formulaKey]);
    });
    check("formula: the value is the signed-in store's own value for that row", filled.length > 0 && same.length === filled.length, `${same.length} of ${filled.length} equal; signed-in rows ${rows.length}`);

    const locked = vb?.databases?.[lockedTableBlock];
    check("table: a table the publisher cannot open answers no rows", !locked || (locked.rows ?? []).length === 0, JSON.stringify(locked ?? null).slice(0, 60));

    const related = db?.related ?? {};
    const relFields = (db?.fields ?? []).filter((f) => f.data.type === "relation").map((f) => String(f.data.key));
    const referenced = new Set<string>();
    for (const r of db?.rows ?? []) for (const k of relFields) for (const v of [r.data[k]].flat()) if (typeof v === "string") referenced.add(v);
    check("relation: a related record the publisher can open arrives as its title", Object.keys(related).length > 0 && Object.values(related).every((w) => w.trim() !== "" && w !== "A record you have not been given access to"), `${Object.keys(related).length} titles`);
    check("relation: nothing arrives that no row points at", Object.keys(related).every((id) => referenced.has(id)));

    // ── unpublish ────────────────────────────────────────────────────────────────
    for (const id of [pageA.id, pageB.id]) await admin.schema("content").rpc("space_publish", { p_space_id: id, p_published: false });
    check("unpublished again: nothing signed out", (await view(anon, pageA.id)) === null && (await view(anon, pageB.id)) === null);
  } finally {
    for (const id of made) await admin.schema("content").from("document").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

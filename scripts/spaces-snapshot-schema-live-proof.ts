// Live proof of the snapshot guard on content.space_payload, as admin@admin.com.
// Run: pnpm exec tsx --env-file=.env --env-file=.env.local scripts/spaces-snapshot-schema-live-proof.ts <organization-id>
// Saves one valid snapshot and three bad ones through content.space_upsert_external, prints the refusals
// verbatim, and archives the Space it made.
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_PAGE_SETTINGS } from "../lib/spaces-blocks/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const orgId = process.argv[2];
if (!url || !key || !orgId) throw new Error("Need env + organization id");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const run = crypto.randomUUID().slice(0, 8);
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n      ${detail}` : ""}`);
};
const good = (blocks: unknown[]) => ({ v: 1, settings: DEFAULT_PAGE_SETTINGS, icon: null, cover: null, blocks });
const save = async (tag: string, snapshot: unknown) => {
  const { data, error } = await db.schema("content").rpc("space_upsert_external", {
    p_organization_id: orgId,
    p_external_key: `proof:snapshot-schema/${run}-${tag}`,
    p_title: `Snapshot schema proof ${tag}`,
    p_snapshot: snapshot,
  });
  return { id: (data as { space_id: string }[] | null)?.[0]?.space_id, error };
};

async function main() {
  const s = await db.auth.signInWithPassword({ email: process.env.AI_ADMIN_USERNAME!, password: process.env.AI_ADMIN_PASSWORD! });
  if (s.error) throw new Error("sign-in failed");
  check("signed in as admin@admin.com", s.data.user?.email === "admin@admin.com");
  const made: string[] = [];
  const ok = await save("valid", good([{ id: "a1", type: "heading", text: [{ text: "Launch plan" }], props: { level: 1 } }, { id: "a2", type: "text", text: [{ text: "Could not map" }], props: { unsupported: { from: "notion", kind: "synced_block", source: "<x/>" } } }]));
  check("valid snapshot saves", !ok.error && !!ok.id, ok.error?.message ?? ok.id);
  if (ok.id) made.push(ok.id);
  const cases: Record<string, unknown> = {
    "unknown block type": good([{ id: "a1", type: "paragraph", text: [{ text: "x" }] }]),
    "block without id": good([{ type: "text", text: [{ text: "x" }] }]),
    "wrong props shape (heading level)": good([{ id: "a1", type: "heading", text: [{ text: "x" }], props: { level: "big" } }]),
  };
  for (const [name, snap] of Object.entries(cases)) {
    const r = await save(name.replace(/\W+/g, "-"), snap);
    if (r.id) made.push(r.id);
    check(`refused: ${name}`, !!r.error && !r.id && /not a valid snapshot/.test(r.error.message), r.error ? `${r.error.code} ${r.error.message} | hint: ${r.error.hint?.slice(0, 90)}` : "SAVED (wrong)");
  }
  for (const id of made) {
    await db.schema("content").from("document").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
  }
  const { data } = await db.schema("content").from("document").select("id").in("id", made).is("deleted_at", null);
  console.log(`cleanup: archived ${made.length} proof Space(s); still live: ${data?.length ?? "?"}`);
  process.exit(failures ? 1 : 0);
}
main();

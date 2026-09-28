/**
 * CANVAS LIKE DOOR — live proof as admin@admin.com through canvas.set_canvas_like.
 *
 * like → the caller's row is live and like_count +1; unlike → the row is archived
 * (deleted_at set) and the count is back; like again → the SAME row is revived.
 * Ends by unliking (clean up). Also proves the direct table write stays refused.
 * Session minted like scripts/delete-is-archive/live-proof.mjs; no credential printed.
 *
 *   node --env-file=.env.local scripts/canvas-like/live-proof.mjs --canvas <shared_canvas_items.id> [--org <uuid>]
 */
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const CANVAS = arg("--canvas");
const ORG = arg("--org", "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f");
const EMAIL = process.env.AI_ADMIN_USERNAME;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SECRET_KEY;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!CANVAS) throw new Error("--canvas is required");

let failed = 0;
const record = (step, ok, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}  ${JSON.stringify(detail)}`);
};

async function mintSession() {
  if (!EMAIL || !URL_ || !SERVICE || !PUB) throw new Error("AI_ADMIN_USERNAME / Supabase env missing");
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const otp = link.data?.properties?.email_otp;
  if (!otp) throw new Error(`could not mint a session: ${link.error?.message ?? "no otp"}`);
  const pub = createClient(URL_, PUB, { auth: { persistSession: false } });
  const { data, error } = await pub.auth.verifyOtp({ email: EMAIL, token: otp, type: "email" });
  if (error || !data.session) throw new Error(`verifyOtp failed: ${error?.message}`);
  return data.session;
}

const session = await mintSession();
const uid = session.user.id;
const db = createClient(URL_, PUB, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${session.access_token}` } },
});
const cv = () => db.schema("canvas");
record("signed in as the test admin", session.user.email === EMAIL, { user: uid });

const row = async () => {
  const { data, error } = await cv().from("canvas_likes").select("id, deleted_at, organization_id, created_by")
    .eq("canvas_id", CANVAS).eq("user_id", uid).maybeSingle();
  if (error) throw error;
  return data;
};
const count = async () => {
  const { data, error } = await cv().from("shared_canvas_items").select("like_count").eq("id", CANVAS).single();
  if (error) throw error;
  return data.like_count;
};
const door = async (liked) => {
  const { data, error } = await cv().rpc("set_canvas_like", { p_canvas_id: CANVAS, p_liked: liked, p_organization_id: ORG });
  if (error) throw error;
  return data;
};

const before = await count();
const r0 = await row();
record("start state: no live like by the caller", !r0 || r0.deleted_at !== null, { like_count: before, row: r0 });

const c1 = await door(true);
const r1 = await row();
record("like → row live, count +1", r1 && r1.deleted_at === null && c1 === before + 1 && r1.created_by === uid && r1.organization_id === ORG,
  { returned: c1, row: r1 });

const c2 = await door(false);
const r2 = await row();
record("unlike → same row archived, count back", r2 && r2.id === r1.id && r2.deleted_at !== null && c2 === before, { returned: c2, row: r2 });

const c3 = await door(true);
const r3 = await row();
record("like again → same row revived, count +1", r3 && r3.id === r1.id && r3.deleted_at === null && c3 === before + 1, { returned: c3, row: r3 });

const { error: directErr } = await cv().from("canvas_likes").update({ deleted_at: new Date().toISOString() }).eq("id", r3.id).select("id");
const stillLive = (await row()).deleted_at === null;
record("direct table write stays refused (the door is the only path)", stillLive, { error: directErr?.code ?? null });

const c4 = await door(false);
const r4 = await row();
record("cleanup: unliked (archived), count back", r4.deleted_at !== null && c4 === before && (await count()) === before, { returned: c4 });

process.exit(failed ? 1 : 0);

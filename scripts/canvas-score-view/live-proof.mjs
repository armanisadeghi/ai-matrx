/**
 * CANVAS SCORE + VIEW DOORS — live proof as admin@admin.com through
 * canvas.submit_canvas_score and canvas.record_canvas_view.
 *
 * score → a new attempt row owned by the caller (name from their profile), returned
 * rank / high score / own best; score again → a SECOND attempt (the table is an attempt
 * ledger), attempt_number 2, own best judged against attempt 1; view → a row owned by
 * the caller and view_count moved (or, within the hour, refused as a repeat); direct
 * table inserts stay refused. Cleanup: the proof's score and view rows are archived
 * (deleted_at) and the canvas counters the insert-only triggers moved are put back.
 * Session minted like scripts/canvas-like/live-proof.mjs; no credential printed.
 *
 *   node --env-file=.env.local scripts/canvas-score-view/live-proof.mjs --canvas <shared_canvas_items.id> [--org <uuid>]
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

if (!EMAIL || !URL_ || !SERVICE || !PUB) throw new Error("AI_ADMIN_USERNAME / Supabase env missing");
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const link = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
const otp = link.data?.properties?.email_otp;
if (!otp) throw new Error(`could not mint a session: ${link.error?.message ?? "no otp"}`);
const pub = createClient(URL_, PUB, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await pub.auth.verifyOtp({ email: EMAIL, token: otp, type: "email" });
if (authErr || !auth.session) throw new Error(`verifyOtp failed: ${authErr?.message}`);
const session = auth.session;
const uid = session.user.id;
const db = createClient(URL_, PUB, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${session.access_token}` } },
});
const cv = () => db.schema("canvas");
const svc = () => admin.schema("canvas");
record("signed in as the test admin", session.user.email === EMAIL, { user: uid });

const COUNTERS = "high_score, high_score_user, total_attempts, average_score, view_count, last_played_at";
const canvasRow = async () => {
  const { data, error } = await svc().from("shared_canvas_items").select(COUNTERS).eq("id", CANVAS).single();
  if (error) throw error;
  return data;
};
const before = await canvasRow();
const proofRows = { scores: [], views: [] };

try {
  // 1. score
  const s1 = await cv().rpc("submit_canvas_score", {
    p_canvas_id: CANVAS, p_score: 3, p_max_score: 10, p_completed: true, p_organization_id: ORG, p_time_taken: 30,
    p_data: { proof: "canvas-score-view live-proof" },
  });
  if (s1.error) throw s1.error;
  const r1 = s1.data;
  proofRows.scores.push(r1.score.id);
  record("score → new attempt owned by the caller", r1.score.user_id === uid && r1.score.created_by === uid &&
    r1.score.organization_id === ORG && r1.score.deleted_at === null && typeof r1.rank === "number",
    { id: r1.score.id, attempt: r1.attempt_number, rank: r1.rank, is_high_score: r1.is_high_score, beats_own_best: r1.beats_own_best, name: r1.score.display_name });

  // 2. score again — ledger: a second attempt, own best judged against attempt 1
  const s2 = await cv().rpc("submit_canvas_score", {
    p_canvas_id: CANVAS, p_score: 2, p_max_score: 10, p_completed: false, p_organization_id: ORG,
  });
  if (s2.error) throw s2.error;
  const r2 = s2.data;
  proofRows.scores.push(r2.score.id);
  record("score again → second attempt, attempt_number +1, not a new own best", r2.score.id !== r1.score.id &&
    r2.attempt_number === r1.attempt_number + 1 && r2.beats_own_best === false,
    { id: r2.score.id, attempt: r2.attempt_number, rank: r2.rank, is_high_score: r2.is_high_score, beats_own_best: r2.beats_own_best });

  const mid = await canvasRow();
  record("canvas counters moved by the high-score trigger", mid.total_attempts === before.total_attempts + 2,
    { total_attempts: [before.total_attempts, mid.total_attempts], high_score: [before.high_score, mid.high_score] });

  // 3. view
  const v1 = await cv().rpc("record_canvas_view", {
    p_canvas_id: CANVAS, p_organization_id: ORG, p_session_id: `proof_${Date.now()}`, p_referrer: "https://proof.local/",
  });
  if (v1.error) throw v1.error;
  const { data: myViews } = await svc().from("canvas_views").select("id, user_id, created_by, organization_id, viewed_at")
    .eq("canvas_id", CANVAS).eq("user_id", uid).is("deleted_at", null).gte("viewed_at", new Date(Date.now() - 60_000).toISOString());
  if (v1.data) proofRows.views.push(...myViews.map((v) => v.id));
  const afterView = await canvasRow();
  record(v1.data ? "view → row owned by the caller, view_count +1" : "view within the hour → refused as a repeat",
    v1.data ? myViews.length === 1 && myViews[0].created_by === uid && myViews[0].organization_id === ORG &&
      afterView.view_count === mid.view_count + 1 : afterView.view_count === mid.view_count,
    { written: v1.data, view_count: [mid.view_count, afterView.view_count], row: myViews[0] ?? null });

  const v2 = await cv().rpc("record_canvas_view", { p_canvas_id: CANVAS, p_organization_id: ORG, p_session_id: `proof2_${Date.now()}` });
  record("second view within the hour → no row, count unchanged", v2.error === null && v2.data === false &&
    (await canvasRow()).view_count === afterView.view_count, { written: v2.data });

  // 4. refusals
  const { error: dScore } = await cv().from("canvas_scores").insert({
    canvas_id: CANVAS, user_id: uid, created_by: uid, organization_id: ORG, score: 1, max_score: 1,
  });
  record("direct canvas_scores insert refused", !!dScore, { code: dScore?.code ?? null });
  const { error: dView } = await cv().from("canvas_views").insert({
    canvas_id: CANVAS, user_id: uid, created_by: uid, organization_id: ORG,
  });
  record("direct canvas_views insert refused", !!dView, { code: dView?.code ?? null });
  const { error: badOrg } = await cv().rpc("submit_canvas_score", {
    p_canvas_id: CANVAS, p_score: 1, p_max_score: 1, p_completed: true, p_organization_id: "00000000-0000-4000-8000-000000000000",
  });
  record("score in an organization the caller is not in → refused", badOrg?.code === "42501", { code: badOrg?.code ?? null });
  const { error: ghost } = await cv().rpc("record_canvas_view", {
    p_canvas_id: "00000000-0000-4000-8000-000000000001", p_organization_id: ORG,
  });
  record("view of an unknown canvas → refused", ghost?.code === "42501", { code: ghost?.code ?? null });
  const anon = createClient(URL_, PUB, { auth: { persistSession: false } });
  const { error: anonErr } = await anon.schema("canvas").rpc("record_canvas_view", { p_canvas_id: CANVAS, p_organization_id: ORG });
  record("guest cannot call the view door", !!anonErr, { code: anonErr?.code ?? null });
} finally {
  // Cleanup: archive the proof's rows, then put back the counters the insert-only triggers moved.
  const now = new Date().toISOString();
  if (proofRows.scores.length) await svc().from("canvas_scores").update({ deleted_at: now }).in("id", proofRows.scores);
  if (proofRows.views.length) await svc().from("canvas_views").update({ deleted_at: now }).in("id", proofRows.views);
  const { error: resetErr } = await svc().from("shared_canvas_items").update(before).eq("id", CANVAS);
  const after = await canvasRow();
  const { data: live } = await svc().from("canvas_scores").select("id").in("id", proofRows.scores.length ? proofRows.scores : ["00000000-0000-4000-8000-000000000000"]).is("deleted_at", null);
  record("cleanup: proof scores/views archived, counters restored", !resetErr && (live ?? []).length === 0 &&
    after.total_attempts === before.total_attempts && after.view_count === before.view_count && after.high_score === before.high_score,
    { archived_scores: proofRows.scores, archived_views: proofRows.views, counters: after, resetErr: resetErr?.message ?? null });
}

process.exit(failed ? 1 : 0);

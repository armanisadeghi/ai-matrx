// scripts/forms/typeform-door-proof.mts — LANE TYPEFORM-DUP: the public form's server half, called
// exactly as app/api/forms/<id>/{visit,asks,submit} call it (service role, the same three doors), for
// when the shared dev server cannot serve the page. Both branches of the agency intake and one
// existing Spaces-made form; then the owner's results as admin@admin.com.
//   npx tsx scripts/forms/typeform-door-proof.mts
import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const envOf = (f: string) =>
  Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
  })) as Record<string, string>;
const env = { ...envOf(".env"), ...envOf(".env.local") };
const FORM = "47209f01-8d15-421a-be1a-bd3de4578a18";
const SPACES_FORM = "ab96b127-dc1b-4d8c-8605-b371060ecfa0";
const ORG = "11d47e36-4b1e-46b8-bdf6-8ef928b730fb";
const server = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } }).schema("custom");
let failed = 0;
const check = (name: string, ok: boolean, saw: unknown = {}) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(saw)}`);
};
const call = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await server.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};
const stamp = Date.now() % 100000;

async function branch(name: string, utm: string, steps: Array<[string, unknown]>, ending: string) {
  const visit = crypto.randomBytes(18).toString("base64url");
  await call("form_visit", { p_form_id: FORM, p_visit: visit, p_event: "view", p_field: null });
  const values: Record<string, unknown> = {};
  for (const [i, [key, value]] of steps.entries()) {
    await call("form_visit", { p_form_id: FORM, p_visit: visit, p_event: i === 0 ? "start" : "reach", p_field: key });
    if (i === 0) await call("form_visit", { p_form_id: FORM, p_visit: visit, p_event: "reach", p_field: key });
    values[key] = value;
  }
  const route = (await call("form_public_route", { p_form_id: FORM, p_values: values })) as { ending: string; score: number | null };
  const [out] = (await call("form_submit", {
    p_form_id: FORM, p_origin: "http://localhost:3001", p_bucket: `proof-${name}`, p_honeypot: null, p_client_key: null,
    p_payload: { ...values, _hidden: { utm_source: utm }, _visit: visit },
  })) as Array<{ state: string; record_id: string | null }>;
  check(`${name}: the store's route ends at "${ending}"`, route.ending === ending, route);
  check(`${name}: sent and landed as a record in the table (required questions the jump skipped were not demanded)`, out!.state === "accepted" && !!out!.record_id, out);
}

await branch("social-under-1k", "instagram", [
  ["company_name", `Juniper & Rye Bakery ${stamp}`], ["contact_email", "owner@juniperandrye.com"],
  ["service", "Social media management"], ["platforms", "Instagram, TikTok"], ["monthly_budget", "Under $1k"],
], "starter");
await branch("paid-ads", "google", [
  ["company_name", `Northwind Dental ${stamp}`], ["contact_email", "marketing@northwinddental.com"],
  ["service", "Paid ads"], ["ad_goal", "Book 40 new-patient cleanings a month"], ["notes", "We run two locations."],
], "discovery-call");

// A SPACES-MADE FORM (Form view, 499dd3cf17): same form id, required `name`, lands as a row.
const spaces = (await call("form_public", { p_form_id: SPACES_FORM })) as Array<{ state: string; fields: unknown[] }>;
check("the Spaces form still renders (open, with its fields)", spaces[0]?.state === "open" && (spaces[0]?.fields.length ?? 0) > 0, { state: spaces[0]?.state });
const [sp] = (await call("form_submit", {
  p_form_id: SPACES_FORM, p_origin: "http://localhost:3001", p_bucket: "proof-spaces", p_honeypot: null, p_client_key: null,
  p_payload: { name: `Rosa Delgado ${stamp}` },
})) as Array<{ state: string; record_id: string | null }>;
check("the Spaces form still submits into its table", sp!.state === "accepted" && !!sp!.record_id, sp);
let refused = "";
try {
  await call("form_submit", { p_form_id: SPACES_FORM, p_origin: "http://localhost:3001", p_bucket: "proof-spaces", p_honeypot: null, p_client_key: null, p_payload: {} });
} catch (e) {
  refused = (e as Error).message;
}
check("the Spaces form still demands its required question", /needs name/.test(refused), { refused });

// THE OWNER'S RESULTS, as admin@admin.com.
const owner = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const signed = await owner.auth.signInWithPassword({ email: "admin@admin.com", password: env.AI_ADMIN_PASSWORD! });
check("signed in as admin@admin.com", signed.data.user?.email === "admin@admin.com");
const { data: results, error } = await owner.schema("custom").rpc("form_results", { p_organization_id: ORG, p_form_id: FORM });
if (error) throw new Error(error.message);
const r = results as Record<string, unknown> & { questions: Array<{ field_key: string; reached: number; left: number; answers: unknown[] }>; endings: unknown[]; hidden: unknown[] };
console.log("RESULTS " + JSON.stringify({ views: r.views, starts: r.starts, completions: r.completions, completion_rate: r.completion_rate, endings: r.endings, hidden: r.hidden, score: r.score, questions: r.questions.map((q) => ({ q: q.field_key, reached: q.reached, left: q.left, top: (q.answers as Array<{ value: string; count: number }>).slice(0, 2) })) }));
check("results count views, starts, completions and both endings", Number(r.views) >= 2 && Number(r.starts) >= 2 && Number(r.completions) >= 2 && (r.endings as unknown[]).length >= 2);
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);

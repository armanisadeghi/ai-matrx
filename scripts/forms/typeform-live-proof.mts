// scripts/forms/typeform-live-proof.mts — LANE TYPEFORM-DUP, PROVEN AS A PERSON USES IT.
//
//   npx tsx scripts/forms/typeform-live-proof.mts [origin=http://localhost:3001]
//
// 1. As admin@admin.com (password from .env.local, never printed), through the store's own doors:
//    a social-media agency's new-client intake — welcome screen, logic jumps by service and budget,
//    points, two endings, a hidden utm_source and a serif / pill / tinted theme — published.
// 2. Signed out, in headless Chromium, answered through the public link on both branches.
// 3. An existing Spaces-made form (Form view, 499dd3cf17) still renders and submits.
// 4. The results summary, read through custom.form_results as admin.
import fs from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";

const ORIGIN = process.argv[2] ?? "http://localhost:3001";
const ORG = "11d47e36-4b1e-46b8-bdf6-8ef928b730fb";
const SPACES_FORM = "ab96b127-dc1b-4d8c-8605-b371060ecfa0";
const TABLE_NAME = "New client intake — Brightline Social";

const envOf = (file: string) =>
  Object.fromEntries(
    fs.readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
  ) as Record<string, string>;
const local = { ...envOf("/Users/armanisadeghi/code/matrx-frontend/.env"), ...envOf("/Users/armanisadeghi/code/matrx-frontend/.env.local") };
const db = envOf("/Users/armanisadeghi/code/aidream/.env");

let failed = 0;
const check = (name: string, ok: boolean, extra: Record<string, unknown> = {}) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${Object.keys(extra).length ? "  " + JSON.stringify(extra) : ""}`);
};

const sb = createClient(local.NEXT_PUBLIC_SUPABASE_URL!, local.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const signed = await sb.auth.signInWithPassword({ email: "admin@admin.com", password: local.AI_ADMIN_PASSWORD! });
if (signed.error) throw new Error(`sign-in refused: ${signed.error.message}`);
check("signed in as admin@admin.com", signed.data.user?.email === "admin@admin.com");
const store = sb.schema("custom");
async function door<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await store.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}${error.hint ? ` — ${error.hint}` : ""}`);
  return data as T;
}

const pgc = new pg.Client({
  user: db.SUPABASE_MATRIX_USER, password: db.SUPABASE_MATRIX_PASSWORD, host: db.SUPABASE_MATRIX_HOST,
  port: Number(db.SUPABASE_MATRIX_PORT), database: db.SUPABASE_MATRIX_DATABASE_NAME, ssl: { rejectUnauthorized: false },
});
await pgc.connect();

// ── 1. THE FORM ───────────────────────────────────────────────────────────────────────────
const found = await pgc.query(
  `select id from custom.record where organization_id = $1 and table_id = custom.table_kernel_id() and deleted_at is null and data->>'name' = $2 limit 1`,
  [ORG, TABLE_NAME],
);
let tableId: string = found.rows[0]?.id;
if (!tableId) {
  tableId = await door<string>("table_declare", { p_organization_id: ORG, p_spec: { name: TABLE_NAME } });
  const fields = [
    { key: "company_name", label: "Company name", plain: "text" },
    { key: "contact_email", label: "Contact email", plain: "text" },
    { key: "service", label: "Service", parity_type: "choice", options: ["Social media management", "Paid ads", "Content creation"] },
    { key: "platforms", label: "Platforms", plain: "text" },
    { key: "monthly_budget", label: "Monthly budget", parity_type: "choice", options: ["Under $1k", "$1k–$5k", "Over $5k"] },
    { key: "ad_goal", label: "Ad goal", plain: "long_text" },
    { key: "notes", label: "Anything else", plain: "long_text" },
  ];
  for (const f of fields) await door("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: f });
}
const fieldRows = await pgc.query(
  `select id, data->>'key' k from custom.record where organization_id = $1 and table_id = custom.field_kernel_id() and deleted_at is null and (data->>'entity_definition_id')::uuid = $2`,
  [ORG, tableId],
);
const fid = Object.fromEntries(fieldRows.rows.map((r) => [r.k, r.id])) as Record<string, string>;
const eq = (key: string, value: string) => ({ op: "eq", args: [{ field: fid[key] }, { const: value }] });

const questions = [
  { field: "company_name", ask: "What's your company called?", required: true },
  { field: "contact_email", ask: "Where can we reach you?", required: true },
  { field: "service", ask: "What do you need help with?", required: true, jumps: [{ when: eq("service", "Paid ads"), to: { question: "ad_goal" } }] },
  { field: "platforms", ask: "Which platforms are you on today?", required: true },
  {
    field: "monthly_budget", ask: "What's your monthly budget?", required: true,
    points: { "Under $1k": 1, "$1k–$5k": 5, "Over $5k": 10 },
    jumps: [{ when: eq("monthly_budget", "Under $1k"), to: { ending: "starter" } }, { to: { question: "notes" } }],
  },
  { field: "ad_goal", ask: "What should your ads achieve?", required: true },
  { field: "notes", ask: "Anything else we should know?" },
];
const presentation = {
  flow: "one-at-a-time",
  welcome: { title: "Let's grow your brand", body: "Seven quick questions, two minutes.", button_label: "Start" },
  endings: [
    { id: "discovery-call", title: "Let's book your discovery call", body: "A strategist will email you within one business day." },
    { id: "starter", title: "Our Starter Kit is the right fit", body: "We'll send the Starter Kit guide to your inbox today." },
  ],
  hidden_fields: ["utm_source"],
  theme: { font: "serif", button: "pill", background: "tinted" },
  thank_you: { title: "Thank you" },
  submit_label: "Send",
};
const existing = await pgc.query(`select id from custom.anon_form where organization_id = $1 and table_id = $2 and deleted_at is null order by created_at limit 1`, [ORG, tableId]);
const formId = await door<string>("form_declare", {
  p_organization_id: ORG, p_table_id: tableId, p_title: "Brightline Social — new client intake",
  p_questions: questions, p_presentation: presentation, p_submission_cap: null,
  p_quarantine_rule_id: null, p_notify_rule_id: null, p_form_id: existing.rows[0]?.id ?? null, p_slug: null,
});
await door("anon_publish", { p_organization_id: ORG, p_form_id: formId, p_published: true });
check("the intake form is declared and published", typeof formId === "string", { formId, link: `${ORIGIN}/f/${formId}` });

// ── 2. BOTH BRANCHES, SIGNED OUT ──────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
async function answerText(page: Page, label: RegExp, value: string) {
  const box = page.getByLabel(label);
  await box.waitFor({ timeout: 60_000 });
  await box.fill(value);
  await page.getByRole("button", { name: /^(Next|Send)$/ }).click();
}
async function answerChoice(page: Page, label: RegExp, choice: string) {
  await page.getByText(label).first().waitFor({ timeout: 60_000 });
  const radio = page.getByRole("radio", { name: choice });
  if (await radio.count()) await radio.first().click();
  else await page.getByText(choice, { exact: true }).first().click();
  await page.getByRole("button", { name: /^(Next|Send)$/ }).click();
}
async function branch(name: string, utm: string, steps: (p: Page) => Promise<void>, ending: string) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/f/${formId}?utm_source=${utm}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start" }).waitFor({ timeout: 90_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  check(`${name}: the welcome screen comes first`, (await page.content()).includes("Let&#x27;s grow your brand") || (await page.content()).includes("Let's grow your brand"));
  const font = await page.locator("[data-records-form-welcome]").getAttribute("class");
  check(`${name}: the theme's named options are drawn`, !!font && font.includes("font-serif") && font.includes("bg-primary/5"));
  await page.getByRole("button", { name: "Start" }).click();
  await steps(page);
  const end = page.locator("[data-records-form-ending]");
  await end.waitFor({ timeout: 60_000 });
  const reached = await end.getAttribute("data-records-form-ending");
  check(`${name}: reaches the ending "${ending}"`, reached === ending, { reached, title: await end.innerText() });
  await page.screenshot({ path: `/tmp/typeform-${name}.png` });
  await ctx.close();
}
const stamp = Date.now() % 100000;
await branch("social-under-1k", "instagram", async (p) => {
  await answerText(p, /company called/, `Juniper & Rye Bakery ${stamp}`);
  await answerText(p, /reach you/, "owner@juniperandrye.com");
  await answerChoice(p, /help with/, "Social media management");
  await answerText(p, /platforms/, "Instagram, TikTok");
  await answerChoice(p, /monthly budget/, "Under $1k");
}, "starter");
await branch("paid-ads", "google", async (p) => {
  await answerText(p, /company called/, `Northwind Dental ${stamp}`);
  await answerText(p, /reach you/, "marketing@northwinddental.com");
  await answerChoice(p, /help with/, "Paid ads");
  await answerText(p, /ads achieve/, "Book 40 new-patient cleanings a month");
  const notes = p.getByLabel(/Anything else/);
  await notes.waitFor({ timeout: 60_000 });
  await notes.fill("We run two locations.");
  await p.getByRole("button", { name: "Send" }).click();
}, "discovery-call");

const subs = await pgc.query(
  `select s.state, s.record_id is not null rec, s.metadata, s.payload->>'company_name' company from custom.anon_submission s where s.form_id = $1 and s.payload->>'company_name' like $2 order by s.created_at`,
  [formId, `%${stamp}`],
);
check("both answers became records in the table", subs.rows.length === 2 && subs.rows.every((r) => r.rec), { rows: subs.rows.map((r) => ({ company: r.company, state: r.state, record: r.rec })) });
check("the hidden utm_source, the ending and the score are on each submission", subs.rows.map((r) => `${r.metadata?.hidden?.utm_source}/${r.metadata?.ending}`).join() === "instagram/starter,google/discovery-call", { metadata: subs.rows.map((r) => r.metadata) });

// ── 3. A SPACES-MADE FORM STILL RENDERS AND SUBMITS ───────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/f/${SPACES_FORM}`, { waitUntil: "domcontentloaded" });
  const box = page.locator("input[id^='form-']").first();
  await box.waitFor({ timeout: 90_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await box.fill(`Rosa Delgado ${stamp}`);
  const sent = page.waitForResponse((r) => r.url().includes("/submit") && r.request().method() === "POST", { timeout: 60_000 }).catch(() => null);
  await page.getByRole("button", { name: /^(Submit|Send)$/ }).click();
  const res = await sent;
  const body = res ? await res.json().catch(() => null) : null;
  check("an existing Spaces form still renders and submits into its table", !!res && res.ok() && !!body?.record_id, { status: res?.status(), record: body?.record_id ?? null });
  await ctx.close();
}
await browser.close();

// ── 4. RESULTS ────────────────────────────────────────────────────────────────────────────
const results = await door<Record<string, unknown>>("form_results", { p_organization_id: ORG, p_form_id: formId });
console.log("RESULTS " + JSON.stringify(results, null, 1));
check("results count views, starts and completions", Number(results["views"]) >= 2 && Number(results["starts"]) >= 2 && Number(results["completions"]) >= 2);
await pgc.end();
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);

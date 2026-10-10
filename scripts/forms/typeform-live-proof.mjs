var _a, _b, _c;
var _d, _e, _f;
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
import { createRecordsClient, ensureTable, supabaseDataSource } from "@ai-matrx/records/core";
import { chromium } from "playwright";
const ORIGIN = (_d = process.argv[2]) !== null && _d !== void 0 ? _d : "http://localhost:3001";
const ORG = "11d47e36-4b1e-46b8-bdf6-8ef928b730fb";
const SPACES_FORM = "ab96b127-dc1b-4d8c-8605-b371060ecfa0";
const TABLE_NAME = "New client intake — Brightline Social";
const envOf = (file) => Object.fromEntries(fs.readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
}));
const local = { ...envOf("/Users/armanisadeghi/code/matrx-frontend/.env"), ...envOf("/Users/armanisadeghi/code/matrx-frontend/.env.local") };
const db = envOf("/Users/armanisadeghi/code/aidream/.env");
let failed = 0;
const check = (name, ok, extra = {}) => {
    if (!ok)
        failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${Object.keys(extra).length ? "  " + JSON.stringify(extra) : ""}`);
};
const sb = createClient(local.NEXT_PUBLIC_SUPABASE_URL, local.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const signed = await sb.auth.signInWithPassword({ email: "admin@admin.com", password: local.AI_ADMIN_PASSWORD });
if (signed.error)
    throw new Error(`sign-in refused: ${signed.error.message}`);
check("signed in as admin@admin.com", ((_a = signed.data.user) === null || _a === void 0 ? void 0 : _a.email) === "admin@admin.com");
const store = sb.schema("custom");
async function door(fn, args) {
    const { data, error } = await store.rpc(fn, args);
    if (error)
        throw new Error(`${fn}: ${error.message}${error.hint ? ` — ${error.hint}` : ""}`);
    return data;
}
const pgc = new pg.Client({
    user: db.SUPABASE_MATRIX_USER, password: db.SUPABASE_MATRIX_PASSWORD, host: db.SUPABASE_MATRIX_HOST,
    port: Number(db.SUPABASE_MATRIX_PORT), database: db.SUPABASE_MATRIX_DATABASE_NAME, ssl: { rejectUnauthorized: false },
});
await pgc.connect();
// ── 1. THE FORM ───────────────────────────────────────────────────────────────────────────
const found = await pgc.query(`select id from custom.record where organization_id = $1 and table_id = custom.table_kernel_id() and deleted_at is null and data->>'name' = $2 limit 1`, [ORG, TABLE_NAME]);
let tableId = (_b = found.rows[0]) === null || _b === void 0 ? void 0 : _b.id;
if (!tableId) {
    // The records package's own table builder (Home, labels, sort, title field, then each Field).
    const client = createRecordsClient({ dataSource: supabaseDataSource(sb), organizationId: ORG, actor: { actor: "user" }, onError: () => { } });
    const made = await ensureTable(client, {
        name: TABLE_NAME,
        labelSingular: "Client intake",
        labelPlural: "Client intakes",
        titleField: "company_name",
        fields: [
            { key: "company_name", label: "Company name", type: "text", required: true },
            { key: "contact_email", label: "Contact email", type: "text" },
            { key: "service", label: "Service", type: "select", options: ["Social media management", "Paid ads", "Content creation"] },
            { key: "platforms", label: "Platforms", type: "text" },
            { key: "monthly_budget", label: "Monthly budget", type: "select", options: ["Under $1k", "$1k–$5k", "Over $5k"] },
            { key: "ad_goal", label: "Ad goal", type: "long_text" },
            { key: "notes", label: "Anything else", type: "long_text" },
        ],
    });
    if (!made.ok)
        throw new Error(`ensureTable: ${made.error.message}`);
    tableId = made.data;
}
const fieldRows = await pgc.query(`select id, data->>'key' k from custom.record where organization_id = $1 and table_id = custom.field_kernel_id() and deleted_at is null and (data->>'entity_definition_id')::uuid = $2`, [ORG, tableId]);
const fid = Object.fromEntries(fieldRows.rows.map((r) => [r.k, r.id]));
// A choice answer is the option's KEY (what the public runner sends), so Rules and points name keys.
const eq = (key, value) => ({ op: "eq", args: [{ field: fid[key] }, { const: value }] });
const questions = [
    { field: "company_name", ask: "What's your company called?", required: true },
    { field: "contact_email", ask: "Where can we reach you?", required: true },
    { field: "service", ask: "What do you need help with?", required: true, jumps: [{ when: eq("service", "paid_ads"), to: { question: "ad_goal" } }] },
    { field: "platforms", ask: "Which platforms are you on today?", required: true },
    {
        field: "monthly_budget", ask: "What's your monthly budget?", required: true,
        points: { under_1k: 1, "1k_5k": 5, over_5k: 10 },
        jumps: [{ when: eq("monthly_budget", "under_1k"), to: { ending: "starter" } }, { to: { question: "notes" } }],
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
const formId = await door("form_declare", {
    p_organization_id: ORG, p_table_id: tableId, p_title: "Brightline Social — new client intake",
    p_questions: questions, p_presentation: presentation, p_submission_cap: null,
    p_quarantine_rule_id: null, p_notify_rule_id: null, p_form_id: (_e = (_c = existing.rows[0]) === null || _c === void 0 ? void 0 : _c.id) !== null && _e !== void 0 ? _e : null, p_slug: null,
});
await door("anon_publish", { p_organization_id: ORG, p_form_id: formId, p_published: true });
check("the intake form is declared and published", typeof formId === "string", { formId, link: `${ORIGIN}/f/${formId}` });
// `--setup-only`: stop after the form exists, and ask the store's public route for both branches.
if (process.argv.includes("--setup-only")) {
    const routeOf = async (values) => (await pgc.query("select custom.form_public_route($1::uuid, $2::jsonb) r", [formId, JSON.stringify(values)])).rows[0].r;
    const a = await routeOf({ company_name: "Juniper & Rye", contact_email: "x@y.z", service: "social_media_management", platforms: "IG", monthly_budget: "under_1k" });
    const b = await routeOf({ company_name: "Northwind", contact_email: "x@y.z", service: "paid_ads", ad_goal: "40 cleanings", notes: "two sites" });
    const on = (r) => r.asks.filter((x) => x.asked).map((x) => x.field_key).join(",");
    check("branch A routes to the starter ending, skipping ad goal and notes", a.ending === "starter" && on(a) === "company_name,contact_email,service,platforms,monthly_budget", { asked: on(a), ending: a.ending, score: a.score });
    check("branch B jumps past platforms and budget to the ad goal, then the default ending", b.ending === "discovery-call" && on(b) === "company_name,contact_email,service,ad_goal,notes", { asked: on(b), ending: b.ending });
    await pgc.end();
    process.exit(failed ? 1 : 0);
}
// ── 2. BOTH BRANCHES, SIGNED OUT ──────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
async function answerText(page, label, value) {
    const box = page.getByLabel(label);
    await box.waitFor({ timeout: 60000 });
    await box.fill(value);
    await page.getByRole("button", { name: /^(Next|Send)$/ }).click();
}
async function answerChoice(page, label, choice) {
    await page.getByText(label).first().waitFor({ timeout: 60000 });
    const radio = page.getByRole("radio", { name: choice });
    if (await radio.count())
        await radio.first().click();
    else
        await page.getByText(choice, { exact: true }).first().click();
    await page.getByRole("button", { name: /^(Next|Send)$/ }).click();
}
async function branch(name, utm, steps, ending) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/f/${formId}?utm_source=${utm}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Start" }).waitFor({ timeout: 90000 });
    await page.waitForLoadState("networkidle").catch(() => { });
    check(`${name}: the welcome screen comes first`, (await page.content()).includes("Let&#x27;s grow your brand") || (await page.content()).includes("Let's grow your brand"));
    const font = await page.locator("[data-records-form-welcome]").getAttribute("class");
    check(`${name}: the theme's named options are drawn`, !!font && font.includes("font-serif") && font.includes("bg-primary/5"));
    await page.getByRole("button", { name: "Start" }).click();
    await steps(page);
    const end = page.locator("[data-records-form-ending]");
    try {
        await end.waitFor({ timeout: 60000 });
    }
    catch (e) {
        await page.screenshot({ path: `/tmp/typeform-${name}-stuck.png` });
        console.log(`STUCK ${name}: ` + (await page.innerText("main")).slice(0, 800).replace(/\n+/g, " | "));
        throw e;
    }
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
    await notes.waitFor({ timeout: 60000 });
    await notes.fill("We run two locations.");
    await p.getByRole("button", { name: "Send" }).click();
}, "discovery-call");
const subs = await pgc.query(`select s.state, s.record_id is not null rec, s.metadata, s.payload->>'company_name' company from custom.anon_submission s where s.form_id = $1 and s.payload->>'company_name' like $2 order by s.created_at`, [formId, `%${stamp}`]);
check("both answers became records in the table", subs.rows.length === 2 && subs.rows.every((r) => r.rec), { rows: subs.rows.map((r) => ({ company: r.company, state: r.state, record: r.rec })) });
check("the hidden utm_source, the ending and the score are on each submission", subs.rows.map((r) => { var _a, _b, _c; return `${(_b = (_a = r.metadata) === null || _a === void 0 ? void 0 : _a.hidden) === null || _b === void 0 ? void 0 : _b.utm_source}/${(_c = r.metadata) === null || _c === void 0 ? void 0 : _c.ending}`; }).join() === "instagram/starter,google/discovery-call", { metadata: subs.rows.map((r) => r.metadata) });
// ── 3. A SPACES-MADE FORM STILL RENDERS AND SUBMITS ───────────────────────────────────────
{
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/f/${SPACES_FORM}`, { waitUntil: "domcontentloaded" });
    const box = page.locator("input[id^='form-']").first();
    await box.waitFor({ timeout: 90000 });
    await page.waitForLoadState("networkidle").catch(() => { });
    await box.fill(`Rosa Delgado ${stamp}`);
    const sent = page.waitForResponse((r) => r.url().includes("/submit") && r.request().method() === "POST", { timeout: 60000 }).catch(() => null);
    await page.getByRole("button", { name: /^(Submit|Send)$/ }).click();
    const res = await sent;
    const body = res ? await res.json().catch(() => null) : null;
    check("an existing Spaces form still renders and submits into its table", !!res && res.ok() && !!(body === null || body === void 0 ? void 0 : body.record_id), { status: res === null || res === void 0 ? void 0 : res.status(), record: (_f = body === null || body === void 0 ? void 0 : body.record_id) !== null && _f !== void 0 ? _f : null });
    await ctx.close();
}
await browser.close();
// ── 4. RESULTS ────────────────────────────────────────────────────────────────────────────
const results = await door("form_results", { p_organization_id: ORG, p_form_id: formId });
console.log("RESULTS " + JSON.stringify(results, null, 1));
check("results count views, starts and completions", Number(results["views"]) >= 2 && Number(results["starts"]) >= 2 && Number(results["completions"]) >= 2);
await pgc.end();
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);

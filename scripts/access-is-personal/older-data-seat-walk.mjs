// scripts/access-is-personal/older-data-seat-walk.mjs — LANE ACTIVE-ORG-PAGES, VERIFIER-17 H3.
//
// THE USE CASE. Alex Hart (test@test.com) is a shared-only member of admin's Workspace and works
// there. A teammate sends her the older /data/<id> link to the workspace's Service Calls, which
// nobody gave her. (The older door takes no organization at all — public.get_full_table is SECURITY
// INVOKER over workbench.udt_datasets, whose read rule unions her grants and iam.my_orgs() — so a
// table she may read opens whatever she is working in; on production she keeps no older table
// outside admin's Workspace to walk it with.)
//
// CLAUSES (headless Chromium, the real login form, the organization picked through the picker):
//   not-given-honest   /data/<Service Calls> shows the canonical No Access page — never "they may
//                      have been in a different organization".
//   hub-heading        /data-v2 in admin's Workspace: the Tables heading says the count is what is
//                      shared with her, never "Everything this organization keeps records in".
//
// Env: AP_ORIGIN (default http://activeorgpages.localhost:3001), AP_EMAIL, AP_PASSWORD, AP_SHOTS.

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { signIn, setOrganization, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.AP_ORIGIN ?? "http://activeorgpages.localhost:3001";
const SHOTS = process.env.AP_SHOTS ?? "shots/active-org-pages";
const WORKING_IN = "admin's Workspace";
const SERVICE_CALLS_NOT_GIVEN = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";

const results = [];
const pass = (clause, ok, detail) => {
  results.push({ clause, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${clause} — ${detail}`);
};

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const text = () => page.evaluate(() => document.body.innerText);
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
const statuses = [];
page.on("response", (r) => {
  if (/\/rpc\/get_full_table/.test(r.url())) statuses.push(r.status());
});

try {
  const who = await signIn(page, ORIGIN, process.env.AP_EMAIL, process.env.AP_PASSWORD);
  pass("seat", who === "test@test.com", `/api/whoami answered ${who}`);
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await setOrganization(page, WORKING_IN);

  // ── hub-heading ──
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const heading = await until("the Tables heading", async () => {
    const t = await page.evaluate(() => document.querySelector('[data-hub-listing-toggle="tables"]')?.textContent ?? null);
    return t && !/reading/.test(t) ? t : null;
  }, 120000);
  const scope = (await text()).match(/Showing what is in (.+)/)?.[1]?.split("\n")[0] ?? "?";
  await shot("hub-heading-shared-only");
  pass("hub-heading", Boolean(heading.v) && !/everything this organization/i.test(heading.v) && /shared with you/i.test(heading.v),
    `working in ${scope.replace(/\s*Change.*$/, "")}: "${heading.v ?? "no heading"}"`);

  // ── not-given-honest ──
  await page.goto(`${ORIGIN}/data/${SERVICE_CALLS_NOT_GIVEN}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const refusal = await until("the older page settles", async () => {
    const t = await text();
    if (/different organization/i.test(t)) return "guessed";
    if (/don.t have access|do not have access|not been given|No access|can.t open|isn.t available|not available/i.test(t)) return "no-access-page";
    return null;
  }, 120000);
  await sleep(1500);
  await shot("older-data-not-given");
  const final = await text();
  pass("not-given-honest", refusal.v === "no-access-page" && !/different organization/i.test(final),
    `/data/<Service Calls, never given>: ${refusal.v ?? "nothing"}; get_full_table answered ${statuses.join(",") || "?"}`);

} catch (e) {
  pass("walk", false, e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}

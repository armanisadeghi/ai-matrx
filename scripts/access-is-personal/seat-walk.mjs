// scripts/access-is-personal/seat-walk.mjs — LANE ACCESS-IS-PERSONAL, the three seat proofs.
//
// THE OWNER'S LAW (2026-09-23): "The permission is to the person, not the org … For any RECORD
// I try to see, the active org is meaningless."
//
// THE USE CASE. Alex Hart (test@test.com) keeps her own workspace and also dispatches for Rincon
// Plumbing Co; Ironclad Mobile Mechanic's owner shares its Parts Used log with her by link.
// She works in her own workspace all day and opens the others' tables from links.
//
// CLAUSES (headless Chromium, the real login form, the organization picked through the picker —
// scripts/lib/seat-browser.mjs; never a cookie, never a URL):
//   member-elsewhere  Active = Alex Hart's Workspace. /data-v2/<Rincon Jobs> OPENS (grid, no
//                     "not in the organization" sentence), and the active organization is unchanged.
//   not-given         /data-v2/<a table she was never given> and /data-v2/<a table of an
//                     organization she is not in> say "You have not been given this table".
//   share-link        Active = Alex Hart's Workspace. The invitation link opens and accepts; the
//                     table opens with "Shared with you by Ironclad Mobile Mechanic"; her own
//                     organization did NOT move; then with Rincon active the bare /data-v2/<id>
//                     (no ?org=) still opens with the same line.
//   hub-scope         /data-v2 names the organization it lists and "All my organizations" lists
//                     every organization's tables, each opening where it lives.
//   portal-accept     (when AP_PORTAL_TOKEN is set) Active = Alex Hart's Workspace. A portal
//                     invitation accepts and the portal opens; her organization did NOT move.
//
// Env: AP_ORIGIN (e.g. http://accesspersonal.localhost:3064), AP_EMAIL, AP_PASSWORD, AP_TOKEN
// (the invitation token; read from a file, never printed), AP_SHOTS (screenshot dir).

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

import { signIn, setOrganization, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.AP_ORIGIN ?? "http://accesspersonal.localhost:3064";
const SHOTS = process.env.AP_SHOTS ?? "shots/accesspersonal";
const RINCON_JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163";
const NOT_GIVEN_MEMBER_ORG = "ac68e71f-086b-4de4-8591-6358a2fa8098"; // admin's Workspace, shared_only, never shared with her
const NOT_GIVEN_FOREIGN = "215e2e75-d04e-4c8a-b208-5be46488b18d"; // Ironclad Mobile Mechanic's Service Calls — not a member
const SHARED_ID = process.env.AP_SHARED_TABLE_ID ?? "96e0a4e8-fe35-42d0-b942-3a18218d1a95"; // Ironclad Mobile Mechanic's Parts Used — shared by link
const SHARED_NAME = process.env.AP_SHARED_TABLE_NAME ?? "Parts Used";
const HOME_ORG = "Alex Hart's Workspace";

const results = [];
const pass = (clause, ok, detail) => {
  results.push({ clause, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${clause} — ${detail}`);
};

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const errors = [];
page.on("response", (r) => {
  if (r.status() >= 400 && /\/rest\/v1\/rpc\//.test(r.url())) errors.push(`${r.status()} ${r.url().split("/rpc/")[1]}`);
});

const text = () => page.evaluate(() => document.body.innerText);
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
const activeOrgLine = async () => {
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const { v } = await until("the hub's scope line", async () => {
    const t = await text();
    const m = t.match(/Showing what is in (.+)/);
    return m ? m[1].split("\n")[0].replace(/\s*Change.*$/, "").trim() : null;
  }, 90000);
  return v;
};
const openTable = async (id, expectName = null, query = "") => {
  await page.goto(`${ORIGIN}/data-v2/${id}${query}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const { v } = await until(`table ${id} settles`, async () => {
    const t = await text();
    if (/You have not been given this table/.test(t)) return "not-given";
    if (/not in the organization you are working in/.test(t)) return "old-refusal";
    if (/We could not find out where this table is/.test(t)) return "unavailable";
    if (/Opening the table/.test(t)) return null;
    const grid = await page.$('[role="grid"], [role="table"], table');
    if (grid && (!expectName || t.includes(expectName))) return "opened";
    return null;
  }, 90000);
  return v ?? "timeout";
};

const ONLY = (process.env.AP_ONLY ?? "").split(",").filter(Boolean);
const wants = (clause) => ONLY.length === 0 || ONLY.includes(clause);

try {
  const who = await signIn(page, ORIGIN, process.env.AP_EMAIL, process.env.AP_PASSWORD);
  pass("seat", who === "test@test.com", `/api/whoami answered ${who}`);
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await setOrganization(page, HOME_ORG);
  const before = await activeOrgLine();
  pass("active-org", before === HOME_ORG, `the hub reads "Showing what is in ${before}"`);
  await shot("hub-home-org");

  // ── portal-accept ──
  if (process.env.AP_PORTAL_TOKEN && wants("portal-accept")) {
    await page.goto(`${ORIGIN}/invitations/portal/accept/${process.env.AP_PORTAL_TOKEN}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    const openPortal = page.locator('button:has-text("Open Customer Portal"):not([disabled])').first();
    await openPortal.waitFor({ state: "visible", timeout: 90000 });
    await openPortal.click({ timeout: 60000 });
    const accepted = await until("the portal accepted", async () => (/is open to you|already/.test(await text()) ? true : null), 90000);
    await shot("portal-accepted");
    pass("portal-accept", Boolean(accepted.v), accepted.v ? "Customer Portal is open to her" : "the accept did not answer");
    const onward = page.locator('button:has-text("Open Customer Portal"):not([disabled])').first();
    if (await onward.count()) await onward.click({ timeout: 60000 });
    const portal = await until("the portal page", async () => (page.url().includes("/portal/c/") ? page.url() : null), 90000);
    await sleep(4000);
    await shot("portal-opened");
    pass("portal-opens", Boolean(portal.v), `landed on ${String(portal.v ?? page.url()).replace(ORIGIN, "")}`);
    const afterPortal = await activeOrgLine();
    pass("portal-accept-org-unchanged", afterPortal === HOME_ORG, `after accepting the portal, the hub still reads "${afterPortal}"`);
  }

  if (!wants("member-elsewhere")) throw new Error("__only__");
  // ── member-elsewhere ──
  const jobs = await openTable(RINCON_JOBS, "Jobs");
  const jobsText = await text();
  await shot("member-elsewhere-rincon-jobs");
  pass("member-elsewhere", jobs === "opened" && /Jobs/.test(jobsText),
    `Rincon Plumbing Co's Jobs, opened while working in ${HOME_ORG}: ${jobs}`);
  const after = await activeOrgLine();
  pass("member-elsewhere-org-unchanged", after === HOME_ORG, `after opening it the hub still reads "${after}"`);

  // ── not-given ──
  const ng1 = await openTable(NOT_GIVEN_MEMBER_ORG);
  await shot("not-given-member-org");
  pass("not-given-in-her-org", ng1 === "not-given", `admin's Workspace table never shared with her: ${ng1}`);
  const ng2 = await openTable(NOT_GIVEN_FOREIGN);
  await shot("not-given-foreign-org");
  pass("not-given-foreign-org", ng2 === "not-given", `Ironclad's Service Calls (not a member): ${ng2}`);

  // ── share-link ──
  await page.goto(`${ORIGIN}/invitations/table/accept/${process.env.AP_TOKEN}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  // Wait for the offer (the button is disabled while the invitation is read), press it, then
  // press "Open <table>" on the screen that says the table is open to her.
  const accept = page.locator(`button:has-text("Open ${SHARED_NAME}"):not([disabled])`).first();
  await accept.waitFor({ state: "visible", timeout: 90000 });
  await accept.click({ timeout: 60000 });
  // A fresh invitation answers "<table> is open to you" with a second Open button; an
  // already-accepted one goes straight to the table. Either way she ends on the table.
  const next = await until("the opened screen or the table", async () => {
    const t = await text();
    if (/is open to you/.test(t)) return "offer";
    if (/Shared with you by/.test(t)) return "table";
    return null;
  }, 90000);
  if (next.v === "offer") {
    const onward = page.locator(`button:has-text("Open ${SHARED_NAME}"):not([disabled])`).first();
    await onward.waitFor({ state: "visible", timeout: 60000 });
    await onward.click({ timeout: 60000 });
  }
  const shared = await until("the shared table", async () => {
    const t = await text();
    return /Shared with you by/.test(t) && /Ironclad Mobile Mechanic/.test(t) ? t : null;
  }, 90000);
  await shot("share-link-opened");
  pass("share-link-opens", Boolean(shared.v), shared.v ? "the table opened with \"Shared with you by Ironclad Mobile Mechanic\"" : "no shared-by line");
  const afterAccept = await activeOrgLine();
  pass("share-link-org-unchanged", afterAccept === HOME_ORG, `after accepting, the hub still reads "${afterAccept}"`);
  await setOrganization(page, "Rincon Plumbing Co");
  const bare = await openTable(SHARED_ID, SHARED_NAME);
  const bareText = await text();
  await shot("share-link-bare-address-rincon-active");
  pass("share-link-any-active-org", bare === "opened" && /Shared with you by/.test(bareText),
    `with Rincon Plumbing Co active, the bare /data-v2/<${SHARED_NAME}> (no ?org=): ${bare}`);

  // ── hub-scope ──
  await setOrganization(page, HOME_ORG);
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const allBtn = await until("All my organizations", async () => page.$('button:has-text("All my organizations")'), 90000);
  if (allBtn.v) await allBtn.v.click();
  const listed = await until("the grouped list", async () => {
    const t = await text();
    return /Rincon Plumbing Co/.test(t) && /Ironclad Mobile Mechanic/.test(t) && /Each opens where it lives/.test(t) ? t : null;
  }, 90000);
  await shot("hub-all-organizations");
  pass("hub-all-organizations", Boolean(listed.v) && page.url().includes("scope=all"),
    listed.v ? `grouped list with Rincon Plumbing Co and Ironclad Mobile Mechanic (shared with you); address ${page.url().replace(ORIGIN, "")}` : "no grouped list");
} catch (e) {
  if (String(e?.message) !== "__only__") pass("walk", false, String(e?.message ?? e));
} finally {
  writeFileSync(`${SHOTS}/walk.json`, JSON.stringify({ results, rpcErrors: errors }, null, 2));
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? `ALL ${results.length} CLAUSES PASS` : `${failed.length} FAIL of ${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);

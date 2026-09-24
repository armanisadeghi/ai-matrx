// scripts/access-is-personal/vault-seat-walk.mjs — LANE ACTIVE-ORG-PAGES, the Vault seat proof.
//
// THE OWNER'S LAW (2026-09-23): "The permission is to the person, not the org … For any RECORD
// I try to see, the active org is meaningless."
//
// THE USE CASE. Alex Hart (test@test.com) is a member of Pinecrest Records, whose label keeps
// its Bandcamp login in the organization vault. She works in her own workspace and opens the
// credential from a link a teammate sent. Before the fix /vault/<id> looked the id up inside the
// "Mine" list and showed the No Access page for a credential she can open.
//
// CLAUSES (headless Chromium, the real login form, the organization picked through the picker):
//   org-credential    Active = Alex Hart's Workspace. /vault/<Pinecrest Bandcamp login> opens the
//                     credential, and the list names Pinecrest Records as the scope it shows.
//   personal-org      /vault/<a credential of admin's Workspace, all members> opens too.
//   not-given         /vault/<admin's own personal credential, never shared> shows the No Access page.
//   org-unchanged     Her active organization did not move.
//
// Env: AP_ORIGIN (default http://localhost:3001), AP_EMAIL, AP_PASSWORD (never printed), AP_SHOTS.

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { signIn, setOrganization, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.AP_ORIGIN ?? "http://activeorgpages.localhost:3001";
const SHOTS = process.env.AP_SHOTS ?? "shots/active-org-pages";
const HOME_ORG = "Alex Hart's Workspace";
const PINECREST_BANDCAMP = "d6f2bc7a-db1d-484c-a580-77ffbc1b6123";
const ADMIN_WORKSPACE_BRAVE = "2732664b-d24a-4431-a86e-0be9f14fba77";
const NOT_GIVEN = "b65ce4c9-cc3e-4ba0-a077-c4c2c9646547";

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

/** The Data hub names the organization she is working in ("Showing what is in <org>"). */
async function activeOrgLine() {
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const { v } = await until("the hub's scope line", async () => {
    const m = (await text()).match(/Showing what is in (.+)/);
    return m ? m[1].split("\n")[0].replace(/\s*Change.*$/, "").trim() : null;
  }, 90000);
  return v;
}

async function openCredential(id, expectText) {
  await page.goto(`${ORIGIN}/vault/${id}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const { v } = await until(
    `vault ${id}`,
    async () => {
      const t = await text();
      if (expectText && t.includes(expectText) && !/Select a credential/.test(t)) return "opened";
      if (/don.t have access|do not have access|not been given|No access|can.t open/i.test(t)) return "no-access";
      return null;
    },
    120000,
  );
  await sleep(1500);
  return v ?? "nothing";
}

try {
  const who = await signIn(page, ORIGIN, process.env.AP_EMAIL, process.env.AP_PASSWORD);
  pass("seat", who === "test@test.com", `/api/whoami answered ${who}`);
  await page.goto(`${ORIGIN}/vault`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await setOrganization(page, HOME_ORG);
  const orgBefore = await activeOrgLine();

  // The Bandcamp login holds no field yet, so the list's empty-read alarm (DD-160) fires for its
  // one-item scope; what this clause proves is that the page CARRIED her to the scope that holds
  // it and names that scope — not the "Mine" list, not the No Access page.
  await openCredential(PINECREST_BANDCAMP, "Bandcamp label login");
  const scopeShown = await until("the vault scope", async () => {
    const t = await text();
    return /Organization/.test(t) && /Pinecrest Records\s*\n\s*Encrypted and private/.test(t) ? "Pinecrest Records" : null;
  }, 60000);
  const t1 = await text();
  await shot("vault-org-credential");
  pass("org-credential-carried", scopeShown.v === "Pinecrest Records", `from ${HOME_ORG}, /vault/<Pinecrest Bandcamp login> shows the list for ${scopeShown.v ?? "some other scope"}`);
  pass("org-credential-not-refused", !/don.t have access|do not have access|No access/i.test(t1), "no No Access page for a credential she can open");

  const r2 = await openCredential(ADMIN_WORKSPACE_BRAVE, "BRAVE_SEARCH_API_KEY");
  await shot("vault-personal-org-credential");
  pass("org-credential-opens", r2 === "opened", `admin's Workspace credential (all members, an organization she is in but not working in): ${r2}`);

  const r3 = await openCredential(NOT_GIVEN, null);
  await shot("vault-not-given");
  pass("not-given", r3 === "no-access", `a credential never shared with her: ${r3}`);

  const orgAfter = await activeOrgLine();
  pass("org-unchanged", orgBefore === HOME_ORG && orgBefore === orgAfter, `active organization before ${orgBefore ?? "?"} after ${orgAfter ?? "?"}`);
} catch (e) {
  pass("walk", false, e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}

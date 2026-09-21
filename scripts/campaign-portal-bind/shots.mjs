// scripts/campaign-portal-bind/shots.mjs — THE CUSTOMER'S HALF, DRIVEN.
//
// The office has already invited her (scripts/campaign-portal-bind/invite.sql, run at
// admin@admin.com's own `authenticated` seat through `custom.portal_invite` — the same door
// the Portals panel calls) and been handed the link. This drives what happens next, in a
// browser, as a person:
//
//   1 a FRESH browser with no session opens the link and is told WHAT is on offer, by whom,
//     and what she will see — before being asked to sign in
//   2 signed in as the invited address, the link says it is ready
//   3 she opens it, and the accept COMPLETES — this is the thing that could not finish before
//     lane PORTAL-BIND
//   4 her portal: her own jobs and her own invoices, and nobody else's
//   5 the office revokes, and the next thing she asks refuses
//
// Headless only. Never the in-app Browser pane — that is the owner's screen.

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { signIn, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.PORTAL_BIND_ORIGIN ?? "http://localhost:3001";
const PQ = process.env.PORTAL_BIND_PSQL;               // absolute path to a psql wrapper
const TOKEN = process.env.PORTAL_BIND_TOKEN;
const ORG = process.env.PORTAL_BIND_ORG;
const PORTAL = process.env.PORTAL_BIND_PORTAL;
const PRINCIPAL = process.env.PORTAL_BIND_PRINCIPAL;
const OUT = process.env.PORTAL_BIND_OUT ?? "/tmp/portal-bind";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "Password1234#";

if (!TOKEN || !ORG || !PORTAL || !PRINCIPAL || !PQ) {
  throw new Error(
    "PORTAL_BIND_TOKEN / _ORG / _PORTAL / _PRINCIPAL / _PSQL are required — run invite.sql first and pass what it printed",
  );
}

mkdirSync(OUT, { recursive: true });
const said = {};
let n = 0;
const shot = async (page, name) => {
  n += 1;
  const file = `${OUT}/portal-bind-${n}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  return file;
};

const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());

const browser = await chromium.launch({ headless: true });

try {
  // ── 1 — A STRANGER, WITH NO SESSION AT ALL. ─────────────────────────────────────────
  const strangerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const stranger = await strangerCtx.newPage();
  await stranger.goto(`${ORIGIN}/invitations/portal/accept/${TOKEN}`, {
    waitUntil: "domcontentloaded",
    timeout: 240000,
  });
  await until("the offer is drawn", async () =>
    (await text(stranger)).includes("invited you to"), 120000);
  said.stranger_sees = await text(stranger);
  said.shot_1 = await shot(stranger, "a-stranger-is-told-what-is-on-offer");
  said.stranger_is_offered_sign_in = said.stranger_sees.includes("Sign in or create an account");
  said.stranger_sees_masked_address = /t••••@test\.com/.test(said.stranger_sees);
  await strangerCtx.close();

  // ── 2 — SIGNED IN AS THE INVITED ADDRESS. ───────────────────────────────────────────
  const herCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const her = await herCtx.newPage();
  said.signed_in_as = await signIn(her, ORIGIN, "test@test.com", PASSWORD, "the customer");
  if (said.signed_in_as !== "test@test.com") {
    throw new Error(`this walk must run as test@test.com — the app says ${said.signed_in_as}`);
  }
  await her.goto(`${ORIGIN}/invitations/portal/accept/${TOKEN}`, {
    waitUntil: "domcontentloaded",
    timeout: 240000,
  });
  await until("the ready state", async () => {
    const t = await text(her);
    return t.includes("Open Your jobs and invoices");
  }, 120000);
  said.ready_says = await text(her);
  said.shot_2 = await shot(her, "signed-in-as-the-invited-address");

  // ── 3 — SHE OPENS IT. The accept that could not complete before this lane. ───────────
  await her.click('button:has-text("Open Your jobs and invoices")');
  await until("the accept completes", async () =>
    (await text(her)).includes("is open to you"), 120000);
  said.accepted_says = await text(her);
  said.shot_3 = await shot(her, "the-accept-completes");

  // ── 4 — HER PORTAL. ─────────────────────────────────────────────────────────────────
  await her.click('button:has-text("Open Your jobs and invoices")');
  await sleep(6000);
  await until("her portal draws", async () => {
    const t = await text(her);
    return t.includes("RPC-2214") || t.includes("INV-2214-A");
  }, 180000);
  await sleep(2000);
  const mine = await text(her);
  said.portal_url = her.url();
  said.sees_her_jobs = ["RPC-2214", "RPC-2215"].every((w) => mine.includes(w));
  said.sees_her_invoices = ["INV-2214-A", "INV-2215-A"].every((w) => mine.includes(w));
  said.sees_someone_elses_job = mine.includes("RPC-2219");
  said.sees_someone_elses_invoice = mine.includes("INV-2219-A");
  said.sees_the_crew = mine.includes("Gil Ortega");
  said.shot_4 = await shot(her, "her-own-jobs-and-her-own-invoices");
  said.portal_text = mine.slice(0, 1200);

  if (!said.sees_her_jobs || !said.sees_her_invoices) {
    throw new Error(`she did not see her own work: ${mine.slice(0, 600)}`);
  }
  if (said.sees_someone_elses_job || said.sees_someone_elses_invoice || said.sees_the_crew) {
    throw new Error(`🚨 SHE SEES SOMEBODY ELSE'S: ${mine.slice(0, 800)}`);
  }

  // ── 5 — THE OFFICE REVOKES, at its own seat, through its own door. ──────────────────
  const revoke = `
    set role none;
    select set_config('request.jwt.claims','{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', false);
    set role authenticated;
    select custom.portal_revoke('${ORG}'::uuid, '${PORTAL}'::uuid, '${PRINCIPAL}'::uuid) ->> 'say';
  `;
  said.revoke_said = execFileSync(PQ, ["-Atc", revoke], { encoding: "utf8" }).trim().split("\n").pop();

  await her.reload({ waitUntil: "domcontentloaded", timeout: 240000 });
  await sleep(9000);
  said.after_revoke_portal = (await text(her)).slice(0, 900);
  said.shot_5 = await shot(her, "after-the-revoke-her-portal-is-gone");
  said.portal_still_shows_her_work =
    said.after_revoke_portal.includes("RPC-2214") || said.after_revoke_portal.includes("INV-2214-A");

  await her.goto(`${ORIGIN}/invitations/portal/accept/${TOKEN}`, {
    waitUntil: "domcontentloaded",
    timeout: 240000,
  });
  await until("the link says it is dead", async () =>
    (await text(her)).includes("took this invitation back"), 120000);
  said.dead_link_says = await text(her);
  said.shot_6 = await shot(her, "and-the-link-says-which-way-it-is-dead");

  if (said.portal_still_shows_her_work) {
    throw new Error(`🚨 revoked and her portal still draws her work: ${said.after_revoke_portal}`);
  }

  await herCtx.close();
} finally {
  await browser.close();
  writeFileSync(`${OUT}/portal-bind-walk.json`, JSON.stringify(said, null, 2));
  console.log(JSON.stringify(said, null, 2));
}

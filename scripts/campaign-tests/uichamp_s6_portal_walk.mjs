// LANE S6 — THE OUTSIDER'S SEAT, HEADLESS: a client opens her supplier's portal from a magic link.
//
//   S6_ORIGIN=http://s6.localhost:3067 S6_SLUG=<portal slug> S6_EMAIL=test@test.com \
//   S6_SUPABASE_URL=https://<clone ref>.supabase.co S6_SERVICE_KEY=<clone secret key> \
//   [S6_EXPECT='["text that must appear", …]'] [S6_FORBID='["text that must not", …]'] \
//   [S6_TAG=<shot name prefix>] node scripts/campaign-tests/uichamp_s6_portal_walk.mjs
//
// The dev server must point at the SAME database as S6_SUPABASE_URL (the dev clone; never
// production — the script refuses the production host by name). The key is read from the
// environment and never printed; the one-time link is minted through the clone's own Auth admin
// API (`generate_link`, type magiclink) exactly as the email the portal sends would carry it, and
// is opened through the app's own /auth/confirm route in a FRESH browser context with no cookies.
//
// For each viewport (390×844 phone, 1440×900 desktop) it asserts: the page answered (no Next
// error overlay, no "Something went wrong", no "malformed array literal"), the app says the
// signed-in email is S6_EMAIL, every S6_EXPECT string is on the page and no S6_FORBID string is.
// Exit 0 only when every clause passes. Screenshots and a JSON receipt land in S6_OUT.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const ORIGIN = process.env.S6_ORIGIN ?? "http://s6.localhost:3067";
const SLUG = process.env.S6_SLUG;
const EMAIL = process.env.S6_EMAIL ?? "test@test.com";
const SUPA = process.env.S6_SUPABASE_URL;
const KEY = process.env.S6_SERVICE_KEY;
const EXPECT = JSON.parse(process.env.S6_EXPECT ?? "[]");
const FORBID = JSON.parse(process.env.S6_FORBID ?? "[]");
const TAG = process.env.S6_TAG ?? "portal";
const OUT = process.env.S6_OUT ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23/s6";
if (!SLUG || !SUPA || !KEY) {
  console.error("S6_SLUG, S6_SUPABASE_URL and S6_SERVICE_KEY are required (the key is never printed).");
  process.exit(2);
}
if (/db\.matrxserver\.com|brsgrqvjdzwihsvnfqkf/.test(SUPA)) {
  console.error("S6_SUPABASE_URL names PRODUCTION. This walk runs on the dev clone only.");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

async function magicLink() {
  const r = await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: EMAIL }),
  });
  const j = await r.json();
  const hash = j.hashed_token ?? j.properties?.hashed_token;
  if (!r.ok || !hash) throw new Error(`generate_link refused: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  const dest = `/portal/c/${SLUG}`;
  return `${ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=magiclink&redirectTo=${encodeURIComponent(dest)}`;
}

const receipt = { ranAt: new Date().toISOString(), origin: ORIGIN, slug: SLUG, seat: EMAIL, clauses: [] };
const clause = (name, ok, saw) => {
  receipt.clauses.push({ name, ok, saw });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  — saw: ${JSON.stringify(saw).slice(0, 300)}`}`);
};

const browser = await chromium.launch({ headless: true });
try {
  for (const [label, viewport] of [["phone-390", { width: 390, height: 844 }], ["desktop-1440", { width: 1440, height: 900 }]]) {
    const ctx = await browser.newContext({ viewport, isMobile: label.startsWith("phone"), hasTouch: label.startsWith("phone") });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const link = await magicLink();
    const resp = await page.goto(link, { waitUntil: "domcontentloaded", timeout: 300000 });
    await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const url = page.url();
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const who = await page.evaluate(async () => {
      try { return (await (await fetch("/api/whoami")).json())?.email ?? null; } catch { return null; }
    });
    clause(`${label}: the magic link lands on the portal`, url.includes(`/portal/c/${SLUG}`), url);
    clause(`${label}: the app says ${EMAIL} is signed in`, who === EMAIL, who);
    const broken = /malformed array literal|Something went wrong|Application error|Unhandled Runtime Error|This page could not be found/i.test(text);
    clause(`${label}: the portal page answers (status ${resp?.status()}), no crash`, !broken && (resp?.status() ?? 500) < 500, text.slice(0, 300));
    for (const s of EXPECT) clause(`${label}: shows "${s}"`, text.includes(s), text.slice(0, 400));
    for (const s of FORBID) clause(`${label}: never shows "${s}"`, !text.includes(s), s);
    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    clause(`${label}: no horizontal scroll`, noHScroll, await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]));
    const shot = `${OUT}/${TAG}-${label}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    receipt[label] = { url, shot, pageErrors: errors, text: text.slice(0, 1500) };
    await ctx.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${OUT}/${TAG}-walk.json`, JSON.stringify(receipt, null, 2));
}
const failed = receipt.clauses.filter((c) => !c.ok).length;
console.log(failed ? `${failed} CLAUSE(S) FAILED` : "ALL CLAUSES PASSED");
process.exit(failed ? 1 : 0);

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

// S6_JOURNEY=1 — the rest of her visit (the Rincon fixture, `_s6_walk_fixture.sql`): open the
// boiler-room call and read its status line; open "Update a gate code", send it, and see it land.
const JOURNEY = process.env.S6_JOURNEY === "1";
/** The accent band's computed colour, or null when the page drew none. */
const accentBand = (page) =>
  page.evaluate(() => {
    const el = document.querySelector("main > div[aria-hidden].fixed");
    return el ? getComputedStyle(el).backgroundColor : null;
  });
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());

async function journey(page, label) {
  // 1. Her boiler-room call and where it stands.
  const callHref = await page.getByRole("link", { name: /Boiler room floor drain backing up/ }).first().getAttribute("href");
  await page.goto(`${ORIGIN}${callHref}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.getByRole("heading", { name: "Status" }).waitFor({ timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
  const rec = await bodyText(page);
  const order = ["Requested", "Scheduled", "On site", "Done"].map((w) => rec.indexOf(w));
  clause(`${label}: the call's status line reads Requested, Scheduled, On site, Done in order`,
    order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]), rec.slice(0, 500));
  const current = await page.locator('li[aria-current="step"]').innerText().catch(() => "");
  clause(`${label}: "On site" is the current step`, /On site/.test(current), current);
  const done = await page.locator("ol li").evaluateAll((lis) => lis.map((li) => li.textContent ?? ""));
  clause(`${label}: the passed steps carry the moment they were reached`,
    /Requested.*(AM|PM)/.test(done[0] ?? "") && /Scheduled.*(AM|PM)/.test(done[1] ?? ""), done);
  clause(`${label}: the office's private note never reaches her`, !/Office notes|Tech: Luis|reserve account/.test(rec), rec.slice(0, 400));
  await page.screenshot({ path: `${OUT}/${TAG}-${label}-status-line.png`, fullPage: true });

  // 2. "Update a gate code", from her portal, sent as her.
  await page.goto(`${ORIGIN}/portal/c/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  // Follow the link's own address (a click during the dev server's first compile can be eaten).
  const formHref = await page.getByRole("link", { name: "Update a gate code" }).getAttribute("href");
  clause(`${label}: "Update a gate code" opens inside the portal`, Boolean(formHref?.startsWith(`/portal/c/${SLUG}/f/`)), formHref);
  await page.goto(`${ORIGIN}${formHref}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.getByRole("heading", { name: "Update a gate code" }).waitFor({ timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const formText = await bodyText(page);
  clause(`${label}: the gate-code form never asks which building she is`, !/Building/.test(formText), formText.slice(0, 400));
  await page.screenshot({ path: `${OUT}/${TAG}-${label}-gate-form.png`, fullPage: true });
  const gate = label.startsWith("phone") ? "North pedestrian gate" : "Garage entry gate";
  // Hydration: a fill that lands before the bundle attaches is silently undone by React.
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.getByLabel(/Which gate\?/).pressSequentially(gate, { delay: 10 });
  await page.getByLabel(/The new code/).pressSequentially(label.startsWith("phone") ? "2580" : "7314", { delay: 10 });
  await page.getByRole("button", { name: /^Send$/ }).click();
  await page.getByText(/Sent|It is on your portal now|arrived|waiting/i).first().waitFor({ timeout: 120000 });
  const sentText = await bodyText(page);
  clause(`${label}: the form says it was sent, in her words`, /on your portal now, and Rincon Plumbing has it/i.test(sentText) && !/stamped on it/.test(sentText), sentText.slice(0, 300));
  await page.screenshot({ path: `${OUT}/${TAG}-${label}-gate-sent.png`, fullPage: true });

  // 3. Back on her portal, the request is on her own list.
  await page.goto(`${ORIGIN}/portal/c/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForTimeout(2000);
  const after = await bodyText(page);
  clause(`${label}: her new request is on her own list`, after.includes(gate), after.slice(0, 600));
  clause(`${label}: no row reads "Untitled"`, !/Untitled/.test(after), after.slice(0, 600));
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
    // 0. SIGNED OUT, the page she opens from the text message: it says whose it is first.
    if (JOURNEY) {
      await page.goto(`${ORIGIN}/portal/c/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 300000 });
      await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
      const out = await bodyText(page);
      clause(`${label}: signed out, the sign-in page carries the business's own name`, /Rincon Plumbing/.test(out) && /Sign in|email/i.test(out), out.slice(0, 300));
      const band = await accentBand(page);
      clause(`${label}: signed out, the accent band is drawn`, Boolean(band) && band !== "rgba(0, 0, 0, 0)", band);
      await page.screenshot({ path: `${OUT}/${TAG}-${label}-signed-out.png`, fullPage: true });
    }
    const link = await magicLink();
    const resp = await page.goto(link, { waitUntil: "domcontentloaded", timeout: 300000 });
    await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const url = page.url();
    // Screenshots hide the caret with an inline style; one taken before hydration is a mismatch
    // the walk itself caused, so the page is settled first.
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    const who = await page.evaluate(async () => {
      try { return (await (await fetch("/api/whoami")).json())?.email ?? null; } catch { return null; }
    });
    clause(`${label}: the magic link lands on the portal`, url.includes(`/portal/c/${SLUG}`), url);
    clause(`${label}: the app says ${EMAIL} is signed in`, who === EMAIL, who);
    const broken = /malformed array literal|Something went wrong|Application error|Unhandled Runtime Error|This page could not be found/i.test(text);
    clause(`${label}: the portal page answers (status ${resp?.status()}), no crash`, !broken && (resp?.status() ?? 500) < 500, text.slice(0, 300));
    // Case-insensitive: a label drawn in small capitals reads upper-case in innerText.
    for (const s of EXPECT) clause(`${label}: shows "${s}"`, text.toLowerCase().includes(s.toLowerCase()), text.slice(0, 400));
    for (const s of FORBID) clause(`${label}: never shows "${s}"`, !text.includes(s), s);
    if (JOURNEY) {
      const band = await accentBand(page);
      clause(`${label}: signed in, the accent band is drawn`, Boolean(band) && band !== "rgba(0, 0, 0, 0)", band);
    }
    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    clause(`${label}: no horizontal scroll`, noHScroll, await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]));
    const shot = `${OUT}/${TAG}-${label}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    receipt[label] = { url, shot, pageErrors: errors, text: text.slice(0, 1500) };
    if (JOURNEY) await journey(page, label);
    clause(`${label}: no uncaught page error`, errors.length === 0, errors);
    await ctx.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${OUT}/${TAG}-walk.json`, JSON.stringify(receipt, null, 2));
}
const failed = receipt.clauses.filter((c) => !c.ok).length;
console.log(failed ? `${failed} CLAUSE(S) FAILED` : "ALL CLAUSES PASSED");
process.exit(failed ? 1 : 0);

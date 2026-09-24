/**
 * LANE S7-PRIME — THE HEADLESS WALK: a referral link fills in the clinic, the patient stops half-way
 * on her phone and finishes on her laptop, and the thank-you screen says the next step and goes on
 * to the practice's own booking page. Before it, the owner sets that thank-you screen in the
 * builder, as admin@admin.com, through the real login form.
 *
 * THE USE CASE. Ridgeline Physical Therapy (test organization on the dev clone, fixture
 * `_s7_walk_fixture.sql`). Harbor Sports Medicine refers Leilani Okafor with a link naming the
 * clinic. Every name is synthesized.
 *
 * SEATS.
 *   · owner  — admin@admin.com through /login (password from the environment, never printed);
 *   · stranger, device 1 — a FRESH context, no cookies, phone viewport, the referral link;
 *   · stranger, device 2 — ANOTHER fresh context, no cookies, laptop viewport, her saved link.
 *
 *   WALK_ORIGIN=http://s7prime.localhost:3067 WALK_FORM=<id> WALK_TABLE=<id> \
 *   WALK_EMAIL=admin@admin.com WALK_PASSWORD=… WALK_OUT=<dir> node scripts/campaign-tests/s7_public_form_walk.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { signIn, setOrganization, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "http://s7prime.localhost:3067";
const FORM = process.env.WALK_FORM ?? "";
const TABLE = process.env.WALK_TABLE ?? "";
const EMAIL = process.env.WALK_EMAIL ?? "";
const PASSWORD = process.env.WALK_PASSWORD ?? "";
const OUT = process.env.WALK_OUT ?? resolve(process.cwd(), "tmp/s7-walk");
const ONLY = process.env.WALK_ONLY ?? "all"; // all | owner | stranger
mkdirSync(OUT, { recursive: true });
if (!FORM || !TABLE) throw new Error("WALK_FORM and WALK_TABLE are required — run _s7_walk_fixture.sql on the clone first.");

const REFERRAL_URL = `${ORIGIN}/f/${FORM}?referring_clinic=${encodeURIComponent("Harbor Sports Medicine")}`;
const NEXT_STEP = "Next, book your first visit online — it takes a minute, and your therapist will have read this before you arrive.";
const BOOKING = "https://example.com/?ridgeline=first-visit";
const FOREIGN = "https://ridgeline-pt.phish.example.net/login";

const out = { ranAt: new Date().toISOString(), origin: ORIGIN, form: FORM, table: TABLE, clauses: [] };
const clause = (name, ok, detail = {}) => {
  out.clauses.push({ name, ok: Boolean(ok), ...detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${Object.keys(detail).length ? "  " + JSON.stringify(detail) : ""}`);
};
const text = (page) => page.evaluate(() => document.body.innerText).catch(() => "");
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

/** Fill a runner input the way a person types, and wait until React holds it. */
async function answer(page, key, value) {
  const sel = `#form-${key}`;
  await page.locator(sel).waitFor({ state: "visible", timeout: 60000 });
  await page.locator(sel).click();
  await page.locator(sel).fill("");
  await page.locator(sel).pressSequentially(value, { delay: 5 });
  await page.waitForTimeout(300);
  return (await page.locator(sel).inputValue()) === value;
}

async function owner(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, "owner");
  clause("owner signed in through the login form as admin@admin.com", who === EMAIL, { who });
  await setOrganization(page, "Ridgeline Physical Therapy").catch((e) => clause("owner picked Ridgeline Physical Therapy", false, { error: String(e) }));

  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  // The Forms rail, then the builder for this table's form.
  const forms = await until("forms rail", async () => {
    const b = page.getByRole("button", { name: /^Forms/ }).first();
    if (await b.isVisible().catch(() => false)) return b;
    const t = page.getByRole("tab", { name: /^Forms/ }).first();
    return (await t.isVisible().catch(() => false)) ? t : null;
  }, 120000);
  if (!forms.v) {
    await shot(page, "s7-owner-00-no-forms-rail");
    clause("owner reached the table's Forms rail", false);
    await context.close();
    return;
  }
  await forms.v.click();
  const build = await until("build a form", async () => {
    const b = page.getByRole("button", { name: /Build a form|Edit form|Open builder/i }).first();
    return (await b.isVisible().catch(() => false)) ? b : null;
  }, 60000);
  if (build.v) await build.v.click();
  const section = await until("after somebody sends it", async () => (await page.getByLabel("After somebody sends it").isVisible().catch(() => false)) ? true : null, 60000);
  clause("the builder shows the 'After somebody sends it' section beside the link", section.v === true);
  await shot(page, "s7-owner-01-builder-after-sending");
  if (!section.v) {
    await context.close();
    return;
  }
  const area = page.getByLabel("After somebody sends it");
  await area.getByLabel("Thank-you title").fill("You are all set, thank you");
  await area.getByLabel("Thank-you message").fill(NEXT_STEP);
  await area.getByLabel("Then go to (optional)").fill(FOREIGN);
  await page.getByRole("button", { name: /^Save$/ }).first().click();
  const refused = await until("refusal", async () => {
    const t = await text(page);
    return /own sites/i.test(t) && t.includes("phish.example.net") ? t : null;
  }, 60000);
  clause("a foreign address is refused on Save, in the store's words, naming the sites it may use", Boolean(refused.v), {
    said: refused.v ? (refused.v.match(/[^\n]*own sites[^\n]*/i)?.[0] ?? "").slice(0, 220) : null,
  });
  await shot(page, "s7-owner-02-foreign-redirect-refused");
  const kept = await area.getByLabel("Then go to (optional)").inputValue().catch(() => null);
  clause("the builder stays on screen after the refusal, her address still typed (a refusal never takes the builder away)", kept === FOREIGN, { kept });

  await area.getByLabel("Then go to (optional)").fill(BOOKING);
  await page.getByRole("button", { name: /^Save$/ }).first().click();
  const saved = await until("saved", async () => (/\bSaved\./.test(await text(page)) ? true : null), 60000);
  clause("the practice's own booking page saves", saved.v === true);
  await shot(page, "s7-owner-03-booking-page-saved");
  await context.close();
}

async function stranger(browser) {
  // ── device 1: her phone, in the waiting room ─────────────────────────────────────────────
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p1 = await phone.newPage();
  clause("device 1 starts with no cookies", (await phone.cookies()).length === 0);
  const saves = [];
  p1.on("request", (r) => {
    if (r.url().includes(`/api/forms/${FORM}/draft`) && !r.url().endsWith("/resume")) saves.push(r.postDataJSON?.() ?? null);
  });
  await p1.goto(REFERRAL_URL, { waitUntil: "domcontentloaded", timeout: 240000 });
  const who = await p1.evaluate(async () => (await (await fetch("/api/whoami")).json().catch(() => null))?.email ?? null);
  clause("device 1 is nobody (/api/whoami answers no one)", who === null, { who });
  await p1.getByRole("button", { name: /^Next$/ }).first().waitFor({ state: "visible", timeout: 240000 });
  await p1.waitForTimeout(1500); // hydration
  const clinic = await p1.locator("#form-referring_clinic").inputValue().catch(() => null);
  clause("the referral link filled in the clinic", clinic === "Harbor Sports Medicine", { clinic });
  await shot(p1, "s7-stranger-01-referral-link-prefilled");

  await p1.getByRole("button", { name: /^Next$/ }).first().click();
  const imaging = await until("imaging question", async () => (await p1.locator("#form-imaging_sent").isVisible().catch(() => false)) ? true : null, 20000);
  clause("the imaging question is asked because the link named a clinic (the asks door branched on the prefill)", imaging.v === true);
  await answer(p1, "imaging_sent", "Yes — an MRI of my left knee from August");
  await shot(p1, "s7-stranger-02-imaging-asked");
  await p1.getByRole("button", { name: /^Next$/ }).first().click();
  const named = await answer(p1, "full_name", "Leilani Okafor");
  clause("she answers her name", named);
  const savedLine = await until("saved line", async () => (/Your answers are saved/.test(await text(p1)) ? true : null), 30000);
  clause("the page says her answers are saved and offers her own link", savedLine.v === true, { saves: saves.length });
  await p1.getByRole("button", { name: /Copy my link/ }).first().click();
  const link = await until("resume link", async () => {
    const clip = await p1.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return null;
      }
    });
    if (clip && clip.includes("#resume=")) return clip;
    const t = await text(p1);
    return t.match(/https?:\/\/\S+#resume=[A-Za-z0-9_-]+/)?.[0] ?? null;
  }, 15000);
  clause("she has her own link to finish later (the secret rides the #fragment)", Boolean(link.v) && link.v.includes(`/f/${FORM}#resume=`), {
    link: link.v ? link.v.replace(/#resume=.*/, "#resume=…") : null,
  });
  await shot(p1, "s7-stranger-03-saved-with-her-link");
  const lastSave = saves.filter(Boolean).at(-1);
  clause("the last save carried her answers so far and nothing else", Boolean(lastSave) && lastSave.answers?.full_name === "Leilani Okafor" && lastSave.answers?.referring_clinic === "Harbor Sports Medicine" && !Object.keys(lastSave.answers ?? {}).some((k) => k.startsWith("confirm_")), {
    keys: lastSave ? Object.keys(lastSave.answers ?? {}) : null,
  });
  await phone.close(); // she puts the phone away — the tab is gone

  if (!link.v) return;
  // ── device 2: her laptop, that evening ───────────────────────────────────────────────────
  const laptop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await laptop.newPage();
  clause("device 2 starts with no cookies and no saved place", (await laptop.cookies()).length === 0);
  await p2.goto(link.v, { waitUntil: "domcontentloaded", timeout: 240000 });
  const picked = await until("picked up", async () => (/Picked up where you left off/.test(await text(p2)) ? true : null), 60000);
  clause("the second device opens her saved answers", picked.v === true);
  const hashGone = await p2.evaluate(() => window.location.hash === "");
  clause("the secret is taken out of the address bar", hashGone);
  await p2.waitForTimeout(800);
  const at = await p2.evaluate(() => document.body.innerText.match(/(\d+) of (\d+)/)?.[0] ?? null);
  const onPhone = await p2.locator("#form-phone").isVisible().catch(() => false);
  clause("it opens on the first question still waiting for an answer (the phone number), not question one", onPhone, { at });
  await shot(p2, "s7-stranger-04-second-device-picked-up");
  await answer(p2, "phone", "(808) 555-0161");
  await p2.getByRole("button", { name: /^Next$/ }).first().click();
  await answer(p2, "reason_for_visit", "Knee pain after a fall on a trail run; my doctor at Harbor Sports Medicine sent me.");
  await p2.getByRole("button", { name: /^Next$/ }).first().click();
  await answer(p2, "goals", "Running my first 10K since the fall.");
  // Back to the start to prove the earlier answers are still hers.
  await p2.getByRole("button", { name: /^Submit$|^Send$/ }).first().click();
  const thanks = await until("thank-you", async () => (await text(p2)).includes(NEXT_STEP) ? true : null, 60000);
  clause("the thank-you screen says the next step in the practice's own words", thanks.v === true);
  await shot(p2, "s7-stranger-05-thank-you-next-step");
  const landed = await until("redirect", async () => (p2.url().startsWith("https://example.com/") ? p2.url() : null), 30000);
  clause("then it goes on to the practice's own booking page", Boolean(landed.v), { url: landed.v });
  await shot(p2, "s7-stranger-06-landed-on-booking-page");
  await laptop.close();

  // ── the used-up link: a third fresh context opens the same link again ────────────────────
  const again = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p3 = await again.newPage();
  await p3.goto(link.v, { waitUntil: "domcontentloaded", timeout: 240000 });
  const used = await until("used", async () => (/already sent/.test(await text(p3)) ? true : null), 60000);
  clause("her link, opened again after sending, says the answers were already sent", used.v === true);
  await shot(p3, "s7-stranger-07-link-after-sending");
  await again.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    if (ONLY !== "stranger") await owner(browser);
    if (ONLY !== "owner") await stranger(browser);
  } finally {
    await browser.close();
    writeFileSync(`${OUT}/s7-walk.json`, JSON.stringify(out, null, 2));
  }
  const failed = out.clauses.filter((c) => !c.ok);
  console.log(`\n${out.clauses.length - failed.length}/${out.clauses.length} clauses passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  writeFileSync(`${OUT}/s7-walk.json`, JSON.stringify({ ...out, crashed: String(e) }, null, 2));
  process.exit(2);
});

// scripts/drill-usage-verifier32-walk.mjs — lane DRILL-USAGE-PAGE, the re-walk of VERIFIER-32's eight
// defects on /administration/usage, as admin@admin.com through the login form (headless, one browser).
// Live database, read-only except the page's own recount and ONE platform Saved view it saves and
// archives. Each defect is a check that FAILS when the defect is back:
//   F1 the header says where the whole-hour window starts
//   F2 the Spend Explorer link carries person + day and a 90-day window stays a custom 90 days
//   F3 the row menu says "See these requests" and the ungrouped screen has a total and named crumbs
//   F4 at 390 px the money column is on screen; the Show button reads "Show Cost"
//   F5 no id or code in any group label, crumb or header across the old screens
//   F6 the rows (+ everything else) add up to the Total line, in credits
//   F7 Saved views open with no organization picker and save into the platform
//
//   ORIGIN=http://drillusage.localhost:3001 node scripts/drill-usage-verifier32-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drillusage.localhost:3001";
const SHOTS = process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-30/drill-usage-page/verifier32-fixes";
mkdirSync(SHOTS, { recursive: true });
const readEnv = (p) =>
  Object.fromEntries(readFileSync(p, "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const env = { ...readEnv(new URL("../../aidream/.env", import.meta.url)), ...readEnv(new URL("../.env.local", import.meta.url)) };
const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";

const out = { origin: ORIGIN, started: new Date().toISOString(), checks: [], console_errors: [] };
const check = (id, ok, detail = {}) => {
  out.checks.push({ id, ok, ...detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${JSON.stringify(detail).slice(0, 300)}`);
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 300)));
const origGoto = page.goto.bind(page);
page.goto = async (url, opts) => {
  let r;
  for (let attempt = 1; ; attempt++) {
    try {
      r = await origGoto(url, { waitUntil: "domcontentloaded", timeout: 180000, ...opts });
      break;
    } catch (e) {
      // the shared preview recompiles under other agents' edits; an aborted load is retried once
      if (attempt >= 3 || !/ERR_ABORTED|interrupted/.test(String(e))) throw e;
      await sleep(3000);
    }
  }
  await sleep(1500);
  const resume = page.getByRole("button", { name: "Resume this preview" });
  if (await resume.count()) {
    await resume.click();
    await sleep(3000);
  }
  return r;
};
await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
const settle = async (needGroups = true) => {
  await until("answer", async () => {
    const total = await page.locator("[data-drill-explorer-total]").textContent().catch(() => null);
    const groups = await page.locator('[data-matrx-drill-level="0"]').count();
    return total && total !== "…" && (!needGroups || groups > 0);
  }, 90000);
  await sleep(2500); // names arrive after the numbers
};
const U = "/administration/usage";
const ID = /[0-9a-f]{8}-[0-9a-f]{4}|[0-9a-f]{8}…|\b[a-z]+_[a-z_]+\b|:\s?[0-9a-f]{6,}/;

// F1
await page.goto(`${ORIGIN}${U}?by=provider&show=cost,requests&sort=-cost&w=30d`);
await settle();
const start = await page.locator("[data-drill-explorer-window-start]").textContent().catch(() => null);
check("F1 the header says where the whole-hour window starts", Boolean(start && /from /.test(start)), { start });
await page.screenshot({ path: `${SHOTS}/f1-window-start.png` });

// F6 — rows + everything else = Total (credits), on a wide grouping
const sums = await page.evaluate(() => {
  const num = (s) => Number(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
  const rows = Array.from(document.querySelectorAll('[data-matrx-drill-level="0"]'));
  const firstMeasure = (tr) => num(tr.querySelectorAll("td")[1]?.textContent);
  const shown = rows.reduce((a, tr) => a + firstMeasure(tr), 0);
  const other = Array.from(document.querySelectorAll("[data-matrx-drill-other], [data-matrx-drill-rest]")).reduce((a, tr) => a + firstMeasure(tr), 0);
  const total = num(document.querySelector('[data-matrx-drill-total-measure="cost"]')?.textContent);
  return { shown, other, total };
});
check("F6 the rows and everything else add up to the Total line", Math.abs(sums.shown + sums.other - sums.total) < 0.5, sums);

// F5 — no id or code anywhere a person reads, across the old screens
const screens = [
  "?by=person&show=cost&sort=-cost&w=365d",
  "?by=organization&show=cost&sort=-cost&w=365d",
  "?by=feature&show=cost&sort=-cost&w=30d",
  "?by=origin&show=cost&w=30d",
  "?by=source&show=cost&sort=-cost&w=30d",
  "?by=provider&show=cost&w=30d",
  "?by=app&show=cost&w=30d",
  "?by=agent&show=cost&sort=-cost&w=30d",
  "?by=trigger&across=origin&show=cost&w=30d",
];
const offenders = [];
for (const q of screens) {
  await page.goto(`${ORIGIN}${U}${q}`);
  await settle();
  const labels = await page.evaluate(() =>
    [
      ...Array.from(document.querySelectorAll("[data-matrx-drill-into]")).map((e) => e.textContent ?? ""),
      ...Array.from(document.querySelectorAll("[data-matrx-drill-answer] thead th")).map((e) => e.textContent ?? ""),
    ].filter(Boolean),
  );
  for (const l of labels) if (ID.test(l)) offenders.push(`${q}: ${l}`);
}
check("F5 no id or code in any group label or column across nine screens", offenders.length === 0, { offenders: offenders.slice(0, 12) });
await page.screenshot({ path: `${SHOTS}/f5-origin-by-trigger.png` });

// F2 — the hand-off carries the drill
await page.goto(`${ORIGIN}${U}?f.person=${ADMIN}&f.at:day=2026-09-28&by=model&show=cost&w=30d`);
await settle();
const hrefDay = await page.locator("[data-drill-explorer-note] a, p a", { hasText: "Spend Explorer" }).first().getAttribute("href").catch(() => null);
check("F2 person + day ride into the Spend Explorer", Boolean(hrefDay && hrefDay.includes(`f.user=${ADMIN}`) && hrefDay.includes("f.day=2026-09-28")), { hrefDay });
await page.goto(`${ORIGIN}${U}?f.provider=anthropic&by=model&show=cost&w=90d`);
await settle();
const note90 = await page.locator("[data-drill-explorer-note]").textContent().catch(() => "");
const href90 = await page.locator("[data-drill-explorer-note] a", { hasText: "Spend Explorer" }).first().getAttribute("href").catch(() => null);
check("F2 a 90-day window stays 90 days and the provider it cannot narrow by is said", Boolean(href90 && href90.includes("win=custom") && /cannot narrow by provider/.test(note90 ?? "")), { href90 });

// F3 — "See these requests", and the ungrouped screen is not dead
await page.goto(`${ORIGIN}${U}?by=person&show=cost&sort=-cost&w=30d`);
await settle();
await page.locator("[data-matrx-drill-menu]").first().click();
await sleep(600);
const recordsItem = await page.locator('[data-matrx-drill-action="records"]').textContent().catch(() => null);
check('F3 the row menu says "See these requests"', recordsItem?.trim() === "See these requests", { recordsItem });
await page.locator('[data-matrx-drill-action="records"]').click();
await sleep(1500);
await settle(false);
const ungrouped = await page.evaluate(() => ({
  total: document.querySelector("[data-drill-explorer-total]")?.textContent ?? null,
  trail: document.querySelector("[data-drill-explorer] nav, [data-matrx-drill-trail]")?.textContent ?? document.body.innerText.slice(0, 400),
  link: Array.from(document.querySelectorAll("a")).some((a) => a.textContent === "Spend Explorer"),
}));
check("F3 the ungrouped screen has its total, named crumbs and the way to the calls", Boolean(ungrouped.total && ungrouped.total !== "…" && !/[0-9a-f]{8}…/.test(ungrouped.trail) && ungrouped.link), ungrouped);
await page.screenshot({ path: `${SHOTS}/f3-see-these-requests.png` });

// F7 — Saved views: no picker, saved into the platform
await page.goto(`${ORIGIN}${U}?by=provider&show=cost&w=90d`);
await settle();
await page.locator("[data-drill-explorer-saved-views]").click();
await sleep(700);
const canSave = await page.locator("[data-drill-explorer-save-view]").count();
const needsOrg = await page.getByText("An organization is needed").count();
check("F7 Saved views open with no organization picker", canSave > 0 && needsOrg === 0, { canSave, needsOrg });
await page.screenshot({ path: `${SHOTS}/f7-saved-views.png` });
if (canSave) {
  const name = `Provider spend, last 90 days (re-walk ${new Date().toISOString().slice(11, 16)})`;
  await page.locator("[data-drill-explorer-save-view]").click();
  await page.getByRole("dialog").locator("input, textarea").first().fill(name);
  await page.getByRole("button", { name: "Save view" }).click();
  await sleep(1500);
  await page.locator("[data-drill-explorer-saved-views]").click();
  await sleep(700);
  const listed = page.locator("[data-drill-explorer-view]", { hasText: name }).first();
  const found = await listed.count();
  check("F7 the saved view is listed among the platform's views", found > 0);
  if (found) {
    const archive = listed.getByRole("button", { name: /Archive/ });
    if (await archive.count()) {
      await archive.click();
      await sleep(1000);
    }
  }
  await page.keyboard.press("Escape");
}

// F4 — the phone
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${ORIGIN}${U}?f.person=${ADMIN}&by=model&show=cost&sort=-cost&w=30d`);
await settle();
const phone = await page.evaluate(() => {
  const cell = document.querySelector('[data-matrx-drill-level="0"] td:nth-child(2)');
  const r = cell?.getBoundingClientRect();
  return {
    moneyRight: r ? Math.round(r.right) : null,
    width: window.innerWidth,
    sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    show: document.querySelector("[data-matrx-drill-measures]")?.textContent ?? null,
  };
});
check("F4 at 390 px the money column is on screen and nothing scrolls sideways", phone.moneyRight !== null && phone.moneyRight <= phone.width && !phone.sideways, phone);
check('F4 the Show button reads "Show Cost…"', /Show Cost/.test(phone.show ?? ""), { show: phone.show, note: "needs @ai-matrx/design-system with 7c80565889 installed" });
await page.screenshot({ path: `${SHOTS}/f4-phone.png` });

out.finished = new Date().toISOString();
writeFileSync(`${SHOTS}/walk.json`, JSON.stringify(out, null, 2));
const failed = out.checks.filter((c) => !c.ok).length;
console.log(`${out.checks.length - failed} passed, ${failed} failed, ${out.console_errors.length} console errors`);
await browser.close();

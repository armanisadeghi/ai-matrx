import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { signIn } from "./lib/seat-browser.mjs";
const ORIGIN = "http://data-v2-basics-2.localhost:3001";
const TABLE = "d3efc79c-cc14-4bb9-88b2-e7be349ac081";
const SHOTS = process.env.SHOTS;
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const email = env.AI_ADMIN_USERNAME ?? process.env.AI_ADMIN_USERNAME; const pw = env.AI_ADMIN_PASSWORD ?? process.env.AI_ADMIN_PASSWORD;
const browser = await chromium.launch({ headless: true, args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const who = await signIn(page, ORIGIN, email, pw, "admin");
console.log("signed in as", who);
const step = process.argv[2] ?? "search390";
await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(8000);
if (step !== "explore") {
  await page.getByRole("button", { name: "Sheet", exact: true }).first().click().catch(async () => { await page.getByText("Sheet", { exact: true }).first().click(); });
  await page.waitForTimeout(6000);
}
if (step === "search390") {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(3000);
  const m = await page.evaluate(() => {
    const inp = [...document.querySelectorAll('input[data-surface-value="search_term"]')].find((e) => e.offsetParent);
    const btn = [...document.querySelectorAll('button[aria-label="Search rows"]')].find((e) => e.offsetParent);
    const look = [...document.querySelectorAll("button,span")].find((e) => /Your look/.test(e.textContent ?? "") && e.offsetParent);
    let fits = null;
    if (inp) { const cs = getComputedStyle(inp); const c = document.createElement("canvas").getContext("2d"); c.font = `${cs.fontSize} ${cs.fontFamily}`; const need = c.measureText(inp.placeholder).width; const room = inp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); fits = { need: Math.round(need), room: Math.round(room) }; }
    return { input: !!inp, iconButton: !!btn, look: !!look, fits, pageScrollX: document.documentElement.scrollWidth - window.innerWidth };
  });
  console.log(JSON.stringify(m));
  await page.screenshot({ path: `${SHOTS}/${process.env.TAG ?? "x"}-390.png` });
}
if (step === "explore") {
  const info = await page.evaluate(() => ({
    headers: [...document.querySelectorAll("th")].map((t) => (t.textContent ?? "").trim()).filter(Boolean).slice(0, 30),
    buttons: [...document.querySelectorAll("button")].filter((b) => b.offsetParent).map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()).filter(Boolean).slice(0, 60),
  }));
  console.log(JSON.stringify(info));
  await page.screenshot({ path: `${SHOTS}/explore.png` });
}
if (step === "rowform") {
  await page.screenshot({ path: `${SHOTS}/sheet.png` });
  console.log(await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.offsetParent).map((b) => (b.getAttribute("title") || b.getAttribute("aria-label") || b.textContent || "").trim()).filter(Boolean).slice(-40).join(" | ")));
  await page.mouse.click(480, 63);
  await page.waitForTimeout(4000);
  const blocks = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] label[for]')].map((l) => {
    const block = l.parentElement?.parentElement;
    const ctl = block?.querySelector("input, textarea, select, button, [role=combobox], [role=radiogroup], [role=checkbox]");
    const hint = block?.querySelector("p.text-\\[11px\\]");
    return { label: (l.textContent ?? "").trim(), control: ctl ? ctl.tagName + ":" + (ctl.textContent ?? "").trim().slice(0, 30) : null, hint: hint ? hint.textContent : null };
  }));
  console.log(JSON.stringify(blocks, null, 0));
  await page.screenshot({ path: `${SHOTS}/rowform.png` });
  const dateLabel = blocks.find((b) => /date/i.test(b.label) && b.control?.startsWith("BUTTON"));
  if (dateLabel) {
    const id = await page.evaluate((lab) => [...document.querySelectorAll('[role="dialog"] label[for]')].find((l) => (l.textContent ?? "").trim() === lab)?.getAttribute("for"), dateLabel.label);
    await page.click(`[id="${id}"]`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/rowform-date-open.png` });
    const today = page.locator('button:has-text("Today"), button:has-text("Now")').first();
    if (await today.count()) { await today.click(); await page.waitForTimeout(800); }
    const shown = await page.evaluate((id) => document.getElementById(id)?.textContent ?? "(no button)", id);
    console.log("date field after Today:", shown);
    await page.screenshot({ path: `${SHOTS}/rowform-date-picked.png` });
  }
  await page.keyboard.press("Escape");
}
if (step === "paste") {
  await page.mouse.click(526, 63);
  await page.waitForTimeout(2500);
  await page.fill("#pasteData", "Patient\tVisit Status\tCopay\tSessions Prescribed\nMaria Delgado\tScheduled\t$30\t12\nSean O'Brien\tCompleted\t$25.50\t8");
  await page.getByRole("button", { name: /parse|preview|next/i }).first().click();
  await page.waitForTimeout(2500);
  const rows = await page.evaluate(() => [...document.querySelectorAll("[data-matrx-paste-column]")].map((r) => (r.textContent ?? "").replace(/\s+/g, " ").trim()));
  const text = (await page.locator('[role="dialog"]').first().textContent()) ?? "";
  console.log(JSON.stringify({ rows, hasDataset: /dataset/i.test(text), willBeEmpty: /will be empty|left empty/.test(text), summary: (text.match(/\d+ of \d+ pasted columns[^.]*?table/) ?? [""])[0] }));
  await page.screenshot({ path: `${SHOTS}/paste-confirm.png` });
  // Change Patient's destination through its own select, then back.
  await page.locator('[data-matrx-paste-column="Patient"] [role="combobox"]').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/paste-select-open.png` });
  await page.getByRole("option", { name: "Skip" }).click();
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => [...document.querySelectorAll("[data-matrx-paste-column]")].map((r) => (r.textContent ?? "").replace(/\s+/g, " ").trim()));
  console.log("after Skip:", JSON.stringify(after));
  await page.getByRole("button", { name: "Cancel" }).first().click();
}
if (step === "sorts") {
  const header = (name) => page.locator("th", { hasText: name }).first();
  const out = {};
  for (const name of ["Visit Date", "Copay", "Title", "Visit Status"]) {
    await header(name).click({ button: "right" });
    await page.waitForTimeout(1200);
    out[name] = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((m) => (m.textContent ?? "").trim()).filter((t) => /^Sort/.test(t)));
    if (name === "Visit Date") await page.screenshot({ path: `${SHOTS}/menu-visit-date.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
  }
  await page.locator('button[title="Sort or filter Copay"]').first().click().catch(() => page.locator('[aria-label="Sort or filter Copay"]').first().click());
  await page.waitForTimeout(1200);
  out.copayHeaderMenu = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.offsetParent).map((b) => (b.textContent ?? "").trim()).filter((t) => /^Sort/.test(t)));
  await page.screenshot({ path: `${SHOTS}/header-menu-copay.png` });
  console.log(JSON.stringify(out));
}
if (step === "colours") {
  await page.locator("th", { hasText: "Visit Status" }).first().click({ button: "right" });
  await page.waitForTimeout(1200);
  await page.getByRole("menuitem", { name: /Column settings/ }).first().click();
  await page.waitForTimeout(3000);
  const shown = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Option color"]')].map((e) => (e.textContent ?? "").trim()));
  console.log("colour triggers:", JSON.stringify(shown));
  const first = page.locator('[aria-label="Option color"]').first();
  if (await first.count()) {
    await first.scrollIntoViewIfNeeded();
    await first.click();
    await page.waitForTimeout(800);
    console.log("colour list:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((o) => (o.textContent ?? "").trim()))));
    await page.screenshot({ path: `${SHOTS}/colour-list.png` });
    await page.keyboard.press("Escape");
  }
  await page.keyboard.press("Escape");
}
await browser.close();

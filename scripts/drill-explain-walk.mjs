// scripts/drill-explain-walk.mjs — lane DRILL-EXPLAIN (program DRILL-FINISH decision 22, 2026-09-30).
//
// Headless, read-only, on the shared preview as admin@admin.com: open /administration/usage, drill
// one person, press "Explain this", and read back what the Alchemy preparation workspace holds —
// the exact question (trail, grouping, window, Measures) and the answer (groups, total, coverage,
// counted through). NOTHING is sent to a model: no destination row is pressed; the walk only
// checks that the "Continue with AI" destinations are offered, then closes.
//
//   ORIGIN=http://drillexplain.localhost:3001 node scripts/drill-explain-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drillexplain.localhost:3001";
const SHOTS = process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-30/drill-explain";
mkdirSync(SHOTS, { recursive: true });
const out = { started: new Date().toISOString(), origin: ORIGIN, steps: [], console_errors: [], frictions: [] };
const friction = (what) => {
  out.frictions.push(what);
  console.log(`  ✗ FRICTION: ${what}`);
};
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result).slice(0, 600));
};
const shot = async (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });

async function gotoResuming(page, url) {
  for (let n = 1; n <= 8; n += 1) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
    await sleep(1500);
    const parked = page.url().includes("__dev-walk") || (await page.getByRole("button", { name: /Resume/ }).count()) > 0;
    if (!parked) return;
    console.log(`[walk] parked by the walk cap (try ${n}) — resuming`);
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await sleep(5000 * n);
  }
  throw new Error("the walk cap kept parking this tab");
}

const readEnv = (p) =>
  Object.fromEntries(
    readFileSync(p, "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
  );
const env = { ...readEnv(new URL("../../aidream/.env", import.meta.url)), ...readEnv(new URL("../.env.local", import.meta.url)) };

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 300)));
  // Any request to a model endpoint during the walk is a failure of the brief.
  const modelCalls = [];
  page.on("request", (r) => {
    const u = r.url();
    if (r.method() === "POST" && /\/ai\/(agents|mandates|chat|conversations)|\/api\/ai\//.test(u)) modelCalls.push(u);
  });

  await gotoResuming(page, `${ORIGIN}/login`);
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  step("signed in", { who });
  if (who !== "admin@admin.com") throw new Error(`signed in as ${who}, not the test seat`);

  const total = async () => (await page.locator("[data-drill-explorer-total]").textContent())?.trim();
  const groups = async () => page.locator("[data-matrx-drill-into]").count();
  const settled = async (label) => {
    await sleep(400);
    return (await until(label, async () => (await groups()) > 0 && !(await total())?.includes("…"), 120000)).ms;
  };

  await gotoResuming(page, `${ORIGIN}/administration/usage`);
  step("usage page", { ms: await settled("default screen"), total: await total(), groups: await groups() });
  await shot(page, "01-usage-default");

  const firstPerson = (await page.locator("[data-matrx-drill-into]").first().textContent())?.trim();
  await page.locator("[data-matrx-drill-into]").first().click();
  await settled("drilled a person");
  const screen = await page.evaluate(() => ({
    url: location.href,
    total: document.querySelector("[data-drill-explorer-total]")?.textContent?.trim() ?? null,
    header: document.querySelector("[data-drill-explorer-header]")?.textContent ?? null,
    note: document.querySelector("[data-drill-explorer-note]")?.textContent ?? null,
    rows: [...document.querySelectorAll("[data-matrx-drill-into]")].map((e) => e.textContent?.trim()).slice(0, 12),
  }));
  step("drilled a person", { firstPerson, ...screen });
  if (!screen.url.includes("f.person")) friction("a click on a person did not narrow to that person");

  const explain = page.locator("[data-drill-explorer-explain]");
  const explainInHeader = await page.evaluate(() => Boolean(document.querySelector("[data-drill-explorer-header] [data-drill-explorer-explain]")));
  step("Explain this in the header row", { present: await explain.count(), explainInHeader });
  if (!explainInHeader) friction("Explain this is not in the explorer's header row");
  await shot(page, "02-drilled-with-explain");

  await explain.first().click();
  // With no organization chosen, a press to SEND asks for one first (the one write helper).
  await sleep(2500);
  const asked = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll("[role=dialog]")].find((d) => /organization/i.test(d.textContent ?? ""));
    return dlg ? { text: dlg.textContent?.slice(0, 400), options: [...dlg.querySelectorAll("[role=option], button")].map((b) => b.textContent?.trim()).filter(Boolean).slice(0, 30) } : null;
  });
  step("organization question", { asked });
  await shot(page, "03a-organization-question");
  if (asked && process.env.ORG) {
    const option = page.locator("[role=dialog] [role=option], [role=dialog] button").filter({ hasText: process.env.ORG }).first();
    await option.click();
    step("organization chosen", { org: process.env.ORG });
  }
  const opened = await until("Alchemy workspace", async () => page.evaluate(() => {
    const text = document.body.innerText;
    return /PREVIEW|Preview/.test(text) && /Prepare /.test(text) ? true : null;
  }), 30000);
  await sleep(1500);
  step("Alchemy opened", { ms: opened.ms, ok: Boolean(opened.v) });
  if (!opened.v) friction("Explain this did not open the Alchemy workspace");
  await shot(page, "03-alchemy-workspace");

  // Read back what the workspace holds: the preview, and the "For AI" copy of it.
  const preview = await page.evaluate(() => {
    const pre = [...document.querySelectorAll("pre, textarea, [class*='matrx-alchemy'] code")].map((e) => (e.value ?? e.textContent ?? "")).sort((a, b) => b.length - a.length)[0] ?? "";
    return pre;
  });
  let payload = null;
  try {
    const fenced = preview.match(/```json\n([\s\S]*?)\n```/);
    const body = fenced ? fenced[1] : preview.slice(preview.indexOf("{"), preview.lastIndexOf("}") + 1);
    payload = JSON.parse(body);
  } catch {
    payload = null;
  }
  writeFileSync(`${SHOTS}/workspace-preview.txt`, preview);
  // Read back exactly what "Copy for AI" would hand over (the clipboard only; nothing is sent).
  const copyForAi = page.getByRole("button", { name: /^Copy for AI$|Copy prepared output/ }).last();
  if (await copyForAi.count()) {
    await copyForAi.click().catch(() => {});
    await sleep(800);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
    if (clip) {
      writeFileSync(`${SHOTS}/copy-for-ai.txt`, clip);
      const m = clip.match(/```json\n([\s\S]*?)\n```/);
      let full = null;
      try { full = m ? JSON.parse(m[1]) : null; } catch { full = null; }
      step("Copy for AI read back", { chars: clip.length, envelope: clip.slice(0, 140), parsed: Boolean(full), groups: full?.answer?.groups?.map((g) => g.Provider ?? g.group), total: full?.answer?.total, coverage: full?.answer?.coverage, trail: full?.question?.trail, window: full?.question?.window });
      if (full) payload = full;
      if (!full) friction("the Copy for AI text does not carry the question + answer JSON");
    }
  }

  const checks = payload
    ? {
        screen: payload.screen,
        sentence: payload.question?.sentence,
        trail: payload.question?.trail,
        group_by: payload.question?.group_by,
        window: payload.question?.window?.label,
        measures: payload.question?.measures?.map((m) => m.label),
        total: payload.answer?.total,
        coverage: payload.answer?.coverage,
        groups: payload.answer?.groups?.length,
        first_group: payload.answer?.groups?.[0],
        counted_through: payload.answer?.counted_through,
        address: payload.address,
      }
    : null;
  step("read back from the workspace", { chars: preview.length, parsed: Boolean(payload), ...(checks ?? {}) });
  if (!payload) friction("the workspace preview is not the question + answer JSON");
  else {
    if (!payload.question?.trail?.some((c) => c.value === firstPerson)) friction(`the trail in the payload does not name ${firstPerson}`);
    const shownTotal = screen.total;
    const cost = payload.answer?.total?.measures && Object.entries(payload.answer.total.measures).find(([k]) => /cost/i.test(k))?.[1];
    step("total on screen vs in payload", { screen: shownTotal, payload: cost?.shown });
    if (cost && shownTotal && !shownTotal.includes(cost.shown.replace(/ credits$/, "").trim())) friction("the payload's total is not the total on screen");
    if (!payload.answer?.coverage) friction("the coverage is missing after a drill");
    if (screen.rows.length && payload.answer?.groups?.length) {
      const names = payload.answer.groups.map((g) => Object.values(g)[0]);
      step("groups on screen vs in payload", { screen: screen.rows.slice(0, 6), payload: names.slice(0, 6) });
    }
  }

  // The "Continue with AI" destinations are offered (never pressed): the workspace's
  // "Use prepared content · N destinations" group lists them; open it, read the rows, close it.
  const destInfo = await page.evaluate(() => {
    const d = document.querySelector("details.matrx-alchemy-destinations");
    if (!d) return { group: false, rows: [] };
    d.open = true;
    return { group: true, summary: d.querySelector("summary")?.textContent ?? null, rows: [...d.querySelectorAll("button")].map((b) => b.textContent?.trim() ?? "") };
  });
  const orgState = await page.evaluate(() => {
    const s = window.__NEXT_REDUX_STORE__?.getState?.() ?? null;
    return s ? { org: s.appContext?.organization_id ?? null } : { org: "unknown (store not exposed)" };
  });
  await sleep(400);
  await shot(page, "03b-alchemy-destinations");
  const destinations = destInfo.rows.filter((t) => /new chat|assistant window|connected tools/i.test(t));
  step("Continue with AI offered (not pressed)", { ...destInfo, orgState });
  if (destinations.length === 0) friction("no Continue-with-AI destination is offered in the workspace");

  // For AI envelope: switch "Copy as" to For AI if offered and read the envelope's head.
  const forAi = page.getByRole("radio", { name: /For AI/i }).first();
  if (await forAi.count()) {
    await forAi.click().catch(() => {});
    await sleep(800);
    const head = await page.evaluate(() => {
      const pre = [...document.querySelectorAll("pre, textarea")].map((e) => e.value ?? e.textContent ?? "").sort((a, b) => b.length - a.length)[0] ?? "";
      return pre.slice(0, 900);
    });
    writeFileSync(`${SHOTS}/workspace-for-ai-head.txt`, head);
    step("For AI envelope", { head: head.slice(0, 400), named: head.includes("drill-answer") });
    if (!head.includes("drill-answer")) friction("the For AI envelope does not name the drill answer");
    await shot(page, "04-alchemy-for-ai");
  } else step("no For AI toggle found by role (menu shape)", {});

  step("model calls during the walk", { modelCalls });
  if (modelCalls.length) friction("a request reached a model endpoint");

  await page.keyboard.press("Escape");
  await sleep(500);
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(600);
  step("390 px", { sideways: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), explainVisible: await page.locator("[data-drill-explorer-explain]").first().isVisible().catch(() => false) });
  await shot(page, "05-phone");
  await context.close();
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk.json`, JSON.stringify(out, null, 2));
  await browser.close();
  console.log(`frictions: ${out.frictions.length}, console errors: ${out.console_errors.length}`);
}

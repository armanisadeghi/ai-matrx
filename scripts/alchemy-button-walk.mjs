// LANE ALCHEMY-BUTTON — headless proof on the shared preview that the context inspector and a
// data-v2 table page hand their page, selection and data to the Alchemy menu. Seat:
// admin@admin.com through the login form (credentials from .env.local, never printed).
// Read-only: every click is a selection or a copy.
//
// Usage: node scripts/alchemy-button-walk.mjs <outDir> [tableId]
//        ALCHEMY_PHASE=2 node scripts/alchemy-button-walk.mjs <outDir> <tableId> <fileId>
// Phase 2 (lane ALCHEMY-2): numbered captures proving the request ledger (the compare call,
// then a refused write with its sentence), the table page's "with records" copy, the admin
// debug panel's Copy Full Context with debug mode off, and schedules / file page / Context
// Switcher. The one write attempt is refused by the server BEFORE any SQL runs (an insert
// naming a column that does not exist), so nothing can land.
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.ALCHEMY_ORIGIN ?? "http://alchemy.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";
const TABLE = process.argv[3] ?? null;
const FILE = process.argv[4] ?? null;
const PHASE = process.env.ALCHEMY_PHASE ?? "1";
mkdirSync(OUT, { recursive: true });
const PICKS = [
  { column: 1, label: "Castellano & Reyes, LLP" },
  { column: 2, label: "Clients" },
  { column: 3, label: "Meridian Risk Services" },
  { column: 4, label: "Contact Phone" },
];

const browser = await chromium.launch({ headless: true });
const report = { steps: [], consoleErrors: [] };
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
// Headless Chromium's clipboard is not reliable under load; record every write the page makes
// (the menu's copy goes through navigator.clipboard.writeText or a ClipboardItem).
await context.addInitScript(() => {
  window.__copied = [];
  const c = navigator.clipboard;
  const ex = document.execCommand.bind(document);
  document.execCommand = (cmd, ...rest) => {
    if (cmd === "copy") { const sel = String(document.getSelection() ?? ""); const ta = document.activeElement; window.__copied.push(ta && "value" in ta ? ta.value : sel); }
    return ex(cmd, ...rest);
  };
  if (c) {
    const w = c.writeText?.bind(c);
    c.writeText = async (t) => { window.__copied.push(String(t)); try { await w?.(t); } catch {} };
    const wr = c.write?.bind(c);
    c.write = async (items) => {
      for (const it of items) {
        for (const type of it.types) {
          if (type === "text/plain") window.__copied.push(await (await it.getType(type)).text());
        }
      }
      try { await wr?.(items); } catch {}
    };
  }
});
const page = await context.newPage();
page.on("pageerror", (e) => report.consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`));

/** Open the page's Alchemy menu and copy one AI variant; returns the clipboard text. */
async function copyVariant(label, hostSelector = "[data-page-capture]", pick = "first") {
  const all = page.locator(hostSelector);
  const host = pick === "last" ? all.last() : all.first();
  await until("capture control", async () => (await host.count()) > 0, 120000);
  const buttons = host.locator("button");
  const names = [];
  for (let i = 0; i < (await buttons.count()); i++) names.push(await buttons.nth(i).getAttribute("aria-label"));
  report.steps.push({ controls: names });
  // The AI menu is the trigger whose name mentions AI.
  let trigger = null;
  for (let i = 0; i < (await buttons.count()); i++) {
    const n = (names[i] ?? "").toLowerCase();
    if (n.includes("ai")) trigger = buttons.nth(i);
  }
  if (!trigger) trigger = buttons.last();
  await page.evaluate(() => { window.__copied = []; });
  await trigger.click();
  const item = page.locator(`[role=menu] :text-is("${label}"), [data-radix-popper-content-wrapper] :text-is("${label}")`).first();
  const { v: shown } = await until(`menu item ${label}`, async () => (await item.count()) > 0, 20000);
  if (!shown) {
    // A dev-server reload (another lane's edit) can land mid-walk; the address carries the
    // selection, so reopening it restores the same page. Bounded, and said in the report.
    await page.screenshot({ path: `${OUT}/retry-${copyVariant.tries ?? 0}.png` }).catch(() => undefined);
    report.steps.push({ retried: `menu item "${label}" not shown; reopening ${page.url().replace(ORIGIN, "")}` });
    if ((copyVariant.tries = (copyVariant.tries ?? 0) + 1) > 4) throw new Error(`no menu item "${label}"`);
    await page.goto(page.url(), { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForTimeout(8000);
    return copyVariant(label, hostSelector, pick);
  }
  await item.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/after-copy-${label.replace(/\W+/g, "-")}.png` }).catch(() => undefined);
  report.steps.push({ toasts: await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []) });
  const { v: text } = await until("clipboard", async () => {
    const t = await page.evaluate(() => (window.__copied ?? []).at(-1) ?? null);
    return t && t.length > 20 ? t : null;
  }, 30000);
  await page.keyboard.press("Escape").catch(() => undefined);
  return text;
}

const save = (name, heading, how, text) => {
  writeFileSync(`${OUT}/${name}`, `# ${heading} (lane ALCHEMY-2, 2026-09-25)\n\n${how}\n\n` + "````text\n" + (text ?? "(nothing copied)") + "\n````\n");
  report.files = [...(report.files ?? []), { name, chars: text?.length ?? 0 }];
};
const requestsAttr = (t) => t?.match(/requests="(\d+)"/)?.[1] ?? null;

async function openInspectorAndCompare() {
  await page.goto(`${ORIGIN}/administration/scopes-context/context-inspector`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("[data-context-inspector]", { timeout: 240000 });
  const dismiss = page.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) await dismiss.click();
  const column = (n) => page.locator("[data-context-inspector] .min-w-\\[560px\\] > div").nth(n - 1);
  const row = (n, label) => column(n).locator("button[aria-pressed]", { hasText: label }).first();
  for (const p of PICKS) {
    await until(`${p.label} row`, async () => (await row(p.column, p.label).count()) > 0, 120000);
    await row(p.column, p.label).click({ timeout: 180000 });
    await page.waitForTimeout(500);
  }
  await until("compare", async () =>
    (await page.locator("[data-compare-side]").count()) >= 2 || (await page.locator("text=Comparison unavailable").count()) > 0, 180000);
  await page.waitForTimeout(2000);
}

const FROM = Number(process.env.ALCHEMY_FROM ?? "1");
async function phaseTwo() {
  // ── 01. A capture after a compare lists the compare request. ──
  if (FROM <= 3) {
  await openInspectorAndCompare();
  const c1 = await copyVariant("Everything on this page");
  report.inspector = { requests: requestsAttr(c1), listsCompare: /\/context\/(preview|compare)|context-preview|compare/i.test(c1?.split("Recent requests")[1] ?? c1 ?? "") };
  save("01-inspector-after-compare.md", "Context inspector after a compare — the capture lists the request",
    `Copied headless as admin@admin.com from ${page.url().replace(ORIGIN, "")} after ${PICKS.map((p) => p.label).join(" → ")}, Alchemy menu → "Everything on this page". Before this lane every capture said requests="0".`, c1);

  // ── 02. A refused write, then the capture lists it first with the server's sentence. ──
  report.refusedWrite = await page.evaluate(async (tableId) => {
    const slot = globalThis[Symbol.for("ai-matrx.data.next.browser-client")];
    if (!slot?.client) return { error: "the app's browser client slot is empty" };
    const { error, status } = await slot.client.schema("custom").from("record")
      .insert({ table_id: tableId, alchemy_probe_column_that_does_not_exist: "refused on purpose" });
    return { status, code: error?.code ?? null, message: error?.message ?? null };
  }, TABLE);
  await page.waitForTimeout(1000);
  const c2 = await copyVariant("Everything on this page");
  const reqPart = c2?.slice(c2.indexOf('"requests"')) ?? "";
  report.refusedInCapture = { requests: requestsAttr(c2), sentenceShown: !!report.refusedWrite?.message && (c2 ?? "").includes(report.refusedWrite.message.slice(0, 40)) , firstRequestIsTheRefusal: /"log":\s*\[\s*\{[^}]*"method":\s*"POST"[^}]*"path":\s*"\/rest\/v1\/record/.test(reqPart) };
  save("02-refused-write-listed-first.md", "A refused write — listed first in the capture with the server's sentence",
    `On the same inspector page the app's own browser client (the one every screen uses) attempted an insert into custom.record naming a column that does not exist, so PostgREST refused it before any SQL ran: ${JSON.stringify(report.refusedWrite)}. Then the Alchemy menu → "Everything on this page".`, c2);

  // ── 03. The table page, "Everything, with records" (capped and stated). ──
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await until("table page", async () => (await page.locator("[data-page-capture]").count()) > 0, 240000);
  await page.waitForTimeout(5000);
  const c3 = await copyVariant("Everything, with records");
  const m = c3?.match(/"count":\s*(\d+),\s*"limit":\s*(\d+),\s*"more_may_exist":\s*(true|false)/);
  report.tableWithRecords = m ? { count: +m[1], limit: +m[2], more_may_exist: m[3] === "true" } : { found: false };
  save("03-table-with-records.md", "Data table page — \"Everything, with records\"",
    `Copied headless as admin@admin.com from ${page.url().replace(ORIGIN, "")} (admin@admin.com's own table), Alchemy menu → "Everything, with records". The records section states its count, its cap and whether more may exist.`, c3);
  }

  // ── 04. The admin debug panel's Copy Full Context, debug mode OFF. The indicator lives only
  // inside the admin section, so this runs on the context inspector after a compare. ──
  if (FROM <= 4) {
  await openInspectorAndCompare();
  const debugToggle = page.locator('button[title="Toggle Debug Mode"]');
  if ((await debugToggle.count()) === 0) {
    await page.locator('button[aria-label="Show admin indicator"]').first().click({ timeout: 30000, force: true });
    const { v: shown } = await until("admin chip", async () => (await debugToggle.count()) > 0, 30000);
    if (!shown) throw new Error("the admin indicator did not open from the sidebar toggle");
  }
  const debugOn = /text-green-400/.test((await debugToggle.first().getAttribute("class")) ?? "");
  if (debugOn) await debugToggle.first().click();
  report.debugModeWasOn = debugOn;
  report.debugModeNow = /text-green-400/.test((await debugToggle.first().getAttribute("class")) ?? "") ? "on" : "off";
  await debugToggle.first().locator("xpath=following-sibling::button[1]").click(); // small → medium
  await page.waitForTimeout(800);
  const sizeUp = page.locator("svg.lucide-move").first().locator("xpath=ancestor::div[contains(@class,'cursor-move')][1]/following-sibling::button[2]");
  await until("medium indicator", async () => (await sizeUp.count()) > 0, 20000);
  await sizeUp.click(); // medium → large
  const copyFull = page.locator("div", { hasText: /^Copy Full Context$/ }).locator("xpath=ancestor::div[contains(@class,'justify-between')][1]//button").first();
  await until("Copy Full Context", async () => (await copyFull.count()) > 0, 30000);
  await page.evaluate(() => { window.__copied = []; });
  await copyFull.click();
  const { v: c4 } = await until("full context", async () => (await page.evaluate(() => (window.__copied ?? []).at(-1) ?? null)), 20000);
  report.copyFullContext = { hasPageCapture: (c4 ?? "").includes("## Page capture"), debugMode: report.debugModeNow };
  save("04-copy-full-context-debug-off.md", "Admin debug panel — Copy Full Context with debug mode off",
    `On ${page.url().replace(ORIGIN, "")} with debug mode ${report.debugModeNow} (it was ${debugOn ? "on and switched off" : "already off"}), admin chip → large panel → Copy Full Context.`, c4);
  if (debugOn) await debugToggle.first().click().catch(() => undefined);
  await page.keyboard.press("Escape").catch(() => undefined);
  }

  // ── 05. /schedules. ──
  await page.goto(`${ORIGIN}/schedules`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForTimeout(6000);
  const c5 = await copyVariant("Everything on this page");
  save("05-schedules.md", "Schedules page", `Copied headless as admin@admin.com from /schedules, Alchemy menu → "Everything on this page".`, c5);

  // ── 06. A file page (admin@admin.com's own file). ──
  if (FILE) {
    await page.goto(`${ORIGIN}/files/f/${FILE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForTimeout(6000);
    const c6 = await copyVariant("Everything on this page");
    save("06-file-page.md", "File page", `Copied headless as admin@admin.com from /files/f/${FILE} (their own file), Alchemy menu → "Everything on this page".`, c6);
  }

  // ── 07. The Context Switcher window. ──
  await page.goto(`${ORIGIN}/administration/ui/official-components/miller-columns-context-picker`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const openBtn = page.getByRole("button", { name: "Open full WindowPanel" });
  await openBtn.waitFor({ state: "visible", timeout: 240000 });
  await openBtn.click();
  await page.waitForTimeout(6000);
  const c7 = await copyVariant("Everything on this page", '[data-page-capture="window"], [data-page-capture]', "last");
  save("07-context-switcher-window.md", "Context Switcher window", `Copied headless as admin@admin.com: opened the Context Switcher window, its Alchemy menu → "Everything on this page".`, c7);
}

try {
  report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");

  if (PHASE === "2") {
    await phaseTwo();
  } else {
  // ── 1. The inspector after the four picks. ──
  await page.goto(`${ORIGIN}/administration/scopes-context/context-inspector`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("[data-context-inspector]", { timeout: 240000 });
  const dismiss = page.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) await dismiss.click();
  const column = (n) => page.locator("[data-context-inspector] .min-w-\\[560px\\] > div").nth(n - 1);
  const row = (n, label) => column(n).locator("button[aria-pressed]", { hasText: label }).first();
  for (const p of PICKS) {
    await until(`${p.label} row`, async () => (await row(p.column, p.label).count()) > 0, 120000);
    await row(p.column, p.label).click({ timeout: 180000 });
    await page.waitForTimeout(500);
  }
  await until("compare", async () =>
    (await page.locator("[data-compare-side]").count()) >= 2 || (await page.locator("text=Comparison unavailable").count()) > 0, 180000);
  await page.screenshot({ path: `${OUT}/1-inspector-after-picks.png`, fullPage: true, timeout: 90000 }).catch(() => undefined);
  report.inspectorUrl = page.url().replace(ORIGIN, "");
  const inspector = await copyVariant("Everything on this page");
  writeFileSync(`${OUT}/inspector-capture.md`,
    `# Context inspector — Alchemy capture (lane ALCHEMY-BUTTON, 2026-09-25)\n\n` +
    `Copied headless as admin@admin.com from ${report.inspectorUrl} after picking ` +
    `${PICKS.map((p) => p.label).join(" → ")}, with the page's Alchemy menu → "Everything on this page".\n\n` +
    "````text\n" + inspector + "\n````\n");
  report.inspectorChars = inspector?.length ?? 0;

  // ── 2. A data-v2 table page (read-only; the quick copy reads no records). ──
  if (TABLE) {
    await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await until("table page", async () => (await page.locator("[data-page-capture]").count()) > 0, 240000);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/2-table-page.png`, fullPage: false, timeout: 90000 }).catch(() => undefined);
    report.tableUrl = page.url().replace(ORIGIN, "");
    const table = await copyVariant("Everything on this page");
    writeFileSync(`${OUT}/table-capture.md`,
      `# Data table page — Alchemy capture (lane ALCHEMY-BUTTON, 2026-09-25)\n\n` +
      `Copied headless as admin@admin.com from ${report.tableUrl} with the page's Alchemy menu → ` +
      `"Everything on this page" (the quick copy: it reads no records; "Everything, with records" would).\n\n` +
      "````text\n" + table + "\n````\n");
    report.tableChars = table?.length ?? 0;
  }
  }
} catch (e) {
  report.error = String(e).slice(0, 500);
  await page.screenshot({ path: `${OUT}/error.png`, fullPage: false }).catch(() => undefined);
} finally {
  writeFileSync(`${OUT}/walk-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

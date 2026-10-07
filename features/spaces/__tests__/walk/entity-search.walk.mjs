// Built-in table search (round 30, item 1a/1b): CLS across a magnifier search and the rows it answers.
// Types only into the table's own search field (never the page). Exit 1 when CLS > 0.01 or a row shown
// does not contain the term.
//   node features/spaces/__tests__/walk/entity-search.walk.mjs [pageId] [blockTitle] [term]
import { open, originOf } from "./lib.mjs";

const id = process.argv[2] ?? "68c01737-ede8-4ec6-b963-3cf0554266e1";
const title = process.argv[3] ?? "Tasks";
const term = process.argv[4] ?? "Dropbox";
const { browser, context, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
await context.addInitScript(() => {
  window.__cls = { total: 0, entries: [], on: false };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (!window.__cls.on || e.hadRecentInput) continue;
      window.__cls.total += e.value;
      const name = (n) => (n ? `${n.tagName}.${String(n.className?.baseVal ?? n.className ?? "").split(" ").filter(Boolean).slice(0, 3).join(".")}` : "?");
      window.__cls.entries.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: (e.sources ?? []).slice(0, 4).map((s) => ({ n: name(s.node), from: [Math.round(s.previousRect.x), Math.round(s.previousRect.y), Math.round(s.previousRect.width), Math.round(s.previousRect.height)], to: [Math.round(s.currentRect.x), Math.round(s.currentRect.y), Math.round(s.currentRect.width), Math.round(s.currentRect.height)] })) });
    }
  }).observe({ type: "layout-shift", buffered: true });
});
const drills = [];
page.on("response", async (r) => {
  if (!/drill|rpc/.test(r.url())) return;
  const body = await r.text().catch(() => "");
  if (body.includes(term)) drills.push({ url: r.url().slice(0, 140), len: body.length });
});
await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
const frame = page.locator(".spaces-db-frame[data-source=entity]").filter({ has: page.locator(".spaces-db-title", { hasText: new RegExp(`^${title}$`) }) }).first();
await frame.waitFor({ timeout: 120_000 });
await frame.scrollIntoViewIfNeeded();
await page.waitForTimeout(Number(process.env.WAIT ?? 10000));
const before = await frame.locator("tbody tr").count();
await page.evaluate(() => { window.__cls.on = true; });
await frame.getByRole("button", { name: "Search", exact: true }).click();
await page.waitForTimeout(1500);
const afterOpen = await page.evaluate(() => window.__cls.total);
await frame.getByRole("searchbox", { name: "Search this database" }).pressSequentially(term, { delay: 60 });
await page.waitForTimeout(6000);
const cls = await page.evaluate(() => window.__cls);
const rows = await frame.locator("tbody tr").allInnerTexts();
const off = rows.filter((t) => !t.toLowerCase().includes(term.toLowerCase()));
// 1b: every OTHER table on the page keeps its own rows (a search is one block's, never the page's).
const others = await page.locator(".spaces-db-frame").evaluateAll((fs, t) => fs.map((f) => ({ title: f.querySelector(".spaces-db-title")?.textContent?.trim(), src: f.dataset.source ?? "custom", rows: f.querySelectorAll("tbody tr").length, searched: !!f.querySelector("input[type=search]") })).filter((f) => f.title !== t), title);
const count = await frame.locator(".spaces-entity-count").innerText().catch(() => "");
await page.screenshot({ path: process.env.SHOT ?? "/tmp/entity-search.png" });
console.log(JSON.stringify({ before, rows: rows.length, offTerm: off.length, count, clsOpen: +afterOpen.toFixed(4), cls: +cls.total.toFixed(4), drills: drills.length, others }));
if (process.env.VERBOSE) { for (const e of cls.entries) console.log("  ", JSON.stringify(e)); for (const t of off.slice(0, 5)) console.log("  off:", t.replace(/\s+/g, " ").slice(0, 100)); }
await browser.close();
process.exit(cls.total > 0.01 || off.length ? 1 : 0);

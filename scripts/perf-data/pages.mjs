// Page load: TTFB, LCP, time-to-rows-visible and store-call count, in headless Playwright.
import { chromium } from "playwright";
import { env, budgets } from "./lib.mjs";

const needleScript = `
  window.__perf = { lcp: 0, needleAt: null, needle: null };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  setInterval(() => {
    const p = window.__perf;
    if (p.needleAt !== null || !document.body) return;
    if (p.needle ? document.body.innerText.includes(p.needle) : document.querySelectorAll('[role="row"], tbody tr, [data-row]').length > 2) p.needleAt = performance.now();
  }, 25);
`;

export async function measurePages({ base, fixtures: fixtures0, log = console.log, settleMs = 1500 } = {}) {
  const browser = await chromium.launch({ headless: true });
  let fixtures = fixtures0;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: "matrx-perf-data/1.0 Playwright" });
  await ctx.addInitScript(needleScript);
  const page = await ctx.newPage();

  // Sign in through the form (works on the dev host and on production).
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 120000 });
  await page.fill('input[type="email"], input[name="email"]', env.AI_ADMIN_USERNAME);
  await page.fill('input[type="password"]', env.AI_ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120000 });

  const { tableId, recordId, recordTitle } = fixtures0;
  // A Space with an embedded table: try the first Spaces in the list until one reads a table.
  let spacePath = fixtures.spacePath;
  if (!spacePath) {
    await page.goto(`${base}/spaces`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector('a[href^="/spaces/"]', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^\/spaces\/[0-9a-f-]{36}/.test(h)))].slice(0, 14));
    for (const h of hrefs) {
      let reads = 0;
      const f = (req) => { if (/read_records|record_aggregate/.test(req.url())) reads++; };
      page.on("request", f);
      await page.goto(`${base}${h}`, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(7000);
      page.off("request", f);
      if (reads > 0) { spacePath = h; break; }
    }
  }
  fixtures = { ...fixtures, spacePath };
  const plan = [
    { name: "/data", path: "/data", needle: fixtures.homeNeedle },
    { name: "/data/<table> grid", path: `/data/${tableId}`, needle: recordTitle },
    { name: "/data/<table> board", path: `/data/${fixtures.boardTableId}?view=${fixtures.boardViewId ?? ""}`, needle: fixtures.boardNeedle, skip: !fixtures.boardViewId },
    { name: "record page", path: `/data/${tableId}/r/${recordId}`, needle: recordTitle },
    { name: "space with table", path: spacePath, needle: null, path: spacePath, skip: !spacePath },
  ];

  const out = [];
  for (const p of plan) {
    if (p.skip) { out.push({ page: p.name, note: "no fixture found" }); continue; }
    for (const pass of ["cold", "warm"]) {
      const calls = [];
      const onReq = (req) => { const u = req.url(); if (u.includes("/rest/v1/")) { const h = req.headers(); const schema = h["content-profile"] ?? h["accept-profile"] ?? "public"; if (schema === "custom" || schema === "platform") calls.push(u.split("/rest/v1/")[1].split("?")[0]); } };
      page.on("request", onReq);
      await page.addInitScript((needle) => { window.__needle = needle; }, p.needle);
      const t0 = Date.now();
      await page.goto(`${base}${p.path}`, { waitUntil: "commit", timeout: 180000 });
      await page.evaluate((n) => { if (window.__perf) window.__perf.needle = n; }, p.needle).catch(() => {});
      // the needle is set after commit; if the page replaced the document, set it again on the next tick
      await page.evaluate((n) => { window.__perf.needle = n; }, p.needle).catch(() => {});
      await page.waitForFunction(() => window.__perf.needleAt !== null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(settleMs);
      const m = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        return { ttfb: nav ? nav.responseStart : null, lcp: window.__perf.lcp, rows: window.__perf.needleAt, url: location.pathname };
      }).catch(() => ({}));
      page.off("request", onReq);
      const b = budgets.pages[p.name] ?? {};
      out.push({ page: p.name, pass, ttfb_ms: m.ttfb == null ? "" : Math.round(m.ttfb), lcp_ms: Math.round(m.lcp ?? 0), rows_visible_ms: m.rows == null ? "never" : Math.round(m.rows), store_calls: calls.length, calls: [...new Set(calls)].join(" "), landed: m.url, budget: b, wallMs: Date.now() - t0 });
      log(`  ${p.name} ${pass}: rows ${m.rows == null ? "never" : Math.round(m.rows)} ms, ${calls.length} store calls`);
    }
  }
  await browser.close();
  return out;
}

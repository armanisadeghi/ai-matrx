// scripts/data-home/data-home-lane-e-walk.mjs — LANE DATA-HOME-3E
//
// MEASURES the four layout/speed defects of VERIFY-DATA-HOME-3 (V2-V5) on `/data-v2?home=new`
// from a real seat (headless), and takes the named screenshots:
//   keystroke→paint  — ms from the input event to the first frame after the first row changed
//   scroll           — wheel-scroll the list (150+ rows, virtualized), longest frame gap + long tasks
//   1024             — toolbar overflow, Owner/Access header inside the viewport, sideways scroll
//   390              — rows of controls above the first card
//
//   DH_ORIGIN=http://<you>.localhost:3001 DH_SEAT=admin|member DH_EMAIL=… DH_PASSWORD=… \
//     DH_SHOTS=<dir> DH_TAG=before|after DH_SCHEME=light|dark node scripts/data-home/data-home-lane-e-walk.mjs
//
// Credentials come from the environment and are never printed. Read-only: nothing is written.
import { mkdirSync, existsSync } from "node:fs";
import { chromium } from "playwright";

import { signIn, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.DH_ORIGIN;
const SEAT = process.env.DH_SEAT ?? "admin";
const SHOTS = process.env.DH_SHOTS ?? "tmp/data-home-3e";
const TAG = process.env.DH_TAG ?? "after";
const SCHEME = process.env.DH_SCHEME ?? "light";
const ONLY = (process.env.DH_ONLY ?? "search,scroll,1024,390,1440").split(",");
const EMAIL = process.env.DH_EMAIL;
const PASSWORD = process.env.DH_PASSWORD;
const STATE = process.env.DH_STATE; // optional storage-state cache path
if (!ORIGIN || !EMAIL || !PASSWORD) throw new Error("DH_ORIGIN, DH_EMAIL and DH_PASSWORD must be set");
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const log = (k, v) => {
  out[k] = v;
  console.log(`[${SEAT} ${TAG} ${SCHEME}] ${k}: ${JSON.stringify(v)}`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: SCHEME,
  ...(STATE && existsSync(STATE) ? { storageState: STATE } : {}),
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame() && frame.url().includes("__dev-walk")) {
    void page.getByRole("button", { name: /Resume/ }).first().click({ timeout: 10000 }).catch(() => {});
  }
});

const whoami = () => page.evaluate(async () => (await (await fetch("/api/whoami")).json())?.email ?? null).catch(() => null);
await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
let who = await whoami();
if (who !== EMAIL) {
  who = await signIn(page, ORIGIN, EMAIL, PASSWORD, SEAT);
  if (STATE) await context.storageState({ path: STATE });
}
log("identity matches seat", who === EMAIL);

const ROW = "[data-row-id]:visible";
const shot = (name) => page.screenshot({ path: `${SHOTS}/${TAG}-${SEAT}-${name}-${SCHEME}.png`, fullPage: false });
const goto = async (query = "") => {
  await page.goto(`${ORIGIN}/data-v2?home=new${query}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until("rows", async () => (await page.locator(ROW).count()) > 0, 180000);
  await sleep(2500);
};

try {
  if (ONLY.includes("1440")) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await goto();
    await shot("1440-home");
  }

  if (ONLY.includes("search")) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await goto();
    const box = page.locator("[data-entity-list-search]:visible").first();
    await box.click();
    // Install the probe: input event → first change of the visible row set → next frame.
    const samples = [];
    for (const word of ["Loaner", "Exercize", "intake", "Service"]) {
      await box.fill("");
      await sleep(1500);
      for (const ch of word) {
        await page.evaluate(() => {
          const firstIds = () => [...document.querySelectorAll("[data-row-id]")].slice(0, 8).map((e) => e.getAttribute("data-row-id")).join("|");
          const before = firstIds();
          window.__dhProbe = new Promise((resolve) => {
            const input = document.querySelector("[data-entity-list-search]");
            const onInput = () => {
              input.removeEventListener("input", onInput, true);
              const t0 = performance.now();
              const done = (changed) => requestAnimationFrame(() => setTimeout(() => resolve({ ms: performance.now() - t0, changed }), 0));
              const mo = new MutationObserver(() => {
                if (firstIds() !== before) {
                  mo.disconnect();
                  clearTimeout(cap);
                  done(true);
                }
              });
              mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-row-id"] });
              const cap = setTimeout(() => {
                mo.disconnect();
                resolve({ ms: performance.now() - t0, changed: false });
              }, 1500);
            };
            input.addEventListener("input", onInput, true);
          });
        });
        await page.keyboard.type(ch);
        const r = await page.evaluate(() => window.__dhProbe);
        if (r.changed) samples.push(Math.round(r.ms));
        await sleep(60);
      }
      if (word === "Loaner") await shot("1440-search-Loaner");
    }
    samples.sort((a, b) => a - b);
    log("keystroke→paint ms (changed keystrokes)", {
      n: samples.length,
      median: samples[Math.floor(samples.length / 2)],
      p90: samples[Math.floor(samples.length * 0.9)],
      max: samples[samples.length - 1],
    });
  }

  if (ONLY.includes("scroll")) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await goto();
    // 200 per page so 150+ rows are on one page (virtualized), the person's own way: the pager's size select.
    const sizeSel = page.locator("[role=combobox]:visible", { hasText: /^\s*(25|50|100|200)\s*$/ }).last();
    await sizeSel.click();
    await page.getByRole("option", { name: "200" }).click();
    await until("200 rows", async () => (await page.getByText(/1-200 of/).count()) > 0, 60000);
    await sleep(2500);
    const res = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const longTasks = [];
      const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(Math.round(e.duration))));
      po.observe({ type: "longtask", buffered: false });
      // idle 3 s
      await sleep(3000);
      const idle = longTasks.splice(0);
      const rows = [...document.querySelectorAll("[data-row-id]")].filter((e) => e.getBoundingClientRect().height > 0);
      let el = rows[0];
      while (el && !(el.scrollHeight > el.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      if (!el) return { error: "no scroller" };
      const scrollers = [];
      for (let p = rows[0]; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 4) scrollers.push(p.tagName + "." + String(p.className).slice(0, 40));
      }
      const gaps = [];
      let last = performance.now();
      let running = true;
      const loop = () => {
        const n = performance.now();
        gaps.push(n - last);
        last = n;
        if (running) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      for (let i = 0; i < 30; i++) {
        el.dispatchEvent(new WheelEvent("wheel", { deltaY: 240, bubbles: true }));
        el.scrollTop += 240;
        await sleep(50);
      }
      for (let i = 0; i < 30; i++) {
        el.scrollTop -= 240;
        await sleep(50);
      }
      running = false;
      po.disconnect();
      const g = gaps.slice(1).sort((a, b) => b - a);
      return {
        rowsInDom: rows.length,
        scrollHeight: el.scrollHeight,
        scrollers,
        idleLongTasks: idle,
        scrollLongTasks: longTasks,
        worstFrames: g.slice(0, 5).map(Math.round),
        framesOver32: g.filter((x) => x > 32).length,
        frames: g.length,
      };
    });
    log("scroll", res);
  }

  if (ONLY.includes("1024")) {
    await page.setViewportSize({ width: 1024, height: 800 });
    await goto();
    const r = await page.evaluate(() => {
      const vw = window.innerWidth;
      const heads = [...document.querySelectorAll("th, [role=columnheader]")].map((h) => ({ t: h.textContent.trim().slice(0, 14), r: Math.round(h.getBoundingClientRect().right), l: Math.round(h.getBoundingClientRect().left) })).filter((h) => h.t);
      const box = document.querySelector("[data-entity-list-search]")?.closest("div.flex")?.getBoundingClientRect();
      const toolbar = document.querySelector("[data-entity-list-search]")?.closest("div.flex")?.parentElement;
      const overflowing = [...(toolbar?.querySelectorAll("button, [role=combobox]") ?? [])].filter((b) => b.offsetParent && b.getBoundingClientRect().right > vw + 1).map((b) => (b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 20));
      const scrollers = [...document.querySelectorAll("*")].filter((e) => e.scrollWidth > e.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.closest("main")).map((e) => `${e.tagName} ${e.scrollWidth}/${e.clientWidth}`).slice(0, 5);
      return {
        pageSideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        searchWidth: box ? Math.round(box.width) : null,
        controlsPastEdge: overflowing,
        owner: heads.find((h) => /^Owner/.test(h.t)) ?? null,
        access: heads.find((h) => /^Access/.test(h.t)) ?? null,
        headers: heads.map((h) => `${h.t}@${h.l}-${h.r}`),
        sidewaysScrollers: scrollers,
        vw,
      };
    });
    log("1024", r);
    await shot("1024-home");
  }

  if (ONLY.includes("390")) {
    await page.setViewportSize({ width: 390, height: 844 });
    await goto();
    const r = await page.evaluate(() => {
      const first = [...document.querySelectorAll("[data-row-id]")].find((e) => e.getBoundingClientRect().height > 0);
      const firstTop = first ? first.getBoundingClientRect().top : null;
      const main = document.querySelector("main") ?? document.body;
      const controls = [...main.querySelectorAll("button, input, [role=combobox], [role=tab], select")].filter((e) => {
        if (!e.offsetParent) return false;
        const b = e.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return false;
        if (e.closest("[data-row-id]")) return false;
        return firstTop !== null && b.bottom <= firstTop + 1 && b.top >= 0;
      });
      // A "row" = a band of controls whose vertical centres lie within 12 px.
      const centres = controls.map((e) => {
        const b = e.getBoundingClientRect();
        return Math.round(b.top + b.height / 2);
      }).sort((a, b) => a - b);
      const bands = [];
      for (const c of centres) if (!bands.length || c - bands[bands.length - 1] > 12) bands.push(c);
      return {
        firstCardTop: firstTop === null ? null : Math.round(firstTop),
        controlBands: bands,
        labels: controls.map((e) => (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim().slice(0, 18)),
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    log("390", r);
    await shot("390-home");
  }
} finally {
  log("console errors", consoleErrors.length);
  await browser.close();
}

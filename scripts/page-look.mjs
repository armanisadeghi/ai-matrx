#!/usr/bin/env node
/**
 * page-look — look at a page the way the page-pass checklist does, headless:
 * desktop 1280×800 and phone 375×812, each in light and dark, signed in as the
 * test admin. Writes four screenshots plus `look.json` with the measurable
 * findings, so a worker (step 1 "Look first", step 5 "Prove it live") and an
 * independent reviewer see the same evidence without a dev server.
 *
 * The measurements are EVIDENCE, never a verdict — every one is a place to
 * look, and the page-pass rules decide:
 *   - consoleErrors / pageErrors / failedRequests (HTTP >= 400)
 *   - underHeader: visible text or controls that sit under the glass header at
 *     rest (scroll 0) — core 3 "nothing sits under the header"
 *   - firstScreen: how much of the first viewport holds content, and the
 *     largest empty vertical band — core 3 "no wasted space"
 *   - headings: every h1/h2 in the body, and the text right under the page
 *     title — core 3 "the title stands alone"
 *   - smallText: visible text under 12px that is not an all-caps label — core 5
 *   - emoji: emoji characters in visible text — core 5
 *   - smallTargets (phone): buttons/links smaller than 44px — core 4
 *   - horizontalOverflow (phone): the page scrolls sideways — core 4
 *
 * Usage:
 *   pnpm page:look --route /education/flashcards [--route /x/<id>] \
 *     [--base https://aimatrx.com] [--out <dir>] [--commit <sha>] [--settle 6000]
 *
 * --base defaults to https://aimatrx.com (no dev server needed); a local
 * preview works too (http://<session>.localhost:3001 — sign in there first with
 * `pnpm dev-login`, or pass --login-url). --commit exits 3 when the deployment
 * at --base does not contain that commit yet. Credentials: AI_ADMIN_USERNAME /
 * AI_ADMIN_PASSWORD from the environment, else read from .env.local (never
 * printed). Parallel runs: give each its own TMPDIR (the browser profile lives
 * there).
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

function fail(message, code = 1) {
  console.error(`[page-look] ${message}`);
  process.exit(code);
}

// ── options ───────────────────────────────────────────────────────────────
const opts = { routes: [], base: "https://aimatrx.com", out: null, commit: null, settle: 6000, loginUrl: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  const v = argv[i + 1];
  if (a === "--route") (opts.routes.push(v), (i += 1));
  else if (a === "--base") ((opts.base = v.replace(/\/$/, "")), (i += 1));
  else if (a === "--out") ((opts.out = v), (i += 1));
  else if (a === "--commit") ((opts.commit = v), (i += 1));
  else if (a === "--settle") ((opts.settle = Number(v)), (i += 1));
  else if (a === "--login-url") ((opts.loginUrl = v), (i += 1));
  else fail(`unknown argument ${a}`);
}
if (!opts.routes.length) fail("pass at least one --route");
opts.out ??= path.join(os.tmpdir(), "page-look", String(Date.now()));
mkdirSync(opts.out, { recursive: true });

// ── credentials (never printed) ───────────────────────────────────────────
for (const file of [".env.local", ".env"]) {
  if (process.env.AI_ADMIN_USERNAME && process.env.AI_ADMIN_PASSWORD) break;
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(AI_ADMIN_USERNAME|AI_ADMIN_PASSWORD)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// ── deployment check ──────────────────────────────────────────────────────
if (opts.commit) {
  let deployed;
  try {
    deployed = (await (await fetch(`${opts.base}/api/version`)).json()).commit;
  } catch (error) {
    fail(`could not read ${opts.base}/api/version: ${error?.message ?? error}`);
  }
  if (!deployed) fail(`${opts.base}/api/version reported no commit`);
  const git = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    git(`git cat-file -e ${deployed}^{commit}`);
  } catch {
    try {
      git("git fetch -q origin main");
    } catch {
      /* ancestry check below reports it */
    }
  }
  try {
    git(`git merge-base --is-ancestor ${opts.commit} ${deployed}`);
  } catch {
    fail(`${opts.base} is at ${deployed.slice(0, 10)}, which does not contain ${opts.commit} yet — wait for the release and run again`, 3);
  }
}

// ── browser ───────────────────────────────────────────────────────────────
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  fail("playwright-core is not installed — run `pnpm install --frozen-lockfile`");
}
const executablePath = ["/opt/pw-browsers/chromium", process.env.SURFACE_PROBE_CHROMIUM].filter(Boolean).find((p) => existsSync(p));
const host = new URL(opts.base).host.replace(/[^a-z0-9.-]/gi, "_");
const profileDir = path.join(os.tmpdir(), "page-look-profiles", host);
mkdirSync(profileDir, { recursive: true });
const isLocal = /\.localhost(:\d+)?$|\/\/localhost(:\d+)?$|127\.0\.0\.1/.test(opts.base);

const VIEWS = [
  { name: "desktop", width: 1280, height: 800, mobile: false },
  { name: "phone", width: 375, height: 812, mobile: true },
];

// Runs in the browser: every measurement the checklist can use as evidence.
function measure(isPhone) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cssHeader = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--shell-header-h")) || 0;
  const headerEl = document.querySelector("header");
  const headerBottom = Math.max(cssHeader, headerEl ? headerEl.getBoundingClientRect().bottom : 0);
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  };
  const describe = (el) => {
    const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
    return `${el.tagName.toLowerCase()}${t ? ` "${t}"` : ""}`;
  };
  const inHeader = (el) => headerEl && headerEl.contains(el);
  const main = document.querySelector("main") || document.body;

  // Things under the glass header at rest.
  const underHeader = [];
  if (headerBottom > 0) {
    for (const el of main.querySelectorAll("button, a, input, textarea, select, [role=button], h1, h2, h3, p, label")) {
      if (inHeader(el) || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top < headerBottom - 2 && r.bottom > 0) underHeader.push(`${describe(el)} top=${Math.round(r.top)} header=${Math.round(headerBottom)}`);
      if (underHeader.length >= 15) break;
    }
  }

  // First-screen use: which horizontal bands of the viewport below the header hold content.
  const rows = new Array(Math.ceil(vh)).fill(false);
  for (const el of main.querySelectorAll("*")) {
    if (el.children.length && !["BUTTON", "A", "INPUT", "TEXTAREA", "IMG", "SVG", "CANVAS", "VIDEO", "TABLE"].includes(el.tagName)) {
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) continue;
    }
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    for (let y = Math.max(Math.floor(headerBottom), Math.floor(r.top)); y < Math.min(vh, Math.ceil(r.bottom)); y += 1) rows[y] = true;
  }
  let largestEmptyBand = 0;
  let run = 0;
  let used = 0;
  for (let y = Math.floor(headerBottom); y < vh; y += 1) {
    if (rows[y]) {
      used += 1;
      run = 0;
    } else {
      run += 1;
      largestEmptyBand = Math.max(largestEmptyBand, run);
    }
  }
  const available = Math.max(1, vh - Math.floor(headerBottom));

  // Headings and the text right under the page title.
  const headings = [...main.querySelectorAll("h1, h2")].filter(visible).slice(0, 8).map((h) => `${h.tagName.toLowerCase()} "${h.textContent.trim().slice(0, 60)}"`);
  const titleEl = (headerEl && headerEl.querySelector("h1, [data-page-title]")) || main.querySelector("h1");
  let underTitle = null;
  if (titleEl) {
    const next = titleEl.nextElementSibling || titleEl.parentElement?.nextElementSibling;
    if (next && visible(next) && next.tagName === "P") underTitle = next.textContent.trim().slice(0, 120);
  }

  // Small text and emoji in visible text.
  const smallText = [];
  const emoji = [];
  const emojiRe = /\p{Extended_Pictographic}/u;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent.trim();
    if (!text || !node.parentElement || !visible(node.parentElement)) continue;
    const s = getComputedStyle(node.parentElement);
    const size = parseFloat(s.fontSize);
    const allCaps = s.textTransform === "uppercase" || text === text.toUpperCase();
    if (size < 12 && !allCaps && smallText.length < 12) smallText.push(`${size}px "${text.slice(0, 40)}"`);
    if (emojiRe.test(text) && emoji.length < 10) emoji.push(text.slice(0, 40));
  }

  // Phone: finger-sized targets and sideways scroll.
  const smallTargets = [];
  if (isPhone) {
    for (const el of document.querySelectorAll("button, a[href], [role=button], input:not([type=hidden]), select")) {
      if (!visible(el) || el.closest("[data-touch-exempt]")) continue;
      const r = el.getBoundingClientRect();
      if ((r.height < 44 || r.width < 44) && smallTargets.length < 15) smallTargets.push(`${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  return {
    headerBottom: Math.round(headerBottom),
    underHeader,
    firstScreen: { usedPct: Math.round((used / available) * 100), largestEmptyBandPx: largestEmptyBand },
    headings,
    underTitle,
    smallText,
    emoji,
    smallTargets,
    horizontalOverflow: document.documentElement.scrollWidth > vw + 1,
    title: document.title,
  };
}

const report = { base: opts.base, at: new Date().toISOString(), routes: [] };
const context = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  args: ["--no-sandbox"],
  ...(executablePath ? { executablePath } : {}),
});
const page = context.pages()[0] ?? (await context.newPage());
const consoleErrors = [];
const failedRequests = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
page.on("response", (r) => r.status() >= 400 && failedRequests.push(`${r.status()} ${r.url().replace(/\?.*$/, "").slice(0, 150)}`));

try {
  if (opts.loginUrl) {
    await page.goto(opts.loginUrl, { timeout: 600000 });
    await page.waitForTimeout(5000);
  } else if (!isLocal) {
    await page.goto(`${opts.base}/login`, { timeout: 120000 });
    await page.waitForTimeout(4000);
    if (await page.locator('input[type="email"]').count()) {
      if (!process.env.AI_ADMIN_USERNAME || !process.env.AI_ADMIN_PASSWORD) fail("AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD are not set");
      await page.fill('input[type="email"]', process.env.AI_ADMIN_USERNAME);
      await page.fill('input[type="password"]', process.env.AI_ADMIN_PASSWORD);
      await page.evaluate(() => document.querySelector("form")?.requestSubmit());
      await page.waitForFunction(() => !document.querySelector('input[type="email"]'), null, { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }

  for (const route of opts.routes) {
    const slug = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
    const entry = { route, views: {} };
    for (const view of VIEWS) {
      await page.setViewportSize({ width: view.width, height: view.height });
      for (const theme of ["light", "dark"]) {
        consoleErrors.length = 0;
        failedRequests.length = 0;
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(`${opts.base}${route}`, { timeout: 600000 });
        await page.waitForTimeout(opts.settle);
        await page.evaluate((t) => {
          document.documentElement.classList.toggle("dark", t === "dark");
          document.documentElement.classList.toggle("light", t === "light");
        }, theme);
        await page.waitForTimeout(500);
        const key = `${view.name}-${theme}`;
        const file = path.join(opts.out, `${slug}-${key}.png`);
        await page.screenshot({ path: file, animations: "disabled", timeout: 20000 }).catch(() => {});
        entry.views[key] = {
          finalUrl: page.url().replace(/\?.*$/, ""),
          screenshot: file,
          ...(await page.evaluate(measure, view.mobile)),
          consoleErrors: [...new Set(consoleErrors)].slice(0, 10),
          failedRequests: [...new Set(failedRequests)].slice(0, 10),
        };
      }
    }
    report.routes.push(entry);
  }
} finally {
  await context.close();
}

const file = path.join(opts.out, "look.json");
writeFileSync(file, JSON.stringify(report, null, 2));
for (const r of report.routes) {
  const d = r.views["desktop-light"];
  const p = r.views["phone-light"];
  console.log(
    `${r.route}: desktop used ${d.firstScreen.usedPct}% (largest empty band ${d.firstScreen.largestEmptyBandPx}px), under-header ${d.underHeader.length}, small text ${d.smallText.length}, emoji ${d.emoji.length}, console errors ${d.consoleErrors.length}; phone small targets ${p.smallTargets.length}, sideways scroll ${p.horizontalOverflow}`,
  );
}
console.log(`[page-look] ${file}`);

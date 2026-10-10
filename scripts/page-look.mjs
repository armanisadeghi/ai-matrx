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
 *   - headerPaint: the route's header title from the first painted frame on —
 *     `firstText` (what the first frame showed), `emptyFrames` (frames the
 *     header was drawn with no route content before it arrived: the ~1s
 *     title pop-in), `titleMovedPx` (how far the title moved between its
 *     first frame and the settled page) and `layoutShifts` (layout-shift
 *     entries whose sources sit in the header band). Clean = content in the
 *     first frame, 0 empty frames, 0px, no shifts.
 *
 * Usage:
 *   pnpm page:look --route /education/flashcards [--route /x/<id>] \
 *     [--base https://aimatrx.com] [--out <dir>] [--commit <sha>] [--settle 6000]
 *     [--signed-out] [--full] [--as admin|member] [--views desktop-light,phone-light]
 *
 * --as member looks as an ordinary signed-in person (AI_MEMBER_USERNAME /
 * AI_MEMBER_PASSWORD, the non-admin test account) instead of the test admin.
 * --fresh signs in with a brand-new profile: no remembered organization,
 * view preferences or layout — what a first visit looks like.
 * --org "<name>" chooses the active organization through the header picker
 * before looking (it persists in the profile; report.org says what happened).
 * --views limits the four views (faster with --full and several clicks).
 * look.json is written after every view, so an interrupted run keeps its data.
 *
 * --signed-out looks as a visitor (fresh profile, no sign-in) — promotional
 * pages and shared links. --full adds a full-page screenshot per view
 * (`*-full.png`) so everything below the fold is seen too.
 * --click '[right:]SELECTOR=>TEXT' (repeatable; `right:` right-clicks, e.g.
 * 'right:tr=>My deck' opens a row's context menu): on the desktop-light and phone-light
 * views, after the screenshot, click the first SELECTOR whose text or
 * aria-label starts with TEXT (TEXT optional), then screenshot the result
 * (`*-click-N.png`) and record new console errors — open a menu, a dialog, a
 * tab; chain steps on one load with " >> " ('right:tr=>Deck A >> [role=menuitem]=>Delete');
 * tab. Each click starts from a fresh load of the route. Never click
 * something that writes real data.
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
import { agentTrafficHeaders, markBrowserAgentTraffic } from "./lib/agent-traffic.mjs";
import { fillSecret } from "./lib/seat-browser.mjs";

const require = createRequire(import.meta.url);

function fail(message, code = 1) {
  console.error(`[page-look] ${message}`);
  process.exit(code);
}

// ── options ───────────────────────────────────────────────────────────────
const opts = { routes: [], base: "https://aimatrx.com", out: null, commit: null, settle: 8000, loginUrl: null, signedOut: false, full: false, clicks: [], as: "admin", views: null, org: null, fresh: false };
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
  else if (a === "--signed-out") opts.signedOut = true;
  else if (a === "--full") opts.full = true;
  else if (a === "--click") (opts.clicks.push(v), (i += 1));
  else if (a === "--as") ((opts.as = v), (i += 1));
  else if (a === "--org") ((opts.org = v), (i += 1));
  else if (a === "--fresh") opts.fresh = true;
  else if (a === "--views") ((opts.views = v.split(",").map((x) => x.trim())), (i += 1));
  else fail(`unknown argument ${a}`);
}
if (!opts.routes.length) fail("pass at least one --route");
opts.out ??= path.join(os.tmpdir(), "page-look", String(Date.now()));
mkdirSync(opts.out, { recursive: true });

// ── credentials (never printed) ───────────────────────────────────────────
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(AI_ADMIN_USERNAME|AI_ADMIN_PASSWORD|AI_MEMBER_USERNAME|AI_MEMBER_PASSWORD)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// ── deployment check ──────────────────────────────────────────────────────
if (opts.commit) {
  let deployed;
  try {
    deployed = (await (await fetch(`${opts.base}/api/version`, { headers: agentTrafficHeaders("page-look") })).json()).commit;
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
const profileDir = path.join(
  os.tmpdir(),
  "page-look-profiles",
  opts.signedOut || opts.fresh ? `${host}-${opts.signedOut ? "signed-out" : opts.as}-fresh-${Date.now()}` : `${host}-${opts.as}`,
);
const LOGIN = opts.as === "member"
  ? { user: process.env.AI_MEMBER_USERNAME, pass: process.env.AI_MEMBER_PASSWORD, names: "AI_MEMBER_USERNAME / AI_MEMBER_PASSWORD" }
  : { user: process.env.AI_ADMIN_USERNAME, pass: process.env.AI_ADMIN_PASSWORD, names: "AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD" };
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
  // A person's own emoji (page/callout icons, typed text) is allowed (Arman 2026-10-08): only chrome is flagged.
  const userContent = (el) => !!el.closest('[role="img"], .spaces-editor, .bn-editor, [data-user-content]');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent.trim();
    if (!text || !node.parentElement || !visible(node.parentElement)) continue;
    const s = getComputedStyle(node.parentElement);
    const size = parseFloat(s.fontSize);
    const allCaps = s.textTransform === "uppercase" || text === text.toUpperCase();
    if (size < 12 && !allCaps && smallText.length < 12) smallText.push(`${size}px "${text.slice(0, 40)}"`);
    if (emojiRe.test(text) && !userContent(node.parentElement) && emoji.length < 10) emoji.push(text.slice(0, 40));
  }
  // Emoji anywhere on the page (below the fold too), not just the viewport.
  const walkAll = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walkAll.nextNode()) {
    const node = walkAll.currentNode;
    const text = node.textContent.trim();
    const parent = node.parentElement;
    if (!text || !parent || !emojiRe.test(text) || userContent(parent)) continue;
    const st = getComputedStyle(parent);
    if (st.display === "none" || st.visibility === "hidden") continue;
    if (parent.getBoundingClientRect().width === 0) continue;
    const sample = text.slice(0, 40);
    if (!emoji.includes(sample) && emoji.length < 10) emoji.push(sample);
  }

  // Phone: finger-sized targets and sideways scroll.
  const smallTargets = [];
  if (isPhone) {
    for (const el of document.querySelectorAll("button, a[href], [role=button], input:not([type=hidden]), select")) {
      if (!visible(el) || el.closest("[data-touch-exempt]")) continue;
      const r = el.getBoundingClientRect();
      // What a finger can hit is the control's HIT AREA, not its painted box:
      // a small switch/checkbox inside (or bound to) a <label> carrying the
      // matrx-tap-area ring is hit through the label's ::before (44x44) and
      // the label's own box. Measuring the painted control reported every
      // ringed switch as a false "small target".
      const hitLabels = [
        el.closest("label"),
        ...(el.id ? document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`) : []),
      ].filter(Boolean);
      let w = r.width;
      let h = r.height;
      for (const hitLabel of hitLabels) {
        const lr = hitLabel.getBoundingClientRect();
        w = Math.max(w, lr.width);
        h = Math.max(h, lr.height);
        const ring = getComputedStyle(hitLabel, "::before");
        if (ring.content && ring.content !== "none" && ring.position === "absolute") {
          w = Math.max(w, parseFloat(ring.width) || 0);
          h = Math.max(h, parseFloat(ring.height) || 0);
        }
      }
      // The design-system control's invisible ::after ring is its hit area.
      const after = getComputedStyle(el, "::after");
      if (after.content && after.content !== "none" && after.position === "absolute") {
        w = Math.max(w, parseFloat(after.width) || 0);
        h = Math.max(h, parseFloat(after.height) || 0);
      }
      // A control that opts into `.matrx-tap-area` / a before-ring is hit through its own ::before.
      const before = getComputedStyle(el, "::before");
      if (before.content && before.content !== "none" && before.position === "absolute") {
        w = Math.max(w, parseFloat(before.width) || 0);
        h = Math.max(h, parseFloat(before.height) || 0);
      }
      if ((h < 44 || w < 44) && smallTargets.length < 15) smallTargets.push(`${describe(el)} ${Math.round(w)}x${Math.round(h)}`);
    }
  }
  // Graphics that draw nothing: an svg/canvas/img that has content but no
  // rendered width (a chart squeezed to 0 by a parent). Invisible in the
  // numbers above, so it is its own finding.
  const zeroSizeGraphics = [];
  for (const el of document.querySelectorAll("svg, canvas, img")) {
    if (el.closest("header") || el.closest("[aria-hidden='true']")) continue;
    // Deliberately hidden (display:none / visibility:hidden on it or an
    // ancestor — e.g. the shell's sidebar avatar on a phone) is not "squeezed".
    if (typeof el.checkVisibility === "function" && !el.checkVisibility({ visibilityProperty: true })) continue;
    const r = el.getBoundingClientRect();
    const intrinsic =
      el.tagName === "IMG" ? el.naturalWidth : Number(el.getAttribute("width")) || (el.tagName === "CANVAS" ? el.width : 0);
    const parent = el.parentElement?.getBoundingClientRect();
    // Only inside visible content: a graphic in a deliberately collapsed
    // panel (a closed phone sidebar) has no wide ancestor nearby.
    let inContent = false;
    for (let up = el.parentElement, depth = 0; up && depth < 5; up = up.parentElement, depth += 1) {
      if (up.getBoundingClientRect().width > 50) {
        inContent = true;
        break;
      }
    }
    if (inContent && intrinsic > 20 && (r.width < 2 || (parent && parent.width < 2)) && zeroSizeGraphics.length < 10)
      zeroSizeGraphics.push(`${el.tagName.toLowerCase()} intrinsic ${intrinsic}px drawn ${Math.round(r.width)}px (parent ${parent ? Math.round(parent.width) : "?"}px)`);
  }
  return {
    zeroSizeGraphics,
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

const report = { base: opts.base, as: opts.signedOut ? "signed-out" : opts.as, at: new Date().toISOString(), routes: [] };
const saveReport = () => writeFileSync(path.join(opts.out, "look.json"), JSON.stringify(report, null, 2));
const context = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  // Never run stale app code: no service worker, and the HTTP cache is
  // cleared below (the profile keeps only the sign-in).
  serviceWorkers: "block",
  args: ["--no-sandbox"],
  ...(executablePath ? { executablePath } : {}),
});
await markBrowserAgentTraffic(context, "page-look", opts.base);
// Header paint probe (see headerPaint above): samples the header slot — or,
// before hydration, the server-rendered ghost over it — on every frame.
await context.addInitScript(() => {
  const probe = { samples: [], shifts: [] };
  window.__pageLookHeader = probe;
  const titleBox = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement) continue;
      const r = n.parentElement.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: Math.round(r.left), y: Math.round(r.top), text: n.textContent.trim().slice(0, 40) };
    }
    return null;
  };
  const sample = () => {
    const slot = document.querySelector('[data-page-header-target="workspace"]') || document.getElementById("shell-header-center");
    if (slot) {
      const ghost = document.querySelector("matrx-header-ghost.shell-header-center");
      const src = slot.childElementCount ? slot : ghost;
      const text = src ? src.textContent.trim().replace(/\s+/g, " ").slice(0, 80) : "";
      probe.samples.push({ t: Math.round(performance.now()), text, from: slot.childElementCount ? "slot" : ghost ? "ghost" : "none", box: src ? titleBox(src) : null });
    }
    if (performance.now() < 20000 && probe.samples.length < 2000) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const inHeader = (e.sources || []).filter((s) => Math.min(s.previousRect.top, s.currentRect.top) < 64);
        if (inHeader.length) probe.shifts.push({ value: Number(e.value.toFixed(4)), nodes: inHeader.map((s) => (s.node && s.node.nodeName) || "?") });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
});
const page = context.pages()[0] ?? (await context.newPage());
try {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.clearBrowserCache");
  await cdp.detach();
} catch {
  /* a browser without CDP keeps its cache; the service-worker block still applies */
}
const consoleErrors = [];
const failedRequests = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
page.on("response", (r) => r.status() >= 400 && failedRequests.push(`${r.status()} ${r.url().replace(/\?.*$/, "").slice(0, 150)}`));

try {
  if (opts.loginUrl) {
    await page.goto(opts.loginUrl, { timeout: 600000 });
    await page.waitForTimeout(5000);
  } else if (!isLocal && !opts.signedOut) {
    await page.goto(`${opts.base}/login`, { timeout: 120000 });
    await page.waitForTimeout(4000);
    if (await page.locator('input[type="email"]').count()) {
      if (!LOGIN.user || !LOGIN.pass) fail(`${LOGIN.names} are not set (environment or .env.local)`);
      await page.fill('input[type="email"]', LOGIN.user);
      await fillSecret(page, 'input[type="password"]', LOGIN.pass);
      await page.evaluate(() => document.querySelector("form")?.requestSubmit());
      await page.waitForFunction(() => !document.querySelector('input[type="email"]'), null, { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }

  // --org: choose the active organization through the header's own picker
  // once, before looking (it persists in this profile). Most signed-in pages
  // need one; a page that shows "choose an organization" is otherwise all
  // you can see.
  if (opts.org && !opts.signedOut) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${opts.base}${opts.routes[0]}`, { timeout: 600000 });
    await page.waitForTimeout(opts.settle);
    // The header chip reads "Choose an organization" with none chosen and
    // "Workspace: <name>. Change workspace" once one is (ShellOrgSwitcher).
    const trigger = page
      .locator('button[aria-label="Choose an organization"], button[aria-label^="Workspace:"], button[aria-label="Change workspace"]')
      .first();
    const current = (await trigger.getAttribute("aria-label").catch(() => null)) ?? "";
    if (current.startsWith(`Workspace: ${opts.org}.`)) {
      report.org = `${opts.org} (already active)`;
    } else if (await trigger.count()) {
      await trigger.click();
      await page.waitForTimeout(2500);
      const option = page
        .locator("[data-radix-popper-content-wrapper] button, [data-radix-popper-content-wrapper] [role=option], [role=dialog] button")
        .filter({ hasText: opts.org })
        .first();
      if (await option.count()) {
        await option.click();
        await page.waitForTimeout(2500);
        await page.keyboard.press("Escape");
        report.org = opts.org;
      } else {
        report.org = `NOT FOUND: ${opts.org}`;
        console.error(`[page-look] organization "${opts.org}" not found in the header picker`);
      }
    } else {
      report.org = "NO PICKER in the header";
    }
  }

  for (const route of opts.routes) {
    const slug = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
    const entry = { route, views: {} };
    report.routes.push(entry);
    for (const view of VIEWS) {
      await page.setViewportSize({ width: view.width, height: view.height });
      // A phone has a coarse pointer: the design system grows a control's hit area
      // (its ::after ring) only under `@media (pointer: coarse)`, so the phone view
      // must report one or every ringed control reads as a false small target.
      try {
        const touch = (globalThis.__pageLookTouch ??= await context.newCDPSession(page));
        await touch.send("Emulation.setTouchEmulationEnabled", { enabled: Boolean(view.mobile), maxTouchPoints: view.mobile ? 5 : 0 });
        // The session stays open: detaching it would drop the emulation.
      } catch {
        /* without CDP the phone view keeps a fine pointer */
      }
      for (const theme of ["light", "dark"]) {
        if (opts.views && !opts.views.includes(`${view.name}-${theme}`)) continue;
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
        let fullFile;
        if (opts.full) {
          fullFile = file.replace(/\.png$/, "-full.png");
          // Many app pages scroll inside their own container, not the window:
          // grow the viewport to the tallest scroller's content so one shot
          // holds everything, then restore it.
          const tall = await page.evaluate(() => {
            let extra = 0;
            for (const el of document.querySelectorAll("*")) {
              const st = getComputedStyle(el);
              if (!/(auto|scroll)/.test(st.overflowY)) continue;
              extra = Math.max(extra, el.scrollHeight - el.clientHeight);
            }
            return Math.max(document.documentElement.scrollHeight, window.innerHeight + extra);
          });
          await page.setViewportSize({ width: view.width, height: Math.min(8000, Math.ceil(tall)) });
          await page.waitForTimeout(800);
          await page.screenshot({ path: fullFile, animations: "disabled", timeout: 30000 }).catch(() => {});
          await page.setViewportSize({ width: view.width, height: view.height });
        }
        const clickResults = [];
        if (theme === "light") {
          for (const [n, spec] of opts.clicks.entries()) {
            try {
              await page.goto(`${opts.base}${route}`, { timeout: 120000 });
            } catch (error) {
              clickResults.push({ click: spec, found: false, error: `reload failed: ${String(error?.message ?? error).slice(0, 160)}` });
              continue;
            }
            await page.waitForTimeout(opts.settle);
            consoleErrors.length = 0;
            // A spec may chain steps with " >> " (right-click a row, then pick
            // a menu item): every step runs on the same load, in order.
            const steps = spec.split(" >> ");
            let clicked = true;
            for (const [stepIndex, step] of steps.entries()) {
            const [selector, text = ""] = step.split("=>");
            const right = selector.startsWith("right:");
            const sel = right ? selector.slice(6) : selector;
            const box = await page.evaluate(
              ([sel, prefix]) => {
                const el = [...document.querySelectorAll(sel)].find((e) => {
                  const label = (e.getAttribute("aria-label") || e.textContent || "").trim();
                  return !prefix || label.startsWith(prefix);
                });
                if (!el) return null;
                el.scrollIntoView({ block: "center" });
                const r = el.getBoundingClientRect();
                return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 };
              },
              [sel, text.trim()],
            );
            if (!box) clicked = false;
            if (box) await page.mouse.click(box.x, box.y, { button: right ? "right" : "left" });
            if (stepIndex < steps.length - 1) await page.waitForTimeout(1500);
            }
            // Lazily loaded menus/dialogs: wait long enough that a stuck
            // "Loading…" and a slow load are different pictures; page errors
            // during the click land in consoleErrors.
            await page.waitForTimeout(3500);
            const clickFile = file.replace(/\.png$/, `-click-${n + 1}.png`);
            await page.screenshot({ path: clickFile, animations: "disabled", timeout: 20000 }).catch(() => {});
            clickResults.push({ click: spec, found: clicked, screenshot: clickFile, consoleErrors: [...new Set(consoleErrors)].slice(0, 5) });
          }
        }
        entry.views[key] = {
          ...(clickResults.length ? { clicks: clickResults } : {}),
          finalUrl: page.url().replace(/\?.*$/, ""),
          screenshot: file,
          ...(fullFile ? { fullScreenshot: fullFile } : {}),
          signedIn: !opts.signedOut && (await page.locator('input[type="email"]').count()) === 0,
          ...(await page.evaluate(measure, view.mobile)),
          headerPaint: await page.evaluate(() => {
            const probe = window.__pageLookHeader;
            if (!probe) return null;
            const s = probe.samples;
            const firstWith = s.findIndex((x) => x.text);
            const first = firstWith >= 0 ? s[firstWith] : null;
            const last = [...s].reverse().find((x) => x.text) ?? null;
            const moved = first?.box && last?.box ? Math.max(Math.abs(first.box.x - last.box.x), Math.abs(first.box.y - last.box.y)) : null;
            return {
              firstText: s[0]?.text ?? null,
              firstFrom: s[0]?.from ?? null,
              emptyFrames: firstWith < 0 ? s.length : firstWith,
              contentAtMs: first?.t ?? null,
              titleMovedPx: moved,
              title: last?.box?.text ?? null,
              layoutShifts: probe.shifts,
            };
          }),
          consoleErrors: [...new Set(consoleErrors)].slice(0, 10),
          failedRequests: [...new Set(failedRequests)].slice(0, 10),
        };
        saveReport(); // written after every view, so a killed run keeps what it saw
      }
    }
  }
} finally {
  await context.close();
}

const file = path.join(opts.out, "look.json");
writeFileSync(file, JSON.stringify(report, null, 2));
for (const r of report.routes) {
  for (const [key, v] of Object.entries(r.views)) {
    const phone = key.startsWith("phone");
    console.log(
      `${r.route} [${key}]: used ${v.firstScreen.usedPct}% (largest empty band ${v.firstScreen.largestEmptyBandPx}px), under-header ${v.underHeader.length}, small text ${v.smallText.length}, emoji ${v.emoji.length}, console errors ${v.consoleErrors.length}, failed requests ${v.failedRequests.length}, zero-size graphics ${v.zeroSizeGraphics.length}, header ${v.headerPaint ? `${v.headerPaint.emptyFrames} empty frames, moved ${v.headerPaint.titleMovedPx ?? "?"}px, ${v.headerPaint.layoutShifts.length} shifts` : "?"}${phone ? `, small targets ${v.smallTargets.length}, sideways scroll ${v.horizontalOverflow}` : ""}`,
    );
  }
}
console.log(`[page-look] ${file}`);

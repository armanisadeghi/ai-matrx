// PAGE RHYTHM WALK — measures the page-structure spacing every page shows a person, and takes the
// screenshots that prove it: the space above the first block, the gap between the big blocks, and
// the space below the last element once every scroller is at its end — with whatever floats over
// the bottom (the ambient chat dock) closed and open. Seat: admin@admin.com through the login form
// (credentials from .env.local, never printed). Read-only.
//
// Usage: node scripts/page-rhythm-walk.mjs <outDir> [label]
//   RHYTHM_ORIGIN   your preview host (pnpm preview:status); RHYTHM_LOGIN_URL the pnpm dev-login URL
//   RHYTHM_WIDTHS   default 1440,1024,375
//   RHYTHM_SCHEMES  default light,dark
//   RHYTHM_ROUTES   comma list overriding the default route set
//
// Writes <outDir>/<label>-measure.json and one PNG per route × width × scheme × state.
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, sleep } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.RHYTHM_ORIGIN ?? "http://sdf87ea8d.localhost:3001";
const OUT = process.argv[2] ?? "/tmp/page-rhythm";
const LABEL = process.argv[3] ?? "run";
const WIDTHS = (process.env.RHYTHM_WIDTHS ?? "1440,1024,375").split(",").map(Number);
const SCHEMES = (process.env.RHYTHM_SCHEMES ?? "light,dark").split(",");
const ROUTES = (process.env.RHYTHM_ROUTES ??
  [
    "/agents/all",
    "/board/all",
    "/research/topics",
    "/demos/ui-unification/samples/agents-all",
    "/demos/ui-unification/samples/education-overview",
    "/workflows/all",
    "/transcripts",
    "/flashcards",
    "/work/conversations",
    "/maps",
  ].join(",")).split(",");
mkdirSync(OUT, { recursive: true });

/** Runs in the page: every number this walk reports. */
function measureInPage() {
  const vh = window.innerHeight;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;height:var(--shell-header-h,0px)";
  document.body.appendChild(probe);
  const headerH = probe.offsetHeight;
  probe.remove();
  const main = document.querySelector(".shell-main") ?? document.body;
  const floating = [...document.querySelectorAll("[data-matrx-floating-bottom], .ambient-assistant-dock, .shell-dock")]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0 && r.bottom > vh - 160);
  const floatTop = floating.length ? Math.min(...floating.map((r) => r.top)) : vh;
  const isFloating = (el) => el.closest("[data-matrx-floating-bottom], .ambient-assistant-dock, .shell-dock, [data-window-panel], [role=dialog]");
  let maxBottom = 0;
  let minTop = Infinity;
  let lastEl = null;
  for (const el of main.querySelectorAll("*")) {
    if (isFloating(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom <= 0 || r.top >= vh) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;
    const leaf =
      (el.children.length === 0 && (el.textContent ?? "").trim().length > 0) ||
      /^(BUTTON|INPUT|SELECT|TEXTAREA|IMG|svg|TD)$/.test(el.tagName) ||
      (parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomColor !== "rgba(0, 0, 0, 0)" && r.height > 20);
    if (!leaf) continue;
    // Clip to the nearest scroll ancestor's visible box.
    if (r.bottom > maxBottom) {
      maxBottom = Math.min(r.bottom, vh);
      lastEl = el;
    }
    if (r.top >= headerH - 4 && r.top < minTop) minTop = r.top;
  }
  const pager = document.querySelector("[data-matrx-table-footer]");
  const pr = pager?.getBoundingClientRect();
  const pagerCovered = pr ? floating.some((f) => f.top < pr.bottom && f.bottom > pr.top && f.left < pr.right && f.right > pr.left) : null;
  // Big-block gaps: the page-top block (notice) → the next block, and the list header → the list.
  const listHeader = document.querySelector("[data-entity-list-header]");
  let noticeGap = null;
  let topBlockTop = null;
  if (listHeader && listHeader.children.length > 1) {
    const first = listHeader.children[0].getBoundingClientRect();
    const second = listHeader.children[1].getBoundingClientRect();
    noticeGap = Math.round(second.top - first.bottom);
    topBlockTop = Math.round(first.top - headerH);
  }
  const cards = document.querySelector("nav[aria-label$='features'], nav[aria-label='Related features']");
  const cr = cards?.getBoundingClientRect();
  return {
    vh,
    headerH,
    floatingTop: Math.round(floatTop),
    floatingMeasured: getComputedStyle(document.documentElement).getPropertyValue("--matrx-floating-measured").trim(),
    bottomSpace: Math.round(vh - maxBottom),
    bottomSpaceAboveFloat: Math.round(floatTop - maxBottom),
    lastEl: lastEl ? `${lastEl.tagName.toLowerCase()}.${String(lastEl.className?.baseVal ?? lastEl.className).slice(0, 60)} "${(lastEl.textContent ?? "").trim().slice(0, 30)}"` : null,
    topSpace: Number.isFinite(minTop) ? Math.round(minTop - headerH) : null,
    topBlockTop,
    noticeGap,
    cardsTopFromHeader: cr ? Math.round(cr.top - headerH) : null,
    cardsBottomToNext: cr && listHeader?.children[1] ? Math.round(listHeader.children[1].getBoundingClientRect().top - cr.bottom) : null,
    pagerBottomGap: pr ? Math.round(vh - pr.bottom) : null,
    pagerCovered,
    rhythm: getComputedStyle(document.documentElement).getPropertyValue("--matrx-page-block-gap").trim() || null,
  };
}

function scrollAllToEnd() {
  const main = document.querySelector(".shell-main") ?? document.scrollingElement;
  const all = [document.scrollingElement, main, ...main.querySelectorAll("*")];
  for (const el of all) {
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (el !== document.scrollingElement && !/(auto|scroll)/.test(cs.overflowY)) continue;
    if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = el.scrollHeight;
  }
}

const browser = await chromium.launch({ headless: true });
const results = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
// A dev-login URL (pnpm dev-login, single-use nonce for this host) when given; else the login form.
if (process.env.RHYTHM_LOGIN_URL) {
  await page.goto(process.env.RHYTHM_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 180000 });
  await sleep(1500);
} else {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
}
for (const scheme of SCHEMES) {
  await page.emulateMedia({ colorScheme: scheme });
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 500 ? 812 : 900 });
      const slug = `${LABEL}-${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "")}-${width}-${scheme}`;
      const row = { route, width, scheme };
      try {
        // The shared preview restarts under other sessions: retry a refused navigation for 3 minutes.
        let resp = null;
        for (let attempt = 0; attempt < 12; attempt += 1) {
          try {
            resp = await page.goto(`${ORIGIN}${route}`, { waitUntil: "domcontentloaded", timeout: 180000 });
            break;
          } catch (e) {
            if (attempt === 11) throw e;
            await sleep(15000);
          }
        }
        await page.waitForFunction(() => document.querySelectorAll(".shell-main *").length > 60, null, { timeout: 120000 }).catch(() => undefined);
        row.status = resp?.status();
        await page.evaluate((s) => {
          document.documentElement.classList.toggle("dark", s === "dark");
          try { localStorage.setItem("theme", s); } catch {}
        }, scheme);
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
        await sleep(2500);
        row.top = await page.evaluate(measureInPage);
        await page.screenshot({ path: `${OUT}/${slug}-top.png` });
        await page.evaluate(scrollAllToEnd);
        await sleep(1800);
        await page.evaluate(scrollAllToEnd);
        await sleep(600);
        row.bottom = await page.evaluate(measureInPage);
        await page.screenshot({ path: `${OUT}/${slug}-bottom.png` });
        // The chat open: the page assistant dock reveals on a scroll or a pointer dwelling at the
        // bottom edge; then press it so it expands into the composer.
        await page.mouse.move(width / 2, (width < 500 ? 812 : 900) - 40);
        await page.mouse.move(width / 2 + 5, (width < 500 ? 812 : 900) - 30);
        await sleep(1200);
        const dock = page.locator(".ambient-assistant-dock button, .ambient-assistant-dock input, .ambient-assistant-dock textarea").first();
        if (await dock.count()) {
          row.chatClosed = await page.evaluate(measureInPage);
          await page.screenshot({ path: `${OUT}/${slug}-dock.png` });
          await dock.click({ timeout: 4000 }).catch(() => undefined);
          await sleep(1200);
          await page.evaluate(scrollAllToEnd);
          await sleep(500);
          row.chat = await page.evaluate(measureInPage);
          await page.screenshot({ path: `${OUT}/${slug}-chat.png` });
          await page.keyboard.press("Escape").catch(() => undefined);
        }
      } catch (e) {
        row.error = String(e).slice(0, 200);
      }
      results.push(row);
      const b = row.bottom ?? {};
      console.log(
        `${route} ${width} ${scheme}: top=${row.top?.topSpace} topBlock=${row.top?.topBlockTop} cardsTop=${row.top?.cardsTopFromHeader} cardsBelow=${row.top?.cardsBottomToNext} gap=${row.top?.noticeGap} | bottom=${b.bottomSpace} aboveFloat=${b.bottomSpaceAboveFloat} pagerGap=${b.pagerBottomGap} pagerCovered=${b.pagerCovered} float=${b.floatingMeasured} | dock bottom=${row.chatClosed?.bottomSpace} aboveFloat=${row.chatClosed?.bottomSpaceAboveFloat} pagerCovered=${row.chatClosed?.pagerCovered} | chat bottom=${row.chat?.bottomSpace} aboveFloat=${row.chat?.bottomSpaceAboveFloat} pagerCovered=${row.chat?.pagerCovered}${row.error ? " ERR " + row.error : ""}`,
      );
    }
  }
}
await context.close();
writeFileSync(`${OUT}/${LABEL}-measure.json`, JSON.stringify(results, null, 2));
await browser.close();

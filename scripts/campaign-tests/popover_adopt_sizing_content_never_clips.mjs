// scripts/campaign-tests/popover_adopt_sizing_content_never_clips.mjs — lane POPOVER-ADOPT
//
// THE ADOPTION'S OWN PROOF. POPOVER-CENSUS adopted `sizing="content"` inside
// the @ai-matrx packages and left matrx-frontend's 200-odd callers behind a
// publish; `@ai-matrx/design-system` 0.35.0 is installed here now, so this
// lane adopted them. This drives the REAL app, signed in as admin@admin.com,
// and measures the real popovers at 1600 and 375 wide.
//
// THE USE CASE (owner law — no fake test data, never a real person). Rincon
// Plumbing's dispatch board: a drain / water-heater / repipe contractor whose
// service-call table carries customer and job names nobody chose the length
// of. Those rows already live in the admin test organization, beside the
// admin account's own long agent and table names.
//
// EVERY CLAUSE IS MEASURED IN THE BROWSER, never asserted from source:
//   · the popover opens at all;
//   · it never runs off either edge of the viewport;
//   · its width sits inside sizing="content"'s own clamp
//     (>= min(20rem, vw-2rem), <= min(28rem, vw-2rem));
//   · it carries at least one genuinely long line (>= 28 characters);
//   · NO line is cut: every element whose text overflows its box declares
//     `text-overflow: ellipsis`. A box that simply slices the glyphs — the
//     FIX-14 bug this census exists to kill — fails here.
//
// A SURFACE THE APP DOES NOT RENDER AT 375 IS NOT SILENTLY SKIPPED. Four of
// these controls are desktop-only by the app's own responsive design (the
// toolbar and header collapse on a phone); they declare `desktopOnly` here,
// the run asserts they really are absent at 375, and says so.
//
// Run (dev server = the machine-wide one, matrx-frontend CLAUDE.md § Dev server):
//   pnpm preview:start
//   node scripts/campaign-tests/popover_adopt_sizing_content_never_clips.mjs <your-host>
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const HOST = process.argv[2] ?? "s8d677a69.localhost";
const ORIGIN = `http://${HOST}:3001`;
const TABLE = "/data/dbc7cd48-7b46-4402-ac9d-e459a95f4598"; // Rincon Plumbing — Service Calls
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
mkdirSync(OUT, { recursive: true });

const SURFACES = [
  { slug: "table-identity",  label: "Table identity menu",              file: "components/user-generated-table-data/TableIdentityMenu.tsx", was: "w-80",   route: TABLE,     trigger: "Rincon Plumbing — Service Calls" },
  { slug: "column-customer", label: "Column menu — Customer",           file: "components/user-generated-table-data/ColumnHeaderMenu.tsx",  was: "w-72",   route: TABLE,     sel: '[aria-haspopup="dialog"][title="Sort or filter Customer"]' },
  { slug: "column-workorder",label: "Column menu — Work order",         file: "components/user-generated-table-data/ColumnHeaderMenu.tsx",  was: "w-72",   route: TABLE,     sel: '[aria-haspopup="dialog"][title="Sort or filter Work order"]', shortContent: true },
  { slug: "entity-filters",  label: "Agents list — filters & sort",     file: "lib/entity-list/components/EntityFilterPanel.tsx",           was: "w-[360px]", route: "/agents", aria: "Filters and sort" },
  { slug: "entity-columns",  label: "Agents list — choose columns",     file: "lib/entity-list/components/EntityColumnPicker.tsx",          was: "w-56",   route: "/agents", aria: "Choose columns", shortContent: true },
  { slug: "column-view",     label: "Data table — column view menu",    file: "features/data-tables/components/ColumnViewMenu.tsx",         was: "w-72",   route: TABLE,     trigger: "Columns",    desktopOnly: true },
  { slug: "table-layout",    label: "Data table — layout menu",         file: "features/data-tables/components/TableLayoutMenu.tsx",        was: "w-72",   route: TABLE,     trigger: "Layout",     desktopOnly: true },
  { slug: "org-switcher",    label: "Organization switcher",            file: "features/shell/components/header/header-right-menu/HeaderChooseOrgButton.tsx", was: "w-72", route: TABLE, trigger: "Choose org", desktopOnly: true },
  { slug: "inbox",           label: "Notifications inbox",              file: "features/notifications/components/InboxHeaderButton.tsx",    was: "w-[380px] max-w-[92vw]", route: TABLE, trigger: "99+", desktopOnly: true },
];

const say = [];
let bad = 0;
const ok = (m) => say.push(`ok    ${m}`);
const fail = (m) => { bad += 1; say.push(`FAIL  ${m}`); };

const MEASURE = () => {
  const el = document.querySelector("[data-radix-popper-content-wrapper]")?.firstElementChild;
  if (!el) return null;
  const box = el.getBoundingClientRect();
  const clipped = [];
  let longest = "";
  for (const node of el.querySelectorAll("*")) {
    const text = (node.textContent ?? "").trim();
    if (!text || node.children.length > 0) continue;
    if (text.length > longest.length) longest = text;
    if (node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).textOverflow !== "ellipsis") {
      clipped.push(`"${text.slice(0, 48)}" (${node.scrollWidth}>${node.clientWidth})`);
    }
  }
  return {
    width: Math.round(box.width),
    left: Math.round(box.left),
    right: Math.round(box.right),
    overflowsViewport: box.left < -1 || box.right > window.innerWidth + 1,
    longest,
    clipped,
  };
};

async function open(page, route, width) {
  const nonce = randomBytes(16).toString("hex");
  writeFileSync(`/Users/armanisadeghi/code/matrx-frontend/.dev-login-nonce.${HOST}`, `${nonce}\n`);
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent(route)}`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  if (who?.email !== "admin@admin.com") throw new Error(`wrong identity: ${JSON.stringify(who)}`);
  await page.waitForTimeout(9000);
  return who.email;
}

async function proveAt(browser, width, height) {
  let lastRoute = null;
  let ctx = null;
  let page = null;
  for (const s of SURFACES) {
    if (s.route !== lastRoute) {
      if (ctx) await ctx.close();
      ctx = await browser.newContext({ viewport: { width, height } });
      page = await ctx.newPage();
      const email = await open(page, s.route, width);
      ok(`${width}px · ${s.route} · signed in as ${email}`);
      lastRoute = s.route;
    }
    const trigger = s.sel
      ? page.locator(s.sel).first()
      : s.aria
        ? page.locator(`[aria-haspopup="dialog"][aria-label="${s.aria}"]`).first()
        : page.locator('[aria-haspopup="dialog"]').filter({ hasText: s.trigger }).first();
    const visible = await trigger.isVisible().catch(() => false);

    if (s.desktopOnly && width < 768) {
      if (visible) fail(`${width}px · ${s.label}: declared desktop-only but its trigger IS on screen at 375`);
      else ok(`${width}px · ${s.label}: desktop-only — the app does not render this control on a phone, so there is no popover to clip`);
      continue;
    }
    if (!visible) { fail(`${width}px · ${s.label}: trigger "${s.aria ?? s.trigger ?? s.sel}" is not on screen`); continue; }

    await trigger.click({ timeout: 8000 });
    await page.waitForTimeout(1200);
    const m = await page.evaluate(MEASURE);
    if (!m) { fail(`${width}px · ${s.label}: popover did not open`); continue; }

    const ceiling = Math.min(448, width - 32);
    const floor = Math.min(320, width - 32);
    if (m.overflowsViewport) fail(`${width}px · ${s.label}: runs off the viewport (left=${m.left} right=${m.right})`);
    else ok(`${width}px · ${s.label} [${s.file}, was ${s.was}]: inside the viewport (left=${m.left} right=${m.right})`);

    if (m.width > ceiling + 1 || m.width < floor - 1) fail(`${width}px · ${s.label}: width ${m.width} outside the content clamp ${floor}-${ceiling}`);
    else ok(`${width}px · ${s.label}: width ${m.width} inside the content clamp ${floor}-${ceiling}`);

    if (s.shortContent) ok(`${width}px · ${s.label}: content is short by nature (short by nature; longest "${m.longest}") — this surface proves the FLOOR, not the ellipsis`);
    else if (m.longest.length < 28) fail(`${width}px · ${s.label}: no long line to prove anything with (longest "${m.longest}")`);
    else ok(`${width}px · ${s.label}: longest line ${m.longest.length} chars — "${m.longest.slice(0, 64)}"`);

    if (m.clipped.length) fail(`${width}px · ${s.label}: ${m.clipped.length} line(s) cut with no ellipsis — ${m.clipped[0]}`);
    else ok(`${width}px · ${s.label}: every overflowing line ellipsises, none is cut`);

    await page.screenshot({ path: `${OUT}/popover-adopt-${s.slug}-${width}.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  if (ctx) await ctx.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await proveAt(browser, 1600, 1000);
  await proveAt(browser, 375, 812);
} finally {
  await browser.close();
}
console.log(say.join("\n"));
console.log(bad === 0 ? `\nALL ${say.length} CLAUSES PASSED` : `\n${bad} OF ${say.length} CLAUSES FAILED`);
process.exit(bad === 0 ? 0 : 1);

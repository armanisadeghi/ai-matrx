// scripts/scopes-read-switch-walk.mjs — lane SCOPES-READ-SWITCH-VALIDATE (2026-09-30).
//
// Every scope screen, walked headless from one seat at one width on the CLONE preview, captured so two
// runs — the old read path (NEXT_PUBLIC_SCOPES_READ_FROM_STORE off, DB knob off) and the store path
// (both on) — can be diffed screen by screen: the page's visible text, every input's value (a date
// draws in an input, not as text), every button's name, the addresses of every link, the time the
// screen took to settle, and a screenshot.
//
//   READ_PATH=old|store SEAT=admin|member WIDTH=1600|390 ORIGIN=http://<you>-clone.localhost:3002 \
//     SEAT_PASSWORD=… node scripts/scopes-read-switch-walk.mjs
//
// Read-only: it opens pages and panels and never writes. Output:
// common-docs/operations/for-arman/2026-09-30/scopes-read-switch/<path>/<seat>-<width>-*.{png,json}

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN;
const PATH = process.env.READ_PATH ?? "old";
const SEAT = process.env.SEAT ?? "admin";
const WIDTH = Number(process.env.WIDTH ?? 1600);
if (!ORIGIN || !/:3002|clone/.test(ORIGIN)) throw new Error("ORIGIN must be the clone preview (never the live one)");
const SHOTS = join(
  process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-30/scopes-read-switch",
  PATH,
);
mkdirSync(SHOTS, { recursive: true });

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const who =
  SEAT === "admin"
    ? { email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD }
    : { email: "test@test.com", password: process.env.SEAT_PASSWORD };
if (!who.email || !who.password) throw new Error(`no credential for seat ${SEAT}`);

const C = "/organizations/castellano-reyes/scopes";
const CR = "/organizations/cedar-ridge-physical-therapy/scopes";
const SCREENS = [
  { name: "scopes-hub", path: "/scopes" },
  { name: "scopes-templates", path: "/scopes/templates" },
  { name: "org-castellano", path: C },
  { name: "type-matters", path: `${C}/matters` },
  { name: "matter-reyes", path: `${C}/matters/reyes-v-pinnacle` },
  { name: "matter-doe", path: `${C}/matters/doe-v-csv` },
  { name: "org-cedar-ridge", path: CR },
  { name: "type-patients", path: `${CR}/patients` },
  { name: "patient-dana", path: `${CR}/patients/dana-whitfield` },
  { name: "chat-lens", path: "/chat", lens: true },
  // ContextAssignmentField (project settings) and EntityScopeTagger (class picker on education admin).
  SEAT === "admin"
    ? { name: "context-assignment", path: "/projects/38bebb92-41fe-49b4-a19b-fa6a026433ee/settings" }
    : { name: "context-assignment", path: "/projects/738966f6-8919-4811-b64b-bba76320614d/settings" },
  { name: "entity-scope-tagger", path: "/education/admin" },
  ...(SEAT === "admin"
    ? [{ name: "context-inspector", path: "/administration/scopes-context/context-inspector?org=7cd12da2-2213-4378-8fba-a9e2dc4ea657&scopeType=1aaba65d-68de-457e-8a0c-0f2731161d13&scope=2f658029-7960-4fd5-a451-1e47c40a4746" }]
    : []),
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: WIDTH, height: WIDTH < 600 ? 844 : 1000 } });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (/_next\/hmr|WebSocket connection/.test(t)) return;
  errors.push({ at: page.url().replace(ORIGIN, ""), text: t.slice(0, 300) });
});
page.on("pageerror", (e) => errors.push({ at: page.url().replace(ORIGIN, ""), text: `PAGEERROR ${String(e).slice(0, 300)}` }));
const requests = { context_schema: 0, store_doors: {} };
page.on("request", (req) => {
  const url = req.url();
  if (!url.includes("/rest/v1/")) return;
  const h = req.headers();
  const profile = h["accept-profile"] ?? h["content-profile"] ?? "";
  if (profile === "context") requests.context_schema += 1;
  const m = url.match(/\/rest\/v1\/rpc\/(context_[a-z_]+|get_[a-z_]+|resolve_[a-z_]+|list_scope[a-z_]*)/);
  if (m) requests.store_doors[m[1]] = (requests.store_doors[m[1]] ?? 0) + 1;
});

async function unpark() {
  if (!page.url().includes("__dev-walk")) return;
  await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
  await sleep(6000);
}

// What a person sees: the text, every field's value, every button, every link.
const snapshot = () =>
  page.evaluate(() => {
    const root = document.querySelector("main") ?? document.body;
    const text = root.innerText
      .replace(/\b\d+\s+(seconds?|minutes?|hours?|days?)\s+ago\b/g, "<ago>")
      .replace(/\bjust now\b/gi, "<ago>");
    const inputs = [...root.querySelectorAll("input, textarea, select")]
      .filter((e) => e.type !== "hidden")
      .map((e) => `${e.getAttribute("aria-label") ?? e.getAttribute("name") ?? e.getAttribute("placeholder") ?? e.tagName}=${e.value}`);
    const buttons = [...root.querySelectorAll("button, [role=button]")]
      .map((b) => (b.getAttribute("aria-label") ?? b.innerText ?? "").trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const links = [...root.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    return { text, inputs, buttons, links };
  });

// Settled = the visible text has not changed for 3 s and no skeleton/spinner is drawn; the time is when
// it last changed (what the person waited for), capped at 150 s.
async function settle() {
  const start = Date.now();
  let last = "";
  let lastChange = Date.now();
  while (Date.now() - start < 150000) {
    let s = "";
    try {
      s = await page.evaluate(() => {
        const root = document.querySelector("main") ?? document.body;
        const busy = root.querySelector('[aria-busy="true"], .animate-pulse, .animate-spin');
        return (busy ? "BUSY:" : "") + root.innerText;
      });
    } catch {
      s = "";
    }
    if (s !== last) {
      last = s;
      lastChange = Date.now();
    } else if (!s.startsWith("BUSY:") && s.length > 0 && Date.now() - lastChange > 3000) break;
    await sleep(250);
  }
  return lastChange - start;
}

await signIn(page, ORIGIN, who.email, who.password, SEAT);
const out = { origin: ORIGIN, path: PATH, seat: SEAT, width: WIDTH, started: new Date().toISOString(), screens: [] };

for (const sc of SCREENS) {
  errors.length = 0;
  requests.context_schema = 0;
  requests.store_doors = {};
  const t0 = Date.now();
  await page.goto(`${ORIGIN}${sc.path}`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
  await unpark();
  if (page.url().includes("__dev-walk")) await page.goto(`${ORIGIN}${sc.path}`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
  const nav = Date.now() - t0;
  let settledMs = await settle();
  if (sc.lens) {
    const lens = page.locator("[data-lens-chip], button[title*='context' i], button[aria-label*='context' i]").first();
    if (await lens.isVisible().catch(() => false)) {
      await lens.click().catch(() => {});
      settledMs += await settle();
    }
  }
  const snap = await snapshot().catch(() => ({ text: "", inputs: [], buttons: [], links: [] }));
  // The lens tree opens in a popover outside <main>: capture the whole document's dialogs too.
  const overlay = await page
    .evaluate(() => [...document.querySelectorAll("[role=dialog], [data-radix-popper-content-wrapper]")].map((d) => d.innerText).join("\n---\n"))
    .catch(() => "");
  await page.screenshot({ path: join(SHOTS, `${SEAT}-${WIDTH}-${sc.name}.png`) }).catch(() => {});
  const rec = { name: sc.name, path: sc.path, url: page.url().replace(ORIGIN, ""), nav_ms: nav, settled_ms: nav + settledMs, ...snap, overlay, console_errors: [...errors], requests: JSON.parse(JSON.stringify(requests)) };
  out.screens.push(rec);
  console.log(`· ${sc.name} ${rec.settled_ms} ms, ${snap.text.length} chars, ${snap.inputs.length} inputs, ${errors.length} errors`);
}
out.finished = new Date().toISOString();
writeFileSync(join(SHOTS, `${SEAT}-${WIDTH}-walk.json`), JSON.stringify(out, null, 2));
await browser.close();

// scripts/scopes-reads-web-walk.mjs — lane SCOPES-READS-WEB headless walks (SCOPES-CUTOVER-PLAN step 2.4).
//
// The scope screens, the Matter page, the chat lens and the context inspector, read from the record
// store's `custom.context_*` doors, walked as admin@admin.com (owner seat) and test@test.com (member
// seat) at 1600 px and 390 px. Every walk also records whether any request reached the OLD context
// schema through PostgREST (`/rest/v1/…` with `Accept-Profile: context` / `Content-Profile: context`)
// — the proof that the browser no longer reads `context.*` — and which store doors answered.
//
//   SEAT=admin|member  WIDTH=1600|390  ORIGIN=http://<you>.localhost:3001  node scripts/scopes-reads-web-walk.mjs
//
// Screens land in /tmp/matrx-evidence/2026-09-29/scopes-reads-web/. Read-only: it opens
// pages and panels and never writes.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://scopes-reads-web.localhost:3001";
const SEAT = process.env.SEAT ?? "admin";
const WIDTH = Number(process.env.WIDTH ?? 1600);
const SHOTS =
  process.env.SHOTS ?? "/tmp/matrx-evidence/2026-09-29/scopes-reads-web";
mkdirSync(SHOTS, { recursive: true });

// Castellano & Reyes, LLP — the law firm the scope system was built around: a Matter (Reyes v.
// Pinnacle Logistics) whose Client and Practice Area are references to other scopes.
const CASTELLANO = { id: "7cd12da2-2213-4378-8fba-a9e2dc4ea657", slug: "castellano-reyes" };
const REYES = "2f658029-7960-4fd5-a451-1e47c40a4746";
const MATTERS = "1aaba65d-68de-457e-8a0c-0f2731161d13";

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
if (!who.email || !who.password) throw new Error(`no credential for seat ${SEAT} (member: SEAT_PASSWORD)`);

const out = { origin: ORIGIN, seat: SEAT, width: WIDTH, started: new Date().toISOString(), steps: [], console_errors: [], context_schema_requests: [], store_doors: {} };
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result).slice(0, 400));
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: WIDTH, height: WIDTH < 600 ? 844 : 1000 } });
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (/_next\/hmr|WebSocket connection/.test(t)) return;
  out.console_errors.push({ at: page.url().replace(ORIGIN, ""), text: t.slice(0, 300) });
});
page.on("pageerror", (e) => out.console_errors.push({ at: page.url().replace(ORIGIN, ""), text: `PAGEERROR ${String(e).slice(0, 300)}` }));
page.on("request", (req) => {
  const url = req.url();
  if (!url.includes("/rest/v1/")) return;
  const h = req.headers();
  const profile = h["accept-profile"] ?? h["content-profile"] ?? "";
  if (profile === "context") out.context_schema_requests.push({ at: page.url().replace(ORIGIN, ""), url: url.replace(/\?.*$/, "") });
  const m = url.match(/\/rest\/v1\/rpc\/(context_[a-z_]+)/);
  if (m && profile === "custom") out.store_doors[m[1]] = (out.store_doors[m[1]] ?? 0) + 1;
});
page.on("response", async (res) => {
  if (res.url().includes("/rest/v1/") && res.status() >= 400) {
    let body = "";
    try { body = (await res.text()).slice(0, 240); } catch {}
    out.failed_requests = [...(out.failed_requests ?? []), { at: page.url().replace(ORIGIN, ""), status: res.status(), url: res.url().replace(/\?.*$/, ""), body }];
  }
});
const tag = `${SEAT}-${WIDTH}`;
const shot = (name) => page.screenshot({ path: join(SHOTS, `${tag}-${name}.png`) });

async function unpark() {
  if (!page.url().includes("__dev-walk")) return;
  await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
  await sleep(6000);
}
async function go(path) {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await unpark();
  if (page.url().includes("__dev-walk")) await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 300000 });
}
const bodyText = () => page.evaluate(() => document.body.innerText);

await signIn(page, ORIGIN, who.email, who.password, SEAT);
step("signed in", { as: SEAT === "admin" ? "admin@admin.com" : "test@test.com" });

// 1. /scopes — the hub, drawn from the store's tree.
await go("/scopes");
const hub = await until("the scopes hub", async () => /Castellano|Matters|Tags|scope/i.test(await bodyText()), 240000);
await sleep(4000);
const hubText = await bodyText();
step("/scopes", { drew: hub.v, mentionsCastellano: /Castellano/.test(hubText), mentionsMatters: /Matters/.test(hubText), errorWords: (hubText.match(/could not|failed to|error/gi) ?? []).length });
await shot("scopes-hub");

// 2. A Castellano Matter: the short link resolves through the store (`custom.context_scopes`) to the
// canonical address, and the Matter page draws its values (Client, Practice Area, Date of Injury).
await go(`/scopes/s/${REYES}`);
const matter = await until("the Matter page", async () => /Reyes, Maria v\. Pinnacle/.test(await bodyText()), 240000);
await sleep(5000);
const matterText = await bodyText();
step("Castellano Matter", {
  url: page.url().replace(ORIGIN, ""),
  drew: matter.v,
  client: /Golden State Indemnity/.test(matterText),
  practiceArea: /Workers.? Compensation/.test(matterText),
  // A date value draws in a date input, whose value is not page text.
  dateOfInjury: await page.evaluate(() => [...document.querySelectorAll("input")].some((e) => e.value === "2023-09-02")),
  notFound: /not found|404/i.test(matterText),
});
await shot("castellano-matter");

// 3. The chat lens: the working-context chip on /chat opens the scope tree the lens picks from.
await go("/chat");
await until("the chat page", async () => (await page.locator("main, [role=main], body").count()) > 0, 120000);
await sleep(6000);
const lens = page.locator("button[title*='context' i], button[aria-label*='context' i], [data-lens-chip]").first();
const lensVisible = await lens.isVisible().catch(() => false);
if (lensVisible) {
  await lens.click().catch(() => {});
  await sleep(4000);
}
const lensText = await bodyText();
step("chat lens", { chip: lensVisible, treeShowsCastellano: /Castellano/.test(lensText), treeShowsMatters: /Matters|Matter/.test(lensText) });
await shot("chat-lens");

// 4. The context inspector (admin section): Castellano → Matters → Reyes, old vs new hand-off.
if (SEAT === "admin") {
  await go(`/administration/scopes-context/context-inspector?org=${CASTELLANO.id}&scopeType=${MATTERS}&scope=${REYES}`);
  const insp = await until("the inspector compare", async () => /Byte-identical|identical|differ/i.test(await bodyText()), 300000);
  await sleep(4000);
  const inspText = await bodyText();
  step("context inspector", {
    drew: insp.v,
    byteIdentical: /Byte-identical/i.test(inspText),
    differs: /\bdiffer/i.test(inspText) && !/Byte-identical/i.test(inspText),
    scopeNamed: /Reyes, Maria v\. Pinnacle/.test(inspText),
  });
  await shot("context-inspector");
}

out.finished = new Date().toISOString();
writeFileSync(join(SHOTS, `${tag}-walk.json`), JSON.stringify(out, null, 2));
console.log(`context-schema requests: ${out.context_schema_requests.length}; store doors: ${JSON.stringify(out.store_doors)}; console errors: ${out.console_errors.length}`);
await browser.close();

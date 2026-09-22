// TAILS-6 reproduction: Checklists tab SQLSTATE leak + Dashboards openRecords leak.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization, sleep, until } from "/Users/armanisadeghi/code/matrx-frontend/scripts/lib/seat-browser.mjs";

const ORIGIN = "http://127.0.0.1:3001";
const OUT = process.argv[2] ?? "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/tails6/shots";
const ORG = process.argv[3] ?? "Rincon Plumbing Co";
mkdirSync(OUT, { recursive: true });

const EMAIL = process.env.AI_ADMIN_USERNAME;
const PASS = process.env.AI_ADMIN_PASSWORD;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
const page = await ctx.newPage();
const rpc = [];
page.on("response", async (r) => {
  const u = r.url();
  if (!/\/rest\/v1\/rpc\//.test(u)) return;
  if (r.status() < 400) return;
  let body = null;
  try { body = await r.text(); } catch {}
  rpc.push({ url: u.split("/rpc/")[1], status: r.status(), body });
});

const who = await signIn(page, ORIGIN, EMAIL, PASS);
console.log("signed in as", who);
const how = await setOrganization(page, ORG);
console.log("org:", ORG, how);

await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded" });
await sleep(5000);
// The table tiles are buttons, not links — click the one named on the command line.
const WANT = process.argv[4] ?? "Jobs";
const opened = await page.evaluate((want) => {
  const leaf = Array.from(document.querySelectorAll("body *")).find(
    (el) => el.children.length === 0 && (el.textContent ?? "").trim() === want,
  );
  const t = leaf?.closest("button, a, [role='button'], li, div[class*='rounded']");
  if (!t) return false;
  t.scrollIntoView({ block: "center" });
  t.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  return true;
}, WANT);
console.log("opened table tile", WANT, opened);
await sleep(6000);
const target = new URL(page.url()).pathname;
console.log("landed on", target);
if (!/\/data-v2\/[0-9a-f-]{36}/.test(target)) {
  await page.screenshot({ path: resolve(OUT, "no-tables.png"), fullPage: true });
  await browser.close();
  process.exit(1);
}
for (const [name, press] of [["checklists", "Checklists"], ["dashboards", "Dashboards"]]) {
  await page.goto(`${ORIGIN}${target}`, { waitUntil: "domcontentloaded" });
  await sleep(5000);
  const clicked = await page.evaluate((label) => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => (x.textContent ?? "").trim() === label);
    if (!b) return false;
    b.click();
    return true;
  }, press);
  console.log(name, "clicked:", clicked);
  await sleep(6000);
  await page.screenshot({ path: resolve(OUT, `before-${name}.png`), fullPage: true });
  const text = await page.evaluate(() => document.body.innerText);
  writeFileSync(resolve(OUT, `before-${name}.txt`), text);
  const hit = text.split("\n").filter((l) => /SQLSTATE|openRecords|RecordsUiProvider|went wrong/.test(l));
  console.log(name, "LEAK LINES:", JSON.stringify(hit, null, 1));
}
writeFileSync(resolve(OUT, "rpc-failures.json"), JSON.stringify(rpc, null, 2));
console.log("RPC FAILURES:", JSON.stringify(rpc, null, 1));
await browser.close();

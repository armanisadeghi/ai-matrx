// LANE S6 — THE OWNER'S SEAT: admin@admin.com gives a portal its look from the portal card.
//
//   S6_ORIGIN=http://s6.localhost:3001 S6_TABLE=<service calls table> S6_PORTAL=<portal id> \
//   S6_SLUG=<portal slug> [S6_OUT=<dir>] node scripts/campaign-tests/uichamp_s6_owner_walk.mjs
//
// Signs in through /login (a password, no dev-login), opens the Service calls table's Portals rail
// on this portal, and at 390 and 1440 asserts the look-and-forms editor is there with the three
// forms on the portal, then (desktop only) changes the welcome line, saves, reads the saved
// sentence, and checks the client's signed-out page shows the new line — then puts the original
// back the same way. Credentials from the environment (.env.local), never printed. Headless.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { signIn } from "../lib/seat-browser.mjs";

const root = path.resolve(new URL(".", import.meta.url).pathname, "../..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const ORIGIN = process.env.S6_ORIGIN ?? "http://s6.localhost:3001";
const TABLE = process.env.S6_TABLE, PORTAL = process.env.S6_PORTAL, SLUG = process.env.S6_SLUG;
const OUT = process.env.S6_OUT ?? "/tmp/s6-owner";
if (!TABLE || !PORTAL || !SLUG) throw new Error("S6_TABLE, S6_PORTAL and S6_SLUG are required");
fs.mkdirSync(OUT, { recursive: true });
const clauses = [];
const clause = (name, ok, saw) => {
  clauses.push({ name, ok, saw });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  — saw: ${JSON.stringify(saw).slice(0, 300)}`}`);
};
const text = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());

const browser = await chromium.launch({ headless: true });
try {
  for (const [label, viewport] of [["phone-390", { width: 390, height: 844 }], ["desktop-1440", { width: 1440, height: 900 }]]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const who = await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD, "owner");
    clause(`${label}: signed in as admin@admin.com`, who === "admin@admin.com", who);
    await page.goto(`${ORIGIN}/data-v2/${TABLE}?rail=portals&item=${PORTAL}`, { waitUntil: "domcontentloaded", timeout: 300000 });
    const editor = page.getByRole("region", { name: "Look and forms" });
    const found = await editor.waitFor({ timeout: 180000 }).then(() => true).catch(() => false);
    clause(`${label}: the portal card carries the look-and-forms editor`, found, (await text(page)).slice(0, 400));
    if (!found) { await page.screenshot({ path: `${OUT}/owner-${label}-missing.png`, fullPage: true }); await ctx.close(); continue; }
    await editor.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    const t = await editor.innerText();
    for (const f of ["Request a service call", "Update a gate code", "Report an emergency"]) clause(`${label}: the editor lists "${f}"`, t.includes(f), t.slice(0, 300));
    clause(`${label}: the crew form (a table the portal does not show) is not offered`, !t.includes("Log crew hours"), t.slice(0, 300));
    const welcome = editor.getByLabel("Welcome line");
    clause(`${label}: the welcome line reads what the portal stored`, /service calls, gate codes and invoices/.test(await welcome.inputValue()), await welcome.inputValue());
    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    clause(`${label}: no horizontal scroll`, noHScroll, null);
    await editor.screenshot({ path: `${OUT}/owner-${label}-look-editor.png` });
    await page.screenshot({ path: `${OUT}/owner-${label}.png`, fullPage: true });

    if (label.startsWith("desktop")) {
      const original = await welcome.inputValue();
      const changed = "Your buildings' service calls and gate codes. Dispatch answers 7am to 7pm.";
      for (const [value, what] of [[changed, "changed"], [original, "put back"]]) {
        await welcome.fill(value);
        await editor.getByRole("button", { name: "Save the look and forms" }).click();
        const saved = await editor.getByText(/^Saved\./).waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
        clause(`desktop: the welcome line is ${what} and saved`, saved, (await editor.innerText()).slice(-300));
        const client = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const cp = await client.newPage();
        await cp.goto(`${ORIGIN}/portal/c/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 300000 });
        await cp.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
        const ct = await text(cp);
        clause(`desktop: the client's sign-in page shows the ${what} line`, ct.includes(value), ct.slice(0, 300));
        if (what === "changed") await cp.screenshot({ path: `${OUT}/owner-change-reaches-the-client-sign-in.png`, fullPage: true });
        await client.close();
      }
    }
    clause(`${label}: no uncaught page error`, errors.length === 0, errors);
    await ctx.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/owner-walk.json`, JSON.stringify({ ranAt: new Date().toISOString(), clauses }, null, 2));
}
const failed = clauses.filter((c) => !c.ok).length;
console.log(failed ? `${failed} CLAUSE(S) FAILED` : "ALL CLAUSES PASSED");
process.exit(failed ? 1 : 0);

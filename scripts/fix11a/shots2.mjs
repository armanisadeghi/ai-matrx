// FIX-11A / V11-C — "New record" on Rincon Plumbing Co's Jobs, the table whose published
// form used to make it answer with SQLSTATE 23514.
import { chromium } from "playwright";
import { signIn, setOrganization, until, sleep } from "../lib/seat-browser.mjs";
import fs from "node:fs";

const ORIGIN = "http://fix11a.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
const JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163";
const env = Object.fromEntries(
  fs.readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 240)); });

console.log("signed in as:", await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD));
let picked = false;
for (let attempt = 1; attempt <= 3 && !picked; attempt++) {
  try { await setOrganization(page, "Rincon Plumbing Co"); picked = true; }
  catch (e) { console.log(`picker attempt ${attempt}: ${e.message}`); await sleep(4000); }
}
if (!picked) throw new Error("could not reach Rincon Plumbing Co in the picker");
console.log("matrx-active-org =", (await page.context().cookies()).find((c) => c.name === "matrx-active-org")?.value);

await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await until("grid", async () => (await page.locator("body").innerText()).includes("New record"), 90000);
await sleep(2500);
const before = (await page.locator("body").innerText()).replace(/\s+/g, " ");
await page.screenshot({ path: `${OUT}/fix11a-v11c-jobs-before.png` });

await page.click('button:has-text("New record")');
await sleep(4000);
const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
await page.screenshot({ path: `${OUT}/fix11a-v11c-newrecord-after.png` });
fs.writeFileSync("/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/fix11a/after.txt", after);

for (const needle of ["SQLSTATE", "23514", "REC-15", "was not accepted", "every answer it asks for is there"]) {
  console.log(`  "${needle}" on screen after pressing New record:`, after.includes(needle));
}
console.log("errors:", errors.slice(0, 6));
await browser.close();

// ORG-CLEANUP — what the screen says about Rincon's portals now, from the admin seat.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { signIn, setOrganization, sleep } from "../lib/seat-browser.mjs";
const root = path.resolve(new URL(".", import.meta.url).pathname, "../..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const ORIGIN = process.env.ORG_CLEANUP_ORIGIN ?? "http://org-cleanup.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1400 } });
console.log("seat:", await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD));
await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(4000);
await setOrganization(page, "Rincon Plumbing Co");
await page.goto(`${ORIGIN}/data-v2/try-everything`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(14000);
// Section 10 is the outsider portal; open it and read the sentence that counts the portals.
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button, summary")).find((e) =>
    /outsider portal/i.test((e.textContent ?? "").trim()) && (e.textContent ?? "").length < 120,
  );
  b?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
});
await sleep(9000);
const seen = await page.evaluate(() => {
  const t = (document.querySelector("main") ?? document.body).innerText;
  return {
    portal_count_sentence: (t.match(/[^.\n]*\b\d+ portals?\b[^.\n]*/gi) ?? []).slice(0, 4),
    your_jobs_and_invoices_rows: t.split("Your jobs and invoices").length - 1,
    error: /something went wrong at our end/i.test(t),
  };
});
console.log(JSON.stringify(seen, null, 1));
await page.screenshot({ path: `${OUT}/orgcleanup-rincon-portals-after.png`, fullPage: true });
fs.writeFileSync(`${OUT}/orgcleanup-rincon-portals-after.json`, JSON.stringify(seen, null, 2));
await browser.close();

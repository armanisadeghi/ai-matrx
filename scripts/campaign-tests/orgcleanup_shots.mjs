// ORG-CLEANUP — what the organization picker shows, before and after the archive.
// Headless only (owner order 2026-09-17): never the in-app browser pane.
//   node scripts/campaign-tests/orgcleanup_shots.mjs before|after
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { signIn, sleep } from "../lib/seat-browser.mjs";

const root = path.resolve(new URL(".", import.meta.url).pathname, "../..");
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const phase = process.argv[2] ?? "before";
const ORIGIN = process.env.ORG_CLEANUP_ORIGIN ?? "http://org-cleanup.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
const who = await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD);
console.log("seat:", who);

await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(4000);
await page.evaluate(() => {
  const side = document.querySelector("#shell-sidebar-toggle");
  if (side instanceof HTMLInputElement && !side.checked) side.click();
  const group = document.querySelector("#menu-group-organization");
  if (group instanceof HTMLInputElement && !group.checked) group.click();
});
await sleep(2000);
const revealed = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll("button")).filter(
    (b) => /test organizations/i.test(b.textContent ?? "") && b.getAttribute("aria-expanded") !== null,
  );
  const labels = buttons.map((b) => (b.textContent ?? "").trim());
  for (const b of buttons) if (b.getAttribute("aria-expanded") !== "true") { b.scrollIntoView({ block: "center" }); b.click(); }
  return labels;
});
await sleep(2500);
console.log("disclosure label(s):", JSON.stringify(revealed));

const counts = await page.evaluate(() => {
  const text = document.body.innerText;
  const tally = (needle) => text.split(needle).length - 1;
  return {
    ojai: tally("Rincon Plumbing Co — Ojai Branch"),
    carpinteria: tally("Rincon Plumbing Co — Carpinteria Branch"),
    screens2: tally("SCREENS-2 Walkthrough"),
    z7b: tally("Z7B"),
    harbor: tally("Harbor Dental Group"),
    wraithmoor: tally("Wraithmoor Regional Museum of Art & Craft"),
    kessler: tally("Kessler Lab for Applied Microbial Ecology"),
    cascade: tally("Cascade Electronics Recovery"),
    compass: tally("Compass Route Relocation Advisors"),
    rincon: tally("Rincon Plumbing Co"),
    birchwood: tally("Birchwood Avenue Renovation"),
  };
});
console.log("picker rows by name:", JSON.stringify(counts));

await page.screenshot({ path: `${OUT}/orgcleanup-picker-${phase}.png`, fullPage: true });
fs.writeFileSync(`${OUT}/orgcleanup-picker-${phase}.json`, JSON.stringify({ phase, who, revealed, counts }, null, 2));
console.log("wrote", `${OUT}/orgcleanup-picker-${phase}.png`);
await browser.close();

// ORG-CLEANUP-2 — what the organization picker shows now that the 48 are archived and the
// door refuses the name. Headless only (owner order 2026-09-17): never the in-app browser.
//
//   node scripts/campaign-tests/orgcleanup2_picker_shots.mjs
//
// It does what a person does: sign in at the login form as admin@admin.com, open the
// organization group, open the "Test organizations (N)" disclosure — the archived-items-law
// pattern the picker uses — and then COUNT, off the rendered page, every name pattern the
// suites were minting. The picker is drawn twice on the page, so a row reads as 2.
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

const ORIGIN = process.env.ORG_CLEANUP_ORIGIN ?? "http://org-cleanup.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
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
const disclosure = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll("button")).filter(
    (b) => /test organizations/i.test(b.textContent ?? "") && b.getAttribute("aria-expanded") !== null,
  );
  const labels = buttons.map((b) => (b.textContent ?? "").trim());
  for (const b of buttons) {
    if (b.getAttribute("aria-expanded") !== "true") {
      b.scrollIntoView({ block: "center" });
      b.click();
    }
  }
  return labels;
});
await sleep(2500);
console.log("disclosure label(s):", JSON.stringify(disclosure));

// Every shape the fourteen suites were minting, counted off the page the owner sees.
const counts = await page.evaluate(() => {
  const text = document.body.innerText;
  const tally = (needle) => text.split(needle).length - 1;
  const matches = (re) => (text.match(re) ?? []).length;
  return {
    // The tally KEY may not itself be a placeholder name: check:no-placeholder-data reads
    // identifiers too, and a junk-hunter spelled in junk is the thing it hunts.
    sorted_to_bottom: matches(/ZZ+[ _-]/g),
    throwaway_anything: matches(/[Tt]hrowaway/g),
    safe_to_delete: tally("safe to delete"),
    approval_fix: tally("APPROVAL-FIX"),
    approval_knob: tally("APPROVAL-KNOB"),
    approval_tail: tally("APPROVAL-TAIL"),
    rincon: tally("Rincon Plumbing Co"),
    birchwood: tally("Birchwood Avenue Renovation"),
    ironclad: tally("Ironclad Mobile Mechanic"),
  };
});
console.log("picker rows by name:", JSON.stringify(counts));

await page.screenshot({ path: `${OUT}/orgcleanup2-picker-after.png`, fullPage: true });
// The disclosure itself and the rows under it — the part of the screen the claim is about,
// not the whole sidebar. Located by the button's own text, the way a person finds it.
const clip = await page.evaluate(() => {
  const button = Array.from(document.querySelectorAll("button")).find(
    (b) => /test organizations/i.test(b.textContent ?? "") && b.getAttribute("aria-expanded") === "true",
  );
  if (!button) return null;
  button.scrollIntoView({ block: "center" });
  const r = button.getBoundingClientRect();
  return { x: Math.max(0, r.x - 24), y: Math.max(0, r.y - 320), width: Math.min(560, r.width + 220), height: 900 };
});
if (clip) {
  await sleep(600);
  await page.screenshot({ path: `${OUT}/orgcleanup2-picker-disclosure.png`, clip });
}
fs.writeFileSync(
  `${OUT}/orgcleanup2-picker-after.json`,
  JSON.stringify({ who, disclosure, counts, at: new Date().toISOString() }, null, 2),
);

const dirty =
  counts.sorted_to_bottom + counts.throwaway_anything + counts.safe_to_delete +
  counts.approval_fix + counts.approval_knob + counts.approval_tail;
console.log(
  dirty === 0
    ? "PASS — not one throwaway name is on the picker, disclosure open."
    : `FAIL — ${dirty} junk-name hit(s) still on the picker.`,
);
await browser.close();
process.exit(dirty === 0 ? 0 : 1);

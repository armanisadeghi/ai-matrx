// ORG-CLEANUP — the owner guide's own walk still works after the archive.
// Birchwood (home-renovation): the quotes board with its four stages and its refusal rule.
// Rincon Plumbing Co: the try-everything strip and its sixteen sections.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { signIn, setOrganization, setOrganizationBySlug, sleep } from "../lib/seat-browser.mjs";

const root = path.resolve(new URL(".", import.meta.url).pathname, "../..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const ORIGIN = process.env.ORG_CLEANUP_ORIGIN ?? "http://org-cleanup.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
console.log("seat:", await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD));

const out = {};

// ---- Birchwood, the one whose address reads home-renovation ----
await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(4000);
await setOrganizationBySlug(page, "Birchwood Avenue Renovation", "home-renovation");
await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(8000);
const opened = await page.evaluate(() => {
  // The table list draws each table as a clickable row reading "<name>\n<n> fields".
  // BUTTON, never the <li> that wraps it — the wrapper carries the same text and swallows
  // a dispatched click without opening anything.
  const el = Array.from(document.querySelectorAll("button")).filter(
    (e) => /^quotes\s*\n?\s*7 fields$/i.test((e.textContent ?? "").trim()),
  )[0];
  if (!el) return null;
  el.scrollIntoView({ block: "center" });
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  return el.tagName;
});
await sleep(8000);
out.birchwood_quotes_opened = opened;
out.birchwood_url = page.url();
// The bar above the grid switches to Kanban; then group by the Quote stage column.
await page.evaluate(() => {
  const k = Array.from(document.querySelectorAll("button")).find((b) => /kanban/i.test((b.textContent ?? "").trim()) && (b.textContent ?? "").trim().length < 20);
  k?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
});
await sleep(5000);
// The board defaults to grouping by `status`; the guide's board is the one grouped by Quote stage.
out.birchwood_grouped_by = await page.evaluate(() => {
  const sel = Array.from(document.querySelectorAll("select")).find((s) =>
    Array.from(s.options).some((o) => /quote stage/i.test(o.textContent ?? "")),
  );
  if (!sel) return null;
  const opt = Array.from(sel.options).find((o) => /quote stage/i.test(o.textContent ?? ""));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
  setter?.call(sel, opt.value);
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return opt.textContent;
});
await sleep(5000);
out.birchwood_board = await page.evaluate(() => {
  const t = (document.querySelector("main") ?? document.body).innerText;
  return {
    stages: ["Requested", "Received", "Approved", "Paid"].filter((s) => t.includes(s)),
    primary_bedroom_on_the_board: t.includes("Primary Bedroom"),
    waiting_to_move: /Waiting to move to Paid/i.test(t),
    not_in_any_column: /are not in any of these columns/i.test(t),
    error: /something went wrong at our end/i.test(t),
  };
});
await page.screenshot({ path: `${OUT}/orgcleanup-birchwood-board.png`, fullPage: false });
console.log("birchwood:", JSON.stringify(out.birchwood_board), out.birchwood_url);

// ---- Rincon ----
await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(4000);
await setOrganization(page, "Rincon Plumbing Co");
await page.goto(`${ORIGIN}/data-v2/try-everything`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(14000);
out.rincon = await page.evaluate(() => {
  const t = (document.querySelector("main") ?? document.body).innerText;
  return {
    organization: /ORGANIZATION\n([^\n]+)/.exec(t)?.[1] ?? null,
    tables_you_can_see: /On — (\d+) tables? you can see/.exec(t)?.[1] ?? null,
    sections_working: (t.match(/\bWorking\b/g) ?? []).length,
    error: /something went wrong at our end/i.test(t),
  };
});
await page.screenshot({ path: `${OUT}/orgcleanup-rincon-try-everything.png`, fullPage: false });
console.log("rincon:", JSON.stringify(out.rincon));

fs.writeFileSync(`${OUT}/orgcleanup-guidewalk.json`, JSON.stringify(out, null, 2));
await browser.close();

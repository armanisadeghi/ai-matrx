// scripts/orderfilter-walk.mjs — LANE ORDER-FILTER headless proof on the shared preview (live database).
//
// admin@admin.com's own disposable "Cedar Ridge Vet — Autumn Day Sheet" (admin's Workspace; 160
// visits, 64 of them No-shows). Its one saved view, "Call-back list", is a grid whose own question
// (`where`, a Rule) is visit status = No-show, and every visit is placed by hand. Proves, from the
// person's seat:
//   1. the grid shows exactly the No-shows, in their stored hand-order positions (page 1);
//   2. Next shows page 2 of THAT order (rows 51..64), and Previous brings page 1 back;
//   3. the order door is asked with the view's filter (p_filter) and the page (p_limit/p_offset) —
//      never the old unfiltered 500-row read;
//   4. zero console errors.
//
//   ORIGIN=http://order-filter.localhost:3001 EXPECTED=<file of patient names, " | " separated> \
//     node scripts/orderfilter-walk.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { signIn } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://order-filter.localhost:3001";
const TABLE = process.env.TABLE ?? "b4c1c451-13d6-4cc9-9ca7-722fa640448a";
const EXPECTED = readFileSync(process.env.EXPECTED, "utf8").trim().split(" | ");
const OUT = process.env.OUT ?? "/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/shots/order-filter";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1100 } })).newPage();
const orderReads = [];
page.on("request", (r) => {
  if (/\/rpc\/read_records_in_view_order\b/.test(r.url()) && r.method() === "POST") {
    try {
      orderReads.push(JSON.parse(r.postData() ?? "{}"));
    } catch {
      orderReads.push({ unparsed: r.postData() });
    }
  }
});
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 240)));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 240)}`));

const patients = async () =>
  (await page.locator("tbody tr").allInnerTexts())
    .map((t) => (t.match(/[A-Z][a-z]+ \([A-Z][a-z]+\) #\d{3}/) ?? [null])[0])
    .filter(Boolean);
const settle = async (want) => {
  for (let i = 0; i < 60; i += 1) {
    const now = await patients();
    if (now.length > 0 && (!want || now[0] === want)) return now;
    await page.waitForTimeout(1000);
  }
  return patients();
};

try {
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  check("seat", who === "admin@admin.com", who);

  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("tbody tr", { timeout: 240000 });
  const p1 = await settle(EXPECTED[0]);
  await page.waitForTimeout(2000);
  const sortLine = (await page.locator("[data-sort-mode]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  const size = p1.length;
  check(
    "1-page-1-exactly-the-no-shows-in-place",
    size > 0 && size < EXPECTED.length && JSON.stringify(p1) === JSON.stringify(EXPECTED.slice(0, size)),
    `${size} rows; first ${p1.slice(0, 3).join(" / ")}; expected ${EXPECTED.slice(0, 3).join(" / ")}; sort line "${sortLine}"`,
  );
  check("1b-says-manual", /Manual/.test(sortLine), sortLine);
  await page.screenshot({ path: `${OUT}/1-call-back-list-page-1.png` });

  const first = orderReads.find((a) => a.p_view_id);
  check(
    "3-order-door-asked-with-the-views-filter",
    first && first.p_filter && JSON.stringify(first.p_filter).includes("No-show") && first.p_limit === size && first.p_offset === 0,
    JSON.stringify({ reads: orderReads.length, p_filter: first?.p_filter, p_limit: first?.p_limit, p_offset: first?.p_offset }),
  );
  check(
    "3b-no-unfiltered-500-row-read",
    orderReads.every((a) => a.p_filter && a.p_limit !== 500),
    orderReads.map((a) => `limit ${a.p_limit} offset ${a.p_offset} filter ${a.p_filter ? "yes" : "NO"}`).join("; "),
  );

  const before = orderReads.length;
  await page.getByRole("button", { name: /^Next$/ }).first().click();
  const p2 = await settle(EXPECTED[size]);
  const second = orderReads.slice(before).find((a) => a.p_offset === size);
  check(
    "2-page-2-is-the-rest-in-place",
    JSON.stringify(p2) === JSON.stringify(EXPECTED.slice(size, size * 2)),
    `${p2.length} rows (expected ${EXPECTED.slice(size, size * 2).length}); first ${p2[0]}; door ${JSON.stringify({ p_limit: second?.p_limit, p_offset: second?.p_offset, filtered: Boolean(second?.p_filter) })}`,
  );
  check("2b-page-2-door-read", second && second.p_filter && second.p_limit === size, JSON.stringify(second ?? null).slice(0, 300));
  await page.screenshot({ path: `${OUT}/2-call-back-list-page-2.png` });

  await page.getByRole("button", { name: /^Previous$/ }).first().click();
  const back = await settle(EXPECTED[0]);
  check("2c-previous-brings-page-1-back", JSON.stringify(back) === JSON.stringify(p1), `first ${back[0]}`);

  check("4-zero-console-errors", consoleErrors.length === 0, consoleErrors.join(" || ") || "none");
} catch (e) {
  check("walk-ran", false, String(e).slice(0, 400));
  await page.screenshot({ path: `${OUT}/error.png` }).catch(() => {});
} finally {
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, orderReads, consoleErrors }, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}

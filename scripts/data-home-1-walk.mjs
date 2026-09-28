// scripts/data-home-1-walk.mjs — lane DATA-HOME-1, from a real seat, headless.
//
// The data home (/data-v2): Arman's three rulings of 2026-09-27 21:20 PT, walked the way a person
// walks them. Read-only: it opens pages and presses filters and Back; it writes nothing.
//
//   PHASE=before  the page as it was (point ORIGIN at the deployed site): the home, "All my
//                 organizations", then the browser's Back — where does it land?
//   PHASE=after   the page now (the shared preview): the home opens on All with every
//                 organization's tables labelled; each of the five filters; /data-v2 → All →
//                 Back lands on /data-v2; a direct ?scope=all → the header's back arrow.
//
//   SEAT=admin (admin@admin.com, AI_ADMIN_* from .env.local) | SEAT=member (test@test.com,
//   password in SEAT_PASSWORD — never printed).
//
//   ORIGIN=http://s96c6068c.localhost:3001 PHASE=after SEAT=admin SHOTS=<dir> node scripts/data-home-1-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep, setOrganization } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://s96c6068c.localhost:3001";
const PHASE = process.env.PHASE ?? "after";
const SEAT = process.env.SEAT ?? "admin";
const SHOTS = process.env.SHOTS ?? "/tmp";
const WIDTH = Number(process.env.WIDTH ?? 1600);
/** The organization the seat is working in — the page is gated on one being picked. */
const ORG = process.env.ORG ?? "Harbor Dental Group";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const email = SEAT === "admin" ? env.AI_ADMIN_USERNAME : "test@test.com";
const password = SEAT === "admin" ? env.AI_ADMIN_PASSWORD : process.env.SEAT_PASSWORD;
if (!email || !password) throw new Error(`no credential for seat ${SEAT}`);

const out = { origin: ORIGIN, phase: PHASE, seat: SEAT, steps: [], console_errors: [] };
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result));
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 240)));
const shot = async (name) => {
  const file = `${PHASE}-${SEAT}-${name}.png`;
  await page.screenshot({ path: join(SHOTS, file) });
  step(`screenshot ${file}`);
};
const path = () => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}`;
};

async function home(query = "") {
  await page.goto(`${ORIGIN}/data-v2${query}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const ready = await until("the hub", async () => (await page.locator("[data-hub-root]").count()) > 0, 180000);
  if (!ready.v) {
    await page.screenshot({ path: join(SHOTS, `${PHASE}-${SEAT}-did-not-draw.png`) });
    const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 600);
    throw new Error(`the data home did not draw: ${text}`);
  }
  // The tables listing answers after its doors.
  await until(
    "the tables listing",
    async () => !/reading/i.test((await page.locator('[data-hub-listing="tables"]').first().textContent()) ?? "reading"),
    120000,
  );
  await sleep(1500);
}

async function tablesListing() {
  return page.evaluate(() => {
    const section = document.querySelector('[data-hub-listing="tables"]');
    const rows = [...(section?.querySelectorAll("li") ?? [])].map((li) => ({
      title: li.querySelector("a")?.textContent ?? "",
      organization: li.querySelector("[data-hub-row-organization]")?.textContent ?? null,
      kind: li.querySelector("[data-hub-row-kind]")?.textContent ?? null,
    }));
    const organizations = [...new Set(rows.map((r) => r.organization).filter(Boolean))];
    const kinds = {};
    for (const r of rows) kinds[r.kind ?? "?"] = (kinds[r.kind ?? "?"] ?? 0) + 1;
    return {
      heading: section?.querySelector("[data-hub-listing-toggle]")?.textContent ?? null,
      rows: rows.length,
      organizations: organizations.length,
      kinds,
      first: rows.slice(0, 3),
      empty: rows.length === 0 ? (section?.querySelector("p")?.textContent ?? null) : null,
    };
  });
}

const who = await signIn(page, ORIGIN, email, password, SEAT);
step("signed in as", { who });
await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
await until(
  "the hub or the organization notice",
  async () =>
    (await page.locator("[data-hub-root]").count()) > 0 ||
    (await page.getByText(/no organization is selected/i).count()) > 0,
  240000,
);
if ((await page.locator("[data-hub-root]").count()) === 0) {
  await setOrganization(page, ORG);
  step("working in", { organization: ORG });
}

if (PHASE === "before") {
  await home();
  step("header centre text", { text: await page.locator(".hdr-structured-title").first().textContent().catch(() => null) });
  step("header back arrow present", { present: (await page.locator('[aria-label="Go back"]').count()) > 0 });
  step("filters", { choices: await page.locator("[data-hub-lane]").allTextContents() });
  step("tables", await tablesListing());
  await shot("01-home");
  const all = page.getByRole("button", { name: "All my organizations" });
  if (await all.count()) {
    await all.first().click();
    await sleep(3000);
    step("after All my organizations", { path: path() });
    await shot("02-all-my-organizations");
    await page.goBack({ timeout: 30000 }).catch(() => undefined);
    await sleep(3000);
    step("after browser Back", { path: path(), origin: new URL(page.url()).origin });
    await shot("03-after-back");
  }
} else {
  await home();
  step("header centre text", { text: await page.locator(".hdr-structured-title").count() });
  step("header back arrow present", { present: (await page.locator('[aria-label="Go back"]').count()) > 0 });
  step("filters", {
    choices: await page.locator("[data-hub-scope-choice]").allTextContents(),
    selected: await page.locator('[data-hub-scope-choice][aria-selected="true"]').allTextContents(),
  });
  step("kind filter", {
    value: await page.locator("[data-hub-kind]").inputValue().catch(() => null),
    options: await page.locator("[data-hub-kind] option").allTextContents(),
  });
  step("show-everything fold present", { present: (await page.getByText(/Show everything/i).count()) > 0 });
  step("tables under the default", await tablesListing());
  await shot("01-home-default-all");

  const kindValues = await page.locator("[data-hub-kind] option").evaluateAll((os) => os.map((o) => o.value));
  const pick = kindValues.includes("list") ? "list" : (kindValues.find((v) => v !== "all" && v !== "table") ?? "table");
  await page.locator("[data-hub-kind]").selectOption(pick);
  await until(`?kind=${pick}`, async () => path().includes(`kind=${pick}`), 20000);
  await sleep(1500);
  step(`kind ${pick}`, { path: path(), ...(await tablesListing()) });
  await shot("02-kind-lists");
  await page.goBack({ timeout: 30000 });
  await until("back from kind", async () => !path().includes("kind="), 20000);
  step("Back from a kind", { path: path() });

  for (const scope of ["mine", "orgs", "shared", "public"]) {
    await page.locator(`[data-hub-scope-choice="${scope}"]`).click();
    await until(`?scope=${scope}`, async () => path().includes(`scope=${scope}`), 20000);
    await sleep(1500);
    step(`filter ${scope}`, { path: path(), ...(await tablesListing()) });
    await shot(`02-filter-${scope}`);
  }

  // Back through the filters, one press per filter, to the home.
  for (let i = 0; i < 4; i += 1) {
    await page.goBack({ timeout: 30000 });
    await sleep(1200);
  }
  step("after four browser Backs", { path: path() });

  // THE BRIEF'S WALK: /data-v2 → ?scope=all → Back → /data-v2.
  await home();
  await page.locator('[data-hub-scope-choice="all"]').click();
  await until("?scope=all", async () => path().includes("scope=all"), 20000);
  step("pressed All", { path: path() });
  await page.goBack({ timeout: 30000 });
  await until("back on /data-v2", async () => path() === "/data-v2", 20000);
  step("browser Back from ?scope=all", { path: path() });
  await shot("03-back-landed-on-data-v2");

  // The header's arrow: /data-v2 → ?scope=all (typed), then the arrow.
  await home();
  await home("?scope=all");
  await page.locator('[aria-label="Go back"]').first().click();
  await until("arrow back on /data-v2", async () => path() === "/data-v2", 20000);
  step("header back arrow from ?scope=all", { path: path() });
}

writeFileSync(join(SHOTS, `${PHASE}-${SEAT}-walk.json`), JSON.stringify(out, null, 2));
await browser.close();

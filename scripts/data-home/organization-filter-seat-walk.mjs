// scripts/data-home/organization-filter-seat-walk.mjs — LANE DATA-HOME-2
//
// THE DATA HOME'S ORGANIZATION DROPDOWN, WALKED FROM A REAL SEAT (headless).
//
// Arman, 2026-09-28 ~14:00 PT: "with titanium selected in the organization filter, the home still
// lists every organization." This walk signs in the way a person does, opens /data-v2, and:
//   before — screenshots the bar and the Tables listing as they are (the defect);
//   after  — proves the bar order (five filters, Kind, then the organization dropdown, on All Orgs
//            for a person who never picked), picks one organization, proves every lane lists only
//            its tables, opens a FRESH browser session and proves the home lands on the same
//            organization, then puts the pick back to All Orgs.
//
//   DH_ORIGIN=https://www.aimatrx.com DH_MODE=after DH_SHOTS=<dir> DH_SEAT=admin|member \
//     DH_EMAIL=… DH_PASSWORD=… DH_PICK="Harbor Dental Group" node scripts/data-home/organization-filter-seat-walk.mjs
//
// Credentials come from the environment and are never printed.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { setOrganization, signIn, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.DH_ORIGIN ?? "https://www.aimatrx.com";
const MODE = process.env.DH_MODE ?? "after";
const SEAT = process.env.DH_SEAT ?? "admin";
const SHOTS = process.env.DH_SHOTS ?? "shots/data-home-2";
const PICK = process.env.DH_PICK ?? "Harbor Dental Group";
/** The organization the seat works in (the app header's picker), chosen the way a person does. */
const WORKING_IN = process.env.DH_WORKING_IN ?? "admin's Workspace";
const EMAIL = process.env.DH_EMAIL;
const PASSWORD = process.env.DH_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error("DH_EMAIL and DH_PASSWORD must be set");

mkdirSync(SHOTS, { recursive: true });
const results = [];
const pass = (clause, ok, detail) => {
  results.push({ clause, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${SEAT}] ${clause} — ${detail}`);
};

const browser = await chromium.launch({ headless: true });

async function session() {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, SEAT);
  pass("seat", who === EMAIL, `/api/whoami answered ${who}`);
  // A fresh session may be working in no organization yet; a person picks one in the header.
  await page.goto(`${ORIGIN}/data-v2?org=all`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const state = await until(
    "the home or its organization notice",
    async () =>
      page.evaluate(() =>
        document.querySelector("[data-hub-root]")
          ? "home"
          : /An organization is needed/.test(document.body.innerText)
            ? "needs"
            : null,
      ),
    150000,
  );
  if (state.v === "needs") await setOrganization(page, WORKING_IN);
  return { context, page };
}

async function openHome(page, query = "") {
  await page.goto(`${ORIGIN}/data-v2${query}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const read = await until(
    "the Tables listing",
    async () => {
      const t = await page.evaluate(() => document.querySelector('[data-hub-listing-toggle="tables"]')?.textContent ?? null);
      return t && !/reading/.test(t) ? t : null;
    },
    150000,
  );
  return read.v;
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${SEAT}-${name}.png`, fullPage: false });

/** Open a listing (forms, bookings) and return each row's organization label. */
async function listingOrgs(page, id) {
  await page.evaluate((listing) => {
    const t = document.querySelector(`[data-hub-listing-toggle="${listing}"]`);
    if (t && t.getAttribute("aria-expanded") !== "true") t.click();
  }, id);
  await page.waitForTimeout(600);
  return page.evaluate(
    (listing) =>
      [...document.querySelectorAll(`[data-hub-listing="${listing}"] li[data-hub-row] [data-hub-row-organization]`)].map(
        (e) => e.textContent,
      ),
    id,
  );
}

/** Every row's organization label in the Tables listing, and the listing's count. */
const tableFacts = (page) =>
  page.evaluate(() => {
    const listing = document.querySelector('[data-hub-listing="tables"]');
    const orgs = [...(listing?.querySelectorAll("li[data-hub-row] [data-hub-row-organization]") ?? [])].map((e) => e.textContent);
    const heading = document.querySelector('[data-hub-listing-toggle="tables"]')?.textContent ?? "";
    return { orgs, heading, groups: listing?.querySelectorAll("[data-hub-organization-group]").length ?? 0 };
  });

try {
  if (MODE === "before") {
    const { page } = await session();
    await openHome(page);
    await shot(page, "before-home");
    const bar = await page.evaluate(() => document.querySelector("[data-hub-scope]")?.innerText ?? "");
    const facts = await tableFacts(page);
    pass("before", true, `bar: ${JSON.stringify(bar)}; tables heading ${JSON.stringify(facts.heading.slice(0, 40))}; ${new Set(facts.orgs).size} organizations in the list`);
  } else {
    // ── 1. the bar, for a person on the platform default ─────────────────────────────────────
    const first = await session();
    let page = first.page;
    await openHome(page, "?org=all");
    const order = await page.evaluate(() =>
      [...document.querySelectorAll("[data-hub-scope] [data-hub-scope-choice], [data-hub-scope] [data-hub-kind], [data-hub-scope] [data-hub-organization]")].map(
        (el) => el.getAttribute("data-hub-scope-choice") ?? (el.hasAttribute("data-hub-kind") ? "kind" : "organization"),
      ),
    );
    pass("bar order", JSON.stringify(order) === JSON.stringify(["all", "mine", "orgs", "shared", "public", "kind", "organization"]), order.join(" · "));
    const start = await page.evaluate(() => {
      const s = document.querySelector("[data-hub-organization]");
      return s ? { value: s.value, label: s.options[s.selectedIndex]?.textContent } : null;
    });
    pass("starts on All Orgs", start?.value === "all" && start?.label === "All Orgs", JSON.stringify(start));
    const everything = await tableFacts(page);
    const barText = await page.evaluate(() => document.querySelector("[data-hub-scope]")?.innerText ?? "");
    pass("no single-organization sentence on the bar", !/Forms and pages/.test(barText), JSON.stringify(barText.replace(/\n/g, " · ").slice(-60)));
    // EVERY OTHER LISTING, the same way (DATA-HOME-2, finish the class): no heading says one
    // organization, and the rows come from every organization shown.
    const OTHERS = ["portals", "dashboards", "digests", "checklists", "automations", "shared-outside"];
    const allOthers = {};
    for (const id of OTHERS) allOthers[id] = await listingOrgs(page, id);
    const onlyHeading = await page.evaluate(() => document.querySelectorAll("[data-hub-listing-one-organization]").length);
    pass("no listing heading says one organization", onlyHeading === 0, `${onlyHeading} "Only …'s." headings`);
    const othersOrgs = new Set(Object.values(allOthers).flat());
    pass(
      "All Orgs: the other six listings come from every organization",
      othersOrgs.size > 1,
      OTHERS.map((id) => `${id} ${allOthers[id].length} in ${new Set(allOthers[id]).size}`).join(", "),
    );
    const allForms = await listingOrgs(page, "forms");
    const allBookings = await listingOrgs(page, "bookings");
    pass(
      "All Orgs lists forms and booking pages from every organization",
      new Set([...allForms, ...allBookings]).size > 1,
      `${allForms.length} forms in ${new Set(allForms).size} organizations, ${allBookings.length} booking pages in ${new Set(allBookings).size}`,
    );
    const working = await page.evaluate(() => document.querySelector("header")?.innerText ?? "");
    const named = await page.evaluate(() =>
      [...document.querySelectorAll('[data-hub-listing="dashboards"] li[data-hub-row], [data-hub-listing="tables"] li[data-hub-row]')]
        .map((li) => ({
          org: li.querySelector("[data-hub-row-organization]")?.textContent ?? "",
          text: li.textContent ?? "",
        })),
    );
    const elsewhere = named.filter((r) => r.org && !working.includes(r.org));
    const withWho = elsewhere.filter((r) => /[A-Za-z]+, [A-Z][a-z]{2} \d+/.test(r.text));
    pass(
      "who changed it reads for organizations other than the working one",
      elsewhere.length > 0 && withWho.length > 0,
      `${withWho.length} of ${elsewhere.length} rows outside the working organization name who changed them`,
    );
    await page.evaluate(() => document.querySelector('[data-hub-listing="dashboards"]')?.scrollIntoView());
    await shot(page, "after-all-orgs-dashboards");
    await page.evaluate(() => document.querySelector('[data-hub-listing="forms"]')?.scrollIntoView());
    await shot(page, "after-all-orgs-forms");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.querySelector("[data-hub-root]")?.parentElement?.scrollTo?.(0, 0));
    await shot(page, "after-all-orgs");

    // ── 2. pick one organization; every lane lists only its tables ──────────────────────────
    const pickId = await page.evaluate((name) => {
      const s = document.querySelector("[data-hub-organization]");
      return [...(s?.options ?? [])].find((o) => o.textContent === name)?.value ?? null;
    }, PICK);
    if (!pickId) throw new Error(`the dropdown does not offer ${PICK}`);
    await page.selectOption("[data-hub-organization]", pickId);
    await until("the address to carry the pick", async () => page.url().includes(`org=${pickId}`), 30000);
    await until(
      "the listing to re-read",
      async () => {
        const f = await tableFacts(page);
        return !/reading/.test(f.heading) && f.orgs.length > 0 && f.orgs.every((o) => o === PICK);
      },
      150000,
    );
    await page.evaluate(() => {
      const t = document.querySelector('[data-hub-listing-toggle="tables"]');
      if (t && t.getAttribute("aria-expanded") !== "true") t.click();
    });
    await shot(page, "after-picked");
    for (const id of ["portals", "dashboards", "digests", "checklists", "automations", "shared-outside"]) {
      const orgs = await listingOrgs(page, id);
      pass(`${id} narrows to ${PICK}`, orgs.every((o) => o === PICK), `${orgs.length} rows, ${orgs.filter((o) => o !== PICK).length} from another organization`);
    }
    const pickedForms = await listingOrgs(page, "forms");
    const pickedBookings = await listingOrgs(page, "bookings");
    pass(
      `forms and booking pages narrow to ${PICK} with the tables`,
      [...pickedForms, ...pickedBookings].every((o) => o === PICK),
      `${pickedForms.length} forms, ${pickedBookings.length} booking pages, ${[...pickedForms, ...pickedBookings].filter((o) => o !== PICK).length} from another organization`,
    );
    await page.evaluate(() => document.querySelector('[data-hub-listing="forms"]')?.scrollIntoView());
    await shot(page, "after-picked-forms");
    for (const lane of ["all", "mine", "orgs", "shared", "public"]) {
      await page.click(`[data-hub-scope-choice="${lane}"]`);
      await until(`lane ${lane}`, async () => page.url().includes(`scope=${lane}`), 30000);
      await page.waitForTimeout(800);
      const f = await tableFacts(page);
      const others = f.orgs.filter((o) => o !== PICK);
      pass(`lane ${lane} honours ${PICK}`, others.length === 0, `${f.orgs.length} rows, ${others.length} from another organization`);
      if (lane === "mine") await shot(page, "after-picked-mine");
    }
    pass("everything was more than one organization", new Set(everything.orgs).size > 1, `${new Set(everything.orgs).size} organizations under All Orgs`);
    await first.context.close();

    // ── 3. a fresh session lands on the same organization ────────────────────────────────────
    const second = await session();
    page = second.page;
    await openHome(page);
    const landed = await until(
      "the saved pick",
      async () => (await page.evaluate(() => document.querySelector("[data-hub-organization]")?.value ?? null)) === pickId,
      60000,
    );
    const f = await tableFacts(page);
    pass("fresh session lands on the pick", Boolean(landed.v) && f.orgs.every((o) => o === PICK), `dropdown ${landed.v ? PICK : "not the pick"}, ${f.orgs.length} rows`);
    await shot(page, "after-fresh-session");

    // ── 4. put the pick back to All Orgs (the account's default state) ──────────────────────
    await page.selectOption("[data-hub-organization]", "all");
    await until("All Orgs", async () => page.url().includes("org=all"), 30000);
    await page.waitForTimeout(1500);
    await second.context.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

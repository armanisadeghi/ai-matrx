// scripts/data-hub/hubfix-accept-proof.mjs — LANE HUB-FIX (VERIFIER-15 H4/H6, VERIFIER-16 M5)
//
// A SHARE, END TO END, FROM A LIVE ORGANIZATION — through the screens a person uses.
//
// THE USE CASE. Greenline Landscaping Crew shares its crew Schedule, read-only, with the
// property manager of a building it services, so she can see when the crew is coming. She
// is not a member of Greenline and never will be. (test@test.com plays her; admin@admin.com
// owns Greenline.) Every share test@test.com held before came from organizations archived
// on 2026-09-22, which the hub now hides with the archive — so the accepted-share path
// needed a live organization to be proven on again.
//
//   1. admin, in Greenline, opens Schedule's share dialog (`?rail=share`) and invites her.
//   2. She, working in Rincon Plumbing Co (her own organization), sees the offer under
//      "Shared with me", opens it, accepts, and opens the table.
//   3. Back on her own hub, the ACCEPTED share is still listed, and opening it lands on
//      Greenline's Schedule with "Shared with you by …" and no refusal toast.
//
// It is idempotent in effect: a second run finds the share already accepted and proves
// step 3 alone.
//
//   node scripts/data-hub/hubfix-accept-proof.mjs --out <dir> [--origin http://hubfix.localhost:3001]

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

import { signIn, setOrganization, sleep, until } from "../lib/seat-browser.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ORIGIN = flag("origin", "http://hubfix.localhost:3001");
const OUT = resolve(flag("out", "scripts/data-hub/hubfix-shots"));
mkdirSync(OUT, { recursive: true });

const ADMIN = process.env.AI_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD;
const TEST = "test@test.com";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? "Password1234#";
const GREENLINE = { name: "Greenline Landscaping Crew", slug: "greenline-landscaping-crew" };
const SCHEDULE = "cbed6e95-9276-4225-8402-8531a9d9da4b";

const findings = [];
let failures = 0;
const say = (l) => {
  console.log(l);
  findings.push(l);
};
const clause = (label, ok, detail) => {
  if (!ok) failures += 1;
  say(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const shot = async (page, name) => {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true });
  say(`  shot ${name}.png`);
};
async function settledHub(page) {
  await until(
    "hub settled",
    async () =>
      page.evaluate(() => {
        const b = document.body?.innerText ?? "";
        return b.includes("Start here") && !b.includes("reading…") ? true : null;
      }),
    60000,
  );
  await page.evaluate(() => {
    for (const b of Array.from(document.querySelectorAll("[data-hub-listing-toggle]"))) {
      if (b.getAttribute("aria-expanded") === "false") b.click();
    }
  });
  await sleep(1200);
}
async function sharedRows(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-hub-listing="shared-with-me"] li')).map((li) => ({
      text: (li.textContent ?? "").replace(/\s+/g, " ").trim(),
      href: li.querySelector("a")?.getAttribute("href") ?? "",
    })),
  );
}

const browser = await chromium.launch({ headless: true });
try {
  // 1 — THE OWNER INVITES HER.
  const owner = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const op = await owner.newPage();
  const who = await signIn(op, ORIGIN, ADMIN, ADMIN_PASSWORD, "admin@admin.com");
  say(`owner signed in as ${who}`);
  await setOrganization(op, GREENLINE.name);
  await op.goto(`${ORIGIN}/data-v2/${SCHEDULE}?rail=share`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const field = await until("the outside-invite field", async () => ((await op.locator("#outside-email").count()) > 0 ? true : null), 60000);
  if (!field.v) {
    const body = (await op.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 400);
    say(`owner: no outside-invite field on Schedule's share dialog — ${body}`);
  } else {
    const already = (await op.evaluate(() => document.body.innerText)).includes(TEST_ADDR());
    function TEST_ADDR() {
      return "test@test.com";
    }
    if (already) {
      say("owner: test@test.com already holds or is invited to Schedule — not inviting twice");
    } else {
      await op.fill("#outside-email", TEST);
      await op.locator('button:has-text("Invite")').first().click();
      await sleep(3000);
      const after = (await op.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      clause("the owner's invitation is recorded", after.includes(TEST), after.includes(TEST) ? "test@test.com is listed on the dialog" : after.slice(0, 300));
    }
    await shot(op, "hubfix-accept-owner-invited");
  }
  await owner.close();

  // 2 + 3 — SHE ACCEPTS, THEN FINDS IT AGAIN ON HER OWN HUB.
  const member = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const mp = await member.newPage();
  const me = await signIn(mp, ORIGIN, TEST, TEST_PASSWORD, "test@test.com");
  say(`member signed in as ${me}`);
  await setOrganization(mp, "Rincon Plumbing Co");
  await mp.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await settledHub(mp);
  let rows = await sharedRows(mp);
  const offer = rows.find((r) => r.href.startsWith("/invitations/table/accept/") && r.text.includes("Schedule"));
  if (offer) {
    say(`member: the offer is listed — ${offer.text}`);
    await mp.goto(`${ORIGIN}${offer.href}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const btn = mp.locator('button:has-text("Open Schedule")').first();
    await until("the accept button", async () => ((await btn.count()) > 0 ? true : null), 45000);
    await btn.click();
    await until("accepted", async () => ((await mp.locator('text="Schedule is open to you"').count()) > 0 ? true : null), 45000);
    await shot(mp, "hubfix-accept-member-accepted");
    await mp.locator('button:has-text("Open Schedule")').first().click();
    const opened = await until(
      "the table after accepting",
      async () => mp.evaluate(() => ((document.body?.innerText ?? "").includes("Shared with you by") ? true : null)),
      45000,
    );
    await sleep(4000);
    const lie = await mp.evaluate(() => (document.body?.innerText ?? "").includes("you were not moved"));
    clause("right after accepting, the table opens and says whose it is", Boolean(opened.v), mp.url());
    clause("right after accepting, no refusal toast over the open table", !lie);
    await shot(mp, "hubfix-accept-member-opened");
    await setOrganization(mp, "Rincon Plumbing Co");
  } else {
    say("member: no pending Schedule offer — it was accepted on an earlier run; proving step 3 alone");
  }

  await mp.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await settledHub(mp);
  rows = await sharedRows(mp);
  const accepted = rows.find((r) => r.href.includes(`/data-v2/${SCHEDULE}?org=`));
  clause("the ACCEPTED share stays under Shared with me", Boolean(accepted), accepted ? `${accepted.text} → ${accepted.href}` : rows.map((r) => r.text).join(" | ") || "no rows");
  if (accepted) {
    await mp.goto(`${ORIGIN}${accepted.href}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const landed = await until(
      "the shared table from the hub",
      async () => mp.evaluate(() => ((document.body?.innerText ?? "").includes("Shared with you by") ? true : null)),
      45000,
    );
    await sleep(4000);
    const lie = await mp.evaluate(() => {
      const b = document.body?.innerText ?? "";
      return b.includes("you were not moved") || b.includes("not a member of");
    });
    clause("from the hub, the shared table opens and says whose it is", Boolean(landed.v));
    clause("from the hub, no refusal toast over the open table", !lie);
    await shot(mp, "hubfix-accept-member-from-hub");
  }
  await member.close();

  say(`\n${failures === 0 ? "ALL CLAUSES PASS" : `${failures} CLAUSE(S) FAILED`}`);
  writeFileSync(resolve(OUT, "hubfix-accept-proof.txt"), `${findings.join("\n")}\n`);
} finally {
  await browser.close();
}
process.exit(failures === 0 ? 0 : 1);

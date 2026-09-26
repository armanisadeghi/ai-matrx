// LANE SCOPE-ADMIN-2 — headless proof on the shared preview, as admin@admin.com (login form;
// credentials from .env.local, never printed):
//   A. /administration/scopes-context/organizations/<org> — an organization admin@admin.com is NOT a
//      member of (made by test@test.com: scripts/scope-admin-2-disposable-org.mjs) — lists its scope
//      types and scopes; renaming the type and adding a scope both land (and survive a reload).
//   B. the same organization's USER page, /organizations/<org>/settings/scopes, is the honest
//      not-found: on a user page the platform admin is an ordinary person.
//   C. the chat header lens chip lists a scope type created in the SAME page session (no reload):
//      create it on /organizations/admin/scopes, then a client-side route change to /chat/new.
// Usage: node scripts/scope-admin-2-walk.mjs <orgId> <outDir> [firstShotNumber]
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization, until } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.WALK_ORIGIN ?? "http://scope-admin-2.localhost:3001";
const [ORG, OUT = "/tmp", FIRST = "14"] = process.argv.slice(2);
const PHASES = new Set((process.env.WALK_PHASES ?? "admin,user,lens").split(","));
mkdirSync(OUT, { recursive: true });
let n = Number(FIRST);
const LENS_TYPE = { singular: "Pickup Zone", plural: "Pickup Zones" };

const browser = await chromium.launch({ headless: true });
const report = { steps: [], consoleErrors: {} };
let where = "sign-in";
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
page.setDefaultTimeout(240000);
page.setDefaultNavigationTimeout(240000);
page.on("console", (m) => { if (m.type() === "error") (report.consoleErrors[where] ??= []).push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => (report.consoleErrors[where] ??= []).push(`pageerror: ${String(e).slice(0, 300)}`));
const shot = async (name) => { const f = `${OUT}/${String(n++).padStart(2, "0")}-${name}.png`; await page.screenshot({ path: f }); return f; };
const step = (s) => { report.steps.push(s); console.log(JSON.stringify(s)); };
const save = () => writeFileSync(`${OUT}/${process.env.WALK_REPORT ?? "walk-report-scope-admin-2.json"}`, JSON.stringify(report, null, 2));
const body = async () => (await page.locator("body").first().textContent().catch(() => "")) ?? "";
const go = async (path) => { where = path; await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded" }); };
const seen = async (needle, ms = 120000) => (await until(needle, async () => (await body()).includes(needle), ms)).v === true;
const consolePath = `/administration/scopes-context/organizations/${ORG}`;

try {
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 240000 }).catch(() => {});
  step({ step: "signed in", who });

  if (PHASES.has("admin")) {
    await go(consolePath);
    const listed = await seen("Service Routes");
    const scopeListed = await seen("Carlsbad Tuesday");
    const laneNote = await seen("Platform admin view");
    await shot("admin-console-lists-non-member-org");
    step({ step: "A1 admin console lists a non-member organization's types and scopes", listed, scopeListed, laneNote });

    // Rename the type.
    await page.getByRole("button", { name: "Edit Service Routes" }).first().click();
    const sheet = page.locator('[role="dialog"]').last();
    await sheet.getByPlaceholder("Departments").fill("Pool Routes");
    await sheet.getByRole("button", { name: "Save Changes" }).click();
    await sheet.waitFor({ state: "hidden", timeout: 60000 }).catch(() => undefined);
    const renamed = await seen("Pool Routes", 60000);
    await shot("admin-console-type-renamed");
    step({ step: "A2 rename the type from the admin console", renamed });

    // Add a scope.
    await page.getByRole("button", { name: /^Add Service Route$/ }).first().click();
    const form = page.locator('[role="dialog"]').last();
    await form.getByPlaceholder("e.g. Engineering, West Coast, Q1 2025...").fill("Oceanside Thursday");
    await form.getByPlaceholder("Brief description of this scope...").fill("Nine homes, Thursday afternoons");
    await form.getByRole("button", { name: /^Create Service Route$/ }).click();
    await form.waitFor({ state: "hidden", timeout: 60000 }).catch(() => undefined);
    const added = await seen("Oceanside Thursday", 60000);
    await shot("admin-console-scope-added");
    step({ step: "A3 add a scope from the admin console", added });

    await go(consolePath);
    const persisted = (await seen("Pool Routes")) && (await seen("Oceanside Thursday"));
    await shot("admin-console-after-reload");
    step({ step: "A4 both edits survive a reload", persisted });
    save();
  }

  if (PHASES.has("user")) {
    await go(`/organizations/${ORG}/settings/scopes`);
    await page.waitForTimeout(8000);
    const text = await body();
    const leaked = text.includes("Pool Routes") || text.includes("Oceanside Thursday") || text.includes("Carlsbad Tuesday");
    await shot("user-page-same-org-is-not-found");
    step({ step: "B user page for the same organization", leaked, excerpt: text.replace(/\s+/g, " ").slice(0, 400) });
    save();
  }

  if (PHASES.has("lens")) {
    step({ step: "organization", result: await setOrganization(page, "admin's Workspace").catch((e) => String(e)) });
    await go(`/organizations/admin/scopes`);
    await page.getByRole("button", { name: "Add Scope Type" }).first().waitFor({ timeout: 240000 });
    await page.getByRole("button", { name: "Add Scope Type" }).first().click();
    const dlg = page.locator('[role="dialog"]').last();
    await dlg.getByPlaceholder("Client", { exact: true }).fill(LENS_TYPE.singular);
    await dlg.getByPlaceholder("Clients", { exact: true }).fill(LENS_TYPE.plural);
    await dlg.getByPlaceholder("What goes here?").fill("Where customers drop off equipment");
    await dlg.locator('button[type="submit"]').last().click();
    await dlg.waitFor({ state: "hidden", timeout: 60000 }).catch(() => undefined);
    const created = await seen(LENS_TYPE.plural, 60000);
    await shot("lens-type-created");
    const docId = await page.evaluate(() => { window.__sameSession = Math.random().toString(36).slice(2); return window.__sameSession; });
    // Client-side route change — the same document, the same store.
    where = "/chat/new (client-side)";
    await page.evaluate(() => {
      const r = window.next?.router;
      if (r?.push) r.push("/chat/new"); else throw new Error("no next router");
    });
    await page.waitForURL((u) => u.pathname.startsWith("/chat"), { timeout: 240000, waitUntil: "commit" });
    const chip = page.getByRole("button", { name: /^ASW\b/ }).first();
    await until("lens chip", async () => (await chip.count()) > 0, 120000);
    const sameSession = (await page.evaluate(() => window.__sameSession)) === docId;
    await chip.click();
    // Filter the lens tree to the new type; the type row reads "All <plural>" (the
    // "Created “Pickup Zones”" toast never matches this anchored pattern).
    await page.getByPlaceholder("Search…").last().fill("Pickup");
    const listed = (await until("lens lists the new type", async () => (await page.getByText(new RegExp(`^(All )?${LENS_TYPE.plural}$`)).count()) > 0, 60000)).v === true;
    await shot("lens-chip-lists-type-same-session");
    step({ step: "C lens chip lists a type created in the same page session", created, sameSession, listed });
    await page.keyboard.press("Escape");
    save();
  }
} catch (e) {
  step({ step: "FAILED", where, error: String(e).slice(0, 500) });
  await shot("failure").catch(() => {});
} finally {
  save();
  await browser.close();
}

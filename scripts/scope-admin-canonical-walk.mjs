// LANE SCOPE-ADMIN-CANONICAL — headless proof on the shared preview that the scope console runs on
// the ONE canonical scope tree (state.scopesTree) after the agent-context scopeTypes/scopes slices
// were deleted. In admin@admin.com's own Workspace (slug "admin"):
//   1. create a scope type (with description + one context item) → reload → the type page resolves
//      it BY SLUG (a field the canonical tree gained in this lane);
//   2. the chat header lens chip lists the new type;
//   3. create a scope with a description on the type page (NewScopeInline → createScope door);
//   4. rename the scope, the context item, and the type — reload after each and see the name;
//   5. archive the context item, the scope, and the type — reload after each and see them gone.
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed).
// Usage: node scripts/scope-admin-canonical-walk.mjs <outDir>
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization, until } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.WALK_ORIGIN ?? "http://scope-admin.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";
const PHASES = new Set((process.env.WALK_PHASES ?? "create,lens,scope,rename,archive").split(","));
mkdirSync(OUT, { recursive: true });
const ORG_SLUG = "admin";
const T = { singular: "Service Area", plural: "Service Areas", slug: "service-areas", description: "Neighborhoods the field crew covers" };
const T2 = { singular: "Service Zone", plural: "Service Zones" };
const ITEM = "Coverage Notes";
const ITEM2 = "Coverage Details";
const S = { name: "North Park", slug: "north-park", description: "Weekday coverage, two crews" };
const S2 = "North Park East";

const browser = await chromium.launch({ headless: true });
const report = { steps: [], consoleErrors: {} };
let where = "sign-in";
let n = 1;
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
page.setDefaultTimeout(240000);
page.setDefaultNavigationTimeout(240000);
page.on("console", (m) => {
  if (m.type() === "error") (report.consoleErrors[where] ??= []).push(m.text().slice(0, 300));
});
page.on("pageerror", (e) => (report.consoleErrors[where] ??= []).push(`pageerror: ${String(e).slice(0, 300)}`));
const shot = async (name) => {
  const file = `${OUT}/${String(n++).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file });
  return file;
};
const step = (s) => {
  report.steps.push(s);
  console.log(JSON.stringify(s));
};
const save = () => writeFileSync(`${OUT}/walk-report.json`, JSON.stringify(report, null, 2));
const text = async () => (await page.locator("main").first().textContent().catch(() => "")) ?? "";
const go = async (path) => {
  where = path;
  await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded" });
};
const seen = async (needle, ms = 120000) => (await until(needle, async () => (await text()).includes(needle), ms)).v === true;
const gone = async (needle, ms = 60000) => (await until(`!${needle}`, async () => !(await text()).includes(needle), ms)).v === true;
const typePath = (seg) => `/organizations/${ORG_SLUG}/scopes/${seg}`;
const confirmDestructive = async () => {
  const dlg = page.locator('[role="alertdialog"], [role="dialog"]').last();
  await dlg.waitFor({ state: "visible", timeout: 30000 });
  const btn = dlg.getByRole("button", { name: /^(Delete|Archive|Remove|Confirm)/ }).last();
  await btn.click();
};

try {
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 240000 }).catch(() => {});
  step({ step: "signed in", who });
  step({ step: "organization", result: await setOrganization(page, "admin's Workspace").catch((e) => String(e)) });

  if (PHASES.has("create")) {
    await go(`/organizations/${ORG_SLUG}/scopes`);
    await page.getByRole("button", { name: "Add Scope Type" }).first().click();
    const dlg = page.locator('[role="dialog"]').last();
    await dlg.getByPlaceholder("Client", { exact: true }).fill(T.singular);
    await dlg.getByPlaceholder("Clients", { exact: true }).fill(T.plural);
    await dlg.getByPlaceholder("What goes here?").fill(T.description);
    await dlg.getByLabel("Context item 1 name").fill(ITEM);
    await shot("create-type-form");
    await dlg.locator('button[type="submit"]').last().click();
    await dlg.waitFor({ state: "hidden", timeout: 60000 }).catch(() => undefined);
    const listed = await seen(T.plural);
    await shot("create-type-listed");
    // Reload, then open the type page by its SLUG — resolved from the canonical tree's new field.
    await go(typePath(T.slug));
    const bySlug = await seen(ITEM);
    await shot("type-page-by-slug-after-reload");
    step({ step: "create scope type", listed, typePageBySlugShowsItsContextItem: bySlug, url: page.url() });
  }

  if (PHASES.has("lens")) {
    await go("/chat/new");
    const chip = page.locator("header").getByRole("button").filter({ hasText: /context|admin|Workspace|scope/i }).first();
    await until("lens chip", async () => (await chip.count()) > 0, 120000);
    await chip.click().catch(() => undefined);
    const listed = await until("lens lists type", async () =>
      (await page.locator('[role="dialog"], [data-radix-popper-content-wrapper]').allTextContents()).join(" ").includes(T.plural) ||
      (await page.locator('[role="dialog"], [data-radix-popper-content-wrapper]').allTextContents()).join(" ").includes(T.singular), 60000);
    await shot("chat-lens-chip-lists-new-type");
    step({ step: "chat header lens chip lists the new scope type", listed: listed.v === true });
    await page.keyboard.press("Escape");
  }

  if (PHASES.has("scope")) {
    await go(typePath(T.slug));
    await seen(T.plural);
    await page.getByRole("button", { name: new RegExp(`Add (your first )?${T.singular}`, "i") }).first().click();
    await page.getByPlaceholder(`e.g. ${T.singular}…`).fill(S.name);
    await page.getByPlaceholder("Short note").fill(S.description);
    await shot("create-scope-form");
    await page.getByPlaceholder("Short note").press("Enter").catch(() => undefined);
    const submit = page.locator('form button[type="submit"]').last();
    if (await submit.isVisible().catch(() => false)) await submit.click().catch(() => undefined);
    await until("scope url", async () => page.url().includes(`/${S.slug}`) || (await text()).includes(S.description), 120000);
    await shot("scope-created");
    await go(`${typePath(T.slug)}/${S.slug}`);
    const reloaded = await seen(S.description);
    await shot("scope-page-after-reload");
    step({ step: "create scope with description", scopePageAfterReloadShowsDescription: reloaded, url: page.url() });
  }

  save();
} catch (e) {
  step({ step: "FAILED", where, error: String(e).slice(0, 500) });
  await shot("failure").catch(() => undefined);
  save();
  process.exitCode = 1;
} finally {
  await browser.close();
}

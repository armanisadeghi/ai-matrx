// scripts/scopesoldwriters-walk.mjs — lane SCOPES-OLD-WRITERS, the owner-seat and member-seat WRITE walk.
//
// After the lane, every scope write a screen makes goes through the record store's scope doors (custom.context_*,
// SECURITY DEFINER now) and no client may call the seventeen old public write functions. This walk makes real
// writes from the two seats, the way a person does, on the shared preview (which serves the DEV CLONE — writes never
// reach production), and records every scope write request the browser sent, which door answered, and its status:
//
//   owner (admin@admin.com, owner of admin's Workspace)
//     O1 the organization's scopes page: add a scope type "Suppliers" (Vendors we buy parts from)
//     O2 add a supplier "Harbor Freight Tools" under it
//     O3 a class the owner runs (Physics 101): Invite students → Create a join code / New code → the code shows;
//        Turn off → "Code joining is off."
//   member (test@test.com, a member of admin's Workspace, not an admin, not the class owner)
//     M1 the same scopes page: add a supplier "Grainger Industrial" under Suppliers (a member may add a scope)
//     M2 the class page: no join-code controls for a person who does not own the class
//   owner, again
//     O4 archive the Suppliers type (the walk's own records leave; Trash can bring them back)
//
//   SEAT=owner|member|cleanup  WIDTH=1600|390  ORIGIN=http://scopes-old-writers.localhost:3001 node scripts/scopesoldwriters-walk.mjs
//
// Screens + JSON land in common-docs/operations/for-arman/2026-09-29/scopes-old-writers/.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { signIn, setOrganization, until, sleep } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.ORIGIN ?? "http://scopes-old-writers.localhost:3001";
const SEAT = process.env.SEAT ?? "owner";
const WIDTH = Number(process.env.WIDTH ?? 1600);
const SHOTS = process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-29/scopes-old-writers";
mkdirSync(SHOTS, { recursive: true });
const CLASS = "e8a6ba36-9a4f-4fc2-a2fb-60a4cddeddc0"; // Physics 101, admin@admin.com's class in admin's Workspace
const TYPE = { singular: "Supplier", plural: "Suppliers", about: "Vendors we buy parts from" };

const who = SEAT === "member"
  ? { email: env.AI_MEMBER_USERNAME, password: env.AI_MEMBER_PASSWORD }
  : { email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD };
if (!who.email || !who.password) throw new Error(`no credential for seat ${SEAT}`);

const out = { origin: ORIGIN, seat: SEAT, width: WIDTH, started: new Date().toISOString(), steps: [], writes: [], console_errors: [] };
const step = (name, result = {}) => { out.steps.push({ name, ...result }); console.log(`· ${name}`, JSON.stringify(result).slice(0, 500)); };
const save = () => writeFileSync(join(SHOTS, `walk-${SEAT}-${WIDTH}.json`), JSON.stringify(out, null, 2));

const OLD = /\/rest\/v1\/rpc\/(create_scope_type|update_scope_type|delete_scope_type|restore_scope_type|create_scope|update_scope|delete_scope|restore_scope|create_context_item|update_context_item|delete_context_item|restore_context_item|set_context_value|set_scope_context_value|apply_template|apply_template_by_key|set_entity_scopes)\b/;
const WRITE = /\/rest\/v1\/rpc\/(context_(type|scope|item|value|tags|template)_[a-z_]+|edu_class_[a-z_]+)\b/;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: WIDTH, height: WIDTH < 600 ? 844 : 1000 } });
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (/_next\/hmr|WebSocket connection/.test(t)) return;
  out.console_errors.push({ at: page.url().replace(ORIGIN, ""), text: t.slice(0, 300) });
});
page.on("response", async (res) => {
  const url = res.url();
  if (!OLD.test(url) && !WRITE.test(url)) return;
  let body = "";
  try { body = (await res.text()).slice(0, 300); } catch {}
  const name = (url.match(/\/rpc\/([a-z_]+)/) ?? [])[1];
  out.writes.push({ at: page.url().replace(ORIGIN, ""), rpc: name, old_door: OLD.test(url), status: res.status(), body });
});
const tag = `${SEAT}-${WIDTH}`;
const shot = (name) => page.screenshot({ path: join(SHOTS, `${tag}-${name}.png`) });
const body = () => page.evaluate(() => document.body.innerText);
const seen = async (needle, ms = 90000) => (await until(needle, async () => (await body()).includes(needle), ms)).v === true;


/** The Suppliers card's own add control ("Add your first supplier" when empty, "Add supplier" after), then its inline form. */
async function addScope(name, about) {
  const add = page.getByRole("button", { name: new RegExp(`^(Add your first ${TYPE.singular}|Add ${TYPE.singular})$`, "i") }).first();
  await add.scrollIntoViewIfNeeded({ timeout: 60000 });
  await add.click();
  const nameBox = page.getByPlaceholder(`e.g. ${TYPE.singular}…`).first();
  await nameBox.waitFor({ timeout: 60000 });
  await nameBox.fill(name);
  await page.getByPlaceholder("Short note").first().fill(about);
  await page.getByRole("button", { name: new RegExp(`^Add ${TYPE.singular}$`) }).last().click();
  await sleep(2000);
}

try {
  const signed = await signIn(page, ORIGIN, who.email, who.password, SEAT);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 240000 }).catch(() => {});
  step("signed in", { who: signed });
  step("organization", { result: await setOrganization(page, "admin's Workspace").catch((e) => String(e)) });

  if (SEAT === "owner") {
    await page.goto(`${ORIGIN}/organizations/admin/scopes`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Add Scope Type" }).first().waitFor({ timeout: 240000 });
    if (!(await body()).includes(TYPE.plural)) {
      await page.getByRole("button", { name: "Add Scope Type" }).first().click();
      const dlg = page.locator('[role="dialog"]').last();
      await dlg.getByPlaceholder("Client", { exact: true }).fill(TYPE.singular);
      await dlg.getByPlaceholder("Clients", { exact: true }).fill(TYPE.plural);
      await dlg.getByPlaceholder("What goes here?").fill(TYPE.about);
      await dlg.locator('button[type="submit"]').last().click();
      await dlg.waitFor({ state: "hidden", timeout: 60000 }).catch(() => undefined);
    }
    const typeMade = await seen(TYPE.plural, 60000);
    await shot("o1-type-added");
    step("O1 owner adds the scope type Suppliers", { typeMade });

    await addScope("Harbor Freight Tools", "Hand tools and shop supplies, net-30");
    const scopeMade = await seen("Harbor Freight Tools", 60000);
    await shot("o2-scope-added");
    step("O2 owner adds the supplier Harbor Freight Tools", { scopeMade });
    save();

    await page.goto(`${ORIGIN}/education/classes/${CLASS}`, { waitUntil: "domcontentloaded" });
    await seen("Physics 101", 120000);
    const invite = page.getByRole("button", { name: /invite/i }).first();
    await invite.waitFor({ timeout: 120000 });
    await invite.click();
    await seen("Join code", 60000);
    await shot("o3a-invite-sheet");
    const make = page.getByRole("button", { name: /^(Create a join code|New code)$/ }).first();
    await make.click();
    const codeShown = (await until("a code", async () => (await body()).includes("Copy join link"), 60000)).v === true;
    await shot("o3b-code-made");
    await page.getByRole("button", { name: /^Turn off$/ }).first().click();
    const off = await seen("Code joining is off.", 60000);
    await shot("o3c-code-off");
    step("O3 owner makes a join code, then turns code joining off", { codeShown, off });
  }

  if (SEAT === "member") {
    await page.goto(`${ORIGIN}/organizations/admin/scopes`, { waitUntil: "domcontentloaded" });
    const listed = await seen(TYPE.plural, 240000);
    await shot("m1a-member-sees-suppliers");
    await addScope("Grainger Industrial", "Safety gear and fasteners");
    const memberMade = await seen("Grainger Industrial", 60000);
    await shot("m1b-member-added-a-supplier");
    step("M1 a member adds the supplier Grainger Industrial", { listed, memberMade });
    save();

    await page.goto(`${ORIGIN}/education/classes/${CLASS}`, { waitUntil: "domcontentloaded" });
    await sleep(15000);
    const text = await body();
    const ownerControls = /Create a join code|New code|Turn off/.test(text);
    await shot("m2-member-class-page");
    step("M2 a member who does not own the class meets no join-code controls", { ownerControls, excerpt: text.replace(/\s+/g, " ").slice(0, 300) });
  }

  if (SEAT === "cleanup") {
    await page.goto(`${ORIGIN}/organizations/admin/scopes`, { waitUntil: "domcontentloaded" });
    await seen(TYPE.plural, 240000);
    await page.getByRole("button", { name: `Edit ${TYPE.plural}` }).first().click();
    const sheet = page.locator('[role="dialog"]:visible').last();
    await sheet.waitFor({ timeout: 60000 });
    await sleep(1500);
    await shot("o4a-edit-sheet");
    const labels = await sheet.getByRole("button").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") || e.innerText || "").trim()));
    step("edit sheet buttons", { labels });
    await sheet.getByRole("button", { name: /archive|delete/i }).first().click();
    await sleep(1500);
    await shot("o4b-confirm");
    const confirm = page.locator('[role="alertdialog"]:visible, [role="dialog"]:visible').last();
    await confirm.getByRole("button", { name: /archive|delete|confirm|yes/i }).last().click();
    await sleep(4000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(8000);
    const gone = !(await body()).includes(TYPE.plural);
    await shot("o4-type-archived");
    step("O4 owner archives the walk's Suppliers type", { gone });
  }
} catch (e) {
  step("ERROR", { where: page.url().replace(ORIGIN, ""), error: String(e).slice(0, 400) });
  await shot("error").catch(() => undefined);
} finally {
  out.old_door_requests = out.writes.filter((w) => w.old_door).length;
  out.failed_writes = out.writes.filter((w) => w.status >= 400);
  out.finished = new Date().toISOString();
  save();
  console.log(`writes ${out.writes.length} · old-door requests ${out.old_door_requests} · failed ${out.failed_writes.length} · console errors ${out.console_errors.length}`);
  await browser.close();
}

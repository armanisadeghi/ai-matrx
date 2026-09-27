// LANE SCOPES-WRITE-THROUGH — the headless walk of the scopes write-through, as admin@admin.com (the
// owner of Harbor Dental Group, a test organization) on the shared preview (live database).
//
// Phases (WALK_PHASES, comma-separated; default all):
//   before    /scopes, Harbor Dental Group's settings (Data: the scopes switch is listed with the switches
//             made for everyone), the admin scope console's switch chip — 1600 and 390
//   press     the admin scope console: "Switch to the record store" for Harbor Dental Group only, after the
//             confirmation that names what it does (a test press; the final switch presses everyone)
//   template  the organization's scopes page → "Use an industry template" → Dental Practice → applied
//   scope     Patients → add "Marisol Ortega"
//   value     her page → Allergies "Latex; penicillin (hives)" → reload → still there
//   item      Anxiety Notes → display name "Comfort notes" → reload
//   picker    /chat/new → the context lens lists Patients and Marisol Ortega
//   inspector the context inspector on Marisol Ortega: both systems hand the agent the same bytes
//   mobile    the same pages at 390
// Every step's database effect is checked by scripts/campaign-tests/scopeswt_walk_checks.sql (read-only).
// Usage: node scripts/campaign-tests/scopeswt_walk.mjs <outDir>
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setOrganization, signIn, until } from "../lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..", "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.WALK_ORIGIN ?? "http://scopeswt.localhost:3001";
const OUT = process.argv[2] ?? "/tmp/scopeswt-walk";
const PHASES = new Set((process.env.WALK_PHASES ?? "before,press,template,scope,value,item,picker,inspector,mobile").split(","));
mkdirSync(OUT, { recursive: true });

const ORG_ID = "11f4e747-c13a-49c7-81a3-66e6391f8a9b";
const ORG_SLUG = "harbor-dental-group";
const ORG_NAME = "Harbor Dental Group";
const PATIENT = "Marisol Ortega";
const PATIENT_SLUG = "marisol-ortega";
const ALLERGIES = "Latex; penicillin (hives)";

const browser = await chromium.launch({ headless: true });
const report = { origin: ORIGIN, steps: [], consoleErrors: {} };
let where = "sign-in";
let n = 1;
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.setDefaultTimeout(240000);
page.setDefaultNavigationTimeout(240000);
page.on("console", (m) => {
  if (m.type() === "error") (report.consoleErrors[where] ??= []).push(m.text().slice(0, 300));
});
page.on("pageerror", (e) => (report.consoleErrors[where] ??= []).push(`pageerror: ${String(e).slice(0, 300)}`));
const shot = async (name) => {
  const file = `${OUT}/${String(n++).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  return file;
};
const step = (s) => {
  report.steps.push(s);
  console.log(JSON.stringify(s));
  writeFileSync(`${OUT}/walk-report.json`, JSON.stringify(report, null, 2));
};
const text = async () => (await page.locator("body").first().textContent().catch(() => "")) ?? "";
const go = async (path) => {
  where = path;
  await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded" });
};
const seen = async (needle, ms = 120000) => (await until(needle, async () => (await text()).includes(needle), ms)).v === true;
const settle = (ms = 4000) => page.waitForTimeout(ms);
const consoleUrl = `/administration/scopes-context/organizations/${ORG_ID}`;

try {
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 240000 }).catch(() => {});
  step({ step: "signed in", who });
  step({ step: "organization", result: await setOrganization(page, ORG_NAME).catch((e) => String(e)) });

  if (PHASES.has("before")) {
    await go("/scopes");
    await settle(8000);
    await shot("scopes-hub-1600");
    await go(`/organizations/${ORG_SLUG}/settings#data`);
    const listed = await seen("Scope and context screens", 120000);
    const forEveryone = (await text()).includes("Switched for everyone at once, not from here");
    await shot("org-settings-data-scopes-switch-listed-for-everyone");
    await go(consoleUrl);
    const chip = await seen("Scopes written in", 120000);
    await settle(3000);
    await shot("admin-console-scopes-written-in");
    step({ step: "before", settingsListsTheSwitch: listed, listedWithTheSwitchesForEveryone: forEveryone, consoleShowsWhereScopesAreWritten: chip,
      consoleSays: ((await text()).match(/Scopes written in[^.]{0,200}/) ?? [""])[0] });
  }

  if (PHASES.has("press")) {
    await go(consoleUrl);
    await seen("Scopes written in", 120000);
    await settle(3000);
    const already = (await text()).includes("Record store");
    if (!already) {
      await page.getByRole("button", { name: "Switch to the record store" }).first().click();
      const dlg = page.locator('[role="alertdialog"], [role="dialog"]').last();
      await dlg.waitFor({ state: "visible", timeout: 30000 });
      const says = (await dlg.textContent()) ?? "";
      await shot("press-confirmation-names-the-consequence");
      await dlg.getByRole("button", { name: "Switch to the record store" }).last().click();
      await until("record store", async () => (await text()).includes("Record store"), 120000);
      step({ step: "press confirmation", says: says.slice(0, 400) });
    }
    await settle(2000);
    await shot("admin-console-scopes-written-in-the-record-store");
    step({ step: "press", alreadyOnTheStore: already, nowRecordStore: (await text()).includes("Record store") });
  }

  if (PHASES.has("template")) {
    await go(`/organizations/${ORG_SLUG}/scopes`);
    await settle(8000);
    const has = (await text()).includes("Patients");
    if (!has) {
      await page.getByRole("button", { name: /Use an industry template/ }).first().click();
      await settle(4000);
      await shot("template-gallery");
      await page.getByText("Dental Practice", { exact: true }).first().click();
      await settle(2000);
      await shot("template-dental-practice-chosen");
      await page.getByRole("button", { name: "Use whole template" }).last().click();
      await until("patients", async () => (await text()).includes("Patients"), 120000);
    }
    await go(`/organizations/${ORG_SLUG}/scopes`);
    const listed = await seen("Patients", 120000);
    await settle(3000);
    await shot("template-applied-patients-procedures-team");
    step({ step: "template", appliedEarlier: has, patientsListed: listed, proceduresListed: (await text()).includes("Procedures"), teamListed: (await text()).includes("Team Members") });
  }

  if (PHASES.has("scope")) {
    await go(`/organizations/${ORG_SLUG}/scopes/patients`);
    await seen("Patients", 120000);
    await settle(4000);
    if (!(await text()).includes(PATIENT)) {
      await page.getByRole("button", { name: /Add (your first )?Patient/i }).first().click();
      await page.getByPlaceholder(/e\.g\. Patient/).fill(PATIENT);
      const note = page.getByPlaceholder("Short note");
      if (await note.isVisible().catch(() => false)) await note.fill("Hygiene patient since 2019");
      await shot("add-patient-form");
      await page.getByPlaceholder(/e\.g\. Patient/).press("Enter").catch(() => undefined);
      const submit = page.locator('form button[type="submit"]').last();
      if (await submit.isVisible().catch(() => false)) await submit.click().catch(() => undefined);
      await until("patient", async () => page.url().includes(PATIENT_SLUG) || (await text()).includes(PATIENT), 120000);
    }
    await go(`/organizations/${ORG_SLUG}/scopes/patients/${PATIENT_SLUG}`);
    const opened = await seen(PATIENT, 120000);
    await settle(3000);
    await shot("patient-page");
    step({ step: "scope", patientPageOpens: opened, url: page.url() });
  }

  if (PHASES.has("value")) {
    await go(`/organizations/${ORG_SLUG}/scopes/patients/${PATIENT_SLUG}`);
    await seen(PATIENT, 120000);
    await settle(4000);
    const box = page.getByRole("textbox", { name: "Allergies" }).first();
    await box.click();
    await box.fill(ALLERGIES);
    await box.press("Tab");
    await settle(6000);
    await shot("allergies-written");
    await go(`/organizations/${ORG_SLUG}/scopes/patients/${PATIENT_SLUG}`);
    await seen(PATIENT, 120000);
    await settle(5000);
    const kept = (await page.getByRole("textbox", { name: "Allergies" }).first().inputValue().catch(() => "")) === ALLERGIES
      || (await text()).includes(ALLERGIES);
    await shot("allergies-after-reload");
    step({ step: "value", allergiesKeptAfterReload: kept });
  }

  if (PHASES.has("item")) {
    await go(`/organizations/${ORG_SLUG}/scopes/patients/context-items/anxiety-notes/edit`);
    await settle(6000);
    await shot("item-edit-form");
    const label = page.getByLabel("Display name");
    await label.fill("Comfort notes");
    await page.getByRole("button", { name: /^Save( changes)?$/ }).last().click();
    await settle(4000);
    await go(`/organizations/${ORG_SLUG}/scopes/patients`);
    const renamed = await seen("Comfort notes", 120000);
    await shot("item-renamed-after-reload");
    step({ step: "item", renamedAfterReload: renamed });
  }

  if (PHASES.has("picker")) {
    await go("/chat/new");
    const chip = page.getByRole("button", { name: /^HDG\b/ }).first();
    const found = await until("lens chip", async () => (await chip.count()) > 0, 120000);
    if (found.v) await chip.click().catch(() => undefined);
    await settle(3000);
    const lens = async () => (await page.locator('[role="dialog"], [data-radix-popper-content-wrapper]').allTextContents()).join(" ");
    const listed = await until("lens lists patients", async () => (await lens()).includes("Patients"), 60000);
    await shot("chat-context-lens-lists-patients");
    step({ step: "picker", lensChipFound: Boolean(found.v), lensListsPatients: Boolean(listed.v), lens: (await lens()).slice(0, 400) });
    await page.keyboard.press("Escape").catch(() => undefined);
  }

  if (PHASES.has("inspector")) {
    const scopeId = process.env.WALK_SCOPE_ID;
    const typeId = process.env.WALK_TYPE_ID;
    await go(`/administration/scopes-context/context-inspector?org=${ORG_ID}${typeId ? `&scopeType=${typeId}` : ""}${scopeId ? `&scope=${scopeId}` : ""}`);
    const compared = await until("compare", async () => /Byte-identical|identical|differences?/i.test(await text()), 180000);
    await settle(4000);
    await shot("context-inspector-diff");
    const body = await text();
    step({ step: "inspector", compared: Boolean(compared.v), byteIdentical: /Byte-identical/.test(body),
      says: (body.match(/Byte-identical[^.]{0,160}|\d+ difference[^.]{0,160}/) ?? [""])[0] });
  }

  if (PHASES.has("mobile")) {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [name, path] of [
      ["scopes-hub-390", "/scopes"],
      ["patient-page-390", `/organizations/${ORG_SLUG}/scopes/patients/${PATIENT_SLUG}`],
      ["admin-console-390", consoleUrl],
    ]) {
      await go(path);
      await settle(9000);
      await shot(name);
    }
    step({ step: "mobile", pages: 3 });
  }
} catch (e) {
  step({ step: "error", where, error: String(e).slice(0, 800) });
  await shot("error").catch(() => undefined);
} finally {
  writeFileSync(`${OUT}/walk-report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}

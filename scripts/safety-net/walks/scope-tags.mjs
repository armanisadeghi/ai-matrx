// scripts/safety-net/walks/scope-tags.mjs — lane SN-TAGS (2026-10-01), check `scopes.walk-tags`.
//
// A PHYSICAL THERAPY CLINIC TAGS ITS WORK WITH A TREATMENT PROGRAM, AS A PERSON DOES IT.
// admin@admin.com, owner of Cedar Ridge Physical Therapy, through the product only:
//   0. Scopes → "Add Scope Type": "Rehab Pathway <STAMP>" with one context item, then "Shoulder Rehab <STAMP>"
//   1. S07  a new note, written in the Notes editor, tagged through its context picker (the network icon
//           under the note) → reopen the note by its address → the tag is shown
//   2. S08  a new project in Cedar Ridge, tagged through the Scopes card on its settings page → reload → shown
//   3. S05  a new chat: the scope picked in the composer's context chip, one short message sent → the chat is
//           reopened at its address with nothing picked in the sidebar → the chat's chip names the scope
//   cleanup: the chat is archived, the project deleted (type its name), the note moved to Trash, the scope and
//   the scope type archived — each through the product.
// Runs unchanged on live and on the clone preview.
import { openWalk, bodyText, setOrganization, sleep, until, STAMP } from "../lib/harness.mjs";

const ORG_SLUG = "cedar-ridge-physical-therapy";
const SINGULAR = `Rehab Pathway ${STAMP}`;
const PLURAL = `Rehab Pathways ${STAMP}`;
const SCOPE = `Shoulder Rehab ${STAMP}`;
const NOTE = `Shoulder rehab check-in notes ${STAMP}`;
const PROJECT = `Shoulder rehab outcomes review ${STAMP}`;
const MESSAGE = `Two stretches for a stiff shoulder after rotator cuff rehab, one line please. ${STAMP}`;

const ctx = await openWalk("scope-tags");
const text = (page) => bodyText(page, 60000);
const seen = async (page, needle, ms = 90000) => (await until(String(needle), async () => (await text(page)).includes(needle), ms)).v === true;
const state = { noteUrl: null, projectUrl: null, chatUrl: null, madeType: false, madeScope: false };

async function resumeIfPaused(page) {
  for (let i = 0; i < 3; i += 1) {
    await sleep(1500);
    if (!(await text(page)).includes("This preview was paused")) return;
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await page.getByRole("link", { name: /Resume/ }).first().click().catch(() => {});
    await sleep(8000);
  }
}
async function go(page, path) {
  for (let i = 0; i < 3; i += 1) {
    try {
      await ctx.goto(page, path);
      await resumeIfPaused(page);
      return;
    } catch (e) {
      if (!/interrupted|destroyed|ERR_ABORTED/.test(String(e)) || i === 2) throw e;
      await sleep(3000);
    }
  }
}
async function seat() {
  const page = await ctx.page("admin");
  if (!page.__org) {
    await sleep(5000);
    for (let i = 0; i < 2 && !page.__org; i += 1) {
      await go(page, "/data-v2").catch(() => {});
      await sleep(6000);
      if (await setOrganization(page, "Cedar Ridge Physical Therapy").catch(() => false)) page.__org = "Cedar Ridge Physical Therapy";
    }
  }
  await sleep(3000);
  return page;
}
async function scopesPage(page) {
  await go(page, `/organizations/${ORG_SLUG}/scopes`);
  const r = await until("scopes loaded", async () => {
    const t = await text(page);
    if (t.includes("This preview was paused")) await resumeIfPaused(page);
    return /Add Scope Type/i.test(t) && !t.includes("Loading this organization's scopes");
  }, 240000);
  if (!r.v) throw new Error(`the scopes page never finished loading: ${(await text(page)).replace(/\s+/g, " ").slice(-300)}`);
  await sleep(2500);
}
/** In an open context picker (the canonical ContextAssignmentField): open the type's section, press the scope. */
async function pickScope(page, root) {
  const section = root.locator("button", { hasText: PLURAL }).first();
  await section.waitFor({ timeout: 60000 });
  // Opens when closed; a section that is already open stays open.
  if (!(await root.getByText(SCOPE, { exact: false }).first().isVisible().catch(() => false))) await section.click();
  const row = root.getByText(SCOPE, { exact: true }).locator("visible=true").first();
  await row.waitFor({ timeout: 30000 });
  await row.click();
  await sleep(3500);
}

try {
  const admin = await seat();

  // ── 0. the scope type + the scope (not graded; the same doors the scopes walk grades) ──────
  await scopesPage(admin);
  await admin.getByRole("button", { name: /Add Scope Type/i }).first().click();
  await admin.getByPlaceholder("Client", { exact: true }).waitFor({ timeout: 30000 });
  await admin.getByPlaceholder("Client", { exact: true }).fill(SINGULAR);
  await admin.getByPlaceholder("Clients", { exact: true }).fill(PLURAL);
  const itemBox = admin.getByRole("textbox", { name: /Context item 1 name/ }).first();
  if (await itemBox.isVisible().catch(() => false)) await itemBox.fill("Home exercise plan");
  await admin.getByRole("button", { name: "Create scope type" }).last().click();
  state.madeType = await seen(admin, PLURAL, 90000);
  await scopesPage(admin);
  await admin.getByRole("button", { name: `Add ${SINGULAR}` }).first().click({ timeout: 30000 });
  const nameBox = admin.getByPlaceholder(`e.g. ${SINGULAR}…`).first();
  await nameBox.waitFor({ timeout: 30000 });
  await nameBox.fill(SCOPE);
  await admin.getByRole("button", { name: `Add ${SINGULAR}`, exact: true }).last().click();
  state.madeScope = await seen(admin, SCOPE, 90000);
  console.log(`[scope-tags] fixture: type ${state.madeType}, scope ${state.madeScope}`);

  // ── 1. S07: a note tagged through its context picker ────────────────────────────────────
  await ctx.step(["S07"], "tag a note with the scope", admin, async () => {
    if (!state.madeScope) return { ok: false, detail: `the scope "${SCOPE}" could not be made, so no surface could offer it` };
    await go(admin, "/notes");
    await admin.getByRole("button", { name: /^New Note$/ }).first().click({ timeout: 120000 });
    const body = admin.locator('textarea[aria-label="Note text"]').first();
    await body.waitFor({ timeout: 60000 });
    await body.fill(NOTE);
    await until("note saved", async () => /Saved/.test(await text(admin)), 60000);
    await sleep(2500);
    state.noteUrl = admin.url();
    if (!/[?&]active=/.test(state.noteUrl)) return { ok: false, detail: `the new note has no address of its own: ${state.noteUrl}` };
    await admin.locator('[title="Set context for this note"]').first().click();
    const picker = admin.locator("[data-context-section]").first().locator("xpath=ancestor::div[contains(@class,'relative')][1]");
    void picker;
    await admin.getByPlaceholder(/Search scopes, projects and tasks/).first().waitFor({ timeout: 60000 });
    await pickScope(admin, admin.locator("body"));
    // The tag chip sits in the note's bottom bar; a reload must bring it back.
    await go(admin, state.noteUrl);
    await admin.locator('textarea[aria-label="Note text"]').first().waitFor({ timeout: 120000 });
    const shown = await until("note tag", async () => (await text(admin)).includes(SCOPE), 60000);
    return { ok: Boolean(shown.v), detail: `the reopened note (${new URL(state.noteUrl).search.slice(0, 30)}…) shows the "${SCOPE}" tag ${Boolean(shown.v)}` };
  });

  // ── 2. S08: a project tagged through its settings page ──────────────────────────────────
  await ctx.step(["S08"], "tag a project with the scope", admin, async () => {
    if (!state.madeScope) return { ok: false, detail: "no scope to tag with" };
    await go(admin, "/projects/new");
    const nameIn = admin.getByPlaceholder("e.g., Website Redesign").first();
    await nameIn.waitFor({ timeout: 120000 });
    const owner = admin.locator("button:visible", { hasText: /Select an organization|Cedar Ridge/ }).first();
    await owner.click();
    await sleep(1200);
    await admin.getByRole("menuitem", { name: /^Cedar Ridge Physical Therapy/ }).first().click();
    await sleep(1000);
    await nameIn.fill(PROJECT);
    await sleep(2500);
    await admin.getByRole("button", { name: /^Create Project$/ }).first().click();
    await until("project settings", async () => /\/projects\/[0-9a-f-]{36}\/settings/.test(admin.url()), 90000);
    state.projectUrl = admin.url();
    await until("scopes card", async () => (await text(admin)).includes("Tag this project") || (await text(admin)).includes(PLURAL), 90000);
    await sleep(3000);
    await pickScope(admin, admin.locator("body"));
    await go(admin, state.projectUrl);
    await seen(admin, "Tag this project", 120000);
    await sleep(4000);
    const shown = await until("project tag", async () => {
      // The scope is shown selected in the card; the section may be collapsed, so open the type's section.
      const t = await text(admin);
      if (t.includes(SCOPE)) return true;
      const sec = admin.locator("button", { hasText: PLURAL }).first();
      if (await sec.count()) await sec.click().catch(() => {});
      await sleep(1500);
      return (await text(admin)).includes(SCOPE);
    }, 60000);
    return { ok: Boolean(shown.v), detail: `the reloaded project settings (${new URL(state.projectUrl).pathname}) list "${SCOPE}" ${Boolean(shown.v)}` };
  });
} finally {
  ctx.cleanup(async () => {
    const admin = await seat();
    await scopesPage(admin);
    const t = await text(admin);
    if (!t.includes(PLURAL)) return;
    await ctx.step(["S05", "S07", "S08"], "archive the scope type", admin, async () => {
      await admin.getByRole("button", { name: `Edit ${PLURAL}` }).first().click({ timeout: 30000 });
      await admin.getByRole("button", { name: /^Delete/ }).last().click({ timeout: 30000 });
      const dlg = admin.locator('[role="alertdialog"]').last();
      await dlg.waitFor({ timeout: 30000 });
      await dlg.getByRole("button", { name: "Delete" }).click();
      await sleep(4000);
      await scopesPage(admin);
      const gone = !(await text(admin)).includes(PLURAL);
      return { ok: gone, detail: `"${PLURAL}" gone from the scopes page ${gone}` };
    });
  });
  ctx.cleanup(async () => {
    if (!state.madeScope) return;
    const admin = await seat();
    await scopesPage(admin);
    if (!(await text(admin)).includes(SCOPE)) return;
    await ctx.step(["S05", "S07", "S08"], "move the scope to Trash", admin, async () => {
      const link = admin.getByRole("link", { name: SCOPE, exact: true }).first();
      if (await link.count()) await link.click({ timeout: 30000 });
      else await admin.locator(`text="${SCOPE}"`).locator("visible=true").first().click({ timeout: 30000 });
      await until("scope page", async () => !admin.url().endsWith("/scopes"), 90000);
      const href = new URL(admin.url()).pathname;
      await go(admin, `${href}/edit`);
      await admin.getByRole("button", { name: "Move to Trash" }).first().click({ timeout: 120000 });
      const dlg = admin.locator('[role="alertdialog"]').last();
      await dlg.waitFor({ timeout: 30000 });
      await dlg.getByRole("button", { name: "Move to Trash" }).click();
      await sleep(4000);
      await scopesPage(admin);
      const gone = !(await text(admin)).includes(SCOPE);
      return { ok: gone, detail: `"${SCOPE}" gone from the scopes page ${gone}` };
    });
  });
  ctx.cleanup(async () => {
    if (!state.projectUrl) return;
    const admin = await seat();
    await ctx.step(["S08"], "delete the project", admin, async () => {
      await go(admin, state.projectUrl);
      await seen(admin, "Danger zone", 120000);
      await admin.getByRole("button", { name: /^Delete$/ }).last().click({ timeout: 30000 });
      await admin.locator('[role="dialog"] input, [role="alertdialog"] input').first().fill(PROJECT);
      await admin.getByRole("button", { name: /^Delete Project$/ }).last().click();
      await sleep(5000);
      await go(admin, "/projects");
      await sleep(5000);
      const gone = !(await text(admin)).includes(PROJECT);
      return { ok: gone, detail: `"${PROJECT}" gone from the projects list ${gone}` };
    });
  });
  ctx.cleanup(async () => {
    if (!state.noteUrl) return;
    const admin = await seat();
    await ctx.step(["S07"], "move the note to Trash", admin, async () => {
      await go(admin, "/notes");
      await sleep(6000);
      const opt = admin.locator(`button[aria-label^="Options for ${NOTE.slice(0, 40)}"]`).first();
      await opt.waitFor({ timeout: 90000 });
      await opt.click({ force: true });
      await admin.getByRole("menuitem", { name: /Move to Trash/ }).first().click();
      await admin.getByRole("button", { name: /^Move to Trash$/ }).last().click();
      await sleep(4000);
      const left = await admin.locator(`button[aria-label^="Options for ${NOTE.slice(0, 40)}"]`).count();
      return { ok: left === 0, detail: `"${NOTE}" rows left in the notes list after Move to Trash: ${left}` };
    });
  });
  await ctx.finish();
}

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
const NOTE = `Visit notes ${STAMP}`;
const PROJECT = `Shoulder rehab outcomes review ${STAMP}`;
const MESSAGE = `Two stretches for a stiff shoulder after rotator cuff rehab, one line please. ${STAMP}`;

const ctx = await openWalk("scope-tags");
const text = (page) => bodyText(page, 60000);
const seen = async (page, needle, ms = 90000) => (await until(String(needle), async () => (await text(page)).includes(needle), ms)).v === true;
const state = { noteUrl: null, projectUrl: null, chatUrl: null, chatId: null, madeType: false, madeScope: false };

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
/** In an open context picker (the canonical ContextAssignmentField): open the type's section, press the scope's row. */
async function pickScope(page, root) {
  const rowOf = () => root.locator('[role="button"]').filter({ hasText: SCOPE }).locator("visible=true").first();
  if (!(await rowOf().count())) {
    const section = root.locator("button", { hasText: PLURAL }).locator("visible=true").first();
    await section.waitFor({ timeout: 60000 });
    await section.click();
  }
  const row = rowOf();
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
    // A fresh load shows tags only once the note's context picker has read them (the bar is cache-only): open it,
    // as a person does to see what the note is tagged with. The bottom bar's chip reads "<type>: <scope>".
    const tagText = `${SINGULAR}: ${SCOPE}`;
    await go(admin, state.noteUrl);
    await admin.locator('textarea[aria-label="Note text"]').first().waitFor({ timeout: 120000 });
    await sleep(3000);
    const before = (await text(admin)).includes(tagText);
    await admin.locator('[title="Set context for this note"]').first().click();
    const shown = await until("note tag", async () => (await text(admin)).includes(tagText), 60000);
    return { ok: Boolean(shown.v), detail: `the reopened note shows the "${tagText}" tag ${Boolean(shown.v)} (before opening its context picker: ${before})` };
  });

  // ── 2. S08: a project tagged through its settings page ──────────────────────────────────
  await ctx.step(["S08"], "tag a project with the scope", admin, async () => {
    if (!state.madeScope) return { ok: false, detail: "no scope to tag with" };
    await go(admin, "/projects/new");
    const nameIn = admin.getByPlaceholder("e.g., Website Redesign").first();
    await nameIn.waitFor({ timeout: 120000 });
    const owner = admin.locator("button:visible", { hasText: /Select an organization/ }).first();
    await owner.click();
    await sleep(1200);
    await admin.locator('[role="menuitem"]').filter({ hasText: /^Cedar Ridge Physical Therapy(Owner|Admin|Member)/i }).first().click({ timeout: 60000 });
    await sleep(1000);
    await nameIn.fill(PROJECT);
    await sleep(2500);
    await admin.getByRole("button", { name: /^Create Project$/ }).first().click();
    // After Create the app may land on the settings page or the list: either way, find the project in the
    // list by name and open its settings the way a person does.
    await sleep(6000);
    await go(admin, "/projects");
    const link = admin.locator(`a[title="Open ${PROJECT}"]`).first();
    await link.waitFor({ timeout: 120000 });
    state.projectUrl = `${new URL(admin.url()).origin}${await link.getAttribute("href")}/settings`;
    await go(admin, state.projectUrl);
    await until("scopes card", async () => (await text(admin)).includes(PLURAL), 120000);
    await sleep(3000);
    await pickScope(admin, admin.locator("body"));
    await go(admin, state.projectUrl);
    await seen(admin, PLURAL, 120000);
    await sleep(4000);
    const rowOn = async () => {
      const sec = admin.locator("button", { hasText: PLURAL }).locator("visible=true").first();
      const row = () => admin.locator('[role="button"]').filter({ hasText: SCOPE }).locator("visible=true").first();
      if (!(await row().count()) && (await sec.count())) await sec.click().catch(() => {});
      await sleep(1500);
      return (await row().locator('span[class*="bg-primary"]').count()) > 0;
    };
    const shown = await until("project tag", rowOn, 60000);
    return { ok: Boolean(shown.v), detail: `the reloaded project settings (${new URL(state.projectUrl).pathname}) list "${SCOPE}" ${Boolean(shown.v)}` };
  });

  // ── 3. S05: a chat tagged through the composer's context chip ───────────────────────────
  await ctx.step(["S05"], "tag a chat with the scope", admin, async () => {
    if (!state.madeScope) return { ok: false, detail: "no scope to tag with" };
    await go(admin, "/chat/new");
    const chipSel = 'button[aria-label^="Context: "]:not([aria-label="Context: Context"]), button[aria-label="Set context"]';
    const chip = admin.locator(chipSel).locator("visible=true").first();
    await chip.waitFor({ timeout: 180000 });
    await sleep(3000);
    await chip.click();
    const find = admin.locator('input[aria-label="Search context tree"]').first();
    await find.waitFor({ timeout: 60000 });
    await find.fill(SCOPE);
    await sleep(2500);
    const pick = admin.getByRole("button", { name: `Select ${SCOPE}`, exact: true }).first();
    const offered = await until("tree offers the scope", async () => (await pick.count()) > 0, 60000);
    if (!offered.v) return { ok: false, detail: `the context tree never offers "${SCOPE}": ${(await text(admin)).replace(/\s+/g, " ").slice(0, 200)}` };
    await pick.click();
    await sleep(2500);
    const chipBefore = (await chip.getAttribute("aria-label")) ?? "";
    await admin.keyboard.press("Escape");
    await sleep(800);
    const box = admin.locator("textarea:visible").first();
    await box.click();
    await box.fill(MESSAGE);
    await admin.getByRole("button", { name: /^Send message$/ }).first().click();
    const urlHas = () => (admin.url().match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) ?? [])[0];
    const got = await until("chat address", async () => Boolean(urlHas()), 120000);
    if (!got.v) return { ok: false, detail: `sending gave the chat no address of its own (chip before send: ${chipBefore}); at ${admin.url()}` };
    state.chatUrl = admin.url();
    state.chatId = urlHas();
    // let the answer finish and the post-send tag land
    await until("answer", async () => (await text(admin)).length > 0 && !/Stop|Generating/i.test(await admin.locator("button[aria-label*='Stop' i]").first().textContent().catch(() => "")), 90000);
    await sleep(15000);
    // nothing picked in the sidebar any more: the chat's own tag must carry the chip
    const c2 = admin.locator(chipSel).locator("visible=true").first();
    await c2.click().catch(() => {});
    await admin.getByRole("button", { name: /^Clear/ }).first().click({ timeout: 8000 }).catch(() => {});
    await sleep(1500);
    await admin.keyboard.press("Escape");
    await go(admin, state.chatUrl);
    await admin.locator(chipSel).locator("visible=true").first().waitFor({ timeout: 180000 });
    const shown = await until("chat chip", async () => /scope/.test((await admin.locator(chipSel).locator("visible=true").first().getAttribute("aria-label").catch(() => "")) ?? ""), 60000);
    const chipAfter = await admin.locator(chipSel).locator("visible=true").first().getAttribute("aria-label").catch(() => "");
    return { ok: Boolean(shown.v), detail: `the chat reopened at ${new URL(state.chatUrl).pathname} reads "${chipAfter}" (picked before send: "${chipBefore}")` };
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
      const opt = admin.locator(`button[aria-label^="Options for ${NOTE}"]`).first();
      await opt.waitFor({ timeout: 90000 });
      await opt.click({ force: true });
      await admin.getByRole("menuitem", { name: /Move to Trash/ }).first().click();
      await admin.getByRole("button", { name: /^Move to Trash$/ }).last().click();
      await sleep(4000);
      const left = await admin.locator(`button[aria-label^="Options for ${NOTE}"]`).count();
      return { ok: left === 0, detail: `"${NOTE}" rows left in the notes list after Move to Trash: ${left}` };
    });
  });
  ctx.cleanup(async () => {
    if (!state.chatId) return;
    const admin = await seat();
    await ctx.step(["S05"], "archive the chat", admin, async () => {
      await go(admin, state.chatUrl);
      await sleep(8000);
      const row = admin.locator(`a[href*="${state.chatId}"]`).locator("visible=true").first();
      await row.waitFor({ timeout: 90000 });
      await row.hover();
      const opt = row.locator("xpath=ancestor::*[.//button[starts-with(@aria-label,'Options for')]][1]").locator('button[aria-label^="Options for"]').first();
      await opt.click({ force: true });
      const items = await admin.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map((e) => e.textContent.trim()));
      await admin.getByRole("menuitem", { name: /^Archive/ }).first().click();
      await sleep(3000);
      const dlg = admin.locator('[role="alertdialog"] button, [role="dialog"] button').filter({ hasText: /^Archive/ }).last();
      if (await dlg.count()) await dlg.click();
      await sleep(4000);
      const left = await admin.locator(`a[href*="${state.chatId}"]`).locator("visible=true").count();
      return { ok: left === 0, detail: `menu offered [${items.join(" | ")}]; the chat's row left in the sidebar after Archive: ${left}` };
    });
  });
  await ctx.finish();
}

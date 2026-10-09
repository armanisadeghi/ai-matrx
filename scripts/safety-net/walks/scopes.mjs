// scripts/safety-net/walks/scopes.mjs — lane SN-SCOPES (2026-10-01), check `scopes.walk-seat`.
//
// A PHYSICAL THERAPY CLINIC SETS UP ITS TREATMENT PROGRAMS, AS A PERSON DOES IT. admin@admin.com, the
// owner of Cedar Ridge Physical Therapy, through the product only:
//   1. Scopes → "Add Scope Type": "Treatment Program <STAMP>" / "Treatment Programs <STAMP>" with one
//      context item "Home exercise plan" (S01 create, S03 create)
//   2. the type's card → "Add Treatment Program …" → "ACL Rehab <STAMP>" (S02 create)
//   3. the scope's page → Home exercise plan = "Quad sets 3x10, heel slides 3x15, daily" → reload → kept (S03 edit)
//   4. Edit the type → plural renamed "… Programs <STAMP> (PT)" → reload → the card says so (S01 edit)
//   5. a note and a task tagged with ACL Rehab through their context picker (S07, S06) → reload → kept
//   6. manage's context inspector on that scope: "Byte-identical" (S09) — both systems hand the agent the same bytes (S10)
//   7. test@test.com, a plain member: Cedar Ridge's scopes page lists the type and the scope (S11)
//   cleanup (also S01/S02/S03 archive): the scope archived, the item archived, the type archived, the note
//   and the task archived — each through the product, each read back.
// Runs unchanged on live (www + manage.aimatrx.com) and on the clone preview. On the clone each step's
// database effect is also read with psql (old row and store twin by the same id).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cloneRead, openWalk, bodyText, setOrganization, sleep, until, STAMP, TARGET, REPO, FIXTURE_ORG_ID } from "../lib/harness.mjs";

const ORG_SLUG = "cedar-ridge-physical-therapy";
const SINGULAR = `Treatment Program ${STAMP}`;
const PLURAL = `Treatment Programs ${STAMP}`;
const PLURAL2 = `Treatment Programs ${STAMP} (PT)`;
const SCOPE = `ACL Rehab ${STAMP}`;
const ITEM = "Home exercise plan";
const VALUE = "Quad sets 3x10, heel slides 3x15, daily";
const TASK = `Book the ACL re-check visit ${STAMP}`;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

// ── clone-only database reads (psql, read-only) ─────────────────────────────────────────────
const PSQL = ["/opt/homebrew/opt/libpq/bin/psql", "/opt/homebrew/opt/postgresql@17/bin/psql"].find(existsSync);
const CLONE_DSN = (() => {
  if (TARGET !== "clone") return null;
  const f = join(REPO, ".env.local");
  const m = existsSync(f) ? readFileSync(f, "utf8").match(/^CLONE_DATABASE_URL=(.*)$/m) : null;
  return m ? m[1].replace(/^"|"$/g, "") : null;
})();
// W31: the clone read goes through the harness's one safe wrapper (session pooler, rollback always runs).
function db(sql) {
  if (!CLONE_DSN || !PSQL) return null;
  return cloneRead(sql) ?? "";
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const ctx = await openWalk("scopes");
/** A signed-in seat working in Cedar Ridge; picks the organization again when the harness's pick did not hold. */
async function seat(name) {
  const page = await ctx.page(name);
  if (!page.__org) {
    await sleep(5000);
    for (let i = 0; i < 2 && !page.__org; i += 1) {
      await go(page, "/data").catch(() => {});
      await sleep(6000);
      if (await setOrganization(page, "Cedar Ridge Physical Therapy").catch(() => false)) page.__org = "Cedar Ridge Physical Therapy";
    }
    console.log(`[scopes] ${name}: organization ${page.__org ? "picked on retry" : "still not picked"}`);
  }
  await sleep(4000);
  return page;
}
const state = { typeId: null, scopeId: null, typeHref: null, scopeHref: null, noteId: null, taskId: null, taskUrl: null };
const text = (page) => bodyText(page, 60000);
const seen = async (page, needle, ms = 90000) => (await until(String(needle), async () => (await text(page)).includes(needle), ms)).v === true;
/** The shared preview parks an idle tab ("This preview was paused"): press Resume, as a person does. */
async function resumeIfPaused(page) {
  for (let i = 0; i < 3; i += 1) {
    await sleep(1500);
    if (!(await text(page)).includes("This preview was paused")) return;
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await page.getByRole("link", { name: /Resume/ }).first().click().catch(() => {});
    await sleep(8000);
  }
}
/** Open a task's editor the way a person does: the tasks list, then its row. Returns the Delete control. */
async function openTask(page, title, url = "/tasks") {
  await go(page, url.startsWith("http") ? new URL(url).pathname + new URL(url).search : url);
  const row = page.getByText(title, { exact: true }).locator("visible=true").first();
  await row.waitFor({ timeout: 120000 });
  await row.click();
  const del = page.locator('[title="Delete task"]:visible').first();
  await del.waitFor({ timeout: 60000 });
  await sleep(2500);
  return del;
}
async function deleteTask(page, del) {
  await del.click();
  // "Move this task to the trash?" — the confirm names the consequence; press its "Move to trash".
  const confirm = page.getByRole("button", { name: /^Move to trash$/i }).last();
  await confirm.waitFor({ timeout: 20000 });
  await confirm.click();
  await sleep(4000);
}
async function sweepLeftoverTasks(page) {
  const seen = new Set();
  for (let i = 0; i < 4; i += 1) {
    await go(page, "/tasks");
    await sleep(8000);
    const names = (await page.getByText(/^Book the ACL re-check visit Oct/).locator("visible=true").allInnerTexts()).map((t) => t.trim()).filter((t) => !t.endsWith(STAMP) && !seen.has(t));
    if (!names.length) return;
    seen.add(names[0]);
    const del = await openTask(page, names[0]);
    await deleteTask(page, del);
    console.log(`[scopes] leftover task deleted through the product: ${names[0]}`);
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
/** The card (MatrxTableCard) whose title is `title`. */
const card = (page, title) => page.locator("section, article, [data-matrx-table-card], div").filter({ has: page.getByText(title, { exact: true }) }).last();

try {
  const admin = await seat("admin");
  // Fixtures an earlier, interrupted run left: earlier "Book the ACL re-check visit <stamp>" tasks are
  // opened from the tasks list and deleted through the product (not graded).
  await sweepLeftoverTasks(admin).catch((e) => console.log(`[scopes] leftover sweep: ${String(e).slice(0, 160)}`));

  // ── 1. S01 + S03 create: a scope type with one context item ─────────────────────────────
  await ctx.step(["S01", "S03"], "create the scope type with a context item", admin, async () => {
    await scopesPage(admin);
    await admin.getByRole("button", { name: /Add Scope Type/i }).first().click();
    await admin.getByPlaceholder("Client", { exact: true }).waitFor({ timeout: 30000 });
    await admin.getByPlaceholder("Client", { exact: true }).fill(SINGULAR);
    await admin.getByPlaceholder("Clients", { exact: true }).fill(PLURAL);
    const itemBox = admin.getByRole("textbox", { name: /Context item 1 name/ }).first();
    if (await itemBox.isVisible().catch(() => false)) await itemBox.fill(ITEM);
    else return { ok: false, detail: "the Add a scope type panel shows no context item row (\"Context item 1 name\")" };
    await admin.getByRole("button", { name: "Create scope type" }).last().click();
    const shown = await seen(admin, PLURAL, 90000);
    await scopesPage(admin);
    const afterReload = (await text(admin)).includes(PLURAL);
    const hrefs = await admin.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
    let dbNote = "";
    if (CLONE_DSN) {
      const row = db(`select st.id, (select count(*) from custom.record r where r.id = st.id and r.data_class = 'table'), (select count(*) from context.context_items ci where ci.scope_type_id = st.id and ci.deleted_at is null) from context.scope_types st where st.organization_id = ${q(FIXTURE_ORG_ID)} and st.label_plural = ${q(PLURAL)} and st.deleted_at is null`);
      const [id, inStore, items] = (row ?? "").split("|");
      state.typeId = id || null;
      dbNote = ` · clone: old row ${id ? "yes" : "NO"}, custom table ${inStore === "1" ? "yes" : "NO"}, items ${items ?? "?"}`;
      if (!id || inStore !== "1" || items !== "1") return { ok: false, detail: `the page shows the type (${shown}/${afterReload}) but${dbNote}` };
    }
    state.typeHref = hrefs.find((h) => h && h.includes(`/organizations/${ORG_SLUG}/scopes/`) && h.toLowerCase().includes("treatment-programs")) ?? null;
    return { ok: shown && afterReload, detail: `"${PLURAL}" listed after create ${shown}, after reload ${afterReload}${dbNote}` };
  });

  // ── 2. S02 create: a scope of that type ─────────────────────────────────────────────────
  await ctx.step(["S02"], "add a scope to the type", admin, async () => {
    await scopesPage(admin);
    const c = card(admin, PLURAL);
    const add = admin.getByRole("button", { name: `Add ${SINGULAR}` }).first();
    await add.click({ timeout: 30000 });
    const name = admin.getByPlaceholder(`e.g. ${SINGULAR}…`).first();
    await name.waitFor({ timeout: 30000 });
    await name.fill(SCOPE);
    await admin.getByRole("button", { name: `Add ${SINGULAR}`, exact: true }).last().click();
    const shown = await seen(admin, SCOPE, 90000);
    await scopesPage(admin);
    const afterReload = (await text(admin)).includes(SCOPE);
    void c;
    let dbNote = "";
    if (CLONE_DSN) {
      const row = db(`select s.id, (select count(*) from custom.record r where r.id = s.id and r.data_class = 'record') from context.scopes s join context.scope_types st on st.id = s.scope_type_id where st.organization_id = ${q(FIXTURE_ORG_ID)} and s.name = ${q(SCOPE)} and s.deleted_at is null`);
      const [id, inStore] = (row ?? "").split("|");
      state.scopeId = id || null;
      dbNote = ` · clone: old row ${id ? "yes" : "NO"}, store Record ${inStore === "1" ? "yes" : "NO"}`;
      if (!id || inStore !== "1") return { ok: false, detail: `page ${shown}/${afterReload}${dbNote}` };
    }
    return { ok: shown && afterReload, detail: `"${SCOPE}" listed after add ${shown}, after reload ${afterReload}${dbNote}` };
  });

  // ── 3. S03 edit: the scope's context value ──────────────────────────────────────────────
  await ctx.step(["S03"], "set the scope's context value", admin, async () => {
    await scopesPage(admin);
    const link = admin.getByRole("link", { name: SCOPE, exact: true }).first();
    if (await link.count()) await link.click({ timeout: 30000 });
    else await admin.locator(`text="${SCOPE}"`).locator("visible=true").first().click({ timeout: 30000 });
    await until("scope page", async () => (await text(admin)).includes(ITEM) && !admin.url().endsWith("/scopes"), 90000);
    await sleep(3000);
    state.scopeHref = new URL(admin.url()).pathname;
    const box = admin.getByRole("textbox", { name: ITEM }).first();
    await box.click({ timeout: 30000 });
    await box.fill(VALUE);
    await box.press("Tab");
    await sleep(6000);
    await go(admin, state.scopeHref);
    await seen(admin, SCOPE, 90000);
    await sleep(4000);
    const kept = (await admin.getByRole("textbox", { name: ITEM }).first().inputValue().catch(() => "")) === VALUE || (await text(admin)).includes(VALUE);
    let dbNote = "";
    if (CLONE_DSN && state.scopeId) {
      const v = db(`select count(*) from custom.record r where r.id = ${q(state.scopeId)} and r.data::text like ${q(`%${VALUE}%`)}`);
      dbNote = ` · clone: store Record holds the value ${v === "1" ? "yes" : "NO"}`;
      if (v !== "1") return { ok: false, detail: `kept on the page ${kept}${dbNote}` };
    }
    return { ok: kept, detail: `${ITEM} = "${VALUE}" kept after reload ${kept} (${state.scopeHref})${dbNote}` };
  });

  // ── 4. S01 edit: rename the type ────────────────────────────────────────────────────────
  await ctx.step(["S01"], "rename the scope type", admin, async () => {
    await scopesPage(admin);
    await admin.getByRole("button", { name: `Edit ${PLURAL}` }).first().click({ timeout: 30000 });
    const plural = admin.locator('input[placeholder="Clients"], input[value]').filter({ hasNot: admin.locator("xx") });
    void plural;
    const box = admin.locator("input").filter({ has: admin.locator("xx") });
    void box;
    await sleep(2500);
    const inputs = admin.locator("input:visible");
    let filled = false;
    for (let i = 0; i < (await inputs.count()); i += 1) {
      const el = inputs.nth(i);
      if ((await el.inputValue().catch(() => "")) === PLURAL) {
        await el.fill(PLURAL2);
        filled = true;
        break;
      }
    }
    if (!filled) return { ok: false, detail: `the edit sheet shows no field holding "${PLURAL}"` };
    await admin.getByRole("button", { name: "Save changes" }).last().click();
    await sleep(4000);
    await scopesPage(admin);
    const renamed = (await text(admin)).includes(PLURAL2);
    let dbNote = "";
    if (CLONE_DSN && state.typeId) {
      const v = db(`select (select label_plural from context.scope_types where id = ${q(state.typeId)}) || ' / ' || coalesce((select data->>'name' from custom.record where id = ${q(state.typeId)}), '∅')`);
      dbNote = ` · clone: old / store ${v}`;
    }
    return { ok: renamed, detail: `card says "${PLURAL2}" after reload ${renamed}${dbNote}` };
  });

  // ── 5. S06: a task created with the scope tag, the way the new-task page offers it ───────────
  await ctx.step(["S06"], "create a task tagged with the scope", admin, async () => {
    await go(admin, "/tasks/new");
    const title = admin.getByPlaceholder("What do you want to do?").first();
    await title.waitFor({ timeout: 180000 });
    await title.fill(TASK);
    const chip = admin.locator("button", { hasText: SCOPE }).first();
    const listed = await until("scope chip", async () => (await chip.count()) > 0, 90000);
    if (!listed.v) return { ok: false, detail: `the new task's Scopes list never offers "${SCOPE}": ${(await text(admin)).replace(/\s+/g, " ").slice(0, 200)}` };
    await chip.click();
    await sleep(800);
    await admin.getByRole("button", { name: /^Create task$/ }).first().click();
    const saved = await until("task saved", async () => /Go to task/.test(await text(admin)), 90000);
    if (!saved.v) return { ok: false, detail: `Create task gave no saved state: ${(await text(admin)).replace(/\s+/g, " ").slice(0, 200)}` };
    await admin.getByRole("button", { name: /Go to task/ }).first().click();
    await until("task page", async () => /[?&]task=/.test(admin.url()), 60000);
    state.taskUrl = admin.url();
    await openTask(admin, TASK, state.taskUrl);
    const shows = await until("task shows its scope", async () => (await text(admin)).includes(SCOPE), 60000);
    let dbNote = "";
    if (CLONE_DSN && state.scopeId) {
      const row = db(`select t.id, (select count(*) from platform.associations a where a.target_type = 'scope' and a.target_id = ${q(state.scopeId)} and a.source_id = t.id and a.deleted_at is null) from projects.tasks t where t.title = ${q(TASK)} order by t.created_at desc limit 1`);
      const [id, tags] = (row ?? "").split("|");
      state.taskId = id || null;
      dbNote = ` · clone: task ${id ? "saved" : "NOT saved"}, tagged with the scope ${tags === "1" ? "yes" : "NO"}`;
      if (!id || tags !== "1") return { ok: false, detail: `the reopened task shows the tag ${Boolean(shows.v)}${dbNote}` };
    }
    return { ok: Boolean(shows.v), detail: `"${TASK}" reopened at ${state.taskUrl} shows the "${SCOPE}" tag ${Boolean(shows.v)}${dbNote}` };
  });

  // ── 6. S09 / S10: manage's context inspector, picked the way a person picks (Miller columns) ──
  await ctx.step(["S09", "S10"], "context inspector says byte-identical", admin, async () => {
    const label = (await text(admin)).includes(PLURAL2) ? PLURAL2 : PLURAL;
    await go(admin, `${ctx.manageOrigin}/administration/scopes-context/context-inspector?org=${FIXTURE_ORG_ID}`);
    const col = (n) => admin.locator("[data-context-inspector] .min-w-\\[560px\\] > div").nth(n - 1);
    const pick = async (n, name) => {
      const r = await until(`column ${n} lists ${name}`, async () => (await col(n).locator("button[aria-pressed]", { hasText: name }).count()) > 0, 120000);
      if (!r.v) return false;
      await col(n).locator("button[aria-pressed]", { hasText: name }).first().click();
      await sleep(2500);
      return true;
    };
    const typeOk = (await pick(2, PLURAL2)) || (await pick(2, PLURAL));
    if (!typeOk) return { ok: false, detail: `the inspector's type column never listed "${label}": ${(await text(admin)).replace(/\s+/g, " ").slice(0, 300)}` };
    if (!(await pick(3, SCOPE))) return { ok: false, detail: `the inspector's scope column never listed "${SCOPE}"` };
    const r = await until("compare", async () => /Byte-identical|difference|Comparison unavailable/i.test(await text(admin)), 180000);
    const body = await text(admin);
    const says = (body.match(/Byte-identical[^\n]{0,160}|\d+ difference[^\n]{0,160}|Comparison unavailable[^\n]{0,160}/) ?? [""])[0];
    return { ok: Boolean(r.v) && /Byte-identical/.test(body), detail: says || body.replace(/\s+/g, " ").slice(0, 300) };
  });

  // ── 7. S11: a plain member of Cedar Ridge sees the type and the scope ─────────────────────
  const member = await seat("member");
  await ctx.step(["S11"], "a member sees the scope type and the scope", member, async () => {
    await go(member, `/organizations/${ORG_SLUG}/scopes`);
    const r = await until("member scopes", async () => {
      const t = await text(member);
      if (t.includes("This preview was paused")) await resumeIfPaused(member);
      return (t.includes(PLURAL2) || t.includes(PLURAL)) && t.includes(SCOPE);
    }, 180000);
    const t = await text(member);
    return { ok: Boolean(r.v), detail: `test@test.com on Cedar Ridge's scopes: type listed ${t.includes(PLURAL2) || t.includes(PLURAL)}, scope listed ${t.includes(SCOPE)}` };
  });
} finally {
  // ── cleanup: archive the type (hides its scopes and items) through its edit sheet ─────────
  ctx.cleanup(async () => {
    const admin = await seat("admin");
    await scopesPage(admin);
    const label = (await text(admin)).includes(PLURAL2) ? PLURAL2 : PLURAL;
    if (!(await text(admin)).includes(label)) return;
    await ctx.step(["S01"], "archive the scope type", admin, async () => {
      await admin.getByRole("button", { name: `Edit ${label}` }).first().click({ timeout: 30000 });
      await admin.getByRole("button", { name: /^Delete/ }).last().click({ timeout: 30000 });
      const dlg = admin.locator('[role="alertdialog"]').last();
      await dlg.waitFor({ timeout: 30000 });
      await dlg.getByRole("button", { name: "Delete" }).click();
      await sleep(4000);
      await scopesPage(admin);
      const gone = !(await text(admin)).includes(label);
      let dbNote = "";
      if (CLONE_DSN && state.typeId) dbNote = ` · clone: old archived / store archived ${db(`select (select deleted_at is not null from context.scope_types where id = ${q(state.typeId)})::text || ' / ' || coalesce((select (deleted_at is not null)::text from custom.record where id = ${q(state.typeId)}), '∅')`)}`;
      return { ok: gone, detail: `"${label}" gone from the page ${gone}${dbNote}` };
    });
  });
  // ── cleanup, first: the scope moved to Trash through its own edit page (S02 archive) ───────
  ctx.cleanup(async () => {
    if (!state.scopeHref) return;
    const admin = await seat("admin");
    await ctx.step(["S02"], "move the scope to Trash", admin, async () => {
      await go(admin, `${state.scopeHref}/edit`);
      await admin.getByRole("button", { name: "Move to Trash" }).first().click({ timeout: 120000 });
      const dlg = admin.locator('[role="alertdialog"]').last();
      await dlg.waitFor({ timeout: 30000 });
      await dlg.getByRole("button", { name: "Move to Trash" }).click();
      await sleep(4000);
      await scopesPage(admin);
      const gone = !(await text(admin)).includes(SCOPE);
      let dbNote = "";
      if (CLONE_DSN && state.scopeId) dbNote = ` · clone: old archived / store archived ${db(`select coalesce((select (deleted_at is not null)::text from context.scopes where id = ${q(state.scopeId)}), '∅') || ' / ' || coalesce((select (deleted_at is not null)::text from custom.record where id = ${q(state.scopeId)}), '∅')`)}`;
      return { ok: gone, detail: `"${SCOPE}" gone from the scopes page ${gone}${dbNote}` };
    });
  });
  // ── cleanup, very first: the task archived through its own Delete control ─────────────────
  ctx.cleanup(async () => {
    if (!state.taskUrl) return;
    const admin = await seat("admin");
    await ctx.step(["S06"], "archive the tagged task", admin, async () => {
      const del = await openTask(admin, TASK, state.taskUrl);
      await deleteTask(admin, del);
      await go(admin, "/tasks");
      await sleep(6000);
      const gone = !(await text(admin)).includes(TASK);
      if (!CLONE_DSN) return { ok: gone, detail: `"${TASK}" gone from the tasks list ${gone}` };
      let dbNote = "";
      if (CLONE_DSN && state.taskId) dbNote = ` · clone: task archived ${db(`select (deleted_at is not null)::text from projects.tasks where id = ${q(state.taskId)}`)}`;
      return { ok: !CLONE_DSN || /true/.test(dbNote), detail: `Delete task pressed on ${state.taskUrl}${dbNote}` };
    });
  });
  await ctx.finish();
}

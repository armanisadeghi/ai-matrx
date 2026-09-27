// scripts/knowledge-hub-triage-walk.mjs — Knowledge hub H5 (triage + tags) walk from a real seat.
//
// As admin@admin.com on /knowledge: keep one Inbox capture (s), archive one (e), tag one (t),
// read the sidebar counts before/after, filter by the tag (#name), open the "?" sheet, then undo
// by re-triaging (i) and remove the walk's tag association — every item ends where it started.
//
//   ORIGIN=<site> SHOTS=<dir> KEEP=<title> ARCHIVE=<title> TAG=<title> TAG_NAME=<name> \
//     node scripts/knowledge-hub-triage-walk.mjs
//
// Prints a JSON verdict; exit 1 on any miss.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://hub-triage.localhost:3001";
const SHOTS = process.env.SHOTS ?? "/tmp/hub-triage";
const { KEEP, ARCHIVE, TAG } = process.env;
const TAG_NAME = process.env.TAG_NAME ?? "hub-h5c-walk";
if (!KEEP || !ARCHIVE || !TAG) throw new Error("KEEP, ARCHIVE and TAG (item titles) are required");
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const out = { origin: ORIGIN, steps: [] };
const misses = [];
const check = (label, ok, detail) => {
  out.steps.push({ label, ok: !!ok, ...(detail !== undefined ? { detail } : {}) });
  if (!ok) misses.push(label);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const shot = (name) => page.screenshot({ path: join(SHOTS, name) });
const sidebarCount = (label) =>
  page.evaluate((label) => {
    const nav = document.querySelector("nav[aria-label='Knowledge views']");
    for (const b of nav?.querySelectorAll("button") ?? []) {
      const spans = [...b.querySelectorAll("span")].map((x) => x.textContent?.trim() ?? "");
      if (spans[0] === label) return spans.length > 1 ? spans[spans.length - 1] : null;
    }
    return null;
  }, label);
const toastText = async (want) => {
  const read = async () => (await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])).join(" | ");
  await until("toast", async () => want.test(await read()), 20000).catch(() => null);
  return read();
};
const row = (title) => page.locator("[data-hit-key]", { hasText: title }).first();
const waitRows = () => until("rows", async () => (await page.locator("[data-hit-key]").count()) > 0, 120000);

try {
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}`);

  await page.goto(`${ORIGIN}/knowledge?view=inbox`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitRows();
  await until("counts", async () => (await sidebarCount("Inbox")) !== null && (await sidebarCount("Kept")) !== null && (await sidebarCount("Archived")) !== null, 60000).catch(() => null);
  const before = { inbox: await sidebarCount("Inbox"), kept: await sidebarCount("Kept"), archived: await sidebarCount("Archived") };
  out.counts_before = before;
  for (const t of [KEEP, ARCHIVE, TAG]) check(`"${t}" is in the Inbox`, await row(t).isVisible().catch(() => false));
  await shot("01-inbox-before.png");

  // Keep (s)
  await row(KEEP).click();
  await sleep(500);
  await page.keyboard.press("s");
  out.keep_toast = await toastText(/Kept/);
  check("s keeps it (toast)", /Kept/.test(out.keep_toast), out.keep_toast);
  await until("kept row leaves", async () => !(await row(KEEP).isVisible().catch(() => false)), 20000).catch(() => null);
  check("kept item left the Inbox", !(await row(KEEP).isVisible().catch(() => false)));
  await shot("02-kept-with-s.png");

  // Archive (e)
  await row(ARCHIVE).click();
  await sleep(500);
  await page.keyboard.press("e");
  out.archive_toast = await toastText(/Archived/);
  check("e archives it (toast)", /Archived/.test(out.archive_toast), out.archive_toast);
  await until("archived row leaves", async () => !(await row(ARCHIVE).isVisible().catch(() => false)), 20000).catch(() => null);
  await until("archived count moves", async () => (await sidebarCount("Archived")) !== before.archived, 20000).catch(() => null);
  const afterTriage = { inbox: await sidebarCount("Inbox"), kept: await sidebarCount("Kept"), archived: await sidebarCount("Archived") };
  out.counts_after_triage = afterTriage;
  check("Archived count moved", afterTriage.archived !== before.archived, afterTriage);
  await shot("03-archived-with-e-counts-moved.png");

  // Tag (t)
  await row(TAG).click();
  await sleep(500);
  await page.keyboard.press("t");
  const input = page.getByPlaceholder("Tag name…");
  await input.waitFor({ timeout: 10000 });
  await input.fill(TAG_NAME);
  await shot("04-tag-dialog.png");
  await page.keyboard.press("Enter");
  out.tag_toast = await toastText(/Tagged/);
  check("t tags it (toast)", /Tagged/.test(out.tag_toast), out.tag_toast);
  const peekTags = page.locator("aside [data-testid='tag-chips']").first();
  await until("peek shows the tag", async () => (await peekTags.innerText().catch(() => "")).includes(TAG_NAME), 20000).catch(() => null);
  check("the peek shows the new tag at once", (await peekTags.innerText().catch(() => "")).includes(TAG_NAME));
  await shot("05-tagged-peek.png");

  // ? sheet
  await page.locator("body").click({ position: { x: 900, y: 980 } }).catch(() => {});
  await page.keyboard.press("Shift+Slash");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  check("? opens the shortcut sheet", await sheet.isVisible({ timeout: 5000 }).catch(() => false));
  await shot("06-shortcut-sheet.png");
  await page.keyboard.press("Escape");

  // Tags in the sidebar, with a count
  await page.goto(`${ORIGIN}/knowledge`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitRows().catch(() => null);
  const tagsGroup = page.locator("[data-testid='sidebar-tags'] button").first();
  await until("tags group", () => tagsGroup.isVisible(), 60000).catch(() => null);
  await tagsGroup.click();
  const tagRow = page.locator("[data-testid='sidebar-tags'] button", { hasText: `#${TAG_NAME}` }).first();
  await page.locator("[data-testid='sidebar-tags'] button", { hasText: /^Show all/ }).first().click().catch(() => {});
  out.sidebar_tag_row = await tagRow.innerText().catch(() => null);
  check("sidebar Tags lists the tag with a count", /1/.test(out.sidebar_tag_row ?? ""), out.sidebar_tag_row);
  await tagRow.scrollIntoViewIfNeeded().catch(() => {});
  await shot("07-sidebar-tags.png");

  // Filter by #tag in the search box
  const box = page.getByPlaceholder(/Search your knowledge/);
  await box.fill(`#${TAG_NAME}`);
  await page.keyboard.press("Enter");
  await until("tag results", () => row(TAG).isVisible(), 60000).catch(() => null);
  check("#tag filters to the tagged item", await row(TAG).isVisible().catch(() => false));
  out.tag_results = (await page.locator("[data-hit-key]").allInnerTexts()).map((t) => t.split("\n")[0]).slice(0, 10);
  out.row_tag_chips = await row(TAG).locator("[data-testid='tag-chips']").innerText().catch(() => null);
  await shot("08-filter-by-tag.png");

  // Undo by re-triaging: Archived → i, Kept → i
  for (const [view, title] of [["archived", ARCHIVE], ["kept", KEEP]]) {
    await page.goto(`${ORIGIN}/knowledge?view=${view}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitRows().catch(() => null);
    await until(`${title} in ${view}`, () => row(title).isVisible(), 60000).catch(() => null);
    check(`"${title}" is in ${view}`, await row(title).isVisible().catch(() => false));
    if (view === "archived") await shot("09-archived-view.png");
    await row(title).click();
    await sleep(500);
    await page.keyboard.press("i");
    const t = await toastText(new RegExp(`"${title}" back to your Inbox`));
    check(`i puts "${title}" back in the Inbox`, t.includes(`"${title}" back to your Inbox`), t);
  }
  await page.goto(`${ORIGIN}/knowledge?view=inbox`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitRows();
  await until("counts back", async () => (await sidebarCount("Archived")) === before.archived && (await sidebarCount("Inbox")) !== null, 30000).catch(() => null);
  out.counts_after_undo = { inbox: await sidebarCount("Inbox"), kept: await sidebarCount("Kept"), archived: await sidebarCount("Archived") };
  for (const t of [KEEP, ARCHIVE, TAG]) check(`"${t}" is back in the Inbox`, await row(t).isVisible().catch(() => false));
  await shot("10-inbox-after-undo.png");
} catch (err) {
  out.error = String(err?.stack ?? err);
  misses.push("threw");
  await shot("99-error.png").catch(() => {});
} finally {
  await browser.close();
}

// Remove the walk's tag association (as the same test account, through the association door).
try {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const { error: e1 } = await sb.auth.signInWithPassword({ email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD });
  if (e1) throw e1;
  // A refused write: the server's sentence is what the hub shows (triageApi.refusalMessage).
  const probe = await sb.schema("platform").rpc("set_triage_state", {
    p_entity_token: "processed_document",
    p_entity_id: "00000000-0000-4000-8000-000000000000",
    p_state: "kept",
  });
  out.refused_triage_sentence = probe.error?.message ?? null;
  const probeTag = await sb.schema("platform").rpc("file_under_tag", {
    p_entity_token: "processed_document",
    p_entity_id: "00000000-0000-4000-8000-000000000000",
    p_tag_name: TAG_NAME,
  });
  out.refused_tag_sentence = probeTag.error?.message ?? null;
  const entityId = process.env.TAG_ENTITY_ID;
  if (entityId) {
    const { data: scopes, error: se } = await sb.schema("context").from("scopes").select("id").eq("slug", TAG_NAME).is("deleted_at", null);
    if (se) throw se;
    out.tag_removed = [];
    for (const s of scopes ?? []) {
      const { error } = await sb.rpc("assoc_remove", {
        p_source_type: process.env.TAG_ENTITY_TOKEN ?? "processed_document",
        p_source_id: entityId,
        p_target_type: "scope",
        p_target_id: s.id,
      });
      out.tag_removed.push({ scope: s.id, ok: !error, ...(error ? { error: error.message } : {}) });
    }
  }
} catch (err) {
  out.cleanup_error = String(err?.message ?? err);
}

out.misses = misses;
console.log(JSON.stringify(out, null, 2));
process.exit(misses.length ? 1 : 0);

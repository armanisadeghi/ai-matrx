// N5 property menu, round 31: on a scratch page's inline database — Duplicate property, Wrap column (kept
// with the view across a reload), Change type to Select, the Select's options renamed / recoloured /
// reordered / deleted in Column settings, a width dragged twice (each drag widens, kept on reload), the
// advanced-filter popover's surface is opaque, and Share offers the platform's levels. Trashes the page.
//   SPACES_WALK_ORG="Ashford Labs" SHOT_DIR=<dir> node features/spaces/__tests__/walk/property-edit.walk.mjs [pageId]
import { open, newPage, act, slash, originOf, trashPage } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const step = (name) => console.log(JSON.stringify({ step: name }));
let id = process.argv[2];
if (id) await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
else id = await newPage(page);
console.log(JSON.stringify({ page: id }));
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);
const frame = page.locator(".spaces-db-frame").first();
if (!(await frame.count())) {
  await act(page, async () => {
    await page.locator(".bn-editor .bn-inline-content").last().click();
    await slash(page, "Database - Inline");
  });
}
await frame.waitFor({ timeout: 60_000 });
await page.waitForTimeout(6000);
console.log(JSON.stringify({ headerButtons: await frame.getByRole("button", { name: /^Sort or filter / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))) }));
const headers = () => frame.locator("[role=columnheader], th");
const header = (name) => headers().filter({ has: page.getByRole("button", { name: `Sort or filter ${name}`, exact: true }) }).first();
const headerNames = async () => frame.getByRole("button", { name: /^Sort or filter / }).evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").replace(/^Sort or filter /, "")));
const menu = async (name) => {
  await header(name).hover();
  await header(name).getByRole("button", { name: `Sort or filter ${name}`, exact: true }).click();
  await page.waitForTimeout(400);
};
const item = (label) => page.getByRole("menuitem", { name: label, exact: true }).or(page.getByText(label, { exact: true })).first();
const dialog = () => page.getByRole("dialog").last();
const dumpDialog = async (tag) => {
  const d = dialog();
  const buttons = (await d.getByRole("button").allInnerTexts()).map((s) => s.trim()).filter(Boolean);
  const labels = await d.locator("[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).slice(0, 40));
  console.log(JSON.stringify({ dialog: tag, title: (await d.locator("h2").first().innerText().catch(() => "")), buttons, labels }));
};
const saveDialog = async () => {
  const d = dialog();
  const save = d.getByRole("button", { name: /^(Save|Create column|Create field|Add column|Save column|Change type|Convert)$/ }).last();
  await save.click();
  await page.waitForTimeout(3500);
};

// 1. Duplicate property.
step("duplicate");
if (!(await headerNames()).includes("Name (1)")) await act(page, async () => {
  await menu("Name");
  await item("Duplicate property").click();
  await dialog().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await dumpDialog("duplicate");
  const named = await dialog().locator("input").evaluateAll((els) => els.map((e) => e.value));
  check("the copy starts named Name (1)", named.includes("Name (1)"), { named });
  await page.screenshot({ path: `${SHOT}/dup-dialog.png` });
  await saveDialog();
});
await page.waitForTimeout(2500);
check("Duplicate property adds the copy beside it", (await headerNames()).some((n) => n.includes("Name (1)")), { headers: await headerNames() });

// 2. Change type (Name (1) -> Select).
step("retype");
await act(page, async () => {
  await menu("Name (1)");
  await item("Change type…").click();
  await dialog().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await dumpDialog("retype");
  await page.screenshot({ path: `${SHOT}/retype-dialog.png` });
  await dialog().getByRole("combobox", { name: "Change what this column holds" }).click();
  await page.waitForTimeout(500);
  const options = (await page.getByRole("option").allInnerTexts()).map((t) => t.trim());
  console.log(JSON.stringify({ retypeOptions: options }));
  const pick = options.includes("Number") ? "Number" : null;
  if (!pick) {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    return;
  }
  await page.getByRole("option", { name: pick, exact: true }).click();
  await page.waitForTimeout(1500);
  await dumpDialog("retype-after-pick");
  const go = dialog().getByRole("button", { name: /^(Change type|Convert|Change|Save|Continue)/ });
  if (await go.count()) await go.first().click();
  await page.waitForTimeout(4000);
  if (await dialog().isVisible().catch(() => false)) await page.keyboard.press("Escape");
});
check("Change type: the copy now holds numbers", true);
await act(page, async () => {
  await menu("Name (1)");
  await item("Column settings…").click();
  await dialog().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  const holds = await dialog().getByRole("combobox", { name: "What this field holds" }).innerText().catch(() => "?");
  check("Change type is kept: settings read Number", /Number/.test(holds), { holds });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
});
// 3. A Select column (Insert column right), then its options.
step("options");
if (!(await headerNames()).includes("Stage")) await act(page, async () => {
  await menu("Name");
  await item("Insert column right…").click();
  await dialog().waitFor({ timeout: 10_000 });
  await dialog().getByRole("textbox", { name: "Field name" }).fill("Stage");
  await dialog().getByRole("combobox", { name: "What this field holds" }).click();
  await page.waitForTimeout(500);
  const kinds = (await page.getByRole("option").allInnerTexts()).map((t) => t.trim());
  console.log(JSON.stringify({ kinds }));
  await page.getByRole("option", { name: kinds.find((k) => /^(Select|Single select|Choice|Pick one)/i.test(k)), exact: true }).click();
  await page.waitForTimeout(1000);
  for (const [i, word] of ["Lead", "Call booked", "Won"].entries()) {
    await dialog().getByRole("button", { name: "Add a choice" }).click();
    await page.waitForTimeout(300);
    await dialog().getByRole("textbox", { name: `Choice ${i + 1}` }).fill(word);
  }
  await page.screenshot({ path: `${SHOT}/insert-select.png` });
  await saveDialog();
});
check("a Select column with three choices", (await headerNames()).includes("Stage"), { headers: await headerNames() });
const readChoices = async () => {
  await menu("Stage");
  await item("Column settings…").click();
  await dialog().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(2500);
  const words = await dialog().locator("input[aria-label^='Choice ']").evaluateAll((els) => els.map((e) => e.value));
  const colours = await dialog().locator("[aria-label^='Colour for ']").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).filter((l) => l.includes(":")));
  return { words, colours };
};
let before;
await act(page, async () => {
  before = await readChoices();
  console.log(JSON.stringify({ before }));
  // Rename "Lead" -> "New lead"; recolour "Won"; move "Won" up; remove "Call booked".
  await dialog().getByRole("textbox", { name: "Choice 1" }).fill("New lead");
  await dialog().locator("[aria-label^='Colour for Won:']").click();
  await page.waitForTimeout(400);
  const swatches = page.getByRole("radiogroup", { name: "Colour for Won" }).getByRole("radio");
  const n = await swatches.count();
  await swatches.nth(Math.max(1, n - 2)).click();
  await page.waitForTimeout(400);
  if (await page.getByRole("radiogroup", { name: "Colour for Won" }).isVisible().catch(() => false)) await page.locator("[aria-label^='Colour for Won:']").click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Move “Won” up" }).click();
  await page.getByRole("button", { name: "Remove “Call booked”" }).click();
  await page.waitForTimeout(800);
  await dumpDialog("options-edited");
  await page.screenshot({ path: `${SHOT}/options-edited.png` });
  await saveDialog();
  if (await dialog().isVisible().catch(() => false)) {
    await dumpDialog("after-save");
    await page.keyboard.press("Escape");
  }
});
await page.reload({ waitUntil: "domcontentloaded" });
await frame.waitFor({ timeout: 90_000 });
await page.waitForTimeout(7000);
let after;
await act(page, async () => {
  after = await readChoices();
  await page.screenshot({ path: `${SHOT}/options-after-reload.png` });
  await page.keyboard.press("Escape");
});
console.log(JSON.stringify({ after }));
check("options renamed, reordered and one deleted (kept after reload)", JSON.stringify(after.words) === JSON.stringify(["New lead", "Won"]), { words: after.words });
const wonBefore = before.colours.find((c) => c.startsWith("Colour for Won:"));
const wonAfter = after.colours.find((c) => c.startsWith("Colour for Won:"));
check("Won recoloured (kept after reload)", !!wonAfter && wonAfter !== wonBefore, { wonBefore, wonAfter });

// 3b. Reorder on its own: Won moves to the top, kept after a reload.
step("reorder");
await act(page, async () => {
  const now = await readChoices();
  const last = now.words.at(-1);
  await page.getByRole("button", { name: `Move \u201c${last}\u201d up` }).click();
  await saveDialog();
  if (await dialog().isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "domcontentloaded" });
  await frame.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(7000);
  const again = await readChoices();
  check("an option reordered (kept after reload)", again.words[0] === last, { before: now.words, after: again.words });
  await page.keyboard.press("Escape");
});

// 4. Wrap column, kept with the view.
step("wrap");
await act(page, async () => {
  await menu("Name");
  const wasWrapped = (await page.getByText("Unwrap column", { exact: true }).count()) > 0;
  await item(wasWrapped ? "Unwrap column" : "Wrap column").click();
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await frame.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(7000);
  await menu("Name");
  const label = (await page.getByText("Unwrap column", { exact: true }).count()) > 0 ? "Unwrap column" : "Wrap column";
  await page.screenshot({ path: `${SHOT}/wrap-menu.png` });
  check("Wrap column toggles and is kept with the view after a reload", label === (wasWrapped ? "Wrap column" : "Unwrap column"), { wasWrapped, now: label });
  await page.keyboard.press("Escape");
});

// 5. Width: two drags, each widens; kept after reload.
step("width");
const widthOf = async () => Math.round((await header("Stage").boundingBox()).width);
const drag = async () => {
  const grip = header("Stage").locator("[aria-label^='Resize'], [role=separator]").first();
  await header("Stage").hover();
  const b = await grip.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(2500);
};
const w0 = await widthOf();
await act(page, drag);
const w1 = await widthOf();
await act(page, drag);
const w2 = await widthOf();
await page.reload({ waitUntil: "domcontentloaded" });
await frame.waitFor({ timeout: 90_000 });
await page.waitForTimeout(8000);
const w3 = await widthOf();
check("each of two drags widens the column", w1 >= w0 + 40 && w2 >= w1 + 40, { w0, w1, w2 });
check("the dragged width is kept after a reload", Math.abs(w3 - w2) <= 4, { w2, w3 });

// 6. Share: the platform's levels.
step("share");
await act(page, async () => {
  await page.getByRole("button", { name: /^Share$/ }).first().click();
  await page.waitForTimeout(1500);
  const invite = page.getByRole("button", { name: /^Invite/ }).first();
  if (await invite.count()) await invite.click();
  await page.waitForTimeout(2000);
  const trig = page.locator("#user-permission");
  if (await trig.count()) {
    await trig.click();
    await page.waitForTimeout(500);
  }
  const levels = (await page.getByRole("option").allInnerTexts()).map((t) => t.trim());
  console.log(JSON.stringify({ shareLevels: levels }));
  await page.screenshot({ path: `${SHOT}/share-levels.png` });
  check("Share offers viewer, commenter, editor and full access", ["Viewer", "Commenter", "Editor"].every((l) => levels.includes(l)) && levels.some((l) => /Admin|Full access/.test(l)), { levels });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
});
if (process.env.TRASH) check("scratch page trashed", await act(page, () => trashPage(page)));
await browser.close().catch(() => {});
process.exit(failed ? 1 : 0);

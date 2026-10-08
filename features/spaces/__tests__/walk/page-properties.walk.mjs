// N13 — page properties on a normal page (round 41): Add property → Text, Number, Select (made by typing),
// Date and Person under the title; every value is still there after a reload. Trashes the page.
//   MEMBER=1 SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/page-properties.walk.mjs
import { open, newPage, act, shot, trashPage, originOf } from "./lib.mjs";

const OUT = process.env.SHOTS ?? "/tmp";
const { browser, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
const id = await newPage(page);
console.log("page", id);
await act(page, async () => {
  await page.locator(".spaces-title").first().click();
  await page.keyboard.type("Spring campaign brief", { delay: 15 });
});
const menuPick = async (label) => {
  const item = page.getByRole("menuitem", { name: label, exact: true }).first();
  await item.waitFor({ timeout: 8000 });
  await item.click();
  await page.waitForTimeout(300);
};
const lastValue = () => page.locator(".spaces-page-prop").last().locator(".spaces-page-prop-value");

await act(page, async () => {
  await page.locator(".spaces-header").hover();
  await page.getByRole("button", { name: "Add property" }).first().click({ force: true });
  await menuPick("Text");
  await lastValue().locator("input").fill("Launch the spring line to existing clients");
  await lastValue().locator("input").press("Enter");

  await page.getByRole("button", { name: "Add a property" }).click();
  await menuPick("Number");
  await lastValue().locator("input").fill("12500");
  await lastValue().locator("input").press("Enter");

  await page.getByRole("button", { name: "Add a property" }).click();
  await menuPick("Select");
  await lastValue().getByRole("button", { name: "Choose value" }).click();
  await page.getByPlaceholder("Search for an option…").fill("In progress");
  await page.getByPlaceholder("Search for an option…").press("Enter");
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Add a property" }).click();
  await menuPick("Date");
  await lastValue().locator("input").fill("2026-10-20");
  await lastValue().locator("input").press("Enter");

  await page.getByRole("button", { name: "Add a property" }).click();
  await menuPick("Person");
  await lastValue().getByRole("button", { name: "Choose value" }).click();
  const person = page.getByRole("option").first();
  await person.waitFor({ timeout: 15_000 });
  await person.click();
});
await page.waitForTimeout(3500);
await shot(page, `${OUT}/r41-properties.png`);
const read = () =>
  page.locator(".spaces-page-prop").evaluateAll((rows) =>
    rows.map((r) => {
      const input = r.querySelector(".spaces-page-prop-value input");
      return [r.getAttribute("data-prop-type"), input ? input.value : (r.querySelector(".spaces-page-prop-value")?.textContent ?? "").trim()];
    }),
  );
const before = await read();
await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
await page.locator(".spaces-page-prop").first().waitFor({ timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(1500);
const after = await read();
console.log(JSON.stringify({ before, after }));
console.log("trashed:", await trashPage(page));
await browser.close();
const ok =
  after.length === 5 &&
  JSON.stringify(after) === JSON.stringify(before) &&
  after[0][1] === "Launch the spring line to existing clients" &&
  after[1][1] === "12500" &&
  after[2][1] === "In progress" &&
  after[3][1] === "2026-10-20" &&
  after[4][0] === "person" && after[4][1] && after[4][1] !== "Empty";
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);

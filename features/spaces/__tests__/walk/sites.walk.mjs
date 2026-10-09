// Walk: Sites (Notion's Settings > Sites). Admin makes a page, publishes it, finds it in Sites (title, link,
// indexed, date), opens its public link SIGNED OUT, unpublishes it, and sees it leave the list.
//
//   S=<shots dir> node features/spaces/__tests__/walk/sites.walk.mjs
import { chromium } from "playwright";
import { act, newPage, open, originOf, resumeIfPaused, trashPage } from "./lib.mjs";

const shots = `${process.env.S ?? "/tmp"}/shots`;
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const { browser, page } = await open({ next: "/spaces", width: 1440, height: 900 });
const origin = originOf(page);
await page.locator(".spaces-sidebar-head").first().waitFor({ timeout: 180_000 });
await resumeIfPaused(page);
const id = await newPage(page);
const title = `Sites walk ${Date.now().toString(36)}`;
await act(page, async () => {
  await page.locator(".spaces-title").first().click();
  await page.keyboard.type(title);
  await page.waitForTimeout(1500);
});

// Publish
await act(page, () => page.getByRole("button", { name: /^Share$/ }).first().click());
await act(page, () => page.getByRole("tab", { name: "Publish" }).or(page.getByRole("radio", { name: "Publish" })).first().click());
await page.getByTestId("publish-panel").waitFor({ timeout: 30_000 });
await act(page, () => page.getByTestId("publish-button").click());
await page.getByTestId("publish-url").waitFor({ timeout: 30_000 });
const url = await page.getByTestId("publish-url").inputValue();
await page.keyboard.press("Escape");

const openSites = async () => {
  await act(page, () => page.getByTestId("spaces-sites").click());
  await page.getByTestId("spaces-sites-list").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
};
const rowFor = () => page.getByTestId("spaces-site-row").filter({ hasText: title });

await openSites();
await page.screenshot({ path: `${shots}/sites-listed.png` });
check("published page is listed", (await rowFor().count()) === 1);
const href = await rowFor().getByTestId("spaces-site-link").getAttribute("href");
check("row link is the public link", href === url, href ?? "");
check("row says Not indexed", /Not indexed/.test(await rowFor().innerText()));
check("row shows a date", /\d{4}/.test(await rowFor().innerText()));

// Signed out
const anonBrowser = await chromium.launch({ headless: true });
const anon = await (await anonBrowser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await anon.goto(`${origin}${new URL(url).pathname}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
await anon.getByTestId("public-title").waitFor({ timeout: 120_000 });
check("signed-out public link shows the title", (await anon.getByTestId("public-title").innerText()).includes(title));
await anon.screenshot({ path: `${shots}/sites-public-signed-out.png` });

// Open in Spaces from the row
await act(page, () => rowFor().getByRole("button", { name: "Open in Spaces" }).click());
await page.waitForURL(new RegExp(id), { timeout: 30_000 });
check("Open in Spaces lands on the page", page.url().includes(id));

// Unpublish
await act(page, () => page.getByRole("button", { name: /^Share$/ }).first().click());
await act(page, () => page.getByRole("tab", { name: "Publish" }).or(page.getByRole("radio", { name: "Publish" })).first().click());
await page.getByTestId("publish-panel").waitFor({ timeout: 30_000 });
await act(page, () => page.getByRole("button", { name: /Unpublish/ }).first().click());
await page.waitForTimeout(3000);
await page.keyboard.press("Escape");
await openSites();
await page.screenshot({ path: `${shots}/sites-after-unpublish.png` });
check("unpublished page leaves Sites", (await rowFor().count()) === 0);

await trashPage(page).catch(() => {});
await anonBrowser.close();
await browser.close();
console.log(failures ? `FAILED ${failures}` : "ALL PASS");
process.exit(failures ? 1 : 0);

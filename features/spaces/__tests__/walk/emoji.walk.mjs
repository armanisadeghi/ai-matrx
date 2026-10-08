// Emoji (Arman 2026-10-08, N14): a page icon from the Emoji tab (search "rocket"), a callout emoji, and ":smile"
// typed in text all hold after a reload; the published page shows the page emoji to a signed-out reader.
//   MEMBER=1 SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/emoji.walk.mjs
import { chromium } from "playwright";
import { open, newPage, act, shot, trashPage, originOf } from "./lib.mjs";

const shots = process.env.S ?? "/tmp";
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const { browser, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
const origin = originOf(page);
page.on("console", (m) => m.type() === "error" && console.log("[console]", m.text().slice(0, 200)));
process.on("uncaughtException", async (e) => { console.log("CRASH", String(e.message).slice(0, 200)); await page.screenshot({ path: `${shots}/emoji-crash.png` }).catch(() => {}); console.log("trashed:", await trashPage(page).catch(() => "no")); process.exit(1); });
const id = await newPage(page);
console.log("page", id);

// 1. page icon: Add icon opens on Emoji; search rocket; pick.
await page.locator(".spaces-header").first().hover();
await act(page, () => page.getByRole("button", { name: /Add icon/ }).first().click());
await page.locator("aside.EmojiPickerReact, .EmojiPickerReact").first().waitFor({ timeout: 60_000 });
const tabs = await page.getByRole("tab").allTextContents().catch(() => []);
check("picker opens on Emoji tab", (await page.getByRole("tab", { name: "Emoji" }).getAttribute("aria-selected").catch(() => null)) === "true" || (await page.getByRole("radio", { name: "Emoji" }).isChecked().catch(() => false)), tabs.join(","));
await act(page, () => page.locator(".EmojiPickerReact input[type=text], .EmojiPickerReact input").first().fill("rocket"));
await page.waitForTimeout(800);
await shot(page, `${shots}/emoji-1-search.png`);
await act(page, () => page.locator('.EmojiPickerReact [data-unified="1f680"]').first().click());
await page.waitForTimeout(1500);
const pageIcon = () => page.locator(".spaces-page-icon").first().textContent().catch(() => null);
check("page icon is a rocket", (await pageIcon())?.includes("\u{1F680}"), await pageIcon());

// 2. callout with an emoji
await page.locator(".bn-editor .bn-inline-content").last().click();
await page.keyboard.type("/callout", { delay: 40 });
await page.locator(".bn-suggestion-menu-item, [role=option]").filter({ hasText: /^\s*Callout/i }).first().waitFor({ timeout: 60_000 });
await page.keyboard.press("Enter");
await page.waitForTimeout(800);
await act(page, () => page.locator(".spaces-callout-icon").first().click());
await page.locator(".EmojiPickerReact").first().waitFor({ timeout: 60_000 });
await act(page, () => page.locator(".EmojiPickerReact input").first().fill("fire"));
await page.waitForTimeout(800);
await act(page, () => page.locator(".EmojiPickerReact button.epr-emoji, .EmojiPickerReact [data-unified]").first().click());
await page.waitForTimeout(1000);
const calloutIcon = () => page.locator(".spaces-callout-icon").first().textContent().catch(() => null);
check("callout icon is an emoji", /\p{Extended_Pictographic}/u.test((await calloutIcon()) ?? ""), await calloutIcon());
await page.keyboard.type("Callout text");

// 3. :smile in text
await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.keyboard.type("Feeling ", { delay: 20 });
await page.keyboard.type(":smile", { delay: 60 });
await page.waitForTimeout(1500);
await shot(page, `${shots}/emoji-2-colon.png`);
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
const bodyText = () => page.locator(".bn-editor").first().innerText();
check(":smile inserted an emoji", /Feeling \p{Extended_Pictographic}/u.test(await bodyText()), (await bodyText()).slice(-60).replace(/\n/g, "|"));
await page.waitForTimeout(4000);

// 4. reload
await page.goto(`${origin}/spaces/${id}`, { waitUntil: "domcontentloaded" });
await page.locator(".bn-editor").first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(3000);
check("reload: page icon still a rocket", (await pageIcon())?.includes("\u{1F680}"), await pageIcon());
check("reload: callout emoji held", /\p{Extended_Pictographic}/u.test((await calloutIcon()) ?? ""), await calloutIcon());
check("reload: :smile emoji held", /Feeling \p{Extended_Pictographic}/u.test(await bodyText()));
await shot(page, `${shots}/emoji-3-reload.png`);

// 5. publish, signed out
await act(page, () => page.getByRole("button", { name: /^Share$/ }).first().click());
await act(page, () => page.getByRole("tab", { name: "Publish" }).or(page.getByRole("radio", { name: "Publish" })).first().click());
await page.getByTestId("publish-panel").waitFor({ timeout: 30_000 });
await act(page, () => page.getByTestId("publish-button").click());
await page.getByTestId("publish-url").waitFor({ timeout: 30_000 });
const path = new URL(await page.getByTestId("publish-url").inputValue()).pathname;
await page.waitForTimeout(6000);
const anonBrowser = await chromium.launch({ headless: true });
const anon = await (await anonBrowser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await anon.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
await anon.locator('[data-testid="public-title"]').waitFor({ timeout: 120_000 });
await anon.waitForTimeout(3000);
await anon.screenshot({ path: `${shots}/emoji-4-signed-out.png` });
const text = await anon.locator("body").innerText();
check("signed out: page emoji (rocket) shows", text.includes("\u{1F680}") || (await anon.locator('[role=img]').allTextContents()).some((t) => t.includes("\u{1F680}")));
check("signed out: callout and typed emoji show", /Feeling \p{Extended_Pictographic}/u.test(text) && (text.match(/\p{Extended_Pictographic}/gu) ?? []).length >= 3, (text.match(/\p{Extended_Pictographic}/gu) ?? []).join(""));
await act(page, () => page.getByTestId("unpublish-button").click().catch(() => page.getByRole("button", { name: /Unpublish/ }).first().click()));
await page.waitForTimeout(3000);
await anonBrowser.close();
console.log("trashed:", await trashPage(page));
await browser.close();
console.log(failures ? "FAIL" : "PASS");
process.exit(failures ? 1 : 0);

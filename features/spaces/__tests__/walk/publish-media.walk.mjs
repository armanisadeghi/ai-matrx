// Walk: an uploaded cover for a SIGNED-OUT reader. Admin makes a fresh page, uploads a cover through the real
// UI, publishes it from the Share menu; a signed-out browser opens /site/<link> and the cover is drawn from the
// public CDN address; Unpublish takes the page down and the signed-out read answers nothing.
//
//   S=<dir> IMG=<png> node features/spaces/__tests__/walk/publish-media.walk.mjs
import { chromium } from "playwright";
import { act, newPage, originOf, resumeIfPaused } from "./lib.mjs";
import { open } from "./lib.mjs";

const shots = `${process.env.S ?? "/tmp"}/shots`;
const img = process.env.IMG;
if (!img) throw new Error("IMG=<png to upload as the cover>");
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const { browser, page } = await open({ next: "/spaces", width: 1440, height: 900 });
const origin = originOf(page);
const id = await newPage(page);
console.log("PAGE", id);
await page.locator(".bn-editor").first().waitFor({ timeout: 120_000 });
await resumeIfPaused(page);
await act(page, () => page.locator(".spaces-title, [data-testid=page-title]").first().fill?.("Cover proof page").catch(() => {}));

// cover: Add cover → Upload
await page.locator(".spaces-header").first().hover();
await act(page, () => page.getByRole("button", { name: /Add cover/ }).first().click());
await page.waitForTimeout(800);
const change = page.getByRole("button", { name: /Change cover/ }).first();
if (await change.isVisible().catch(() => false)) await act(page, () => change.click());
await act(page, () => page.getByRole("tab", { name: "Upload" }).or(page.getByRole("radio", { name: "Upload" })).first().click());
await page.locator('input[type="file"][accept="image/*"]').last().setInputFiles(img);
await page.waitForTimeout(8000);
await page.screenshot({ path: `${shots}/1-cover-uploaded.png` });

// publish
await act(page, () => page.getByRole("button", { name: /^Share$/ }).first().click());
await act(page, () => page.getByRole("tab", { name: "Publish" }).or(page.getByRole("radio", { name: "Publish" })).first().click());
await page.getByTestId("publish-panel").waitFor({ timeout: 30_000 });
await act(page, () => page.getByTestId("publish-button").click());
await page.getByTestId("publish-url").waitFor({ timeout: 30_000 });
const url = await page.getByTestId("publish-url").inputValue();
const path = new URL(url).pathname;
await page.waitForTimeout(6000);

// signed out
const anonBrowser = await chromium.launch({ headless: true });
const anon = await (await anonBrowser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
anon.on("pageerror", (e) => console.log("[anon pageerror]", e.message.slice(0, 200)));
const imgReqs = [];
anon.on("response", (r) => { if (r.url().includes("cdn.matrxserver.com")) imgReqs.push(`${r.status()} ${r.url()}`); });
await anon.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
await anon.locator('[data-testid="public-title"]').waitFor({ timeout: 120_000 });
await anon.waitForTimeout(4000);
await anon.screenshot({ path: `${shots}/2-signed-out-cover.png` });
const bg = await anon.evaluate(() => [...document.querySelectorAll("*")].map((e) => getComputedStyle(e).backgroundImage).find((b) => b.includes("cdn.matrxserver.com")) ?? "");
check("signed out: the cover is drawn from the public CDN address", bg.includes("cdn.matrxserver.com"), bg.slice(0, 90));
check("signed out: the CDN answered 200 for it", imgReqs.some((r) => r.startsWith("200")), imgReqs.join(" | ").slice(0, 120));
console.log("URL", `${origin}${path}`);

if (process.env.KEEP) {
  console.log("KEEP set: page stays published for inspection");
} else {
  await act(page, () => page.getByTestId("unpublish-button").click().catch(() => page.getByRole("button", { name: /Unpublish/ }).first().click()));
  await page.waitForTimeout(6000);
  await anon.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await anon.waitForTimeout(3000);
  check("unpublished: signed out reads no page", (await anon.locator('[data-testid="public-title"]').count()) === 0);
}
await anonBrowser.close();
await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);

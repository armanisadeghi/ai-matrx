// Walk helper: Unpublish a page the walk made, through the Share menu, then read it signed out.
//   node features/spaces/__tests__/walk/unpublish.walk.mjs <page-id> <slug>
import { chromium } from "playwright";
import { act, open, originOf, resumeIfPaused } from "./lib.mjs";
const [id, slug] = process.argv.slice(2);
const { browser, page } = await open({ next: `/spaces/${id}`, width: 1440, height: 900 });
const origin = originOf(page);
await page.locator(".bn-editor").first().waitFor({ timeout: 120_000 });
await resumeIfPaused(page);
await act(page, () => page.getByRole("button", { name: /^Share$/ }).first().click());
await act(page, () => page.getByRole("tab", { name: "Publish" }).or(page.getByRole("radio", { name: "Publish" })).first().click());
await page.getByTestId("publish-panel").waitFor({ timeout: 30000 });
await act(page, () => page.getByTestId("unpublish-button").click());
await page.waitForTimeout(7000);
const ab = await chromium.launch({ headless: true });
const anon = await (await ab.newContext()).newPage();
await anon.goto(`${origin}/site/${slug}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await anon.waitForTimeout(4000);
console.log("title elements signed out after unpublish:", await anon.locator('[data-testid="public-title"]').count());
await ab.close(); await browser.close();

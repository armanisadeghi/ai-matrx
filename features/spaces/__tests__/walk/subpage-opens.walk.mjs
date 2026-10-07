// "/page" (Notion): the sub-page opens with the caret in its title; the breadcrumb names the parent and returns to it, where the page block carries the new name. Run: SPACES_WALK_ORG="<org>" node features/spaces/__tests__/walk/subpage-opens.walk.mjs
import { open, newPage, act, slash, trashPage } from "./lib.mjs";
const { browser, page: A } = await open({ member: true, width: 1440, height: 1000 });
const parent = await newPage(A); console.log("parent", parent);
await act(A, async () => { await A.locator(".spaces-title").click(); await A.keyboard.type("Parent r27"); await A.waitForTimeout(300); console.log("crumb before slash:", await A.evaluate(() => [...document.querySelectorAll(".spaces-breadcrumb-item")].map((e) => e.textContent.trim()))); await A.locator(".bn-editor .bn-inline-content").last().click(); await slash(A, "page", "Page"); });
await A.waitForURL((u) => /\/spaces\/[0-9a-f-]{36}/.test(u.href) && !u.href.includes(parent), { timeout: 20000 });
const child = A.url().match(/\/spaces\/([0-9a-f-]{36})/)[1]; console.log("child opened", child);
await A.locator(".bn-editor").first().waitFor({ timeout: 60000 }); await A.waitForTimeout(800);
console.log("focus in title:", await A.evaluate(() => !!document.activeElement?.closest(".spaces-title")));
await act(A, async () => { await A.keyboard.type("Named child"); });
await A.waitForTimeout(1500);
console.log("crumbs:", await A.evaluate(() => [...document.querySelectorAll(".spaces-breadcrumb-item")].map((e) => e.textContent.trim())));
await A.locator(".spaces-breadcrumb-item").first().click(); await A.waitForURL((u) => u.href.includes(parent), { timeout: 20000 }); await A.locator(".bn-editor").first().waitFor(); await A.waitForTimeout(2500);
console.log("parent title:", await A.locator(".spaces-title").textContent(), "crumb now:", await A.evaluate(() => [...document.querySelectorAll(".spaces-breadcrumb-item")].map((e) => e.textContent.trim())));
console.log("back on parent:", A.url().includes(parent), "page blocks:", await A.evaluate(() => [...document.querySelectorAll('[data-content-type="page"]')].map((e) => e.textContent.trim())));
await trashPage(A).catch((e) => console.log("trash parent failed", e.message));
await browser.close();

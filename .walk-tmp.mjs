import { chromium } from "@playwright/test";
const [,, loginUrl, out, width] = process.argv;
const W = Number(width); const tag = String(W);
const log = (...a) => console.log(tag, ...a);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 812 : 900 }, permissions: ["clipboard-read", "clipboard-write"], ...(W < 500 ? { isMobile: true, hasTouch: false } : {}) });
const page = await ctx.newPage();
await page.goto(loginUrl, { waitUntil: "commit", timeout: 120000 });
await page.waitForURL(/\/notes|dev-walk/, { timeout: 120000, waitUntil: "commit" });
if (page.url().includes("dev-walk")) { await page.getByRole("button", { name: /Resume/ }).click(); }
await page.waitForTimeout(3000);
const clip = async () => page.evaluate(async () => { const o = {}; for (const it of await navigator.clipboard.read()) for (const t of it.types) o[t] = await (await it.getType(t)).text(); return o; });
// open the walk note
const link = page.getByText("Walk note title").first();
await link.waitFor({ timeout: 180000 }); await link.click(); await page.waitForTimeout(4000);
// Plain mode
const plain = page.getByRole("radio", { name: /Plain/ }).or(page.getByRole("button", { name: /^Plain$/ })).first();
if (await plain.count()) { await plain.click(); await page.waitForTimeout(2000); }
const ta = page.locator("textarea").filter({ hasText: "" }).first();
const ok = await page.evaluate(() => { const el = [...document.querySelectorAll("textarea")].find(t => t.value.includes("Walk note title")); if (!el) return null; const i = el.value.indexOf("second"); el.focus(); el.setSelectionRange(i, i + 6); document.dispatchEvent(new Event("selectionchange")); return el.getBoundingClientRect().left; });
await page.keyboard.press("Control+i");
await page.waitForTimeout(900);
log("plain textarea left", ok, "value", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("textarea")].find(t => t.value.includes("Walk note"))?.value)));
const fmt = await page.evaluate(() => [...document.querySelectorAll("button")].map(b => b.getAttribute("aria-label") || b.getAttribute("title") || "").filter(l => /^(Bold|Italic|Heading 1)/.test(l)));
log("plain format buttons", JSON.stringify(fmt));
await page.screenshot({ path: `${out}/${tag}-03-plain-selection-toolbar.png` });
// note bar Copy (aria label starts with Copy, transform or export Note)
await page.keyboard.press("Escape");
const noteCopy = page.locator('button[aria-label^="Copy, transform or export Note \\""], button[aria-label="Copy"]').last();
const primary = page.locator('[aria-label^="Copy, transform or export Note \\""]').last();
const near = await primary.evaluate(el => { const r = el.closest("div")?.querySelectorAll("button"); return r ? [...r].map(b => b.getAttribute("aria-label") || b.textContent.trim()) : []; }).catch(() => []);
log("note bar buttons", JSON.stringify(near));
const copyFirst = page.locator('[aria-label^="Copy, transform or export Note \\""]').last().locator("xpath=..").locator("button").first();
await copyFirst.click().catch(e => log("copy click fail", e.message)); await page.waitForTimeout(1500);
log("note bar Copy clipboard", JSON.stringify(await clip().catch(e => String(e))));
// Read mode
const read = page.getByRole("radio", { name: /Read/ }).or(page.getByRole("button", { name: /^Read$/ })).first();
if (await read.count()) { await read.click(); await page.waitForTimeout(3000); }
await page.evaluate(() => { const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = walker.nextNode())) { if (n.textContent.includes("first bullet with") && !n.parentElement.closest("textarea,[contenteditable=true],nav,aside")) { const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, n.textContent.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); break; } } });
await page.mouse.move(5, 5); await page.mouse.down(); await page.mouse.up();
await page.evaluate(() => { const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = walker.nextNode())) { if (n.textContent.includes("first bullet with") && !n.parentElement.closest("textarea,[contenteditable=true]")) { const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, n.textContent.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event("selectionchange")); break; } } });
await page.waitForTimeout(1200);
const readBtns = await page.evaluate(() => [...document.querySelectorAll("button")].map(b => b.getAttribute("aria-label") || b.getAttribute("title") || "").filter(l => /^Copy( markdown| text)?$/.test(l)));
log("read copy buttons", JSON.stringify(readBtns));
await page.screenshot({ path: `${out}/${tag}-05-read-selection-toolbar.png` });
// Ctrl+Shift+C on a rendered selection containing a link
await page.evaluate(() => { const a = [...document.querySelectorAll("a[href]")].find(x => /https?:/.test(x.href) && !x.closest("nav,aside,header")); if (!a) return; const r = document.createRange(); r.selectNodeContents(a.parentElement); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
await page.keyboard.press("Control+Shift+c"); await page.waitForTimeout(1500);
log("ctrl-shift-c clipboard", JSON.stringify(await clip().catch(e => String(e))));
await browser.close();

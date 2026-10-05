import { chromium } from "@playwright/test";
const [,, loginUrl, out, width] = process.argv;
const W = Number(width); const tag = String(W); const phone = W < 500;
const log = (...a) => console.log(tag, ...a);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: phone ? 812 : 900 }, permissions: ["clipboard-read", "clipboard-write"], ...(phone ? { isMobile: true, hasTouch: false } : {}) });
const p = await ctx.newPage();
const shot = (n) => p.screenshot({ path: `${out}/${tag}-${n}.png` });
const clip = async () => p.evaluate(async () => { const o = {}; for (const it of await navigator.clipboard.read()) for (const t of it.types) o[t] = await (await it.getType(t)).text(); return o; });
const labels = () => p.evaluate(() => [...document.querySelectorAll("button,[role=menuitem]")].filter(e => e.offsetParent !== null).map(b => b.getAttribute("aria-label") || b.title || b.textContent.trim().slice(0, 30)).filter(Boolean));
await p.goto(loginUrl, { waitUntil: "commit", timeout: 180000 });
await p.waitForURL(/\/notes|dev-walk/, { timeout: 180000, waitUntil: "commit" });
if (p.url().includes("dev-walk")) await p.getByRole("button", { name: /Resume/ }).click();
await p.waitForTimeout(7000);
if (phone) log("phone initial buttons", JSON.stringify((await labels()).slice(0, 60)));
await shot("00-start");
const create = p.getByRole("button", { name: /^New note in Scratch$/i }).first();
await create.click({ timeout: 90000 });
await p.waitForTimeout(3000);
if (await p.getByText("Which organization is this for?").count()) { await p.getByRole("dialog").getByText(/admin.s Workspace/).first().click(); await p.getByRole("button", { name: "Continue" }).click(); await p.waitForTimeout(5000); }
const stamp = `Copy walk ${tag}`;
const body = `# ${stamp}\n\nA **bold** word here.\n\n- first bullet item\n- second bullet item\n\nRead [the guide](https://example.com/guide?utm_source=newsletter&id=7) now.`;
const ta = p.locator('textarea[aria-label="Note text"]').first();
await ta.waitFor({ timeout: 90000 });
await ta.click(); await ta.fill(body); await p.waitForTimeout(4000);
log("note created, textarea chars", (await ta.inputValue()).length);
await shot("01-note");
// 1. the bar's one-click Copy
const trig = p.locator('button[aria-label^="Copy, transform or export Note \\""]').last();
await trig.scrollIntoViewIfNeeded().catch(() => {});
await trig.click(); await p.waitForTimeout(600); await shot("01b-after-click"); await p.waitForTimeout(1900);
const c1 = await clip().catch(e => ({ error: String(e) }));
log("BAR COPY clipboard types", JSON.stringify(Object.keys(c1)));
log("BAR COPY text/plain", JSON.stringify(c1["text/plain"]));
log("BAR COPY text/html", JSON.stringify((c1["text/html"] || "").slice(0, 400)));
// 2. panel order
const tiles = await p.evaluate(() => [...document.querySelectorAll(".matrx-alchemy-palette-grid .matrx-alchemy-palette-tile")].map(t => t.getAttribute("aria-label")));
log("PANEL tiles", JSON.stringify(tiles));
await shot("02-copy-as-panel");
// Copy markdown / Copy text from panel
await p.getByRole("button", { name: "Copy markdown", exact: true }).click(); await p.waitForTimeout(1500);
const c2 = await clip().catch(e => ({ error: String(e) }));
log("PANEL Copy markdown", JSON.stringify(c2));
await trig.click(); await p.waitForTimeout(1500);
await p.getByRole("button", { name: "Copy text", exact: true }).click(); await p.waitForTimeout(1500);
const c3 = await clip().catch(e => ({ error: String(e) }));
log("PANEL Copy text", JSON.stringify(c3));
await p.keyboard.press("Escape");
// 3. Read mode selection
const read = p.getByRole("radio", { name: /Read/ }).or(p.getByRole("button", { name: /^Read$/ })).first();
if (await read.count()) { await read.click(); await p.waitForTimeout(3000); } else log("no Read switch (phone layout)");
await shot("03-read-mode");
await p.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.textContent.includes("first bullet item") && !n.parentElement.closest("textarea,[contenteditable=true],nav,aside")) { const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, n.textContent.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); break; } } });
await p.mouse.move(5, 5); await p.mouse.down(); await p.mouse.up();
await p.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.textContent.includes("first bullet item") && !n.parentElement.closest("textarea,[contenteditable=true]")) { const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, n.textContent.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event("selectionchange")); break; } } });
await p.waitForTimeout(1500);
log("READ selection buttons", JSON.stringify((await labels()).filter(l => /copy|more/i.test(l))));
await shot("04-read-selection-toolbar");
const more = p.getByRole("button", { name: /^More/ }).last();
if (await more.count()) { await more.click(); await p.waitForTimeout(800); log("READ More menu", JSON.stringify(await p.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map(m => m.textContent.trim().slice(0, 40))))); await shot("05-read-more"); await p.keyboard.press("Escape"); }
// 4. Ctrl+Shift+C on a selection containing the link
await p.evaluate(() => { const a = [...document.querySelectorAll("a[href]")].find(x => /example\.com\/guide/.test(x.href)); if (!a) return; log; const r = document.createRange(); r.selectNodeContents(a.parentElement); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
log("link href in DOM", await p.evaluate(() => [...document.querySelectorAll("a[href]")].map(a => a.href).find(h => /example\.com/.test(h))));
await p.keyboard.press("Control+Shift+c"); await p.waitForTimeout(2000);
const c4 = await clip().catch(e => ({ error: String(e) }));
log("CTRL+SHIFT+C", JSON.stringify(c4), "has utm_source:", JSON.stringify(c4).includes("utm_source"));
await shot("06-ctrl-shift-c");
await browser.close();

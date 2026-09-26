// usage: node p1c-walk.mjs <stepsFile.mjs> [devLoginUrl]
// Keeps a signed-in storage state in scratchpad/p1c-state.json; runs the steps module's default export(page, helpers).
import { chromium } from "playwright";
import fs from "node:fs";
const S = "/private/tmp/claude-501/-Users-armanisadeghi-code-common-docs/3ab777dc-3130-4787-b9d8-bfd837a1aa38/scratchpad";
const [,, stepsFile, loginUrl] = process.argv;
const base = "http://s05f33637.localhost:3001";
const browser = await chromium.launch();
const vp = process.env.PHONE ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const ctx = await browser.newContext({ viewport: vp, colorScheme: process.env.DARK ? "dark" : "light", isMobile: !!process.env.PHONE, hasTouch: !!process.env.PHONE, storageState: loginUrl ? undefined : `${S}/p1c-state.json` });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning" || /organization|scrape|failed/i.test(m.text())) console.log("[console.error]", m.text().slice(0, 300)); });
if (loginUrl) { await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 120000 }); await page.waitForTimeout(3000); await ctx.storageState({ path: `${S}/p1c-state.json` }); }
const shot = async (name) => { const f = `${S}/shots/${name}.png`; await page.screenshot({ path: f }); console.log("shot", f); };
const mod = await import(stepsFile);
try { await mod.default(page, { base, shot }); } catch (e) { console.log("STEP FAILED:", e.message.slice(0, 500)); await shot("failure"); }
await ctx.storageState({ path: `${S}/p1c-state.json` });
await browser.close();

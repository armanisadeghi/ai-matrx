// scripts/walk-fixes-2-lib.mjs — lane WALK-FIXES-2: headless seats on the shared preview (dev-login nonce).
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const SHOTS = process.env.SHOTS ?? "/tmp/walk-fixes-2";
mkdirSync(SHOTS, { recursive: true });
export const T = { tasks: "ecb341de-0e96-4d66-83ee-9f1c6f031541", plan: "3a3616cc" };

export async function seat(member = false, next = "/data") {
  const args = ["-s", "dev-login", ...(member ? ["--member"] : []), next];
  const outText = execFileSync("pnpm", args, { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" });
  const url = outText.match(/OPEN\s+:\s+(\S+)/)[1];
  const origin = new URL(url).origin;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: Number(process.env.W ?? 2200), height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/_next\/hmr|WebSocket/.test(m.text())) errors.push(m.text().slice(0, 400)); });
  page.on("pageerror", (e) => errors.push(`PAGEERROR ${String(e).slice(0, 400)}`));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForLoadState("load", { timeout: 300000 }).catch(() => {});
  const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
  return { browser, context, page, origin, errors, shot };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

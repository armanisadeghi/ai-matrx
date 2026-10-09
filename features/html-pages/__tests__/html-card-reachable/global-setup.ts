/**
 * Signs this session's preview host in once (dev-login nonce → cookies) and
 * saves the session for the spec. Needs the shared preview (`pnpm preview:start`);
 * without it the gate FAILS as UNMEASURED — never a silent pass.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(__dirname, "../../../..");
export const STATE = path.join(ROOT, ".cache/playwright/html-card-reachable/state.json");

export default async function globalSetup(): Promise<void> {
  const out = execFileSync("bash", [path.join(ROOT, "scripts/dev-login.sh"), "/dashboard"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const url = /OPEN\s*:\s*(\S+)/.exec(out)?.[1];
  if (!url) throw new Error(`UNMEASURED: dev-login printed no URL (is the preview running?)\n${out}`);
  process.env.HTML_CARD_ORIGIN = new URL(url).origin;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.context().storageState({ path: STATE });
  await browser.close();
}

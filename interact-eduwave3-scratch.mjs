// Throwaway interaction script for page-pass on /education/tutor, /education/planner,
// /education/game, /education/game/solo. Logs in via dev-login, then drives each page.
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const HOST = "eduwave3.localhost:3001";

function devLoginUrl(next) {
  const out = execSync(`MATRX_PREVIEW_SESSION=eduwave3 pnpm -s dev-login ${JSON.stringify(next)}`, {
    cwd: "/Users/armanisadeghi/code/matrx-frontend",
    encoding: "utf8",
  });
  const m = out.match(/OPEN\s*:\s*(\S+)/);
  if (!m) throw new Error("no dev-login URL: " + out);
  return m[1];
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[console.error]", msg.text());
  });
  page.on("pageerror", (err) => console.log("[pageerror]", err.message));
  page.on("requestfailed", (req) => console.log("[requestfailed]", req.url(), req.failure()?.errorText));

  const step = process.argv[2] || "all";

  async function login(next) {
    const url = devLoginUrl(next);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
  }

  if (step === "tutor-new" || step === "all") {
    console.log("=== /education/tutor: click New tutor session ===");
    await login("/education/tutor");
    await page.waitForTimeout(4000);
    await page.screenshot({ path: "/tmp/pl-eduwave3/interact-tutor-home.png", fullPage: false });
    const newBtn = page.getByRole("button", { name: /new tutor session/i }).first();
    await newBtn.click({ timeout: 15000 });
    await page.waitForTimeout(5000);
    console.log("URL after click:", page.url());
    await page.screenshot({ path: "/tmp/pl-eduwave3/interact-tutor-new-result.png", fullPage: false });
  }

  if (step === "tutor-send" || step === "all") {
    console.log("=== /education/tutor/[id]: send a message ===");
    await login("/education/tutor/5105d9d2-3033-48a0-817f-39bfec385fde");
    await page.waitForTimeout(4000);
    const textarea = page.getByPlaceholder(/type your message/i).first();
    await textarea.click({ timeout: 15000 });
    await textarea.fill("PP test — quick check message");
    await page.screenshot({ path: "/tmp/pl-eduwave3/interact-tutor-typed.png", fullPage: false });
    const sendBtn = page.locator('button:has(svg)').filter({ hasText: "" }).last();
    // Try Enter instead, more reliable
    await textarea.press("Enter");
    await page.waitForTimeout(6000);
    await page.screenshot({ path: "/tmp/pl-eduwave3/interact-tutor-sent.png", fullPage: false });
  }

  if (step === "planner" || step === "all") {
    console.log("=== /education/planner ===");
    await login("/education/planner");
    await page.waitForTimeout(4000);
    await page.screenshot({ path: "/tmp/pl-eduwave3/interact-planner.png", fullPage: true });
  }

  if (step === "game" || step === "all") {
    console.log("=== /education/game ===");
    await login("/education/game");
    await page.waitForTimeout(4000);
    await page.screenshot({ path: "/tmp/pl-eduwave3/interact-game.png", fullPage: true });
  }

  if (step === "game-solo" || step === "all") {
    console.log("=== /education/game/solo ===");
    await login("/education/game/solo");
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "/tmp/pl-eduwave3/interact-game-solo.png", fullPage: true });
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

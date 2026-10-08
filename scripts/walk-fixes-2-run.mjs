// Runs one walk step file (STEP=path) with { page, shot, sleep, T, origin, errors } in scope, after signing in.
import { seat, T, sleep, live } from "./walk-fixes-2-lib.mjs";
import { readFileSync } from "node:fs";
const s = await seat(process.env.MEMBER === "1", process.env.NEXT ?? `/data/${T.tasks}`);
const { page } = s;
await page.waitForSelector('[role="columnheader"], [role="grid"]', { timeout: 240000 }).catch(() => {});
await sleep(3000);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// Keep this host the most recent walk while a step runs (the cap evicts the least recently used host).
const keep = setInterval(() => { page.evaluate(() => fetch("/data", { method: "HEAD" }).catch(() => {})).catch(() => {}); }, 15000);
const paused = async () => page.url().includes("__dev-walk") || (await page.getByText("This preview was paused").count().catch(() => 0)) > 0;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    await new AsyncFunction("page", "shot", "sleep", "T", "origin", "errors", "live", readFileSync(process.env.STEP, "utf8"))(page, s.shot, sleep, T, s.origin, s.errors, (u) => live(page, u));
    break;
  } catch (e) {
    if (await paused()) { console.log("[walk] paused mid-step; Resume and run the step again"); await live(page, s.origin + (process.env.NEXT ?? `/data/${T.tasks}`)); continue; }
    console.log("STEP FAILED", String(e).slice(0, 800)); await s.shot("failed"); break;
  }
}
clearInterval(keep);
console.log("ERRORS", JSON.stringify(s.errors.filter((e) => !/matrx-pending/.test(e))).slice(0, 1500));
await s.browser.close();

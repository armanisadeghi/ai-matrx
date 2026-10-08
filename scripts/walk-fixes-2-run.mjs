// Runs one walk step file (STEP=path) with { page, shot, sleep, T, origin, errors } in scope, after signing in.
import { seat, T, sleep } from "./walk-fixes-2-lib.mjs";
import { readFileSync } from "node:fs";
const s = await seat(process.env.MEMBER === "1", process.env.NEXT ?? `/data/${T.tasks}`);
const { page } = s;
await page.waitForSelector('[role="columnheader"], [role="grid"]', { timeout: 240000 }).catch(() => {});
await sleep(3000);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
try {
  await new AsyncFunction("page", "shot", "sleep", "T", "origin", "errors", readFileSync(process.env.STEP, "utf8"))(page, s.shot, sleep, T, s.origin, s.errors);
} catch (e) { console.log("STEP FAILED", String(e).slice(0, 800)); await s.shot("failed"); }
console.log("ERRORS", JSON.stringify(s.errors.filter((e) => !/matrx-pending/.test(e))).slice(0, 1500));
await s.browser.close();

// Safety-net harness: shared sign-in, checks and fault switch for the journeys.
// Reads credentials from .env (never printed). Drives the shared preview headless as admin@admin.com.
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { signIn, until, sleep } from "../../../scripts/lib/seat-browser.mjs";

export { until, sleep };
export const ROOT = new URL("../../../", import.meta.url).pathname;

export function loadEnv() {
  const env = {};
  for (const file of [".env", ".env.local"]) {
    const p = ROOT + file;
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
  return env;
}

export function resolveOrigin() {
  if (process.env.ORIGIN) return process.env.ORIGIN.replace(/\/$/, "");
  const out = execSync("pnpm preview:status 2>&1", { cwd: ROOT, encoding: "utf8", timeout: 300000 });
  const m = out.match(/YOUR URL: (http:\/\/\S+)/);
  if (!m) throw new Error("no preview URL; run `pnpm preview:status` (never start a second server)");
  return m[1];
}

/** FAULT proof: SAFETYNET_FAULT=<journeyId> makes that journey look for something that cannot be true. */
export const faulted = (id) => (process.env.SAFETYNET_FAULT ?? "").split(",").includes(id);

export const OUT = process.env.SAFETYNET_OUT ?? `${tmpdir()}/safety-net-${new Date().toISOString().slice(0, 10)}`;
mkdirSync(OUT, { recursive: true });

export async function openSession({ signedIn = true } = {}) {
  const env = loadEnv();
  const origin = resolveOrigin();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e.message).slice(0, 200)));
  let email = null;
  if (signedIn) email = await signIn(page, origin, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  return { browser, ctx, page, origin, env, email, consoleErrors };
}

/** goto that also resumes a parked preview host like a person would. */
export async function open(s, path, { waitFor } = {}) {
  await s.page.goto(`${s.origin}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const resume = s.page.getByText("Resume this preview");
  if (await resume.isVisible({ timeout: 2000 }).catch(() => false)) {
    await resume.click();
    await sleep(1500);
    await s.page.goto(`${s.origin}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  }
  if (waitFor) await s.page.waitForSelector(waitFor, { timeout: 90000 }).catch(() => undefined);
}

export async function whoami(page) {
  return page.evaluate(async () => {
    try { return (await (await fetch("/api/whoami")).json())?.email ?? null; } catch { return null; }
  });
}

/** A journey = { id, title, run(ctx) } where ctx.check(name, ok, detail) records an assertion on what a person sees. */
export function makeCtx(journeyId) {
  const checks = [];
  return {
    checks,
    check(name, ok, detail = "") {
      checks.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) });
      console.log(`  ${ok ? "PASS" : "FAIL"} [${journeyId}] ${name}${detail ? " — " + String(detail).slice(0, 200) : ""}`);
    },
    note(msg) { console.log(`  NOTE [${journeyId}] ${msg}`); checks.push({ name: "note", ok: true, note: true, detail: msg }); },
    skip(name, reason) { console.log(`  SKIP [${journeyId}] ${name} — ${reason}`); checks.push({ name, ok: true, skipped: true, detail: reason }); },
  };
}

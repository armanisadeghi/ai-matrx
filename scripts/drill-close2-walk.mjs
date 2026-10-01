// LANE DRILL-CLOSE-2 — headless, read-only live check of /administration/usage: Feature group over 30 days has no
// raw "mandate:..." codes or "Sch run"; Provider shows "Z.ai". Seat: admin@admin.com (credentials from .env.local, never printed).
// Usage: node scripts/drill-close2-walk.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.ORIGIN ?? "https://manage.aimatrx.com";
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1100 } })).newPage();
const out = {};
try {
  out.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  for (const by of ["feature", "provider"]) {
    await page.goto(`${ORIGIN}/administration/usage?by=${by}&show=cost&sort=-cost&w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForTimeout(25000);
    out[by] = await page.evaluate(() => document.body.innerText);
  }
} finally {
  await browser.close();
}
const f = out.feature ?? "";
const p = out.provider ?? "";
console.log(JSON.stringify({
  seat: out.seat,
  featureRawMandateCodes: f.match(/mandate:[\w.\-]+/gi) ?? [],
  featureSchRun: /Sch run/.test(f),
  featureScheduledRun: /Scheduled run/.test(f),
  featureLines: f.split("\n").map((l) => l.trim()).filter((l) => /mandate|Sch run|Scheduled|\u00b7|Agent service|schedule|run/i.test(l) && l.length < 80).slice(0, 60),
  providerHasZai: /Z\.ai/.test(p),
  providerHasZSpaceAi: /\bZ ai\b/.test(p),
  providerLines: p.split("\n").map((l) => l.trim()).filter((l) => /^(Z[. ]ai|Anthropic|Google|OpenAI|xAI|Groq)/i.test(l)).slice(0, 20),
}, null, 1));

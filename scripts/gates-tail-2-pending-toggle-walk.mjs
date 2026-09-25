// LANE GATES-TAIL-2 — headless proof that a direct-Supabase toggle is PENDING, never optimistic,
// and says a refusal in words. Settings → Privacy → Auto knowledge-graph (users.user_preferences).
// READ-ONLY: the PATCH is intercepted and answered by the walk (held 3 s, then refused with the
// database's own 42501 line); it never reaches the database. Seat: admin@admin.com via the login
// form (credentials from .env.local, never printed).
// Usage: node scripts/gates-tail-2-pending-toggle-walk.mjs <outDir>
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.GATES_TAIL_ORIGIN ?? "http://gates-tail-2.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";
const report = {};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  let intercepted = 0;
  await context.route(/\/rest\/v1\/user_preferences/, async (route) => {
    const m = route.request().method();
    if (m !== "PATCH" && m !== "POST") return route.continue();
    intercepted += 1;
    await new Promise((r) => setTimeout(r, 3000));
    return route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: "42501", details: null, hint: null, message: "permission denied for table user_preferences" }),
    });
  });
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  await page.goto(`${ORIGIN}/user-settings/general/privacy`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const sw = page.getByRole("switch", { name: /Auto knowledge-graph/i }).first();
  await sw.waitFor({ timeout: 240000 });
  await page.waitForTimeout(2500);
  const state = () => sw.evaluate((el) => ({ checked: el.getAttribute("aria-checked"), disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true" || el.disabled === true }));
  report.before = await state();
  await sw.click();
  await page.waitForTimeout(1200);
  report.at1200ms = await state();
  await page.screenshot({ path: `${OUT}/gates-tail-2-autokg-pending-1200ms.png` });
  await page.waitForTimeout(3500);
  report.afterRefusal = await state();
  report.toasts = await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent?.trim()));
  report.intercepted = intercepted;
  report.consoleErrors = consoleErrors.filter((e) => !/Failed to load resource/.test(e)).slice(0, 8);
  await page.screenshot({ path: `${OUT}/gates-tail-2-autokg-refused-toast.png` });
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));

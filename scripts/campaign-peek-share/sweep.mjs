/**
 * PEEK-SHARE — the record peek, opened on every table crew F measured.
 *
 * Crew F's row (2026-09-21T02:40Z): the organization's own creator and sole
 * member opened a real record on 8 tables across 7 real-data organizations and
 * every one of them answered "You do not have access to this", twice, above a
 * history, a checklist and a comment box that had all loaded.
 *
 * This walks the same tables in one signed-in session and counts that sentence.
 * It is the same instrument against production (red, records 0.30.0) and
 * against this checkout (green, records 0.36.0) — the ONLY difference is
 * `--origin`.
 *
 *   node scripts/campaign-peek-share/sweep.mjs --port 3000            (localhost)
 *   node scripts/campaign-peek-share/sweep.mjs --origin https://www.aimatrx.com
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const ROOT = "/Users/armanisadeghi/code/matrx-frontend";
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const PORT = arg("--port", "3000");
const ORIGIN_OVERRIDE = arg("--origin");
const OUT = arg("--out", "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/shots");
const SHOT = arg("--shot"); // take a screenshot of this org's peek
const ADMIN_ID = "87a6e699-3622-4869-8843-d0867456c0dd";
mkdirSync(OUT, { recursive: true });

/** The eight, with a real record on each. Real businesses, real rows. */
const SUBJECTS = [
  ["Ironclad Mobile Mechanic · Service Calls", "0a751390-558e-4775-ba0e-3891bdf82d45", "215e2e75-d04e-4c8a-b208-5be46488b18d", "920bf66b-d054-4888-9898-986057f83b00"],
  ["Ironclad Mobile Mechanic · Invoices", "0a751390-558e-4775-ba0e-3891bdf82d45", "ffbddf5c-e5d8-417c-b82b-eff823f55fc4", "d952c834-ffb4-453f-832b-fa15613ff3cb"],
  ["Ironclad Mobile Mechanic · Customers", "0a751390-558e-4775-ba0e-3891bdf82d45", "02f00d65-bf3b-49bb-995c-859926be8a4f", "4673b326-7026-4e24-8e76-f0fec7c57f59"],
  ["Birchwood Avenue Renovation · quotes", "1a7fefc6-77e1-4c48-826f-003b1a2e17fd", "0e108f31-5078-48ec-9a15-b492baa414ba", "b479a974-0d68-444f-b4a1-8d4e767c1a42"],
  ["Greenline Landscaping Crew · Jobs", "f4a02eca-6547-4622-aa95-52e75ac9aae6", "182fef5a-4ead-42a0-966b-e4e88fcd87a9", "7e9c14a8-ef42-48d2-92a8-c6eb32b31235"],
  ["Hands & Hope Alliance · campaigns", "488fcc2f-22ee-49eb-9ec4-1b870591164a", "abf4f43d-9877-41c1-8e47-29c26234557b", "1f9fa537-56fc-4c1e-8735-0af8425b07bc"],
  ["Ironline Fitness · members", "11d47e36-4b1e-46b8-bdf6-8ef928b730fb", "60df8b1e-d63a-482d-9600-22469c93263c", "744b67e2-2c35-4f65-bccb-2f0869efb45e"],
  ["The Alvarado-Chen Kitchen · recipes", "e99d50c6-518c-4a56-871e-aee1702d28bb", "5f6b8364-8c3a-48ca-a833-2905a88e6ee4", "e28c9ae5-b7d3-41d5-8a3a-b970af16cc49"],
];

async function main() {
  let ORIGIN = ORIGIN_OVERRIDE;
  let loginUrl = null;
  if (!ORIGIN) {
    const out = execFileSync("bash", [resolve(ROOT, "scripts/dev-login.sh"), "/dashboard"], { cwd: ROOT }).toString();
    const u = new URL(out.split("\n").find((l) => l.includes("OPEN")).split("OPEN   : ")[1].trim());
    u.port = PORT;
    loginUrl = u.toString();
    ORIGIN = u.origin;
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await ctx.newPage();

  if (loginUrl) {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
  } else {
    const env = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    const pick = (k) => (env.split("\n").find((l) => l.startsWith(k + "=")) || "").slice(k.length + 1).replace(/^['"]|['"]$/g, "").trim();
    await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForTimeout(4000);
    await page.locator('input[type="email"], input[name="email"]').first().fill(pick("AI_ADMIN_USERNAME"));
    await page.locator('input[type="password"], input[name="password"]').first().fill(pick("AI_ADMIN_PASSWORD"));
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(15000);
  }
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  if (who?.email !== "admin@admin.com") throw new Error(`wrong identity: ${JSON.stringify(who)}`);
  console.log(`[sweep] ${ORIGIN} as ${who.email}`);

  const host = new URL(ORIGIN).hostname;
  const results = [];
  for (const [name, org, table, record] of SUBJECTS) {
    await ctx.clearCookies({ name: "matrx-active-org" });
    await ctx.addCookies([{ name: "matrx-active-org", value: `${ADMIN_ID}:${org}`, domain: host, path: "/", sameSite: "Lax" }]);
    let state = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.goto(`${ORIGIN}/data-v2/${table}?record=${record}`, { waitUntil: "domcontentloaded", timeout: 180000 });
      await page.waitForTimeout(attempt === 0 ? 14000 : 20000);
      state = await page.evaluate(() => {
        const txt = document.body.innerText;
        return {
          refusals: txt.split("You do not have access to this").length - 1,
          // The record's own panel drew: its History / Comments headings are up.
          panel: /\bHistory\b/.test(txt) && /\bComments\b/.test(txt),
          footnote: txt.includes("Nothing here can say which columns the system worked out"),
          couldNotCheck: txt.includes("We could not check your organization") || txt.includes("does not keep its data in the unified record store"),
        };
      });
      // A transient PostgREST schema-cache reload answers for the whole app, not
      // for this defect; it is retried rather than counted.
      if (!state.couldNotCheck) break;
    }
    results.push({ name, ...state });
    console.log(`  ${state.refusals === 0 && state.panel ? "OK  " : "FAIL"} ${name.padEnd(42)} refusals=${state.refusals} panel=${state.panel} footnote=${state.footnote}`);
    if (SHOT && name.includes(SHOT)) {
      await page.screenshot({ path: resolve(OUT, `${arg("--tag", "sweep")}.png`) });
    }
  }

  const bad = results.filter((r) => r.refusals > 0 || !r.panel);
  console.log(`\n[sweep] ${results.length - bad.length}/${results.length} opened with no refusal.`);
  writeFileSync(resolve(OUT, `${arg("--tag", "sweep")}.json`), JSON.stringify({ origin: ORIGIN, results }, null, 2));
  await browser.close();
  process.exitCode = bad.length === 0 ? 0 : 1;
}
main().catch((e) => { console.error("[sweep] FAILED", e.message); process.exit(2); });

/**
 * LANE SC-3' — the headless walk of the agent-context compare mode, from admin@admin.com's seat
 * (Priya Raman, Harborline Software's lead engineer, in the compare fixture).
 *
 *   SC3_ORIGIN=http://sc3.localhost:3068 SC3_EMAIL=… SC3_PASSWORD=… \
 *   SC3_AGENT_ID=<an agent the seat may run> SC3_SHOTS=<dir> \
 *   node scripts/campaign-tests/sc3_compare_walk.mjs
 *
 * The data is scripts/campaign-tests/_sc3_compare_fixture.sql (dev clone only); the dev server and
 * its aidream must both point at the clone (scripts/campaign-ports.json "SC-3": 3068). Credentials
 * come from the environment and are never printed.
 *
 * Clauses: the compare card resolves Harborline Dispatch on both systems; the summary says no
 * defects; both blocks draw side by side; the relation field shows as a declared tier move with
 * its sentence; the new side's check says Priya may read it; "Answer on both paths" answers the
 * owner's question once from each system; AP Chemistry (a scope of the tutoring organization
 * Priya also owns) compares identically. Headless only. Exit 0 only when every clause passes.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { setOrganization, signIn, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.SC3_ORIGIN ?? "http://sc3.localhost:3068";
const EMAIL = process.env.SC3_EMAIL ?? "";
const PASSWORD = process.env.SC3_PASSWORD ?? "";
const AGENT = process.env.SC3_AGENT_ID ?? "";
const OUT = process.env.SC3_SHOTS ?? "/tmp/sc3-shots";
if (!EMAIL || !PASSWORD || !AGENT) {
  console.error("SC3_EMAIL, SC3_PASSWORD and SC3_AGENT_ID must be set (credentials are never printed).");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const DISPATCH = "5fd365ca-7d0e-4e1c-8b9b-a79131b38f20";
const CHEM = "ecb6e60b-5c8b-4a7b-acc7-7c2c078242e9";
const QUESTION = "What is this app's tech stack and what are its non-negotiable standards?";

const results = {};
const pass = (name, ok, saw) => {
  results[name] = { ok: Boolean(ok), saw };
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${saw}`);
};

async function compare(page, scopeId, agentId) {
  await page.goto(`${ORIGIN}/administration/scopes-context/context-inspector`, {
    waitUntil: "domcontentloaded",
    timeout: 240000,
  });
  await page.waitForSelector("#compare-scope-id", { timeout: 180000 });
  // Hydration: a fill that lands before React attaches is silently dropped, so fill until the
  // button reads the value (it is enabled only for a well-formed id).
  const btn = 'button[type="submit"]:has-text("Compare")';
  await until(
    "hydrated fill",
    async () => {
      // Clear first: a value typed before hydration is already in the DOM, so re-filling the same
      // string fires no change React can see.
      await page.fill("#compare-scope-id", "");
      await page.fill("#compare-agent-id", "x");
      await page.fill("#compare-scope-id", scopeId);
      await page.fill("#compare-agent-id", agentId ?? "");
      await page.waitForTimeout(600);
      return page.isEnabled(btn);
    },
    120000,
  );
  await page.click('button[type="submit"]:has-text("Compare")');
  const { v } = await until("summary", () => page.$("[data-compare-summary]"), 180000);
  return Boolean(v);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const seen = await signIn(page, ORIGIN, EMAIL, PASSWORD, "the owner seat");
  pass("signed in as the test owner", seen === EMAIL, seen);
  // A signed-in request to the server is held until the person has picked an organization (the
  // organization gate). Pick one the way a person does; the compare itself resolves each scope
  // under ITS OWN organization, whichever is active.
  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await setOrganization(page, "Brightline Facilities");

  const ok = await compare(page, DISPATCH, AGENT);
  const summary = ok ? await page.textContent("[data-compare-summary]") : "";
  pass("Dispatch compares on both systems", ok, summary?.slice(0, 120) ?? "no summary");
  pass("no defects", /No defects|Identical/.test(summary ?? ""), summary?.slice(0, 80) ?? "");
  const sides = await page.$$eval("[data-compare-side]", (els) => els.map((e) => e.getAttribute("data-compare-side")));
  pass("both blocks side by side", sides.includes("old") && sides.includes("new"), sides.join(","));
  const tier = await page.$('[data-difference-class="declared tier move"]');
  const tierText = tier ? await tier.textContent() : "";
  pass("the relation field is a declared tier move", /open_known_problem/.test(tierText ?? ""), tierText?.slice(0, 100) ?? "none");
  const check = await page.$('[data-check-admitted="true"]');
  pass("the new side checked the scope for Priya", Boolean(check), check ? (await check.textContent())?.slice(0, 80) : "none");
  await page.screenshot({ path: `${OUT}/sc3-compare-dispatch.png`, fullPage: true });

  await page.fill("[data-answer-both] textarea", QUESTION);
  await page.click('[data-answer-both] button:has-text("Answer on both paths")');
  const { v: answered } = await until(
    "two answers",
    async () => {
      const texts = await page.$$eval("[data-answer-path]", (els) => els.map((e) => e.textContent ?? ""));
      return texts.length === 2 && texts.every((t) => t.length > 80) ? texts : null;
    },
    420000,
  );
  pass(
    "answer on both paths",
    Boolean(answered),
    answered ? answered.map((t) => t.slice(0, 70).replace(/\s+/g, " ")).join(" | ") : "no two answers",
  );
  await page.screenshot({ path: `${OUT}/sc3-answer-both-dispatch.png`, fullPage: true });

  const okChem = await compare(page, CHEM, "");
  const chemSummary = okChem ? await page.textContent("[data-compare-summary]") : "";
  pass("AP Chemistry compares identically", /Identical|No defects/.test(chemSummary ?? ""), chemSummary?.slice(0, 80) ?? "");
  const noAnswer = await page.$("[data-answer-both] textarea");
  pass("without an agent the answer control is absent", !noAnswer, noAnswer ? "a textarea is drawn" : "absent, with its sentence");
  await page.screenshot({ path: `${OUT}/sc3-compare-ap-chemistry.png`, fullPage: true });

  pass("no page errors", errors.length === 0, errors.slice(0, 2).join(" | ") || "none");
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/sc3-walk.json`, JSON.stringify(results, null, 2));
const failed = Object.values(results).filter((r) => !r.ok).length;
console.log(`${Object.keys(results).length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

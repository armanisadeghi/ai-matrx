// scripts/data-hub/hubfix-production-check.mjs — LANE HUB-FIX, item 4
//
// TWO SENTENCES THAT MUST BE GONE FROM THE LIVE HUB, confirmed on production
// after the release that carries their fix landed. They were fixed on `main` by
// lane DATA-HUB (`e3500d8c4f`) and VERIFIER-14 found them still on the screen
// only because the live build predated that commit. This lane re-fixes nothing;
// it watches and says what is there.
//
//   1. "Crew choices in Crew choices" — a Table row printing its own name twice.
//   2. "1 column · entity" — `table.type`, the store's own token, on a row.
//
// It signs in the way a person does and picks the organization through the
// picker. Read-only: it opens the hub, reads the rows, and shoots the screen.
//
//   node scripts/data-hub/hubfix-production-check.mjs --out <dir> [--origin https://www.aimatrx.com]

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

import { signIn, setOrganization, sleep, until } from "../lib/seat-browser.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ORIGIN = flag("origin", "https://www.aimatrx.com");
const OUT = resolve(flag("out", "scripts/data-hub/hubfix-shots"));
mkdirSync(OUT, { recursive: true });

const ADMIN = process.env.AI_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD;
if (!ADMIN || !ADMIN_PASSWORD) {
  console.error("AI_ADMIN_USERNAME and AI_ADMIN_PASSWORD must be in the environment.");
  process.exit(1);
}

const findings = [];
let failures = 0;
const say = (line) => {
  console.log(line);
  findings.push(line);
};
const clause = (label, ok, detail) => {
  if (!ok) failures += 1;
  say(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const version = await page.evaluate(() => null).catch(() => null);
  void version;
  const build = await (await fetch(`${ORIGIN}/api/version`)).json().catch(() => null);
  say(`live build: ${build?.commit ?? "unknown"} (deployment ${build?.deploymentId ?? "unknown"})`);

  const who = await signIn(page, ORIGIN, ADMIN, ADMIN_PASSWORD, "admin@admin.com");
  say(`signed in as ${who}`);
  if (who !== ADMIN) throw new Error(`expected ${ADMIN}, the app says ${who}`);
  await setOrganization(page, "Rincon Plumbing Co");
  say("organization set to Rincon Plumbing Co");

  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const { v: ready, ms } = await until(
    "the hub settled",
    async () =>
      page.evaluate(() => {
        const body = document.body?.innerText ?? "";
        if (!body.includes("Start here")) return null;
        return body.includes("reading…") ? null : true;
      }),
    60000,
  );
  say(`hub settled=${Boolean(ready)} after ${ms} ms`);

  // Every listing open, so the rows themselves are on the page and not just headings.
  await page.evaluate(() => {
    for (const b of Array.from(document.querySelectorAll("[data-hub-listing-toggle]"))) {
      if (b.getAttribute("aria-expanded") === "false") b.click();
    }
  });
  await page.keyboard.press("Escape");
  await sleep(2000);

  const seen = await page.evaluate(() => {
    const root = document.querySelector("[data-hub-root]");
    const text = root?.innerText ?? "";
    const doubled = (text.match(/^(.+?)\s+in \1$/gm) ?? []).slice(0, 5);
    const machineWords = ["entity", "detail", "reference", "ledger", "restricted", "system", "deprecated"];
    const typeTokens = machineWords.filter((w) => new RegExp(`column(s)? · ${w}\\b`).test(text));
    return { doubled, typeTokens, length: text.length };
  });

  clause(
    'no row prints its own name twice ("Crew choices in Crew choices")',
    seen.doubled.length === 0,
    seen.doubled.length === 0 ? "0 rows match `<name> in <same name>`" : seen.doubled.join(" | "),
  );
  clause(
    'no row prints the store\'s own table-type word ("1 column · entity")',
    seen.typeTokens.length === 0,
    seen.typeTokens.length === 0 ? "none of the seven table types is on a row" : seen.typeTokens.join(", "),
  );

  await page.screenshot({ path: resolve(OUT, "hubfix-production-hub.png"), fullPage: true });
  say("  shot hubfix-production-hub.png");

  await page.close();
  await context.close();
  say(`\n${failures === 0 ? "ALL CLAUSES PASS" : `${failures} CLAUSE(S) FAILED`}`);
  writeFileSync(resolve(OUT, "hubfix-production-check.txt"), `${findings.join("\n")}\n`);
} finally {
  await browser.close();
}
process.exit(failures === 0 ? 0 : 1);

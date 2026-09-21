// Data crew C: turn the unified data store on for the three real-public-data
// throwaway orgs via the admin-only ramp API, using a real dev-login browser
// session (headless Playwright against the shared machine-wide dev server,
// port 3001), on this crew's own *.localhost host so it does not share a
// cookie jar with any other lane using plain "localhost".
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const HOST = "realdata-c.localhost";
const ORIGIN = `http://${HOST}:3001`;

const orgIdsByFile = JSON.parse(readFileSync(resolve(ROOT, "scripts/campaign-tests/org-ids-crew-c.json"), "utf8"));
const orgIds = Object.values(orgIdsByFile);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent("/administration/database/unified-data-ramp")}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  console.log("signed in as", who?.email ?? who);

  const results = {};
  for (const organizationId of orgIds) {
    const resp = await page.evaluate(async (organizationId) => {
      const r = await fetch("/api/admin/unified-data-ramp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "store", organizationId, on: true, note: "data crew C real-data campaign" }),
      });
      return { status: r.status, body: await r.json() };
    }, organizationId);
    console.log(organizationId, JSON.stringify(resp));
    results[organizationId] = resp;
  }
  writeFileSync(resolve(ROOT, "scripts/campaign-tests/store-switch-crew-c.json"), JSON.stringify(results, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});

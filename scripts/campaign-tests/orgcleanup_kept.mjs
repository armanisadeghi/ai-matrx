// ORG-CLEANUP — the admin seat still reaches every crew the owner guide keeps, after the archive.
// Each kept crew is opened the way a person opens it (picker, by address where the name repeats),
// then /data-v2 is read back for the tables it holds.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { signIn, setOrganization, setOrganizationBySlug, sleep } from "../lib/seat-browser.mjs";

const root = path.resolve(new URL(".", import.meta.url).pathname, "../..");
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const ORIGIN = process.env.ORG_CLEANUP_ORIGIN ?? "http://org-cleanup.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
fs.mkdirSync(OUT, { recursive: true });

// The five the owner guide's table names, with the address that disambiguates the repeats.
const CREWS = [
  ["Rincon Plumbing Co", null],
  ["Birchwood Avenue Renovation", "home-renovation"],
  ["Ironclad Mobile Mechanic", "ironclad-mobile-mechanic"],
  ["Ironline Fitness", "fixture-ironline-fitness-f1wa0s"],
  ["Hands & Hope Alliance", "hands-and-hope-alliance"],
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
console.log("seat:", await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD));

const report = [];
for (const [name, slug] of CREWS) {
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3500);
  const how = slug ? await setOrganizationBySlug(page, name, slug) : await setOrganization(page, name);
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(5000);
  const seen = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      names: (t.match(/[A-Za-z0-9&'’ .\-—]+/g) ?? []).length > 0,
      blocked: /pick an organization|choose an organization/i.test(t),
      error: /something went wrong at our end/i.test(t),
      tables: (t.match(/\b(Jobs|Customers|Invoices|Crews|Parts|quotes|Members|Classes|Donors|Pledges|Campaigns|Service calls|Vehicles)\b/g) ?? []).filter((v, i, a) => a.indexOf(v) === i),
      chars: t.length,
      head: t.slice(0, 400),
    };
  });
  const row = { name, slug, how, ...seen };
  report.push(row);
  console.log(JSON.stringify(row));
  await page.screenshot({ path: `${OUT}/orgcleanup-kept-${(slug ?? name).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`, fullPage: false });
}
fs.writeFileSync(`${OUT}/orgcleanup-kept.json`, JSON.stringify(report, null, 2));
await browser.close();

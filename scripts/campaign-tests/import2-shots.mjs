// IMPORT-2 — the pictures. The real ImportWizard from the workspace source, driven headless
// against the MAIN database as admin@admin.com in Rincon Plumbing Co, importing the September
// service board: eight columns the table has not got and 1,000 tickets.
//
// The harness is @ai-matrx/records-ui's own demo (`demo/vite.config.ts`), which renders the
// package's real screens over the real doors — the frontend installs records-ui from npm and
// this lane is not publishing, so this is where the NEW wizard actually runs.
//
//   node scripts/campaign-tests/import2-shots.mjs --table <uuid> --out <dir>
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const TABLE = arg("--table");
const OUT = arg("--out", "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22");
const ORIGIN = "http://127.0.0.1:3049";
if (!TABLE) { console.error("--table <uuid> is required"); process.exit(2); }
mkdirSync(OUT, { recursive: true });

// The same September service board the suite imports: Ventura-County streets, a real plumbing
// job lifecycle, synthesised customers — never a real person.
const STREETS = ["Ventura Ave", "Telegraph Rd", "Petit Ave", "Loma Vista Rd", "Victoria Ave",
  "Foothill Rd", "Wells Rd", "Saticoy Ave", "Darling Rd", "Olivas Park Dr", "Bristol Rd",
  "Kimball Rd", "Johnson Dr", "Seaward Ave", "Thompson Blvd"];
const CITIES = ["Ventura", "Oxnard", "Camarillo", "Santa Paula", "Ojai", "Port Hueneme"];
const SERVICES = ["Drain Cleaning", "Water Heater Replacement", "Slab Leak Repair",
  "Sewer Camera Inspection", "Whole-House Repipe", "Fixture Install", "Backflow Test", "Emergency Callout"];
const STATUSES = ["Scheduled", "In Progress", "Completed", "Invoiced"];
const CREWS = ["Truck 4 — Benavides", "Truck 4 — Benavides / Okafor", "Truck 7 — Delacroix"];
const LAST = ["Alcantar", "Brannigan", "Castellanos", "Dolan", "Eguchi", "Fennimore", "Gallardo",
  "Hollingsworth", "Ibarra", "Jessup", "Kalinowski", "Lindqvist", "Madrigal", "Nakashima",
  "Olivares", "Pankhurst", "Quintanilla", "Rosenbaum", "Suriano", "Thibodeaux"];
const FIRST = ["Ana", "Brett", "Celia", "Devon", "Elena", "Franklin", "Gina", "Hector", "Imani",
  "Jarrod", "Kenji", "Lourdes", "Marcus", "Nadia", "Omar", "Priya", "Quincy", "Rosa", "Samir", "Tessa"];
const NOTES = ["Gate code at the alley side; dog is friendly but loud.",
  "Second-floor unit — carry the drum snake up the outside stair.",
  "Tenant works nights, do not arrive before 11am.",
  "Shutoff is behind the oleander on the north wall.",
  "Prior visit left the cleanout cap loose; bring a replacement.",
  "Property manager wants photos before and after.",
  "Park on the street, the driveway is being resurfaced.",
  "Confirm with the office before opening the wall."];
const HEADERS = ["Job Number", "Customer", "Service Address", "Service Type", "Scheduled Date", "Crew", "Status", "Notes"];

const rows = [];
for (let i = 0; i < 1000; i += 1) {
  const day = new Date(Date.UTC(2026, 8, 1 + (i % 28)));
  rows.push([`RPC-SEP-${41000 + i}`, `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    `${1200 + ((i * 13) % 4800)} ${STREETS[i % STREETS.length]}, ${CITIES[(i * 3) % CITIES.length]} CA`,
    SERVICES[i % SERVICES.length], day.toISOString().slice(0, 10), CREWS[i % CREWS.length],
    STATUSES[(i * 5) % STATUSES.length], NOTES[(i * 3) % NOTES.length]]);
}
const csv = [HEADERS.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on("console", (m) => { if (m.type() === "error") console.log("  console error:", m.text().slice(0, 160)); });

const shot = async (name, note) => {
  const at = resolve(OUT, `import2-${name}.png`);
  await page.screenshot({ path: at, fullPage: true });
  console.log(`  ${at}  — ${note}`);
};

await page.goto(`${ORIGIN}/?demo=import&table=${TABLE}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await shot("1-the-wizard-before-the-file", "the wizard on a table with no columns yet");

await page.setInputFiles('input[type="file"]', {
  name: "september-service-board.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8"),
});
await page.waitForTimeout(6000);
await shot("2-what-the-store-makes-of-the-file", "the plan: eight columns this table has not got");

// "Columns this table does not have → are added straight away."
const selects = await page.$$("select");
for (const s of selects) {
  const opts = await s.$$eval("option", (os) => os.map((o) => o.value));
  if (opts.includes("create")) { await s.selectOption("create"); break; }
}
await page.waitForTimeout(600);
await shot("3-add-the-columns-straight-away", "the person answers the wizard's own question");

const button = await page.getByRole("button", { name: /^Import 1,?000 rows?$|^Import \d+ rows?$/ }).first();
await button.click();
// The column step first, then the writing calls.
await page.waitForTimeout(3500);
await shot("4-adding-the-columns-is-its-own-step", "the column step, before a single row is written");
for (let i = 0; i < 40; i += 1) {
  await page.waitForTimeout(3000);
  const text = await page.textContent("body");
  if (/landed/.test(text ?? "") && !/Writing…/.test(text ?? "")) break;
  if (i === 6) await shot("5-writing", "the rows going in, batch by batch");
}
await page.waitForTimeout(2000);
await shot("6-the-import-is-done", "1,000 tickets landed, and the eight columns it added are named");

writeFileSync(resolve(OUT, "import2-what-the-screen-said.txt"),
  (await page.textContent("body") ?? "").replace(/\n{3,}/g, "\n\n"));
await browser.close();
console.log("done");

// FIX-10C — screenshots of the records-ui screens the verifier photographed,
// taken from the package's OWN harness (demo/, vite, aliased straight at src/),
// which is the sanctioned route when the app's node_modules still carries the
// last published version.
import { chromium } from "playwright";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
const ORIGIN = "http://127.0.0.1:3005";
const shots = [
  ["import", "fix10c-import-panel.png", 1600, 1000],
  ["dashboard", "fix10c-chart-shapes.png", 1600, 1000],
];
const b = await chromium.launch({ headless: true });
for (const [id, file, w, h] of shots) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${ORIGIN}/?demo=${id}`, { waitUntil: "networkidle", timeout: 90000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${file}` });
  const text = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  console.log(`--- ${id} ---`);
  console.log("  chars:", text.length, "| pageerrors:", errs.length ? errs[0].slice(0, 120) : "none");
  if (id === "import") {
    console.log("  has 'Choose a file' button:", await p.getByRole("button", { name: /Choose a file/ }).count());
    console.log("  has the hint sentence:", text.includes("whose FIRST ROW is the column names"));
    console.log("  has 'or drop it here':", text.includes("or drop it here"));
    console.log("  bare browser input visible:", await p.locator('input[type=file]:not(.sr-only)').count());
  }
  if (id === "dashboard") {
    console.log("  offers 'Stuck':", text.includes("Stuck"));
    console.log("  offers 'Not moving':", text.includes("Not moving"));
  }
  await ctx.close();
}
await b.close();

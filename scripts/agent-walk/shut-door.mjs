/**
 * THE SHUT DOOR — measured headless, on the real store, from two seats.
 *
 * A control is absent or honest (chair ruling, 2026-09-21). On 2026-09-21 a
 * VIEWER on Ironclad Mobile Mechanic's Service Calls table read the Forms
 * rail's true sentence — "Making one needs the admin level on it" — and then
 * pressed the fully live "Ask an agent" button beside it: the ask was accepted,
 * an agent worked for five minutes, created nothing and never said why.
 *
 * This walk stands on that exact rail through the records-ui demo harness,
 * which aliases @ai-matrx/records-ui to src/, signs in against the ONE LIVE
 * STORE as the identity it is given, and asks `custom.my_levels` for the real
 * level. The harness BINDS the agent port (demo/main.tsx), so an absent button
 * means "you may not build here" and not "nobody wired an agent".
 *
 *   RECORDS_UI_DEMO_PORT=3045 RECORDS_UI_DEMO_ORG=<org> \
 *   RECORDS_UI_DEMO_USER=<uuid> npx vite --config demo/vite.config.ts
 *   PORT=3045 TABLE=<uuid> OUT=<path prefix> node scripts/agent-walk/shut-door.mjs
 *
 * Headless always. Never the in-app Browser pane — that is the owner's screen.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const PORT = process.env.PORT ?? "3045";
const TABLE = process.env.TABLE ?? "ad769621-04ba-499b-8414-dc48d589770e";
const OUT = process.env.OUT ?? "/private/tmp/claude-501/tails3-viewer";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
const url = `http://127.0.0.1:${PORT}/?demo=table-page&table=${TABLE}`;
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

// The table page has to have ANSWERED before a rail means anything.
await page.waitForFunction(() => /shown \/ \d+ loaded/.test(document.body.innerText), { timeout: 90_000 });

// WHICH SEAT. Empty = the store's own answer for whoever the harness signed in
// as. "admin"/"viewer" use the harness's own rights port to stand at a named
// rung — which is what proves the COMPONENT, rather than one account's grants.
const SEAT = process.env.SEAT ?? "";
if (SEAT) {
  await page.selectOption("select", SEAT);
  await page.waitForTimeout(1500);
}

// Stand on the Forms rail.
await page.getByRole("button", { name: "Forms", exact: true }).first().click();
await page.waitForFunction(
  () => /A form asks for this table's own fields/.test(document.body.innerText),
  { timeout: 60_000 },
);
// The rights answer arrives after the rail mounts; give the store its turn so a
// still-in-flight "nothing is offered yet" is never mistaken for the verdict.
await page.waitForTimeout(6000);

const text = await page.evaluate(() => document.body.innerText);
const buttons = await page.evaluate(() =>
  Array.from(document.querySelectorAll("button")).map((b) => b.textContent.trim()).filter(Boolean),
);
const askButtons = buttons.filter((b) => /ask an agent/i.test(b));
const buildButtons = buttons.filter((b) => /^build the form$/i.test(b));
const asked = await page.evaluate(() => window.__recordsUiAsked ?? null);

// The whole rail, not the whole page.
const rail = text.slice(Math.max(0, text.indexOf("A form asks for this table's own fields") - 40));

await page.screenshot({ path: `${OUT}.png`, fullPage: true });
writeFileSync(
  `${OUT}.json`,
  JSON.stringify({ url, table: TABLE, askButtons, buildButtons, portBound: asked !== null, rail }, null, 2),
);
console.log("URL:", url);
console.log('"Ask an agent" buttons on screen:', JSON.stringify(askButtons));
console.log('"Build the form" buttons on screen:', JSON.stringify(buildButtons));
console.log("----- THE RAIL, VERBATIM -----");
console.log(rail.split("\n").filter((l) => l.trim()).slice(0, 12).join("\n"));
await browser.close();

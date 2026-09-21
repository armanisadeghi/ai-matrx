// Headless proof for lane TAILS item 2: /data/<record-store table id> no longer
// answers "We couldn't open this dataset" — it lands the person on /data-v2/<id>.
//
// Ironline Fitness's `members` table, 60df8b1e-…, owned by admin@admin.com.
import { chromium } from "playwright";

const ORIGIN = process.env.ORIGIN;
const LOGIN = process.env.LOGIN_URL;
const TABLE = "60df8b1e-d63a-482d-9600-22469c93263c";
const ORG = "11d47e36-4b1e-46b8-bdf6-8ef928b730fb";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const say = (...a) => console.log("[proof]", ...a);

page.on("console", (m) => {
  if (m.type() === "error") console.log("  [browser-error]", m.text().slice(0, 200));
});

say("signing in:", LOGIN.replace(/nonce=[^&]+/, "nonce=***"));
await page.goto(LOGIN, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(3000);
say("after login, url =", page.url());

// Put the session in Ironline Fitness. The app has no default organization to
// lean on (2026-09-19 ruling), so the choice is MADE — through the same cookie
// the org picker writes: `matrx-active-org = <user id>:<organization id>`.
const USER = "87a6e699-3622-4869-8843-d0867456c0dd";
await ctx.addCookies([
  { name: "matrx-active-org", value: `${USER}:${ORG}`, domain: "s8d677a69.localhost", path: "/" },
]);
await page.goto(`${ORIGIN}/data`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(4000);

const target = `${ORIGIN}/data/${TABLE}`;
say("opening", target);
await page.goto(target, { waitUntil: "domcontentloaded", timeout: 120000 });

for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1000);
  if (page.url().includes("/data-v2/")) break;
}
const finalUrl = page.url();
const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 1500);

say("FINAL URL:", finalUrl);
say("LIED ABOUT DELETION?", /couldn't open this dataset/i.test(body) ? "YES — still lying" : "no");
say("BODY (first 600 chars):\n" + body.slice(0, 600));

await page.screenshot({ path: process.env.SHOT || "/tmp/tails-data-id.png", fullPage: false });
await browser.close();

if (finalUrl.includes(`/data-v2/${TABLE}`)) {
  say("PASS — the older viewer sent the person to the record store viewer.");
  process.exit(0);
}
say("FAIL — did not land on /data-v2/<id>.");
process.exit(1);

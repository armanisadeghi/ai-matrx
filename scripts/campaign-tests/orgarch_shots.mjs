/**
 * LANE ORG-ARCHIVE — the SCREENS, driven headless on a real signed-in session.
 *
 * The SQL suites prove the doors. This proves the two screens the owner will
 * actually press: the Danger Zone that archives an organization, and the banner
 * on an archived organization that restores it. Every shot is of the real app
 * against the live database, signed in as admin@admin.com through dev-login.
 *
 *   node scripts/campaign-tests/orgarch_shots.mjs --org <uuid> --port <port> --out <dir>
 *
 * It is HEADLESS and it takes its own host (`orgarchive.localhost`) so it never
 * touches another agent's session or opens a window on the owner's screen.
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const arg = (name, fallback) =>
  argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;

const ORG = arg("--org");
const PORT = arg("--port", "3002");
const HOST = arg("--host", "orgarchive.localhost");
const OUT = arg("--out", resolve(ROOT, "tmp/orgarch-shots"));
const ORG_NAME = arg("--name", "Cascade Grounds Management");
if (!ORG) throw new Error("--org <uuid> is required");
mkdirSync(OUT, { recursive: true });

const ORIGIN = `http://${HOST}:${PORT}`;
/**
 * A DOM-dispatched click. The organization settings page in DEV floods the
 * console with "Maximum update depth exceeded" from an unrelated connections
 * aggregator, which starves the main thread long enough that Playwright's
 * actionability click never settles even with `force`. The button itself is
 * visible, enabled and stable — the log says so — so this dispatches the click
 * the way the browser would and says out loud that it did.
 */
const clickByText = async (page, text, which = "first") => {
  const clicked = await page.evaluate(({ needle, which }) => {
    const all = [...document.querySelectorAll("button")].filter(
      (b) => (b.textContent || "").trim() === needle && !b.disabled,
    );
    // THE BANNER'S BUTTON AND THE DIALOG'S SUBMIT READ THE SAME WORDS, and the
    // banner's comes first in the DOM — taking "first" for the submit simply
    // re-opened the dialog and the restore never ran. Say which one you mean.
    const btn = which === "last" ? all[all.length - 1] : all[0];
    if (!btn) return false;
    btn.click();
    return true;
  }, { needle: text, which });
  if (!clicked) throw new Error(`no enabled button reading "${text}"`);
  console.log(`[click:${which}] ${text}`);
};

/** Same reason as clickByText: the page's dev-only render storm makes
 *  Playwright's "visible, enabled and editable" wait never settle. This sets
 *  the value the way a person's keystroke would and lets React see it. */
const typeInto = async (page, placeholder, value) => {
  const ok = await page.evaluate(
    ({ placeholder, value }) => {
      const el = document.querySelector(`input[placeholder="${placeholder}"]`);
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    },
    { placeholder, value },
  );
  if (!ok) throw new Error(`no input placeholdered "${placeholder}"`);
  console.log(`[type] ${placeholder} := ${value}`);
};

const shot = async (page, name) => {
  const path = resolve(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`[shot] ${path}`);
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[page:error] ${m.text().slice(0, 200)}`);
  });

  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  await page.goto(
    `${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent("/organizations")}`,
    { waitUntil: "domcontentloaded", timeout: 180000 },
  );
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  if (!who?.email) throw new Error("dev-login did not produce an identity");
  console.log(`[orgarch] signed in as ${who.email}`);
  if (who.email !== "admin@admin.com") {
    throw new Error(`this must run as admin@admin.com, not ${who.email}`);
  }

  // 1 — THE LIST HIDES IT. The archived organization must not be among the cards.
  await page.goto(`${ORIGIN}/organizations`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(6000);
  const bodyHidden = await page.evaluate(() => document.body.innerText);
  const disclosure = await page
    .locator("text=/Archived \\(\\d+\\)/")
    .first()
    .textContent()
    .catch(() => null);
  console.log(`[1] archived organization named in the default list: ${bodyHidden.includes(ORG_NAME)}`);
  console.log(`[1] archive disclosure on the page: ${JSON.stringify(disclosure)}`);
  await shot(page, "1-organizations-list-hides-archived");

  // 2 — ONE CLICK REVEALS IT, with its Archived badge.
  if (disclosure) {
    await page.locator("text=/Archived \\(\\d+\\)/").first().click();
    await page.waitForTimeout(2500);
    const revealed = await page.evaluate(() => document.body.innerText);
    console.log(`[2] revealed after one click: ${revealed.includes(ORG_NAME)}`);
    await shot(page, "2-organizations-list-reveals-archived");
  }

  // 3 — THE ARCHIVED ORGANIZATION'S OWN PAGE SAYS SO, with Restore.
  await page.goto(`${ORIGIN}/organizations/${ORG}/settings`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  await page.waitForTimeout(8000);
  const banner = await page
    .locator('[data-testid="organization-archived-banner"]')
    .first()
    .innerText()
    .catch(() => null);
  console.log(`[3] banner: ${JSON.stringify(banner)}`);
  await shot(page, "3-archived-organization-banner");

  // 4 — RESTORE, with the name typed back.
  await clickByText(page, "Restore organization");
  await page.waitForTimeout(1500);
  await shot(page, "4-restore-dialog");
  await typeInto(page, ORG_NAME, ORG_NAME);
  await page.waitForTimeout(500);
  await clickByText(page, "Restore organization", "last");
  await page.waitForTimeout(8000);
  const afterRestore = await page.evaluate(() => document.body.innerText);
  console.log(`[4] banner still on the page after restore: ${afterRestore.includes("This organization is archived")}`);
  await shot(page, "5-after-restore");

  // 5 — ARCHIVE IT AGAIN FROM THE DANGER ZONE, which is the owner's own path.
  await page.goto(`${ORIGIN}/organizations/${ORG}/settings#danger`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  await page.waitForTimeout(8000);
  await clickByText(page, "Archive");
  await page.waitForTimeout(4000);
  await shot(page, "6-archive-dialog");
  const dialogText = await page.evaluate(() => document.body.innerText);
  for (const phrase of [
    "Nothing is deleted",
    "Members cannot open it",
    "stays exactly where",
    "restore it at any time",
  ]) {
    console.log(`[6] dialog says "${phrase}": ${dialogText.includes(phrase)}`);
  }
  await typeInto(page, ORG_NAME, ORG_NAME);
  await page.waitForTimeout(500);
  await clickByText(page, "Archive organization", "last");
  await page.waitForTimeout(8000);
  await shot(page, "7-after-archive");
  console.log(`[6] landed on: ${page.url()}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

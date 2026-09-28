import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(AI_MEMBER_USERNAME|AI_MEMBER_PASSWORD)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const BASE = "https://www.aimatrx.com";
const JOIN_CODE = process.argv[2];
if (!JOIN_CODE) { console.error("usage: node tmp-pp-phase2.mjs <JOIN_CODE>"); process.exit(1); }

const SAMPLE_TEXT = `Cell Structure and Function — Agent Test Notes

The cell is the basic unit of life. Prokaryotic cells (bacteria, archaea) lack a
nucleus and membrane-bound organelles; their DNA sits in a nucleoid region.
Eukaryotic cells (plants, animals, fungi, protists) have a true nucleus enclosed
by a nuclear envelope, plus organelles such as mitochondria (produce ATP through
cellular respiration), the endoplasmic reticulum (rough ER makes proteins, smooth
ER makes lipids and detoxifies), the Golgi apparatus (modifies and packages
proteins for secretion), and lysosomes (digest waste with hydrolytic enzymes).
Plant cells additionally have a rigid cell wall made of cellulose, chloroplasts
for photosynthesis, and a large central vacuole for storage and turgor pressure.
The cell membrane is a selectively permeable phospholipid bilayer that controls
what enters and leaves the cell via diffusion, osmosis, and active transport.`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e.message).slice(0, 200)));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE ERROR:", m.text().slice(0, 200)));

async function shot(name) {
  await page.screenshot({ path: `/tmp/pp-edu/scripts/${name}.png`, fullPage: true }).catch(() => {});
}

try {
  await page.goto(`${BASE}/login`, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.fill('input[type="email"]', process.env.AI_MEMBER_USERNAME);
  await page.fill('input[type="password"]', process.env.AI_MEMBER_PASSWORD);
  await page.evaluate(() => document.querySelector("form")?.requestSubmit());
  await page.waitForFunction(() => !document.querySelector('input[type="email"]'), null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log("STEP login done, url:", page.url());

  // ── 1. Build a kit from pasted text (flashcards only, quick depth) ──────
  await page.goto(`${BASE}/education/start`, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.getByRole("tab", { name: "Paste" }).click({ timeout: 10000 }).catch(async () => {
    await page.getByText("Paste", { exact: true }).first().click({ timeout: 10000 });
  });
  await page.waitForTimeout(1000);
  await page.locator('textarea[placeholder*="Paste your notes"]').fill(SAMPLE_TEXT);
  await page.waitForTimeout(500);

  const quickDepth = page.getByText("Quick", { exact: false }).first();
  if (await quickDepth.count()) await quickDepth.click().catch(() => {});

  // Deselect every tile that starts CHECKED except "Flashcard deck" (keep
  // generation fast/cheap) — only click tiles that currently show the check
  // icon, so an already-off tile is never turned on by mistake.
  const toolLabels = ["Study summary", "Mind map", "Audio overview", "Quiz", "Study notes", "Memory aids", "Practice test"];
  for (const label of toolLabels) {
    const tile = page.locator("button, [role=button]").filter({ hasText: label }).first();
    if (await tile.count()) {
      const hasCheck = await tile.locator("svg.lucide-circle-check-big, svg.lucide-check-circle, [class*='check']").count();
      if (hasCheck > 0) {
        await tile.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(200);
      }
    }
  }
  await page.waitForTimeout(500);
  await shot("01-start-form-filled");

  const buildBtn = page.getByRole("button", { name: /Build my study kit/i }).first();
  await buildBtn.click({ timeout: 10000 });
  console.log("STEP build clicked, waiting for generation...");
  await page.waitForTimeout(3000);
  // Fallback: if a mid-run "Which organization is this for?" dialog still
  // appears, answer it so the run is not stuck behind a blocked modal.
  const orgDialog = page.getByText("Which organization is this for?").first();
  if (await orgDialog.count()) {
    console.log("STEP mid-run org dialog appeared, answering it");
    const pick = page.locator("[role=dialog] button").filter({ hasText: "Ashford Labs" }).first();
    if (await pick.count()) await pick.click();
    const cont = page.getByRole("button", { name: "Continue" }).first();
    if (await cont.count()) await cont.click();
    await page.waitForTimeout(2000);
  }
  await shot("02-building");

  // Wait for "Open your kit" or "done" phase, generous timeout for LLM generation.
  const openKitLink = page.getByRole("link", { name: /Open your kit/i }).first();
  await openKitLink.waitFor({ timeout: 240000 });
  console.log("STEP kit generated");
  await shot("03-kit-done");
  await openKitLink.click();
  await page.waitForTimeout(4000);
  console.log("STEP opened kit, url:", page.url());
  await shot("04-kit-page");

  // ── 2. Open the generated flashcard deck and study it ───────────────────
  const studyLink = page.getByRole("link", { name: /^Study$/i }).first()
    .or(page.getByRole("button", { name: /^Study$/i }).first());
  if (await studyLink.count()) {
    await studyLink.click({ timeout: 10000 });
  } else {
    const deckLink = page.locator("a", { hasText: "Cell Structure" }).first();
    if (await deckLink.count()) await deckLink.click({ timeout: 10000 });
  }
  await page.waitForTimeout(4000);
  console.log("STEP deck/study url:", page.url());
  await shot("05-deck-or-study");

  // If we're on the deck detail (not the study session), click its own Study button.
  if (!/\/study\b|\/session\b|\/play\b/.test(page.url())) {
    const studyBtn2 = page.getByRole("button", { name: /^Study$/i }).first()
      .or(page.getByRole("link", { name: /^Study$/i }).first());
    if (await studyBtn2.count()) {
      await studyBtn2.click({ timeout: 10000 });
      await page.waitForTimeout(3000);
      console.log("STEP entered study session, url:", page.url());
      await shot("06-study-session");
    }
  }

  // Flip/answer a couple of cards if a study UI loaded.
  for (let i = 0; i < 2; i++) {
    const flip = page.getByRole("button", { name: /flip|show answer|reveal/i }).first();
    if (await flip.count()) {
      await flip.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
    const correct = page.getByRole("button", { name: /got it|correct|know it|easy/i }).first();
    if (await correct.count()) {
      await correct.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
  }
  await shot("07-after-study-answers");

  // ── 3. Check progress reflects it ───────────────────────────────────────
  await page.goto(`${BASE}/education/progress`, { timeout: 60000 });
  await page.waitForTimeout(4000);
  await shot("08-progress");
  console.log("STEP progress url:", page.url());

  // ── 4. Join a class by code ──────────────────────────────────────────────
  await page.goto(`${BASE}/education/classes/join`, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.locator('input[placeholder*="M4KSCN"]').fill(JOIN_CODE);
  await page.getByRole("button", { name: "Find" }).click({ timeout: 10000 });
  await page.waitForTimeout(3000);
  await shot("09-join-preview");
  const joinBtn = page.getByRole("button", { name: /Join class/i }).first();
  if (await joinBtn.count()) {
    await joinBtn.click({ timeout: 10000 });
    await page.waitForTimeout(4000);
    console.log("STEP joined class, url:", page.url());
  } else {
    console.log("STEP join button not found — code lookup may have failed");
  }
  await shot("10-after-join");

  await page.goto(`${BASE}/education/classes`, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await shot("11-my-classes");
  console.log("DONE");
} catch (e) {
  console.error("ERROR:", e.message);
  await shot("ERROR");
} finally {
  await browser.close();
}

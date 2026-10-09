/**
 * THE HTML CARD'S ACTIONS ARE REACHABLE (`pnpm test:html-card-reachable`).
 *
 * A live page in a chat answer is a wide figure: on a desktop it breaks out of
 * the reading column. On 2026-10-08 the chat package's two `overflow-x-clip`
 * message wrappers cut the 1100px card down to the 736px column, so the left
 * edge and every header action (Show code, Copy HTML, Download, Print page,
 * Open in canvas) were painted over by nothing and unclickable; on a 375px
 * phone the header's button row was 435px inside a 341px card. This walks the
 * real chat page on the shared preview and asks the browser itself
 * (`elementFromPoint` at each control's centre) whether a press lands on it.
 */
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ROOT = path.resolve(__dirname, "../../../..");
const STATE = path.join(ROOT, ".cache/playwright/html-card-reachable/state.json");
const CONVERSATION = process.env.HTML_CARD_CONVERSATION ?? "8f102a33-3821-4836-b79c-45936eabf64e";

test.use({ storageState: STATE });

async function openCard(page: Page) {
  const url = `${process.env.HTML_CARD_ORIGIN}/chat/${CONVERSATION}`;
  const header = page.locator("[data-html-figure] [data-html-preview-header]").first();
  const resume = page.getByRole("button", { name: "Resume this preview" });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
  // The shared preview parks idle tabs; resume it and go straight back.
  await header.or(resume).first().waitFor({ state: "visible", timeout: 150_000 });
  if (await resume.isVisible()) {
    await resume.click();
    await page.waitForLoadState("domcontentloaded");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
  }
  await header.waitFor({ state: "visible", timeout: 150_000 });
  await header.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  return header;
}

/** Every control in the header, each answered by a hit test at its centre. */
async function hitTests(page: Page) {
  return page.evaluate(async () => {
    const header = document.querySelector("[data-html-figure] [data-html-preview-header]") as HTMLElement;
    // Measure where a person would press: the header on screen (the transcript may
    // have scrolled itself to the newest turn since the card mounted).
    header.scrollIntoView({ block: "center" });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const figure = header.closest("[data-html-figure]") as HTMLElement;
    const controls = [...header.querySelectorAll<HTMLElement>("button")].filter((b) => {
      const r = b.getBoundingClientRect();
      return getComputedStyle(b).display !== "none" && r.width > 0 && r.height > 0;
    });
    const fig = figure.getBoundingClientRect();
    return {
      figure: { left: Math.round(fig.left), width: Math.round(fig.width) },
      controls: controls.map((b) => {
        const r = b.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
          name: b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "?",
          x: Math.round(x),
          y: Math.round(y),
          hit: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 60)}` : null,
          reachable: !!hit && (hit === b || b.contains(hit)),
        };
      }),
    };
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
]) {
  test(`every header action of the HTML card is hit-testable at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openCard(page);
    const result = await hitTests(page);
    console.log(JSON.stringify(result));
    expect(result.controls.length, "the header shows controls").toBeGreaterThanOrEqual(4);
    // The one-click screenshot attach stays visible at every width (Arman: one click).
    expect(result.controls.map((c) => c.name)).toContain("Attach screenshot to chat");
    // Every action is either on the row or in the "More" menu — each one a press can land on.
    expect(result.controls.filter((c) => !c.reachable)).toEqual([]);
    for (const c of result.controls) {
      expect(c.x, `${c.name} inside the card`).toBeGreaterThan(result.figure.left);
      expect(c.x, `${c.name} inside the card`).toBeLessThan(result.figure.left + result.figure.width);
    }
    if (viewport.width >= 1200) expect(result.figure.width, "the figure breaks out of the column").toBeGreaterThan(800);
  });
}

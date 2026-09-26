import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    newTabClicks?: number;
    quickClicks?: number;
    rowClicks?: number;
  }
}

const GLOBALS_CSS = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
const ENTITY_REF_SOURCE = readFileSync(
  path.join(process.cwd(), "components/official/entity-ref/EntityRef.tsx"),
  "utf8",
);

function fixture() {
  return `
    <style>${GLOBALS_CSS}</style>
    <div id="row" style="padding: 20px" onclick="window.rowClicks = (window.rowClicks || 0) + 1">
      <span class="entity-ref inline-flex items-center gap-1">
        <a href="#record">Acme Health</a>
        <span class="entity-ref-controls inline-flex" data-entity-ref-controls data-reveal-on-hover="true">
          <button id="quick" onclick="event.stopPropagation(); window.quickClicks = (window.quickClicks || 0) + 1">Quick look</button>
          <a id="new-tab" href="#new" onclick="event.stopPropagation(); window.newTabClicks = (window.newTabClicks || 0) + 1">New tab</a>
        </span>
      </span>
    </div>`;
}

test.beforeEach(async ({ page }) => {
  expect(ENTITY_REF_SOURCE).toContain("entity-ref-controls");
  expect(ENTITY_REF_SOURCE).toContain("data-reveal-on-hover");
  await page.setContent(fixture());
  await page.mouse.move(0, 0);
});

test("fine pointer exposes every door before it can receive a hit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop-only hover contract");

  const controls = page.locator("[data-entity-ref-controls]");
  await expect(controls).toHaveCSS("opacity", "0");
  await expect(controls).toHaveCSS("pointer-events", "none");

  await page.locator(".entity-ref").hover();
  await expect(controls).toHaveCSS("opacity", "1");
  await expect(controls).toHaveCSS("pointer-events", "auto");

  const hit = await page.locator("#quick").evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.id;
  });
  expect(hit).toBe("quick");

  await page.locator("#quick").click();
  expect(await page.evaluate(() => window.quickClicks)).toBe(1);
  expect(await page.evaluate(() => window.rowClicks ?? 0)).toBe(0);
  await expect(page.locator("#new-tab")).toHaveCSS("pointer-events", "auto");
});

test("keyboard focus reveals the controls before activation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop-only focus contract");

  const controls = page.locator("[data-entity-ref-controls]");
  await page.locator("#quick").focus();
  await expect(controls).toHaveCSS("opacity", "1");
  await expect(controls).toHaveCSS("pointer-events", "auto");
});

test("coarse pointers show every door without a hidden target", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-390", "phone-only discovery contract");

  const controls = page.locator("[data-entity-ref-controls]");
  await expect(controls).toHaveCSS("opacity", "1");
  await expect(controls).toHaveCSS("pointer-events", "auto");
  await page.locator("#new-tab").click();
  expect(await page.evaluate(() => window.newTabClicks)).toBe(1);
  expect(await page.evaluate(() => window.rowClicks ?? 0)).toBe(0);
});

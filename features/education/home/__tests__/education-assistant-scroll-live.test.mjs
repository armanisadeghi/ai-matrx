import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

const previewUrl = process.env.MATRX_PREVIEW_URL ?? "http://localhost:3001";

test("natural Education pages keep their final link above the assistant", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${previewUrl}/education`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const shell = page.locator(".shell-main");
    await shell.hover();
    await page.mouse.wheel(0, 10000);
    await page.waitForTimeout(700);
    await page.locator(".ambient-assistant-dock").waitFor({ state: "visible" });
    await shell.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });

    const metrics = await page.evaluate(() => {
      const boundary = document.querySelector(".education-scroll-boundary");
      const dock = document.querySelector(".ambient-assistant-dock");
      const last = [...document.querySelectorAll("a")]
        .filter((link) => link.getBoundingClientRect().height > 0)
        .at(-1);
      if (!boundary || !dock || !last) throw new Error("geometry target missing");
      const dockRect = dock.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      return {
        boundaryPaddingBottom: getComputedStyle(boundary).paddingBottom,
        lastBottom: lastRect.bottom,
        dockTop: dockRect.top,
        lastFullyAboveDock: lastRect.bottom < dockRect.top,
      };
    });

    assert.equal(metrics.boundaryPaddingBottom, "0px", JSON.stringify(metrics));
    assert.equal(metrics.lastFullyAboveDock, true, JSON.stringify(metrics));

    await page.getByRole("link", { name: "jump to exam prep" }).click();
    await page.waitForURL(/\/education\/exam-prep$/);
  } finally {
    await browser.close();
  }
});

test("nested Study Guide panes own runway while mobile keeps the launcher absent", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await desktop.goto(`${previewUrl}/education/study-guides`, {
      waitUntil: "domcontentloaded",
    });
    await desktop.waitForTimeout(900);
    const desktopMetrics = await desktop.evaluate(() => ({
      boundaryPaddingBottom: getComputedStyle(
        document.querySelector(".education-scroll-boundary"),
      ).paddingBottom,
      owners: [...document.querySelectorAll(".scroll-page-end-space")]
        .filter((node) => getComputedStyle(node).overflowY === "auto")
        .map((node) => parseFloat(getComputedStyle(node).paddingBottom)),
    }));
    assert.equal(desktopMetrics.boundaryPaddingBottom, "0px");
    assert.ok(desktopMetrics.owners.length >= 3, JSON.stringify(desktopMetrics));
    assert.ok(desktopMetrics.owners.every((padding) => padding > 0));

    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await mobile.goto(`${previewUrl}/education/study-guides`, {
      waitUntil: "domcontentloaded",
    });
    await mobile.waitForTimeout(500);
    assert.equal(await mobile.locator(".ambient-assistant-dock").count(), 0);
  } finally {
    await browser.close();
  }
});

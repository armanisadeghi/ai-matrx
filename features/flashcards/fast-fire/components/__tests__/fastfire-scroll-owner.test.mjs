import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

const previewUrl = process.env.MATRX_PREVIEW_URL ?? "http://localhost:3001";

function hasUsableRunway(metrics) {
  return (
    metrics.ownerCount === 1 &&
    metrics.boundaryPaddingBottom === 0 &&
    metrics.ownerBottom === metrics.viewportHeight &&
    metrics.ownerPaddingBottom > 0 &&
    metrics.atMaximumScroll &&
    metrics.lastFullyVisible &&
    metrics.lastBottom < metrics.dockTop
  );
}

test("live FastFire scrolls its final action clear of the ambient assistant", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${previewUrl}/education/fastfire`, {
      waitUntil: "domcontentloaded",
    });
    const ownerSelector =
      ".education-scroll-boundary .scroll-page-end-space.h-full.overflow-y-auto";
    await page.locator(ownerSelector).waitFor({ state: "visible" });
    await page.getByText("View past results", { exact: true }).waitFor();
    await page.locator(ownerSelector).evaluate((owner) => {
      owner.scrollTop = owner.scrollHeight;
    });
    await page.locator(".ambient-assistant-dock").waitFor({ state: "visible" });
    await page.locator(ownerSelector).evaluate((owner) => {
      owner.scrollTop = owner.scrollHeight;
    });
    await page.waitForTimeout(100);

    const metrics = await page.evaluate((selector) => {
      const owners = document.querySelectorAll(selector);
      const owner = owners[0];
      const boundary = document.querySelector(".education-scroll-boundary");
      const last = [...document.querySelectorAll("a")].find(
        (link) => link.textContent?.trim() === "View past results",
      );
      const dock = document.querySelector(".ambient-assistant-dock");
      if (!owner || !boundary || !last || !dock) {
        throw new Error("FastFire geometry target is missing");
      }
      const ownerRect = owner.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      return {
        ownerCount: owners.length,
        boundaryPaddingBottom: parseFloat(
          getComputedStyle(boundary).paddingBottom,
        ),
        ownerBottom: ownerRect.bottom,
        ownerPaddingBottom: parseFloat(getComputedStyle(owner).paddingBottom),
        atMaximumScroll:
          Math.abs(owner.scrollHeight - owner.clientHeight - owner.scrollTop) < 1,
        lastFullyVisible: lastRect.top >= 44 && lastRect.bottom <= innerHeight,
        lastBottom: lastRect.bottom,
        dockTop: dockRect.top,
        viewportHeight: innerHeight,
      };
    }, ownerSelector);

    assert.equal(hasUsableRunway(metrics), true, JSON.stringify(metrics));
    assert.equal(
      await page.evaluate(
        () =>
          performance
            .getEntriesByType("resource")
            .filter((entry) => entry.name.includes("/_next/static/")).length > 0,
      ),
      true,
      "FastFire must be served by the real Next preview",
    );
  } finally {
    await browser.close();
  }
});

test("the acceptance predicate rejects the original clipped-ancestor geometry", () => {
  assert.equal(
    hasUsableRunway({
      ownerCount: 1,
      boundaryPaddingBottom: 198,
      ownerBottom: 702,
      ownerPaddingBottom: 0,
      atMaximumScroll: true,
      lastFullyVisible: false,
      lastBottom: 880,
      dockTop: 844,
      viewportHeight: 900,
    }),
    false,
  );
});

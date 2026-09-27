/**
 * LAYOUT GATE — the shell header's right set may never sit on top of the
 * route header's own controls.
 *
 * THE LIVE DEFECT (2026-09-27, `/agents/<id>/build` at 1024px, localhost):
 * with no organization chosen, the "Choose organization" chip (158px) squeezed
 * the route header's center to 646px while the builder's header needed 769px
 * once the agent was dirty. Playwright's own hit test on the builder's Save:
 * "<button … aria-label="Choose an organization"> … intercepts pointer events".
 * A person on a laptop-width window could not save their agent.
 *
 * The mechanism: `.shell-header-right` is `flex-shrink: 0` and
 * `.shell-header-center` is `flex: 1; min-width: 0`, so the route's content
 * overflows its box and paints under the right set. The fix lives in the shell:
 * `installHeaderCrowdingGuard` marks the header `data-header-crowded` whenever
 * the center overflows, and `styles/shell.css` folds every
 * `data-header-compact-label` in the right set to its icon.
 *
 * WHY A REAL BROWSER: jsdom computes no layout, and the defect IS layout. This
 * gate loads the repo's own `styles/shell.css` and ships the guard's exact
 * function into Chromium, so the numbers are the engine's.
 *
 * Proven failing before passing: the first case mounts the fixture WITHOUT the
 * guard and asserts the defect reproduces (the chip intercepts Save); delete the
 * `.shell-header[data-header-crowded] [data-header-compact-label]` rule from
 * `styles/shell.css` and the second case goes RED with Save covered.
 *
 * Run: pnpm test:shell-layout
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { installHeaderCrowdingGuard } from "../components/header/header-crowding";

const SHELL_CSS = readFileSync(
  path.join(process.cwd(), "styles", "shell.css"),
  "utf8",
);

const TAILWIND_SUBSET = `
  * { box-sizing: border-box; margin: 0; }
  body { font: 12px/1.2 sans-serif; }
  .flex { display: flex; }
  .inline-flex { display: inline-flex; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .w-full { width: 100%; }
  .shrink-0 { flex-shrink: 0; }
  .gap { gap: 6px; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { height: 32px; min-width: 32px; padding: 0 8px; border: 0; }
  .slot { width: 44px; padding: 0; }
`;

/**
 * The header as the app renders it: hamburger, the route header injected into
 * the center (a title, a mode strip, and an action group that ends in Save and
 * Menu — `shrink-0`, like AgentHeader's), then the right set: the org chip with
 * its compactable words, then Search / Agents / Canvas / Inbox.
 */
const PAGE = (routeWidth: number) => `
<div class="shell-root">
  <header class="shell-header">
    <button class="slot" data-testid="hamburger">=</button>
    <div class="shell-header-center" id="shell-header-center">
      <div class="shell-header-inject flex">
        <div class="flex items-center justify-between w-full" data-testid="route-row">
          <div data-testid="route-left" style="width:${routeWidth - 150}px; flex-shrink:0">Quick Test Agent · modes</div>
          <div class="flex items-center gap shrink-0" data-testid="route-actions">
            <button data-testid="save" aria-label="Save changes">Save</button>
            <button class="slot" data-testid="menu" aria-label="Menu">M</button>
          </div>
        </div>
      </div>
    </div>
    <div class="shell-header-right" data-header-right-set>
      <div class="shell-header-right-inject" id="shell-header-right"></div>
      <button class="inline-flex items-center gap" data-testid="chip" aria-label="Choose an organization">
        <span aria-hidden="true">#</span>
        <span data-header-compact-label class="truncate" style="max-width:10rem">Choose organization</span>
      </button>
      <div class="shell-header-secondary">
        <button class="slot">S</button><button class="slot">A</button><button class="slot">C</button><button class="slot">I</button>
      </div>
    </div>
  </header>
</div>
`;

async function mount(page: Page, width: number, routeWidth: number, guard: boolean) {
  await page.setViewportSize({ width, height: 600 });
  await page.setContent(PAGE(routeWidth));
  await page.addStyleTag({ content: TAILWIND_SUBSET });
  await page.addStyleTag({ content: SHELL_CSS });
  if (guard) {
    await page.evaluate(
      `(${installHeaderCrowdingGuard.toString()})(document.querySelector('.shell-header'))`,
    );
  }
  // One frame for any scheduled re-evaluation.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}

/** Who receives a click at the centre, left edge and right edge of a control. */
async function hitTest(page: Page, testId: string) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const xs = [r.left + 2, r.left + r.width / 2, r.right - 2];
    const receivers = xs.map((x) => {
      const hit = document.elementFromPoint(x, y);
      return hit && (el === hit || el.contains(hit)) ? id : (hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? hit?.tagName ?? "nothing");
    });
    return { receivers, width: r.width };
  }, testId);
}

// 1024px leaves this route row 646px with the chip's words showing; it needs 700.
const LAPTOP = 1024;
const ROUTE = 700;

test("the fixture reproduces the defect: without the guard the chip intercepts Save", async ({ page }) => {
  await mount(page, LAPTOP, ROUTE, false);
  const save = await hitTest(page, "save");
  const menu = await hitTest(page, "menu");
  expect([...save.receivers, ...menu.receivers]).toContain("chip");
});

test("at a laptop width the route's Save and Menu receive their clicks, and the chip stays reachable as its icon", async ({ page }) => {
  await mount(page, LAPTOP, ROUTE, true);
  expect((await hitTest(page, "save")).receivers).toEqual(["save", "save", "save"]);
  expect((await hitTest(page, "menu")).receivers).toEqual(["menu", "menu", "menu"]);
  const chip = await hitTest(page, "chip");
  expect(chip.receivers).toEqual(["chip", "chip", "chip"]);
  const state = await page.evaluate(() => ({
    crowded: document.querySelector(".shell-header")!.hasAttribute("data-header-crowded"),
    labelShown: (document.querySelector("[data-header-compact-label]") as HTMLElement).getBoundingClientRect().width > 0,
    chipName: document.querySelector('[data-testid="chip"]')!.getAttribute("aria-label"),
  }));
  expect(state).toEqual({ crowded: true, labelShown: false, chipName: "Choose an organization" });
});

test("with room to spare the chip keeps its words", async ({ page }) => {
  await mount(page, 1440, ROUTE, true);
  const crowded = await page.evaluate(() => document.querySelector(".shell-header")!.hasAttribute("data-header-crowded"));
  expect(crowded).toBe(false);
  expect((await hitTest(page, "save")).receivers).toEqual(["save", "save", "save"]);
});

test("widening the window gives the words back; a route header that grows takes them away again", async ({ page }) => {
  await mount(page, LAPTOP, ROUTE, true);
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.waitForFunction(() => !document.querySelector(".shell-header")!.hasAttribute("data-header-crowded"));
  // A dirty agent grows the action group (the "Unsaved" pill + diff button):
  // grow the route 20px past what the center holds with the chip's words.
  await page.evaluate(() => {
    const center = document.querySelector(".shell-header-center") as HTMLElement;
    const left = document.querySelector('[data-testid="route-left"]') as HTMLElement;
    const actions = document.querySelector('[data-testid="route-actions"]') as HTMLElement;
    left.style.width = `${center.clientWidth - actions.getBoundingClientRect().width + 20}px`;
  });
  await page.waitForFunction(() => document.querySelector(".shell-header")!.hasAttribute("data-header-crowded"));
  expect((await hitTest(page, "save")).receivers).toEqual(["save", "save", "save"]);
});

test("when even the icons cannot make room, the header says so instead of overlapping silently", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "warning") warnings.push(m.text());
  });
  await mount(page, LAPTOP, 1400, true);
  const overdrawn = await page.evaluate(() => document.querySelector(".shell-header")!.getAttribute("data-header-overdrawn"));
  expect(Number(overdrawn)).toBeGreaterThan(0);
  expect(warnings.join("\n")).toContain("[shell-header] OVERDRAWN");
});

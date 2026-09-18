/**
 * LAYOUT GATE — the shell scroll owner may never carry a full-height route
 * body off the top of the screen.
 *
 * THE LIVE DEFECT (independent review, production www.aimatrx.com,
 * 2026-09-14, 1280x720, deployment dpl_B7kEnuT5b41q1EaX4G3jaTu9mxMK):
 * a full-height route's own chrome measured `y = -18.5` — above the top of the
 * viewport. Scripted clicks still worked, so nothing was "disabled": the
 * controls simply could not be seen or reached.
 *
 * The mechanism, reproduced by this file: `.shell-main` is the scroll owner.
 * While a fixed notice is on screen (`:root[data-admin-attention]`) it appends
 * a `::after` runway — 4.5rem compact, 14rem expanded — so a NATURAL-HEIGHT
 * page can scroll its last control clear of the notice. On a route body that
 * is already exactly the viewport and clips its own overflow (the chat room),
 * that runway is not clearance, it is SLACK: the whole surface — thread header,
 * composer, mic, send button — slides up under the floating shell header on one
 * wheel tick. `window.scrollTo(0, 0)` cannot undo it, because the window is not
 * the scroller.
 *
 * WHY A REAL BROWSER: jsdom computes no layout, and the defect IS layout. This
 * gate loads the REPO'S OWN `styles/shell.css` into Chromium and measures
 * rects, so the numbers are the engine's, not a test's model.
 *
 * Proven failing before passing: delete the
 * `:root[data-admin-attention] .shell-main:has(> .h-full.overflow-hidden)::after
 * { content: none; }` rule from `styles/shell.css` and every case below goes
 * RED with the route's own chrome at a negative `y`, exactly as production did.
 *
 * NOTE (2026-09-17): this gate used to model the chat route's canvas as an
 * in-flow "docked" column. That second presentation is gone — the canvas is the
 * one global overlay sheet on every route — so the fixture is now just the
 * route body. The shell rule it pins is unchanged and still load-bearing: the
 * defect is the composer sliding under the header, with or without a canvas.
 * The canvas' own geometry is measured in `canvas-one-presentation.spec.ts`.
 *
 * Run: pnpm test:shell-layout
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const SHELL_CSS = readFileSync(
  path.join(process.cwd(), "styles", "shell.css"),
  "utf8",
);

/**
 * The Tailwind utilities the shell rule keys on, spelled exactly as Tailwind
 * emits them. The route body says "I am the viewport and I clip"; that is the
 * whole contract between a route and the shell scroll owner.
 */
const TAILWIND_SUBSET = `
  .h-full { height: 100%; }
  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .flex-1 { flex: 1 1 0%; }
  .min-h-0 { min-height: 0; }
  .w-full { width: 100%; }
  .overflow-hidden { overflow: hidden; }
  .overflow-y-auto { overflow-y: auto; }
  * { box-sizing: border-box; margin: 0; }
`;

/**
 * The shell as the app renders it: a fixed grid root (header row + main row),
 * a transparent floating header, `.shell-main` pulled up under it, and the
 * chat route's body — `h-full overflow-hidden`, its thread scrolling inside
 * itself, with the composer pinned at the bottom of that body.
 */
const PAGE = `
<div class="shell-root" data-pathname="/chat">
  <header class="shell-header" data-testid="shell-header">
    <div style="margin-left:auto">Records · Canvas · avatar</div>
  </header>
  <main class="shell-main" data-testid="shell-main">
    <div class="flex h-full flex-col overflow-hidden" data-testid="route-body">
      <div class="flex flex-1 min-h-0 w-full">
        <div class="flex-1 min-h-0 overflow-y-auto" data-testid="thread">
          <div style="height: 3000px">a long conversation</div>
        </div>
      </div>
      <div data-testid="composer" style="height: 44px; flex-shrink: 0;">
        <button data-testid="send">Send</button>
      </div>
    </div>
  </main>
</div>
`;

async function mount(page: import("@playwright/test").Page, alarm: string) {
  await page.setContent(`<!doctype html><html><body></body></html>`);
  await page.addStyleTag({ content: SHELL_CSS });
  await page.addStyleTag({ content: TAILWIND_SUBSET });
  await page.setContent(PAGE);
  await page.addStyleTag({ content: SHELL_CSS });
  await page.addStyleTag({ content: TAILWIND_SUBSET });
  await page.evaluate((value) => {
    document.documentElement.setAttribute("data-admin-attention", value);
  }, alarm);
}

async function rects(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`missing ${selector}`);
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    const main = document.querySelector(
      '[data-testid="shell-main"]',
    ) as HTMLElement;
    return {
      header: box('[data-testid="shell-header"]'),
      routeBody: box('[data-testid="route-body"]'),
      composer: box('[data-testid="composer"]'),
      send: box('[data-testid="send"]'),
      mainScrollHeight: main.scrollHeight,
      mainClientHeight: main.clientHeight,
      mainScrollTop: main.scrollTop,
    };
  });
}

for (const alarm of ["compact", "expanded"]) {
  test(`a ${alarm} fixed notice gives a full-height route body no scroll slack`, async ({
    page,
  }) => {
    await mount(page, alarm);
    const before = await rects(page);
    expect(before.mainScrollHeight).toBe(before.mainClientHeight);
  });

  test(`a full-height route's chrome survives a scroll attempt (${alarm} notice)`, async ({
    page,
  }) => {
    await mount(page, alarm);

    // Everything a user's wheel, a focus jump or a scrollIntoView could do.
    await page.evaluate(() => {
      const main = document.querySelector(
        '[data-testid="shell-main"]',
      ) as HTMLElement;
      main.scrollTo(0, 99999);
      window.scrollTo(0, 99999);
    });

    const after = await rects(page);
    // The route body still starts at the top of the shell's row, and the
    // composer — the mic, the send button — is still on screen. Nothing slid
    // up under the floating shell header.
    expect(after.routeBody.top).toBeGreaterThanOrEqual(0);
    expect(after.composer.bottom).toBeLessThanOrEqual(
      after.routeBody.bottom + 0.5,
    );
    expect(after.send.top).toBeGreaterThanOrEqual(0);
    expect(after.mainScrollTop).toBe(0);
  });
}

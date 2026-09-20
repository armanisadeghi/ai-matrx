/**
 * LAYOUT GATE — THE CANVAS LOOKS THE SAME ON EVERY ROUTE, AND OPENING IT
 * NEVER MOVES THE SHELL HEADER'S BUTTONS.
 *
 * THE REJECTION this pins (owner, 2026-09-16, review row 34bfd1e8):
 *   *"The canvas system set up for the sandboxes completely breaks the core
 *   systems for how these canvases work. It adds an unnecessary layer, causes
 *   a shift in the top header buttons and creates a mess that clearly shows it
 *   is not properly built to be identical to the way the canvas actually
 *   works. FOLLOW established patterns."*
 *
 * What had been built: the chat route wrapped its own body in a `CanvasDock` —
 * a second presentation of the canvas, an in-flow resizable column that
 * additionally pushed itself down by `--shell-header-h` because the shell
 * header floats over the route body. Every other route (documents, artifacts,
 * the browser, a shared canvas) kept the canonical presentation: the global
 * `CanvasSideSheet` overlay, drawn at z-10000 from y = 0. So the SAME canvas,
 * the same pane, the same Preview/Source buttons, landed at a different place
 * and a different width depending on which route you opened it from.
 *
 * The two facts this gate measures, in a real engine:
 *   1. THE CANVAS PANE'S OWN HEADER IS AT THE SAME PLACE ON EVERY ROUTE — the
 *      chat route's rect equals the document route's rect, to the pixel.
 *   2. OPENING THE CANVAS MOVES NO SHELL HEADER BUTTON — every button in the
 *      shell header's cluster keeps its exact rect, canvas closed vs open, on
 *      both routes. What has to hold for that: `CanvasShellHeaderToggle` keeps
 *      its SLOT (and, since 2026-09-19, its button — disabled when empty) in
 *      every state instead of unmounting and pulling every button left of it
 *      44px sideways. Measured live on 2026-09-17 before that fix: Records
 *      887.59 closed against 931.59 open. (The avatar used to be the other
 *      half of this — hidden with `visibility` so its box survived; it now
 *      lives bottom-left, outside the header, so it is no longer a factor.)
 *
 * PROVEN FAILING BEFORE PASSING, two switches:
 *   `MATRX_LAYOUT_GATE_MUTATION=dock` builds the chat fixture the way the
 *   rejected dock built it (in-flow column, `padding-top: var(--shell-header-h)`).
 *   Case 1 goes RED — the canvas pane header sits 44px lower and hundreds of
 *   pixels narrower on chat than on a document route.
 *   `MATRX_LAYOUT_GATE_MUTATION=unmount-slot` drops the canvas toggle's slot
 *   while the canvas is open, as the component did until 2026-09-17. Case 2
 *   goes RED on both routes with every button left of it moved 44px.
 *
 * WHY A REAL BROWSER: jsdom computes no layout and this defect IS layout. The
 * repo's own `styles/shell.css` is loaded off disk; no server, no network.
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

/** The mutation switch that proves this gate can fail. */
const MUTATION = process.env.MATRX_LAYOUT_GATE_MUTATION ?? "";

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
 * The shell header's right-hand cluster, as the app builds it since
 * 2026-09-19: an auto-margined row of route actions ending in the three fixed
 * controls (Agents, the canvas slot, Inbox). The avatar is no longer in the
 * header — it lives bottom-left (ShellUserBlock), which the canvas never
 * covers, so nothing here hides on `data-canvas-open`.
 *
 * `slot` mirrors `CanvasShellHeaderToggle`: ONE box of the same width in
 * every state, always holding the button — `disabled` when the canvas has
 * nothing to reopen (`empty`), live otherwise.
 */
function header(canvas: CanvasState) {
  const dropSlot =
    (MUTATION === "unmount-slot" && canvas === "open") ||
    (MUTATION === "first-item" && canvas === "empty");
  const disabled = canvas === "empty" ? " disabled" : "";
  const slot = dropSlot
    ? ""
    : `<div data-canvas-header-slot="control" data-canvas-header-slot-state="${canvas}" data-header-button="canvas-slot"
             style="width:44px;height:44px"><button${disabled} style="width:44px;height:44px">C</button></div>`;
  return `
  <header class="shell-header" data-testid="shell-header">
    <div style="display:flex; align-items:center; gap:8px; margin-left:auto; height:100%">
      <button data-header-button="records" style="width:72px;height:28px">Records</button>
      <button data-header-button="canvas" style="width:72px;height:28px">Canvas</button>
      <button data-header-button="agents" style="width:44px;height:44px">R</button>
      ${slot}
      <button data-header-button="inbox" style="width:44px;height:44px">B</button>
    </div>
  </header>
`;
}

/**
 * THE CANONICAL CANVAS. One markup, used by every route: the global overlay
 * sheet, fixed to the right edge, full viewport height, above everything.
 * `CanvasSideSheetImpl` owns exactly these three facts (right edge, width,
 * z-10000) and `CanvasSurfaceCard` owns the card + pane header inside it.
 */
function canonicalCanvas(width: number) {
  return `
  <div
    data-testid="canvas-sheet"
    style="position:fixed; top:0; right:0; height:100dvh; width:${width}px; z-index:10000; overflow:hidden;"
  >
    <div class="flex h-full flex-col overflow-hidden" data-canvas-surface="sheet">
      <header data-testid="canvas-pane-header" style="height:44px; flex-shrink:0; display:flex; align-items:center;">
        <button data-testid="canvas-source-switch">Preview / Source</button>
      </header>
      <div class="flex-1 min-h-0 overflow-y-auto" data-testid="canvas-body">canvas</div>
    </div>
  </div>`;
}

/**
 * THE REJECTED DOCK, reproduced only under the mutation switch: the canvas as
 * an in-flow column inside the route body, offset down by the floating shell
 * header's height.
 */
function dockedCanvas() {
  return `
  <div
    data-testid="canvas-column"
    style="width:40%; height:100%; overflow:hidden; padding-top: var(--shell-header-h, 0px);"
  >
    <div class="flex h-full flex-col overflow-hidden" data-canvas-surface="docked">
      <header data-testid="canvas-pane-header" style="height:44px; flex-shrink:0; display:flex; align-items:center;">
        <button data-testid="canvas-source-switch">Preview / Source</button>
      </header>
      <div class="flex-1 min-h-0 overflow-y-auto" data-testid="canvas-body">canvas</div>
    </div>
  </div>`;
}

type RouteKind = "chat" | "document";

/**
 * The three states the shell header actually lives through, in order:
 *   `empty`  — the route has a canvas surface but nothing has been put in it
 *   `open`   — an item exists and the canvas pane is showing
 *   `closed` — an item exists and the canvas has been folded away
 * The header must be pixel-identical in all three.
 */
type CanvasState = "empty" | "open" | "closed";

/** The body each route draws. Neither one knows anything about the canvas. */
function routeBody(route: RouteKind) {
  return route === "chat"
    ? `<div class="flex h-full flex-col overflow-hidden" data-testid="route-body">
         <div class="flex flex-1 min-h-0 w-full">
           <div class="flex-1 min-h-0 overflow-y-auto" data-testid="thread">
             <div style="height:3000px">a long conversation</div>
           </div>
         </div>
       </div>`
    : `<div class="flex h-full flex-col overflow-hidden" data-testid="route-body">
         <div class="flex-1 min-h-0 overflow-y-auto" data-testid="doc-list">
           <div style="height:3000px">a list of documents</div>
         </div>
       </div>`;
}

async function mount(
  page: import("@playwright/test").Page,
  route: RouteKind,
  canvas: CanvasState,
  canvasWidth: number,
) {
  // Under the mutation, and ONLY the chat route, the canvas is built the way
  // the rejected dock built it: inside the route body, pushed down by the
  // header. Every other combination uses the one canonical presentation.
  const docked = MUTATION === "dock" && route === "chat";

  const inFlowCanvas = canvas === "open" && docked ? dockedCanvas() : "";
  const overlayCanvas =
    canvas === "open" && !docked ? canonicalCanvas(canvasWidth) : "";

  const body = docked
    ? `<div class="flex h-full flex-col overflow-hidden" data-testid="route-body">
         <div class="flex flex-1 min-h-0 w-full">
           <div class="flex-1 min-h-0 overflow-y-auto" data-testid="thread">
             <div style="height:3000px">a long conversation</div>
           </div>
           ${inFlowCanvas}
         </div>
       </div>`
    : routeBody(route);

  await page.setContent(
    `<!doctype html><html><body>
      <div class="shell-root" data-pathname="/${route}">
        ${header(canvas)}
        <main class="shell-main" data-testid="shell-main">${body}</main>
      </div>
      ${overlayCanvas}
    </body></html>`,
  );
  await page.addStyleTag({ content: SHELL_CSS });
  await page.addStyleTag({ content: TAILWIND_SUBSET });
  if (canvas === "open") {
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-canvas-open", "true");
    });
  }
}

/**
 * The canvas' own remembered width, clamped to the viewport. ONE number for
 * every route, because the width is state on the one surface, not on a route.
 */
function sheetWidth(testInfo: import("@playwright/test").TestInfo) {
  const viewport = testInfo.project.use.viewport;
  if (!viewport) throw new Error("this gate needs a fixed viewport");
  return Math.min(768, Math.round(viewport.width));
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

async function headerButtonRects(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const out: Record<string, number[]> = {};
    document
      .querySelectorAll<HTMLElement>("[data-header-button]")
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        out[el.dataset.headerButton as string] = [
          Math.round(r.x * 100) / 100,
          Math.round(r.y * 100) / 100,
          Math.round(r.width * 100) / 100,
          Math.round(r.height * 100) / 100,
        ];
      });
    return out;
  });
}

async function canvasPaneHeaderRect(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="canvas-pane-header"]');
    if (!el) throw new Error("the canvas pane header is not on screen");
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x * 100) / 100,
      y: Math.round(r.y * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
    };
  });
}

/**
 * CASE 1 — one canvas, one geometry. The pane the user reads and the buttons
 * they click are in the same place whichever route opened it.
 */
test("the canvas pane lands in the SAME place on chat as on a document route", async ({
  page,
}, testInfo) => {
  // The sheet's width is the user's own remembered width — the same number on
  // both routes, because it is ONE piece of state on ONE surface.
  const width = sheetWidth(testInfo);

  await mount(page, "document", "open", width);
  const onDocument = await canvasPaneHeaderRect(page);

  await mount(page, "chat", "open", width);
  const onChat = await canvasPaneHeaderRect(page);

  expect(onChat).toEqual(onDocument);
  // And it starts at the very top of the viewport — the canonical canvas is
  // drawn ABOVE the floating shell header, never pushed below it.
  expect(onChat.y).toBe(0);
});

/**
 * CASE 2 — opening the canvas moves no shell header button, on either route.
 */
for (const route of ["chat", "document"] as const) {
  test(`opening the canvas moves no shell header button on the ${route} route`, async ({
    page,
  }, testInfo) => {
    const width = sheetWidth(testInfo);

    await mount(page, route, "closed", width);
    const closed = await headerButtonRects(page);
    expect(Object.keys(closed).sort()).toEqual([
      "agents",
      "canvas",
      "canvas-slot",
      "inbox",
      "records",
    ]);

    await mount(page, route, "open", width);
    const open = await headerButtonRects(page);

    expect(open).toEqual(closed);
  });
}

/**
 * CASE 3 — the shell header itself does not move or resize when the canvas
 * opens. A presentation that took space out of the header row would show up
 * here even if every button happened to keep its offset inside it.
 */
for (const route of ["chat", "document"] as const) {
  test(`the shell header's own box is unchanged by the canvas on the ${route} route`, async ({
    page,
  }, testInfo) => {
    const width = sheetWidth(testInfo);
    const read = async () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="shell-header"]');
        if (!el) throw new Error("the shell header is not on screen");
        const r = el.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map(
          (v) => Math.round(v * 100) / 100,
        );
      });

    await mount(page, route, "closed", width);
    const closed = await read();
    await mount(page, route, "open", width);
    expect(await read()).toEqual(closed);
    expect(round(closed[1])).toBe(0);
  });
}

/**
 * CASE 4 — THE FIRST CANVAS ITEM MOVES NO SHELL HEADER BUTTON EITHER.
 *
 * Case 2 only compares `closed` (an item exists, canvas folded away) against
 * `open`. That is the half the 2026-09-17 fix covered. The half it did not:
 * `empty` — the state every route starts in, before anything has ever been put
 * in the canvas. The component returned `null` there, so the FIRST item both
 * created the 44px box and shoved every button left of it, permanently.
 * Measured live on production 2026-09-18 (review row 34bfd1e8): Records
 * 1043.39 → 999.39, Canvas 1132 → 1088, Conversation actions 1164 → 1120,
 * Agents for this page 1192 → 1148.
 *
 * `MATRX_LAYOUT_GATE_MUTATION=first-item` drops the slot in the `empty` state,
 * exactly as the shipped component did → this case goes RED on both routes.
 */
for (const route of ["chat", "document"] as const) {
  test(`the first canvas item moves no shell header button on the ${route} route`, async ({
    page,
  }, testInfo) => {
    const width = sheetWidth(testInfo);

    await mount(page, route, "empty", width);
    const empty = await headerButtonRects(page);
    // The slot is on screen before anything has ever been put in the canvas.
    expect(Object.keys(empty).sort()).toEqual([
      "agents",
      "canvas",
      "canvas-slot",
      "inbox",
      "records",
    ]);

    await mount(page, route, "open", width);
    expect(await headerButtonRects(page)).toEqual(empty);

    // …and folding it away gives back exactly the same row, not a third one.
    await mount(page, route, "closed", width);
    expect(await headerButtonRects(page)).toEqual(empty);
  });
}

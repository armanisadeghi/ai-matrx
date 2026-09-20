/**
 * LAYOUT GATE — nothing inside a user-menu disclosure may be laid out wider
 * than the menu, because the disclosure clips what overflows and the user is
 * left staring at a blank rectangle.
 *
 * THE LIVE DEFECT (cold walk 13, 2026-09-20, defect N1, build `b530eceb62`,
 * 1440x900 and 1920x1200): signed in with no workspace chosen — the one state
 * every first-time Expert is in — the account menu's ORGANIZATION section was
 * an empty panel ~350px tall with one stray `Personal` pill and one unlabelled
 * toggle. All 48 organization rows were in the DOM, laid out at `x: -184,
 * width: 467` inside a disclosure measuring `x: 57, width: 226` with
 * `overflow-x: hidden`. Every workspace name, and the picker's own
 * "No organization selected — pick one below." line, were rendered outside the
 * menu and clipped away. The red header banner sends the user to this exact
 * section.
 *
 * THE MECHANISM, and why it is a CLASS and not an instance: `MenuGroup` runs
 * the pure-CSS `grid-rows-[0fr] → [1fr]` disclosure with the clip on the OUTER
 * grid. A grid item's `min-width` defaults to `auto`, which resolves to its
 * MIN-CONTENT width; the automatic minimum would be zeroed if the ITEM itself
 * carried `overflow: hidden`, but here it does not. So the item grows to the
 * min-content width of whatever it holds, and the outer clip hides the result.
 * A truncating row (`truncate` ⇒ `white-space: nowrap`) contributes its FULL
 * text width to min-content, so this bites any list the menu will ever hold —
 * the org picker is merely the first tenant wide enough to notice. The repo's
 * four other `grid-rows-[0fr]` disclosures (tool-call-visualization x3,
 * PricingLanding) put `overflow-hidden` ON the grid item and are immune by
 * construction; `MenuGroup` was the only one that did not, and it is fixed by
 * giving the item `min-w-0`.
 *
 * WHY A REAL BROWSER: jsdom computes no layout, and the defect IS layout. This
 * gate builds the disclosure from `MenuGroup.tsx`'s OWN class strings, renders
 * the REAL shared `OrganizationPicker` into it, compiles the REPO'S OWN
 * Tailwind for exactly those class names, and measures rects in Chromium. No app, no dev server, no network —
 * and it reaches the no-workspace state the running app cannot be returned to
 * once a workspace has been chosen.
 *
 * PROVEN FAILING BEFORE PASSING:
 *   MATRX_LAYOUT_GATE_MUTATION=menu-group-no-min-w pnpm test:shell-layout
 * strips `min-w-0` back off the grid item. Every case below goes RED with the
 * picker ~467px wide inside a 226px disclosure, exactly as walk 13 measured.
 *
 * Run: pnpm test:shell-layout
 */

import path from "node:path";

import { expect, test } from "@playwright/test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrganizationPicker } from "@ai-matrx/design-system";

import {
  MENU_ITEM_CLASS,
  USER_MENU_PANEL_CLASS,
} from "../components/header/header-right-menu/menuItemClass";

const MENU_GROUP_DIR = path.join(
  process.cwd(),
  "features",
  "shell",
  "components",
  "header",
  "header-right-menu",
);

/**
 * The gate cannot IMPORT `MenuGroup` — Playwright compiles `.tsx` with its own
 * component-testing JSX factory, so a React render of it dies before a rect is
 * measured. It reads the two class strings straight out of the real file
 * instead, and throws if the component stops having them. That keeps the
 * fixture honest: change MenuGroup's disclosure shape and this gate stops
 * running rather than silently measuring a stale copy.
 */
function menuGroupDisclosureClasses(): { grid: string; item: string } {
  const source = readFileSync(path.join(MENU_GROUP_DIR, "MenuGroup.tsx"), "utf8");
  const grid = source.match(
    /className="(grid grid-rows-\[0fr\][^"]*)"/,
  )?.[1];
  const item = source.match(/className="(min-h-0[^"]*)"/)?.[1];
  const inner = source.match(/className="(pl-2 pt-0\.5)"/)?.[1];
  if (!grid || !item || !inner) {
    throw new Error(
      "MenuGroup.tsx no longer spells the 0fr disclosure as `grid grid-rows-[0fr] …` > `min-h-0 …` > `pl-2 pt-0.5` — this gate measures a shape that no longer exists.",
    );
  }
  return { grid, item: `${item}|${inner}` };
}

const MUTATION = process.env.MATRX_LAYOUT_GATE_MUTATION ?? "";

/** The 48 memberships walk 13's account was in, shaped like the real rows. */
const ORGANIZATIONS = Array.from({ length: 48 }, (_, index) => ({
  id: `org-${index}`,
  name: `Organization Number ${index} With A Fairly Long Workspace Name Inc`,
  abbreviation: `O${index}`,
  isPersonal: index === 3,
}));

/**
 * The account menu in the ONE state walk 13 could not get back into: signed in,
 * no workspace chosen. `UserMenuOrgSection` is Redux-bound, so this fixture
 * wires what it composes — `MenuGroup`'s disclosure classes, read from the real
 * file, around the real shared `OrganizationPicker` — with the props
 * `OrganizationPickerPanel` passes for "no active organization".
 */
function renderNoWorkspaceMenu(): string {
  const picker = renderToStaticMarkup(
    React.createElement(OrganizationPicker, {
      hideHeading: true,
      itemClassName: MENU_ITEM_CLASS,
      organizations: ORGANIZATIONS,
      activeOrganizationId: null,
      defaultOrganizationId: null,
      loading: false,
      loadFailed: false,
      onSelect: () => {},
      onSetDefault: () => {},
    }),
  );

  const { grid, item } = menuGroupDisclosureClasses();
  const [itemClass, innerClass] = item.split("|");

  let gridItemClass = itemClass;
  if (MUTATION === "menu-group-no-min-w") {
    gridItemClass = itemClass.replace(/\s*\bmin-w-0\b/, "");
    if (gridItemClass === itemClass) {
      throw new Error(
        "MATRX_LAYOUT_GATE_MUTATION=menu-group-no-min-w found no `min-w-0` on MenuGroup's grid item to strip — the fix this gate pins is already gone.",
      );
    }
  }

  return [
    `<div class="${USER_MENU_PANEL_CLASS}" data-testid="user-menu-panel">`,
    `<input type="checkbox" class="peer sr-only" checked />`,
    `<div class="${grid}" data-testid="disclosure">`,
    `<div class="${gridItemClass}">`,
    `<div class="${innerClass}">${picker}</div>`,
    `</div></div></div>`,
  ].join("");
}

/**
 * Compile the repo's own Tailwind (v4, `@tailwindcss/postcss` — the same plugin
 * `postcss.config.mjs` runs) for exactly the class names this markup uses, so
 * the numbers below come from the real utilities rather than a test's model of
 * them.
 */
async function tailwindFor(markup: string): Promise<string> {
  const classNames = [
    ...new Set(
      (markup.match(/class="([^"]*)"/g) ?? [])
        .flatMap((attribute) => attribute.slice(7, -1).split(/\s+/))
        .filter(Boolean),
    ),
  ].join(" ");

  const compiled = await postcss([tailwind({ optimize: false })]).process(
    `@import "tailwindcss" source(none);\n@source inline("${classNames}");`,
    { from: path.join(process.cwd(), "features", "shell", "layout-gate", "gate.css") },
  );
  return compiled.css;
}

/** Theme tokens the utilities resolve against; values are irrelevant to geometry. */
const TOKENS = `
  :root {
    --color-background: #ffffff;
    --color-border: #d4d4d8;
    --color-foreground: #111111;
    --color-muted: #eeeeee;
    --color-muted-foreground: #666666;
    --color-accent: #eeeeee;
    --color-primary: #0066cc;
    --color-destructive: #cc0000;
    --color-warning: #ffaa00;
    --matrx-glass-bg-hover: rgba(0, 0, 0, 0.05);
  }
  body { margin: 0; padding: 40px; }
`;

type Rect = { x: number; y: number; width: number; height: number };

async function mount(page: import("@playwright/test").Page) {
  const markup = renderNoWorkspaceMenu();
  const css = await tailwindFor(markup);
  await page.setContent(
    `<!doctype html><html><head><style>${css}</style><style>${TOKENS}</style></head><body>${markup}</body></html>`,
  );
}

async function rects(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const box = (element: Element | null): Rect | null => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const disclosure = document.querySelector("[data-testid=disclosure]");
    const options = [...document.querySelectorAll("[role=option]")];
    return {
      panel: box(document.querySelector("[data-testid=user-menu-panel]")),
      disclosure: box(disclosure ?? null),
      picker: box(document.querySelector("[data-slot=organization-picker]")),
      status: box(document.querySelector("[data-slot=organization-picker-status]")),
      statusText:
        document.querySelector("[data-slot=organization-picker-status]")
          ?.textContent ?? "",
      optionCount: options.length,
      optionBoxes: options.slice(0, 5).map((option) => box(option)),
      nameBoxes: options
        .slice(0, 5)
        .map((option) => box(option.querySelector("span.truncate"))),
    };
  });
}

test("every workspace name is laid out INSIDE the disclosure that clips it", async ({
  page,
}) => {
  await mount(page);
  const measured = await rects(page);

  expect(measured.disclosure).not.toBeNull();
  expect(measured.picker).not.toBeNull();
  expect(measured.optionCount).toBe(ORGANIZATIONS.length);

  const disclosure = measured.disclosure!;
  const picker = measured.picker!;

  // The whole point: the picker cannot be wider than the box that clips it.
  expect(picker.width).toBeLessThanOrEqual(disclosure.width);
  expect(picker.x).toBeGreaterThanOrEqual(disclosure.x - 0.5);
  expect(picker.x + picker.width).toBeLessThanOrEqual(
    disclosure.x + disclosure.width + 0.5,
  );

  // And each visible row's NAME — the thing walk 13 could not read — is inside it.
  for (const name of measured.nameBoxes) {
    expect(name).not.toBeNull();
    expect(name!.width).toBeGreaterThan(0);
    expect(name!.x).toBeGreaterThanOrEqual(disclosure.x - 0.5);
    expect(name!.x + name!.width).toBeLessThanOrEqual(
      disclosure.x + disclosure.width + 0.5,
    );
  }
});

test("the no-workspace state says so in plain words, above the list, on screen", async ({
  page,
}) => {
  await mount(page);
  const measured = await rects(page);

  expect(measured.status).not.toBeNull();
  const status = measured.status!;
  const disclosure = measured.disclosure!;

  // Plain English, no jargon, and it names the remedy.
  expect(measured.statusText).toMatch(/no\s+(organization|workspace)\s+selected/i);
  expect(measured.statusText).toMatch(/pick one below/i);

  // Above the list, and actually rendered where a human can read it.
  expect(status.width).toBeGreaterThan(0);
  expect(status.height).toBeGreaterThan(0);
  expect(status.x).toBeGreaterThanOrEqual(disclosure.x - 0.5);
  expect(status.x + status.width).toBeLessThanOrEqual(
    disclosure.x + disclosure.width + 0.5,
  );
  expect(status.y).toBeLessThan(measured.optionBoxes[0]!.y);
});

test("the section is not the blank rectangle walk 13 photographed", async ({
  page,
}) => {
  await mount(page);

  // Walk 13's symptom stated as the engine sees it: a workspace name is on
  // screen only if a hit-test at the MIDDLE of that name lands on the name. A
  // row laid out past the clip edge answers with the clipping box, or nothing —
  // which is precisely the blank rectangle the walker photographed.
  const hits = await page.evaluate(() => {
    const options = [...document.querySelectorAll("[role=option]")].slice(0, 5);
    return options.map((option) => {
      const name = option.querySelector("span.truncate");
      if (!name) return "NO-NAME-SPAN";
      const r = name.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!hit) return "NOTHING-THERE";
      // NOTE: `hit.contains(name)` would be true for <body> and would turn the
      // clipped-away case green — the hit must BE the name or live inside it.
      return hit === name || name.contains(hit)
        ? "the-name"
        : `${hit.tagName}.${hit.className}`;
    });
  });

  expect(hits).toEqual(["the-name", "the-name", "the-name", "the-name", "the-name"]);
});

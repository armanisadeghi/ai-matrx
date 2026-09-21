/**
 * LAYOUT GATE — every control the account menu renders must be reachable by a
 * real mouse, at every viewport the product is judged on.
 *
 * THE LIVE DEFECT (cold walk 16, 2026-09-21, defect E, production
 * www.aimatrx.com, 1440x900, dark mode): the menu's own theme row could not be
 * clicked. Measured by the walker with ADMIN and SETTINGS collapsed — the
 * state `useResetMenuGroupsOnOpen` puts every group into on every open, so it
 * is the state the menu is ALWAYS in when it appears:
 *
 *   - the panel measured `top 588`, `height 304`, `bottom 892` — it fits;
 *   - `Dark Mode` measured `top 878, bottom 906` in a 900px window — 6px below
 *     the WINDOW and 14px below the panel that is supposed to contain it;
 *   - `document.elementFromPoint` at its centre answered
 *     `LABEL.shell-user-menu-backdrop`, not the button;
 *   - `scrollHeight === clientHeight === 304`, `scrollTop 0`, and six wheel
 *     ticks over the panel moved nothing — so scrolling to it was impossible;
 *   - three real Playwright mouse clicks TIMED OUT. Dark mode could only be
 *     set by dispatching the click in the DOM.
 *
 * THE MECHANISM, and why it is a CLASS and not one row: `MenuGroup` collapses
 * with the pure-CSS `grid-rows-[0fr] → [1fr]` disclosure and `overflow-hidden`
 * on the outer grid. That CLIPS the collapsed content — it does not HIDE it.
 * The rows keep their layout, keep their boxes, stay focusable and stay in the
 * hit-test tree; they are simply painted nowhere. A group near the bottom of
 * the panel therefore parks live `<button>`s below the panel and below the
 * window, where `elementFromPoint` answers with whatever is actually painted
 * there (the menu backdrop) and a real click can never land. It also means
 * those rows are silent TAB STOPS: keyboard focus walks into controls no one
 * can see. Every row of every collapsed group in the menu is exposed — Dark
 * Mode is merely the one walk 16 reached for. Fixed by hiding the collapsed
 * content (`invisible peer-checked:visible`) instead of only clipping it, so a
 * collapsed row is ABSENT rather than present-but-unreachable.
 *
 * The second half of the contract is the panel itself: once a group IS open,
 * the panel must stay inside the viewport (max-height with the safe-area
 * insets subtracted) and SCROLL, so every row an open group adds — including
 * a 48-workspace organization list — can be brought under the mouse.
 *
 * WHY A REAL BROWSER: jsdom computes no layout and no hit-testing, and this
 * defect is both. The gate builds the account menu out of the REAL class
 * strings (`MenuGroup.tsx`, `menuItemClass.ts`, `userMenuItems.constants.ts`)
 * inside the REAL `styles/shell.css` panel chrome, compiles the REPO'S OWN
 * Tailwind for exactly those class names, and measures Chromium's rects and
 * `elementFromPoint`. No app, no dev server, no network.
 *
 * PROVEN FAILING BEFORE PASSING:
 *   MATRX_LAYOUT_GATE_MUTATION=menu-group-clips-collapsed pnpm test:shell-layout
 *     puts MenuGroup's disclosure back to clip-only. The collapsed cases go RED
 *     at 1440x900 with the theme row below the window, exactly as walk 16
 *     measured.
 *   MATRX_LAYOUT_GATE_MUTATION=user-menu-unbounded pnpm test:shell-layout
 *     strips the panel's `max-height`/`overflow-y` bound out of the stylesheet.
 *     The open-group cases go RED with the panel running off the top of the
 *     screen and refusing to scroll.
 *
 * Run: pnpm test:shell-layout
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrganizationPicker } from "@ai-matrx/design-system";

import {
  MENU_ITEM_CLASS,
  USER_MENU_PANEL_CLASS,
} from "../components/header/header-right-menu/menuItemClass";
import {
  COMMUNICATION_ITEMS,
  QUICK_ACCESS_ITEMS,
  SETTINGS_ITEMS,
} from "../components/header/header-right-menu/userMenuItems.constants";

const MENU_GROUP_DIR = path.join(
  process.cwd(),
  "features",
  "shell",
  "components",
  "header",
  "header-right-menu",
);

const SHELL_CSS_PATH = path.join(process.cwd(), "styles", "shell.css");

const MUTATION = process.env.MATRX_LAYOUT_GATE_MUTATION ?? "";

/**
 * The gate cannot IMPORT `MenuGroup` — Playwright compiles `.tsx` with its own
 * component-testing JSX factory, so a React render of it dies before a rect is
 * measured (same reason as `user-menu-org-disclosure.spec.ts`). It reads the
 * real class strings out of the real file instead, and throws if the component
 * stops having them, so this gate stops running rather than silently measuring
 * a shape that no longer exists.
 */
function menuGroupClasses(): {
  wrapper: string;
  label: string;
  grid: string;
  item: string;
  inner: string;
} {
  const source = readFileSync(path.join(MENU_GROUP_DIR, "MenuGroup.tsx"), "utf8");
  const wrapper = source.match(
    /className="(\[&:has\(input:checked\)_\.mg-chevron\][^"]*)"/,
  )?.[1];
  const label = source.match(
    /className="(flex items-center gap-2 w-full px-3 py-1 text-xs[^"]*)"/,
  )?.[1];
  const grid = source.match(/className="(grid grid-rows-\[0fr\][^"]*)"/)?.[1];
  const item = source.match(/className="(min-h-0[^"]*)"/)?.[1];
  const inner = source.match(/className="(pl-2 pt-0\.5)"/)?.[1];
  if (!wrapper || !label || !grid || !item || !inner) {
    throw new Error(
      "MenuGroup.tsx no longer spells the disclosure as wrapper > label > `grid grid-rows-[0fr] …` > `min-h-0 …` > `pl-2 pt-0.5` — this gate measures a shape that no longer exists.",
    );
  }
  return { wrapper, label, grid, item, inner };
}

/** The 48 memberships walk 16's account was in, shaped like the real rows. */
const ORGANIZATIONS = Array.from({ length: 48 }, (_, index) => ({
  id: `org-${index}`,
  name: `Organization Number ${index} With A Fairly Long Workspace Name Inc`,
  abbreviation: `O${index}`,
  isPersonal: index === 3,
}));

const CHEVRON = `<svg class="mg-chevron w-3 h-3 shrink-0" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>`;
const ICON = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /></svg>`;

/** One menu row, exactly as `OverlayMenuItem` / `ThemeToggleMenuItem` render it. */
function row(label: string): string {
  return `<label class="block"><button class="${MENU_ITEM_CLASS}" data-menu-row="${label}">${ICON}${label}</button></label>`;
}

/**
 * One `MenuGroup`, built from the component's own class strings.
 * `open` renders the disclosure checkbox `checked`, which is what a click on
 * the group's label does.
 */
function group(
  id: string,
  label: string,
  body: string,
  open: boolean,
): string {
  const classes = menuGroupClasses();
  let grid = classes.grid;
  if (MUTATION === "menu-group-clips-collapsed") {
    grid = grid
      .replace(/\s*\bpeer-checked:visible\b/, "")
      .replace(/\s*\binvisible\b/, "");
    if (grid === classes.grid) {
      throw new Error(
        "MATRX_LAYOUT_GATE_MUTATION=menu-group-clips-collapsed found no `invisible`/`peer-checked:visible` on MenuGroup's disclosure to strip — the fix this gate pins is already gone.",
      );
    }
  }
  return [
    `<div class="${classes.wrapper}">`,
    `<input type="checkbox" id="menu-group-${id}" class="peer sr-only"${open ? " checked" : ""} />`,
    `<label for="menu-group-${id}" class="${classes.label}"><span>${ICON}</span><span class="flex-1 text-left">${label}</span>${CHEVRON}</label>`,
    `<div class="${grid}">`,
    `<div class="${classes.item}"><div class="${classes.inner}">${body}</div></div>`,
    `</div></div>`,
  ].join("");
}

const divider = `<div class="h-px my-1 mx-2 bg-[var(--matrx-glass-border-color)]"></div>`;

/**
 * `UserMenuPanel` for an admin account — the account walk 16 walked — inside
 * the real `ShellUserBlock` chrome and the shell's `#shell-user-menu` checkbox.
 * `open: false` is the state every open of the menu starts in, because
 * `useResetMenuGroupsOnOpen` unchecks every group when the panel appears.
 */
function renderShellUserMenu(open: boolean): string {
  const orgBody = renderToStaticMarkup(
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

  const panel = [
    `<div class="${USER_MENU_PANEL_CLASS}" data-testid="user-menu-panel">`,
    `<label class="block"><a href="#" class="flex items-center gap-2.5 px-3 py-2 rounded-lg" data-menu-row="Profile"><span class="w-7 h-7 rounded-full shrink-0"></span><span class="flex flex-col min-w-0"><span class="text-base font-medium text-foreground truncate">Admin</span><span class="text-xs text-foreground truncate">admin@admin.com</span></span></a></label>`,
    divider,
    group("organization", "Organization", orgBody, open),
    divider,
    group(
      "quick",
      "Quick Access",
      QUICK_ACCESS_ITEMS.map((item) => row(item.label)).join(""),
      open,
    ),
    divider,
    COMMUNICATION_ITEMS.map((item) => row(item.label)).join(""),
    divider,
    group(
      "admin",
      "Admin",
      [row("Admin Dashboard"), row("Admin Indicator"), row("Error Inspector")].join(""),
      open,
    ),
    divider,
    group(
      "settings",
      "Settings",
      [
        row("Copy short link"),
        row("Dark Mode"),
        ...SETTINGS_ITEMS.map((item) => row(item.label)),
      ].join(""),
      open,
    ),
    divider,
    row("Sign Out"),
    `</div>`,
  ].join("");

  return [
    `<div class="shell-root">`,
    `<input type="checkbox" id="shell-user-menu" checked hidden />`,
    `<div class="shell-user-block">`,
    `<div class="shell-user-block-trigger"><span class="shell-user-block-name"></span></div>`,
    `<label for="shell-user-menu" class="shell-user-menu-backdrop" aria-hidden="true"></label>`,
    `<div class="shell-user-menu-panel" data-testid="menu-scroller">${panel}</div>`,
    `</div></div>`,
  ].join("");
}

/**
 * Compile the repo's own Tailwind (v4, `@tailwindcss/postcss` — the same
 * plugin `postcss.config.mjs` runs) for exactly the class names this markup
 * uses, so the geometry comes from the real utilities.
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

/** The shell's own stylesheet, optionally with the panel's bound removed. */
function shellCss(): string {
  const css = readFileSync(SHELL_CSS_PATH, "utf8");
  if (MUTATION !== "user-menu-unbounded") return css;

  // Strip the bound from EVERY rule that sets it on the panel — the desktop
  // rule and the mobile one — so the mutation reaches all three viewports.
  let stripped = 0;
  const mutated = css.replace(
    /([^{}]*\.shell-user-menu-panel[^{}]*\{)([^}]*)\}/g,
    (whole, selector: string, body: string) => {
      if (!/max-height/.test(body)) return whole;
      stripped += 1;
      return `${selector}${body.replace(/max-height:[^;]+;/g, "").replace(/overflow-y:\s*auto;/g, "")}}`;
    },
  );
  if (stripped < 2) {
    throw new Error(
      "MATRX_LAYOUT_GATE_MUTATION=user-menu-unbounded found fewer than two `max-height` bounds on `.shell-user-menu-panel` to strip — the bound this gate pins is already gone.",
    );
  }
  return mutated;
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
    --matrx-glass-bg-active: rgba(0, 0, 0, 0.08);
    --matrx-glass-border-color: rgba(0, 0, 0, 0.12);
  }
  html, body { margin: 0; padding: 0; height: 100%; }
`;

async function mount(page: Page, open: boolean) {
  const markup = renderShellUserMenu(open);
  const css = await tailwindFor(markup);
  await page.setContent(
    `<!doctype html><html><head><style>${css}</style><style>${shellCss()}</style><style>${TOKENS}</style></head><body>${markup}</body></html>`,
  );
}

type RowReport = {
  label: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  hit: string;
};

/**
 * Every control a human can see in the menu, with where it is and what a
 * mouse click at its centre would actually land on. "Can see" is the engine's
 * own answer (`checkVisibility`), so a row hidden by the fix is not reported
 * and a row that is merely CLIPPED — walk 16's case — still is.
 */
async function visibleRows(page: Page, scrollIntoView: boolean): Promise<RowReport[]> {
  return page.evaluate((bringIntoView) => {
    const scroller = document.querySelector("[data-testid=menu-scroller]");
    const controls = [
      ...document.querySelectorAll<HTMLElement>("[data-menu-row], [role=option]"),
    ];
    const reports: RowReport[] = [];
    for (const control of controls) {
      if (
        !control.checkVisibility({
          visibilityProperty: true,
          opacityProperty: true,
          contentVisibilityAuto: true,
        })
      ) {
        continue;
      }
      if (bringIntoView && scroller) {
        control.scrollIntoView({ block: "center" });
      }
      const rect = control.getBoundingClientRect();
      const hitElement = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      const hit =
        hitElement === null
          ? "NOTHING-THERE"
          : hitElement === control || control.contains(hitElement)
            ? "the-row"
            : `${hitElement.tagName}.${hitElement.className}`;
      reports.push({
        label:
          control.dataset.menuRow ??
          (control.textContent ?? "").trim().slice(0, 40),
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        hit,
      });
    }
    return reports;
  }, scrollIntoView);
}

async function panelBox(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector("[data-testid=menu-scroller]");
    if (!scroller) return null;
    const rect = scroller.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      viewport: window.innerHeight,
    };
  });
}

test("with every group collapsed, no menu control is parked outside the window", async ({
  page,
}) => {
  await mount(page, false);

  const rows = await visibleRows(page, false);
  const viewport = page.viewportSize()!.height;

  // Walk 16's exact symptom: a live control below the bottom of the window.
  const offscreen = rows.filter(
    (candidate) => candidate.bottom > viewport || candidate.top < 0,
  );
  expect(
    offscreen,
    `menu controls laid out outside the ${viewport}px window: ${JSON.stringify(offscreen)}`,
  ).toEqual([]);
});

test("with every group collapsed, every visible row answers a click at its centre", async ({
  page,
}) => {
  await mount(page, false);

  const rows = await visibleRows(page, false);
  expect(rows.length).toBeGreaterThan(0);

  const unreachable = rows.filter((candidate) => candidate.hit !== "the-row");
  expect(
    unreachable,
    `menu controls a mouse cannot reach: ${JSON.stringify(unreachable)}`,
  ).toEqual([]);
});

test("a collapsed group's rows are not silent tab stops", async ({ page }) => {
  await mount(page, false);

  const focusable = await page.evaluate(() => {
    const collapsed = [
      ...document.querySelectorAll<HTMLElement>("[data-menu-row]"),
    ].filter(
      (control) =>
        !control.checkVisibility({
          visibilityProperty: true,
          opacityProperty: true,
          contentVisibilityAuto: true,
        }),
    );
    return collapsed
      .filter((control) => {
        control.focus();
        return document.activeElement === control;
      })
      .map((control) => control.dataset.menuRow ?? "");
  });

  expect(
    focusable,
    `rows inside a collapsed group still take keyboard focus: ${JSON.stringify(focusable)}`,
  ).toEqual([]);
});

test("an open menu stays inside the window and scrolls to every row it holds", async ({
  page,
}) => {
  await mount(page, true);

  const panel = await panelBox(page);
  expect(panel).not.toBeNull();
  const viewport = page.viewportSize()!.height;

  // Bounded: the panel itself never leaves the window …
  expect(panel!.top).toBeGreaterThanOrEqual(-0.5);
  expect(panel!.bottom).toBeLessThanOrEqual(viewport + 0.5);

  // … and with every group open (48 workspaces included) it must overflow,
  // which is exactly why it has to be a scroller and not a taller box.
  expect(panel!.scrollHeight).toBeGreaterThan(panel!.clientHeight);

  // Every row is then reachable: scroll it under the mouse and click it.
  const rows = await visibleRows(page, true);
  expect(rows.length).toBeGreaterThan(QUICK_ACCESS_ITEMS.length);

  const unreachable = rows.filter(
    (candidate) =>
      candidate.hit !== "the-row" ||
      candidate.top < 0 ||
      candidate.bottom > viewport,
  );
  expect(
    unreachable,
    `rows an open menu cannot bring under the mouse: ${JSON.stringify(unreachable)}`,
  ).toEqual([]);
});

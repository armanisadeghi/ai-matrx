// scripts/lib/seat-browser.test.mjs — node --test scripts/lib/seat-browser.test.mjs
//
// The org picker's DOM matcher (`findOrganizationOptionAndClick`, lane TAILS-24) used to search
// every leaf element in `body` for one whose own text was exactly the wanted organization name.
// A sidebar nav item labeled "AI Matrx" carries that exact text too and is drawn BEFORE the
// picker in document order, so `setOrganization(page, "AI Matrx")` clicked the nav item and the
// page landed on the Dashboard with a red "Choose org" — VERIFIER-23, "Outside the list": "The
// seat helper picks the wrong row for 'AI Matrx' ... clicks the sidebar's AI Matrx navigation
// item, not the organization row."
//
// Two DOM shapes, both with a same-text decoy OUTSIDE the picker:
//   1. Sidebar nav item "AI Matrx" + a picker containing an organization row named "AI Matrx".
//   2. The picker drawn TWICE on one page (sidebar copy + the "pick an organization" hold
//      notice copy) — a real shape per this file's own `revealTestOrganizations` comment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { findOrganizationOptionAndClick } from "./seat-browser.mjs";

function withDom(html, fn) {
  const dom = new JSDOM(html, { url: "https://example.test/" });
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevMouseEvent = globalThis.MouseEvent;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MouseEvent = dom.window.MouseEvent;
  try {
    return fn(dom);
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
    globalThis.MouseEvent = prevMouseEvent;
  }
}

function organizationRow(name, { active = false } = {}) {
  return `
    <li role="none">
      <button type="button" role="option" aria-selected="${active}" data-org-name="${name}">
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate">${name}</span>
        </span>
      </button>
    </li>`;
}

/** Wire every element in `selector` to record its own click, so a test can assert WHICH one fired. */
function trackClicks(selector) {
  const clicked = [];
  for (const el of document.querySelectorAll(selector)) {
    el.addEventListener("click", () => clicked.push(el));
  }
  return clicked;
}

test("DOM shape 1: a sidebar nav item sharing the organization's exact name is never clicked", () => {
  withDom(
    `<body>
      <nav id="shell-sidebar">
        <a href="/" id="brand-home">AI Matrx</a>
      </nav>
      <div data-slot="organization-picker">
        <ul>${organizationRow("AI Matrx")}${organizationRow("Ashford Labs")}</ul>
      </div>
    </body>`,
    () => {
      const brandClicks = trackClicks("#brand-home");
      const optionClicks = trackClicks('[data-slot="organization-picker"] [role="option"]');
      const picked = findOrganizationOptionAndClick("AI Matrx");
      assert.equal(picked, true, "the matcher should find and click the organization row");
      assert.equal(brandClicks.length, 0, "the sidebar nav item must never receive the click");
      assert.equal(optionClicks.length, 1, "exactly one organization-picker row was clicked");
      assert.equal(optionClicks[0].getAttribute("data-org-name"), "AI Matrx");
    },
  );
});

test("DOM shape 2: the picker drawn twice (sidebar + hold notice) still picks a real row, never the decoy outside it", () => {
  withDom(
    `<body>
      <span class="app-title">AI Matrx</span>
      <aside data-slot="organization-picker">
        <ul>${organizationRow("Ashford Labs")}</ul>
      </aside>
      <div data-testid="organization-required-notice">
        <div data-slot="organization-picker">
          <ul>${organizationRow("Ashford Labs")}${organizationRow("Castellano & Reyes, LLP")}</ul>
        </div>
      </div>
    </body>`,
    () => {
      const titleClicks = trackClicks(".app-title");
      const optionClicks = trackClicks('[role="option"]');
      const picked = findOrganizationOptionAndClick("Castellano & Reyes, LLP");
      assert.equal(picked, true);
      assert.equal(titleClicks.length, 0, "the decoy title outside any picker is untouched");
      assert.equal(optionClicks.length, 1, "exactly one row anywhere on the page was clicked");
      assert.equal(optionClicks[0].getAttribute("data-org-name"), "Castellano & Reyes, LLP");
    },
  );
});

test("no match anywhere returns false rather than clicking something else", () => {
  withDom(
    `<body>
      <span>Ashford Labs</span>
      <div data-slot="organization-picker"><ul>${organizationRow("Ashford Labs")}</ul></div>
    </body>`,
    () => {
      const picked = findOrganizationOptionAndClick("Nobody's Organization");
      assert.equal(picked, false);
    },
  );
});

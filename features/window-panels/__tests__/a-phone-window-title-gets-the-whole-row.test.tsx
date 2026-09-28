/**
 * GUARD — on a phone, a window's title gets the whole row and wraps to two
 * lines before it truncates. Every mobile window chrome (fullscreen header,
 * bottom-sheet drawer, utility card) holds it.
 *
 * Reported 2026-09-28: /agent-apps/<id>/run → Run History on a phone read
 * "Run History — …". The fullscreen header stuffed the title into the
 * Sidebar/Content toggle (`max-w-[120px] truncate`) beside the actions, so the
 * one thing that says which history this is was cut to its first two words.
 * The drawer and card headers shared the row with the actions and truncated on
 * one line the same way.
 *
 * Contract, per surface:
 *   1. The full title text is rendered in ONE title slot
 *      (`data-window-mobile-title`), never inside a button.
 *   2. The slot wraps to two lines (`line-clamp-2`), never `truncate`.
 *   3. The row the title sits in holds no window actions and no pane toggle —
 *      those move to their own row.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MobileWindowHeader } from "../WindowPanel/MobileHeader";
import MobileCardSurface from "../mobile/MobileCardSurface";
import MobileDrawerSurface from "../mobile/MobileDrawerSurface";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LONG_TITLE = "Run History — Recipe Scaler for Weeknight Family Dinners";

function render(ui: React.ReactElement): void {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(ui);
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

const ACTION = <button type="button" data-testid="window-action">Refresh</button>;

function titleSlot(): HTMLElement {
  const slots = [...document.body.querySelectorAll<HTMLElement>("[data-window-mobile-title]")];
  const withTitle = slots.filter((s) => s.textContent?.includes(LONG_TITLE));
  expect(withTitle).toHaveLength(1);
  return withTitle[0]!;
}

function assertTitleOwnsItsRow() {
  const slot = titleSlot();
  // 1. Not a toggle label, not any button.
  expect(slot.closest("button")).toBeNull();
  // 2. Wraps to two lines before it truncates.
  expect(slot.className).toContain("line-clamp-2");
  expect(slot.className.split(/\s+/)).not.toContain("truncate");
  // 3. The title's row carries no action and no pane toggle.
  const row = slot.closest<HTMLElement>("[data-window-mobile-title-row]");
  expect(row).not.toBeNull();
  expect(row!.querySelector("[data-testid='window-action']")).toBeNull();
  expect(row!.textContent).not.toContain("Sidebar");
  // …and the action still exists, on its own row.
  expect(document.body.querySelector("[data-testid='window-action']")).not.toBeNull();
}

describe("a phone window's title gets the whole row", () => {
  it("fullscreen header with a sidebar (Run History's shape)", () => {
    render(
      <MobileWindowHeader
        title={LONG_TITLE}
        actionsRight={ACTION}
        hasSidebar
        activePaneMobile="main"
        onSetActivePane={() => undefined}
        onClose={() => undefined}
      />,
    );
    assertTitleOwnsItsRow();
    // The pane toggle survives, on the second row.
    expect(document.body.textContent).toContain("Sidebar");
  });

  it("fullscreen header without a sidebar", () => {
    render(
      <MobileWindowHeader
        title={LONG_TITLE}
        actionsRight={ACTION}
        hasSidebar={false}
        activePaneMobile="main"
        onSetActivePane={() => undefined}
        onClose={() => undefined}
      />,
    );
    assertTitleOwnsItsRow();
  });

  it("utility card", () => {
    render(
      <MobileCardSurface isOpen title={LONG_TITLE} actionsRight={ACTION} onClose={() => undefined}>
        <p>body</p>
      </MobileCardSurface>,
    );
    assertTitleOwnsItsRow();
  });

  it("bottom-sheet drawer", () => {
    render(
      <MobileDrawerSurface isOpen title={LONG_TITLE} actionsRight={ACTION} onClose={() => undefined}>
        <p>body</p>
      </MobileDrawerSurface>,
    );
    assertTitleOwnsItsRow();
  });
});

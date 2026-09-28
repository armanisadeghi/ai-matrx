/**
 * ONE OVERFLOW PER PHONE HEADER — a route header's actions move into the
 * shell's ⋮ sheet (page-pass shared defects, 2026-09-27: at 375px a CRM record
 * title was cut to "La…" beside the page's "…" and the shell's ⋮).
 *
 * PINS: on a phone, with the shell's host published, `RouteHeader` draws no
 * "…" in the row and portals every SECONDARY action into the host, where it
 * stays mounted — but the PRIMARY (last) action stays in the row (2026-09-27:
 * a page's main action is never reachable only through a menu — "Submit all"
 * on /agents/battle was buried in the ⋮). A labelled primary goes icon-only,
 * its caption kept as the accessible name. On desktop the row is unchanged.
 *
 * PROVEN FAILING BEFORE PASSING: against the pre-fix RouteHeader the phone case
 * finds the actions in the row and nothing in the host; against a93cd8029e
 * (every action to the sheet) it finds "Send email" in the host, not the row.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let PHONE = true;
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => PHONE }));
jest.mock("./PageHeader", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-test-page-header>{children}</div>,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const store = require("./phone-page-actions") as typeof import("./phone-page-actions");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RouteHeader = (require("./RouteHeader") as typeof import("./RouteHeader")).default;

class RO {
  observe() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;

let root: Root;
let hostEl: HTMLElement;
let rowEl: HTMLElement;

function mount() {
  rowEl = document.createElement("div");
  document.body.appendChild(rowEl);
  root = createRoot(rowEl);
  act(() => {
    root.render(
      <RouteHeader
        left={<span>Lankanewspapers.com Local</span>}
        right={
          <>
            <button type="button">More record actions</button>
            <button type="button">Send email</button>
          </>
        }
      />,
    );
  });
}

beforeEach(() => {
  store.__resetPhonePageActionsForTest();
  hostEl = document.createElement("div");
  document.body.appendChild(hostEl);
  store.pushPhonePageActionsHost(hostEl);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("RouteHeader on a phone", () => {
  it("keeps the primary (last) action in the row and portals the others into the shell's sheet host", () => {
    PHONE = true;
    mount();
    const row = rowEl.querySelector("[data-route-header-right]")!;
    expect(row.textContent).toContain("Send email");
    expect(row.textContent).not.toContain("More record actions");
    expect(row.querySelector("[data-route-header-overflow]")).toBeNull();
    expect(hostEl.textContent).toContain("More record actions");
    expect(hostEl.textContent).not.toContain("Send email");
    expect(store.getPhonePageActionCountForTest()).toBe(1);
  });

  it("draws a labelled primary icon-only in the row, its caption kept as the accessible name", () => {
    PHONE = true;
    const Tap = ({ label, icon, ariaLabel }: { label?: string; icon: React.ReactNode; ariaLabel?: string }) => (
      <button type="button" aria-label={ariaLabel ?? label}>
        {icon}
        {label}
      </button>
    );
    rowEl = document.createElement("div");
    document.body.appendChild(rowEl);
    root = createRoot(rowEl);
    act(() => {
      root.render(
        <RouteHeader
          left={<span>Meetings</span>}
          right={
            <>
              <Tap icon={<i />} label="Start now" />
              <Tap icon={<i />} label="New meeting" ariaLabel="Schedule a new meeting" />
            </>
          }
        />,
      );
    });
    const row = rowEl.querySelector("[data-route-header-right]")!;
    const kept = row.querySelector("[data-route-header-compact] button")!;
    expect(kept.getAttribute("aria-label")).toBe("Schedule a new meeting");
    expect(kept.textContent).toBe("");
    expect(hostEl.textContent).toContain("Start now");
  });

  it("a lone action stays in the row and the sheet gets nothing", () => {
    PHONE = true;
    rowEl = document.createElement("div");
    document.body.appendChild(rowEl);
    root = createRoot(rowEl);
    act(() => {
      root.render(<RouteHeader left={<span>Battle</span>} right={<button type="button">Submit all</button>} />);
    });
    expect(rowEl.querySelector("[data-route-header-right]")!.textContent).toContain("Submit all");
    expect(hostEl.textContent).toBe("");
    expect(store.getPhonePageActionCountForTest()).toBe(0);
  });

  it("keeps the row exactly as before on desktop", () => {
    PHONE = false;
    mount();
    expect(rowEl.textContent).toContain("Send email");
    expect(hostEl.textContent).toBe("");
    expect(store.getPhonePageActionCountForTest()).toBe(0);
  });
});

describe("the phone sheet names every action", () => {
  it("a control that declares no name is named by the accessible name it renders", () => {
    PHONE = true;
    rowEl = document.createElement("div");
    document.body.appendChild(rowEl);
    root = createRoot(rowEl);
    const RecordMenu = () => <button type="button" aria-label="Record actions">…</button>;
    act(() => {
      root.render(
        <RouteHeader
          left={<span>Cloud Codes</span>}
          right={
            <>
              <RecordMenu />
              <button type="button">Save</button>
            </>
          }
        />,
      );
    });
    expect(hostEl.textContent).toContain("Record actions");
  });
});

describe("PageHeaderRightPortal on a phone", () => {
  it("puts the page's right-slot controls in the sheet host, not the header row", () => {
    PHONE = true;
    const shellRight = document.createElement("div");
    shellRight.id = "shell-header-right";
    document.body.appendChild(shellRight);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RightPortal = (require("./PageHeaderRightPortal") as typeof import("./PageHeaderRightPortal")).default;
    rowEl = document.createElement("div");
    document.body.appendChild(rowEl);
    root = createRoot(rowEl);
    act(() => {
      root.render(
        <RightPortal>
          <button type="button">Notes agents</button>
        </RightPortal>,
      );
    });
    expect(shellRight.textContent).toBe("");
    expect(hostEl.textContent).toContain("Notes agents");
    expect(store.getPhonePageActionCountForTest()).toBe(1);
  });
});

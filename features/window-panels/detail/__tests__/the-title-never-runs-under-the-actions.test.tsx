// 🚨 D4 and NEW-4 (VERIFY-U-P1-R2) — THE RECORD'S NAME AND THE ACTION CLUSTER
// DO NOT SHARE THE SAME PIXELS.
//
// Both findings are GEOMETRIC: this container cannot sign in to any Matrx host,
// so no screen was seen and nothing below is a pixel measurement. What jsdom CAN
// hold is the structure that made the overlap inevitable:
//
//   D4    `WindowPanel` drew its title in an `absolute inset-x-0 justify-center`
//         layer with `px-16` and NO gap reserved for the action zone, which sits
//         in normal flow at the right. A name long enough to reach `max-w-full`
//         gave the title a 432px box in the 560px default window, spanning
//         x≈64–496, while the cluster occupied from x≈440 rightward — so the type
//         chip and the record's own doors sat underneath the icons.
//   NEW-4 The docked presentation's header (`SidePanelSurface`'s `PanelHeader`)
//         gave the title `flex-1` beside a `shrink-0` cluster; under
//         `pointer: coarse` every icon is 40px, so on a 390px phone the cluster
//         is ~300px and the name was left ~50px.
//
// The fix in both is the same shape: the title and the actions are laid out in
// ONE flex row, the title `min-w-0 truncate` so it yields exactly the space the
// actions really need and not a pixel more — and on a phone the name keeps the
// first row while the cluster wraps below it.

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import windowManager from "@/lib/redux/slices/windowManagerSlice";
import adminDebug from "@/lib/redux/preferences/adminDebugSlice";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

import { PanelHeader } from "@/features/overlays/surfaces/SidePanelSurface";
import { DetailActions, DetailTitle } from "@/lib/detail/core/DetailHeader";
import { useDetailCore } from "@/lib/detail/core/useDetailCore";
import { instance, makePorts, mount } from "@/lib/detail/__tests__/harness";
import {
  DETAIL_HEADER_COMPACT_BELOW,
  DETAIL_HEADER_CONTAINER,
  DETAIL_TITLE_MIN_WIDTH_CLASS,
} from "@/lib/detail/core/headerGeometry";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// `useIsMobile` reads `matchMedia`, which jsdom does not implement — the same
// wall the round-4 verifier's own probe hit. Desktop, because these are the
// DESKTOP presentations' headers.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

/**
 * 🚨 VERIFY-U-P1-R4 (the tests section) — THIS IS A RENDERED ASSERTION NOW.
 * It used to read `WindowPanel.tsx` as TEXT and anchor on a COMMENT string
 * ("Open titles stay in flow"), so rewording a comment failed it while a layout
 * regression that kept the class names passed it. A comment is not evidence. The
 * window chrome is mounted for real (two reducers and a `matchMedia` stub are all
 * it needs in jsdom) and the assertions read the ELEMENTS the browser would get.
 *
 * 🚨 STILL NOT PIXELS. jsdom computes no layout, so this proves the structure
 * that made the overlap possible is gone — the title is a flex child in flow with
 * the action zones, not an absolute layer across the whole bar — and not that the
 * boxes do not intersect on a real screen.
 */
function mountWindowChrome(titleNode: React.ReactNode) {
  const store = configureStore({ reducer: { windowManager, adminDebug } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={store}>
        <WindowPanel
          id="detail-window-test"
          title="Q3 partnership agreement — signed copy.pdf"
          titleNode={titleNode}
          actionsRight={<span data-window-actions>actions</span>}
          onClose={() => {}}
        >
          <div>body</div>
        </WindowPanel>
      </Provider>,
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("the window header's title layer, as rendered", () => {
  it("lays an OPEN window's title out in flow, never absolutely across the whole bar", () => {
    const m = mountWindowChrome(<span data-window-title-node>the record</span>);
    const titleNode = document.querySelector("[data-window-title-node]") as HTMLElement;
    expect(titleNode).not.toBeNull();
    const actions = document.querySelector("[data-window-actions]") as HTMLElement;
    expect(actions).not.toBeNull();

    // Every ancestor between the title and the header row is in FLOW: the
    // absolute layer with `px-16` standing in for the action zones is what drew
    // the name underneath the icons (D4).
    let node: HTMLElement | null = titleNode;
    const climbed: string[] = [];
    while (node && node !== document.body) {
      climbed.push(node.className || "");
      if (node.contains(actions)) break;
      node = node.parentElement;
    }
    const upToTheSharedRow = climbed.join(" ");
    expect(upToTheSharedRow).not.toContain("absolute");
    expect(upToTheSharedRow).not.toContain("inset-x-0");
    expect(upToTheSharedRow).not.toContain("px-16");
    // …and it yields rather than overlaps.
    expect(upToTheSharedRow).toContain("min-w-0");

    // The title and the actions really do share ONE row, in that order.
    const sharedRow = node as HTMLElement;
    expect(sharedRow.contains(titleNode)).toBe(true);
    expect(sharedRow.contains(actions)).toBe(true);
    expect(
      titleNode.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    m.unmount();
  });

  it("declares the container the detail header's own breakpoint reads, in the rendered chrome", () => {
    const m = mountWindowChrome(<span data-window-title-node>the record</span>);
    const declared = Array.from(document.querySelectorAll<HTMLElement>("[class]")).some((el) =>
      el.className.includes(DETAIL_HEADER_CONTAINER),
    );
    expect(declared).toBe(true);
    m.unmount();
  });
});

function mountHeader(actions: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <PanelHeader
        title={<span data-title-node>Q3 partnership agreement — signed copy.pdf</span>}
        headerActions={actions}
        onRequestClose={() => {}}
      />,
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("the docked panel's header on a phone", () => {
  it("gives the name the first row and lets the action cluster wrap below it", () => {
    const m = mountHeader(<div data-actions>icons</div>);
    const header = m.container.firstElementChild as HTMLElement;
    const title = m.container.querySelector("[data-panel-title]") as HTMLElement;
    const actions = m.container.querySelector("[data-panel-header-actions]") as HTMLElement;

    // One row that may become two, rather than one row that squeezes the name.
    expect(header.className).toContain("flex-wrap");
    // A fixed height would clip the wrapped second row.
    expect(header.className).not.toMatch(/(^|\s)h-11(\s|$)/);
    expect(header.className).toContain("min-h-11");

    // The name yields only what the actions really need…
    expect(title.className).toContain("min-w-0");
    expect(title.className).toContain("truncate");
    // …and it is never the thing that wraps: the cluster is.
    expect(actions.className).toContain("w-full");
    expect(actions.className).toContain("order-last");
    expect(actions.className).toContain("sm:w-auto");

    // The name comes first in the DOM, so it is also first for a screen reader.
    expect(
      title.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    m.unmount();
  });

  it("reserves nothing when there are no actions", () => {
    const m = mountHeader(undefined);
    expect(m.container.querySelector("[data-panel-header-actions]")).toBeNull();
    m.unmount();
  });
});

// 🚨 NEW-8 (VERIFY-U-P1-R3) — AT THE WINDOW'S OWN MINIMUM WIDTH THE NAME KEEPS A
// READABLE WIDTH, AND THE ACTION CLUSTER COLLAPSES FIRST.
//
// 🚨 NO SCREEN WAS SEEN. This container cannot sign in to any Matrx host, so
// nothing here is a pixel measurement — the arithmetic D4's fix left behind is:
// at `minWidth={360}` the traffic-light spacer is 96px and the cluster (previous
// / counter / next / two presentation icons / copy / pop-out) is ~200px, leaving
// the record's name about 60px — four characters and an ellipsis. What jsdom CAN
// hold is the structure: a floor under the name, and a cluster that moves its
// optional controls into an overflow menu when the WINDOW (not the viewport) is
// narrow. The window's header declares the container the query reads, so the
// breakpoint answers the window's width and never the screen's.
describe("the detail header at a narrow window width", () => {
  function Bar() {
    const core = useDetailCore(
      instance({
        list: {
          items: [instance(), { ...instance(), id: "22222222-2222-3333-4444-555555555555" }].map(
            (i) => ({ type: i.type, id: i.id }),
          ),
          index: 0,
        },
      }),
      "window",
      { onClose: () => {} },
    );
    return (
      <div>
        <DetailTitle core={core} />
        <DetailActions core={core} />
      </div>
    );
  }

  it("puts a floor under the record's name", () => {
    const m = mount(<Bar />, makePorts());
    const title = m.container.querySelector("[data-detail-title]") as HTMLElement;
    expect(title.className).toContain(DETAIL_TITLE_MIN_WIDTH_CLASS);
    expect(title.className).toContain("truncate");
    m.unmount();
  });

  it("collapses the optional actions into an overflow menu below that width, and only there", () => {
    const m = mount(<Bar />, makePorts());
    const collapsible = m.container.querySelector("[data-detail-actions-collapsible]") as HTMLElement;
    const overflow = m.container.querySelector("[data-detail-actions-overflow]") as HTMLElement;
    expect(collapsible).not.toBeNull();
    expect(overflow).not.toBeNull();
    // Wide: the icons are in the bar and the overflow button is not.
    expect(collapsible.className).toContain(`${DETAIL_HEADER_COMPACT_BELOW}:hidden`);
    expect(overflow.className).toContain("hidden");
    expect(overflow.className).toContain(`${DETAIL_HEADER_COMPACT_BELOW}:inline-flex`);
    // Nothing is a viewport breakpoint: a window's width is not the screen's.
    expect(collapsible.className).not.toMatch(/(^|\s)sm:/);
    expect(overflow.className).not.toMatch(/(^|\s)sm:/);
    m.unmount();
  });

  it("loses nothing to the collapse — the menu carries the same commands", () => {
    const m = mount(<Bar />, makePorts());
    const overflow = m.container.querySelector("[data-detail-actions-overflow]") as HTMLElement;
    act(() => overflow.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const menu = m.container.querySelector("[data-detail-actions-menu]") as HTMLElement;
    expect(menu).not.toBeNull();
    const labels = Array.from(menu.querySelectorAll("button")).map((b) => b.textContent?.trim());
    expect(labels).toContain("Open docked to the side");
    expect(labels).toContain("Open as page");
    expect(labels).toContain("Copy record id");
    m.unmount();
  });

  it("keeps the previous / next controls in the bar at every width", () => {
    const m = mount(<Bar />, makePorts());
    const bar = m.container.querySelector("[data-detail-actions]") as HTMLElement;
    const prev = bar.querySelector('[aria-label^="Previous record"]') as HTMLElement;
    expect(prev).not.toBeNull();
    expect(prev.closest("[data-detail-actions-collapsible]")).toBeNull();
    m.unmount();
  });
});

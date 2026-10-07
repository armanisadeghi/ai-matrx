/**
 * A RIGHT-CLICK ON AN OPEN MENU NEVER OPENS THE MENU AROUND IT (blind run PB-06, /chat, 2026-10-01).
 *
 * The message menu sits inside the transcript's menu. The open menu is portaled to <body>, but
 * React bubbles a portal's events to every React ancestor — so a right-click (or a Mac two-finger
 * tap mid-scroll) on the OPEN message menu reached the transcript shell, which opened the page menu
 * over it with both engines mounted: 18 RED `DuplicateActionError`s and "the menu swapped".
 *
 * Break this names: the shell answers a gesture whose target is outside its own DOM subtree →
 * "never opens the outer menu" red (two menus mounted, the transcript's last).
 */
import React, { act } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { NonEditableContextMenu } from "../NonEditableContextMenu";

jest.mock("next/dynamic", () => () => (props: { sourceFeature: string }) => {
  const ReactModule = require("react");
  const { createPortal: portal } = require("react-dom");
  // Like the real ContextMenuPanel: the open menu lives in <body>, not inside its trigger.
  return portal(
    ReactModule.createElement(
      "div",
      { role: "menu", "data-alchemy-layout": "context-command", "data-testid": "alchemy-menu", "data-source": props.sourceFeature },
      ReactModule.createElement("button", { "data-testid": `row-${props.sourceFeature}` }, "Copy"),
    ),
    document.body,
  );
});
jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));
jest.mock("@ai-matrx/chat/agents/hooks/useWidgetHandle", () => ({ useOptionalWidgetHandle: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <NonEditableContextMenu sourceFeature="transcription">
        <section data-testid="transcript">
          <NonEditableContextMenu sourceFeature="messages">
            <article data-testid="message">
              <p data-testid="para">Pack day</p>
            </article>
          </NonEditableContextMenu>
        </section>
      </NonEditableContextMenu>,
    );
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const openMenus = () => [...document.querySelectorAll('[data-testid="alchemy-menu"]')].map((m) => m.getAttribute("data-source"));
const rightClick = (el: Element) => {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  act(() => {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 2 }));
    el.dispatchEvent(event);
  });
  return event;
};

it("a right-click on the message opens the message's menu only", () => {
  rightClick(host.querySelector('[data-testid="para"]')!);
  expect(openMenus()).toEqual(["messages"]);
});

it("never opens the outer menu: a right-click on the open menu keeps the one menu, with no native menu over it", () => {
  rightClick(host.querySelector('[data-testid="para"]')!);
  const event = rightClick(document.querySelector('[data-testid="row-messages"]')!);
  expect(openMenus()).toEqual(["messages"]);
  expect(event.defaultPrevented).toBe(true);
});

it("a portal that is not a menu (a dialog opened from inside the region) gets no menu of the region's", () => {
  function Dialog() {
    return createPortal(<div data-testid="dialog">Rename</div>, document.body);
  }
  act(() => {
    root.render(
      <NonEditableContextMenu sourceFeature="transcription">
        <section>
          <Dialog />
        </section>
      </NonEditableContextMenu>,
    );
  });
  const event = rightClick(document.querySelector('[data-testid="dialog"]')!);
  expect(openMenus()).toEqual([]);
  expect(event.defaultPrevented).toBe(false);
});

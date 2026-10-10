/**
 * @jest-environment jsdom
 *
 * THE ATTACH POINT — the right-click menu and the ONE selection toolbar need a
 * real DOM element to hold. A slot onto a component that does not forward its
 * ref leaves none, and both silently do nothing (verify round 1: the Scratch
 * window). The menu slots only onto an intrinsic DOM element; any component
 * child gets the menu's own display:contents wrapper.
 *
 * Use case: a window body component (no forwardRef) whose text a person
 * selects and right-clicks.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NonEditableContextMenu } from "../NonEditableContextMenu";
import { zonesContaining } from "@ai-matrx/rich-content/selection-toolbar/selection-zones";

jest.mock("next/dynamic", () => () => (props: { mode: string }) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require("react");
  return ReactModule.createElement("div", { "data-testid": "alchemy-menu", "data-mode": props.mode });
});
jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));
jest.mock("@ai-matrx/chat/agents/hooks/useWidgetHandle", () => ({ useOptionalWidgetHandle: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A body component that neither forwards its ref nor spreads props (the common case). */
function WindowBody() {
  return <p data-testid="body-text">Weigh every inbound load of scrap aluminum.</p>;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("a component child gets the menu's own wrapper: right-click opens and the selection zone holds its text", () => {
  act(() => {
    root.render(
      <NonEditableContextMenu sourceFeature="system">
        <WindowBody />
      </NonEditableContextMenu>,
    );
  });
  const text = host.querySelector<HTMLElement>('[data-testid="body-text"]')!;
  // The zone registers once the surface is engaged (first press), not at mount.
  expect(zonesContaining(text.firstChild).length).toBe(0);
  act(() => {
    text.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  });
  expect(zonesContaining(text.firstChild).length).toBe(1);
  // The right-click reaches the menu.
  act(() => {
    text.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
  expect(document.querySelector('[data-testid="alchemy-menu"]')).not.toBeNull();
});

it("an intrinsic element is slotted, adding no wrapper (a <tr> stays a direct child of <tbody>)", () => {
  act(() => {
    root.render(
      <table>
        <tbody>
          <NonEditableContextMenu sourceFeature="system">
            <tr data-testid="row">
              <td>Alton yard</td>
            </tr>
          </NonEditableContextMenu>
        </tbody>
      </table>,
    );
  });
  const row = host.querySelector('[data-testid="row"]')!;
  expect(row.parentElement?.tagName).toBe("TBODY");
  act(() => {
    row.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  });
  expect(zonesContaining(row.firstChild).length).toBe(1);
});

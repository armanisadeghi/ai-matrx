/**
 * ALC-15 verifier finding 4: the palette opened only when focus sat inside the
 * surface, so on a read-only note (focus on the page body) it opened nothing,
 * and on /data it could never target a cell (cells are not focusable).
 * Break it names: ⌘/Ctrl+Shift+K anywhere does not open the palette of the
 * surface under the pointer, resolved for the element under the pointer → red.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NonEditableContextMenu } from "./NonEditableContextMenu";

jest.mock("next/dynamic", () => () => (props: { mode: string; sourceFeature: string }) =>
  require("react").createElement("div", { "data-testid": "alchemy-menu", "data-mode": props.mode, "data-source": props.sourceFeature }),
);
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/features/agents/hooks/useWidgetHandle", () => ({ useOptionalWidgetHandle: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("the palette opens from anywhere on a surface with a menu", () => {
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

  it("targets the surface — and the cell — under the pointer, with focus on the page body", () => {
    const resolved: string[] = [];
    act(() => {
      root.render(
        <div>
          <NonEditableContextMenu sourceFeature="notes">
            <p data-testid="note">Kiln firing schedule</p>
          </NonEditableContextMenu>
          <NonEditableContextMenu
            sourceFeature="udt"
            resolveContextOnOpen={(el) => {
              resolved.push(el?.getAttribute("data-cell") ?? "none");
              return null;
            }}
          >
            <div role="grid">
              <div data-cell="row-2:price">$40</div>
            </div>
          </NonEditableContextMenu>
        </div>,
      );
    });
    const cell = host.querySelector<HTMLElement>('[data-cell="row-2:price"]');
    act(() => {
      cell?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    });
    (document.activeElement as HTMLElement | null)?.blur?.();
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "K", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    });
    const menus = [...document.querySelectorAll('[data-testid="alchemy-menu"]')];
    expect(menus.map((m) => [m.getAttribute("data-source"), m.getAttribute("data-mode")])).toEqual([["udt", "palette"]]);
    expect(resolved).toContain("row-2:price");
  });

  it("after a click, targets the innermost surface under the pointer — not the outer one that took focus (round 2, finding 1)", () => {
    act(() => {
      root.render(
        <NonEditableContextMenu sourceFeature="messages">
          <div role="article" tabIndex={0} data-testid="article">
            <NonEditableContextMenu sourceFeature="chat">
              <p data-testid="answer">Refunds are allowed within 60 days.</p>
            </NonEditableContextMenu>
          </div>
        </NonEditableContextMenu>,
      );
    });
    const answer = host.querySelector<HTMLElement>('[data-testid="answer"]');
    const article = host.querySelector<HTMLElement>('[data-testid="article"]');
    act(() => {
      answer?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      answer?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      article?.focus();
    });
    act(() => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", { key: "K", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }),
      );
    });
    const menus = [...document.querySelectorAll('[data-testid="alchemy-menu"]')];
    expect(menus.map((m) => [m.getAttribute("data-source"), m.getAttribute("data-mode")])).toEqual([["chat", "palette"]]);
  });

  it("keyboard only (no pointer since): the surface holding focus", () => {
    act(() => {
      root.render(
        <div>
          <NonEditableContextMenu sourceFeature="notes">
            <p data-testid="note">Kiln schedule</p>
          </NonEditableContextMenu>
          <NonEditableContextMenu sourceFeature="udt">
            <div role="grid" tabIndex={0} data-testid="grid">cells</div>
          </NonEditableContextMenu>
        </div>,
      );
    });
    act(() => {
      host.querySelector<HTMLElement>('[data-testid="note"]')?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    });
    act(() => {
      host.querySelector<HTMLElement>('[data-testid="grid"]')?.focus();
    });
    act(() => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", { key: "K", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }),
      );
    });
    const menus = [...document.querySelectorAll('[data-testid="alchemy-menu"]')];
    expect(menus.map((m) => m.getAttribute("data-source"))).toEqual(["udt"]);
  });
});

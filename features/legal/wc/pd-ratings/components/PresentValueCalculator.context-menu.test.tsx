import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MenuContentProps } from "@/features/context-menu-v3/types";
import { normalizeNativeNumberInputValue } from "./FormField";
import { PresentValueCalculator } from "./PresentValueCalculator";

jest.mock("next/dynamic", () => {
  const ReactModule = require("react") as typeof React;

  return () =>
    function TestMenuContent(
      props: Pick<MenuContentProps, "selectionRange" | "onTextReplace">,
    ) {
      const range = props.selectionRange;
      const element = range?.type === "editable" ? range.element : null;

      const replaceSelection = (nextText: string) => {
        if (
          !range ||
          range.type !== "editable" ||
          !element ||
          !props.onTextReplace
        )
          return;
        props.onTextReplace(
          element.value.substring(0, range.start) +
            nextText +
            element.value.substring(range.end),
        );
      };

      return ReactModule.createElement(
        "div",
        { role: "menu" },
        ReactModule.createElement(
          "button",
          {
            type: "button",
            "data-testid": "menu-cut",
            onClick: () => replaceSelection(""),
          },
          "Cut",
        ),
        ReactModule.createElement(
          "button",
          {
            type: "button",
            "data-testid": "menu-paste",
            onClick: () => replaceSelection("750"),
          },
          "Paste",
        ),
        ReactModule.createElement(
          "button",
          {
            type: "button",
            "data-testid": "menu-paste-invalid",
            onClick: () => replaceSelection("not-a-number"),
          },
          "Paste invalid",
        ),
      );
    };
});

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/features/agents/hooks/useWidgetHandle", () => ({
  useOptionalWidgetHandle: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("PresentValueCalculator controlled menu edits", () => {
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

  function renderCalculator(): HTMLInputElement {
    act(() => root.render(<PresentValueCalculator />));
    const input = host.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("weekly payment input did not render");
    return input;
  }

  function openFieldMenu(input: HTMLInputElement) {
    act(() => {
      input.focus();
      input.dispatchEvent(
        new MouseEvent("contextmenu", {
          button: 2,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  }

  it("cuts the selected controlled input and recalculates the result", () => {
    const input = renderCalculator();
    const result = host.querySelector('[data-surface-value="present_value"]');
    const initialResult = result?.textContent;

    openFieldMenu(input);
    const cut = document.querySelector<HTMLButtonElement>(
      '[data-testid="menu-cut"]',
    );
    if (!cut) throw new Error("editable menu did not render Cut");

    act(() => cut.click());

    expect(input.value).toBe("");
    expect(result?.textContent).not.toBe(initialResult);
  });

  it("pastes through the field callback and keeps the calculated result live", () => {
    const input = renderCalculator();
    const result = host.querySelector('[data-surface-value="present_value"]');
    const initialResult = result?.textContent;

    openFieldMenu(input);
    const paste = document.querySelector<HTMLButtonElement>(
      '[data-testid="menu-paste"]',
    );
    if (!paste) throw new Error("editable menu did not render Paste");

    act(() => paste.click());

    expect(input.value).toBe("750");
    expect(result?.textContent).not.toBe(initialResult);
  });

  it("keeps native numeric constraints while whole-value menu edits update state", () => {
    const input = renderCalculator();
    const interestRate = host.querySelectorAll<HTMLInputElement>("input")[2];
    if (!interestRate) throw new Error("interest rate input did not render");

    expect(input.type).toBe("number");
    expect(input.min).toBe("0");
    expect(input.step).toBe("0.01");
    expect(interestRate.type).toBe("number");
    expect(interestRate.max).toBe("50");
    expect(interestRate.step).toBe("0.1");

    openFieldMenu(input);
    const pasteInvalid = document.querySelector<HTMLButtonElement>(
      '[data-testid="menu-paste-invalid"]',
    );
    if (!pasteInvalid) throw new Error("editable menu did not render invalid Paste");

    act(() => pasteInvalid.click());
    expect(input.value).toBe("");
    expect(normalizeNativeNumberInputValue("not-a-number")).toBe("");
  });
});

/**
 * A BOX SAYS WHAT GOES IN IT — cold walk 22 (friction).
 *
 * On a checking Masterwork, the field "The text (verbatim)" carried the
 * placeholder "Type your answer". It is the text to be checked. Two causes,
 * both pinned here:
 *   1. a served input's declared `placeholder` was parsed and then DROPPED by
 *      the one served-field renderer, so no author could ever say it;
 *   2. the Masterwork's own two fields declare none, so the box fell back to
 *      the generic invitation.
 *
 * Rendered through the real ServedFieldControl → VariableInputComponent →
 * TextareaInput path. RED before: the textarea's placeholder was
 * "Type your answer" in both cases.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ServedFieldControl } from "@/features/workflow-runtime/served-form/ServedInputFields";
import { parseServedInput } from "@/features/workflow-runtime/served-form/served-input";
import { withMasterworkPlaceholders } from "../TryMasterworkBox";

// ProTextarea's voice/AI tooling needs a store; the placeholder is decided
// BEFORE it, in TextareaInput, so a bare textarea that forwards it is enough.
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({ placeholder }: { placeholder?: string }) => (
    <textarea placeholder={placeholder} readOnly />
  ),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  TestResizeObserver;

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

/** The field every checking Masterwork is built with (build.py, "ask" node). */
const THE_TEXT = parseServedInput({
  name: "document",
  kind: "text",
  sourcing: "require",
  label: "The text (verbatim)",
  json_schema: { type: "string" },
})!;

function placeholderOf(input: typeof THE_TEXT): string | null {
  act(() =>
    root.render(
      <ServedFieldControl
        input={input}
        kind={undefined}
        value=""
        onChange={() => {}}
      />,
    ),
  );
  return host.querySelector("textarea")?.getAttribute("placeholder") ?? null;
}

describe("a Masterwork's text box says what goes in it", () => {
  it("a declared placeholder reaches the box", () => {
    expect(
      placeholderOf({ ...THE_TEXT, placeholder: "Paste the customer letter" }),
    ).toBe("Paste the customer letter");
  });

  it("the text under check reads 'Paste the text to check', never 'Type your answer'", () => {
    const [input] = withMasterworkPlaceholders([THE_TEXT], true);
    const placeholder = placeholderOf(input);
    expect(placeholder).toBe("Paste the text to check");
    expect(placeholder).not.toMatch(/answer/i);
  });

  it("an author's own placeholder is never overwritten", () => {
    const [input] = withMasterworkPlaceholders(
      [{ ...THE_TEXT, placeholder: "Paste the estimate" }],
      true,
    );
    expect(input.placeholder).toBe("Paste the estimate");
  });
});

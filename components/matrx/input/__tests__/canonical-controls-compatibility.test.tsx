import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import FloatingLabelInput, { type FloatingLabelInputProps } from "../FlowtingLabelInput";
import MatrxInput, { type MatrxInputProps } from "../MatrxInput";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const namedWidth: MatrxInputProps = { width: "md" };
const floatingNamedWidth: FloatingLabelInputProps = { label: "Name", width: "lg" };
// @ts-expect-error The canonical control only accepts named widths.
const legacyHtmlWidth: MatrxInputProps = { width: "120px" };
void namedWidth;
void floatingNamedWidth;
void legacyHtmlWidth;

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

it("passes named widths to the canonical input through both wrappers", () => {
  act(() => {
    root.render(
      <>
        <MatrxInput aria-label="Search" width="md" />
        <FloatingLabelInput id="member-name" label="Name" width="lg" />
      </>,
    );
  });

  expect(host.querySelector('input[aria-label="Search"]')?.getAttribute("data-width")).toBe("md");
  expect(host.querySelector("#member-name")?.getAttribute("data-width")).toBe("lg");
});

it("keeps floating-label focus state while forwarding host focus callbacks", () => {
  const onFocus = jest.fn();
  const onBlur = jest.fn();
  act(() => {
    root.render(<FloatingLabelInput id="member-name" label="Member name" onFocus={onFocus} onBlur={onBlur} />);
  });

  const input = host.querySelector<HTMLInputElement>("#member-name");
  const label = host.querySelector('label[for="member-name"]');
  expect(input).not.toBeNull();
  expect(label?.className).toContain("top-3");

  act(() => input?.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
  expect(onFocus).toHaveBeenCalledTimes(1);
  expect(label?.className).toContain("-top-2");

  act(() => input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  expect(onBlur).toHaveBeenCalledTimes(1);
  expect(label?.className).toContain("top-3");
});

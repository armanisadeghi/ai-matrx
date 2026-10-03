/**
 * A VARIABLE INPUT SHOWS THE PERSON'S LABEL (2026-10-02, owner rule: a screen never shows a
 * raw identifier). An author named a variable "Customer's iPhone model"; its key is
 * `customer_device`. RED before: callers squeezed the label into `variableName`, and the
 * component ran it through `humanizeIdentifier` ("Customer's I Phone Model") while the media
 * policy key became the label. The component now takes `label` (callers pass
 * `variableRunLabel(variable)`) and keeps `variableName` as the key.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { VariableInputComponent } from "../VariableInputComponent";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = TestResizeObserver;

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

function toggleName(): string | null {
  return host.querySelector("[aria-label]")?.getAttribute("aria-label") ?? null;
}

it("draws the person's label verbatim, never re-cased", async () => {
  await act(async () =>
    root.render(
      <VariableInputComponent
        value="false"
        onChange={() => undefined}
        variableName="customer_device"
        label="Customer's iPhone model"
        customComponent={{ type: "toggle" }}
      />,
    ),
  );
  expect(toggleName()).toBe("Customer's iPhone model");
});

it("with no label, draws the key in words — never the raw key", async () => {
  await act(async () =>
    root.render(
      <VariableInputComponent
        value="false"
        onChange={() => undefined}
        variableName="customer_device_id"
        customComponent={{ type: "toggle" }}
      />,
    ),
  );
  expect(toggleName()).toBe("Customer Device ID");
});

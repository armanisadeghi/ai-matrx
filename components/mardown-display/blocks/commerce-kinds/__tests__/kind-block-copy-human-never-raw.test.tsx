/** @jest-environment jsdom */
/**
 * Y8 (kind never raw): the commerce and print kind blocks' header Copy hands a
 * person the kind's markdown, never `JSON.stringify` of the instance. The
 * `json` / agent flavors are data and keep the value whole.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Copy = { human: () => string; json: () => unknown };
const copies: Copy[] = [];
jest.mock("@ai-matrx/content-ir-react/kind-kit", () => ({
  ...jest.requireActual("@ai-matrx/content-ir-react/kind-kit"),
  KindHeaderBar: ({ copy }: { copy: Copy }) => {
    copies.push(copy);
    return null;
  },
}));

import { LotDetectionBlock } from "../commerce-kind-blocks";
import { LuluPrintCostBlock } from "../../print-kinds/print-kind-blocks";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  copies.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

test("commerce kind block: human copy has no raw kind JSON", () => {
  const value = { __kind: "lot_detection", quantity_estimate: { min: 2, max: 4 } };
  act(() => root.render(<LotDetectionBlock serverData={value} />));
  expect(copies[0].human()).not.toContain("__kind");
  expect(JSON.stringify(copies[0].json())).toContain("__kind");
});

test("print kind block: human copy has no raw kind JSON", () => {
  const value = { __kind: "lulu_print_cost_calculation", currency: "USD", fees: [] };
  act(() => root.render(<LuluPrintCostBlock serverData={value} />));
  expect(copies[0].human()).not.toContain("__kind");
  expect(JSON.stringify(copies[0].json())).toContain("__kind");
});

test("a value streamed in without its marker still copies as the named kind, not JSON", () => {
  act(() => root.render(<LotDetectionBlock serverData={{ value: { quantity_estimate: { min: 2, max: 4 } }, isComplete: true }} />));
  expect(copies[0].human()).not.toMatch(/^\s*\{/);
});

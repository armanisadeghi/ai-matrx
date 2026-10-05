/** @jest-environment jsdom */
//
// H5 (round 5) — a read-only or pinned served field printed its value with
// JSON.stringify, so a binding that pinned a kind (Dana's locked study pack)
// showed `{"__kind":"study_pack",…}` as text. A kind-carrying value goes
// through the one value door; a plain value stays plain text.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@ai-matrx/chat/agents/components/inputs/input-components/VariableInputComponent", () => ({
  VariableInputComponent: () => null,
}));
jest.mock("@/features/content-ir/variants/kind-variants", () => ({
  componentForInputOptions: () => null,
  resolveVariantComponent: () => ({}),
}));
jest.mock("@/features/workflow-runtime/served-form/kind-source", () => ({
  loadKindSources: async () => ({}),
  valueTypeFromJsonSchema: () => "string",
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/components/official/structured-value/KindValueFrontDoor", () => ({
  KindValueFrontDoor: ({ density }: { density?: string }) => (
    <div data-testid="value-door" data-density={density ?? ""} />
  ),
}));

import { ServedFieldControl } from "../ServedInputFields";
import type { ServedInput } from "../served-input";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function input(pinnedValue: unknown): ServedInput {
  return {
    name: "pack",
    kind: "study_pack",
    sourcing: "require",
    variant: null,
    default: null,
    label: "Study pack",
    help: "",
    placeholder: "",
    options: [],
    origin: "provision",
    nodeId: null,
    example: "",
    jsonSchema: {},
    required: true,
    pinned: true,
    readOnly: false,
    pinnedValue,
  } as ServedInput;
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function draw(pinnedValue: unknown) {
  act(() =>
    root.render(
      <ServedFieldControl input={input(pinnedValue)} kind={undefined} value={null} onChange={() => undefined} />,
    ),
  );
}

test.each([
  ["a pinned kind object", { __kind: "study_pack", title: "Cells" }],
  ["a pinned list holding a kind", [{ __kind: "quiz_set", title: "Quiz" }]],
  ["a pinned string of kind JSON", '{"__kind":"study_pack","title":"Held as text"}'],
  ["a pinned prose string with a kind fence", 'Locked pack:\n\n```json\n{"__kind":"study_pack","title":"Cells"}\n```'],
])("%s goes through the value door (compact), never JSON text", (_label, value) => {
  draw(value);
  expect(host.querySelector('[data-testid="value-door"]')?.getAttribute("data-density")).toBe("inline");
  expect(host.textContent).not.toContain("__kind");
});

test("a plain pinned value stays plain text", () => {
  draw("Grade 7");
  expect(host.querySelector('[data-testid="value-door"]')).toBeNull();
  expect(host.textContent).toContain("Grade 7");
});

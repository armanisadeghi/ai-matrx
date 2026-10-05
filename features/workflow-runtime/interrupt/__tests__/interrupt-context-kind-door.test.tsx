/** @jest-environment jsdom */
//
// Y2 (kind never raw) — Dana Whitfield's approval card carries a context with
// TWO named kinds, an array of kinds, a nested kind and a string holding kind
// JSON. Every one goes through the one value door; none prints as JSON.

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const interrupt = {
  checkpointId: "cp-1",
  nodeId: "ask",
  payload: {
    prompt: "Approve the recall plan?",
    preset: "approval",
    context: {
      draft: { __kind: "study_pack", title: "Cells" },
      review: { __kind: "quiz_set", title: "Quiz" },
      many: [{ __kind: "a_kind" }, { __kind: "b_kind" }],
      wrapper: { inner: { __kind: "quiz_set", title: "Deep" } },
      text: '{"__kind":"quiz_set","title":"Held as text"}',
      who: "Dana",
    },
  },
};

jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => interrupt }));
jest.mock("@/features/workflow-runtime/redux/workflow-runs.selectors", () => ({
  selectRunInterrupt: () => () => interrupt,
}));
jest.mock("@/features/workflow-runtime/hooks/useWorkflowRunControls", () => ({
  useWorkflowRunControls: () => ({ answerInterrupt: jest.fn() }),
}));
jest.mock("@/features/record-change-approvals/recordChangeApproval", () => ({
  heldWriteOfInterrupt: () => null,
}));
jest.mock("@/features/workflow-runtime/interrupt/HeldInterrupt", () => ({
  HeldInterrupt: () => null,
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));
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
jest.mock("@/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: ({ value }: { value: unknown }) => (
    <div data-testid="kind-door">{typeof value === "string" ? "text" : "value"}</div>
  ),
}));

import { InterruptQuestion } from "../InterruptQuestion";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

test("every kind-carrying context value goes through the value door; nothing prints raw", () => {
  act(() => root.render(<InterruptQuestion runId="run-1" />));
  expect(host.querySelectorAll("[data-interrupt-context-kind]")).toHaveLength(5);
  expect(host.textContent).not.toContain("__kind");
  expect(host.textContent).not.toContain("quiz_set");
  // The plain fact stays a plain fact.
  expect(host.textContent).toContain("Dana");
});

/**
 * kind-never-raw S1: a Pro textarea / input agent action whose answer is a
 * `__kind` value shows the kind (never its JSON) and writes back the kind's
 * markdown, never the JSON. Kindless answers pass through unchanged.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { agentRunResult } from "../proTextareaAgentActions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/agents/catalog/react", () => ({ AgentListDropdown: () => null }));
jest.mock("@ai-matrx/design-system/tap-target/buttons", () => ({ CheckTapButton: () => null, CopyTapButton: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: ({ text }: { text?: string | null }) => (
    <div data-testid="answer-value-view" data-text={text ?? ""} />
  ),
}));

import { ProTextAgentActionPopoverBody } from "../ProTextAgentActionPopoverBody";

const SET = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
};

describe("agentRunResult (write-back into the field)", () => {
  it("writes a kind answer back as its markdown", () => {
    const out = agentRunResult("src", "src", JSON.stringify(SET));
    expect(out).not.toContain("__kind");
    expect(out).toContain("Mitochondria");
  });
  it("leaves a kindless answer unchanged", () => {
    expect(agentRunResult("src", "src", " Better text. ")).toBe("Better text.");
  });
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("ProTextAgentActionPopoverBody", () => {
  it("draws the answer through the one answer view, never as a text node", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        <ProTextAgentActionPopoverBody
          title="Clean up"
          phase="complete"
          isBusy={false}
          isThinking={false}
          result={JSON.stringify(SET)}
          error={null}
          agentName={null}
          onSelectAgent={() => {}}
          onRun={() => {}}
          canRun
          onApply={() => {}}
          onBack={() => {}}
          onCancel={() => {}}
        />,
      ),
    );
    expect(host.querySelector('[data-testid="answer-value-view"]')).not.toBeNull();
    expect(host.textContent).not.toContain("__kind");
  });
});

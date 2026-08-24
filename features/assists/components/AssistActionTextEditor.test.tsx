import { act } from "react";
import { createRoot } from "react-dom/client";
import { AssistActionTextEditor } from "./AssistActionTextEditor";
import type { ProTextareaProps } from "@/components/official/ProTextarea";
import type { AssistActionTextEditorDefinition } from "../runtime/action-editing";

jest.mock("@/components/official/ProTextarea", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    ProTextarea: React.forwardRef<
      HTMLTextAreaElement,
      ProTextareaProps
    >(function MockProTextarea(
      {
        wrapperClassName: _wrapperClassName,
        autoGrow: _autoGrow,
        minHeight: _minHeight,
        maxHeight: _maxHeight,
        enableVoice: _enableVoice,
        enableCleanup: _enableCleanup,
        enableHelpWithThis: _enableHelpWithThis,
        enableCustomAgent: _enableCustomAgent,
        enableBoundAgents: _enableBoundAgents,
        showCopyButton: _showCopyButton,
        ...props
      },
      ref,
    ) {
      return <textarea ref={ref} {...props} />;
    }),
  };
});

const definition: AssistActionTextEditorDefinition = {
  triggerLabel: "Edit guidelines",
  label: "Keyword guidelines",
  value: "Original full document",
  maxLength: 40_000,
  validate: () => null,
  apply: () => ({ kind: "navigate", href: "/assists" }),
};

describe("AssistActionTextEditor", () => {
  it("selects the complete payload when editing starts", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    HTMLElement.prototype.scrollIntoView = jest.fn();
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 1;
    };

    await act(async () => {
      root.render(
        <AssistActionTextEditor
          definition={definition}
          value={definition.value}
          open
          disabled={false}
          onChange={jest.fn()}
          onOpenChange={jest.fn()}
          onReset={jest.fn()}
        />,
      );
    });

    const textarea = container.querySelector("textarea");
    expect(textarea?.selectionStart).toBe(0);
    expect(textarea?.selectionEnd).toBe(definition.value.length);

    await act(async () => root.unmount());
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    window.requestAnimationFrame = originalRequestAnimationFrame;
  });
});

import React, { act } from "react";
import { createRoot } from "react-dom/client";

let schema: unknown | null = null;
const state = {
  activeRequests: { byRequestId: {} },
  conversations: { byConversationId: {} },
  instanceUIState: { byConversationId: {} },
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (value: typeof state) => unknown) =>
    selector(state),
  useAppDispatch: () => () => undefined,
}));
jest.mock(
  "@/components/mardown-display/blocks/json/useBoundAgentOutputSchema",
  () => ({
    useBoundAgentOutputSchema: () => schema,
  }),
);
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    // SafeBlockRenderer is the only dynamic boundary under test. Other
    // dynamic leaves are unrelated to the JSON dispatch lifecycle.
    if (String(loader).includes("block-registry/BlockRenderer")) {
      const BlockRenderer = require("../block-registry/BlockRenderer").BlockRenderer;
      function DynamicBlockRenderer(props: unknown) {
        return React.createElement(
          BlockRenderer as React.ComponentType<Record<string, unknown>>,
          props as Record<string, unknown>,
        );
      }
      return DynamicBlockRenderer;
    }
    return () => null;
  },
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }));
jest.mock(
  "@/components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry",
  () => {
  const JsonBlock = ({ content }: { content?: string }) =>
    React.createElement("pre", { "data-content-renderer": "JsonBlock" }, content);
  const BasicMarkdownContent = ({ content }: { content?: string }) =>
    React.createElement("p", null, content);
  const stub = (name: string) => {
    const Component = (props: { children?: React.ReactNode }) => React.createElement("div", { "data-stub": name }, props.children);
    Component.displayName = name;
    return Component;
  };
  const proxy = new Proxy(
    { JsonBlock, BasicMarkdownContent },
    { get: (target, prop) =>
      typeof prop === "string" ? (target as Record<string, unknown>)[prop] ?? stub(prop) : undefined },
  );
  return { __esModule: true, BlockComponents: proxy, LoadingComponents: proxy };
},
);
jest.mock("@/features/canvas/materialization/CodeBlockWithContextAttach", () => ({
  CodeBlockWithContextAttach: ({ code }: { code?: string }) =>
    React.createElement("pre", { "data-code-block": true }, code),
}));
jest.mock("../FullScreenMarkdownEditor", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../internal-handlers/ToolHandlers", () => ({
  InlineToolCard: () => null,
  DbToolCard: () => null,
  InlineToolBatch: () => null,
  DbToolBatch: () => null,
}));
jest.mock("../internal-handlers/InlineStatusIndicator", () => ({
  InlineStatusIndicator: () => null,
}));
jest.mock("../internal-handlers/InlineThinkingSlot", () => ({
  InlineThinkingSlot: () => null,
}));
jest.mock("../internal-handlers/InlineAssistantError", () => ({
  InlineAssistantError: () => null,
}));

import { EnhancedChatMarkdownInternal } from "../EnhancedChatMarkdown";

const payload = {
  answer:
    "indrev1 already existed; I reused it and ran the tests successfully. Real output: 1 passed in 0.00s.",
  state: "done",
  commands_run: ["cd ~/projects/indrev1 && uv run pytest -q"],
  efficiency:
    "Efficient execution: reused existing project directory and verified tests immediately.",
  tools_worked: ["shell_execute"],
  tools_failed: [
    { tool: "shell_execute", error: "Command exited with code 1." },
  ],
  next_step: "none",
};
const outputSchema = {
  schema: {
    properties: Object.fromEntries(
      Object.keys(payload).map((key) => [key, {}]),
    ),
  },
};
const content = `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``;

describe("schema-bound answer cold lifecycle", () => {
  it("rerenders the real Enhanced → Safe → Block path when the bound schema arrives", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    const root = createRoot(host);
    schema = null;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    });
    await act(async () => {
      root.render(
        <EnhancedChatMarkdownInternal
          content={content}
          conversationId="c1"
          hideCopyButton
        />,
      );
    });
    expect(host.querySelector('[data-content-renderer="JsonBlock"]')?.textContent).toContain(payload.answer);
    expect(host.querySelector('[data-content-renderer="StructuredAgentAnswerBlock"]')).toBeNull();
    schema = outputSchema;
    await act(async () => {
      root.render(
        <EnhancedChatMarkdownInternal
          content={content}
          conversationId="c1"
          hideCopyButton
        />,
      );
    });
    expect(
      host.querySelector('[data-content-renderer="StructuredAgentAnswerBlock"]')
        ?.textContent,
    ).toContain(payload.answer);
    await act(async () => {
      root.unmount();
    });
  });
});

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let mockDbSegments: Array<Record<string, unknown>> = [];

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

jest.mock(
  "@/features/agents/redux/execution-system/messages/messages.selectors",
  () => ({
    selectMessageInterleavedContent: () => () => mockDbSegments,
  }),
);

jest.mock("../internal-handlers/SafeBlockRenderer", () => {
  const react = jest.requireActual("react") as typeof React;
  return {
    SafeBlockRenderer: ({
      block,
    }: {
      block: { type: string; content: string; language?: string };
    }) =>
      react.createElement(
        "div",
        {
          "data-block-type": block.type,
          "data-language": block.language,
        },
        block.content,
      ),
  };
});

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

jest.mock(
  "@/features/tool-call-visualization/components/AgentWorkGroup",
  () => ({
    AgentWorkGroup: ({ children }: { children: React.ReactNode }) => children,
  }),
);

jest.mock("@/features/tool-call-visualization/registry/registry", () => ({
  getToolDisplayMode: () => "auto",
}));

jest.mock(
  "@/features/tool-call-visualization/components/LiveToolCallCard",
  () => ({
    LiveToolCallCard: () => null,
  }),
);

import { EnhancedChatMarkdownInternal } from "../EnhancedChatMarkdown";
import { StreamAwareChatMarkdown } from "../StreamAwareChatMarkdown";
import type { TypedStreamEvent } from "../types";

const XML =
  "<custom_response>\n<value>42</value>\n</custom_response>";

describe("XML fallback across MarkdownStream rendering paths", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    mockDbSegments = [];
    jest
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("renders direct/static content through the XML block contract", async () => {
    await act(async () => {
      root.render(
        <EnhancedChatMarkdownInternal content={XML} hideCopyButton />,
      );
    });

    expect(
      container
        .querySelector('[data-block-type="code"]')
        ?.getAttribute("data-language"),
    ).toBe("xml");
  });

  it("expands server-processed text blocks before rendering", async () => {
    await act(async () => {
      root.render(
        <EnhancedChatMarkdownInternal
          content=""
          hideCopyButton
          serverProcessedBlocks={[
            {
              blockId: "server-text",
              blockIndex: 0,
              type: "text",
              status: "complete",
              content: XML,
            },
          ]}
        />,
      );
    });

    expect(
      container
        .querySelector('[data-block-type="code"]')
        ?.getAttribute("data-language"),
    ).toBe("xml");
  });

  it("splits persisted DB text segments in the interleaved history path", async () => {
    mockDbSegments = [
      { type: "thinking", content: "Prior reasoning" },
      { type: "text", content: XML },
    ];

    await act(async () => {
      root.render(
        <EnhancedChatMarkdownInternal
          content={XML}
          conversationId="conversation-1"
          messageId="message-1"
          hideCopyButton
        />,
      );
    });

    expect(
      container
        .querySelector('[data-block-type="code"]')
        ?.getAttribute("data-language"),
    ).toBe("xml");
  });

  it("keeps recognized XML specialized on the server-text path", async () => {
    await act(async () => {
      root.render(
        <EnhancedChatMarkdownInternal
          content=""
          hideCopyButton
          serverProcessedBlocks={[
            {
              blockId: "server-info",
              blockIndex: 0,
              type: "text",
              status: "complete",
              content: "<info>Known behavior</info>",
            },
          ]}
        />,
      );
    });

    expect(container.querySelector('[data-block-type="info"]')).not.toBeNull();
    expect(container.querySelector('[data-block-type="code"]')).toBeNull();
  });

  it("updates the XML rendering through live chunk events", async () => {
    const events = [
      { event: "chunk", data: { text: "<custom_response>\n" } },
      { event: "chunk", data: { text: "<value>42</value>\n" } },
      { event: "chunk", data: { text: "</custom_response>" } },
    ] as TypedStreamEvent[];

    await act(async () => {
      root.render(
        <StreamAwareChatMarkdown
          events={events}
          isStreamActive
          hideCopyButton
        />,
      );
    });

    expect(
      container
        .querySelector('[data-block-type="code"]')
        ?.getAttribute("data-language"),
    ).toBe("xml");
  });

  it("renders complete XML text runs in tool-interleaved event mode", async () => {
    const events = [
      {
        event: "tool_event",
        data: {
          event: "tool_started",
          call_id: "call-1",
          tool_name: "lookup",
        },
      },
      { event: "chunk", data: { text: XML } },
    ] as TypedStreamEvent[];
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await act(async () => {
      root.render(
        <StreamAwareChatMarkdown
          events={events}
          isStreamActive
          hideCopyButton
        />,
      );
    });

    expect(
      container
        .querySelector('[data-block-type="code"]')
        ?.getAttribute("data-language"),
    ).toBe("xml");
    logSpy.mockRestore();
  });

  it("updates the XML rendering through live render_block events", async () => {
    const events = [
      {
        event: "render_block",
        data: {
          blockId: "live-server-text",
          blockIndex: 0,
          type: "text",
          status: "complete",
          content: XML,
          data: null,
          metadata: {},
        },
      },
    ] as TypedStreamEvent[];
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await act(async () => {
      root.render(
        <StreamAwareChatMarkdown
          events={events}
          isStreamActive
          hideCopyButton
        />,
      );
    });

    expect(
      container
        .querySelector('[data-block-type="code"]')
        ?.getAttribute("data-language"),
    ).toBe("xml");
    logSpy.mockRestore();
  });
});

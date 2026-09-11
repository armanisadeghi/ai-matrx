import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let mockDbSegments: Array<Record<string, unknown>> = [];
let mockReduxState: Record<string, unknown> = {
  activeRequests: { byRequestId: {} },
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(mockReduxState),
  // useRetainRequestForViewer (StreamAwareChatMarkdown) dispatches retention
  // actions on mount; a noop dispatch keeps this render-path test focused on
  // rendering.
  useAppDispatch: () => () => undefined,
}));

jest.mock(
  "@/features/agents/redux/execution-system/messages/messages.selectors",
  () => ({
    selectMessageInterleavedContent: () => () => mockDbSegments,
  }),
);

// XmlBlock imports the MarkdownCore front door in production. Replace only
// Next's dynamic boundary with its real implementation so these assertions
// exercise react-markdown + GFM, rather than testing next/dynamic.
jest.mock("@/components/markdown-core/MarkdownCore", () => {
  const actual = jest.requireActual(
    "@/components/markdown-core/MarkdownCoreImpl",
  ) as typeof import("@/components/markdown-core/MarkdownCoreImpl");
  return { __esModule: true, default: actual.default };
});

jest.mock("../internal-handlers/SafeBlockRenderer", () => {
  const react = jest.requireActual("react") as typeof React;
  const XmlBlock = jest.requireActual(
    "@/components/mardown-display/blocks/xml/XmlBlock",
  ).default as React.ComponentType<{ content: string; language?: string }>;
  return {
    // EnhancedChatMarkdown's ingress/sequencing seam is the subject here.
    // Block dispatch has its own direct tests; keep non-XML blocks lightweight,
    // but render XML through the real XmlBlock and MarkdownCore implementation.
    SafeBlockRenderer: ({
      block,
    }: {
      block: { type: string; content: string; language?: string };
    }) => {
      const attrs = {
        "data-mtx-ctx": "block",
        "data-block-type": block.type,
        "data-language": block.language,
      };
      if (block.type === "code" && block.language === "xml") {
        return react.createElement(
          "div",
          attrs,
          react.createElement(XmlBlock, {
            content: block.content,
            language: block.language,
          }),
        );
      }
      return react.createElement("div", attrs, block.content);
    },
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
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

// Controlled guard fixture: generic wrappers must retain author Markdown
// semantics instead of downgrading the XML body to literal/XML-token text.
const XML = `<custom_response>
**Strong result** with \`inline_code\`

| Name | Score |
| --- | ---: |
| Ada | 42 |
</custom_response>`;

function expectRichXmlFallback(container: HTMLElement) {
  const xmlBlock = container.querySelector('[data-block-type="code"]');
  expect(xmlBlock?.getAttribute("data-language")).toBe("xml");
  expect(xmlBlock?.getAttribute("data-mtx-ctx")).toBe("block");
  expect(xmlBlock?.querySelector("strong")?.textContent).toBe("Strong result");
  expect(xmlBlock?.querySelector("code")?.textContent).toBe("inline_code");
  expect(xmlBlock?.querySelector("table")).not.toBeNull();
}

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
    mockReduxState = { activeRequests: { byRequestId: {} } };
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

    expectRichXmlFallback(container);
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

    expectRichXmlFallback(container);
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

    expectRichXmlFallback(container);
  });

  it("renders XML and its table from actual accumulator output through Redux", async () => {
    const latest = new Map<string, RenderBlockPayload>();
    const accumulator = new StreamBlockAccumulator("redux-xml", payload => {
      latest.set(payload.block.blockId, payload.block);
      return payload;
    });
    const dispatch = (action: unknown) => action;
    for (let offset = 0; offset < XML.length; offset += 7) {
      accumulator.ingest(XML.slice(offset, offset + 7), dispatch);
    }
    accumulator.finalize(dispatch);
    mockReduxState = {
      activeRequests: {
        byRequestId: {
          "redux-xml": {
            renderBlockOrder: [...latest.keys()],
            renderBlocks: Object.fromEntries(latest),
            editedText: null,
            timeline: [],
            isTextStreaming: false,
            isReasoningStreaming: false,
            activeOperations: {},
            completedOperations: {},
          },
        },
      },
    };

    await act(async () => {
      root.render(
        <EnhancedChatMarkdownInternal
          requestId="redux-xml"
          content=""
          hideCopyButton
        />,
      );
    });

    expectRichXmlFallback(container);
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
      { event: "chunk", data: { text: "**Strong result** with `inline_code`\n\n" } },
      { event: "chunk", data: { text: "| Name | Score |\n| --- | ---: |\n| Ada | 42 |\n" } },
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

    expectRichXmlFallback(container);
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

    expectRichXmlFallback(container);
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

    expectRichXmlFallback(container);
    logSpy.mockRestore();
  });
});

/**
 * FORCING FUNCTION (claim 10): a long RELOADED agent answer that carries a
 * thinking or tool part mounts progressively and waits for the scroll, exactly
 * like a plain one.
 *
 * THE FINDING (2026-09-28): such an answer renders segment by segment
 * (hasDbInterleavedSpecial), and that path mounted every text block at once —
 * the progressive budget only covered the plain path. Real agent answers carry
 * thinking, so mount-on-scroll never triggered on one (conversation 481275cb:
 * text + thinking). Now the segment path spends the same budget and shows the
 * same "Showing N of M blocks" sentinel, and the doc root reports both counts.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

let rendered = 0;
let SEGMENTS: Array<{ type: string; content: string }> = [];

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (value: unknown) => unknown) =>
    selector({
      activeRequests: { byRequestId: {} },
      conversations: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      messages: { byId: {}, byConversationId: {} },
      observability: { toolCalls: {} },
    }),
  useAppDispatch: () => () => undefined,
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors"),
  selectMessageInterleavedContent: () => () => SEGMENTS,
}));
jest.mock("next/dynamic", () => ({ __esModule: true, default: () => () => null }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }));
jest.mock("@ai-matrx/rich-content/display/chat-markdown/internal-handlers/SafeBlockRenderer", () => ({
  SafeBlockRenderer: (props: { block: { type: string } }) => {
    if (props.block.type !== "reasoning") rendered++;
    return null;
  },
}));
jest.mock("@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor", () => ({ __esModule: true, default: () => null }));
jest.mock("@ai-matrx/chat/ui/markdown-stream/useBoundAgentOutputSchema", () => ({ useBoundAgentOutputSchema: () => null }));
jest.mock("@ai-matrx/chat/agents/components/shared/transcript-audience", () => ({ useMachineFramesVisible: () => true }));

import { EnhancedChatMarkdownInternal } from "@ai-matrx/chat/ui/markdown-stream/EnhancedChatMarkdown";
import { PROGRESSIVE_AUTO_LIMIT } from "@ai-matrx/rich-content/display/chat-markdown/progressive-mount";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("a 900-block reloaded answer with thinking stops at the auto limit and waits for the scroll", async () => {
  // Consecutive paragraphs merge into ONE text block, so a block-heavy answer
  // alternates prose and tables: 450 × (text + table) = 900 blocks.
  const answer = Array.from(
    { length: 450 },
    (_, i) =>
      `Kiln load ${i + 1}: cone 6 glaze firing, logged and checked.\n\n` +
      `| Shelf | Pieces | Cone |\n| --- | --- | --- |\n| ${(i % 4) + 1} | ${12 + (i % 7)} | 6 |`,
  ).join("\n\n");
  SEGMENTS = [
    { type: "thinking", content: "Planning the runbook sections before writing." },
    { type: "text", content: answer },
  ];

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EnhancedChatMarkdownInternal content={answer} messageId="m1" conversationId="c1" hideCopyButton allowFullScreenEditor={false} />,
    );
  });
  // Let the automatic slices run (setTimeout + transition per slice).
  for (let i = 0; i < 12; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }

  const docRoot = host.querySelector("[data-matrx-doc-root]");
  const total = Number(docRoot?.getAttribute("data-block-count"));
  const mounted = Number(docRoot?.getAttribute("data-blocks-mounted"));
  expect(total).toBe(900);
  expect(mounted).toBe(PROGRESSIVE_AUTO_LIMIT);

  // The last render mounted exactly the budget — never the whole answer.
  rendered = 0;
  await act(async () => {
    root.render(
      <EnhancedChatMarkdownInternal content={answer} messageId="m1" conversationId="c1" hideCopyButton allowFullScreenEditor={false} />,
    );
  });
  expect(rendered).toBeLessThanOrEqual(PROGRESSIVE_AUTO_LIMIT);

  // And it says so, with the control that loads the rest.
  expect(host.querySelector("[data-progressive-sentinel]")?.textContent).toMatch(
    /Showing 600 of 900 blocks/,
  );
  await act(async () => root.unmount());
  host.remove();
});

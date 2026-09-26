/**
 * FORCING FUNCTION: the INTERLEAVED chat paths (a reloaded answer with thinking
 * and tool calls, rendered segment by segment) obey the unchanged-block law too.
 * Before the chair's round-2 ruling (2026-09-26) only the plain path reused
 * blocks; each segment re-split its text into new objects on every render, so an
 * edit or a re-render of a long answer with a tool call re-rendered every block.
 * Fails on the pre-round-2 EnhancedChatMarkdown (scratch copy).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { technicalReport } from "../__fixtures__/stress-corpus";

type Recorded = Record<string, unknown> & { block: unknown; index: number };
let current: Recorded[] = [];
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
jest.mock("@/features/agents/redux/execution-system/messages/messages.selectors", () => ({
  ...jest.requireActual("@/features/agents/redux/execution-system/messages/messages.selectors"),
  selectMessageInterleavedContent: () => () => SEGMENTS,
}));
jest.mock("next/dynamic", () => ({ __esModule: true, default: () => () => null }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }));
jest.mock("@/components/mardown-display/chat-markdown/internal-handlers/SafeBlockRenderer", () => ({
  SafeBlockRenderer: (props: Recorded) => {
    current.push(props);
    return null;
  },
}));
jest.mock("@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/mardown-display/blocks/json/useBoundAgentOutputSchema", () => ({ useBoundAgentOutputSchema: () => null }));
jest.mock("@/features/agents/components/shared/transcript-audience", () => ({ useMachineFramesVisible: () => true }));

import { EnhancedChatMarkdownInternal } from "@/components/mardown-display/chat-markdown/EnhancedChatMarkdown";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function renderPass(root: ReturnType<typeof createRoot>, answer: string) {
  SEGMENTS = [
    { type: "thinking", content: "Checking the kiln logs before answering." },
    { type: "text", content: answer },
  ];
  current = [];
  await act(async () => {
    root.render(
      <EnhancedChatMarkdownInternal content={answer} messageId="m1" conversationId="c1" hideCopyButton allowFullScreenEditor={false} />,
    );
  });
  const byIndex = new Map<number, Recorded>();
  for (const p of current) byIndex.set(p.index, p);
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

it("a re-render of a reloaded answer with thinking hands every unchanged block the same object", async () => {
  const answer = technicalReport(12, 5);
  const host = document.createElement("div");
  const root = createRoot(host);
  const before = await renderPass(root, answer);
  const after = await renderPass(root, answer);
  expect(before.length).toBeGreaterThan(20);
  const changed = after.filter((p, i) => p.block !== (before[i] as Recorded).block);
  expect(changed.length).toBe(0);
  await act(async () => root.unmount());
});

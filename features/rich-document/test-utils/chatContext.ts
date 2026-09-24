// features/rich-document/test-utils/chatContext.ts
//
// Test-only: a chat-message action context built through the SAME builder the
// /chat bars use (buildChatMessageActions), with every content gate open.

import { getSourceAdapter } from "../actions/sources";
import { buildChatMessageActions } from "../chat/chatMessageActions";
import type { RichDocumentActionContext } from "../types";

/** A message that makes every content-gated action applicable. */
export const RICH_MESSAGE = [
  "Here is the refund policy.",
  "",
  "| Tier | Window |",
  "| --- | --- |",
  "| Gold | 60 days |",
  "",
  "```ts",
  "const ok = true;",
  "```",
  "",
  '{"__kind": "demo.card", "title": "x"}',
].join("\n");

export function chatContext(
  role: "assistant" | "user",
  overrides: Partial<RichDocumentActionContext> = {},
): RichDocumentActionContext {
  const noop = () => {};
  const config = buildChatMessageActions({
    conversationId: "conv-1",
    messageId: "msg-2",
    role,
    messageContent: RICH_MESSAGE,
    metadata: { compaction_group_id: "grp-1" },
    streamRequestId: "req-1",
    contentHistoryCount: 2,
    isCreator: true,
    surfaceKey: "chat-page",
    showFullPrint: true,
    callbacks: {
      onFullPrint: noop,
      onRequestDelete: noop,
      onRequestEditHistory: noop,
      onRequestConvert: noop,
    },
  });
  const adapter = getSourceAdapter(config.source.type);
  return {
    content: config.content,
    source: config.source,
    metadata: config.actions.metadata ?? null,
    dispatch: jest.fn() as never,
    getState: (() => ({
      messages: { byConversationId: {} },
      conversations: { byConversationId: {} },
    })) as never,
    organizationId: "org-1",
    isAuthenticated: true,
    isAdmin: true,
    isCreator: config.actions.isCreator ?? false,
    surfaceKey: config.actions.surfaceKey ?? null,
    onClose: noop,
    instanceKey: (suffix) => `${adapter.instanceKeyPrefix(config.source)}-${suffix}`,
    sourceAdapter: adapter,
    callbacks: config.actions.callbacks,
    extensions: config.actions.extensions,
    ...overrides,
  };
}


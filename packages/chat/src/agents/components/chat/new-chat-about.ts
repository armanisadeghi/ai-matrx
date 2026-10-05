/**
 * "New chat about this" (selection toolbar, on a chat answer): open a fresh
 * chat with the selected passage staged as a comment remark on the answer it
 * came from. The same route hop the Alchemy "chat" destination uses — the
 * default new-chat job, a single-use draft transfer, a fresh session — with the
 * passage carried as a remark (a chip the person can X), never as typed text.
 *
 * "Continue in new chat" on a comment thread is the same door with a THREAD:
 * one comment remark carrying the root comment's id and a snapshot of the
 * thread, handed to the agent that replied there (else the conversation's
 * agent, else the default new-chat agent), and sent at once — the agent takes
 * the thread over. Its replies land in the ORIGINAL thread (same comment id).
 */

import type { ChatDispatch } from "../../../store/root-state";
import { clearFocus } from "../../redux/execution-system/conversation-focus/conversation-focus.slice";
import { bumpFreshSession } from "../../redux/chat/chat-route.slice";
import { generateResourceId } from "../../redux/execution-system/utils/ids";
import type { RemarkThreadEntry, StoredRemark } from "../../redux/execution-system/instance-resources/remarks";
import { chatRouteSurfaceKey, getReservedFreshChatHref } from "./begin-fresh-chat";
import { generateConversationId } from "../../redux/execution-system/utils/ids";
import { stashChatDraftTransfer } from "./chat-draft-transfer";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "./chat-quick-actions.config";
import { ensureOrgId } from "../../../host/org";

export interface NewChatPassage {
  quote: string;
  /** The conversation the answer lives in. */
  conversationId: string;
  /** The answer (durable message id). */
  messageId: string;
}

/** The comment remark a passage becomes (empty body: the passage is the point). */
export function passageRemark(passage: NewChatPassage): StoredRemark {
  return {
    resourceId: generateResourceId(),
    coalesceKey: `passage:${passage.messageId}:${passage.quote}`,
    item: {
      kind: "comment",
      target: { conversationId: passage.conversationId, messageId: passage.messageId },
      commentId: null,
      quote: passage.quote,
      body: "",
    },
  };
}

/** A comment thread, as "Continue in new chat" hands it over. */
export interface NewChatThread {
  /** The root comment (platform.comments id). */
  rootCommentId: string;
  /** The answer the thread is on (a chat answer); null for any other record. */
  messageId: string | null;
  /** The conversation that answer lives in. */
  conversationId: string | null;
  /** The passage the root comment is anchored to. */
  quote: string | null;
  /** The root comment's words. */
  body: string;
  /** Every reply after the root, oldest first. */
  replies: RemarkThreadEntry[];
}

/** The ONE comment remark a thread becomes: the root's id, its words, the thread so far. */
export function threadRemark(thread: NewChatThread): StoredRemark {
  return {
    resourceId: generateResourceId(),
    coalesceKey: `thread:${thread.rootCommentId}`,
    item: {
      kind: "comment",
      target: { conversationId: thread.conversationId, messageId: thread.messageId },
      commentId: thread.rootCommentId,
      quote: thread.quote,
      body: thread.body,
      ...(thread.replies.length ? { thread: thread.replies } : {}),
    },
  };
}

export async function openNewChatAbout({
  passage,
  thread,
  agentId,
  identity,
  dispatch,
  navigate,
}: {
  identity: { userId: string | null; organizationId: string | null };
  dispatch: ChatDispatch;
  navigate: (href: string) => void;
  /** The agent to hand it to; absent = the default new-chat agent. */
  agentId?: string | null;
} & ({ passage: NewChatPassage; thread?: undefined } | { thread: NewChatThread; passage?: undefined })): Promise<void> {
  // The person just acted: with no workspace selected, the host asks for one
  // (the default new-chat job depends on it) instead of failing.
  const organizationId = await ensureOrgId(identity.organizationId);
  const { resolveMandate } = await import("../../../mandates/service");
  const mandate = await resolveMandate(DEFAULT_NEW_CHAT_MANDATE_KEY);
  const targetAgentId = agentId || mandate.agentId;
  stashChatDraftTransfer({
    targetAgentId,
    text: "",
    remarks: [thread ? threadRemark(thread) : passageRemark(passage)],
    // A passage waits for the person's words; a thread is handed over and answered at once.
    ...(thread ? { autoSend: true } : {}),
    userId: identity.userId,
    organizationId,
  });
  dispatch(clearFocus(chatRouteSurfaceKey(targetAgentId)));
  dispatch(bumpFreshSession());
  // The new chat's id is reserved NOW: the chip is keyed to it, a reload reopens the
  // same chat with the chip, and no other chat can ever receive it.
  navigate(getReservedFreshChatHref(targetAgentId, mandate.agentId, generateConversationId()));
}

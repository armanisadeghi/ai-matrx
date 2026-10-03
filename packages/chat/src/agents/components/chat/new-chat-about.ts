/**
 * "New chat about this" (selection toolbar, on a chat answer): open a fresh
 * chat with the selected passage staged as a comment remark on the answer it
 * came from. The same route hop the Alchemy "chat" destination uses — the
 * default new-chat job, a single-use draft transfer, a fresh session — with the
 * passage carried as a remark (a chip the person can X), never as typed text.
 */

import type { ChatDispatch } from "../../../store/root-state";
import { clearFocus } from "../../redux/execution-system/conversation-focus/conversation-focus.slice";
import { bumpFreshSession } from "../../redux/chat/chat-route.slice";
import { generateResourceId } from "../../redux/execution-system/utils/ids";
import type { StoredRemark } from "../../redux/execution-system/instance-resources/remarks";
import { chatRouteSurfaceKey } from "./begin-fresh-chat";
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

export async function openNewChatAbout({
  passage,
  identity,
  dispatch,
  navigate,
}: {
  passage: NewChatPassage;
  identity: { userId: string | null; organizationId: string | null };
  dispatch: ChatDispatch;
  navigate: (href: string) => void;
}): Promise<void> {
  // The person just acted: with no workspace selected, the host asks for one
  // (the default new-chat job depends on it) instead of failing.
  const organizationId = await ensureOrgId(identity.organizationId);
  const { resolveMandate } = await import("../../../mandates/service");
  const mandate = await resolveMandate(DEFAULT_NEW_CHAT_MANDATE_KEY);
  stashChatDraftTransfer({
    targetAgentId: mandate.agentId,
    text: "",
    remarks: [passageRemark(passage)],
    userId: identity.userId,
    organizationId,
  });
  dispatch(clearFocus(chatRouteSurfaceKey(mandate.agentId)));
  dispatch(bumpFreshSession());
  navigate("/chat/new");
}

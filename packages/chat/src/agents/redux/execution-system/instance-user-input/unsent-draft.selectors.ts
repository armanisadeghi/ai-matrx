// An unsent composer draft is never discarded by a stray key.
//
// Every shell that holds a composer and closes on Escape (side drawer, side
// panel, full/compact modal, inline result card, code-editor modal) asks this
// one question before closing: does the composer hold something the person
// has not sent yet? If so, Escape is consumed and the shell stays open — the
// X still closes, because that is an explicit act. Champions: Slack, Linear
// and ChatGPT never throw an unsent draft away on Escape.
//
// Found live 2026-10-02 (/notes → AI Actions → a side-drawer shortcut): the
// note picker closed itself, the person pressed Escape to dismiss it, and the
// drawer closed with the typed text and two attachments in it.

import type { ChatRootState } from "../../../../store/root-state";
import { selectHasUnsentResources } from "../instance-resources/instance-resources.selectors";

/**
 * True when the composer for this conversation holds unsent work: typed text
 * that is not the message just submitted, or an attachment not yet sent.
 * Returns a primitive — stable for `useAppSelector`.
 */
export const selectHasUnsentComposerDraft =
  (conversationId: string) =>
  (state: ChatRootState): boolean => {
    if (!conversationId) return false;
    const entry = state.instanceUserInput.byConversationId[conversationId];
    const text = entry?.text ?? "";
    const hasUnsentText =
      text.trim().length > 0 && text !== (entry?.lastSubmittedText ?? "");
    return hasUnsentText || selectHasUnsentResources(conversationId)(state);
  };

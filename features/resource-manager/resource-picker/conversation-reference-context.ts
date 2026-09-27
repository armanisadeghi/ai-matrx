/**
 * Referencing one of my chats from a composer — the ONE writer.
 *
 * A reference is a RESOURCE, not prose in the person's message (THE USER-INPUT
 * LAW — Arman, 2026-08-18), so it rides as the `referenced_conversations`
 * context entry. The formatted mention keeps the id unambiguous for the agent
 * (`ctx_get`); picks accumulate rather than overwrite. Shared by the resource
 * picker's Conversations view and the ⌘K bar's "Attach to this chat".
 */

import type { Dispatch } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { selectInstanceContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import {
  formatConversationReference,
  type ConversationReferenceRow,
} from "./ConversationReferencePicker";

export const CONVERSATION_REFERENCES_CONTEXT_KEY = "referenced_conversations";

export function appendConversationReference(
  dispatch: Dispatch,
  getState: () => RootState,
  conversationId: string,
  conversation: ConversationReferenceRow,
): void {
  const existing = selectInstanceContextEntry(
    conversationId,
    CONVERSATION_REFERENCES_CONTEXT_KEY,
  )(getState());
  const priorMentions = Array.isArray(existing?.value)
    ? (existing.value as string[])
    : [];
  const mention = formatConversationReference(conversation);
  if (priorMentions.includes(mention)) return;
  dispatch(
    setContextEntries({
      conversationId,
      entries: [
        {
          key: CONVERSATION_REFERENCES_CONTEXT_KEY,
          value: [...priorMentions, mention],
          type: "json",
          label: "Referenced conversations",
        },
      ],
    }),
  );
}

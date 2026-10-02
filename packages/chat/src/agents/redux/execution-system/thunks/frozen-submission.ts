/**
 * THE SEND IS FROZEN AT THE KEYPRESS (2026-10-01, conversation 12084ef6…).
 *
 * A person typed line A, pressed Enter, typed line B and pressed Enter a few
 * seconds later. Only B was ever sent; A had no row anywhere and nothing on
 * screen said so. The send read the composer AFTER its awaits (organization
 * gate, live-page refresh, context rules): by the time the first dispatch
 * read it, the box held B — the box only HIDES the submitted text while it is
 * pending, so typing B replaced A in the store. The second dispatch was then
 * refused as a duplicate of the first.
 *
 * So what a send carries is captured synchronously, at the moment of submit,
 * into a `FrozenSubmission`, and every later reader (the request assembler,
 * the optimistic bubble, the queue) reads THAT — never the live composer.
 * `captureSubmission` is also how the assemblers read the composer when no
 * submission is handed to them, so there is exactly one reading of "what the
 * person is sending".
 */

import type { RootState } from "@host/lib/redux/store";
import type {
  AssembledAgentStartRequest,
  UserInputPart,
} from "../../../types/request.types";
import {
  messagePartToUserInputPart,
  selectEditorResourceXml,
  selectResourcePayloads,
} from "../instance-resources/instance-resources.selectors";

export interface FrozenSubmission {
  /** What the person typed — verbatim, never trimmed. */
  text: string;
  /** Structured parts the composer carried (already in request shape). */
  messageParts: UserInputPart[];
  /** Ready attachments, in request shape. */
  resources: UserInputPart[];
  /** Ids of every resource present at submit (the `markResourcesSubmitted` set). */
  resourceIds: string[];
  /** Editor pills, serialized — appended after the typed text. */
  editorResourceXml: string;
  /** The variable values the person had when they pressed send. */
  userValues: Record<string, unknown>;
}

export function captureSubmission(
  state: RootState,
  conversationId: string,
): FrozenSubmission {
  const entry = state.instanceUserInput?.byConversationId[conversationId];
  return {
    text: entry?.text ?? "",
    messageParts: (entry?.messageParts ?? []).map(messagePartToUserInputPart),
    resources: [...selectResourcePayloads(conversationId)(state)],
    resourceIds: Object.keys(
      state.instanceResources?.byConversationId[conversationId] ?? {},
    ),
    editorResourceXml: selectEditorResourceXml(conversationId)(state) ?? "",
    userValues: {
      ...(state.instanceVariableValues?.byConversationId[conversationId]
        ?.userValues ?? {}),
    },
  };
}

/** True when the submission carries nothing a person sent. */
export function isEmptySubmission(submission: FrozenSubmission): boolean {
  return (
    submission.text.trim().length === 0 &&
    submission.messageParts.length === 0 &&
    submission.resources.length === 0 &&
    submission.editorResourceXml.length === 0
  );
}

/** `user_input` for the agent path, exactly as the request carries it. */
export function agentUserInputFromSubmission(
  submission: FrozenSubmission,
): AssembledAgentStartRequest["user_input"] {
  const { text, messageParts, resources, editorResourceXml } = submission;
  // Editor pills round-trip via XML appended after the typed text — never
  // prepended: the person's prose leads the message.
  const textInput = editorResourceXml
    ? text
      ? `${text}\n\n${editorResourceXml}`
      : editorResourceXml
    : text;
  if (resources.length > 0 || messageParts.length > 0) {
    const parts: UserInputPart[] = [];
    if (textInput) parts.push({ type: "text", text: textInput });
    parts.push(...messageParts, ...resources);
    return parts;
  }
  return textInput || undefined;
}

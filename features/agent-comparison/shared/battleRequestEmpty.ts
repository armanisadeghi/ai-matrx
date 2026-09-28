/**
 * THE ONE "is there anything to send" CHECK for every Agent Battle mode.
 *
 * Bug this closes: Submit all on an empty shared request fired the run
 * anyway and Anthropic rejected it server-side (/agents/battle/model,
 * reported 2026-09-27). Every mode's Submit derives "empty" from here —
 * never from the text box alone — so a fix to one class fixes all seven.
 *
 * A conversation is empty when its typed message is blank AND it carries no
 * ready attachments AND its agent defines no visible form fields. The third
 * condition is the deliberate exception: a form-driven agent (its variables
 * fill the prompt, e.g. the feedback-triage agents) needs no typed message —
 * see `emptyStateInstruction`'s FILL_FORM_INSTRUCTION for the same concept
 * used to word the empty-state screen. Submitting that agent with a blank
 * composer is correct, not empty.
 */

import type { RootState } from "@/lib/redux/store";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { selectResourcePayloads } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { selectVisibleInputDefinitions } from "@/features/agents/redux/execution-system/instance-variable-values/bound-variable.selectors";

export function isConversationRequestEmpty(
  state: RootState,
  conversationId: string | null | undefined,
): boolean {
  if (!conversationId) return true;
  const text = selectUserInputText(conversationId)(state).trim();
  if (text.length > 0) return false;
  const resources = selectResourcePayloads(conversationId)(state);
  if (resources.length > 0) return false;
  const formFields = selectVisibleInputDefinitions(conversationId)(state);
  if (formFields.length > 0) return false;
  return true;
}

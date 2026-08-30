import type { RootState } from "@/lib/redux/store";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

/**
 * Return the organization that owns an AI execution request.
 *
 * An existing conversation's durable organization wins. A brand-new
 * conversation uses the organization the person explicitly selected in the
 * app. The personal organization is deliberately NOT a fallback here: no
 * selection means no request.
 */
/**
 * Resolve the execution organization, ASKING when there is nothing to resolve.
 *
 * The interactive twin of `requireExecutionOrganizationId`. That function is
 * right to refuse — "no selection means no request" — but on its own it ends
 * the person's action with an instruction to go do something else and start
 * over. This turns the refusal into a question whose answer continues the very
 * thing they were doing.
 *
 * It only ever asks in ONE situation: a conversation the server has not yet
 * confirmed (`cacheOnly`), with no organization from a launcher and none
 * selected in the app. A persisted conversation owns its organization forever
 * and is never asked about; neither is a launcher that supplied one.
 *
 * Returns the organization id, or `null` when it could not be resolved without
 * asking and asking was not possible (SSR, tests, no picker mounted). `null`
 * means "carry on to `requireExecutionOrganizationId`", which owns the
 * execution-specific refusal message — this function never competes with it.
 *
 * Throws ONLY `OrganizationSelectionCancelled`, when the person actively
 * declines. Callers must treat that as "nothing happened".
 */
export async function ensureExecutionOrganization(
  state: RootState,
  conversationId: string,
): Promise<string | null> {
  // An explicit org from an entity-bound/headless launcher, or the durable org
  // of an already-persisted conversation, is authoritative — never a question.
  const declared =
    state.conversations.byConversationId[conversationId]?.organizationId ??
    undefined;

  const {
    ensureOrganizationContext,
    isOrganizationSelectionCancelled: cancelled,
  } = await import("@/lib/organization/organization-gate");

  try {
    return await ensureOrganizationContext({ organizationId: declared });
  } catch (error) {
    if (cancelled(error)) throw error;
    // Could not ask. Leave the refusal to the synchronous guard so the person
    // still gets the sentence written for this surface rather than the
    // transport kernel's generic one.
    return null;
  }
}

export function requireExecutionOrganizationId(
  state: RootState,
  conversationId: string,
): string {
  const instance = state.conversations.byConversationId[conversationId];
  if (!instance) {
    // access-errors: ok — browser-local Redux lookup; the instance is absent from the loaded store, no record read involved
    throw new Error(`Conversation ${conversationId} not found.`);
  }

  // cacheOnly is true until the server confirms the conversation. An explicit
  // org supplied by an entity-bound/headless launcher is authoritative; an
  // ordinary chat shell has none and must use the live explicit picker.
  if (instance.cacheOnly !== false) {
    const startOrganizationId =
      instance.organizationId ?? selectOrganizationId(state);
    if (startOrganizationId) return startOrganizationId;

    throw new Error(
      "Select an organization before sending this message. The request was not sent.",
    );
  }

  // Once persisted, the conversation row owns its organization forever. A
  // changed sidebar selection must not move the conversation between tenants.
  const organizationId = instance.organizationId;

  if (!organizationId) {
    throw new Error(
      "This conversation has no organization. Reload it before sending another message.",
    );
  }

  return organizationId;
}

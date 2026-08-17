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
export function requireExecutionOrganizationId(
  state: RootState,
  conversationId: string,
): string {
  const instance = state.conversations.byConversationId[conversationId];
  if (!instance) {
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

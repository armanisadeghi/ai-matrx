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
  const organizationId =
    state.conversations.byConversationId[conversationId]?.organizationId ??
    selectOrganizationId(state);

  if (!organizationId) {
    throw new Error(
      "Select an organization before sending this message. The request was not sent.",
    );
  }

  return organizationId;
}

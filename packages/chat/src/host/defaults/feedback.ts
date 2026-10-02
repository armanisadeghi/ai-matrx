/**
 * Default feedback port (P22): files one row in the platform's central triage
 * table `users.user_feedback` through the host's own authenticated client, so
 * RLS checks the person and the organization they named — the same row the
 * app's `submitFeedback` action writes, minus its admin-only extras (category,
 * assignee), which a surface agent never sets.
 */

import type {
  ChatDb,
  ChatFeedbackPort,
  ChatIdentityPort,
} from "../contract";

export function createDbFeedback(
  db: ChatDb,
  identity: () => ChatIdentityPort,
): ChatFeedbackPort {
  return {
    async submit(input) {
      const person = identity().current();
      if (!person.isAuthenticated || !person.userId) {
        return { success: false, error: "User not authenticated" };
      }
      const organizationId = input.organization_id?.trim() ?? "";
      if (!organizationId) {
        return {
          success: false,
          error:
            "Select an organization before sending feedback — every report is filed under one organization.",
        };
      }
      const { data, error } = await db
        .schema("users")
        .from("user_feedback")
        .insert({
          organization_id: organizationId,
          user_id: person.userId,
          created_by: person.userId,
          username: person.email ?? person.displayName ?? "Anonymous",
          feedback_type: input.feedback_type,
          route: input.route,
          description: input.description,
          image_file_ids: input.image_file_ids ?? [],
          status: "new",
          metadata: input.metadata ?? {},
        })
        .select("id")
        .single();
      if (error) return { success: false, error: error.message };
      const id = (data as { id?: unknown } | null)?.id;
      return typeof id === "string"
        ? { success: true, data: { id } }
        : { success: false, error: "no row came back" };
    },
  };
}

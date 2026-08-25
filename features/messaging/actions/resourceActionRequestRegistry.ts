/**
 * Executable resource-action registry. Message JSON names a stable action;
 * this module binds it to a canonical write path. The durable inbox row is
 * re-resolved before this executes, and every write re-checks authority.
 */

import { createClient } from "@/utils/supabase/client";

interface ResourceActionRequestAction {
  label: string;
  completedLabel: string;
  confirmTitle: (name: string) => string;
  confirmDescription: string;
  execute: (context: {
    resourceType: string;
    resourceId: string;
  }) => Promise<void>;
}

async function deleteResource(context: {
  resourceType: string;
  resourceId: string;
}): Promise<void> {
  if (context.resourceType === "web_site") {
    const [{ listActiveCrawlSessions, deleteSite }, { cancelCrawl }] =
      await Promise.all([
        import("@/features/marketing/data/service"),
        import("@/features/marketing/crawler/direct-client"),
      ]);
    const activeSessions = await listActiveCrawlSessions(context.resourceId);
    for (const session of activeSessions) {
      await cancelCrawl(session.id);
    }
    await deleteSite(context.resourceId);
    return;
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("entity_soft_delete", {
    p_token: context.resourceType,
    p_id: context.resourceId,
  });
  if (error) throw error;
  if (!data) throw new Error("The item could not be deleted.");
}

const ACTIONS: Record<string, ResourceActionRequestAction> = {
  delete: {
    label: "Delete item",
    completedLabel: "Item deleted",
    confirmTitle: (name) => `Delete ${name}?`,
    confirmDescription:
      "This carries out the request immediately. The item moves to trash and disappears from its lists.",
    execute: deleteResource,
  },
};

export function getResourceActionRequestAction(
  key: string,
): ResourceActionRequestAction | null {
  return ACTIONS[key] ?? null;
}

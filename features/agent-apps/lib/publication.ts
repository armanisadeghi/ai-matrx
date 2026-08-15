import type { Database } from "@/types/database.types";
import type { AppStatus } from "@/features/agent-apps/types";

type AgentAppUpdate = Database["app"]["Tables"]["definition"]["Update"];

export interface AgentAppPublicationPatch {
  status: AppStatus;
  visibility: Database["platform"]["Enums"]["visibility"];
  published_at: string | null;
}

type _PublicationPatchFitsDatabase =
  AgentAppPublicationPatch extends Pick<
    AgentAppUpdate,
    "status" | "visibility" | "published_at"
  >
    ? true
    : false;
declare const publicationPatchFitsDatabase: _PublicationPatchFitsDatabase;
true satisfies typeof publicationPatchFitsDatabase;

/**
 * The one publication transition for Agent Apps. A public link is live only
 * when status and visibility agree, so callers must never write either field
 * independently when the user's intent is Publish/Unpublish.
 */
export function agentAppPublicationPatch(
  published: boolean,
  publishedAt = new Date().toISOString(),
): AgentAppPublicationPatch {
  return published
    ? {
        status: "published",
        visibility: "public",
        published_at: publishedAt,
      }
    : {
        status: "draft",
        visibility: "internal",
        published_at: null,
      };
}

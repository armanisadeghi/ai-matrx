/**
 * Add / remove an association on a topic through THE registered path
 * (`associationsService` → `assoc_add` / `assoc_remove`; the
 * `canonical-associations` skill). No other file in this lane touches an edge.
 *
 * DIRECTION is the registry's, not ours: `seo.map_topic_associations` reports
 * each edge's `direction` relative to the topic (`in` = the other thing points
 * AT the topic, `out` = the topic points at it), and a remove sends the edge
 * back exactly the way it was read. A NEW edge is written little → big with
 * the topic as the TARGET (a page, a note, a document is attached TO a topic);
 * `trg_associations_auto_orient` refuses a wrong-way write of a registered
 * pair with a sentence naming the canonical direction, and that sentence is
 * what the person sees.
 */

import { associationsService } from "@/features/scopes/service/associationsService";
import type { ScopesRpcResult } from "@/features/scopes/types";

import type { MapTopicAssociationDirection } from "../types";

export const SEO_MAP_TOPIC_TOKEN = "seo_map_topic";

function unwrap<T>(result: ScopesRpcResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.message} (${result.error.code})`);
  }
  return result.data;
}

export async function attachToTopic(args: {
  topicId: string;
  token: string;
  id: string;
  organizationId: string | null;
}): Promise<void> {
  unwrap(
    await associationsService.add({
      sourceType: args.token,
      sourceId: args.id,
      // The package's target union is the registry's; the topic token is in it,
      // and the guard at the call site refuses a token that is not.
      targetType: SEO_MAP_TOPIC_TOKEN as Parameters<typeof associationsService.add>[0]["targetType"],
      targetId: args.topicId,
      ...(args.organizationId ? { orgId: args.organizationId } : {}),
    }),
  );
}

export async function detachFromTopic(args: {
  topicId: string;
  token: string;
  id: string;
  direction: MapTopicAssociationDirection;
  role?: string;
}): Promise<void> {
  const edge =
    args.direction === "in"
      ? { sourceType: args.token, sourceId: args.id, targetType: SEO_MAP_TOPIC_TOKEN, targetId: args.topicId }
      : { sourceType: SEO_MAP_TOPIC_TOKEN, sourceId: args.topicId, targetType: args.token, targetId: args.id };
  unwrap(
    await associationsService.remove({
      ...edge,
      ...(args.role ? { role: args.role } : {}),
    }),
  );
}

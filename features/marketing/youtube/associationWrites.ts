/**
 * The `covers` edge: a video on the owned channel covers a topic on the brand's
 * topical map, so watch time and organic clicks land on one row (PLAN §4.11).
 *
 * The pair is REGISTERED and live — aidream migration 0767 inserts
 * `platform.association_types (source_type 'web_youtube_video', target_type
 * 'seo_map_topic', label 'covers', container_side 'target',
 * conveys_max 'editor')` — and it is written through THE one chokepoint
 * (`associationsService.add` → `assoc_add`), never a table write.
 *
 * 🚨 THE CAST IS THE SANCTIONED PRECEDENT, NOT A NEW ONE. `@ai-matrx/associations`
 * types `add()`'s TARGET against `ASSOCIATION_TARGET_TYPES`, a curated container
 * union that carries neither `seo_map_topic` nor `web_youtube_video`; the RUNTIME
 * guard checks canonical `platform.entity_types` tokens, which both are. The
 * topical map's own panel already carries exactly this cast with its reason at
 * `features/marketing/seo/topical-map/panel/associationWrites.ts:38-46`, and
 * ruling R26 named the class (the same union is why the calendar note edge runs
 * event→note). Widening the union is a PACKAGE change under THE SAME-SESSION
 * LAW, filed as F-65 — this lane copies the precedent and does not invent a
 * second one, and does not widen the union here.
 *
 * DIRECTION is the registry's: the video is the SOURCE and the topic the
 * TARGET (`container_side: 'target'`), which is also the direction the topical
 * map's panel reads its edges in and the direction `trg_associations_auto_orient`
 * will enforce with a sentence naming the canonical way round.
 */

import { associationsService } from "@/features/scopes/service/associationsService";
import type { ScopesRpcResult } from "@/features/scopes/types";

import { YOUTUBE_VIDEO_TYPE } from "./record";

/** The topical map's live topic token (`seo.map_topic`). */
export const SEO_MAP_TOPIC_TOKEN = "seo_map_topic";
/** The registered role on the pair. */
export const COVERS_ROLE = "covers";

function unwrap<T>(result: ScopesRpcResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.message} (${result.error.code})`);
  }
  return result.data;
}

type TargetTypeArg = Parameters<typeof associationsService.add>[0]["targetType"];
type SourceTypeArg = Parameters<typeof associationsService.add>[0]["sourceType"];

export async function attachVideoToTopic(args: {
  videoId: string;
  topicId: string;
  organizationId: string | null;
}): Promise<void> {
  unwrap(
    await associationsService.add({
      sourceType: YOUTUBE_VIDEO_TYPE as unknown as SourceTypeArg,
      sourceId: args.videoId,
      targetType: SEO_MAP_TOPIC_TOKEN as unknown as TargetTypeArg,
      targetId: args.topicId,
      role: COVERS_ROLE,
      ...(args.organizationId ? { orgId: args.organizationId } : {}),
    }),
  );
}

export async function detachVideoFromTopic(args: {
  videoId: string;
  topicId: string;
}): Promise<void> {
  unwrap(
    await associationsService.remove({
      sourceType: YOUTUBE_VIDEO_TYPE as unknown as SourceTypeArg,
      sourceId: args.videoId,
      targetType: SEO_MAP_TOPIC_TOKEN as unknown as TargetTypeArg,
      targetId: args.topicId,
      role: COVERS_ROLE,
    }),
  );
}

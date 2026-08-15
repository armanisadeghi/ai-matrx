/**
 * video-metadata.ts — the pure reader for the metadata block the Marketing
 * Video Metadata Writer persists onto `web.brand_asset.data.video_metadata`.
 *
 * It lives apart from the component because it is the gate the PAID data has
 * to pass to be visible at all (D150 P0): the agent writes a title, a
 * description, a keyword list and a schema.org VideoObject, the column is
 * free-form JSON, and a reader that is wrong about the shape silently renders
 * "no metadata yet" over data the user bought. Pure, so it is testable —
 * `video-metadata.test.ts`.
 */

import { isJsonRecord } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";

export interface VideoMetadataView {
  title: string | null;
  description: string | null;
  keywords: string[];
  schemaOrg: Json | null;
  generatedAt: string | null;
}

/** Null when the asset carries no metadata block at all. */
export function readVideoMetadata(data: Json): VideoMetadataView | null {
  if (!isJsonRecord(data)) return null;
  const block = data.video_metadata;
  if (!isJsonRecord(block)) return null;
  return {
    title: typeof block.title === "string" ? block.title : null,
    description:
      typeof block.description === "string" ? block.description : null,
    keywords: Array.isArray(block.keywords)
      ? block.keywords.filter((k): k is string => typeof k === "string")
      : [],
    schemaOrg: isJsonRecord(block.schema_org) ? block.schema_org : null,
    generatedAt:
      typeof block.generated_at === "string" ? block.generated_at : null,
  };
}

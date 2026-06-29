import type { Json } from "@/types/database.types";

/** Narrows JSONB metadata to a plain object safe for spread merges. */
export function metadataAsObject(
  metadata: Json | null | undefined,
): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Record<string, unknown>;
}

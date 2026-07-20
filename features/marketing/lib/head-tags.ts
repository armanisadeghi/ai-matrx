import type { Json } from "@/types/database.types";
import { isJsonRecord } from "@/features/marketing/types";

export interface ParsedSnapshotHeadTags {
  title: string | null;
  metaDescription: string | null;
}

/** Normalize scraper-persisted `web.snapshot.head_tags` into display fields. */
export function parseSnapshotHeadTags(headTags: Json): ParsedSnapshotHeadTags {
  if (!isJsonRecord(headTags)) {
    return { title: null, metaDescription: null };
  }

  const title =
    typeof headTags.title === "string" && headTags.title.trim()
      ? headTags.title.trim()
      : null;
  const metaDescription =
    typeof headTags.meta_description === "string" &&
    headTags.meta_description.trim()
      ? headTags.meta_description.trim()
      : null;

  return { title, metaDescription };
}

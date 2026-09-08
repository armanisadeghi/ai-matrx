import { isUuidShape } from "@ai-matrx/kit/uuid";

export interface FeedbackScreenshotFields {
  image_file_ids?: string[] | null;
  image_urls?: string[] | null;
}

/**
 * Canonical feedback screenshot references. New records are file IDs. URLs
 * are appended only for historical rows created before identity persistence.
 */
export function getFeedbackScreenshotRefs(
  fields: FeedbackScreenshotFields,
): string[] {
  return Array.from(
    new Set([...(fields.image_file_ids ?? []), ...(fields.image_urls ?? [])]),
  );
}

export function feedbackScreenshotHref(ref: string): string {
  return isUuidShape(ref) ? `/files/f/${encodeURIComponent(ref)}` : ref;
}


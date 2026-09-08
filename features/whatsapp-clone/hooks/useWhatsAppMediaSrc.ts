"use client";

/**
 * A URL for a WhatsApp-skin bubble's media.
 *
 * Mock messages carry a plain `url`; live ones carry a durable `fileId` and the
 * URL is resolved from it through the canonical asset path — because a signed
 * URL expires and an identity does not.
 */

import { useFileAsset } from "@/features/files/hooks/useFileAsset";
import type { WAMediaPayload } from "../types";

export function useWhatsAppMediaSrc(
  media: WAMediaPayload | null | undefined,
): string | null {
  const { primaryUrl } = useFileAsset(media?.fileId ?? null, {
    enabled: Boolean(media?.fileId) && !media?.url,
  });
  return media?.thumbnailUrl ?? media?.url ?? primaryUrl ?? null;
}

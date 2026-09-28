/**
 * video-metadata-offer-values.ts — pure builder for the `marketing.video_metadata`
 * provision's mapped-only offered values (consumed by generate-video-metadata.ts).
 */

import { compactOfferValues } from "@/features/marketing/lib/offer-values";
import type { MarketingVideoMetadataOffer } from "@/types/python-generated/provision-offers";

/**
 * The REAL facts a caller holds about the video, named exactly as the
 * `marketing.video_metadata` provision declares them. Mapped-only offers
 * (pass_by_name=False): the mandate door drops them unless a binding's
 * consumption map names them, so they never change what a current Holder
 * receives. Absent facts are omitted, never sent empty.
 */
export type VideoMetadataFacts = Partial<
  Pick<
    MarketingVideoMetadataOffer,
    | "video_url"
    | "provider"
    | "provider_video_id"
    | "embedded_on_paths"
    | "published_at"
    | "duration"
    | "channel_title"
    | "view_count"
    | "existing_title"
    | "existing_notes"
    | "site_name"
    | "site_url"
    | "media_standards_notes"
  >
>;

export function videoMetadataOfferValues(
  facts: VideoMetadataFacts | undefined,
): VideoMetadataFacts {
  if (!facts) return {};
  return compactOfferValues({
    video_url: facts.video_url,
    provider: facts.provider,
    provider_video_id: facts.provider_video_id,
    embedded_on_paths: facts.embedded_on_paths,
    published_at: facts.published_at,
    duration: facts.duration,
    channel_title: facts.channel_title,
    view_count: facts.view_count,
    existing_title: facts.existing_title,
    existing_notes: facts.existing_notes,
    site_name: facts.site_name,
    site_url: facts.site_url,
    media_standards_notes: facts.media_standards_notes,
  } satisfies VideoMetadataFacts);
}

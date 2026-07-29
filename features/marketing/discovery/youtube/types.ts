import type { components } from "@/types/python-generated/api-types";
import type { Database } from "@/types/database.types";
import { z } from "zod";

export type YouTubeSearchRequest =
  components["schemas"]["YouTubeSearchRequest"];
export type YouTubeSearchPage = components["schemas"]["YouTubeSearchPage"] & {
  search_id?: string | null;
};
export type YouTubeVideoCandidate =
  components["schemas"]["YouTubeVideoCandidate"];
export type YouTubeVideoLibraryRecord =
  components["schemas"]["YouTubeVideoLibraryRecord"];
export type ProcessYouTubeVideosResponse =
  components["schemas"]["ProcessYouTubeVideosResponse"];
export type YouTubeSearchHistoryRow =
  Database["research"]["Tables"]["youtube_search"]["Row"];

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

const youtubeVideoCandidateSchema = z.object({
  video_id: z.string(),
  url: z.string(),
  title: z.string(),
  description: z.string().optional(),
  published_at: nullableString,
  channel_id: nullableString,
  channel_title: nullableString,
  thumbnail_url: nullableString,
  duration: nullableString,
  view_count: nullableNumber,
  like_count: nullableNumber,
  comment_count: nullableNumber,
  channel_subscriber_count: nullableNumber,
  channel_video_count: nullableNumber,
  tags: z.array(z.string()).optional(),
  topic_categories: z.array(z.string()).optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
  library_id: nullableString,
  processing_status: z.string().optional(),
  enrichment_state: z.record(z.string(), z.unknown()).optional(),
  analysis_available: z.boolean().optional(),
  analysis_fallback_available: z.boolean().optional(),
  is_in_topic: z.boolean().optional(),
  topic_source_id: nullableString,
});

const youtubeSearchPageSchema = z.object({
  search_id: nullableString,
  query: z.string(),
  results: z.array(youtubeVideoCandidateSchema),
  next_page_token: nullableString,
  prev_page_token: nullableString,
  region_code: nullableString,
  total_results: nullableNumber,
  results_per_page: nullableNumber,
});

const youtubeSearchRequestSchema = z.object({
  query: z.string(),
  max_results: z.number().optional(),
  page_token: nullableString,
  order: z
    .enum(["date", "rating", "relevance", "title", "viewCount"])
    .optional(),
  region_code: nullableString,
  relevance_language: nullableString,
  max_results_per_channel: nullableNumber,
  max_duration_minutes: nullableNumber,
  published_after: nullableString,
  published_before: nullableString,
  channel_id: nullableString,
  event_type: z.enum(["completed", "live", "upcoming"]).nullable().optional(),
  topic_id: nullableString,
  location: nullableString,
  location_radius: nullableString,
  video_category_id: nullableString,
  video_caption: z.enum(["any", "closedCaption", "none"]).optional(),
  video_definition: z.enum(["any", "high", "standard"]).optional(),
  video_dimension: z.enum(["any", "2d", "3d"]).optional(),
  video_duration: z.enum(["any", "short", "medium", "long"]).optional(),
  video_embeddable: z.enum(["any", "true"]).optional(),
  video_license: z.enum(["any", "creativeCommon", "youtube"]).optional(),
  video_paid_product_placement: z.enum(["any", "true"]).optional(),
  video_syndicated: z.enum(["any", "true"]).optional(),
  video_type: z.enum(["any", "episode", "movie"]).optional(),
});

export function parseYouTubeSearchPage(
  value: unknown,
): YouTubeSearchPage | null {
  const parsed = youtubeSearchPageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseYouTubeSearchRequest(
  value: unknown,
): YouTubeSearchRequest | null {
  const parsed = youtubeSearchRequestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const DEFAULT_YOUTUBE_SEARCH: YouTubeSearchRequest = {
  query: "",
  max_results: 25,
  max_results_per_channel: 3,
  order: "relevance",
  region_code: "US",
  relevance_language: "en",
  video_caption: "any",
  video_definition: "any",
  video_dimension: "any",
  video_duration: "any",
  video_embeddable: "any",
  video_license: "any",
  video_paid_product_placement: "any",
  video_syndicated: "any",
  video_type: "any",
};

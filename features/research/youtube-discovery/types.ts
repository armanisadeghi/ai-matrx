import type { components } from "@/types/python-generated/api-types";

export type YouTubeSearchRequest =
  components["schemas"]["YouTubeSearchRequest"];
export type YouTubeSearchPage = components["schemas"]["YouTubeSearchPage"];
export type YouTubeVideoCandidate =
  components["schemas"]["YouTubeVideoCandidate"];

export const DEFAULT_YOUTUBE_SEARCH: YouTubeSearchRequest = {
  query: "",
  max_results: 25,
  order: "relevance",
  region_code: "US",
  relevance_language: "en",
  safe_search: "moderate",
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

import type { components } from "@/types/python-generated/api-types";

export type YouTubeSearchRequest =
  components["schemas"]["YouTubeSearchRequest"];
export type YouTubeSearchPage = components["schemas"]["YouTubeSearchPage"];
export type YouTubeVideoCandidate =
  components["schemas"]["YouTubeVideoCandidate"];
export type YouTubeVideoLibraryRecord =
  components["schemas"]["YouTubeVideoLibraryRecord"];
export type ProcessYouTubeVideosResponse =
  components["schemas"]["ProcessYouTubeVideosResponse"];

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

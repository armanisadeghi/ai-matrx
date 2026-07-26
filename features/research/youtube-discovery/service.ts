import { apiPost } from "@/lib/api/typed-client";
import type { YouTubeSearchPage, YouTubeSearchRequest } from "./types";

export async function searchYouTube(
  request: YouTubeSearchRequest,
): Promise<YouTubeSearchPage> {
  const { data } = await apiPost("/research/youtube/search", request);
  return data;
}

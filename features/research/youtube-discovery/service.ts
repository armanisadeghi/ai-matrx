import { apiGet, apiPost, buildPath } from "@/lib/api/typed-client";
import type {
  YouTubeSearchPage,
  YouTubeSearchRequest,
  YouTubeVideoCandidate,
} from "./types";

export async function searchYouTube(
  request: YouTubeSearchRequest,
): Promise<YouTubeSearchPage> {
  const { data } = await apiPost("/research/youtube/search", request);
  return data;
}

export async function getYouTubeVideo(
  videoId: string,
): Promise<YouTubeVideoCandidate> {
  const { data } = await apiGet(
    buildPath("/research/youtube/videos/{video_id}", { video_id: videoId }),
  );
  return data;
}

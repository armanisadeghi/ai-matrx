import { apiGet, apiPost, buildPath } from "@/lib/api/typed-client";
import type {
  ProcessYouTubeVideosResponse,
  YouTubeSearchPage,
  YouTubeSearchRequest,
  YouTubeVideoCandidate,
  YouTubeVideoLibraryRecord,
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

export async function getYouTubeLibraryVideo(
  videoId: string,
): Promise<YouTubeVideoLibraryRecord> {
  const { data } = await apiGet(
    buildPath("/research/youtube/library/{video_id}", { video_id: videoId }),
  );
  return data;
}

export async function processYouTubeVideo(
  videoId: string,
  force = false,
): Promise<ProcessYouTubeVideosResponse> {
  const { data } = await apiPost(
    buildPath("/research/youtube/videos/{video_id}/process", {
      video_id: videoId,
    }),
    { force },
  );
  return data;
}

export async function enrichYouTubeComments(
  videoId: string,
): Promise<YouTubeVideoLibraryRecord> {
  const { data } = await apiPost(
    buildPath("/research/youtube/videos/{video_id}/comments", {
      video_id: videoId,
    }),
    { force: true },
  );
  return data;
}

export async function searchTopicYouTube(
  topicId: string,
  request: YouTubeSearchRequest,
): Promise<YouTubeSearchPage> {
  const { data } = await apiPost(
    buildPath("/research/topics/{topic_id}/youtube/search", {
      topic_id: topicId,
    }),
    request,
  );
  return data;
}

export async function getTopicYouTubeVideos(
  topicId: string,
): Promise<YouTubeVideoLibraryRecord[]> {
  const { data } = await apiGet(
    buildPath("/research/topics/{topic_id}/youtube", { topic_id: topicId }),
  );
  return data;
}

export async function addTopicYouTubeVideos(
  topicId: string,
  videoIds: string[],
  keywordId?: string,
): Promise<YouTubeVideoLibraryRecord[]> {
  const { data } = await apiPost(
    buildPath("/research/topics/{topic_id}/youtube/add", {
      topic_id: topicId,
    }),
    { video_ids: videoIds, keyword_id: keywordId },
  );
  return data;
}

export async function processTopicYouTubeVideos(
  topicId: string,
  videoIds: string[],
  force = false,
): Promise<ProcessYouTubeVideosResponse> {
  const { data } = await apiPost(
    buildPath("/research/topics/{topic_id}/youtube/process", {
      topic_id: topicId,
    }),
    { video_ids: videoIds, force },
  );
  return data;
}

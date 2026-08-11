import { apiGet, apiPost, buildPath } from "@/lib/api/typed-client";
import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";
import type { AppDispatch } from "@/lib/redux/store";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { requireUserId } from "@/utils/auth/getUserId";
import { supabase } from "@/utils/supabase/client";
import type {
  ProcessYouTubeVideosResponse,
  YouTubeSearchPage,
  YouTubeSearchRequest,
  YouTubeVideoCandidate,
  YouTubeVideoLibraryRecord,
} from "./types";
import { parseYouTubeSearchPage, parseYouTubeSearchRequest } from "./types";

export interface YouTubeSearchHistoryEntry {
  id: string;
  query: string;
  request: YouTubeSearchRequest | null;
  page: YouTubeSearchPage | null;
  status: string;
  resultCount: number;
  error: string | null;
  createdAt: string;
}

export interface YouTubeSearchHistoryPage {
  entries: YouTubeSearchHistoryEntry[];
  hasMore: boolean;
}

const SEARCH_HISTORY_PAGE_SIZE = 50;

function mapSearchHistoryRow(row: {
  id: string;
  query: string;
  request: unknown;
  response: unknown;
  status: string;
  result_count: number;
  error: string | null;
  created_at: string;
}): YouTubeSearchHistoryEntry {
  return {
    id: row.id,
    query: row.query,
    request: parseYouTubeSearchRequest(row.request),
    page: parseYouTubeSearchPage(row.response),
    status: row.status,
    resultCount: row.result_count,
    error: row.error,
    createdAt: row.created_at,
  };
}

export async function listYouTubeSearchHistory(
  offset = 0,
): Promise<YouTubeSearchHistoryPage> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("research")
    .from("youtube_search")
    .select("id,query,request,response,status,result_count,error,created_at")
    .eq("created_by", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + SEARCH_HISTORY_PAGE_SIZE);

  if (error) {
    throw new Error(`Could not load YouTube search history: ${error.message}`);
  }

  const rows = data ?? [];
  return {
    entries: rows.slice(0, SEARCH_HISTORY_PAGE_SIZE).map(mapSearchHistoryRow),
    hasMore: rows.length > SEARCH_HISTORY_PAGE_SIZE,
  };
}

export async function getYouTubeSearchHistory(
  searchId: string,
): Promise<YouTubeSearchHistoryEntry | null> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("research")
    .from("youtube_search")
    .select("id,query,request,response,status,result_count,error,created_at")
    .eq("id", searchId)
    .eq("created_by", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Could not load the saved YouTube search: ${error.message}`,
    );
  }
  return data ? mapSearchHistoryRow(data) : null;
}

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

/**
 * Watch a video's analysis run.
 *
 * 🚨 THE FLOATING LAW — this is a multi-minute, multi-step AI run (fetch the
 * video → transcribe → analyze → check claims), and it must be WATCHABLE, not
 * narrated at from behind a spinner. The run is orchestrated SERVER-side inside
 * the pipeline endpoint, so its stream is ADOPTED into `activeRequests`
 * (`adoptForeignStream`) — the caller gets a `requestId` the instant the
 * response lands and renders it through the canonical pipeline
 * (`LiveRunWindow` / `LiveRunDisplay`). The domain `phase` / `info` events
 * still reach `onEvent` for the stage line; content NEVER goes through it.
 */
export async function streamYouTubeVideoAnalysis(
  dispatch: AppDispatch,
  videoId: string,
  force = false,
  options: {
    signal?: AbortSignal;
    onEvent?: (event: TypedStreamEvent) => void;
    /** Fires with the adopted stream's ids before the first chunk is processed. */
    onAdopted?: (ids: { requestId: string; conversationId: string }) => void;
    /** The controller whose signal is also passed as `signal` — arms the watchdog. */
    abortController?: AbortController;
  } = {},
): Promise<void> {
  const consumeStream = dispatch(
    adoptForeignStream({
      onAdopted: options.onAdopted,
      onEvent: options.onEvent,
      abortController: options.abortController,
    }),
  );
  const result = await dispatch(
    callApi({
      path: "/research/youtube/videos/{video_id}/process/stream",
      method: "POST",
      pathParams: { video_id: videoId },
      body: { force },
      stream: true,
      signal: options.signal,
      consumeStream,
    }),
  );
  if (result.error) {
    throw new Error(result.error.message);
  }
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

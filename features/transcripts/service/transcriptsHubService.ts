import { supabase } from "@/utils/supabase/client";
import { HUB_PAGE_SIZE } from "@/features/transcripts/constants/hubSections";
import type {
  CleanupHubItem,
  HubPageResult,
  ProcessorHubItem,
  SessionHubItem,
  UnsortedHubItem,
} from "@/features/transcripts/types/hub";
import type { SessionRow } from "@/features/transcript-studio/service/studioService";
import { rowToSession } from "@/features/transcript-studio/service/studioService";

type LooseSupabase = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};
const db = supabase as unknown as LooseSupabase;

function parseTranscriptMeta(metadata: unknown): {
  duration: number | null;
  wordCount: number | null;
} {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  return {
    duration: typeof meta.duration === "number" ? meta.duration : null,
    wordCount: typeof meta.wordCount === "number" ? meta.wordCount : null,
  };
}

function sessionToHubItem(
  row: SessionRow,
  kind: "session" | "cleanup",
): SessionHubItem | CleanupHubItem {
  const session = rowToSession(row);
  const base = {
    id: session.id,
    title: session.title || "Untitled session",
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
    status: session.status,
    durationMs: session.totalDurationMs,
    transcriptId: session.transcriptId,
  };
  return kind === "cleanup"
    ? { kind: "cleanup", ...base }
    : { kind: "session", ...base };
}

function recordingDurationMs(
  startedAt: string,
  endedAt: string | null,
): number | null {
  if (!endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return ms > 0 ? ms : null;
}

export async function fetchProcessorHubPage(
  page: number,
  pageSize = HUB_PAGE_SIZE,
): Promise<HubPageResult<ProcessorHubItem>> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("transcripts")
    .select(
      "id, title, description, source_type, folder_name, tags, metadata, created_at, updated_at, is_draft",
      { count: "exact" },
    )
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(
      `[transcripts-hub] processor page failed: ${error.message}`,
    );
  }

  const items: ProcessorHubItem[] = (data ?? []).map((row) => {
    const { duration, wordCount } = parseTranscriptMeta(row.metadata);
    return {
      kind: "processor",
      id: row.id,
      title: row.title ?? "Untitled transcript",
      description: row.description ?? "",
      sourceType: row.source_type ?? "other",
      folderName: row.folder_name ?? "Transcripts",
      tags: row.tags ?? [],
      durationSeconds: duration,
      wordCount,
      createdAt: row.created_at ?? "",
      updatedAt: row.updated_at ?? "",
      isDraft: row.is_draft ?? false,
    };
  });

  const total = count ?? items.length;
  return { items, hasMore: from + items.length < total };
}

export async function fetchSessionHubPage(
  page: number,
  pageSize = HUB_PAGE_SIZE,
): Promise<HubPageResult<SessionHubItem>> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await db
    .from("studio_sessions")
    .select("*", { count: "exact" })
    .eq("is_deleted", false)
    .neq("source", "cleanup")
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`[transcripts-hub] session page failed: ${error.message}`);
  }

  const items = ((data ?? []) as SessionRow[]).map((row) =>
    sessionToHubItem(row, "session"),
  ) as SessionHubItem[];

  const total = count ?? items.length;
  return { items, hasMore: from + items.length < total };
}

export async function fetchCleanupHubPage(
  page: number,
  pageSize = HUB_PAGE_SIZE,
): Promise<HubPageResult<CleanupHubItem>> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await db
    .from("studio_sessions")
    .select("*", { count: "exact" })
    .eq("is_deleted", false)
    .eq("source", "cleanup")
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`[transcripts-hub] cleanup page failed: ${error.message}`);
  }

  const items = ((data ?? []) as SessionRow[]).map((row) =>
    sessionToHubItem(row, "cleanup"),
  ) as CleanupHubItem[];

  const total = count ?? items.length;
  return { items, hasMore: from + items.length < total };
}

export async function fetchUnsortedHubPage(
  userId: string,
  page: number,
  pageSize = HUB_PAGE_SIZE,
): Promise<HubPageResult<UnsortedHubItem>> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await db
    .from("studio_recording_segments")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .not("detached_at", "is", null)
    .order("detached_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`[transcripts-hub] unsorted page failed: ${error.message}`);
  }

  const items: UnsortedHubItem[] = (data ?? []).map(
    (row: {
      id: string;
      segment_index: number;
      started_at: string;
      ended_at: string | null;
      detached_at: string | null;
    }) => ({
      kind: "unsorted",
      id: row.id,
      title: `Recording ${row.segment_index + 1}`,
      segmentIndex: row.segment_index,
      durationMs: recordingDurationMs(row.started_at, row.ended_at),
      createdAt: row.started_at,
      updatedAt: row.detached_at ?? row.started_at,
    }),
  );

  const total = count ?? items.length;
  return { items, hasMore: from + items.length < total };
}

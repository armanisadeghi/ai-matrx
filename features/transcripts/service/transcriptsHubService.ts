import { supabase } from "@/utils/supabase/client";
import { HUB_PAGE_SIZE } from "@/features/transcripts/constants/hubSections";
import type {
  CleanupHubItem,
  HubPageResult,
  ProcessorHubItem,
  RecordingHubItem,
  SessionHubItem,
  UnsortedHubItem,
} from "@/features/transcripts/types/hub";
import type { SessionRow } from "@/features/transcript-studio/service/studioService";
import { rowToSession } from "@/features/transcript-studio/service/studioService";

const transcriptsDb = () => supabase.schema("transcripts");

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
    // Filled by enrichSessionMetrics after the page lands; null = not yet loaded.
    recordingCount: null,
    charCount: null,
  };
  return kind === "cleanup"
    ? { kind: "cleanup", ...base }
    : { kind: "session", ...base };
}

/**
 * Enrich a page of session/cleanup items with per-session metrics (recording
 * count + transcript char count) in ONE batched RPC call — no N+1. Best-effort:
 * a metrics failure leaves the counts null (cards just omit the metadata line)
 * rather than failing the whole page. Mutates + returns the same items.
 */
async function enrichSessionMetrics<T extends SessionHubItem | CleanupHubItem>(
  items: T[],
): Promise<T[]> {
  const ids = items.map((i) => i.id);
  if (ids.length === 0) return items;
  const { data, error } = await supabase.rpc("studio_session_metrics", {
    p_session_ids: ids,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error(`[transcripts-hub] session metrics failed: ${error.message}`);
    return items;
  }
  const byId = new Map(
    (data ?? []).map((r) => [
      r.session_id,
      {
        recordingCount: r.recording_count ?? 0,
        charCount: Number(r.char_count ?? 0),
      },
    ]),
  );
  for (const item of items) {
    const m = byId.get(item.id);
    if (m) {
      item.recordingCount = m.recordingCount;
      item.charCount = m.charCount;
    }
  }
  return items;
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

  const { data, error, count } = await transcriptsDb().from("transcripts")
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

function recordingToHubItem(
  row: {
    id: string;
    session_id: string;
    segment_index: number;
    started_at: string;
    ended_at: string | null;
    updated_at: string;
  },
  parentKind: "session" | "cleanup",
): RecordingHubItem {
  return {
    kind: "recording",
    id: row.id,
    sessionId: row.session_id,
    parentKind,
    segmentIndex: row.segment_index,
    durationMs: recordingDurationMs(row.started_at, row.ended_at),
    title: `Recording ${row.segment_index + 1}`,
    createdAt: row.started_at,
    updatedAt: row.updated_at ?? row.started_at,
  };
}

/**
 * Batch-load active (non-detached) recording segments for hub grouping.
 * Best-effort: returns [] on failure so the hub still renders flat.
 */
export async function fetchRecordingHubItemsForSessions(
  parents: Array<{ id: string; kind: "session" | "cleanup" }>,
): Promise<RecordingHubItem[]> {
  const ids = parents.map((p) => p.id);
  if (ids.length === 0) return [];
  const kindById = new Map(parents.map((p) => [p.id, p.kind]));

  const { data, error } = await transcriptsDb()
    .from("studio_recording_segments")
    .select("id, session_id, segment_index, started_at, ended_at, updated_at")
    .in("session_id", ids)
    .is("detached_at", null)
    .order("segment_index", { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[transcripts-hub] session recordings failed: ${error.message}`,
    );
    return [];
  }

  return (data ?? []).map((row) =>
    recordingToHubItem(
      row as {
        id: string;
        session_id: string;
        segment_index: number;
        started_at: string;
        ended_at: string | null;
        updated_at: string;
      },
      kindById.get(row.session_id) ?? "session",
    ),
  );
}

function parentKindFromSessionSource(
  source: string | null | undefined,
): "session" | "cleanup" {
  return source === "cleanup" ? "cleanup" : "session";
}

/**
 * Load every active recording segment the user can access (RLS-scoped).
 * Used when hub grouping is on so children appear even if their parent
 * session is not on the current hub page.
 */
export async function fetchActiveRecordingHubItems(): Promise<
  RecordingHubItem[]
> {
  const { data, error } = await transcriptsDb()
    .from("studio_recording_segments")
    .select(
      "id, session_id, segment_index, started_at, ended_at, updated_at, studio_sessions!inner(source)",
    )
    .is("detached_at", null)
    .order("session_id", { ascending: true })
    .order("segment_index", { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[transcripts-hub] active recordings failed: ${error.message}`,
    );
    return [];
  }

  return (data ?? []).map(
    (row: {
      id: string;
      session_id: string;
      segment_index: number;
      started_at: string;
      ended_at: string | null;
      updated_at: string;
      studio_sessions?: { source: string } | { source: string }[] | null;
    }) => {
      const sessionJoin = row.studio_sessions;
      const source = Array.isArray(sessionJoin)
        ? sessionJoin[0]?.source
        : sessionJoin?.source;
      return recordingToHubItem(row, parentKindFromSessionSource(source));
    },
  );
}

/**
 * Hydrate session/cleanup hub rows for parent sessions referenced by
 * recordings but missing from the paginated hub list.
 */
export async function fetchHubSessionItemsByIds(
  ids: string[],
): Promise<Array<SessionHubItem | CleanupHubItem>> {
  if (ids.length === 0) return [];

  const { data, error } = await transcriptsDb()
    .from("studio_sessions")
    .select("*")
    .in("id", ids)
    .eq("is_deleted", false);

  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[transcripts-hub] parent session hydrate failed: ${error.message}`,
    );
    return [];
  }

  const items = ((data ?? []) as SessionRow[]).map((row) =>
    sessionToHubItem(row, row.source === "cleanup" ? "cleanup" : "session"),
  ) as Array<SessionHubItem | CleanupHubItem>;

  await enrichSessionMetrics(items);
  return items;
}

export async function fetchSessionHubPage(
  page: number,
  pageSize = HUB_PAGE_SIZE,
): Promise<HubPageResult<SessionHubItem>> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await transcriptsDb()
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
  await enrichSessionMetrics(items);

  const total = count ?? items.length;
  return { items, hasMore: from + items.length < total };
}

export async function fetchCleanupHubPage(
  page: number,
  pageSize = HUB_PAGE_SIZE,
): Promise<HubPageResult<CleanupHubItem>> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await transcriptsDb()
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
  await enrichSessionMetrics(items);

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

  const { data, error, count } = await transcriptsDb()
    .from("studio_recording_segments")
    .select("*, studio_sessions!inner(source)", { count: "exact" })
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
      session_id: string;
      segment_index: number;
      started_at: string;
      ended_at: string | null;
      detached_at: string | null;
      studio_sessions?: { source: string } | { source: string }[] | null;
    }) => {
      const sessionJoin = row.studio_sessions;
      const source = Array.isArray(sessionJoin)
        ? sessionJoin[0]?.source
        : sessionJoin?.source;
      const parentKind =
        source === "cleanup" ? ("cleanup" as const) : ("session" as const);
      return {
        kind: "unsorted",
        id: row.id,
        title: `Recording ${row.segment_index + 1}`,
        segmentIndex: row.segment_index,
        durationMs: recordingDurationMs(row.started_at, row.ended_at),
        createdAt: row.started_at,
        updatedAt: row.detached_at ?? row.started_at,
        sessionId: row.session_id,
        parentKind,
      };
    },
  );

  const total = count ?? items.length;
  return { items, hasMore: from + items.length < total };
}

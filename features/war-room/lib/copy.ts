// features/war-room/lib/copy.ts
//
// The ONE place War Room surfaces build their Copy / Copy-for-AI / export
// payloads (components/agent-copy doctrine — see the `agent-copy` skill).
//
// What this replaces: before this module the War Room's only copy affordance
// was `ThreadCopyForAiButton`, which exported the tile's ANCHORED project or
// task and returned nothing at all when a tile had neither — so a canvas tile
// full of notes, files and recordings had no copy path. The builders here
// describe the TILE (and the room), independent of whatever entity it happens
// to be anchored to; the anchored project/task export is still offered
// alongside, unchanged.
//
// The room page is a natural Groomer consumer: a busy room is many threads
// times many attached resources, which is exactly the "massive" size class.
// `roomGroomerConfig` declares the section list ONCE — the Groomer window,
// the quick "Everything" copy, and the Balanced/Minimal preset variants all
// derive from it via the shared `groomerPresetVariants` /
// `buildGroomerPresetPayload` helpers. Never a second section list.
//
// Pure — no React, no store access. Callsites gather live data from selectors
// and pass it in at click time.

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type {
  AgentCopyGroomerConfig,
  GroomerLevel,
} from "@/components/agent-copy/groomer-types";
import { formatRelativeTime } from "@/utils/datetime";
import { threadDisplayTitle } from "../utils/threadDisplayTitle";
import type {
  WarRoomAssignment,
  WarRoomSession,
  WarRoomThread,
} from "../types";

export const WAR_ROOMS_LOCATION = "AI Matrx — War Rooms (/war-room/all)";

export function roomLocation(session: WarRoomSession): string {
  return `AI Matrx — War Room "${session.title}" (/war-room/${session.id})`;
}

function lines(
  rows: Array<[string, string | number | boolean | null | undefined]>,
): string {
  return rows
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

// ── Room cards (/war-room/all) ─────────────────────────────────────────────

/** The stats the room card renders. Mirrors `selectRoomCardStats`. */
export interface RoomStats {
  threadCount: number;
  pinnedCount: number;
  hasProject: boolean;
}

export function roomSummary(session: WarRoomSession, stats: RoomStats): string {
  return lines([
    ["War Room", session.title],
    ["Description", session.description],
    ["Threads", stats.threadCount],
    ["Pinned", stats.pinnedCount || null],
    ["Tied to a project", stats.hasProject ? "yes" : null],
    [
      "Last opened",
      formatRelativeTime(session.last_opened_at, {
        fallback: "Never opened",
      }),
    ],
    ["Created", session.created_at],
  ]);
}

export function roomRow(
  session: WarRoomSession,
  stats: RoomStats,
): Record<string, unknown> {
  return {
    id: session.id,
    title: session.title,
    description: session.description ?? null,
    icon: session.icon ?? null,
    color: session.color ?? null,
    thread_count: stats.threadCount,
    pinned_count: stats.pinnedCount,
    has_project: stats.hasProject,
    last_opened_at: session.last_opened_at,
    created_at: session.created_at,
    updated_at: session.updated_at,
  };
}

/** Rooms + their rendered stats, keyed for the list builders. */
export interface RoomWithStats {
  session: WarRoomSession;
  stats: RoomStats;
}

export function roomCsvRows(
  rooms: RoomWithStats[],
): Array<Record<string, unknown>> {
  return rooms.map(({ session, stats }) => roomRow(session, stats));
}

export function roomListHuman(rooms: RoomWithStats[]): string {
  const threads = rooms.reduce((n, r) => n + r.stats.threadCount, 0);
  const head = `${rooms.length} War Room${rooms.length === 1 ? "" : "s"} · ${threads} thread${threads === 1 ? "" : "s"}`;
  return [
    head,
    "",
    ...rooms.map(({ session, stats }) => roomSummary(session, stats)),
  ].join("\n\n");
}

export function buildRoomListPayload(input: {
  rooms: RoomWithStats[];
  orphanThreadCount: number;
  /** The live search box, echoed so the agent knows what filtered the view. */
  searchQuery?: string;
}): AgentPayloadInput {
  const { rooms, orphanThreadCount, searchQuery } = input;
  const threads = rooms.reduce((n, r) => n + r.stats.threadCount, 0);
  return {
    kind: "war-rooms-list",
    location: WAR_ROOMS_LOCATION,
    description:
      "Every saved War Room, as the rooms gallery renders them — thread and pinned counts, project tie, last opened.",
    // ALL rooms, never the search-filtered slice.
    data: {
      rooms: rooms.map(({ session, stats }) => roomRow(session, stats)),
      unassigned_threads: orphanThreadCount,
    },
    summary: roomListHuman(rooms),
    attributes: {
      rows: rooms.length,
      threads,
      unassigned_threads: orphanThreadCount,
    },
    context: {
      search_query: searchQuery || undefined,
      note: searchQuery
        ? "A search filter is active on screen; this payload carries ALL War Rooms, not the filtered view."
        : undefined,
    },
  };
}

export function buildRoomCardPayload(input: {
  session: WarRoomSession;
  stats: RoomStats;
  listTotal: number;
}): AgentPayloadInput {
  const { session, stats, listTotal } = input;
  return {
    kind: "war-room",
    location: WAR_ROOMS_LOCATION,
    description: "One War Room card from the rooms gallery.",
    data: roomRow(session, stats),
    summary: roomSummary(session, stats),
    attributes: {
      id: session.id,
      title: session.title,
      threads: stats.threadCount,
      pinned: stats.pinnedCount,
    },
    context: { list_total: listTotal },
  };
}

// ── Thread tiles ───────────────────────────────────────────────────────────

/** One attached resource, as the tile's resource roster renders it. */
export function assignmentRow(
  assignment: WarRoomAssignment,
): Record<string, unknown> {
  return {
    entity_type: assignment.entity_type,
    entity_id: assignment.entity_id,
    label: assignment.label,
    position: assignment.position,
    is_active: assignment.is_active,
  };
}

export function assignmentCounts(
  assignments: WarRoomAssignment[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of assignments) {
    counts[a.entity_type] = (counts[a.entity_type] ?? 0) + 1;
  }
  return counts;
}

export interface ThreadCopyInput {
  thread: WarRoomThread;
  session: WarRoomSession | null;
  assignments: WarRoomAssignment[];
  isPinned?: boolean;
  isHidden?: boolean;
  /** Resolved title of the anchored task, when the thread has none of its own. */
  anchorTaskTitle?: string | null;
}

export function threadSummary(input: ThreadCopyInput): string {
  const { thread, session, assignments, isPinned, isHidden, anchorTaskTitle } =
    input;
  const counts = assignmentCounts(assignments);
  return lines([
    ["Thread", threadDisplayTitle(thread, anchorTaskTitle)],
    ["War Room", session?.title],
    ["Anchor", thread.anchor_type],
    ["Anchor id", thread.anchor_id],
    ["Active tab", thread.active_tab],
    ["Position", thread.position],
    ["Pinned", isPinned ? "yes" : null],
    ["Parked", isHidden ? "yes" : null],
    [
      "Attached",
      Object.entries(counts)
        .map(([type, n]) => `${n} ${type}`)
        .join(", ") || "nothing yet",
    ],
  ]);
}

export function threadRow(input: ThreadCopyInput): Record<string, unknown> {
  const { thread, assignments, isPinned, isHidden, anchorTaskTitle } = input;
  return {
    id: thread.id,
    title: threadDisplayTitle(thread, anchorTaskTitle),
    raw_title: thread.title,
    anchor_type: thread.anchor_type,
    anchor_id: thread.anchor_id,
    active_tab: thread.active_tab,
    position: thread.position,
    pinned: !!isPinned,
    parked: !!isHidden,
    resource_counts: assignmentCounts(assignments),
    resources: assignments.map(assignmentRow),
  };
}

/**
 * A tile as rendered — its identity, its anchor, and everything attached to
 * it. Unlike the legacy anchored-entity export this ALWAYS produces a payload,
 * including for a canvas tile with no project or task.
 */
export function buildThreadPayload(input: ThreadCopyInput): AgentPayloadInput {
  const { thread, session } = input;
  const counts = assignmentCounts(input.assignments);
  return {
    kind: "war-room-thread",
    location: session ? roomLocation(session) : "AI Matrx — War Room",
    description:
      "One War Room thread tile as rendered: its anchor, its active tab, and every resource attached to it.",
    data: threadRow(input),
    summary: threadSummary(input),
    attributes: {
      id: thread.id,
      anchor_type: thread.anchor_type,
      active_tab: thread.active_tab,
      resources: input.assignments.length,
      ...Object.fromEntries(
        Object.entries(counts).map(([type, n]) => [`attached_${type}`, n]),
      ),
    },
    context: {
      room_id: session?.id,
      room_title: session?.title,
    },
  };
}

// ── Whole room — the Groomer consumer ──────────────────────────────────────

export interface RoomCopyInput {
  session: WarRoomSession;
  /** Visible tiles, in rendered gallery order. */
  threads: ThreadCopyInput[];
  /** Parked tiles from the hidden tray. */
  hiddenThreads: ThreadCopyInput[];
  /** Room-level attachments (the room's own resource roster). */
  roomAssignments: WarRoomAssignment[];
}

export function roomPageKpiLine(input: RoomCopyInput): string {
  const resources = input.threads.reduce(
    (n, t) => n + t.assignments.length,
    input.roomAssignments.length,
  );
  return `${input.session.title} — ${input.threads.length} thread${
    input.threads.length === 1 ? "" : "s"
  }${input.hiddenThreads.length ? ` · ${input.hiddenThreads.length} parked` : ""} · ${resources} attached resource${resources === 1 ? "" : "s"}`;
}

export function roomPageHuman(input: RoomCopyInput): string {
  return [
    roomPageKpiLine(input),
    input.session.description ?? "",
    "",
    ...input.threads.map(threadSummary),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The room's groomer sections — declared ONCE and reused by the Groomer
 * window, the quick copy and the preset variants.
 *
 * Levels are shaped by what actually costs tokens here: the resource rosters.
 * "full" carries every attached row, "compact" carries per-type counts, and
 * "brief" carries just the tile titles.
 */
export function roomGroomerConfig(
  input: RoomCopyInput,
): AgentCopyGroomerConfig {
  const { session, threads, hiddenThreads, roomAssignments } = input;

  const threadAtLevel = (t: ThreadCopyInput, level: GroomerLevel) => {
    const full = threadRow(t);
    if (level === "full") return full;
    if (level === "compact") {
      const { resources: _resources, ...rest } = full;
      return rest;
    }
    return {
      id: t.thread.id,
      title: threadDisplayTitle(t.thread, t.anchorTaskTitle),
      anchor_type: t.thread.anchor_type,
    };
  };

  const totalResources = threads.reduce(
    (n, t) => n + t.assignments.length,
    roomAssignments.length,
  );

  return {
    label: `War Room ${session.title}`,
    kind: "war-room-page",
    location: roomLocation(session),
    description:
      "The whole War Room as rendered: the room, every thread tile, and the resources attached to each.",
    summary: roomPageKpiLine(input),
    attributes: {
      room_id: session.id,
      threads: threads.length,
      parked_threads: hiddenThreads.length,
      resources: totalResources,
    },
    context: {
      room_title: session.title,
      room_description: session.description ?? undefined,
    },
    sections: [
      {
        id: "room",
        title: "Room",
        description: "Identity, description and counts — the page's KPIs.",
        build: () => ({
          id: session.id,
          title: session.title,
          description: session.description ?? null,
          icon: session.icon ?? null,
          color: session.color ?? null,
          thread_count: threads.length,
          parked_thread_count: hiddenThreads.length,
          resource_count: totalResources,
          last_opened_at: session.last_opened_at,
          created_at: session.created_at,
        }),
      },
      {
        id: "threads",
        title: "Thread tiles",
        description: "Every visible tile in gallery order.",
        levelLabels: {
          full: "Tiles + every attached resource",
          compact: "Tiles + resource counts",
          brief: "Tile titles and anchors only",
        },
        build: (level) => threads.map((t) => threadAtLevel(t, level)),
      },
      {
        id: "room_resources",
        title: "Room resources",
        description: "Resources attached to the room itself, not to a tile.",
        cuttable: true,
        levelLabels: {
          full: "Every room resource",
          compact: "Counts by type",
          brief: "Counts by type",
        },
        build: (level) =>
          level === "full"
            ? roomAssignments.map(assignmentRow)
            : assignmentCounts(roomAssignments),
      },
      {
        id: "parked_threads",
        title: "Parked threads",
        description: "Tiles docked in the hidden tray.",
        cuttable: true,
        levelLabels: {
          full: "Parked tiles + resources",
          compact: "Parked tiles + counts",
          brief: "Parked tile titles",
        },
        build: (level) =>
          hiddenThreads.length
            ? hiddenThreads.map((t) => threadAtLevel(t, level))
            : null,
      },
    ],
  };
}

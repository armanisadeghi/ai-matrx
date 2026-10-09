"use client";

/**
 * The /work Live hub's data: the signed-in person's coding sessions (with
 * presence), their agent-room member rows (with delivery lag), kept live by ONE
 * @ai-matrx/realtime channel over `chat.coding_session` and
 * `communication.dm_session_members` (both published by
 * migrations/agent_messaging_live_hub_realtime_publication.sql), plus new
 * `communication.dm_messages` rows for the room list's unread and last line.
 *
 * A presence change patches the row in place; an unknown session or any member
 * change triggers one debounced re-read, never a per-event fetch.
 */
import { useEffect, useRef, useState } from "react";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useChannel } from "@ai-matrx/realtime/react";
import type { Json } from "@/types/database.types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { knobInt } from "@/lib/knobs/featureKnobs";
import {
  fetchCodingSessions,
  type CodingSessionView,
} from "@/features/agent-connections/coding-sessions/service";
import { providerMeta } from "@/features/agent-connections/coding-sessions/catalog";
import { workspaceName } from "../lib/codingSessionPresentation";
import { conversationTitleText } from "@/features/content-ir/surfaces/kind-text-label";
import { cleanTitle, effectivePresence, type LivePresence } from "./presence";
import type { ConversationSummary } from "@ai-matrx/messaging";
import { fetchAgentRooms, fetchSessionMembers, type SessionMemberRow } from "./service";

const liveChannel = defineChannelNamespace({
  namespace: "work-live",
  parts: ["viewer"],
  description:
    "The viewer's coding-session presence and agent-room member cursors, for the /work Live hub",
});

const REFETCH_DEBOUNCE_MS = 1_200;
const CLOCK_TICK_MS = 15_000;
/** Server default for the `agent_messaging.presence_ended_minutes` knob. */
const PRESENCE_ENDED_FALLBACK_MIN = 30;

export interface LiveSession {
  id: string;
  /** The session's AI Matrx conversation id: its address for messaging. */
  address: string;
  provider: string;
  providerLabel: string;
  title: string;
  workspace: string | null;
  account: string | null;
  status: string | null;
  lastSeenAt: string | null;
  presence: LivePresence;
  subagents: number;
  /** Every coding_session row id bound to this address (member rows key by one of them). */
  bindingIds: string[];
}

function metaString(metadata: Json | null, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, Json | undefined>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toLive(
  rows: readonly CodingSessionView[],
  nowMs: number,
  endedAfterMs: number,
): LiveSession[] {
  const subagents = new Map<string, number>();
  const main: CodingSessionView[] = [];
  const seen = new Set<string>();
  const bindings = new Map<string, string[]>();
  for (const row of rows) {
    const parent = metaString(row.metadata, "parent_conversation_id");
    if (parent) {
      subagents.set(parent, (subagents.get(parent) ?? 0) + 1);
      continue;
    }
    bindings.set(row.conversation_id, [...(bindings.get(row.conversation_id) ?? []), row.id]);
    // One row per address, newest binding first (the server's `who` does the same).
    if (seen.has(row.conversation_id)) continue;
    seen.add(row.conversation_id);
    main.push(row);
  }
  return main.map((row) => {
    const meta = providerMeta(row.provider);
    const title =
      cleanTitle(conversationTitleText(row.conversation?.title?.trim() || null) ?? "") ||
      `${meta?.label ?? "Coding"} session`;
    return {
      id: row.id,
      address: row.conversation_id,
      provider: row.provider,
      providerLabel: meta?.label ?? row.provider,
      title,
      workspace: workspaceName(row.metadata),
      account: metaString(row.metadata, "provider_account_label"),
      status: row.status,
      lastSeenAt: row.last_seen_at,
      presence: effectivePresence(row.status, row.last_seen_at, nowMs, endedAfterMs),
      subagents: subagents.get(row.conversation_id) ?? 0,
      bindingIds: bindings.get(row.conversation_id) ?? [row.id],
    };
  });
}

export interface LiveHubState {
  sessions: LiveSession[];
  members: SessionMemberRow[];
  rooms: ConversationSummary[];
  /** False when the room list stopped at its page budget: show "N+", never N. */
  roomsComplete: boolean;
  /** False until the first read lands: no counts or empty states before it. */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  nowMs: number;
  refresh: () => void;
}

export function useLiveHub(): LiveHubState {
  const userId = useAppSelector(selectUserId);
  const [rows, setRows] = useState<CodingSessionView[]>([]);
  const [members, setMembers] = useState<SessionMemberRow[]>([]);
  const [rooms, setRooms] = useState<ConversationSummary[]>([]);
  const [roomsComplete, setRoomsComplete] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [endedAfterMin, setEndedAfterMin] = useState(PRESENCE_ENDED_FALLBACK_MIN);
  const [readTick, setReadTick] = useState(0);
  const debounce = useRef<number | null>(null);
  const knownIds = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    knownIds.current = new Set(rows.map((r) => r.id));
  }, [rows]);

  const scheduleRead = () => {
    if (debounce.current !== null) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      debounce.current = null;
      setReadTick((n) => n + 1);
    }, REFETCH_DEBOUNCE_MS);
  };

  useEffect(() => {
    void knobInt("agent_messaging", "presence_ended_minutes")
      .then((value) => {
        if (value > 0) setEndedAfterMin(value);
      })
      .catch((cause: unknown) => {
        console.error(
          "[work-live] presence_ended_minutes knob read failed; using the server default 30",
          cause,
        );
      });
    const t = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => {
      window.clearInterval(t);
      if (debounce.current !== null) window.clearTimeout(debounce.current);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    void Promise.all([fetchCodingSessions(), fetchSessionMembers(userId), fetchAgentRooms()])
      .then(([page, memberRows, roomRows]) => {
        if (!current) return;
        setRows(page.sessions);
        setMembers(memberRows);
        setRooms(roomRows.rooms);
        setRoomsComplete(roomRows.complete);
        setLoaded(true);
        setError(null);
        setNowMs(Date.now());
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setError(cause instanceof Error ? cause.message : "The live read failed.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [userId, readTick]);

  useChannel(
    userId
      ? {
          topic: liveChannel.topic({ viewer: userId }),
          postgresChanges: [
            {
              event: "*",
              schema: "chat",
              table: "coding_session",
              filter: `created_by=eq.${userId}`,
              rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
              fingerprint: (row) =>
                JSON.stringify([row.status ?? null, row.last_seen_at ?? null]),
              onChange: ({ row }) => {
                const next = row as Partial<CodingSessionView> | null;
                if (!next?.id) return;
                if (!knownIds.current.has(next.id)) {
                  scheduleRead();
                  return;
                }
                setRows((cur) =>
                  cur.map((r) => {
                    if (r.id !== next.id) return r;
                    return {
                      ...r,
                      status: next.status ?? r.status,
                      last_seen_at: next.last_seen_at ?? r.last_seen_at,
                      ended_at: next.ended_at ?? r.ended_at,
                      metadata: next.metadata ?? r.metadata,
                    };
                  }),
                );
                setNowMs(Date.now());
              },
            },
            {
              event: "*",
              schema: "communication",
              table: "dm_session_members",
              filter: `created_by=eq.${userId}`,
              rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
              onChange: () => scheduleRead(),
            },
            {
              // RLS limits this to rooms the person is in; any new message
              // re-reads the room list (unread, last message) once, debounced.
              event: "INSERT",
              schema: "communication",
              table: "dm_messages",
              rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
              onChange: () => scheduleRead(),
            },
          ],
          onBackfill: () => scheduleRead(),
        }
      : null,
  );

  const sessions = toLive(rows, nowMs, endedAfterMin * 60_000);
  return {
    sessions,
    members,
    rooms,
    roomsComplete,
    loaded,
    loading,
    error,
    nowMs,
    refresh: () => setReadTick((n) => n + 1),
  };
}

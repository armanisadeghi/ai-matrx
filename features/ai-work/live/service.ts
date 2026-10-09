/**
 * Data doors for the /work Live hub.
 *
 * Reads go straight to Supabase under RLS (sessions via the coding-sessions
 * service, room members here). Room creation and membership go through the
 * aidream `agent_messages` service (`POST /agent-messages`) because that is
 * where a session member row is made with its delivery cursors — a room made
 * any other way would never deliver. Posting into a room is the messaging
 * package's own send: the service delivers a person's message to the room's
 * session members exactly like an agent's.
 */
import { supabase } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import { apiPost } from "@/lib/api/typed-client";
import { getUserMessage } from "@/lib/api/errors";
import {
  createMessagingRepository,
  type ConversationCursor,
  type ConversationSummary,
  type JsonObject,
} from "@ai-matrx/messaging";
import type { MemberCursor } from "./presence";

// The hub lists agent rooms on its own axis: the app's one messaging engine
// carries the /messages People|Agents filter, which the hub must not move.
const agentRooms = createMessagingRepository({ client: supabase });

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Pages the hub reads before it says "N+" instead of a count. */
const ROOM_PAGE = 100;
const ROOM_PAGES_MAX = 10;

export interface AgentRoomsRead {
  rooms: ConversationSummary[];
  /** False when more rooms exist past the pages read: the count is a floor. */
  complete: boolean;
}

/** The person's agent rooms (direct, pair, named, review), newest first. */
export async function fetchAgentRooms(): Promise<AgentRoomsRead> {
  const items: ConversationSummary[] = [];
  let cursor: ConversationCursor | null = null;
  let complete = false;
  for (let page = 0; page < ROOM_PAGES_MAX; page++) {
    const read = await agentRooms.listConversations({ kind: "agents", limit: ROOM_PAGE, cursor });
    items.push(...read.items);
    if (!read.hasMore || !read.nextCursor) {
      complete = true;
      break;
    }
    cursor = read.nextCursor;
  }
  const ids = items.map((item) => item.conversation.id);
  if (ids.length === 0) return { rooms: [], complete };
  // The inbox projection does not carry `metadata`; the hub needs its `kind`
  // (direct / pair / named / review), so read it beside the list, under RLS.
  const metaById = new Map<string, unknown>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .schema("communication")
      .from("dm_conversations")
      .select("id, metadata")
      .in("id", ids.slice(i, i + 200));
    if (error) throw operationFailed("load room kinds", error);
    for (const row of data) metaById.set(row.id, row.metadata);
  }
  const rooms = items.map((item) => {
    const metadata = metaById.get(item.conversation.id);
    return isJsonObject(metadata)
      ? { ...item, conversation: { ...item.conversation, metadata } }
      : item;
  });
  return { rooms, complete };
}

const MEMBER_COLUMNS =
  "id, conversation_id, member_kind, member_id, offered_through, offered_at, delivered_through, delivered_at, delivered_via, lookup_failures, expired_count, last_failure_reason, last_failure_at, muted, created_at" as const;

export interface SessionMemberRow extends MemberCursor {
  id: string;
  conversation_id: string;
  member_kind: string;
  member_id: string;
  delivered_via: string | null;
  last_failure_at: string | null;
  created_at: string;
}

/** Every live (not left) member row in the owner's agent rooms. */
export async function fetchSessionMembers(ownerId: string): Promise<SessionMemberRow[]> {
  const { data, error } = await supabase
    .schema("communication")
    .from("dm_session_members")
    .select(MEMBER_COLUMNS)
    .eq("created_by", ownerId)
    .is("deleted_at", null)
    .is("left_at", null)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw operationFailed("load room members", error);
  return data;
}

async function roomsCall(body: {
  room_op: "direct" | "create" | "add" | "remove";
  to: string;
  room?: string;
  name?: string;
}): Promise<{ roomId: string; name: string | null }> {
  try {
    const { data } = await apiPost("/agent-messages", { action: "rooms", ...body });
    const roomId = typeof data.room_id === "string" ? data.room_id : null;
    if (!roomId) throw new Error("The messaging service answered without a room.");
    return { roomId, name: typeof data.name === "string" ? data.name : null };
  } catch (cause) {
    throw new Error(getUserMessage(cause));
  }
}

/** The person's direct line to one session, created on first use. */
export function openDirectLine(sessionAddress: string) {
  return roomsCall({ room_op: "direct", to: sessionAddress });
}

/** A named room holding `first` (its organization holds the room). */
export function createRoom(name: string, first: string) {
  return roomsCall({ room_op: "create", name, to: first });
}

export function addSessionToRoom(roomId: string, sessionAddress: string) {
  return roomsCall({ room_op: "add", room: roomId, to: sessionAddress });
}

export function removeSessionFromRoom(roomId: string, sessionAddress: string) {
  return roomsCall({ room_op: "remove", room: roomId, to: sessionAddress });
}

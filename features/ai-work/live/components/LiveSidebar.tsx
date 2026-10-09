"use client";

import { useState } from "react";
import {
  ArrowLeftRight,
  ChevronRight,
  ClipboardCheck,
  MessageSquare,
  Plus,
  Search,
  Users,
} from "lucide-react";
import type { ConversationSummary } from "@ai-matrx/messaging";
import { formatConversationTime, summarizeText } from "@ai-matrx/messaging";
import { cn } from "@/lib/utils";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { ErrorNotice } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { providerMeta } from "@/features/agent-connections/coding-sessions/catalog";
import {
  agentRoomKind,
  compactAge,
  deliveryLag,
  plainPreview,
  type AgentRoomKind,
} from "../presence";
import type { LiveSession } from "../useLiveHub";
import type { SessionMemberRow } from "../service";
import { LagMarker, PresenceDot, PresenceLegend, worstLag } from "./LiveBits";

export type LiveSelection =
  | { kind: "session"; address: string }
  | { kind: "room"; id: string }
  | null;

const ENDED_SHOWN = 15;
const ROOMS_SHOWN = 12;

const ROOM_ICON: Record<AgentRoomKind, typeof Users> = {
  agent_direct: MessageSquare,
  agent_pair: ArrowLeftRight,
  agent_room: Users,
  agent_review: ClipboardCheck,
};

function SectionHeader({
  label,
  count,
  action,
}: {
  label: string;
  count?: number | string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-8 items-center gap-2 px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      <span>{label}</span>
      {count !== undefined && <span className="tabular-nums">{count}</span>}
      <span className="flex-1" />
      {action}
    </div>
  );
}

function SessionRow({
  session,
  members,
  selected,
  nowMs,
  onSelect,
}: {
  session: LiveSession;
  members: readonly SessionMemberRow[];
  selected: boolean;
  nowMs: number;
  onSelect: () => void;
}) {
  const Icon = providerMeta(session.provider)?.icon ?? AGENT_ICON;
  const lag = worstLag(members.map((m) => deliveryLag(m, nowMs)));
  const seen = session.lastSeenAt ? compactAge(nowMs - Date.parse(session.lastSeenAt)) : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
    >
      <PresenceDot presence={session.presence} className="mt-1.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm",
              session.presence === "ended" ? "text-muted-foreground" : "font-medium",
            )}
          >
            {session.title}
          </span>
          <LagMarker lag={lag} showLabel />
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Icon className="size-3 shrink-0" />
          <span className="truncate">
            {[session.providerLabel, session.workspace].filter(Boolean).join(" · ")}
          </span>
          {session.subagents > 0 && (
            <span className="shrink-0" title={`${session.subagents} subagents`}>
              · {session.subagents} sub
            </span>
          )}
          <span className="flex-1" />
          {seen && <span className="shrink-0 tabular-nums">{seen}</span>}
        </span>
      </span>
    </button>
  );
}

function RoomRow({
  room,
  memberCount,
  selected,
  onSelect,
}: {
  room: ConversationSummary;
  memberCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const kind = agentRoomKind(room.conversation.metadata) ?? "agent_room";
  const Icon = ROOM_ICON[kind];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate text-sm", room.unreadCount > 0 && "font-semibold")}>
            {room.displayName}
          </span>
          <span className="flex-1" />
          {room.unreadCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums">
              {room.unreadCount}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate">
            {room.lastMessageContent
              ? plainPreview(summarizeText(room.lastMessageContent, 160))
              : `${memberCount} session${memberCount === 1 ? "" : "s"}`}
          </span>
          <span className="flex-1" />
          {room.lastMessageAt && (
            <span className="shrink-0 tabular-nums">{formatConversationTime(room.lastMessageAt)}</span>
          )}
        </span>
      </span>
    </button>
  );
}

export function LiveSidebar({
  sessions,
  members,
  rooms,
  selection,
  nowMs,
  loaded,
  roomsComplete,
  error,
  onRetry,
  onSelect,
  onNewRoom,
}: {
  sessions: readonly LiveSession[];
  members: readonly SessionMemberRow[];
  rooms: readonly ConversationSummary[];
  selection: LiveSelection;
  nowMs: number;
  loaded: boolean;
  roomsComplete: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (selection: LiveSelection) => void;
  onNewRoom: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showEnded, setShowEnded] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [roomLimit, setRoomLimit] = useState(ROOMS_SHOWN);
  const [endedLimit, setEndedLimit] = useState(ENDED_SHOWN);
  const q = query.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);

  const visible = sessions.filter((s) =>
    match([s.title, s.providerLabel, s.workspace ?? "", s.account ?? ""].join(" ")),
  );
  const active = visible
    .filter((s) => s.presence !== "ended")
    .sort((a, b) =>
      a.presence === b.presence
        ? Date.parse(b.lastSeenAt ?? "") - Date.parse(a.lastSeenAt ?? "")
        : a.presence === "busy"
          ? -1
          : 1,
    );
  const ended = visible.filter((s) => s.presence === "ended");
  const busy = active.filter((s) => s.presence === "busy").length;
  const matchedRooms = rooms.filter((r) => match(r.displayName));
  // A direct line nobody has written in yet is reached through its session, not listed.
  const shownRooms = matchedRooms.filter((r) => {
    const kind = agentRoomKind(r.conversation.metadata);
    return kind !== "agent_review" && !(kind === "agent_direct" && !r.lastMessageAt);
  });
  const reviewRooms = matchedRooms.filter(
    (r) => agentRoomKind(r.conversation.metadata) === "agent_review",
  );
  const agentMembers = members.filter((m) => m.member_kind === "agent_conversation");
  const membersOf = (s: LiveSession) => members.filter((m) => s.bindingIds.includes(m.member_id));
  const roomMemberCount = (id: string) =>
    members.filter((m) => m.conversation_id === id && m.member_kind === "coding_session").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter"
            aria-label="Filter sessions and rooms"
            className="h-8 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Button variant="outline" icon={<Plus />} onClick={onNewRoom}>
          Room
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4 scrollbar-thin">
        <SectionHeader
          label="Sessions"
          count={loaded ? active.length : undefined}
          action={busy > 0 ? <span className="normal-case tracking-normal text-emerald-600 dark:text-emerald-400">{busy} busy</span> : null}
        />
        <PresenceLegend />
        {error ? (
          <div className="px-3 py-2">
            <ErrorNotice message={error} size="inline" />
            <button type="button" className="text-xs underline" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : !loaded ? (
          <div className="space-y-1 px-2.5 py-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-muted/60" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <p className="px-3 py-1.5 text-xs text-muted-foreground">
            {q ? `No active session matches "${query.trim()}"` : "No session active in the last half hour."}
          </p>
        ) : (
          active.map((s) => (
            <SessionRow
              key={s.address}
              session={s}
              members={membersOf(s)}
              nowMs={nowMs}
              selected={selection?.kind === "session" && selection.address === s.address}
              onSelect={() => onSelect({ kind: "session", address: s.address })}
            />
          ))
        )}

        {ended.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowEnded((v) => !v)}
              aria-expanded={showEnded}
              className="flex h-8 w-full items-center gap-1 px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className={cn("size-3 transition-transform", showEnded && "rotate-90")} />
              Ended <span className="tabular-nums">{ended.length}</span>
            </button>
            {showEnded &&
              ended.slice(0, endedLimit).map((s) => (
                <SessionRow
                  key={s.address}
                  session={s}
                  members={membersOf(s)}
                  nowMs={nowMs}
                  selected={selection?.kind === "session" && selection.address === s.address}
                  onSelect={() => onSelect({ kind: "session", address: s.address })}
                />
              ))}
            {showEnded && ended.length > endedLimit && (
              <button
                type="button"
                className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setEndedLimit((n) => n + ENDED_SHOWN)}
              >
                Show {Math.min(ENDED_SHOWN, ended.length - endedLimit)} more
              </button>
            )}
          </>
        )}

        <SectionHeader
          label="Rooms"
          count={loaded ? `${shownRooms.length}${roomsComplete ? "" : "+"}` : undefined}
        />
        {!loaded ? (
          <div className="mx-2.5 my-1 h-9 animate-pulse rounded-md bg-muted/60" />
        ) : shownRooms.length === 0 ? (
          <p className="px-3 py-1.5 text-xs text-muted-foreground">
            {q ? `No room matches "${query.trim()}"` : "Rooms appear when sessions message each other or you."}
          </p>
        ) : (
          shownRooms.slice(0, roomLimit).map((r) => (
            <RoomRow
              key={r.conversation.id}
              room={r}
              memberCount={roomMemberCount(r.conversation.id)}
              selected={selection?.kind === "room" && selection.id === r.conversation.id}
              onSelect={() => onSelect({ kind: "room", id: r.conversation.id })}
            />
          ))
        )}
        {shownRooms.length > roomLimit && (
          <button
            type="button"
            className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setRoomLimit((n) => n + ROOMS_SHOWN)}
          >
            Show {Math.min(ROOMS_SHOWN, shownRooms.length - roomLimit)} more
          </button>
        )}
        {reviewRooms.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowReview((v) => !v)}
              aria-expanded={showReview}
              className="flex h-8 w-full items-center gap-1 px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className={cn("size-3 transition-transform", showReview && "rotate-90")} />
              Review rooms{" "}
              <span className="tabular-nums">
                {reviewRooms.length}
                {roomsComplete ? "" : "+"}
              </span>
            </button>
            {showReview &&
              reviewRooms.map((r) => (
                <RoomRow
                  key={r.conversation.id}
                  room={r}
                  memberCount={roomMemberCount(r.conversation.id)}
                  selected={selection?.kind === "room" && selection.id === r.conversation.id}
                  onSelect={() => onSelect({ kind: "room", id: r.conversation.id })}
                />
              ))}
          </>
        )}

        <SectionHeader label="Manager agents" count={agentMembers.length} />
        {agentMembers.length === 0 ? (
          <p className="px-3 py-1.5 text-xs text-muted-foreground">
            AI Matrx agents you add to a room appear here, with what they are watching.
          </p>
        ) : (
          agentMembers.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect({ kind: "room", id: m.conversation_id })}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-accent/50"
            >
              <AGENT_ICON className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {rooms.find((r) => r.conversation.id === m.conversation_id)?.displayName ?? "Agent room"}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

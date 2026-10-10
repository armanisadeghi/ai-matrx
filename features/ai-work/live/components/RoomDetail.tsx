"use client";

import { ErrorNotice } from "@ai-matrx/design-system";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Plus, X } from "lucide-react";
import type { ConversationSummary } from "@ai-matrx/messaging";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConversationPane } from "@/features/messaging/components/ConversationPane";
import { agentRoomKind, deliveryLag } from "../presence";
import type { LiveSession } from "../useLiveHub";
import type { AgentMemberInfo, SessionMemberRow } from "../service";
import { addSessionToRoom, removeSessionFromRoom } from "../service";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { LagMarker, PresenceDot, sessionTag } from "./LiveBits";
import { AddManagerDialog } from "./AddManagerDialog";
import { AddCursorAgentDialog } from "./AddCursorAgentDialog";
import { useRoomDelivery } from "../useRoomDelivery";

/** A manager agent's own conversation, scheduled: every run appends to it, so it keeps its room. */
export function scheduleHref(info: AgentMemberInfo | undefined, conversationId: string): string {
  const q = new URLSearchParams({ conversationId });
  if (info?.agentId) q.set("agentId", info.agentId);
  return `/schedules/new?${q.toString()}`;
}

const KIND_LABEL = {
  agent_direct: "Direct line",
  agent_pair: "Two sessions",
  agent_room: "Room",
  agent_review: "Review room",
} as const;

export function RoomDetail({
  room,
  members,
  agentInfo,
  sessions,
  nowMs,
  onBack,
  onOpenSession,
  onChanged,
}: {
  room: ConversationSummary;
  members: readonly SessionMemberRow[];
  agentInfo: Readonly<Record<string, AgentMemberInfo>>;
  sessions: readonly LiveSession[];
  nowMs: number;
  onBack: () => void;
  onOpenSession: (address: string) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [addingManager, setAddingManager] = useState(false);
  const [addingCursor, setAddingCursor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = agentRoomKind(room.conversation.metadata) ?? "agent_room";
  const roomId = room.conversation.id;
  const inRoom = members.filter((m) => m.conversation_id === roomId && m.member_kind === "coding_session");
  const agentsInRoom = members.filter(
    (m) => m.conversation_id === roomId && m.member_kind === "agent_conversation",
  );
  const sessionOf = (m: SessionMemberRow) => sessions.find((s) => s.bindingIds.includes(m.member_id)) ?? null;
  const memberAddresses = new Set(inRoom.map((m) => sessionOf(m)?.address).filter(Boolean));
  const addable = sessions.filter((s) => s.presence !== "ended" && !memberAddresses.has(s.address));
  const canEdit = kind === "agent_room";
  const deliveryStatusFor = useRoomDelivery(roomId, members, sessions, agentInfo);

  const run = async (op: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await op();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="shrink-0 @2xl/live:hidden">
            <Button variant="quiet" icon={<ArrowLeft />} aria-label="Back" onClick={onBack} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{room.displayName}</h2>
            <p className="text-xs text-muted-foreground">
              {KIND_LABEL[kind]} · {inRoom.length} session{inRoom.length === 1 ? "" : "s"}
              {agentsInRoom.length > 0 &&
                ` · ${agentsInRoom.length} manager agent${agentsInRoom.length === 1 ? "" : "s"}`}
            </p>
          </div>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" icon={<Plus />} disabled={busy}>
                  Session
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
                <DropdownMenuLabel className="text-xs">Active sessions</DropdownMenuLabel>
                {addable.length === 0 ? (
                  <DropdownMenuItem disabled>Every active session is in this room</DropdownMenuItem>
                ) : (
                  addable.map((s) => (
                    <DropdownMenuItem
                      key={s.address}
                      onSelect={() => void run(() => addSessionToRoom(roomId, s.address))}
                      className="gap-2"
                    >
                      <PresenceDot presence={s.presence} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{s.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {sessionTag(s, nowMs)}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canEdit && (
            <Button variant="outline" icon={<Plus />} disabled={busy} onClick={() => setAddingManager(true)}>
              Manager agent
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" icon={<Plus />} disabled={busy} onClick={() => setAddingCursor(true)}>
              Cursor agent
            </Button>
          )}
        </div>
        {inRoom.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Sessions in this room">
            {inRoom.map((m) => {
              const s = sessionOf(m);
              return (
                <li
                  key={m.id}
                  className="flex max-w-[20rem] items-center gap-1.5 rounded-full border border-border py-0.5 pl-2 pr-1 text-xs"
                >
                  <PresenceDot presence={s?.presence ?? "ended"} className="size-2" />
                  <button
                    type="button"
                    className="min-w-0 truncate hover:underline"
                    disabled={!s}
                    title={s ? `${s.title} — ${sessionTag(s, nowMs)}` : undefined}
                    onClick={() => s && onOpenSession(s.address)}
                  >
                    {s ? (
                      <>
                        {s.title}
                        <span className="text-muted-foreground"> · {s.workspace ?? s.providerLabel}</span>
                      </>
                    ) : (
                      "Session not in recent list"
                    )}
                  </button>
                  <LagMarker lag={deliveryLag(m, nowMs)} />
                  {canEdit && s && (
                    <button
                      type="button"
                      aria-label={`Remove ${s.title}`}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      disabled={busy}
                      onClick={() => void run(() => removeSessionFromRoom(roomId, s.address))}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {agentsInRoom.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Manager agents in this room">
            {agentsInRoom.map((m) => {
              const info = agentInfo[m.member_id];
              return (
                <li
                  key={m.id}
                  className="flex max-w-[24rem] items-center gap-1.5 rounded-full border border-border py-0.5 pl-2 pr-1 text-xs"
                >
                  <AGENT_ICON className="size-3 shrink-0 text-muted-foreground" />
                  <Link href={`/work/conversations/${m.member_id}`} className="min-w-0 truncate hover:underline">
                    {info?.agentName ?? "AI Matrx agent"}
                    {info?.lastRunStatus && (
                      <span className="text-muted-foreground"> · {info.lastRunStatus}</span>
                    )}
                  </Link>
                  <LagMarker lag={deliveryLag(m, nowMs)} />
                  <Link
                    href={scheduleHref(info, m.member_id)}
                    className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <CalendarClock className="size-3" />
                    Run on a schedule
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {error && <ErrorNotice message={error} size="inline" />}
      </header>
      {addingCursor && (
        <AddCursorAgentDialog
          open={addingCursor}
          onOpenChange={setAddingCursor}
          roomId={roomId}
          roomName={room.displayName}
          onAdded={() => {
            setAddingCursor(false);
            onChanged();
          }}
        />
      )}
      {addingManager && (
        <AddManagerDialog
          open={addingManager}
          onOpenChange={setAddingManager}
          roomId={roomId}
          roomName={room.displayName}
          onAdded={() => {
            setAddingManager(false);
            onChanged();
          }}
        />
      )}
      <ConversationPane
        key={roomId}
        conversationId={roomId}
        showHeader={false}
        showAi={false}
        className="min-h-0 flex-1"
        {...(deliveryStatusFor ? { deliveryStatusFor } : {})}
      />
    </div>
  );
}

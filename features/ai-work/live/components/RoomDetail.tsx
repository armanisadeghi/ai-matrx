"use client";

import { useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
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
import type { SessionMemberRow } from "../service";
import { addSessionToRoom, removeSessionFromRoom } from "../service";
import { LagMarker, PresenceDot } from "./LiveBits";

const KIND_LABEL = {
  agent_direct: "Direct line",
  agent_pair: "Two sessions",
  agent_room: "Room",
  agent_review: "Review room",
} as const;

export function RoomDetail({
  room,
  members,
  sessions,
  nowMs,
  onBack,
  onOpenSession,
}: {
  room: ConversationSummary;
  members: readonly SessionMemberRow[];
  sessions: readonly LiveSession[];
  nowMs: number;
  onBack: () => void;
  onOpenSession: (address: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = agentRoomKind(room.conversation.metadata) ?? "agent_room";
  const roomId = room.conversation.id;
  const inRoom = members.filter((m) => m.conversation_id === roomId && m.member_kind === "coding_session");
  const sessionOf = (m: SessionMemberRow) => sessions.find((s) => s.bindingIds.includes(m.member_id)) ?? null;
  const memberAddresses = new Set(inRoom.map((m) => sessionOf(m)?.address).filter(Boolean));
  const addable = sessions.filter((s) => s.presence !== "ended" && !memberAddresses.has(s.address));
  const canEdit = kind === "agent_room";

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
          <Button
            variant="quiet"
            icon={<ArrowLeft />}
            aria-label="Back"
            className="shrink-0 @2xl/live:hidden"
            onClick={onBack}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{room.displayName}</h2>
            <p className="text-xs text-muted-foreground">
              {KIND_LABEL[kind]} · {inRoom.length} session{inRoom.length === 1 ? "" : "s"}
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
                      <span className="truncate">{s.title}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {inRoom.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Sessions in this room">
            {inRoom.map((m) => {
              const s = sessionOf(m);
              return (
                <li
                  key={m.id}
                  className="flex max-w-[16rem] items-center gap-1.5 rounded-full border border-border py-0.5 pl-2 pr-1 text-xs"
                >
                  <PresenceDot presence={s?.presence ?? "ended"} className="size-2" />
                  <button
                    type="button"
                    className="truncate hover:underline"
                    disabled={!s}
                    onClick={() => s && onOpenSession(s.address)}
                  >
                    {s?.title ?? "Session not in recent list"}
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
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </header>
      <ConversationPane
        key={roomId}
        conversationId={roomId}
        showHeader={false}
        showAi={false}
        className="min-h-0 flex-1"
      />
    </div>
  );
}

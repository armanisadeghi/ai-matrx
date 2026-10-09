"use client";

/**
 * /work Live — every coding session, agent room and manager agent the person
 * has, in one place, live. Linear-inbox shape: a dense list on the left
 * (Slack-style presence dots, Activity-Monitor-style live status), the
 * selected item on the right; on a narrow container (phone) the list and the
 * detail are one pane each with Back, like /messages.
 *
 * Selection lives in the URL (?session=<address> | ?room=<id>) so every view
 * is a link.
 */
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { agentRoomKind } from "../presence";
import { useLiveHub } from "../useLiveHub";
import { LiveSidebar, type LiveSelection } from "./LiveSidebar";
import { SessionDetail } from "./SessionDetail";
import { RoomDetail } from "./RoomDetail";
import { NewRoomDialog } from "./NewRoomDialog";

function readSelection(params: URLSearchParams): LiveSelection {
  const session = params.get("session");
  if (session) return { kind: "session", address: session };
  const room = params.get("room");
  if (room) return { kind: "room", id: room };
  return null;
}

export function LiveHub() {
  const pathname = usePathname();
  const params = useSearchParams();
  const selection = readSelection(new URLSearchParams(params.toString()));
  const { sessions, members, rooms, roomsComplete, loaded, loading, error, nowMs, refresh } =
    useLiveHub();
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [createdDirect, setCreatedDirect] = useState<Record<string, string>>({});


  const select = (next: LiveSelection) => {
    const q =
      next?.kind === "session"
        ? `?session=${next.address}`
        : next?.kind === "room"
          ? `?room=${next.id}`
          : "";
    replaceAddressWithoutNavigating(`${pathname}${q}`);
  };

  const session =
    selection?.kind === "session"
      ? (sessions.find((s) => s.address === selection.address) ?? null)
      : null;
  const room =
    selection?.kind === "room"
      ? (rooms.find((r) => r.conversation.id === selection.id) ?? null)
      : null;
  // The direct line is the agent_direct room this session is a member of
  // (member rows are the truth; the inbox projection may not carry metadata.session_id).
  const directRoomId = session
    ? (rooms.find(
        (r) =>
          agentRoomKind(r.conversation.metadata) === "agent_direct" &&
          members.some(
            (m) =>
              m.conversation_id === r.conversation.id &&
              session.bindingIds.includes(m.member_id),
          ),
      )?.conversation.id ??
      createdDirect[session.address] ??
      null)
    : null;

  const busy = sessions.filter((s) => s.presence === "busy").length;
  const idle = sessions.filter((s) => s.presence === "idle").length;

  return (
    <div className="@container/live flex h-full min-h-0 overflow-hidden bg-background pt-[var(--shell-header-h)]">
      <aside
        aria-label="Sessions and rooms"
        className={cn(
          "min-h-0 w-full flex-col border-border @2xl/live:flex @2xl/live:w-80 @2xl/live:shrink-0 @2xl/live:border-r",
          selection ? "hidden" : "flex",
        )}
      >
        <LiveSidebar
          sessions={sessions}
          members={members}
          rooms={rooms}
          selection={selection}
          nowMs={nowMs}
          loaded={loaded}
          roomsComplete={roomsComplete}
          error={error}
          onRetry={refresh}
          onSelect={select}
          onNewRoom={() => setNewRoomOpen(true)}
        />
      </aside>

      <main
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col",
          selection ? "flex" : "hidden @2xl/live:flex",
        )}
      >
        {session ? (
          <SessionDetail
            key={session.address}
            session={session}
            members={members.filter((m) => session.bindingIds.includes(m.member_id))}
            directRoomId={directRoomId}
            directMembers={members.filter(
              (m) => m.conversation_id === directRoomId && session.bindingIds.includes(m.member_id),
            )}
            nowMs={nowMs}
            onBack={() => select(null)}
            onDirectRoomCreated={(id) => {
              setCreatedDirect((cur) => ({ ...cur, [session.address]: id }));
              refresh();
            }}
          />
        ) : room ? (
          <RoomDetail
            key={room.conversation.id}
            room={room}
            members={members}
            sessions={sessions}
            nowMs={nowMs}
            onBack={() => select(null)}
            onOpenSession={(address) => select({ kind: "session", address })}
          />
        ) : selection ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            {loading || !loaded ? "Loading" : selection.kind === "session" ? "This session is not in your recent sessions." : "This room is not in your inbox."}
            <button type="button" className="underline" onClick={() => select(null)}>
              Back to Live
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <Radio className="size-8 text-muted-foreground" />
            {loaded ? (
              <p className="text-sm font-medium">
                {busy} busy · {idle} idle · {rooms.length}
                {roomsComplete ? "" : "+"} room{rooms.length === 1 ? "" : "s"}
              </p>
            ) : (
              <div className="h-5 w-48 animate-pulse rounded bg-muted/60" />
            )}
            <p className="max-w-xs text-xs text-muted-foreground">
              Open a session to read its transcript and message it.
            </p>
          </div>
        )}
      </main>

      {newRoomOpen && (
      <NewRoomDialog
        open={newRoomOpen}
        onOpenChange={setNewRoomOpen}
        sessions={sessions}
        onCreated={(id) => {
          setNewRoomOpen(false);
          refresh();
          select({ kind: "room", id });
        }}
      />
      )}
    </div>
  );
}

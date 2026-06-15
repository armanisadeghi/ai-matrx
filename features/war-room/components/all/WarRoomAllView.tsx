"use client";

// features/war-room/components/all/WarRoomAllView.tsx
//
// Browse + manage saved War Rooms. List view (the "savior" page) — never traps
// the user in a single room. Create / open / delete from here.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Radar, LayoutGrid } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  selectListStatus,
  selectSessionsList,
} from "@/features/war-room/redux/selectors";
import { loadSessionsList } from "@/features/war-room/redux/thunks";
import { SessionCard } from "./SessionCard";
import { NewSessionButton } from "./NewSessionButton";

// The master agent panel pulls the whole agent execution graph (via
// AgentConversationColumn). Lazy-load it so that heavy chunk never ships in the
// /war-room/all bundle — it only loads the first time the user opens the panel.
const MasterAgentPanel = dynamic(
  () => import("@/features/war-room/components/master/MasterAgentPanel"),
  { ssr: false, loading: () => null },
);

// Master Agent window size. Docked bottom-right on open (computed from the
// viewport in `initialRect` below).
const MASTER_W = 460;
const MASTER_H = 620;

export function WarRoomAllView() {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector(selectSessionsList);
  const status = useAppSelector(selectListStatus);

  // Master Agent panel — local state owns open/closed. Non-modal so the rooms
  // list stays visible and interactive while the user chats with the master.
  const [masterOpen, setMasterOpen] = useState(false);

  useEffect(() => {
    if (status === "idle") dispatch(loadSessionsList());
  }, [status, dispatch]);

  const isLoading = status === "loading" || status === "idle";
  const isEmpty = status === "ready" && sessions.length === 0;

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      {/* Header */}
      {/* pr-14 clears the shell's fixed top-right avatar. */}
      <header className="shrink-0 border-b border-border px-4 sm:px-6 lg:px-8 pr-14 lg:pr-16 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid place-items-center size-8 rounded-lg bg-primary/10 text-primary shrink-0">
            <LayoutGrid className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-foreground leading-tight">
              War Room
            </h1>
            <p className="text-xs text-muted-foreground leading-tight truncate">
              Every open thread, in one place
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMasterOpen((v) => !v)}
            aria-pressed={masterOpen}
            className={
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors " +
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 " +
              (masterOpen
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground")
            }
            title="Chat with an agent that sees all your rooms and threads"
          >
            <Radar className="size-3.5" />
            <span className="hidden sm:inline">Master Agent</span>
          </button>
          <NewSessionButton />
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-5 max-w-[1600px]">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : isEmpty ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {sessions.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Master Agent — inline, draggable, NON-MODAL WindowPanel. Mounted only
          while open (closing unmounts the heavy agent column). Docked bottom-
          right on first open; the user can drag/resize from there. Inline-
          managed: `onClose` is the required close binding (no overlayId). */}
      {masterOpen && (
        <WindowPanel
          id="war-room-master-agent"
          title="Master Agent — all rooms"
          titleNode={
            <span className="flex items-center gap-1.5 min-w-0">
              <Radar className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">Master Agent — all rooms</span>
            </span>
          }
          onClose={() => setMasterOpen(false)}
          width={MASTER_W}
          height={MASTER_H}
          minWidth={360}
          minHeight={420}
          initialRect={{
            x: Math.max(16, window.innerWidth - MASTER_W - 24),
            y: Math.max(16, window.innerHeight - MASTER_H - 24),
          }}
          bodyClassName="p-0"
        >
          <MasterAgentPanel />
        </WindowPanel>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-4">
      <span className="grid place-items-center size-14 rounded-2xl bg-primary/10 text-primary mb-4">
        <LayoutGrid className="size-7" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">
        No War Rooms yet
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-md">
        A War Room gathers every thread you&apos;re juggling — tasks, notes, and
        recordings — into one self-arranging grid you can return to anytime.
      </p>
      <div className="mt-5">
        <NewSessionButton />
      </div>
    </div>
  );
}

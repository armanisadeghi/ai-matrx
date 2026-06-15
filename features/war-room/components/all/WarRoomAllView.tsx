"use client";

// features/war-room/components/all/WarRoomAllView.tsx
//
// Browse + manage saved War Rooms. List view (the "savior" page) — never traps
// the user in a single room. Create / open / delete from here.

import { useEffect } from "react";
import { LayoutGrid } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import {
  selectListStatus,
  selectSessionsList,
} from "@/features/war-room/redux/selectors";
import { loadSessionsList } from "@/features/war-room/redux/thunks";
import { SessionCard } from "./SessionCard";
import { NewSessionButton } from "./NewSessionButton";

export function WarRoomAllView() {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector(selectSessionsList);
  const status = useAppSelector(selectListStatus);

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
        <NewSessionButton />
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

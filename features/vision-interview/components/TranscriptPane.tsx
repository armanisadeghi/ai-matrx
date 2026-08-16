"use client";

// features/vision-interview/components/TranscriptPane.tsx
//
// The room's left pane: the full shared transcript (interview.turn rows via
// Supabase realtime — turns land on node completion, not from stream tokens;
// live token rendering is a documented v1 deferral, see ../FEATURE.md), the
// role strip, and the human composer at the bottom.

import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectRoomHydrated,
  selectRunError,
  selectTurnsOrdered,
} from "../redux/vision-interview.slice";
import type { ResumeInput } from "../hooks/useInterviewRun";
import { Composer } from "./Composer";
import { RoleStrip } from "./RoleStrip";
import { TurnCard } from "./TurnCard";

interface TranscriptPaneProps {
  onResume: (input: ResumeInput) => Promise<void>;
  onStart: () => Promise<void>;
}

export function TranscriptPane({ onResume, onStart }: TranscriptPaneProps) {
  const turns = useAppSelector(selectTurnsOrdered);
  const hydrated = useAppSelector(selectRoomHydrated);
  const runError = useAppSelector(selectRunError);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTurnId = turns.length > 0 ? turns[turns.length - 1].id : null;

  // Follow the conversation: new turn → scroll to bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastTurnId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RoleStrip />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {!hydrated ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-5/6" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : turns.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm text-center">
              <p className="text-sm font-medium text-foreground">
                The room is ready
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start the interview — the Amplifier and Cartographer open the
                Expand stage from your vision statement.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {turns.map((turn) => (
              <TurnCard key={turn.id} turn={turn} />
            ))}
          </div>
        )}
        {runError && (
          <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {runError}
          </p>
        )}
      </div>
      <Composer onResume={onResume} onStart={onStart} />
    </div>
  );
}

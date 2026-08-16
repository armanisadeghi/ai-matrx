"use client";

// features/vision-interview/components/TranscriptPane.tsx
//
// The room's left pane: the full shared transcript (interview.turn rows via
// Supabase realtime — turns land on node completion), the role strip, and the
// human composer at the bottom — PLUS the live in-flight layer: while a role
// node is speaking, its tokens render token-by-token in a LiveTurnCard, read
// from the canonical execution system (activeRequests.nodeStreams, fed by
// followWorkflowRunStream off the run's SSE events feed).
//
// No-double-render rule: a node's live card hides the moment its persisted
// turn lands (same role, current round) OR its node settles — the persisted
// TurnCard takes over seamlessly. Never both at once.

import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkflowNodeStreams } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  selectRoomHydrated,
  selectRoomRequestId,
  selectRoomSession,
  selectRunError,
  selectTurnsOrdered,
} from "../redux/vision-interview.slice";
import type { ResumeInput } from "../hooks/useInterviewRun";
import { roleFromNodeId } from "../types";
import { Composer } from "./Composer";
import { LiveTurnCard } from "./LiveTurnCard";
import { RoleStrip } from "./RoleStrip";
import { TurnCard } from "./TurnCard";

import type { WorkflowNodeStreamEntry } from "@/features/agents/types/request.types";

// Stable empty result while no run has been adopted — a fresh [] per call
// would re-render the pane on every store change.
const EMPTY_NODE_STREAMS: WorkflowNodeStreamEntry[] = [];
const NO_NODE_STREAMS = () => EMPTY_NODE_STREAMS;

interface TranscriptPaneProps {
  onResume: (input: ResumeInput) => Promise<void>;
  onStart: () => Promise<void>;
}

export function TranscriptPane({ onResume, onStart }: TranscriptPaneProps) {
  const turns = useAppSelector(selectTurnsOrdered);
  const hydrated = useAppSelector(selectRoomHydrated);
  const runError = useAppSelector(selectRunError);
  const session = useAppSelector(selectRoomSession);
  const requestId = useAppSelector(selectRoomRequestId);
  const nodeStreams = useAppSelector(
    requestId ? selectWorkflowNodeStreams(requestId) : NO_NODE_STREAMS,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTurnId = turns.length > 0 ? turns[turns.length - 1].id : null;

  const currentRound = session?.current_round ?? 0;

  // Live layer: one card per role node still streaming this round. Hidden the
  // moment the persisted turn for that role lands in the current round (the
  // TurnCard above takes over) or the node settles via the events feed —
  // whichever arrives first, so the text never renders twice.
  const liveCards = nodeStreams.flatMap((stream) => {
    if (stream.status !== "streaming") return [];
    const role = roleFromNodeId(stream.nodeId);
    if (!role) return []; // router/gate/apply nodes — not transcript speakers
    const persisted = turns.some(
      (t) => t.speaker === role && t.round >= currentRound,
    );
    if (persisted) return [];
    return [{ stream, role }];
  });

  // Follow the conversation: new turn or live tokens → scroll to bottom.
  const liveCharCount = liveCards.reduce(
    (sum, c) => sum + c.stream.text.length,
    0,
  );
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastTurnId, liveCharCount, liveCards.length]);

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
        ) : turns.length === 0 && liveCards.length === 0 ? (
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
            {liveCards.map(({ stream, role }) => (
              <LiveTurnCard
                key={stream.nodeId}
                role={role}
                stream={stream}
                round={currentRound}
              />
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

"use client";

// features/vision-interview/components/TranscriptPane.tsx
//
// The room's left pane: the full shared transcript (interview.turn rows via
// Supabase realtime — turns land on node completion), the presence strip,
// and the always-alive composer at the bottom — PLUS the live in-flight
// layer: while a role node is speaking, its tokens render token-by-token in
// a LiveTurnCard, read from the canonical execution system
// (activeRequests.nodeStreams, fed by followWorkflowRunStream off the run's
// SSE events feed; selector instances are factory-cached, so the inline call
// below is stable).
//
// No-double-render rule: a node's live card hides the moment its persisted
// turn lands (same role, current round) OR its node settles — the persisted
// TurnCard takes over seamlessly. Never both at once.

import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkflowNodeStreams } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  selectActiveSpeaker,
  selectRoomHydrated,
  selectRoomRequestId,
  selectRoomSession,
  selectTurnsOrdered,
} from "../redux/vision-interview.slice";
import type { ResumeInput } from "../hooks/useInterviewRun";
import { ROLE_ORDER, ROLES, roleFromNodeId } from "../types";
import { Composer } from "./Composer";
import { LiveTurnCard } from "./LiveTurnCard";
import { RoleAvatar } from "./RoleAvatar";
import { RoleStrip } from "./RoleStrip";
import { TurnCard } from "./TurnCard";

import type { WorkflowNodeStreamEntry } from "@/features/agents/types/request.types";

// Stable empty result while no run has been adopted — a fresh [] per call
// would re-render the pane on every store change.
const EMPTY_NODE_STREAMS: WorkflowNodeStreamEntry[] = [];
const NO_NODE_STREAMS = () => EMPTY_NODE_STREAMS;

interface TranscriptPaneProps {
  sessionId: string;
  onResume: (input: ResumeInput) => Promise<boolean>;
  onStart: (openingMessage?: string) => Promise<boolean>;
}

export function TranscriptPane({
  sessionId,
  onResume,
  onStart,
}: TranscriptPaneProps) {
  const turns = useAppSelector(selectTurnsOrdered);
  const hydrated = useAppSelector(selectRoomHydrated);
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

  // MOTION BEFORE TOKENS: node_started fires seconds before the first token
  // frame arrives (and the ephemeral token wire is best-effort). The active
  // speaker must be visibly thinking in the transcript from the instant its
  // node starts — a silent gap here is the "staring at nothingness" defect.
  const activeSpeaker = useAppSelector(selectActiveSpeaker);
  const showThinkingPlaceholder =
    activeSpeaker !== null &&
    !liveCards.some((c) => c.role === activeSpeaker) &&
    !turns.some((t) => t.speaker === activeSpeaker && t.round >= currentRound);

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
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {!hydrated ? (
          <div className="space-y-2 p-1">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-5/6" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : turns.length === 0 && liveCards.length === 0 && !showThinkingPlaceholder ? (
          session?.vision_statement?.trim() ? (
            // NEVER-LOSE-CONTENT: a statement saved on the session but not
            // yet turned into a run MUST be visible — data that is saved but
            // invisible reads as lost, and that costs all trust (2026-08-16,
            // when a run-start failure hid a dictated vision that was in
            // fact safely on the session row).
            <div className="p-2">
              <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Your vision — saved to this session
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {session.vision_statement}
                </p>
              </div>
              <p className="mt-2 px-1 text-xs text-muted-foreground">
                Press Start and the room opens from this. Anything you add
                below is appended to it.
              </p>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-sm text-center">
                <div className="mb-3 flex items-center justify-center gap-1.5">
                  {ROLE_ORDER.map((key) => (
                    <RoleAvatar key={key} role={key} size="sm" />
                  ))}
                </div>
                <p className="text-sm font-medium text-foreground">
                  Six roles are waiting for your vision
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Type or dictate an opening statement below — or press Start
                  and the room opens from your saved vision. The Amplifier and
                  Cartographer lead the Expand stage.
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-1">
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
            {showThinkingPlaceholder && activeSpeaker && (
              <div className="flex gap-2.5 px-1 py-1.5">
                <RoleAvatar role={activeSpeaker} speaking />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[13px] font-semibold ${ROLES[activeSpeaker].accent.text}`}
                    >
                      {ROLES[activeSpeaker].name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Round {currentRound}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium ${ROLES[activeSpeaker].accent.text}`}
                    >
                      <span
                        className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-current"
                        aria-hidden
                      />
                      Thinking
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <Composer sessionId={sessionId} onResume={onResume} onStart={onStart} />
    </div>
  );
}
